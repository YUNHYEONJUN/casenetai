/**
 * PostgreSQL용 관리자 계정 생성 스크립트
 * 
 * 사용법:
 *   ADMIN_EMAIL=admin@casenetai.kr ADMIN_PASSWORD=YourSecurePass! node create-admin-postgres.js
 * 
 * ⚠️ 비밀번호는 반드시 환경 변수로 전달해야 합니다. 기본값 없음.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 환경 변수 검증 (하드코딩 비밀번호 완전 제거)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BCRYPT_SALT_ROUNDS = 12;

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || 'System Admin';

if (!adminEmail || !adminPassword) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다!');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('사용법:');
  console.error('  ADMIN_EMAIL=admin@casenetai.kr \\');
  console.error('  ADMIN_PASSWORD=YourSecurePassword! \\');
  console.error('  node create-admin-postgres.js');
  console.error('');
  console.error('또는 .env 파일에 ADMIN_EMAIL, ADMIN_PASSWORD 설정');
  console.error('');
  process.exit(1);
}

// 비밀번호 강도 검증
if (adminPassword.length < 8) {
  console.error('❌ 비밀번호는 최소 8자 이상이어야 합니다.');
  process.exit(1);
}

if (!/[A-Z]/.test(adminPassword) || !/[0-9]/.test(adminPassword) || !/[!@#$%^&*]/.test(adminPassword)) {
  console.warn('⚠️  권장: 비밀번호에 대문자, 숫자, 특수문자를 포함하세요.');
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 PostgreSQL 관리자 계정 생성');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

(async () => {
  try {
    // DB 연결 확인
    await pool.query('SELECT 1');
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 비밀번호 해싱 (salt rounds: 12)
    const hash = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);
    console.log(`✅ 비밀번호 해싱 완료 (bcrypt salt rounds: ${BCRYPT_SALT_ROUNDS})\n`);
    
    // 기존 관리자 계정 확인
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length > 0) {
      console.log('⚠️  기존 계정 발견 — 삭제 후 재생성합니다.');
      await pool.query('DELETE FROM credits WHERE user_id = $1', [existing.rows[0].id]);
      await pool.query('DELETE FROM users WHERE email = $1', [adminEmail]);
    }
    
    // 새 관리자 계정 생성
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, is_email_verified, is_approved, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [adminEmail, hash, adminName, 'system_admin', true, true]
    );
    
    const adminId = result.rows[0].id;
    
    console.log('✅ 관리자 계정 생성 완료');
    console.log(`   ID: ${adminId}`);
    console.log(`   이메일: ${adminEmail}`);
    console.log(`   비밀번호: ********** (보안상 표시 안 함)`);
    console.log(`   이름: ${adminName}`);
    console.log(`   권한: system_admin\n`);
    
    // 관리자 크레딧 생성
    await pool.query(
      `INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET balance = $2`,
      [adminId, 1000000, 0, 0, 0]
    );
    
    console.log('✅ 관리자 크레딧 생성 완료');
    console.log('   잔액: 1,000,000원\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 관리자 계정이 준비되었습니다!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 로그인 정보:');
    console.log(`   URL: https://casenetai.kr/login.html`);
    console.log(`   이메일: ${adminEmail}`);
    console.log(`   비밀번호: (환경 변수 ADMIN_PASSWORD 참조)`);
    console.log('\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
