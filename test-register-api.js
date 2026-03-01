/**
 * 회원가입 API 테스트
 * 
 * 사용법:
 *   TEST_EMAIL=admin@casenetai.kr TEST_PASSWORD=YourPass! node test-register-api.js
 * 
 * ⚠️ 비밀번호는 환경 변수로만 전달합니다.
 */

require('dotenv').config();
const axios = require('axios');

const TEST_EMAIL = process.env.TEST_EMAIL || process.env.ADMIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD || process.env.ADMIN_PASSWORD;
const TEST_NAME = process.env.TEST_NAME || '테스트 사용자';
const TEST_PHONE = process.env.TEST_PHONE || '010-0000-0000';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다.');
  console.error('');
  console.error('사용법:');
  console.error('  TEST_EMAIL=user@example.com TEST_PASSWORD=YourPass! node test-register-api.js');
  console.error('');
  console.error('또는 .env 파일에 ADMIN_EMAIL, ADMIN_PASSWORD 설정');
  console.error('');
  process.exit(1);
}

const testAccounts = [
  {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    name: TEST_NAME,
    phone: TEST_PHONE
  }
];

(async () => {
  console.log('🧪 회원가입 API 테스트 시작...\n');
  
  for (const account of testAccounts) {
    try {
      console.log(`📝 ${account.email} 회원가입 시도...`);
      
      const response = await axios.post(`${BASE_URL}/api/auth/register`, {
        email: account.email,
        password: account.password,
        name: account.name,
        phone: account.phone
      });
      
      console.log('✅ 회원가입 성공!');
      console.log('응답:', JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      if (error.response) {
        console.error('❌ 회원가입 실패:', error.response.data);
      } else {
        console.error('❌ 오류:', error.message);
      }
    }
    console.log('');
  }
})();
