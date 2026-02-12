# 🚀 CaseNetAI 배포 가이드

## 📋 목차
1. [시스템 요구사항](#시스템-요구사항)
2. [초기 설정](#초기-설정)
3. [마이그레이션 실행](#마이그레이션-실행)
4. [System Admin 계정 생성](#system-admin-계정-생성)
5. [서버 시작](#서버-시작)
6. [사용자 온보딩 플로우](#사용자-온보딩-플로우)
7. [권한 구조](#권한-구조)
8. [트러블슈팅](#트러블슈팅)

---

## 🔧 시스템 요구사항

- **Node.js**: v14 이상
- **npm**: v6 이상
- **SQLite3**: v3.x
- **OAuth 인증 정보**:
  - 카카오 Client ID/Secret
  - 네이버 Client ID/Secret

---

## 📦 초기 설정

### 1. 환경 변수 설정 (`.env`)

```bash
# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# OAuth - Kakao
KAKAO_CLIENT_ID=your_kakao_client_id
KAKAO_CLIENT_SECRET=your_kakao_client_secret
KAKAO_CALLBACK_URL=https://yourdomain.com/api/auth/kakao/callback

# OAuth - Naver
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
NAVER_CALLBACK_URL=https://yourdomain.com/api/auth/naver/callback

# Server
PORT=3000
NODE_ENV=production

# CORS
ALLOWED_ORIGIN=https://yourdomain.com
```

### 2. 의존성 설치

```bash
npm install
```

---

## 🗄️ 마이그레이션 실행

### Step 1: DB 백업 (기존 시스템이 있는 경우)

```bash
# 자동 백업은 run-migration-006.js에 포함되어 있습니다
# 수동 백업을 원하는 경우:
cp database/casenetai.db database/casenetai_backup_$(date +%Y%m%d_%H%M%S).db
```

### Step 2: Migration 006 실행 (소셜 로그인 전용 시스템)

```bash
node database/run-migration-006.js
```

**예상 출력**:
```
📦 Migration 006: Social Login Only System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 DB 경로: /path/to/database/casenetai.db
💾 백업 생성 중...
✅ 백업 완료: /path/to/database/backup/casenetai_backup_20251210_120000.db

🔄 Migration 실행 중...
✅ users 테이블 재구성 완료 (소셜 로그인 전용)
✅ organizations 테이블 강화 완료
✅ organization_join_requests 테이블 생성 완료
✅ audit_logs 테이블 생성 완료

✅ Migration 006 완료!
```

---

## 👤 System Admin 계정 생성

### 중요: 최초 1회만 실행

```bash
node scripts/create-system-admin.js <oauth_provider> <oauth_id> <name> <email>
```

**예시**:
```bash
# 카카오로 생성
node scripts/create-system-admin.js kakao 123456789 "시스템관리자" admin@casenetai.com

# 네이버로 생성
node scripts/create-system-admin.js naver abc123def456 "홍길동" admin@casenetai.com
```

**OAuth ID 찾는 방법**:
1. 개발자 도구 열기 (F12)
2. 카카오/네이버 로그인 테스트
3. 콘솔에서 `profile.id` 확인
4. 해당 ID를 스크립트에 입력

**예상 출력**:
```
📁 DB 경로: /path/to/database/casenetai.db

🔧 System Admin 계정 생성 중...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OAuth Provider: kakao
  OAuth ID: 123456789
  이름: 시스템관리자
  이메일: admin@casenetai.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 신규 System Admin 계정 생성 중...

✅ System Admin 계정이 생성되었습니다!

📋 계정 정보:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  사용자 ID: 1
  OAuth Provider: kakao
  OAuth ID: 123456789
  이름: 시스템관리자
  이메일: admin@casenetai.com
  역할: system_admin
  무료 체험: 100회
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 다음 단계:
  1. 카카오 또는 네이버로 로그인
  2. System Admin 기능 접근 가능
  3. 기관 및 관리자 계정 관리

🔐 주의: System Admin은 최고 권한을 가지므로 신중히 관리하세요!
```

---

## 🏃 서버 시작

```bash
# Production 모드
npm start

# Development 모드
npm run dev
```

**서버 시작 확인**:
```
🚀 Server running on port 3000
📦 Database connected: /path/to/database/casenetai.db
🔐 OAuth providers configured: Kakao, Naver
✅ Ready for connections
```

---

## 🔄 사용자 온보딩 플로우

### 1️⃣ System Admin (최고 관리자)

```
1. System Admin 로그인 (카카오/네이버)
   └─> JWT Token 발급 (role: system_admin)

2. 기관 생성
   POST /api/system-admin/organizations
   {
     "name": "서울시청 노인복지과",
     "business_registration_number": "123-45-67890",
     "plan_type": "enterprise"
   }

3. 기관 관리자 지정
   POST /api/system-admin/users/:userId/role
   {
     "role": "org_admin",
     "organizationId": 1
   }
```

### 2️⃣ Organization Admin (기관 관리자)

```
1. Org Admin 로그인 (카카오/네이버)
   └─> JWT Token 발급 (role: org_admin, organizationId: 1)

2. 가입 요청 확인
   GET /api/org-admin/join-requests
   
3. 직원 승인
   POST /api/org-admin/join-requests/:id/approve
   
4. 직원 관리
   GET /api/org-admin/employees
   PUT /api/org-admin/employees/:id
   DELETE /api/org-admin/employees/:id
```

### 3️⃣ User (일반 직원)

```
1. 신규 사용자 로그인 (카카오/네이버)
   └─> 자동 회원가입 (role: user, is_approved: false)

2. 기관 목록 조회
   GET /api/join-requests/organizations

3. 가입 요청 제출
   POST /api/join-requests
   {
     "organizationId": 1,
     "message": "서울시청 노인복지과 소속입니다"
   }

4. 승인 대기
   GET /api/join-requests/my-requests
   
5. 승인 후 서비스 이용
   └─> is_approved: true로 변경
   └─> 모든 API 접근 가능
```

---

## 🎯 권한 구조

### 3-Tier Role-Based Access Control

```
┌─────────────────────────────────────────┐
│       System Admin (system_admin)       │
│  - 모든 기관 관리                        │
│  - 모든 사용자 권한 변경                 │
│  - 감사 로그 조회                        │
│  - 시스템 전체 설정                      │
└─────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌──────────────────┐ ┌──────────────────┐
│  Org Admin       │ │  Org Admin       │
│  (org_admin)     │ │  (org_admin)     │
│                  │ │                  │
│  조직 A          │ │  조직 B          │
│  - 소속 직원 관리│ │  - 소속 직원 관리│
│  - 가입 승인/거절│ │  - 가입 승인/거절│
│  - 조직 통계     │ │  - 조직 통계     │
└──────────────────┘ └──────────────────┘
        │                   │
   ┌────┴────┐         ┌────┴────┐
   ▼         ▼         ▼         ▼
┌─────┐  ┌─────┐   ┌─────┐  ┌─────┐
│User │  │User │   │User │  │User │
│(직원)│  │(직원)│   │(직원)│  │(직원)│
└─────┘  └─────┘   └─────┘  └─────┘
```

### 권한 매트릭스

| 기능 | System Admin | Org Admin | User |
|-----|-------------|-----------|------|
| 기관 생성/삭제 | ✅ | ❌ | ❌ |
| 사용자 역할 변경 | ✅ | ❌ | ❌ |
| 감사 로그 조회 | ✅ | ❌ | ❌ |
| 소속 직원 관리 | ✅ | ✅ (자기 조직만) | ❌ |
| 가입 요청 승인 | ✅ | ✅ (자기 조직만) | ❌ |
| 가입 요청 제출 | ❌ | ❌ | ✅ |
| 서비스 이용 | ✅ | ✅ | ✅ (승인 후) |

---

## 🔐 보안 특징

### 1. 소셜 로그인 전용
- ✅ 이메일/비밀번호 없음
- ✅ OAuth 2.0 (카카오, 네이버)
- ✅ 비밀번호 관리 부담 제거

### 2. 3단계 권한 체계
- ✅ System Admin: 최고 관리자
- ✅ Org Admin: 기관별 관리자
- ✅ User: 일반 직원

### 3. 승인 프로세스
- ✅ 신규 가입 시 `is_approved = false`
- ✅ Org Admin 승인 후 서비스 이용
- ✅ 무단 가입 방지

### 4. Audit Logging
- ✅ 모든 관리자 작업 기록
- ✅ 사용자 ID, 작업, 리소스, 시간 추적
- ✅ 보안 감사 추적 가능

### 5. Soft Delete
- ✅ 데이터 복구 가능
- ✅ `deleted_at` 타임스탬프
- ✅ 실수 방지

---

## 🛠️ API 엔드포인트 요약

### System Admin API (`/api/system-admin`)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/organizations` | 전체 기관 목록 | system_admin |
| POST | `/organizations` | 기관 생성 | system_admin |
| PUT | `/organizations/:id` | 기관 정보 수정 | system_admin |
| DELETE | `/organizations/:id` | 기관 삭제 (soft) | system_admin |
| GET | `/users` | 전체 사용자 목록 | system_admin |
| POST | `/users/:userId/role` | 사용자 역할 변경 | system_admin |
| GET | `/audit-logs` | 감사 로그 조회 | system_admin |

### Organization Admin API (`/api/org-admin`)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/employees` | 소속 직원 목록 | org_admin |
| GET | `/employees/:id` | 직원 상세 정보 | org_admin |
| PUT | `/employees/:id` | 직원 정보 수정 | org_admin |
| DELETE | `/employees/:id` | 직원 삭제 | org_admin |
| GET | `/join-requests` | 가입 요청 목록 | org_admin |
| POST | `/join-requests/:id/approve` | 가입 승인 | org_admin |
| POST | `/join-requests/:id/reject` | 가입 거절 | org_admin |
| GET | `/statistics` | 기관 통계 | org_admin |

### Join Requests API (`/api/join-requests`)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/organizations` | 기관 목록 조회 (공개) | 인증 필요 |
| POST | `/` | 가입 요청 생성 | 인증 필요 |
| GET | `/my-requests` | 내 가입 요청 목록 | 인증 필요 |
| DELETE | `/:id` | 가입 요청 취소 | 인증 필요 |

### Auth API (`/api/auth`)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/kakao` | 카카오 로그인 시작 | 공개 |
| GET | `/kakao/callback` | 카카오 콜백 | 공개 |
| GET | `/naver` | 네이버 로그인 시작 | 공개 |
| GET | `/naver/callback` | 네이버 콜백 | 공개 |
| GET | `/me` | 내 정보 조회 | 인증 필요 |
| POST | `/logout` | 로그아웃 | 인증 필요 |
| POST | `/refresh` | 토큰 갱신 | refresh token 필요 |

---

## ⚠️ 트러블슈팅

### 문제 1: "OAuth ID를 어떻게 얻나요?"

**해결책**:
1. 개발자 도구 (F12) 열기
2. Network 탭 활성화
3. 카카오/네이버 로그인 테스트
4. 콜백 URL 응답 확인
5. `profile.id` 값 복사

또는:

```javascript
// 임시로 passport.js에 추가
console.log('OAuth Profile:', JSON.stringify(profile, null, 2));
```

### 문제 2: "Migration 실행 시 오류 발생"

**해결책**:
```bash
# 1. 백업 확인
ls -la database/backup/

# 2. DB 복구
cp database/backup/casenetai_backup_YYYYMMDD_HHMMSS.db database/casenetai.db

# 3. Migration 재실행
node database/run-migration-006.js
```

### 문제 3: "System Admin 로그인 후 권한 없음"

**해결책**:
```bash
# DB에서 직접 확인
sqlite3 database/casenetai.db "SELECT id, name, role, oauth_provider, oauth_id FROM users WHERE role = 'system_admin';"

# 역할 수동 업데이트
sqlite3 database/casenetai.db "UPDATE users SET role = 'system_admin' WHERE id = 1;"
```

### 문제 4: "JWT 토큰에 role이 포함되지 않음"

**해결책**:
```bash
# 서버 재시작 필요
npm restart

# 로그아웃 후 재로그인
# → JWT 토큰 재발급으로 role 포함됨
```

### 문제 5: "가입 요청이 보이지 않음"

**확인 사항**:
```sql
-- 가입 요청 확인
SELECT * FROM organization_join_requests WHERE organization_id = 1;

-- 사용자 조직 ID 확인
SELECT id, name, organization_id, role FROM users WHERE id = <user_id>;
```

---

## 📚 관련 문서

- `SOCIAL_LOGIN_3TIER_SYSTEM.md` - 시스템 설계 문서
- `IMPLEMENTATION_COMPLETE.md` - 구현 완료 보고서
- `FINAL_SECURITY_VERIFICATION.md` - 보안 검증 보고서
- `database/migrations/006-social-login-only.sql` - DB 스키마
- `middleware/roleAuth.js` - 권한 미들웨어

---

## 🎯 체크리스트

배포 전 확인:

- [ ] `.env` 파일 설정 완료
- [ ] OAuth Client ID/Secret 설정
- [ ] DB Migration 006 실행 완료
- [ ] System Admin 계정 생성 완료
- [ ] 서버 정상 시작 확인
- [ ] 카카오 로그인 테스트
- [ ] 네이버 로그인 테스트
- [ ] System Admin 기능 테스트
- [ ] Org Admin 기능 테스트
- [ ] User 가입 플로우 테스트
- [ ] HTTPS 설정 (Production)
- [ ] CORS 설정 확인
- [ ] 백업 자동화 설정

---

## 🚀 배포 완료!

모든 단계를 완료하면 **CaseNetAI v2.0 (Social Login + 3-Tier Authorization)**이 정상적으로 배포됩니다.

**문의**: admin@casenetai.com
