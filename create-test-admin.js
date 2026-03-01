/**
 * 테스트용 관리자 계정 생성 스크립트
 * 
 * ⚠️ 보안 주의: 모든 비밀번호는 환경 변수로 전달해야 합니다.
 * 
 * 사용 방법:
 *   ADMIN_PASSWORD=YourSecurePass1! DEV_PASSWORD=YourDevPass1! TEST_PASSWORD=YourTestPass1! node create-test-admin.js
 * 
 * 또는 .env 파일에 설정 후:
 *   node create-test-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const SALT_ROUNDS = 12;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 환경 변수에서 비밀번호 읽기 (하드코딩 절대 금지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEV_PASSWORD = process.env.DEV_PASSWORD;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

if (!ADMIN_PASSWORD || !DEV_PASSWORD || !TEST_PASSWORD) {
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다.\n');
  console.error('다음 환경 변수를 설정해주세요:');
  console.error('  ADMIN_PASSWORD  - 관리자 비밀번호 (최소 8자, 대소문자/숫자/특수문자 포함)');
  console.error('  DEV_PASSWORD    - 개발자 비밀번호');
  console.error('  TEST_PASSWORD   - 테스트 사용자 비밀번호\n');
  console.error('사용 예시:');
  console.error('  ADMIN_PASSWORD="MyStr0ng!Pass" DEV_PASSWORD="DevStr0ng!Pass" TEST_PASSWORD="TestStr0ng!Pass" node create-test-admin.js');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

// 비밀번호 강도 검증
function validatePassword(password, label) {
  const errors = [];
  if (password.length < 8) errors.push('최소 8자 이상');
  if (!/[A-Z]/.test(password)) errors.push('대문자 포함');
  if (!/[a-z]/.test(password)) errors.push('소문자 포함');
  if (!/[0-9]/.test(password)) errors.push('숫자 포함');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('특수문자 포함');
  
  if (errors.length > 0) {
    console.error(`❌ ${label} 비밀번호가 약합니다: ${errors.join(', ')} 필요`);
    process.exit(1);
  }
}

validatePassword(ADMIN_PASSWORD, '관리자');
validatePassword(DEV_PASSWORD, '개발자');
validatePassword(TEST_PASSWORD, '테스트');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true } 
    : { rejectUnauthorized: false }
});

const accounts = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@casenetai.kr',
    password: ADMIN_PASSWORD,
    name: '시스템 관리자',
    role: 'system_admin'
  },
  {
    email: process.env.DEV_EMAIL || 'dev@casenetai.kr',
    password: DEV_PASSWORD,
    name: '개발자',
    role: 'system_admin'
  },
  {
    email: process.env.TEST_EMAIL || 'test@casenetai.kr',
    password: TEST_PASSWORD,
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
        const hash = await bcrypt.hash(account.password, SALT_ROUNDS);
        
        const result = await pool.query(
          `INSERT INTO users (
            oauth_email, password_hash, name, role, 
            is_approved, oauth_provider, oauth_id,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, true, 'local', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (oauth_email) DO UPDATE SET 
            password_hash = $2, name = $3, role = $4, updated_at = CURRENT_TIMESTAMP
          RETURNING id`,
          [account.email, hash, account.name, account.role, 'admin_' + Date.now()]
        );
        
        const userId = result.rows[0].id;
        
        await pool.query(
          `INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
           VALUES ($1, $2, 0, 0, 0, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE SET balance = $2, updated_at = CURRENT_TIMESTAMP`,
          [userId, 10000000]
        );
        
        const roleLabel = account.role === 'system_admin' ? '관리자' : '사용자';
        console.log(`✅ ${roleLabel} 계정 생성 완료`);
        console.log(`   📧 이메일: ${account.email}`);
        console.log(`   🔑 비밀번호: ${'*'.repeat(account.password.length)} (보안상 미표시)`);
        console.log(`   👤 이름: ${account.name}`);
        console.log(`   🎭 역할: ${account.role}\n`);
        
      } catch (error) {
        console.error(`❌ ${account.email} 생성 실패:`, error.message);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 모든 계정이 준비되었습니다!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🌐 로그인: https://casenetai.kr/login.html');
    console.log('⚠️  첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 전체 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
