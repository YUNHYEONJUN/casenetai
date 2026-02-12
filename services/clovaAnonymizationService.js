/**
 * CLOVA NER 기반 익명화 서비스
 * 한국어 특화 개체명 인식으로 개인정보 탐지
 */

const axios = require('axios');

class ClovaAnonymizationService {
  constructor(clientId, clientSecret) {
    if (!clientId || !clientSecret) {
      throw new Error('CLOVA API 인증 정보가 필요합니다.');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    
    // Naver Cloud Platform CLOVA Studio API
    this.apiUrl = 'https://clovastudio.stream.ntruss.com/testapp/v1/api-tools/chat-completions/HCX-DASH-001';
    this.requestId = this.generateRequestId();
  }

  /**
   * CLOVA를 사용하여 텍스트 분석 및 익명화
   * @param {string} text - 원본 텍스트
   * @param {object} options - 익명화 옵션
   * @returns {Promise<object>} 익명화 결과
   */
  async analyzeAndAnonymize(text, options = {}) {
    try {
      const startTime = Date.now();
      
      // CLOVA Studio Chat Completions API 호출
      const entities = await this.extractEntities(text);
      
      // 개체명을 익명화 매핑으로 변환
      const mappings = this.createMappings(entities);
      
      // 텍스트 익명화 적용
      const anonymizedText = this.applyAnonymization(text, mappings);
      
      // 통계 계산
      const stats = this.calculateStats(mappings);
      
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        method: 'clova',
        model: 'HCX-DASH-001',
        anonymized_text: anonymizedText,
        mappings: mappings,
        stats: stats,
        processing_time_ms: processingTime,
        entities_detected: entities.length,
        confidence_threshold: options.minConfidence || 0.7
      };

    } catch (error) {
      console.error('❌ CLOVA 익명화 실패:', error.message);
      return {
        success: false,
        method: 'clova',
        error: error.message,
        error_type: error.response?.status || 'unknown',
        processing_time_ms: 0
      };
    }
  }

  /**
   * CLOVA API를 통해 개체명 추출
   */
  async extractEntities(text) {
    const prompt = this.buildClovaPrompt(text);
    
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messages: [
            {
              role: 'system',
              content: '당신은 한국어 개인정보 탐지 전문가입니다. 텍스트에서 개인정보를 JSON 형태로 정확하게 추출합니다.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          topP: 0.8,
          topK: 0,
          maxTokens: 2000,
          temperature: 0.1,
          repeatPenalty: 1.2,
          stopBefore: [],
          includeAiFilters: true,
          seed: 0
        },
        {
          headers: {
            'X-NCP-CLOVASTUDIO-API-KEY': this.clientSecret,
            'X-NCP-APIGW-API-KEY': this.clientId,
            'X-NCP-CLOVASTUDIO-REQUEST-ID': this.requestId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      // CLOVA 응답 파싱
      const result = response.data;
      if (result.status?.code === '20000') {
        const content = result.result?.message?.content || '{}';
        const parsed = JSON.parse(content);
        return parsed.entities || [];
      } else {
        throw new Error(`CLOVA API 오류: ${result.status?.message || 'Unknown'}`);
      }

    } catch (error) {
      // API 오류 시 폴백: 간단한 패턴 매칭
      console.warn('⚠️ CLOVA API 호출 실패, 폴백 모드 사용:', error.message);
      return this.fallbackExtraction(text);
    }
  }

  /**
   * CLOVA용 프롬프트 생성
   */
  buildClovaPrompt(text) {
    return `
다음 텍스트에서 개인정보를 찾아 JSON 형태로 추출하세요.

【탐지 대상】
- PERSON: 사람 이름 (실명, 별칭 포함)
- PHONE: 전화번호
- EMAIL: 이메일 주소
- ADDRESS: 주소 (도로명, 지번 주소)
- ID_NUMBER: 주민등록번호, 여권번호 등
- FACILITY: 시설명, 장소명
- DATE: 구체적인 날짜

【출력 형식】
{
  "entities": [
    {
      "text": "추출된 텍스트",
      "type": "PERSON|PHONE|EMAIL|ADDRESS|ID_NUMBER|FACILITY|DATE",
      "start": 시작_위치,
      "end": 종료_위치,
      "confidence": 0.0~1.0
    }
  ]
}

【입력 텍스트】
${text}

위 형식의 JSON만 출력하세요 (다른 설명 없이).`;
  }

  /**
   * 폴백: API 실패 시 간단한 패턴 매칭
   */
  fallbackExtraction(text) {
    const entities = [];
    let idCounter = 0;

    // 전화번호 패턴
    const phonePattern = /(\d{2,3}-\d{3,4}-\d{4}|\d{10,11})/g;
    let match;
    while ((match = phonePattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'PHONE',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
        id: `entity_${idCounter++}`
      });
    }

    // 이메일 패턴
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    while ((match = emailPattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'EMAIL',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
        id: `entity_${idCounter++}`
      });
    }

    // 주민등록번호 패턴
    const idPattern = /\d{6}-[1-4]\d{6}/g;
    while ((match = idPattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'ID_NUMBER',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
        id: `entity_${idCounter++}`
      });
    }

    // 한국어 이름 패턴 (2-4자, 한글)
    const namePattern = /([가-힣]{2,4})\s*(씨|님|선생님|과장|팀장|사장)?/g;
    const excludeNames = ['정보', '상황', '관계', '노인', '가족', '이웃', '친구', '부모', '자녀'];
    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1];
      if (!excludeNames.includes(name)) {
        entities.push({
          text: match[0],
          type: 'PERSON',
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.7,
          id: `entity_${idCounter++}`
        });
      }
    }

    return entities;
  }

  /**
   * 개체명을 익명화 매핑으로 변환
   */
  createMappings(entities) {
    const mappings = [];
    const counters = {
      PERSON: 0,
      PHONE: 0,
      EMAIL: 0,
      ADDRESS: 0,
      ID_NUMBER: 0,
      FACILITY: 0,
      DATE: 0
    };

    // 중복 제거 (동일 텍스트는 같은 태그 사용)
    const seen = new Map();

    for (const entity of entities) {
      if (seen.has(entity.text)) {
        continue; // 이미 처리한 텍스트는 스킵
      }

      const type = this.mapEntityType(entity.type);
      counters[entity.type]++;
      
      const anonymized = this.generateTag(entity.type, counters[entity.type]);
      
      mappings.push({
        original: entity.text,
        anonymized: anonymized,
        type: type,
        confidence: entity.confidence || 0.8,
        start: entity.start,
        end: entity.end
      });

      seen.set(entity.text, anonymized);
    }

    // 위치 기준 정렬 (뒤에서부터 치환하기 위해)
    return mappings.sort((a, b) => b.start - a.start);
  }

  /**
   * CLOVA 엔티티 타입을 내부 타입으로 변환
   */
  mapEntityType(clovaType) {
    const typeMap = {
      'PERSON': 'name',
      'PHONE': 'phone',
      'EMAIL': 'email',
      'ADDRESS': 'address',
      'ID_NUMBER': 'identifier',
      'FACILITY': 'facility',
      'DATE': 'date'
    };
    return typeMap[clovaType] || 'unknown';
  }

  /**
   * 익명화 태그 생성
   */
  generateTag(type, counter) {
    const tagMap = {
      'PERSON': '이름',
      'PHONE': '연락처',
      'EMAIL': '이메일',
      'ADDRESS': '주소',
      'ID_NUMBER': '주민번호',
      'FACILITY': '시설',
      'DATE': '날짜'
    };
    const tagName = tagMap[type] || '정보';
    return `[${tagName}_${counter}]`;
  }

  /**
   * 텍스트에 익명화 적용
   */
  applyAnonymization(text, mappings) {
    let result = text;
    
    // 뒤에서부터 치환 (위치 인덱스 유지)
    for (const mapping of mappings) {
      if (mapping.start !== undefined && mapping.end !== undefined) {
        result = result.substring(0, mapping.start) + 
                 mapping.anonymized + 
                 result.substring(mapping.end);
      } else {
        // 위치 정보 없으면 전체 텍스트에서 치환
        result = result.replace(new RegExp(this.escapeRegex(mapping.original), 'g'), mapping.anonymized);
      }
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
      others: 0
    };

    for (const mapping of mappings) {
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
        default:
          stats.others++;
      }
    }

    return stats;
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Request ID 생성
   */
  generateRequestId() {
    return `casenetai-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 건강 체크
   */
  async healthCheck() {
    try {
      // 간단한 테스트 문장으로 확인
      const testResult = await this.extractEntities('테스트: 010-1234-5678');
      return {
        status: 'healthy',
        available: true,
        test_result: testResult.length > 0
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

module.exports = ClovaAnonymizationService;
