# CaseNetAI 프로젝트 개선 지침

## 프로젝트 개요
- **목적**: 노인보호전문기관을 위한 AI 기반 업무 자동화 플랫폼
- **주요 기능**: 
  1. 음성 → 텍스트 변환 (노인학대 상담일지)
  2. 문서 비식별화 (개인정보 자동 익명화)
  3. 진술조서 자동 생성
  4. 사실확인서 생성 (음성 → Word 문서)
- **기술 스택**: Node.js/Express, Supabase PostgreSQL, OpenAI GPT-4, Google Gemini, Naver CLOVA
- **배포**: Vercel (도메인: casenetai.kr)

---

## 중요 제약사항 및 보안 원칙

### 1. 법적 문서의 정확성 (최우선)
- **AI Hallucination 절대 금지**: 진술조서, 사실확인서 등 법적 문서에서는 원본 음성/텍스트에 없는 내용을 절대 추가하지 말것
- **원본 충실성**: STT 결과를 그대로 사용하고, 오직 구조화/포맷팅만 수행
- **검증 가능성**: 모든 생성 문서는 원본 음성 파일과 대조 가능해야 함

### 2. 개인정보 보호
- **민감 정보**: 이름, 주민번호, 주소, 전화번호, 계좌번호 등은 철저히 비식별화
- **GDPR/개인정보보호법 준수**: 모든 데이터 처리는 법적 기준 충족
- **로그 관리**: 개인정보는 로그에 남기지 않음

### 3. 데이터베이스 (Supabase PostgreSQL)
- **테이블 구조 유지**: users, credits, statements, fact_confirmations 등
- **외래키 제약**: 기존 관계 유지
- **Check 제약**: oauth_provider는 'kakao', 'naver', 'google'만 허용

---

## 개선이 필요한 영역

### 우선순위 1: AI 정확성 개선
- [ ] 법적 문서 생성 시 Hallucination 방지 프롬프트 강화
- [ ] STT 정확도 향상 (CLOVA vs Whisper 비교)
- [ ] 생성된 문서에 대한 자동 검증 로직 추가

### 우선순위 2: 사용자 경험 개선
- [ ] 모바일 반응형 UI 개선
- [ ] 진행 상태 표시 (음성 변환, 문서 생성 중)
- [ ] 에러 메시지 사용자 친화적으로 개선

### 우선순위 3: 성능 최적화
- [ ] 대용량 음성 파일 처리 속도 개선
- [ ] Vercel Serverless Function 최적화
- [ ] 데이터베이스 쿼리 최적화

### 우선순위 4: 관리자 기능
- [ ] 관리자 대시보드 완성 (사용자 관리, 이력 조회)
- [ ] 크레딧 사용 통계 및 분석
- [ ] 시스템 모니터링 및 로그 관리

---

## 코딩 원칙

### 1. 보안
- **환경 변수**: 모든 API 키는 .env 파일 또는 Vercel 환경 변수로 관리
- **JWT 인증**: 모든 API 엔드포인트는 인증 필요
- **Rate Limiting**: 남용 방지를 위한 요청 제한
- **Input Validation**: 모든 사용자 입력은 검증 필수

### 2. 에러 처리
- **Try-Catch 블록**: 모든 비동기 함수는 에러 처리 필수
- **명확한 에러 메시지**: 사용자가 이해할 수 있는 한글 메시지
- **로깅**: 서버 에러는 상세히 로깅하되 개인정보는 제외

### 3. 코드 품질
- **주석**: 복잡한 로직은 한글 주석으로 설명
- **함수 분리**: 하나의 함수는 하나의 역할만
- **재사용성**: 공통 기능은 유틸리티 함수로 분리

### 4. Git 관리
- **커밋 메시지**: 명확한 한글 메시지 (예: "fix: 로그인 오류 수정")
- **브랜치 전략**: main (프로덕션), dev (개발), feature/* (기능 개발)

---

## 필수 환경 변수

```env
GOOGLE_AI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
CLOVA_CLIENT_ID=1umwh86goy
CLOVA_CLIENT_SECRET=T2JgPr...
JWT_SECRET=d9719e2505...
DATABASE_URL=postgresql://...
MASTER_PASSWORD=***REMOVED***
NODE_ENV=production
```

---

## 테스트 계정

- **관리자**: admin@casenetai.kr / Admin2026!
- **개발자**: dev@casenetai.kr / Dev2026!
- **테스트**: test@casenetai.kr / Test2026!

---

## 개선 시 주의사항

### 절대 하지 말 것:
1. ❌ 개인정보를 콘솔에 출력하거나 로그에 남기기
2. ❌ API 키를 코드에 직접 작성
3. ❌ 법적 문서에 원본에 없는 내용 추가
4. ❌ 데이터베이스 스키마를 임의로 변경
5. ❌ 기존 API 엔드포인트의 동작을 예고 없이 변경

### 권장사항:
1. ✅ 변경 전 기존 코드를 충분히 이해
2. ✅ 테스트 후 배포 (Vercel Preview 활용)
3. ✅ 중요 변경은 별도 브랜치에서 작업
4. ✅ 사용자 피드백 적극 반영
5. ✅ 성능 개선 시 벤치마크 측정

---

## 참고 자료

- **저장소**: https://github.com/YUNHYEONJUN/casenetai
- **프로덕션**: https://casenetai.kr
- **관리자 로그인**: https://casenetai.kr/login.html
- **Supabase 프로젝트**: casenetai-production
- **Vercel 프로젝트**: casenetai

---

## 개선 작업 시 프로세스

1. **이슈 확인**: 어떤 문제를 해결하려는지 명확히 정의
2. **코드 분석**: 관련 파일들을 읽고 현재 동작 방식 파악
3. **솔루션 설계**: 여러 방법 중 최선의 방법 선택
4. **구현**: 작은 단위로 나누어 개발
5. **테스트**: 로컬에서 충분히 테스트
6. **배포**: Vercel Preview로 확인 후 프로덕션 배포
7. **모니터링**: 배포 후 에러 로그 확인

---

## 질문이 필요한 경우

다음 사항은 반드시 사용자에게 확인:
- 데이터베이스 스키마 변경
- API 엔드포인트 추가/삭제/변경
- 새로운 외부 서비스 연동
- 크레딧 정책 변경
- 보안 관련 중요 결정

---

## 프로젝트 구조

```
casenetai/
├── server.js                 # 메인 서버 (Express)
├── package.json              # 의존성 관리
├── vercel.json              # Vercel 배포 설정
│
├── database/
│   └── db-postgres.js       # PostgreSQL 연결
│
├── routes/
│   ├── auth.js              # 인증 (로그인, 회원가입)
│   ├── payment.js           # 결제 및 크레딧
│   ├── admin.js             # 관리자 기능
│   └── ...
│
├── services/
│   ├── authService.js       # 인증 서비스
│   ├── anonymizationService.js  # 비식별화
│   ├── aiService.js         # AI 통합 (GPT-4, Gemini)
│   └── creditService.js     # 크레딧 관리
│
├── middleware/
│   ├── auth.js              # JWT 인증 미들웨어
│   └── ...
│
└── public/
    ├── index.html           # 메인 페이지
    ├── login.html           # 로그인
    ├── elderly-protection.html  # 상담일지
    ├── anonymization.html   # 문서 비식별화
    ├── statement-recording.html # 진술조서
    ├── fact-confirmation.html   # 사실확인서
    └── js/
        └── ...              # 클라이언트 JavaScript
```

---

## API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/kakao` - 카카오 로그인
- `POST /api/auth/naver` - 네이버 로그인
- `POST /api/auth/google` - 구글 로그인

### 서비스
- `POST /api/elderly-protection/transcribe` - 음성 → 텍스트
- `POST /api/anonymization/anonymize` - 문서 비식별화
- `POST /api/statement/generate` - 진술조서 생성
- `POST /api/fact-confirmation/create` - 사실확인서 생성

### 관리자
- `GET /api/admin/users` - 사용자 목록
- `PUT /api/admin/users/:id` - 사용자 정보 수정
- `GET /api/admin/credits` - 크레딧 내역

---

## 데이터베이스 스키마

### users 테이블
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oauth_provider VARCHAR(20) CHECK (oauth_provider IN ('kakao', 'naver', 'google')),
    oauth_id VARCHAR(255) NOT NULL,
    oauth_email VARCHAR(255) UNIQUE,
    oauth_nickname VARCHAR(255),
    profile_image TEXT,
    name VARCHAR(100),
    phone VARCHAR(20),
    organization_id UUID,
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(20) DEFAULT 'active',
    is_approved BOOLEAN DEFAULT false,
    service_type VARCHAR(50),
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP
);
```

### credits 테이블
```sql
CREATE TABLE credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    balance INTEGER DEFAULT 0,
    free_trial_count INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 최종 목표

**신뢰할 수 있고 안전한 노인보호 업무 자동화 플랫폼을 만들어, 
실제 현장에서 사용하는 전문가들이 업무 효율을 높이고 
더 많은 시간을 피해자 보호에 집중할 수 있도록 돕는 것**

---

## 연락처

- **개발자**: 윤현준
- **GitHub**: https://github.com/YUNHYEONJUN
- **이메일**: admin@casenetai.kr

---

**마지막 업데이트**: 2026-02-18
