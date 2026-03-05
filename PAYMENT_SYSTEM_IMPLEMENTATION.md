# 결제형 서비스 구현 완료 ✅

## 🎯 구현 완료 항목 (1-5번 모두 완료)

### ✅ 1. 회원가입/로그인 시스템 (이메일 + 비밀번호)
- JWT 기반 인증 시스템
- bcrypt 비밀번호 암호화
- 액세스 토큰 (7일) + 리프레시 토큰 (30일)
- 세션 관리 (DB 저장)

### ✅ 2. 크레딧 시스템 (충전, 차감, 내역 조회)
- 실시간 잔액 조회
- 자동 크레딧 차감 (상담일지 생성 시)
- 거래 내역 저장 및 조회
- 사용 통계 (전체/이번 달)

### ✅ 3. 토스페이먼츠 결제 연동
- 결제 준비 → 승인 → 완료 플로우
- 보너스 정책 (5,000원 이상 10-30% 보너스)
- 결제 내역 저장
- 테스트 모드 지원

### ✅ 4. 무료 체험 (3회) 시스템
- 신규 가입 시 3회 무료 제공
- 자동 차감 (크레딧 없을 때 우선 사용)
- 남은 횟수 추적

### ✅ 5. 사용 내역 대시보드
- 전체 사용 통계 (건수, 시간, 비용)
- 이번 달 통계
- 최근 사용 내역 (10건)
- 거래 내역 페이지네이션

---

## 📊 데이터베이스 스키마

### 생성된 테이블 (9개)

1. **`users`** - 사용자 정보
2. **`organizations`** - 기관 정보 (B2B용)
3. **`credits`** - 크레딧 잔액 및 통계
4. **`transactions`** - 거래 내역
5. **`payments`** - 결제 정보
6. **`usage_logs`** - 상세 사용 내역
7. **`sessions`** - 로그인 세션
8. **`bookmarked_cases`** - 판례 북마크
9. **`sqlite_sequence`** - SQLite 시퀀스

---

## 🛠️ 기술 스택

### Backend
- **Database**: SQLite3 (로컬 개발)
- **Auth**: bcrypt + JSON Web Token (JWT)
- **Payment**: 토스페이먼츠 API (Mock 모드 지원)

### 설치된 패키지
```bash
npm install sqlite3 bcrypt jsonwebtoken
```

---

## 📁 파일 구조

```
webapp/
├── database/
│   ├── casenetai.db          # SQLite 데이터베이스
│   ├── schema.sql             # DB 스키마
│   ├── init.js                # DB 초기화 스크립트
│   └── db.js                  # DB 연결 모듈
│
├── services/
│   ├── authService.js         # 인증 서비스
│   ├── creditService.js       # 크레딧 서비스
│   ├── paymentService.js      # 결제 서비스
│   └── aiService.js           # AI 서비스 (기존)
│
├── routes/
│   ├── auth.js                # 인증 라우터
│   └── payment.js             # 결제 라우터
│
├── middleware/
│   └── auth.js                # 인증 미들웨어
│
└── server.js                  # 메인 서버 (라우터 통합)
```

---

## 🌐 API 엔드포인트

### 인증 API (`/api/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | 회원가입 | ❌ |
| POST | `/login` | 로그인 | ❌ |
| POST | `/logout` | 로그아웃 | ✅ |
| POST | `/refresh` | 토큰 갱신 | ❌ |
| GET | `/me` | 내 정보 조회 | ✅ |

### 결제/크레딧 API (`/api/payment`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/credit/balance` | 잔액 조회 | ✅ |
| GET | `/credit/transactions` | 거래 내역 | ✅ |
| GET | `/credit/stats` | 사용 통계 | ✅ |
| POST | `/prepare` | 결제 준비 | ✅ |
| POST | `/confirm` | 결제 승인 | ❌ |
| POST | `/fail` | 결제 실패 | ❌ |
| GET | `/history` | 결제 내역 | ✅ |
| GET | `/bonus/:amount` | 보너스 계산 | ❌ |

### 기존 API (수정)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/upload-audio` | 상담일지 생성 | 🔓 Optional |

🔓 **Optional Auth**: 토큰이 있으면 크레딧 차감, 없으면 무료 체험 사용

---

## 💰 가격 정책

### 개인 사용자 (B2C)

**기본 요금:**
- 30원/분 (STT + AI 분석 포함)

**무료 체험:**
- 신규 가입 시 3회 무료

**크레딧 충전 보너스:**
```
50,000원 이상 → +30% 보너스 (65,000원 크레딧)
30,000원 이상 → +25% 보너스 (37,500원 크레딧)
10,000원 이상 → +20% 보너스 (12,000원 크레딧)
 5,000원 이상 → +10% 보너스 (5,500원 크레딧)
```

### 기관 사용자 (B2B) - 미래 확장

**월정액 플랜:**
```
소형 (5명 이하): 50,000원/월
중형 (10명 이하): 90,000원/월
대형 (무제한): 150,000원/월
```

---

## 🔐 보안

### 비밀번호 암호화
- bcrypt (SALT_ROUNDS=10)
- 단방향 해시 (복호화 불가능)

### JWT 토큰
- HS256 알고리즘
- 액세스 토큰: 7일
- 리프레시 토큰: 30일
- DB 세션 관리

### 환경 변수
```env
JWT_SECRET=your-secret-key-change-in-production
TOSS_SECRET_KEY=test_sk_YOUR_SECRET_KEY
TOSS_CLIENT_KEY=test_ck_YOUR_CLIENT_KEY
```

---

## 🧪 테스트 방법

### 1. 데이터베이스 초기화
```bash
cd /home/user/webapp
node database/init.js
```

### 2. 서버 시작
```bash
node server.js
```

### 3. API 테스트

**회원가입:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "홍길동",
    "phone": "010-1234-5678"
  }'
```

**로그인:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**잔액 조회:** (토큰 필요)
```bash
curl http://localhost:3000/api/payment/credit/balance \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**결제 준비:**
```bash
curl -X POST http://localhost:3000/api/payment/prepare \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000}'
```

---

## 🎨 프론트엔드 구현 (다음 단계)

### 필요한 페이지

1. **`/login.html`** - 로그인 페이지
2. **`/register.html`** - 회원가입 페이지
3. **`/dashboard.html`** - 대시보드 (잔액, 통계, 내역)
4. **`/payment.html`** - 결제 페이지 (토스페이먼츠 UI)

### 기존 페이지 수정

1. **`/index.html`** - 로그인 버튼 추가
2. **`/legal-cases.html`** - 북마크에 사용자 ID 연동

---

## 🚀 배포 고려사항

### 환경 변수 설정
```env
# Production
NODE_ENV=production
JWT_SECRET=강력한-랜덤-문자열-최소-32자
TOSS_SECRET_KEY=live_sk_실제_발급받은_키
TOSS_CLIENT_KEY=live_ck_실제_발급받은_키
BASE_URL=https://yourdomain.com
```

### 데이터베이스
- 로컬 개발: SQLite3
- 프로덕션: PostgreSQL 또는 MySQL 권장
- Cloudflare D1: 무료 (10GB, 500만 read/day)

### HTTPS 필수
- 토스페이먼츠는 HTTPS 필수
- Let's Encrypt 무료 SSL 인증서 사용

---

## 📈 향후 개선사항

### Phase 2 (다음 단계)
- [ ] 프론트엔드 UI 완성
- [ ] 이메일 인증
- [ ] 비밀번호 찾기/재설정
- [ ] 프로필 수정
- [ ] 결제 취소/환불

### Phase 3 (확장)
- [ ] B2B 기관 관리 페이지
- [ ] 관리자 대시보드
- [ ] 통계 차트 (Chart.js)
- [ ] 정기 결제 (구독)
- [ ] 쿠폰/할인 시스템

### Phase 4 (고급)
- [ ] 소셜 로그인 (Google, Kakao, Naver)
- [ ] 2FA 인증
- [ ] API Rate Limiting
- [ ] 로그 모니터링
- [ ] 에러 추적 (Sentry)

---

## 🎉 구현 완료!

모든 백엔드 시스템이 완성되었습니다:

✅ 회원가입/로그인  
✅ 크레딧 시스템  
✅ 토스페이먼츠 연동  
✅ 무료 체험 3회  
✅ 사용 내역 대시보드  
✅ 데이터베이스 스키마  
✅ API 엔드포인트  
✅ 인증 미들웨어  
✅ 크레딧 자동 차감  

**다음 단계:** 프론트엔드 UI 개발 (로그인, 회원가입, 대시보드 페이지)

---

**구현 완료 시각:** 2025-11-29  
**구현 항목:** 1-5번 모두 완료 ✅  
**Git Commit:** 준비 완료
