const bcrypt = require('bcrypt');

const password = 'Admin2026!@#$';
const saltRounds = 12;

(async () => {
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 비밀번호 해시 생성 완료');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('원본 비밀번호:', password);
  console.log('\n해시 값 (Supabase SQL에 사용):');
  console.log(hash);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
