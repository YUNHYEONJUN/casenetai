# 🔐 CaseNetAI 보안 업데이트 Phase 2 완료 보고서

**업데이트 일시**: 2026-03-01 00:44 UTC  
**작업자**: AI Assistant + YUNHYEONJUN  
**Git 커밋**: `499f77e` (최종), `1338fbb` (메인 패치)

---

## ✅ 완료된 작업 요약

### 1. 파일 교체 및 추가 (8개 파일)

| 파일명 | 작업 | 변경 사항 |
|--------|------|----------|
| `services/authService.js` | 교체 | 비밀번호 강도 검증, password_hash 버그 수정, Refresh Token 전용 키 |
| `server.js` | 교체 | 인증 강화, Command Injection 차단, 파일 정리 자동화 |
| `create-test-admin.js` | 교체 | 하드코딩 비밀번호 완전 제거 → 환경변수 필수화 |
| `create-admin-postgres.js` | 교체 | 하드코딩 비밀번호 완전 제거 → 환경변수 필수화 |
| `ADMIN_ACCOUNTS_INFO.md` | 교체 | 평문 비밀번호 제거 → 환경변수 가이드로 전환 |
| `.gitignore` | 업데이트 | admin 스크립트, 보안 리포트, _env 파일 제외 |
| `CHANGELOG.md` | 신규 생성 | 전체 변경 내역 상세 문서화 |
| `_env.example` | 신규 생성 | 환경 변수 템플릿 (비밀번호 관리 가이드) |

---

## 🔴 CRITICAL 이슈 수정 (5개)

### C-4: authService 로그인/회원가입 버그 수정

**문제**: `password_hash` 컬럼이 SELECT/INSERT 쿼리에서 누락  
**영향**: 
- 로그인 불가 (password_hash를 가져오지 못함)
- 회원가입해도 비밀번호가 DB에 저장되지 않음

**수정**:
```javascript
// BEFORE (login)
const result = await db.query(
  'SELECT id, email, name, role FROM users WHERE email = $1',
  [email]
);

// AFTER (login)
const result = await db.query(
  'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
  [email]
);

// BEFORE (register)
const result = await db.query(
  'INSERT INTO users (email, name, role, is_email_verified, created_at, updated_at) ...'
);

// AFTER (register)
const result = await db.query(
  'INSERT INTO users (email, password_hash, name, role, is_email_verified, created_at, updated_at) ...',
  [email, hashedPassword, name, role, ...]
);
```

### C-5: Refresh Token 전용 Secret 분리

**문제**: JWT Access Token과 Refresh Token이 동일한 JWT_SECRET 사용  
**위험**: JWT_SECRET 유출 시 Refresh Token까지 모두 위조 가능

**수정**:
```javascript
// _env.example에 추가
REFRESH_TOKEN_SECRET=your_random_refresh_secret_key_here

// authService.js
const refreshToken = jwt.sign({ userId: user.id }, process.env.REFRESH_TOKEN_SECRET, {
  expiresIn: REFRESH_TOKEN_EXPIRES_IN
});

// 검증 시에도 REFRESH_TOKEN_SECRET 사용
const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
```

### C-2: 인증 누락 API 보호 (4개 엔드포인트)

**문제**: 중요 API가 인증 없이 접근 가능  
**수정된 엔드포인트**:
1. `POST /api/analyze-audio` - 오디오 분석 (크레딧 소비)
2. `POST /api/upload-audio` - 오디오 업로드
3. `POST /api/anonymize-text-compare` - 텍스트 익명화
4. `GET /api/download-word` - Word 문서 다운로드

```javascript
// BEFORE
app.post('/api/analyze-audio', optionalAuth, async (req, res) => {

// AFTER
app.post('/api/analyze-audio', authenticateToken, async (req, res) => {
```

### C-3: Command Injection 완전 차단

**문제**: `exec()`를 사용한 ffprobe 호출 (Shell Injection 취약)

**수정**: `execFile()`로 전환
```javascript
// BEFORE (위험)
const ffprobeCommand = `ffprobe -v error -show_entries format=duration ...`;
const { stdout } = await execAsync(ffprobeCommand);

// AFTER (안전)
const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  audioPath
]);
```

**차단된 공격 예시**:
```bash
# BEFORE: 이런 공격이 가능했음
filename="; rm -rf /; echo ".wav

# AFTER: execFile()은 인자를 배열로 받아 Shell을 거치지 않음 → 공격 원천 차단
```

---

## 🟠 HIGH 이슈 수정 (4개)

### H-2: 비밀번호 강도 검증 함수 추가

**추가된 함수**: `validatePassword(password)`

**검증 규칙**:
- ✅ 8자 이상, 128자 이하
- ✅ 대문자 1개 이상
- ✅ 소문자 1개 이상
- ✅ 숫자 1개 이상
- ✅ 특수문자 1개 이상 (`!@#$%^&*(),.?":{}|<>`)
- ✅ 연속 3자 동일 문자 금지

**예시**:
```javascript
validatePassword('Admin123!')   // ✅ 통과
validatePassword('admin123')    // ❌ 대문자, 특수문자 없음
validatePassword('Admin123!!!')  // ❌ '!'가 3번 연속
validatePassword('Pass1!')      // ❌ 8자 미만
```

### H-2: 이메일 형식 검증 함수 추가

**추가된 함수**: `validateEmail(email)`

**검증 규칁**:
- ✅ RFC 5322 표준 형식 (정규식)
- ✅ 최대 255자
- ✅ `@`와 도메인 필수

### H-6: registerWithRole() 보안 강화

**문제**: 임의 role 설정 가능 → 권한 상승 공격 위험

**수정**:
```javascript
// 허용 role 화이트리스트
const ALLOWED_ROLES = ['user', 'staff', 'admin', 'system_admin'];
if (!ALLOWED_ROLES.includes(role)) {
  throw new Error('Invalid role');
}

// 크레딧 상한 검증
const MAX_INITIAL_CREDITS = 1000000000; // 10억
if (initialCredits < 0 || initialCredits > MAX_INITIAL_CREDITS) {
  throw new Error('Invalid initial credits');
}
```

### H-1: 업로드 파일 자동 삭제

**문제**: 에러 발생 시 임시 파일 누적 → 디스크 부족

**수정**: `finally` 블록에서 무조건 삭제
```javascript
try {
  // 파일 처리
} catch (error) {
  // 에러 처리
} finally {
  // 성공/실패 무관하게 임시 파일 삭제
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }
}
```

---

## 🟡 MEDIUM 이슈 수정 (6개)

### M-2: 프로덕션 에러 메시지 숨김

```javascript
// BEFORE
res.status(500).json({ error: '서버 오류', details: error.message });

// AFTER
res.status(500).json({ 
  error: '서버 오류',
  ...(process.env.NODE_ENV === 'development' && { details: error.message })
});
```

### M-4: Vercel 호환 업로드 경로

```javascript
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp' : 'uploads';
```

### M-5: 만료 세션 자동 정리

```javascript
// 서버 시작 시 + 6시간마다
setInterval(async () => {
  const now = Date.now();
  sessionStore = sessionStore.filter(s => s.expiresAt > now);
}, 6 * 60 * 60 * 1000);
```

### M-Medium: Rate Limiter 실제 적용

- `loginLimiter` → `/api/auth/login`, `/api/auth/register`
- `anonymizationLimiter` → `/api/anonymize-text-compare`

### 비밀번호 하드코딩 제거

**create-test-admin.js**:
```javascript
// BEFORE
const ADMIN_PASSWORD = 'Admin2026!';

// AFTER
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD 환경변수가 설정되지 않았습니다');
  process.exit(1);
}
```

---

## 📁 신규 파일

### 1. CHANGELOG.md
- 전체 변경 내역 상세 문서화
- 이슈 ID, 심각도, 변경 내용을 표로 정리
- 배포 전 필수 작업 가이드

### 2. _env.example
- 환경 변수 템플릿
- 각 변수의 용도, 발급 방법 설명
- 비밀번호 관리 가이드

---

## 🚨 배포 전 필수 조치사항

### 1. Vercel 환경 변수 추가

**새로 추가해야 할 변수**:
```bash
# Refresh Token 전용 Secret 생성
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → 출력된 값을 Vercel에 REFRESH_TOKEN_SECRET로 등록

# 관리자 계정 비밀번호 (create-test-admin.js 실행용)
ADMIN_PASSWORD=강력한_비밀번호
DEV_PASSWORD=강력한_비밀번호
TEST_PASSWORD=강력한_비밀번호
```

**설정 경로**: https://vercel.com/dashboard → CaseNetAI → Settings → Environment Variables

### 2. 기존 관리자 비밀번호 즉시 변경

**이유**: 기존 하드코딩 비밀번호가 Git 이력에 남아있음

**방법 1: SQL로 직접 변경** (권장)
```sql
-- Supabase SQL Editor에서 실행
UPDATE users 
SET password_hash = crypt('새로운강력한비밀번호', gen_salt('bf', 12))
WHERE email IN ('admin@casenetai.kr', 'dev@casenetai.kr', 'test@casenetai.kr');
```

**방법 2: 스크립트 재실행**
```bash
ADMIN_PASSWORD=새비밀번호1 \
DEV_PASSWORD=새비밀번호2 \
TEST_PASSWORD=새비밀번호3 \
node create-test-admin.js
```

### 3. Supabase 데이터베이스 비밀번호 변경

**경로**: https://supabase.com/dashboard → Settings → Database → Reset Database Password

**변경 후**: 
1. 새 `DATABASE_URL` 복사
2. Vercel에서 `DATABASE_URL` 환경변수 업데이트
3. Vercel에서 재배포 트리거

### 4. Git 이력에서 노출된 비밀번호 완전 제거

**이미 완료된 작업**:
- `.env.production` 파일 제거 (107개 커밋에서)
- `git filter-branch` 실행 완료
- Force push 완료

**추가 권장 작업** (선택):
```bash
# BFG Repo-Cleaner 사용 (더 강력한 정리)
# https://rtyley.github.io/bfg-repo-cleaner/

# 1. BFG 다운로드
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 2. 하드코딩 비밀번호 치환
echo "Admin2026!" > passwords.txt
echo "Dev2026!" >> passwords.txt
echo "Test2026!" >> passwords.txt
java -jar bfg-1.14.0.jar --replace-text passwords.txt

# 3. Git 정리
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 4. Force push
git push --force
```

---

## 📊 변경 통계

### Git 커밋 요약
```
커밋 해시: 1338fbb
메시지: security: CRITICAL 보안 패치 - 로그인/인증/파일 관리 전면 개선

변경된 파일: 8개
추가: 499줄
삭제: 289줄
순증가: 210줄
```

### 파일별 변경 통계
| 파일 | 변경 유형 | 줄 수 변화 |
|------|----------|-----------|
| services/authService.js | 개선 | 449줄 (변경) |
| server.js | 개선 | 1,241줄 (변경) |
| create-test-admin.js | 재작성 | 131줄 (변경) |
| create-admin-postgres.js | 재작성 | 75줄 (변경) |
| ADMIN_ACCOUNTS_INFO.md | 재작성 | 81줄 (변경) |
| .gitignore | 업데이트 | +13줄 |
| CHANGELOG.md | 신규 | +112줄 |
| _env.example | 신규 | +53줄 |

---

## 🔒 보안 개선 요약

### 인증/인가
- ✅ 4개 API 엔드포인트에 인증 추가
- ✅ OAuth 전용 계정 비밀번호 로그인 차단
- ✅ Refresh Token 전용 Secret 분리

### 비밀번호 보안
- ✅ 강도 검증 함수 추가 (8자+대소문자+숫자+특수문자)
- ✅ 하드코딩 비밀번호 완전 제거
- ✅ 환경변수 필수화
- ✅ bcrypt salt rounds 10 → 12 상향

### 입력 검증
- ✅ 이메일 형식 검증
- ✅ role 화이트리스트
- ✅ 크레딧 상한 검증

### Command Injection 차단
- ✅ exec() → execFile() 전환 (2곳)
- ✅ Shell 우회 완전 차단

### 정보 노출 방지
- ✅ 프로덕션 에러 메시지 숨김
- ✅ 비밀번호 평문 노출 제거
- ✅ .gitignore 강화 (admin 스크립트, 보안 리포트)

### 리소스 관리
- ✅ 업로드 파일 자동 삭제
- ✅ 만료 세션 자동 정리

### Rate Limiting
- ✅ 로그인 API에 limiter 적용
- ✅ 익명화 API에 limiter 적용

---

## 🧪 테스트 시나리오

### 1. 로그인 기능 테스트

```bash
# Test 1: 올바른 비밀번호로 로그인
curl -X POST https://casenetai.kr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@casenetai.kr","password":"새로운비밀번호"}'
# 예상: { "token": "...", "refreshToken": "...", "user": {...} }

# Test 2: 잘못된 비밀번호
curl -X POST https://casenetai.kr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@casenetai.kr","password":"wrong"}'
# 예상: { "error": "이메일 또는 비밀번호가 올바르지 않습니다" }

# Test 3: OAuth 전용 계정으로 비밀번호 로그인 시도
curl -X POST https://casenetai.kr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"oauth@example.com","password":"anypassword"}'
# 예상: { "error": "이 계정은 소셜 로그인으로만 접근 가능합니다" }
```

### 2. 회원가입 비밀번호 강도 테스트

```bash
# Test 1: 약한 비밀번호
curl -X POST https://casenetai.kr/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"weak","name":"Test"}'
# 예상: { "error": "비밀번호는 8자 이상, 대소문자+숫자+특수문자 포함 필요" }

# Test 2: 강한 비밀번호
curl -X POST https://casenetai.kr/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Strong123!","name":"Test"}'
# 예상: { "token": "...", "user": {...} }
```

### 3. 인증 보호 API 테스트

```bash
# Test 1: 인증 없이 접근 시도
curl -X POST https://casenetai.kr/api/analyze-audio
# 예상: { "error": "인증이 필요합니다" }

# Test 2: 올바른 토큰으로 접근
curl -X POST https://casenetai.kr/api/analyze-audio \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "audio=@test.wav"
# 예상: 정상 처리
```

### 4. Command Injection 방어 테스트

```bash
# Test: 파일명에 특수문자 포함
curl -X POST https://casenetai.kr/api/upload-audio \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "audio=@'; rm -rf /;.wav"
# 예상: 파일명이 안전하게 처리되고 명령어 실행 차단
```

---

## 🚀 배포 확인

### 1. Vercel 배포 상태 확인
```
URL: https://vercel.com/dashboard
프로젝트: CaseNetAI
배포: Deployments 탭
최신 커밋: 499f77e (fix: .gitignore에 _env 파일 패턴 추가)
이전 커밋: 1338fbb (security: CRITICAL 보안 패치)

예상 시간: 3-4분
```

### 2. 환경 변수 확인
```
✅ DATABASE_URL
✅ JWT_SECRET
✅ REFRESH_TOKEN_SECRET (신규)
✅ GOOGLE_AI_API_KEY
✅ OPENAI_API_KEY
✅ CLOVA_CLIENT_ID
✅ CLOVA_CLIENT_SECRET
✅ MASTER_PASSWORD
✅ ADMIN_PASSWORD (신규)
✅ DEV_PASSWORD (신규)
✅ TEST_PASSWORD (신규)
```

### 3. 프론트엔드 동작 확인
```
1. https://casenetai.kr/login.html 접속
2. 새 비밀번호로 로그인 시도
3. 대시보드 접근 확인
4. 서비스 기능 테스트:
   - 오디오 업로드
   - STT 실행
   - 비식별화
   - 보고서 생성
   - Word 다운로드
```

---

## 📝 추가 권장 사항

### 단기 (1-2주 내)

1. **프론트엔드 수정**
   - `/api/analyze-audio` 호출 시 JWT 토큰 헤더 추가
   - `/api/upload-audio` 토큰 헤더 확인
   - `/api/download-word` 토큰 헤더 추가
   - `/api/anonymize-text-compare` 토큰 헤더 추가

2. **비밀번호 정책 공지**
   - 기존 사용자에게 비밀번호 변경 안내
   - 새 비밀번호 강도 요구사항 공지

3. **모니터링**
   - 로그인 실패 로그 확인
   - Rate Limit 도달 로그 확인
   - 파일 업로드 에러 모니터링

### 중기 (1-2개월 내)

1. **H-3: DB CHECK 제약 추가**
   ```sql
   ALTER TABLE users DROP CONSTRAINT users_oauth_provider_check;
   ALTER TABLE users ADD CONSTRAINT users_oauth_provider_check 
     CHECK (oauth_provider IN ('google', 'kakao', 'naver', 'local'));
   ```

2. **H-4: XSS 방어 강화**
   - `innerHTML` → `textContent` 전환
   - DOMPurify 라이브러리 도입

3. **M-1: 코드 모듈화**
   - server.js 1,200줄 → 라우트별 모듈 분리
   - controllers, services, middleware 디렉토리 구조

### 장기 (3-6개월 내)

1. **L-1: 불필요한 의존성 제거**
   - `sqlite3` 제거 (PostgreSQL만 사용)
   - `cheerio` 제거 (사용하지 않음)

2. **L-5: 구조화 로깅**
   - winston/pino 도입
   - JSON 포맷 로깅
   - 로그 수집 시스템 연동

---

## 🔗 관련 링크

- **GitHub 커밋**: https://github.com/YUNHYEONJUN/casenetai/commit/1338fbb
- **최종 커밋**: https://github.com/YUNHYEONJUN/casenetai/commit/499f77e
- **CHANGELOG**: https://github.com/YUNHYEONJUN/casenetai/blob/main/CHANGELOG.md
- **환경변수 템플릿**: https://github.com/YUNHYEONJUN/casenetai/blob/main/_env.example
- **Vercel 대시보드**: https://vercel.com/dashboard
- **Supabase 대시보드**: https://supabase.com/dashboard

---

## 📞 지원

문제 발생 시:
1. GitHub Issues: https://github.com/YUNHYEONJUN/casenetai/issues
2. Vercel Logs: https://vercel.com/dashboard → CaseNetAI → Logs
3. Supabase Logs: https://supabase.com/dashboard → Logs

---

## ✅ 체크리스트

### 즉시 완료 (현재)
- [x] authService.js 교체
- [x] server.js 교체
- [x] create-test-admin.js 교체
- [x] create-admin-postgres.js 교체
- [x] ADMIN_ACCOUNTS_INFO.md 교체
- [x] .gitignore 업데이트
- [x] CHANGELOG.md 생성
- [x] _env.example 생성
- [x] Git 커밋 및 푸시
- [x] _env.production 패턴 .gitignore 추가
- [x] 백업 파일 정리

### 사용자 액션 필요
- [ ] Vercel 환경변수 추가 (REFRESH_TOKEN_SECRET)
- [ ] Vercel 환경변수 추가 (ADMIN_PASSWORD, DEV_PASSWORD, TEST_PASSWORD)
- [ ] Supabase DB 비밀번호 변경
- [ ] Vercel DATABASE_URL 업데이트
- [ ] 관리자 계정 비밀번호 변경 (SQL 또는 스크립트)
- [ ] Vercel 배포 완료 확인
- [ ] 로그인 테스트
- [ ] 서비스 기능 테스트

### 프론트엔드 수정 (개발자)
- [ ] /api/analyze-audio 호출에 JWT 헤더 추가
- [ ] /api/upload-audio 토큰 헤더 확인
- [ ] /api/download-word 호출에 JWT 헤더 추가
- [ ] /api/anonymize-text-compare 호출에 JWT 헤더 추가

---

**보안 패치 Phase 2 완료**  
**다음 단계**: 사용자 액션 완료 후 Phase 3 (프론트엔드 XSS 방어, DB 제약, 코드 모듈화) 진행
