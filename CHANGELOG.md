# 🔧 CaseNetAI 보안 패치 변경 내역

**패치 일자**: 2026-02-28  
**수정 파일**: 7개  

---

## 📁 수정된 파일 및 변경 내용

### 1. `authService.js` (인증 서비스) — 핵심 수정

| 이슈 ID | 심각도 | 변경 내용 |
|---------|--------|----------|
| **C-4** | 🔴 Critical | `login()` SELECT 문에 `password_hash` 컬럼 추가 — **이전: 로그인 불가 버그** |
| **C-4+** | 🔴 Critical | `register()` INSERT 문에 `password_hash` 컬럼 추가 — **이전: 회원가입해도 비밀번호 미저장** |
| **C-4+** | 🔴 Critical | `registerWithRole()` INSERT 문에도 `password_hash` 컬럼 추가 |
| **C-5** | 🔴 Critical | Refresh Token에 `REFRESH_SECRET` 별도 키 사용 (생성/검증 모두) |
| **H-2** | 🟠 High | `validatePassword()` 함수 추가 (8자 이상, 대소문자/숫자/특수문자 필수) |
| **H-2** | 🟠 High | `validateEmail()` 함수 추가 (형식 검증, 길이 제한) |
| **H-6** | 🟠 High | `registerWithRole()`에 허용 역할 화이트리스트, 크레딧 상한 검증 추가 |
| - | - | OAuth 전용 계정의 비밀번호 로그인 시도 시 명확한 에러 메시지 |

### 2. `server.js` (메인 서버) — 보안/안정성 강화

| 이슈 ID | 심각도 | 변경 내용 |
|---------|--------|----------|
| **C-2** | 🔴 Critical | `/api/analyze-audio`에 `authenticateToken` 인증 추가 |
| **C-2** | 🔴 Critical | `/api/upload-audio`에서 `optionalAuth` → `authenticateToken` 변경 |
| **C-2** | 🔴 Critical | `/api/anonymize-text-compare`에 `authenticateToken` 인증 추가 |
| **C-2** | 🔴 Critical | `/api/download-word`에 `authenticateToken` 인증 추가 |
| **C-3** | 🔴 Critical | ffprobe 호출 2곳: `exec()` → `execFile()` 전환 (Command Injection 근본 차단) |
| **H-1** | 🟠 High | 업로드 파일 자동 삭제: `finally` 블록에서 성공/실패 무관 정리 |
| **M-2** | 🟡 Medium | 에러 응답에서 `details: error.message`를 production에서 숨김 |
| **M-4** | 🟡 Medium | Multer 저장 경로: production에서 `/tmp` 사용 (Vercel 호환) |
| **M-5** | 🟡 Medium | 서버 시작 시 만료 세션 정리 + 6시간 주기 자동 정리 |
| - | 🟡 Medium | `loginLimiter`를 `/api/auth/login`, `/api/auth/register`에 실제 적용 |
| - | 🟡 Medium | `anonymizationLimiter`를 익명화 API에 실제 적용 |

### 3. `create-test-admin.js` — 완전 재작성

- ❌ 이전: 비밀번호 `Admin2026!`, `Dev2026!`, `Test2026!` 하드코딩
- ✅ 이후: 환경 변수 `ADMIN_PASSWORD`, `DEV_PASSWORD`, `TEST_PASSWORD`에서만 읽음
- ✅ 비밀번호 미설정 시 명확한 에러 메시지 + 사용 예시 출력
- ✅ 비밀번호 강도 검증 내장
- ✅ salt rounds 12로 통일
- ✅ SSL 인증서 검증 환경별 분리
- ✅ UPSERT 방식 (기존 계정 안전하게 업데이트)

### 4. `create-admin-postgres.js` — 완전 재작성

- ❌ 이전: 기본 비밀번호 `admin123` 하드코딩, 비밀번호 콘솔 출력
- ✅ 이후: 환경 변수 필수, 비밀번호 미표시, 강도 검증

### 5. `ADMIN_ACCOUNTS_INFO.md` — 완전 재작성

- ❌ 이전: 모든 계정의 비밀번호가 평문으로 기록
- ✅ 이후: 비밀번호 없이 환경 변수 가이드만 포함

### 6. `_gitignore` — 보안 강화

- ✅ `create-admin*.js`, `create-test-admin.js` 제외 추가
- ✅ `*-report.json`, `critical-bugs.json` 등 보안 감사 파일 제외
- ✅ `test_document.txt` 제외

### 7. `_env.example` — 새 변수 추가

- ✅ `REFRESH_TOKEN_SECRET` 추가 (JWT와 별도)
- ✅ `ADMIN_PASSWORD`, `DEV_PASSWORD`, `TEST_PASSWORD` 추가
- ✅ `ADMIN_EMAIL`, `DEV_EMAIL`, `TEST_EMAIL` 추가

---

## 🚨 배포 전 필수 작업

### 1. 환경 변수 추가 (Vercel)
```
REFRESH_TOKEN_SECRET=(새로 생성: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. 모든 기존 비밀번호 즉시 변경
기존 하드코딩된 비밀번호(`Admin2026!`, `Dev2026!`, `Test2026!`)가 Git 이력에 남아있으므로:
1. DB에서 직접 모든 관리자 비밀번호 변경
2. 새 비밀번호로 `create-test-admin.js` 재실행
3. Git 이력 정리 (BFG Repo-Cleaner 사용 권장)

### 3. Git 이력 정리
```bash
# BFG Repo-Cleaner 사용
bfg --delete-files ADMIN_ACCOUNTS_INFO.md
bfg --delete-files create-test-admin.js  
bfg --replace-text passwords.txt  # 비밀번호 문자열 치환
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

### 4. 프론트엔드 수정 확인
인증이 추가된 API를 호출하는 프론트엔드 코드에서:
- `/api/analyze-audio` 호출 시 JWT 토큰 헤더 추가 필요
- `/api/upload-audio` 호출 시 JWT 토큰 헤더 추가 필요 (이미 적용되어 있을 수 있음)
- `/api/download-word` 호출 시 JWT 토큰 헤더 추가 필요
- `/api/anonymize-text-compare` 호출 시 JWT 토큰 헤더 추가 필요

---

## ⏳ 향후 추가 작업 (3단계)

아직 수정하지 않은 항목:
- [ ] H-3: DB CHECK 제약에 `'local'` 추가 (`ALTER TABLE users DROP CONSTRAINT ...; ADD CONSTRAINT ...`)
- [ ] H-4: 프론트엔드 `innerHTML` → `textContent`/DOMPurify 전환 (public/ 폴더 파일들)
- [ ] M-1: server.js 1,200줄을 라우트별 모듈로 분리
- [ ] L-1: `sqlite3`, `cheerio` 등 불필요한 의존성 제거
- [ ] L-5: `console.log` → winston/pino 구조화 로깅 전환
