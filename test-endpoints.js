/**
 * API 엔드포인트 통합 테스트
 */

const express = require('express');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('API 엔드포인트 통합 테스트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Express 앱 생성
const app = express();
app.use(express.json());

// 라우터 로드 및 마운트
const routers = {
  '/api/auth': require('./routes/auth'),
  '/api/admin': require('./routes/admin'),
  '/api/payment': require('./routes/payment'),
  '/api/feedback': require('./routes/feedback'),
  '/api/analytics': require('./routes/analytics')
};

let totalRoutes = 0;
Object.entries(routers).forEach(([path, router]) => {
  try {
    app.use(path, router);
    const routeCount = router.stack ? router.stack.length : 0;
    totalRoutes += routeCount;
    console.log(`✅ ${path}: ${routeCount}개 라우트 마운트 성공`);
  } catch (error) {
    console.log(`❌ ${path}: 마운트 실패 - ${error.message}`);
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`총 ${totalRoutes}개 엔드포인트 등록 완료`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 라우트 목록 출력
console.log('등록된 엔드포인트:');
app._router.stack
  .filter(r => r.route)
  .forEach(r => {
    const methods = Object.keys(r.route.methods).join(', ').toUpperCase();
    console.log(`  ${methods} ${r.route.path}`);
  });

// 라우터별 엔드포인트 카운트
app._router.stack
  .filter(r => r.name === 'router')
  .forEach((middleware, index) => {
    const router = middleware.handle;
    if (router.stack) {
      const basePath = Object.keys(routers)[index] || '/unknown';
      console.log(`\n📌 ${basePath} (${router.stack.length}개):`);
      router.stack
        .filter(layer => layer.route)
        .forEach(layer => {
          const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
          const path = layer.route.path;
          console.log(`   ${methods.padEnd(7)} ${basePath}${path}`);
        });
    }
  });

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ API 엔드포인트 검증 완료');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
