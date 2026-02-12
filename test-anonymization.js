/**
 * 익명화 방식 테스트 스크립트
 * 룰 기반 vs AI vs CLOVA vs 하이브리드 비교
 */

require('dotenv').config();
const HybridAnonymizationService = require('./services/hybridAnonymizationService');

// 테스트 샘플 문서
const testCases = [
  {
    name: '기본 사례',
    text: `2024년 11월 5일, 김철수(가명) 님의 딸 박영희씨가 전화(010-1234-5678)로 아버지가 요양원에서 학대당한다고 신고했습니다. 해당 시설은 서울시 강남구 OO요양원으로 확인되었습니다.`
  },
  {
    name: '복잡한 문맥',
    text: `상담사는 김 과장님과 통화 후, 피해자 이모(가명, 82세, 010-9876-5432)씨가 거주하는 행복노인요양원(서울시 마포구 123-45)에 방문했습니다. 신고인 박정희 씨는 mother@email.com으로 추가 자료를 보냈습니다.`
  },
  {
    name: '애매한 경우',
    text: `정보 수집 과정에서 상황 파악이 필요했습니다. 기관 담당자는 관계 개선을 위해 노력했으며, 이웃 주민의 협조를 받았습니다.`
  }
];

async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 익명화 방식 테스트 시작');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 서비스 초기화
  const hybridService = new HybridAnonymizationService({
    openaiApiKey: process.env.OPENAI_API_KEY,
    clovaClientId: process.env.CLOVA_CLIENT_ID,
    clovaClientSecret: process.env.CLOVA_CLIENT_SECRET,
    defaultMethod: 'hybrid',
    minConfidence: 0.7
  });

  // 헬스 체크
  console.log('🏥 서비스 상태 확인...');
  const health = await hybridService.healthCheck();
  console.log('   - 룰 기반:', health.services.rule ? '✅' : '❌');
  console.log('   - AI (GPT-4o-mini):', health.services.ai ? '✅' : '❌');
  console.log('   - CLOVA NER:', health.services.clova ? '✅' : '❌');
  console.log('   사용 가능한 방식:', health.available_methods.join(', '));
  console.log('');

  // 각 테스트 케이스 실행
  for (const testCase of testCases) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 테스트: ${testCase.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📄 원본:');
    console.log(testCase.text);
    console.log('\n');

    try {
      // Compare 모드로 실행 (모든 방식 비교)
      const result = await hybridService.anonymize(testCase.text, {
        method: 'compare',
        minConfidence: 0.7
      });

      if (result.success) {
        // 결과 출력
        const methods = ['rule', 'ai', 'clova'];
        
        for (const method of methods) {
          if (result.results[method] && result.results[method].success) {
            const methodResult = result.results[method];
            console.log(`\n🔍 ${method.toUpperCase()} 결과:`);
            console.log(`   처리 시간: ${methodResult.processing_time_ms || 0}ms`);
            console.log(`   탐지 개수: ${methodResult.stats?.total_entities || 0}개`);
            console.log(`   비용: ${methodResult.cost_estimate?.krw || 0}원`);
            console.log(`   익명화: ${methodResult.anonymized_text}`);
          }
        }

        // 비교 통계
        if (result.comparison) {
          console.log('\n\n📊 종합 비교:');
          console.log('┌─────────────┬─────────┬─────────┬────────┐');
          console.log('│   방식      │ 탐지 수 │ 속도(ms)│ 비용   │');
          console.log('├─────────────┼─────────┼─────────┼────────┤');
          
          methods.forEach(method => {
            const count = result.comparison.entity_counts?.[method] || 0;
            const speed = result.comparison.speed?.[method] || 0;
            const cost = result.comparison.cost?.[method] || 0;
            console.log(`│ ${method.padEnd(11)} │ ${String(count).padStart(7)} │ ${String(speed).padStart(8)}│ ${String(cost).padStart(6)} │`);
          });
          
          console.log('└─────────────┴─────────┴─────────┴────────┘');
        }

        // 추천
        if (result.recommendation) {
          console.log('\n\n💡 추천:');
          result.recommendation.forEach(rec => {
            const emoji = rec.priority === 'accuracy' ? '🎯' :
                         rec.priority === 'speed' ? '⚡' :
                         rec.priority === 'cost' ? '💰' : '⚖️';
            console.log(`   ${emoji} ${rec.priority}: ${rec.method.toUpperCase()} - ${rec.reason}`);
          });
        }

      } else {
        console.error('❌ 테스트 실패:', result.error);
      }

    } catch (error) {
      console.error('❌ 오류 발생:', error.message);
    }

    console.log('\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 모든 테스트 완료');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// 실행
runTests().catch(error => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});
