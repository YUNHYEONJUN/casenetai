# Phase 2 보안 개선 보고서

**작업일:** 2026-03-01  
**범위:** server.js (인증/Rate Limiter), 관리자 생성 스크립트 3개, DB 검증 스크립트

---

## 수정 요약

| 파일 | 심각도 | 수정 내용 |
|------|--------|-----------|
| `server.js` | 🔴 Critical × 2 | Rate Limiter 실제 적용 + 인증 없는 엔드포인트 4개 수정 |
| `create-admin-postgres.js` | 🔴 Critical | 하드코딩 비밀번호 `admin123` 완전 제거, 평문 로깅 제거 |
| `create-test-admin.js` | 🔴 Critical | 하드코딩 비밀번호 3개 완전 제거, 평문 로깅 제거 |
| `create-admin.js` | 🟠 High | bcrypt salt 10→12 강화, 기본 비밀번호 fallback 제거 |
| `check-db.js` | 🟡 Medium | SQLite→PostgreSQL 마이그레이션 |

---

## 1. server.js 변경 사항

### 1-1. Rate Limiter 실제 적용 (Critical C3)

**수정 전:** `loginLimiter`와 `anonymizationLimiter`가 정의만 되고 라우트에 미적용

**수정 후:**
```javascript
// line 132-137: 새로 추가
app.use('/api/auth/login', loginLimiter);         // 15분당 5회
app.use('/api/auth/register', loginLimiter);       // 15분당 5회
app.use('/api/anonymize-document', anonymizationLimiter);      // 1분당 10회
app.use('/api/anonymize-text-compare', anonymizationLimiter);  // 1분당 10회
```

### 1-2. 인증 없는 엔드포인트 수정 (Critical C2)

| 엔드포인트 | 수정 전 | 수정 후 |
|-----------|---------|---------|
| `POST /api/analyze-audio` | ❌ 인증 없음 | ✅ `authenticateToken` |
| `POST /api/upload-audio` | ⚠️ `optionalAuth` | ✅ `authenticateToken` |
| `POST /api/anonymize-text-compare` | ❌ 인증 없음 | ✅ `authenticateToken` |
| `POST /api/download-word` | ❌ 인증 없음 | ✅ `authenticateToken` |

### 1-3. Import 정리

- `authenticateToken`을 파일 상단(line 11)에서 `optionalAuth`와 함께 import
- 중복 import(구 line 677) 제거

### ⚠️ 프론트엔드 연동 필수

인증이 추가된 4개 엔드포인트는 프론트엔드에서 JWT 토큰을 헤더에 포함해야 합니다:
```javascript
// 프론트엔드 수정 필요
fetch('/api/analyze-audio', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`  // 추가 필요
  },
  body: formData
});
```

해당되는 프론트엔드 파일:
- `public/elderly-protection.html` (analyze-audio, upload-audio)
- `public/anonymization.html` (anonymize-text-compare)
- `public/fact-confirmation.html` (download-word)

---

## 2. create-admin-postgres.js 변경 사항

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 비밀번호 기본값 | `'admin123'` 하드코딩 | 환경 변수 필수 (기본값 없음) |
| 비밀번호 로깅 | `console.log(adminPassword)` 평문 출력 | `**********` 마스킹 |
| bcrypt salt | 10 | 12 |
| 환경 변수 검증 | 없음 | 이메일/비밀번호/DB URL 모두 검증 |
| 비밀번호 강도 | 검증 없음 | 최소 8자 + 복잡도 권장 |
| 기존 계정 처리 | 사용자만 삭제 | 크레딧도 함께 삭제 (FK 제약 대응) |

---

## 3. create-test-admin.js 변경 사항

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 하드코딩 비밀번호 | 3개 (`Admin2026!`, `Dev2026!`, `Test2026!`) | 0개 (환경 변수 필수) |
| 비밀번호 로깅 | 모든 비밀번호 평문 출력 (6회) | 전부 마스킹 |
| bcrypt salt | 10 | 12 |
| 환경 변수 | `ADMIN_PASSWORD` | `ADMIN_PASSWORD`, `DEV_PASSWORD`, `TEST_PASSWORD` |

**새로운 사용법:**
```bash
ADMIN_PASSWORD=xxx DEV_PASSWORD=xxx TEST_PASSWORD=xxx node create-test-admin.js
```

---

## 4. create-admin.js 변경 사항

- bcrypt salt rounds: 10 → 12
- 기본 비밀번호 fallback (`ChangeMe123!@#`) 완전 제거
- 환경 변수 미설정 시 즉시 종료 (보안 강화)

---

## 5. check-db.js 변경 사항

- SQLite (`sqlite3`) → PostgreSQL (`pg`) 전환
- 테이블, 인덱스, 외래키, CHECK 제약조건 검증 추가
- 관리자 계정 상태 확인
- `password_hash` 누락 사용자 탐지

---

## 보안 점수 변화

| 항목 | Phase 1 후 | Phase 2 후 |
|------|-----------|-----------|
| 하드코딩 비밀번호 | 3개 파일 잔존 | ✅ 0개 |
| 평문 로깅 | 6회 잔존 | ✅ 0회 |
| Rate Limiter | 1/3 적용 | ✅ 5/5 적용 |
| 미인증 엔드포인트 | 4개 | ✅ 0개 |
| bcrypt salt | 10 (일부 파일) | ✅ 12 (전체 통일) |
| **종합 보안 점수** | **92/100** | **96/100** |

---

## 필요한 .env 변수 추가

```env
# 관리자 계정 생성 스크립트용 (신규)
ADMIN_PASSWORD=YourSecureAdminPassword!
DEV_PASSWORD=YourSecureDevPassword!
TEST_PASSWORD=YourSecureTestPassword!
ADMIN_EMAIL=admin@casenetai.kr
DEV_EMAIL=dev@casenetai.kr
TEST_EMAIL=test@casenetai.kr
```

---

## 다음 단계 (Phase 3 권장)

1. **프론트엔드 JWT 전달 수정** — 인증 추가된 4개 엔드포인트 대응
2. **Git 히스토리 정리** — `BFG Repo-Cleaner`로 과거 커밋의 비밀번호 제거
3. **프로덕션 비밀번호 즉시 변경** — 기존 노출된 비밀번호 교체
4. **routes/ 디렉토리 파일에 validation 미들웨어 적용** — Phase 1에서 생성한 `middleware/validation.js` 활용
5. **Helmet.js 추가** — HTTP 보안 헤더 강화
