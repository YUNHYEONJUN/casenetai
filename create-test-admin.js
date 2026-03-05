/**
 * 테스트용 관리자 계정 생성 스크립트
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const accounts = [
  {
    email: 'admin@casenetai.kr',
    password: 'Admin2026!',
    name: '시스템 관리자',
    role: 'system_admin'
  },
  {
    email: 'dev@casenetai.kr',
    password: 'Dev2026!',
    name: '개발자',
    role: 'system_admin'
  },
  {
    email: 'test@casenetai.kr',
    password: 'Test2026!',
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
        console.log(`   🔑 비밀번호: ${account.password}`);
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
    console.log('📝 로그인 정보 요약:');
    console.log('\n1️⃣ 시스템 관리자 계정:');
    console.log('   이메일: admin@casenetai.kr');
    console.log('   비밀번호: Admin2026!');
    console.log('\n2️⃣ 개발자 계정:');
    console.log('   이메일: dev@casenetai.kr');
    console.log('   비밀번호: Dev2026!');
    console.log('\n3️⃣ 테스트 사용자 계정:');
    console.log('   이메일: test@casenetai.kr');
    console.log('   비밀번호: Test2026!');
    console.log('\n🌐 로그인 URL: https://casenetai.kr/login.html');
    console.log('⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 전체 오류:', error.message);
    console.error('스택:', error.stack);
    await pool.end();
    process.exit(1);
  }
})();
