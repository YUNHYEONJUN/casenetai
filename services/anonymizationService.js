/**
 * 노인보호전문기관 문서 익명화 서비스
 * AI API 없이 규칙 기반으로 개인정보를 자동 탐지 및 익명화
 * 
 * 주요 기능:
 * - 이름, 시설명, 연락처, 주소, 주민번호, 이메일 자동 탐지
 * - 동일 정보는 동일 익명 코드로 매핑
 * - 매핑 테이블 생성 (원본 ↔ 익명화)
 */

class AnonymizationService {
    constructor() {
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

        // 한국 성씨 리스트 (상위 100개)
        this.koreanSurnames = [
            '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
            '한', '오', '서', '신', '권', '황', '안', '송', '류', '전',
            '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심',
            '노', '하', '곽', '성', '차', '주', '우', '구', '나', '민',
            '진', '유', '지', '엄', '채', '원', '천', '방', '공', '현',
            '변', '염', '석', '선', '설', '마', '길', '연', '위', '표',
            '명', '기', '반', '라', '왕', '금', '옥', '육', '인', '맹',
            '제', '모', '탁', '국', '어', '은', '편', '용', '경', '봉',
            '피', '복', '목', '형', '두', '감', '음', '빙', '사', '온',
            '여', '부', '태', '가', '소', '종', '대', '당', '순', '곡'
        ];

        // 시설 관련 키워드
        this.facilityKeywords = [
            '요양원', '요양병원', '복지관', '센터', '의원', '병원', '클리닉',
            '재가', '주간보호', '방문요양', '단기보호', '공동생활가정',
            '노인보호전문기관', '학대피해노인쉼터', '양로원', '실버타운',
            '케어', '홈', '하우스', '빌', '빌라', '아파트', '주공', 'APT',
            '어린이집', '유치원', '학교', '학원', '협회', '재단', '법인'
        ];
    }

    /**
     * 메인 익명화 함수
     */
    anonymize(text) {
        if (!text) return { anonymizedText: '', mappings: {} };

        let result = text;

        // 1. 주민등록번호 익명화 (가장 먼저)
        result = this.anonymizeResidentIds(result);

        // 2. 연락처 익명화
        result = this.anonymizePhones(result);

        // 3. 이메일 익명화
        result = this.anonymizeEmails(result);

        // 4. 주소 익명화
        result = this.anonymizeAddresses(result);

        // 5. 시설명 익명화
        result = this.anonymizeFacilities(result);

        // 6. 이름 익명화 (마지막)
        result = this.anonymizeNames(result);

        return {
            anonymizedText: result,
            mappings: this.getMappingsTable()
        };
    }

    /**
     * 주민등록번호 탐지 및 익명화
     * 패턴: 000000-0000000, 000000-0******
     */
    anonymizeResidentIds(text) {
        const patterns = [
            /\d{6}[-\s]?\d{7}/g,           // 000000-0000000
            /\d{6}[-\s]?\d\*{6}/g,         // 000000-0******
            /\d{6}[-\s]?[1-4]\d{6}/g      // 000000-1234567 (뒷자리 1-4로 시작)
        ];

        patterns.forEach(pattern => {
            text = text.replace(pattern, (match) => {
                if (!this.mappings.ids.has(match)) {
                    this.counters.id++;
                    this.mappings.ids.set(match, `[주민번호_${this.counters.id}]`);
                }
                return this.mappings.ids.get(match);
            });
        });

        return text;
    }

    /**
     * 연락처 탐지 및 익명화
     * 패턴: 010-0000-0000, 02-000-0000 등
     */
    anonymizePhones(text) {
        const patterns = [
            /\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/g,  // 일반 전화
            /\d{4}[-\s]?\d{4}/g,                  // 지역번호 없는 경우
            /01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/g   // 휴대폰
        ];

        patterns.forEach(pattern => {
            text = text.replace(pattern, (match) => {
                // 숫자만 추출하여 유효성 검증
                const digits = match.replace(/[-\s]/g, '');
                if (digits.length >= 8 && digits.length <= 11) {
                    if (!this.mappings.phones.has(match)) {
                        this.counters.phone++;
                        this.mappings.phones.set(match, `[연락처_${this.counters.phone}]`);
                    }
                    return this.mappings.phones.get(match);
                }
                return match;
            });
        });

        return text;
    }

    /**
     * 이메일 탐지 및 익명화
     */
    anonymizeEmails(text) {
        const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        return text.replace(pattern, (match) => {
            if (!this.mappings.emails.has(match)) {
                this.counters.email++;
                this.mappings.emails.set(match, `[이메일_${this.counters.email}]`);
            }
            return this.mappings.emails.get(match);
        });
    }

    /**
     * 주소 탐지 및 익명화
     * 패턴: 도로명주소, 지번주소
     */
    anonymizeAddresses(text) {
        // 도로명주소 패턴
        const roadPattern = /([가-힣]+[시도])\s+([가-힣]+[시군구])\s+([가-힣]+[읍면동로길])\s+\d+[-\d]*/g;
        
        // 지번주소 패턴
        const jibunPattern = /([가-힣]+[시도])\s+([가-힣]+[시군구])\s+([가-힣]+[읍면동리])\s+\d+[-\d]*/g;

        [roadPattern, jibunPattern].forEach(pattern => {
            text = text.replace(pattern, (match) => {
                if (!this.mappings.addresses.has(match)) {
                    this.counters.address++;
                    this.mappings.addresses.set(match, `[주소_${this.counters.address}]`);
                }
                return this.mappings.addresses.get(match);
            });
        });

        return text;
    }

    /**
     * 시설명 탐지 및 익명화
     */
    anonymizeFacilities(text) {
        // 시설 키워드를 포함하는 명칭 탐지
        this.facilityKeywords.forEach(keyword => {
            // "OO요양원", "행복복지관" 등의 패턴 (앞에 2글자 이상)
            const pattern = new RegExp(`[가-힣a-zA-Z0-9]{2,}${keyword}`, 'g');
            
            text = text.replace(pattern, (match) => {
                // "노인보호전문기관" 같은 일반 명칭은 제외
                const commonFacilities = [
                    '노인보호전문기관', '아동보호전문기관', '장애인복지관',
                    '가정폭력상담소', '성폭력상담소', '정신건강복지센터',
                    '지역사회복지관', '종합사회복지관', '보건소'
                ];
                
                if (commonFacilities.includes(match)) {
                    return match;
                }
                
                if (!this.mappings.facilities.has(match)) {
                    this.counters.facility++;
                    this.mappings.facilities.set(match, `[시설_${this.counters.facility}]`);
                }
                return this.mappings.facilities.get(match);
            });
        });

        return text;
    }

    /**
     * 이름 탐지 및 익명화
     * 한국 성씨 + 2-3자 이름 패턴 (문맥 기반)
     */
    anonymizeNames(text) {
        // 제외할 일반 명사 및 단어 목록 (대폭 확대)
        const excludeWords = [
            // 일반 명사
            '김치', '이상', '박사', '최고', '정부', '강남', '강북', '강서', '강동',
            '정보', '정리', '정도', '정신', '정서', '정황', '정정', '정책', '정의', '정기', '정중', '정당', '정면',
            '기관', '기준', '기록', '기간', '기타', '기능', '기회', '기초', '기술', '기대', '기본',
            '유형', '유지', '유무', '유보', '유사', '유의', '유일', '유효', '유예', '유리',
            '상황', '상태', '상담', '상식', '상관', '상승', '상하', '상호', '상당', '상반',
            '관계', '관찰', '관리', '관련', '관점', '관여', '관심', '관례', '관할',
            '진행', '진술', '진단', '진료', '진입', '진출', '진실', '진정',
            '성명', '성별', '성향', '성격', '성과', '성실', '성장', '성인', '성질',
            '위원', '위험', '위치', '위주', '위법', '위임', '위해', '위원장',
            '차별', '차이', '차단', '차선', '차후', '차원', '차례', '차량',
            '안전', '안정', '안내', '안심', '안정', '안과',
            '전문', '전체', '전반', '전혀', '전달', '전략', '전환', '전망', '전개', '전제', '전향',
            '최종', '최근', '최대', '최소', '최적', '최우', '최선', '최상',
            '한국', '한계', '한번', '한시', '한참', '한편',
            '신고', '신청', '신체', '신속', '신규', '신념', '신뢰', '신경',
            '고령', '고통', '고혈압', '고의', '고려', '고민', '고객',
            '조사', '조치', '조절', '조건', '조정', '조직', '조례', '조회',
            '의료', '의견', '의심', '의식', '의뢰', '의무', '의미', '의도', '의사', '의논', '의존',
            '행위', '행정', '행동', '행사', '행방',
            '방문', '방치', '방법', '방식', '방향', '방안', '방지', '방면', '방침',
            '문의', '문서', '문제', '문자', '문화', '문항', '문안', '문구',
            '서비스', '서울', '서면', '서류', '서로', '서쪽',
            '주소', '주민', '주요', '주장', '주체', '주의', '주제', '주변', '주차', '주장',
            '원인', '원칙', '원본', '원래', '원칙',
            '현장', '현재', '현황', '현상', '현실', '현금',
            '변화', '변경', '변동', '변경', '변명', '변호사',
            '경우', '경제', '경로', '경험', '경과', '경력', '경향', '경비', '경쟁',
            '가능', '가족', '가정', '가입', '가해', '가치', '가장',
            '소속', '소견', '소통', '소요', '소송', '소개', '소지',
            '대상', '대응', '대처', '대화', '대책', '대표', '대한', '대비', '대여',
            '본인', '본원', '본부', '본래', '본질',
            '용어', '용도', '용량', '용기', '용서',
            '형태', '형식', '형편', '형제', '형성', '형사',
            '감염', '감소', '감사', '감독', '감정',
            '심각', '심리', '심의', '심판', '심사', '심야',
            '노인', '노력', '노출', '노후', '노선',
            '내용', '내담', '내부', '내역', '내과',
            '금액', '금지', '금융', '금전',
            '표시', '표현', '표준', '표정',
            '명확', '명단', '명칭', '명령', '명예',
            '반응', '반드시', '반대', '반복', '반환', '반성', '반영',
            '왕래', '왕족',
            '맹세', '맹인',
            '제공', '제출', '제한', '제외', '제도', '제안', '제거', '제작', '제시', '제품', '제재',
            '모니터링', '모집', '모형', '모임', '모습', '모두',
            '탁상', '탁월',
            '어려움', '어르신', '어린이',
            '편의', '편차', '편집', '편견', '편지',
            '경찰', '경비', '경력',
            '복지', '복용', '복습', '복귀',
            '피해', '피의', '피부',
            '감정', '감상',
            '인정', '인물', '인력', '인근', '인식', '인간', '인구', '인사', '인터넷',
            '맹목', '맹견',
            '태도', '태만', '태풍', '태평',
            '순서', '순간', '순위', '순조', '순수', '순환', '순찰',
            '곡선', '곡물', '곡식',
            // 복합어 및 직책
            '위원장', '사례판정', '피해자', '신고자', '행위자', '보호자', '상담원', '담당자',
            '팀장', '과장', '부장', '사장', '대표', '국장', '차장', '실장',
            // 학대 관련 용어
            '사례', '판정', '회의', '논의', '검토', '조사', '보고', '발표',
            '정회', '판례', '사건', '사고', '발생', '시작', '종료', '완료'
        ];

        // 이름으로 판단하기 위한 문맥 키워드
        const nameContextKeywords = [
            // 안전한 호칭
            '씨', '님', '선생', '선생님',
            // 가족 관계
            '어머니', '아버지', '할머니', '할아버지', '형님', '동생', '언니', '오빠',
            // 직책 (suffix 검증과 함께 사용)
            '위원장', '팀장', '상담원', '과장', '부장', '차장', '실장', '대리', '사원',
            '교수', '박사', '원장', '센터장', '국장',
            // 조사 포함 호칭
            '씨의', '씨가', '씨는', '씨를', '씨에게', '씨와', '씨도',
            '님의', '님이', '님은', '님을', '님께', '님과'
        ];

        // 이름 후보를 먼저 수집
        const nameCandidates = new Map();
        
        // 먼저 명확한 이름 패턴 찾기 (문맥 키워드와 함께)
        nameContextKeywords.forEach(keyword => {
            this.koreanSurnames.forEach(surname => {
                // [이름] + [키워드] 패턴
                // 예: "김철수 씨", "박영희 팀장"
                const pattern = new RegExp(`${surname}[가-힣]{2,3}\\s*${keyword}`, 'g');
                
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    // 전체 매치에서 키워드 부분 제거하여 이름만 추출
                    const fullMatch = match[0];
                    const fullName = fullMatch.replace(new RegExp(`\\s*${keyword}$`), '').trim();
                    
                    // 빈 문자열 제외
                    if (!fullName || fullName.length < 3) {
                        continue;
                    }
                    
                    // 일반 명사 제외
                    if (excludeWords.includes(fullName)) {
                        continue;
                    }
                    
                    // 추가 검증: 이름이 복합 직책명이나 역할명인 경우 제외
                    // 단, 일반적인 3글자 이름은 허용
                    const forbiddenNames = [
                        '위원장', '팀장', '과장', '부장', '차장', '실장', '국장', '센터장',
                        '상담원', '담당자', '관리자', '위원', 
                        '피해자', '신고자', '행위자', '보호자',
                        '교수님', '박사님', '원장님'
                    ];
                    
                    if (forbiddenNames.includes(fullName)) {
                        continue;
                    }
                    
                    // 문맥 키워드와 함께 발견되었으므로 확실한 이름
                    nameCandidates.set(fullName, (nameCandidates.get(fullName) || 0) + 3);
                }
            });
        });

        // 확실한 이름만 익명화 (문맥 키워드와 함께 발견된 경우만)
        // count >= 3: 문맥 키워드와 함께 발견된 경우
        nameCandidates.forEach((count, name) => {
            if (count >= 3) {
                // 전체 텍스트에서 해당 이름 모두 익명화
                const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                text = text.replace(pattern, (match) => {
                    if (!this.mappings.names.has(match)) {
                        this.counters.person++;
                        this.mappings.names.set(match, `[인물_${this.counters.person}]`);
                    }
                    return this.mappings.names.get(match);
                });
            }
        });

        return text;
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
