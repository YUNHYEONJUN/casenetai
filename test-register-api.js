/**
 * 회원가입 API 테스트
 * 
 * 사용법:
 *   ADMIN_PASSWORD="YourPassword123!" node test-register-api.js
 */

require('dotenv').config();
const axios = require('axios');

// 환경 변수에서 비밀번호 읽기
if (!process.env.ADMIN_PASSWORD) {
  console.error('❌ 오류: ADMIN_PASSWORD 환경 변수가 설정되지 않았습니다.');
  console.error('📝 사용법: ADMIN_PASSWORD="YourPassword" node test-register-api.js');
  process.exit(1);
}

const testAccounts = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@casenetai.kr',
    password: process.env.ADMIN_PASSWORD,
    name: '시스템 관리자',
    phone: '010-1234-5678'
  }
];

(async () => {
  console.log('🧪 회원가입 API 테스트 시작...\n');
  
  for (const account of testAccounts) {
    try {
      console.log(`📝 ${account.email} 회원가입 시도...`);
      
      const response = await axios.post('http://localhost:3000/api/auth/register', {
        email: account.email,
        password: account.password,
        name: account.name,
        phone: account.phone
      });
      
      console.log('✅ 회원가입 성공!');
      console.log('응답:', response.data);
      
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
