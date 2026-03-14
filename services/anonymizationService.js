/**
 * 노인보호전문기관 문서 익명화 서비스
 * AI API 없이 규칙 기반으로 개인정보를 자동 탐지 및 익명화
 *
 * 주요 기능:
 * - 이름, 시설명, 연락처, 주소, 주민번호, 이메일 자동 탐지
 * - 동일 정보는 동일 익명 코드로 매핑
 * - 매핑 테이블 생성 (원본 ↔ 익명화)
 *
 * 동시성 안전: 모든 처리가 요청별 로컬 변수를 사용 (싱글턴 상태 공유 없음)
 */

class AnonymizationService {
    constructor() {
        // 한국 성씨 리스트 (상위 100개) - 불변 데이터이므로 공유 안전
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

        // 시설 관련 키워드 - 불변 데이터
        this.facilityKeywords = [
            '요양원', '요양병원', '복지관', '센터', '의원', '병원', '클리닉',
            '재가', '주간보호', '방문요양', '단기보호', '공동생활가정',
            '노인보호전문기관', '학대피해노인쉼터', '양로원', '실버타운',
            '케어', '홈', '하우스', '빌', '빌라', '아파트', '주공', 'APT',
            '어린이집', '유치원', '학교', '학원', '협회', '재단', '법인'
        ];
    }

    /**
     * 요청별 로컬 컨텍스트 생성
     */
    _createContext() {
        return {
            mappings: {
                names: new Map(),
                facilities: new Map(),
                phones: new Map(),
                addresses: new Map(),
                emails: new Map(),
                ids: new Map()
            },
            counters: {
                person: 0,
                facility: 0,
                phone: 0,
                address: 0,
                email: 0,
                id: 0
            }
        };
    }

    /**
     * 메인 익명화 함수 (동시성 안전)
     */
    anonymize(text) {
        if (!text) return { anonymizedText: '', mappings: {} };

        // 요청별 독립 컨텍스트 생성 (인스턴스 변수 사용 안 함)
        const ctx = this._createContext();

        let result = text;

        // 1. 주민등록번호 익명화 (가장 먼저)
        result = this._anonymizeResidentIds(result, ctx);

        // 2. 연락처 익명화
        result = this._anonymizePhones(result, ctx);

        // 3. 이메일 익명화
        result = this._anonymizeEmails(result, ctx);

        // 4. 주소 익명화
        result = this._anonymizeAddresses(result, ctx);

        // 5. 시설명 익명화
        result = this._anonymizeFacilities(result, ctx);

        // 6. 이름 익명화 (마지막)
        result = this._anonymizeNames(result, ctx);

        return {
            anonymizedText: result,
            mappings: this._getMappingsTable(ctx)
        };
    }

    // 하위 호환성: 기존 public 메서드 유지 (단독 호출 시)
    anonymizeResidentIds(text) { const ctx = this._createContext(); return this._anonymizeResidentIds(text, ctx); }
    anonymizePhones(text) { const ctx = this._createContext(); return this._anonymizePhones(text, ctx); }
    anonymizeEmails(text) { const ctx = this._createContext(); return this._anonymizeEmails(text, ctx); }
    anonymizeAddresses(text) { const ctx = this._createContext(); return this._anonymizeAddresses(text, ctx); }
    anonymizeFacilities(text) { const ctx = this._createContext(); return this._anonymizeFacilities(text, ctx); }
    anonymizeNames(text) { const ctx = this._createContext(); return this._anonymizeNames(text, ctx); }

    /**
     * 주민등록번호 탐지 및 익명화
     */
    _anonymizeResidentIds(text, ctx) {
        const patterns = [
            /\d{6}[-\s]?\d{7}/g,
            /\d{6}[-\s]?\d\*{6}/g,
            /\d{6}[-\s]?[1-4]\d{6}/g
        ];

        patterns.forEach(pattern => {
            text = text.replace(pattern, (match) => {
                if (!ctx.mappings.ids.has(match)) {
                    ctx.counters.id++;
                    ctx.mappings.ids.set(match, `[주민번호_${ctx.counters.id}]`);
                }
                return ctx.mappings.ids.get(match);
            });
        });

        return text;
    }

    /**
     * 연락처 탐지 및 익명화
     */
    _anonymizePhones(text, ctx) {
        const patterns = [
            /\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/g,
            /\d{4}[-\s]?\d{4}/g,
            /01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/g
        ];

        patterns.forEach(pattern => {
            text = text.replace(pattern, (match) => {
                const digits = match.replace(/[-\s]/g, '');
                if (digits.length >= 8 && digits.length <= 11) {
                    if (!ctx.mappings.phones.has(match)) {
                        ctx.counters.phone++;
                        ctx.mappings.phones.set(match, `[연락처_${ctx.counters.phone}]`);
                    }
                    return ctx.mappings.phones.get(match);
                }
                return match;
            });
        });

        return text;
    }

    /**
     * 이메일 탐지 및 익명화
     */
    _anonymizeEmails(text, ctx) {
        const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        return text.replace(pattern, (match) => {
            if (!ctx.mappings.emails.has(match)) {
                ctx.counters.email++;
                ctx.mappings.emails.set(match, `[이메일_${ctx.counters.email}]`);
            }
            return ctx.mappings.emails.get(match);
        });
    }

    /**
     * 주소 탐지 및 익명화
     */
    _anonymizeAddresses(text, ctx) {
        const roadPattern = /([가-힣]+[시도])\s+([가-힣]+[시군구])\s+([가-힣]+[읍면동로길])\s+\d+[-\d]*/g;
        const jibunPattern = /([가-힣]+[시도])\s+([가-힣]+[시군구])\s+([가-힣]+[읍면동리])\s+\d+[-\d]*/g;

        [roadPattern, jibunPattern].forEach(pattern => {
            text = text.replace(pattern, (match) => {
                if (!ctx.mappings.addresses.has(match)) {
                    ctx.counters.address++;
                    ctx.mappings.addresses.set(match, `[주소_${ctx.counters.address}]`);
                }
                return ctx.mappings.addresses.get(match);
            });
        });

        return text;
    }

    /**
     * 시설명 탐지 및 익명화
     */
    _anonymizeFacilities(text, ctx) {
        this.facilityKeywords.forEach(keyword => {
            const pattern = new RegExp(`[가-힣a-zA-Z0-9]{2,}${keyword}`, 'g');

            text = text.replace(pattern, (match) => {
                const commonFacilities = [
                    '노인보호전문기관', '아동보호전문기관', '장애인복지관',
                    '가정폭력상담소', '성폭력상담소', '정신건강복지센터',
                    '지역사회복지관', '종합사회복지관', '보건소'
                ];

                if (commonFacilities.includes(match)) {
                    return match;
                }

                if (!ctx.mappings.facilities.has(match)) {
                    ctx.counters.facility++;
                    ctx.mappings.facilities.set(match, `[시설_${ctx.counters.facility}]`);
                }
                return ctx.mappings.facilities.get(match);
            });
        });

        return text;
    }

    /**
     * 이름 탐지 및 익명화
     */
    _anonymizeNames(text, ctx) {
        const excludeWords = [
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
            '위원장', '사례판정', '피해자', '신고자', '행위자', '보호자', '상담원', '담당자',
            '팀장', '과장', '부장', '사장', '대표', '국장', '차장', '실장',
            '사례', '판정', '회의', '논의', '검토', '조사', '보고', '발표',
            '정회', '판례', '사건', '사고', '발생', '시작', '종료', '완료'
        ];

        const nameContextKeywords = [
            '씨', '님', '선생', '선생님',
            '어머니', '아버지', '할머니', '할아버지', '형님', '동생', '언니', '오빠',
            '위원장', '팀장', '상담원', '과장', '부장', '차장', '실장', '대리', '사원',
            '교수', '박사', '원장', '센터장', '국장',
            '씨의', '씨가', '씨는', '씨를', '씨에게', '씨와', '씨도',
            '님의', '님이', '님은', '님을', '님께', '님과',
            '은', '는', '이', '가', '의', '에게', '에게서', '와', '과', '를', '을',
            '도', '만', '로', '으로', '한테', '께서', '라고', '이라고'
        ];

        const nameCandidates = new Map();

        nameContextKeywords.forEach(keyword => {
            this.koreanSurnames.forEach(surname => {
                const pattern = new RegExp(`${surname}[가-힣]{2,3}\\s*${keyword}`, 'g');

                let match;
                while ((match = pattern.exec(text)) !== null) {
                    const fullMatch = match[0];
                    const fullName = fullMatch.replace(new RegExp(`\\s*${keyword}$`), '').trim();

                    if (!fullName || fullName.length < 3) continue;
                    if (excludeWords.includes(fullName)) continue;

                    const forbiddenNames = [
                        '위원장', '팀장', '과장', '부장', '차장', '실장', '국장', '센터장',
                        '상담원', '담당자', '관리자', '위원',
                        '피해자', '신고자', '행위자', '보호자',
                        '교수님', '박사님', '원장님'
                    ];

                    if (forbiddenNames.includes(fullName)) continue;

                    nameCandidates.set(fullName, (nameCandidates.get(fullName) || 0) + 3);
                }
            });
        });

        nameCandidates.forEach((count, name) => {
            if (count >= 3) {
                const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                text = text.replace(pattern, (match) => {
                    if (!ctx.mappings.names.has(match)) {
                        ctx.counters.person++;
                        ctx.mappings.names.set(match, `[인물_${ctx.counters.person}]`);
                    }
                    return ctx.mappings.names.get(match);
                });
            }
        });

        return text;
    }

    /**
     * 매핑 테이블 반환
     */
    _getMappingsTable(ctx) {
        const result = {};
        const categories = [
            ['names', 'names'],
            ['facilities', 'facilities'],
            ['phones', 'phones'],
            ['addresses', 'addresses'],
            ['emails', 'emails'],
            ['ids', 'residentIds']
        ];

        for (const [key, outputKey] of categories) {
            if (ctx.mappings[key].size > 0) {
                result[outputKey] = Array.from(ctx.mappings[key].entries()).map(([original, anonymized]) => ({
                    original,
                    anonymized
                }));
            }
        }

        return result;
    }

    // 하위 호환성: 기존 코드에서 getMappingsTable() 직접 호출하는 경우
    getMappingsTable() {
        return {};
    }

    reset() {
        // no-op: 더 이상 인스턴스 상태를 사용하지 않음
    }
}

module.exports = new AnonymizationService();
