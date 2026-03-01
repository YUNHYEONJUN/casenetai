/**
 * PostgreSQL용 관리자 계정 생성 스크립트
 * 
 * 사용 방법:
 *   ADMIN_EMAIL=admin@casenetai.kr ADMIN_PASSWORD=YourSecurePass1! node create-admin-postgres.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || 'System Admin';

if (!adminEmail || !adminPassword) {
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다.\n');
  console.error('  ADMIN_EMAIL     - 관리자 이메일');
  console.error('  ADMIN_PASSWORD  - 관리자 비밀번호 (최소 8자, 대소문자/숫자/특수문자 포함)');
  console.error('  ADMIN_NAME      - 관리자 이름 (선택, 기본값: System Admin)\n');
  console.error('사용 예시:');
  console.error('  ADMIN_EMAIL="admin@casenetai.kr" ADMIN_PASSWORD="MyStr0ng!Pass" node create-admin-postgres.js');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

// 비밀번호 강도 검증
if (adminPassword.length < 8 || !/[A-Z]/.test(adminPassword) || !/[a-z]/.test(adminPassword) ||
    !/[0-9]/.test(adminPassword) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(adminPassword)) {
  console.error('❌ 비밀번호가 약합니다. 최소 8자, 대소문자/숫자/특수문자를 모두 포함해주세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true } 
    : { rejectUnauthorized: false }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 PostgreSQL 관리자 계정 생성');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ 데이터베이스 연결 성공\n');
    
    const hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    console.log('✅ 비밀번호 해싱 완료\n');
    
    const result = await pool.query(
      `INSERT INTO users (oauth_email, password_hash, name, role, is_approved, oauth_provider, oauth_id, created_at, updated_at) 
       VALUES ($1, $2, $3, 'system_admin', true, 'local', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (oauth_email) DO UPDATE SET 
         password_hash = $2, name = $3, role = 'system_admin', updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [adminEmail, hash, adminName, 'admin_' + Date.now()]
    );
    
    const adminId = result.rows[0].id;
    
    console.log('✅ 관리자 계정 생성 완료');
    console.log(`   ID: ${adminId}`);
    console.log(`   이메일: ${adminEmail}`);
    console.log(`   비밀번호: ${'*'.repeat(adminPassword.length)} (보안상 미표시)`);
    console.log(`   이름: ${adminName}`);
    console.log(`   권한: system_admin\n`);
    
    await pool.query(
      `INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
       VALUES ($1, 1000000, 0, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET balance = 1000000, updated_at = CURRENT_TIMESTAMP`,
      [adminId]
    );
    
    console.log('✅ 관리자 크레딧 생성 완료 (잔액: 1,000,000원)\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 관리자 계정이 준비되었습니다!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`🌐 로그인: https://casenetai.kr/login.html`);
    console.log(`📧 이메일: ${adminEmail}`);
    console.log('⚠️  첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
