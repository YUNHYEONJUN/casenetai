/**
 * 테스트용 관리자 계정 생성 스크립트
 * 
 * 사용법:
 *   node create-test-admin.js
 * 
 * ⚠️ 모든 비밀번호는 .env 파일의 환경 변수로 관리합니다.
 * 
 * 필요한 환경 변수:
 *   ADMIN_PASSWORD    - 시스템 관리자 비밀번호
 *   DEV_PASSWORD      - 개발자 계정 비밀번호
 *   TEST_PASSWORD     - 테스트 사용자 비밀번호
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 환경 변수 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BCRYPT_SALT_ROUNDS = 12;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

// 비밀번호는 환경 변수에서만 가져옴 (하드코딩 없음)
const adminPassword = process.env.ADMIN_PASSWORD;
const devPassword = process.env.DEV_PASSWORD;
const testPassword = process.env.TEST_PASSWORD;

if (!adminPassword || !devPassword || !testPassword) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다!');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('.env 파일에 다음 변수를 추가하세요:');
  if (!adminPassword) console.error('  ADMIN_PASSWORD=YourAdminPassword!');
  if (!devPassword) console.error('  DEV_PASSWORD=YourDevPassword!');
  if (!testPassword) console.error('  TEST_PASSWORD=YourTestPassword!');
  console.error('');
  console.error('또는 직접 지정:');
  console.error('  ADMIN_PASSWORD=xxx DEV_PASSWORD=xxx TEST_PASSWORD=xxx node create-test-admin.js');
  console.error('');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const accounts = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@casenetai.kr',
    password: adminPassword,
    name: '시스템 관리자',
    role: 'system_admin'
  },
  {
    email: process.env.DEV_EMAIL || 'dev@casenetai.kr',
    password: devPassword,
    name: '개발자',
    role: 'system_admin'
  },
  {
    email: process.env.TEST_EMAIL || 'test@casenetai.kr',
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
    await pool.query('SELECT 1');
    console.log('✅ 데이터베이스 연결 성공\n');
    
    for (const account of accounts) {
      try {
        // 비밀번호 해싱 (salt rounds: 12)
        const hash = await bcrypt.hash(account.password, BCRYPT_SALT_ROUNDS);
        
        // 기존 계정 및 연관 크레딧 삭제
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [account.email]);
        if (existing.rows.length > 0) {
          await pool.query('DELETE FROM credits WHERE user_id = $1', [existing.rows[0].id]);
          await pool.query('DELETE FROM users WHERE email = $1', [account.email]);
        }
        
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
        
        const roleLabel = account.role === 'system_admin' ? '관리자' : '사용자';
        console.log(`✅ ${roleLabel} 계정 생성 완료`);
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
    console.log('📝 로그인: https://casenetai.kr/login.html');
    console.log('   비밀번호는 환경 변수를 참조하세요.\n');
    console.log('⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
