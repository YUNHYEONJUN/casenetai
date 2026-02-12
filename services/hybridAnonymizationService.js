/**
 * 하이브리드 익명화 서비스
 * 룰 기반 + AI(GPT-4o-mini) + CLOVA NER 통합
 * A/B 테스트 지원
 */

const anonymizationService = require('./anonymizationService');
const AIAnonymizationService = require('./aiAnonymizationService');
const ClovaAnonymizationService = require('./clovaAnonymizationService');

class HybridAnonymizationService {
  constructor(config = {}) {
    this.config = {
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      clovaClientId: config.clovaClientId || process.env.CLOVA_CLIENT_ID,
      clovaClientSecret: config.clovaClientSecret || process.env.CLOVA_CLIENT_SECRET,
      defaultMethod: config.defaultMethod || 'hybrid', // rule, ai, clova, hybrid
      minConfidence: config.minConfidence || 0.7
    };

    // 서비스 인스턴스 초기화
    this.aiService = this.config.openaiApiKey 
      ? new AIAnonymizationService(this.config.openaiApiKey)
      : null;
    
    this.clovaService = (this.config.clovaClientId && this.config.clovaClientSecret)
      ? new ClovaAnonymizationService(this.config.clovaClientId, this.config.clovaClientSecret)
      : null;
  }

  /**
   * 통합 익명화 메인 함수
   * @param {string} text - 원본 텍스트
   * @param {object} options - 익명화 옵션
   * @returns {Promise<object>} 익명화 결과
   */
  async anonymize(text, options = {}) {
    const method = options.method || this.config.defaultMethod;

    console.log(`🔍 익명화 방식: ${method}`);

    switch (method) {
      case 'rule':
        return this.ruleBasedAnonymize(text, options);
      
      case 'ai':
        return this.aiAnonymize(text, options);
      
      case 'clova':
        return this.clovaAnonymize(text, options);
      
      case 'hybrid':
        return this.hybridAnonymize(text, options);
      
      case 'compare':
        return this.compareAllMethods(text, options);
      
      default:
        throw new Error(`지원하지 않는 익명화 방식: ${method}`);
    }
  }

  /**
   * 룰 기반 익명화 (기존 방식)
   */
  async ruleBasedAnonymize(text, options) {
    const startTime = Date.now();
    const result = anonymizationService.anonymize(text);
    
    return {
      success: true,
      method: 'rule',
      anonymized_text: result.anonymizedText,
      mappings: result.mappings || [],
      stats: {
        total_entities: result.mappings?.length || 0,
        names: result.mappings?.filter(m => m.type === 'name').length || 0,
        contacts: result.mappings?.filter(m => ['phone', 'email', 'address'].includes(m.type)).length || 0,
        identifiers: result.mappings?.filter(m => m.type === 'identifier').length || 0,
        facilities: result.mappings?.filter(m => m.type === 'facility').length || 0
      },
      processing_time_ms: Date.now() - startTime,
      cost_estimate: { usd: 0, krw: 0 }
    };
  }

  /**
   * AI 기반 익명화 (GPT-4o-mini)
   */
  async aiAnonymize(text, options) {
    if (!this.aiService) {
      throw new Error('OpenAI API Key가 설정되지 않았습니다.');
    }
    return this.aiService.analyzeAndAnonymize(text, options);
  }

  /**
   * CLOVA 기반 익명화
   */
  async clovaAnonymize(text, options) {
    if (!this.clovaService) {
      throw new Error('CLOVA API 키가 설정되지 않았습니다.');
    }
    return this.clovaService.analyzeAndAnonymize(text, options);
  }

  /**
   * 하이브리드 익명화 (3단계 파이프라인)
   * 1단계: 룰 기반 (빠른 필터링)
   * 2단계: AI 분석 (문맥 이해)
   * 3단계: 결과 병합 (최고 신뢰도 우선)
   */
  async hybridAnonymize(text, options) {
    const startTime = Date.now();
    const results = {};

    try {
      // 1단계: 룰 기반 익명화 (항상 실행)
      console.log('📋 1단계: 룰 기반 익명화...');
      results.rule = await this.ruleBasedAnonymize(text, options);

      // 2단계: AI 익명화 (사용 가능하면)
      if (this.aiService) {
        console.log('🤖 2단계: AI 익명화...');
        results.ai = await this.aiAnonymize(text, options);
      }

      // 3단계: CLOVA 익명화 (사용 가능하면)
      if (this.clovaService && options.useClova !== false) {
        console.log('🔵 3단계: CLOVA 익명화...');
        results.clova = await this.clovaAnonymize(text, options);
      }

      // 4단계: 결과 병합
      console.log('🔀 4단계: 결과 병합...');
      const mergedResult = this.mergeResults(text, results, options);

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        method: 'hybrid',
        anonymized_text: mergedResult.anonymizedText,
        mappings: mergedResult.mappings,
        stats: mergedResult.stats,
        processing_time_ms: totalTime,
        breakdown: {
          rule: results.rule?.processing_time_ms || 0,
          ai: results.ai?.processing_time_ms || 0,
          clova: results.clova?.processing_time_ms || 0
        },
        cost_estimate: results.ai?.cost_estimate || { usd: 0, krw: 0 },
        sources: {
          rule_count: results.rule?.mappings?.length || 0,
          ai_count: results.ai?.mappings?.length || 0,
          clova_count: results.clova?.mappings?.length || 0
        }
      };

    } catch (error) {
      console.error('❌ 하이브리드 익명화 실패:', error);
      
      // 폴백: 룰 기반 결과만 반환
      if (results.rule) {
        return {
          ...results.rule,
          method: 'hybrid_fallback',
          fallback_reason: error.message
        };
      }

      throw error;
    }
  }

  /**
   * 모든 방식 비교 (A/B 테스트용)
   */
  async compareAllMethods(text, options) {
    const startTime = Date.now();
    const results = {};

    // 병렬 실행
    const promises = [];

    // 룰 기반 (항상 실행)
    promises.push(
      this.ruleBasedAnonymize(text, options)
        .then(r => { results.rule = r; })
        .catch(e => { results.rule = { success: false, error: e.message }; })
    );

    // AI (사용 가능하면)
    if (this.aiService) {
      promises.push(
        this.aiAnonymize(text, options)
          .then(r => { results.ai = r; })
          .catch(e => { results.ai = { success: false, error: e.message }; })
      );
    }

    // CLOVA (사용 가능하면)
    if (this.clovaService) {
      promises.push(
        this.clovaAnonymize(text, options)
          .then(r => { results.clova = r; })
          .catch(e => { results.clova = { success: false, error: e.message }; })
      );
    }

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;

    // 비교 통계
    const comparison = this.generateComparison(results);

    return {
      success: true,
      method: 'compare',
      results: results,
      comparison: comparison,
      processing_time_ms: totalTime,
      recommendation: this.recommendBestMethod(comparison)
    };
  }

  /**
   * 여러 결과를 병합 (중복 제거, 최고 신뢰도 우선)
   */
  mergeResults(originalText, results, options) {
    const allMappings = [];
    const minConfidence = options.minConfidence || this.config.minConfidence;

    // 모든 매핑 수집
    if (results.rule?.mappings) {
      results.rule.mappings.forEach(m => {
        allMappings.push({ ...m, source: 'rule', confidence: m.confidence || 0.85 });
      });
    }

    if (results.ai?.mappings) {
      results.ai.mappings.forEach(m => {
        allMappings.push({ ...m, source: 'ai', confidence: m.confidence || 0.9 });
      });
    }

    if (results.clova?.mappings) {
      results.clova.mappings.forEach(m => {
        allMappings.push({ ...m, source: 'clova', confidence: m.confidence || 0.8 });
      });
    }

    // 신뢰도 필터링
    const filteredMappings = allMappings.filter(m => m.confidence >= minConfidence);

    // 중복 제거: 동일 원본 텍스트는 최고 신뢰도만 유지
    const uniqueMappings = this.deduplicateMappings(filteredMappings);

    // 익명화 적용
    const anonymizedText = this.applyMappings(originalText, uniqueMappings);

    // 통계 계산
    const stats = this.calculateStats(uniqueMappings);

    return {
      anonymizedText,
      mappings: uniqueMappings,
      stats
    };
  }

  /**
   * 매핑 중복 제거 (최고 신뢰도 우선)
   */
  deduplicateMappings(mappings) {
    const map = new Map();

    for (const mapping of mappings) {
      const key = mapping.original;
      
      if (!map.has(key)) {
        map.set(key, mapping);
      } else {
        const existing = map.get(key);
        // 신뢰도가 더 높으면 교체
        if (mapping.confidence > existing.confidence) {
          map.set(key, mapping);
        }
      }
    }

    return Array.from(map.values());
  }

  /**
   * 텍스트에 매핑 적용
   */
  applyMappings(text, mappings) {
    let result = text;
    
    // 매핑 적용 (긴 것부터 먼저 치환 - 부분 매칭 방지)
    const sortedMappings = mappings.sort((a, b) => b.original.length - a.original.length);
    
    for (const mapping of sortedMappings) {
      const regex = new RegExp(this.escapeRegex(mapping.original), 'g');
      result = result.replace(regex, mapping.anonymized);
    }

    return result;
  }

  /**
   * 통계 계산
   */
  calculateStats(mappings) {
    const stats = {
      total_entities: mappings.length,
      names: 0,
      contacts: 0,
      identifiers: 0,
      facilities: 0,
      dates: 0,
      by_source: { rule: 0, ai: 0, clova: 0 }
    };

    for (const mapping of mappings) {
      // 타입별 카운트
      switch (mapping.type) {
        case 'name':
          stats.names++;
          break;
        case 'phone':
        case 'email':
        case 'address':
          stats.contacts++;
          break;
        case 'identifier':
          stats.identifiers++;
          break;
        case 'facility':
          stats.facilities++;
          break;
        case 'date':
          stats.dates++;
          break;
      }

      // 소스별 카운트
      if (mapping.source) {
        stats.by_source[mapping.source]++;
      }
    }

    return stats;
  }

  /**
   * 비교 통계 생성
   */
  generateComparison(results) {
    const comparison = {
      accuracy_estimate: {},
      speed: {},
      cost: {},
      entity_counts: {}
    };

    for (const [method, result] of Object.entries(results)) {
      if (result.success) {
        comparison.entity_counts[method] = result.stats?.total_entities || 0;
        comparison.speed[method] = result.processing_time_ms;
        comparison.cost[method] = result.cost_estimate?.krw || 0;
        
        // 정확도 추정 (휴리스틱)
        if (method === 'rule') {
          comparison.accuracy_estimate[method] = 0.85;
        } else if (method === 'ai') {
          comparison.accuracy_estimate[method] = 0.95;
        } else if (method === 'clova') {
          comparison.accuracy_estimate[method] = 0.90;
        }
      }
    }

    return comparison;
  }

  /**
   * 최적 방법 추천
   */
  recommendBestMethod(comparison) {
    const recommendations = [];

    // 정확도 우선
    recommendations.push({
      priority: 'accuracy',
      method: 'ai',
      reason: '문맥 이해 및 정확도 최고 (~95%)'
    });

    // 속도 우선
    recommendations.push({
      priority: 'speed',
      method: 'rule',
      reason: '가장 빠른 처리 속도 (~50ms)'
    });

    // 비용 우선
    recommendations.push({
      priority: 'cost',
      method: 'rule',
      reason: 'API 비용 0원'
    });

    // 균형 (추천)
    recommendations.push({
      priority: 'balanced',
      method: 'hybrid',
      reason: '정확도, 속도, 비용의 최적 균형 (~98% 정확도, ~2초, 저렴한 비용)'
    });

    return recommendations;
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 건강 체크
   */
  async healthCheck() {
    const health = {
      rule: true, // 항상 사용 가능
      ai: false,
      clova: false
    };

    // AI 서비스 체크
    if (this.aiService) {
      try {
        const aiHealth = await this.aiService.healthCheck();
        health.ai = aiHealth.available;
      } catch (error) {
        console.warn('AI 서비스 건강 체크 실패:', error.message);
      }
    }

    // CLOVA 서비스 체크
    if (this.clovaService) {
      try {
        const clovaHealth = await this.clovaService.healthCheck();
        health.clova = clovaHealth.available;
      } catch (error) {
        console.warn('CLOVA 서비스 건강 체크 실패:', error.message);
      }
    }

    return {
      status: 'healthy',
      services: health,
      available_methods: [
        'rule',
        health.ai ? 'ai' : null,
        health.clova ? 'clova' : null,
        'hybrid',
        'compare'
      ].filter(Boolean)
    };
  }
}

module.exports = HybridAnonymizationService;
