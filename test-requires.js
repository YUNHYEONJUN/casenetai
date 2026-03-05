console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 서비스 모듈 로드 테스트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const services = [
  'aiAnonymizationService',
  'aiService',
  'analyticsService',
  'anonymizationService',
  'authService',
  'clovaAnonymizationService',
  'clovaSttService',
  'creditService',
  'documentParser',
  'feedbackService',
  'hybridAnonymizationService',
  'paymentService',
  'usageTrackingService'
];

let passed = 0;
let failed = 0;

services.forEach(service => {
  try {
    const module = require(`./services/${service}`);
    console.log(`   ✅ ${service}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ ${service}: ${error.message}`);
    failed++;
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ 성공: ${passed}개 | ❌ 실패: ${failed}개`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
