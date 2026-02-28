/**
 * 테스트용 관리자 계정 생성 스크립트
 * 
 * 사용법:
 *   ADMIN_PASSWORD=비밀번호1 DEV_PASSWORD=비밀번호2 TEST_PASSWORD=비밀번호3 node create-test-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 환경변수에서 비밀번호 읽기 (하드코딩 금지)
const adminPassword = process.env.ADMIN_PASSWORD;
const devPassword = process.env.DEV_PASSWORD;
const testPassword = process.env.TEST_PASSWORD;

// 비밀번호 필수 검증
if (!adminPassword || !devPassword || !testPassword) {
  console.error('❌ 모든 비밀번호 환경변수가 필요합니다.');
  console.error('');
  console.error('사용법:');
  console.error('  ADMIN_PASSWORD=비밀번호1 DEV_PASSWORD=비밀번호2 TEST_PASSWORD=비밀번호3 node create-test-admin.js');
  console.error('');
  console.error('누락된 변수:');
  if (!adminPassword) console.error('  - ADMIN_PASSWORD');
  if (!devPassword) console.error('  - DEV_PASSWORD');
  if (!testPassword) console.error('  - TEST_PASSWORD');
  process.exit(1);
}

// 비밀번호 강도 검증
const passwords = { ADMIN_PASSWORD: adminPassword, DEV_PASSWORD: devPassword, TEST_PASSWORD: testPassword };
for (const [name, pw] of Object.entries(passwords)) {
  if (pw.length < 8) {
    console.error(`❌ ${name}는 최소 8자 이상이어야 합니다.`);
    process.exit(1);
  }
}

const accounts = [
  {
    email: 'admin@casenetai.kr',
    password: adminPassword,
    name: '시스템 관리자',
    role: 'system_admin'
  },
  {
    email: 'dev@casenetai.kr',
    password: devPassword,
    name: '개발자',
    role: 'system_admin'
  },
  {
    email: 'test@casenetai.kr',
    password: testPassword,
    name: '테스트 사용자',
    role: 'user'
  }
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔐 CaseNetAI 테스트 계정 생성');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

(async () => {
  try {
    console.log('✅ 데이터베이스 연결 성공\n');
    
    for (const account of accounts) {
      try {
        // 비밀번호 해싱
        const hash = await bcrypt.hash(account.password, 10);
        
        // 기존 계정 삭제
        await pool.query('DELETE FROM users WHERE email = $1', [account.email]);
        
        // 새 계정 생성
        const result = await pool.query(
          `INSERT INTO users (
            email, 
            password_hash, 
            name, 
            role, 
            is_email_verified, 
            is_approved,
            created_at, 
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id`,
          [account.email, hash, account.name, account.role, true, true]
        );
        
        const userId = result.rows[0].id;
        
        // 크레딧 생성
        await pool.query(
          `INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE SET balance = $2`,
          [userId, 10000000, 0, 0, 0]
        );
        
        console.log(`✅ ${account.role === 'system_admin' ? '관리자' : '사용자'} 계정 생성 완료`);
        console.log(`   📧 이메일: ${account.email}`);
        console.log(`   🔑 비밀번호: ********** (보안상 표시 안 함)`);
        console.log(`   👤 이름: ${account.name}`);
        console.log(`   🎭 역할: ${account.role}`);
        console.log(`   💰 크레딧: 10,000,000원\n`);
        
      } catch (error) {
        console.error(`❌ ${account.email} 생성 실패:`, error.message);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 모든 테스트 계정이 준비되었습니다!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🌐 로그인 URL: https://casenetai.kr/login.html');
    console.log('⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 전체 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
