require('dotenv').config();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 라우터 파일 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const routes = [
  'admin',
  'analytics',
  'auth',
  'feedback',
  'payment'
];

let passed = 0;
let failed = 0;
let warnings = [];

routes.forEach(route => {
  try {
    const router = require(`./routes/${route}`);
    console.log(`   ✅ ${route}.js`);
    passed++;
  } catch (error) {
    console.log(`   ❌ ${route}.js: ${error.message}`);
    failed++;
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ 성공: ${passed}개 | ❌ 실패: ${failed}개`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
