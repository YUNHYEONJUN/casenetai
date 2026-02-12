/**
 * 라우터 로드 테스트
 */

const routerFiles = [
  'admin.js',
  'analytics.js',
  'auth.js',
  'feedback.js',
  'payment.js'
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('라우터 로드 테스트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const results = [];

routerFiles.forEach(file => {
  try {
    const router = require(`./routes/${file}`);
    
    // Express Router 타입 체크
    if (typeof router !== 'function') {
      throw new Error('Router is not a function');
    }
    
    // Router의 stack 확인 (라우트가 등록되어 있는지)
    const routeCount = router.stack ? router.stack.length : 0;
    
    console.log(`✅ ${file}: 성공 (${routeCount}개 라우트 등록)`);
    results.push({ file, success: true, routeCount });
  } catch (error) {
    console.log(`❌ ${file}: 실패`);
    console.log(`   원인: ${error.message}`);
    if (error.stack) {
      const stack = error.stack.split('\n').slice(0, 3).join('\n');
      console.log(`   ${stack}`);
    }
    console.log('');
    results.push({ file, success: false, error: error.message });
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('테스트 요약');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const successCount = results.filter(r => r.success).length;
console.log(`✅ 성공: ${successCount}/${routerFiles.length}`);
console.log(`❌ 실패: ${routerFiles.length - successCount}/${routerFiles.length}`);

if (successCount === routerFiles.length) {
  console.log('\n🎉 모든 라우터가 정상적으로 로드되었습니다!');
  process.exit(0);
} else {
  console.log('\n⚠️ 일부 라우터에서 오류가 발견되었습니다.');
  process.exit(1);
}
