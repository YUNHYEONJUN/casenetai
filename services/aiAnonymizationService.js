/**
 * AI 기반 익명화 서비스 (GPT-4o-mini)
 * 문맥을 이해하여 개인정보를 정확하게 탐지하고 익명화
 */

const OpenAI = require('openai');
const { logger } = require('../lib/logger');

class AIAnonymizationService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('OpenAI API Key가 필요합니다.');
    }
    this.openai = new OpenAI({ apiKey });
    this.model = 'gpt-4o-mini';
  }

  /**
   * AI를 사용하여 텍스트를 분석하고 익명화
   * @param {string} text - 원본 텍스트
   * @param {object} options - 익명화 옵션
   * @returns {Promise<object>} 익명화 결과
   */
  async analyzeAndAnonymize(text, options = {}) {
    const prompt = this.buildPrompt(text, options);

    try {
      const startTime = Date.now();
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: '당신은 노인보호전문기관 상담 문서 전문 익명화 AI입니다. 개인정보보호법을 준수하며 정확하고 일관성 있게 개인정보를 탐지하고 익명화합니다.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // 일관성을 위해 낮게 설정
        response_format: { type: 'json_object' }
      });

      const processingTime = Date.now() - startTime;
      const result = JSON.parse(response.choices[0].message.content);

      // 신뢰도 기반 필터링 (기본값: 0.7 이상만)
      const minConfidence = options.minConfidence || 0.7;
      if (result.mappings) {
        result.mappings = result.mappings.filter(m => m.confidence >= minConfidence);
      }

      return {
        success: true,
        method: 'ai',
        model: this.model,
        anonymized_text: result.anonymized_text || '',
        mappings: result.mappings || [],
        stats: result.stats || {},
        processing_time_ms: processingTime,
        tokens_used: response.usage || {},
        cost_estimate: this.calculateCost(response.usage),
        confidence_threshold: minConfidence
      };

    } catch (error) {
      logger.error('AI 익명화 실패', { error: error.message });
      return {
        success: false,
        method: 'ai',
        error: error.message,
        error_type: error.type || 'unknown',
        processing_time_ms: 0
      };
    }
  }

  /**
   * 프롬프트 생성
   */
  buildPrompt(text, options) {
    return `
당신은 노인보호전문기관 상담 문서 전문가입니다.
다음 텍스트에서 개인정보를 찾아 익명화하세요.

【탐지 대상 개인정보】
1. **성명**: 실명, 별칭, 간접 언급 포함
   - 예: "김철수", "김 OO", "김씨", "김 과장님", "피해자 A", "그분"
2. **연락처**: 전화번호, 이메일, 주소
   - 예: "010-1234-5678", "02-123-4567", "test@example.com", "서울시 강남구 역삼동 123"
3. **식별자**: 주민등록번호, 여권번호, 계좌번호, 차량번호
   - 예: "901234-1234567", "M12345678", "110-123-456789", "12가3456"
4. **시설명/장소**: 구체적인 시설명, 상호명
   - 예: "OO요양원", "△△병원", "□□경로당"
5. **날짜/시간**: 구체적인 날짜와 시간 (연/월만 있는 경우 제외)
   - 예: "2024년 11월 5일 오후 3시", "11월 5일"

【보존 대상 (익명화 하지 말 것)】
- 일반 명사: 정보, 상황, 관계, 노인, 가족, 이웃, 친구
- 직책/호칭: 팀장, 과장, 선생님, 사회복지사, 상담사
- 조직명: 노인보호전문기관, 경찰서, 보건소, 시청, 구청
- 법률 용어: 학대, 신고, 조사, 피해, 가해, 상담, 개입
- 일반 지역명: 서울, 경기도, 강남구 (구체적 주소 제외)

【익명화 규칙】
- 동일한 정보는 항상 동일한 태그 사용 (일관성 보장)
- 성명 → [이름_1], [이름_2], [이름_3] (등장 순서대로)
- 연락처 → [연락처_1], [연락처_2]
- 주소 → [주소_1], [주소_2]
- 이메일 → [이메일_1]
- 식별자 → [주민번호_1], [계좌번호_1]
- 시설명 → [시설_1], [시설_2]
- 날짜 → [날짜_1], [날짜_2]

【신뢰도 점수 기준】
- 1.0: 확실한 개인정보 (전화번호, 주민번호 등 패턴 명확)
- 0.9: 높은 확신 (문맥상 명확한 실명)
- 0.8: 중간 확신 (추정 가능한 개인정보)
- 0.7: 낮은 확신 (애매한 경우)
- 0.6 이하: 불확실 (일반 명사 가능성)

【입력 텍스트】
${text}

【출력 형식】
다음 JSON 형태로만 응답하세요 (다른 설명 없이):
{
  "anonymized_text": "익명화된 전체 텍스트 (원본과 동일한 형식 유지)",
  "mappings": [
    {
      "original": "원본 텍스트",
      "anonymized": "[태그]",
      "type": "name|phone|email|address|identifier|facility|date",
      "confidence": 0.95,
      "context": "주변 문맥 (선택)"
    }
  ],
  "stats": {
    "total_entities": 총_탐지_개수,
    "names": 이름_개수,
    "contacts": 연락처_개수,
    "identifiers": 식별자_개수,
    "facilities": 시설명_개수,
    "dates": 날짜_개수
  }
}`;
  }

  /**
   * API 사용 비용 계산
   * GPT-4o-mini 가격 (2024년 12월 기준)
   */
  calculateCost(usage) {
    if (!usage) return 0;
    
    // $0.150/1M input tokens, $0.600/1M output tokens
    const inputCost = (usage.prompt_tokens / 1000000) * 0.15;
    const outputCost = (usage.completion_tokens / 1000000) * 0.60;
    const totalCost = inputCost + outputCost;
    
    return {
      usd: parseFloat(totalCost.toFixed(6)),
      krw: Math.ceil(totalCost * 1300), // 환율 1,300원 가정
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens
    };
  }

  /**
   * 배치 처리 (여러 문서를 한 번에)
   */
  async batchAnonymize(texts, options = {}) {
    const results = [];
    let totalCost = { usd: 0, krw: 0 };

    for (let i = 0; i < texts.length; i++) {
      logger.info('배치 처리 중', { current: i + 1, total: texts.length });
      const result = await this.analyzeAndAnonymize(texts[i], options);
      results.push(result);

      if (result.cost_estimate) {
        totalCost.usd += result.cost_estimate.usd;
        totalCost.krw += result.cost_estimate.krw;
      }

      // API 속도 제한 대응: 0.5초 대기
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return {
      results,
      total_processed: texts.length,
      total_cost: totalCost,
      success_count: results.filter(r => r.success).length,
      failure_count: results.filter(r => !r.success).length
    };
  }

  /**
   * 스트리밍 응답 (대용량 문서용)
   */
  async streamAnonymize(text, onChunk) {
    const prompt = this.buildPrompt(text);

    try {
      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: '노인보호 전문 익명화 AI' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        stream: true
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        if (onChunk) onChunk(content);
      }

      return JSON.parse(fullResponse);
    } catch (error) {
      logger.error('스트리밍 익명화 실패', { error: error.message });
      throw error;
    }
  }

  /**
   * 건강 체크
   */
  async healthCheck() {
    try {
      const response = await this.openai.models.retrieve(this.model);
      return {
        status: 'healthy',
        model: response.id,
        available: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        available: false
      };
    }
  }
}

module.exports = AIAnonymizationService;
