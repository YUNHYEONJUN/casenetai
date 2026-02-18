/**
 * 노인보호전문기관 문서 익명화 서비스
 * AI 기반 지능형 개인정보 자동 탐지 및 익명화
 * 
 * 주요 기능:
 * - OpenAI GPT-4를 사용한 컨텍스트 기반 개인정보 탐지
 * - 이름, 시설명, 연락처, 주소, 주민번호, 이메일 자동 탐지
 * - 동일 정보는 동일 익명 코드로 매핑
 * - 매핑 테이블 생성 (원본 ↔ 익명화)
 */

const OpenAI = require('openai');

class AnonymizationService {
    constructor() {
        // OpenAI 클라이언트 초기화
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY
        });

        // 익명화 매핑 저장소
        this.mappings = {
            names: new Map(),        // 이름
            facilities: new Map(),   // 시설명
            phones: new Map(),       // 연락처
            addresses: new Map(),    // 주소
            emails: new Map(),       // 이메일
            ids: new Map()          // 주민번호
        };

        // 카운터
        this.counters = {
            person: 0,
            facility: 0,
            phone: 0,
            address: 0,
            email: 0,
            id: 0
        };


    }

    /**
     * AI 기반 메인 익명화 함수
     */
    async anonymize(text) {
        if (!text) return { anonymizedText: '', mappings: {} };

        try {
            // AI로 개인정보 탐지
            const detectedInfo = await this.detectPersonalInfoWithAI(text);
            
            // 탐지된 정보를 바탕으로 익명화 수행
            let result = text;
            
            // 각 카테고리별로 익명화
            if (detectedInfo.residentIds) {
                detectedInfo.residentIds.forEach(id => {
                    if (!this.mappings.ids.has(id)) {
                        this.counters.id++;
                        this.mappings.ids.set(id, `[주민번호_${this.counters.id}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(id), 'g'), this.mappings.ids.get(id));
                });
            }

            if (detectedInfo.phones) {
                detectedInfo.phones.forEach(phone => {
                    if (!this.mappings.phones.has(phone)) {
                        this.counters.phone++;
                        this.mappings.phones.set(phone, `[연락처_${this.counters.phone}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(phone), 'g'), this.mappings.phones.get(phone));
                });
            }

            if (detectedInfo.emails) {
                detectedInfo.emails.forEach(email => {
                    if (!this.mappings.emails.has(email)) {
                        this.counters.email++;
                        this.mappings.emails.set(email, `[이메일_${this.counters.email}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(email), 'g'), this.mappings.emails.get(email));
                });
            }

            if (detectedInfo.addresses) {
                detectedInfo.addresses.forEach(address => {
                    if (!this.mappings.addresses.has(address)) {
                        this.counters.address++;
                        this.mappings.addresses.set(address, `[주소_${this.counters.address}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(address), 'g'), this.mappings.addresses.get(address));
                });
            }

            if (detectedInfo.facilities) {
                detectedInfo.facilities.forEach(facility => {
                    if (!this.mappings.facilities.has(facility)) {
                        this.counters.facility++;
                        this.mappings.facilities.set(facility, `[시설_${this.counters.facility}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(facility), 'g'), this.mappings.facilities.get(facility));
                });
            }

            if (detectedInfo.names) {
                detectedInfo.names.forEach(name => {
                    if (!this.mappings.names.has(name)) {
                        this.counters.person++;
                        this.mappings.names.set(name, `[인물_${this.counters.person}]`);
                    }
                    result = result.replace(new RegExp(this.escapeRegex(name), 'g'), this.mappings.names.get(name));
                });
            }

            return {
                anonymizedText: result,
                mappings: this.getMappingsTable()
            };
        } catch (error) {
            console.error('AI 익명화 오류:', error);
            // AI 실패 시 기본 정규식 익명화로 폴백
            return this.fallbackAnonymize(text);
        }
    }

    /**
     * AI를 사용한 개인정보 탐지
     */
    async detectPersonalInfoWithAI(text) {
        const prompt = `다음 텍스트에서 개인정보를 정확하게 탐지하여 JSON 형식으로 반환하세요.

텍스트:
"""
${text}
"""

탐지 대상:
1. names: 사람 이름 (예: 김철수, 박영희)
2. facilities: 시설명 (예: 행복요양원, 사랑복지센터) - 단, "노인보호전문기관" 같은 일반 명칭은 제외
3. phones: 전화번호 (예: 010-1234-5678, 02-123-4567)
4. addresses: 주소 (예: 서울시 강남구 테헤란로 123)
5. emails: 이메일 (예: example@email.com)
6. residentIds: 주민등록번호 (예: 123456-1234567)

반환 형식 (JSON):
{
  "names": ["김철수", "박영희"],
  "facilities": ["행복요양원"],
  "phones": ["010-1234-5678"],
  "addresses": ["서울시 강남구 테헤란로 123"],
  "emails": ["example@email.com"],
  "residentIds": ["123456-1234567"]
}

주의사항:
- 각 카테고리는 배열로 반환
- 해당 정보가 없으면 빈 배열 []
- 일반 명사나 역할명(위원장, 상담원 등)은 제외
- JSON만 반환하고 다른 설명은 제외`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: '당신은 개인정보 보호 전문가입니다. 텍스트에서 개인정보를 정확하게 탐지하여 JSON 형식으로만 반환하세요.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(response.choices[0].message.content);
            return {
                names: result.names || [],
                facilities: result.facilities || [],
                phones: result.phones || [],
                addresses: result.addresses || [],
                emails: result.emails || [],
                residentIds: result.residentIds || []
            };
        } catch (error) {
            console.error('AI 개인정보 탐지 실패:', error);
            throw error;
        }
    }

    /**
     * 정규식 특수문자 이스케이프
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * AI 실패 시 폴백 익명화 (기본 정규식)
     */
    fallbackAnonymize(text) {
        let result = text;

        // 주민등록번호
        const idPattern = /\d{6}[-\s]?\d{7}/g;
        result = result.replace(idPattern, (match) => {
            if (!this.mappings.ids.has(match)) {
                this.counters.id++;
                this.mappings.ids.set(match, `[주민번호_${this.counters.id}]`);
            }
            return this.mappings.ids.get(match);
        });

        // 전화번호
        const phonePattern = /\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/g;
        result = result.replace(phonePattern, (match) => {
            if (!this.mappings.phones.has(match)) {
                this.counters.phone++;
                this.mappings.phones.set(match, `[연락처_${this.counters.phone}]`);
            }
            return this.mappings.phones.get(match);
        });

        // 이메일
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        result = result.replace(emailPattern, (match) => {
            if (!this.mappings.emails.has(match)) {
                this.counters.email++;
                this.mappings.emails.set(match, `[이메일_${this.counters.email}]`);
            }
            return this.mappings.emails.get(match);
        });

        return {
            anonymizedText: result,
            mappings: this.getMappingsTable()
        };
    }

    /**
     * 매핑 테이블 반환
     */
    getMappingsTable() {
        const result = {};

        if (this.mappings.names.size > 0) {
            result.names = Array.from(this.mappings.names.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        if (this.mappings.facilities.size > 0) {
            result.facilities = Array.from(this.mappings.facilities.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        if (this.mappings.phones.size > 0) {
            result.phones = Array.from(this.mappings.phones.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        if (this.mappings.addresses.size > 0) {
            result.addresses = Array.from(this.mappings.addresses.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        if (this.mappings.emails.size > 0) {
            result.emails = Array.from(this.mappings.emails.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        if (this.mappings.ids.size > 0) {
            result.residentIds = Array.from(this.mappings.ids.entries()).map(([original, anonymized]) => ({
                original,
                anonymized
            }));
        }

        return result;
    }

    /**
     * 매핑 초기화
     */
    reset() {
        this.mappings = {
            names: new Map(),
            facilities: new Map(),
            phones: new Map(),
            addresses: new Map(),
            emails: new Map(),
            ids: new Map()
        };

        this.counters = {
            person: 0,
            facility: 0,
            phone: 0,
            address: 0,
            email: 0,
            id: 0
        };
    }
}

module.exports = new AnonymizationService();
