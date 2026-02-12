# 🔐 소셜 로그인 + 3단계 권한 시스템 구현

## 📋 개요

**목적**: 이메일/비밀번호 인증 제거, 소셜 로그인 전용 + 3단계 계층적 권한 관리 시스템 구축

### 🎯 핵심 요구사항

1. **소셜 로그인 전용**
   - 카카오, 네이버 OAuth 로그인만 지원
   - 이메일/비밀번호 인증 완전 제거

2. **3단계 권한 구조**
   - **System Admin** (최고 관리자): 기관 및 기관 관리자 관리
   - **Organization Admin** (기관 관리자): 소속 직원 관리
   - **User** (일반 사용자): 서비스 이용

---

## ✅ 구현 완료 사항

### 1. DB Migration (`006-social-login-only.sql`) ✅

#### Users 테이블 재구성
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- OAuth 정보 (필수)
    oauth_provider TEXT NOT NULL,           -- 'kakao', 'naver', 'google'
    oauth_id TEXT NOT NULL,                 -- OAuth ID
    oauth_email TEXT,                       -- OAuth 이메일
    oauth_nickname TEXT,
    profile_image TEXT,
    
    -- 기본 정보
    name TEXT NOT NULL,
    phone TEXT,
    
    -- 조직 및 권한
    organization_id INTEGER,
    role TEXT DEFAULT 'user',               -- 'system_admin', 'org_admin', 'user'
    
    -- 계정 상태
    status TEXT DEFAULT 'active',           -- 'active', 'suspended', 'deleted'
    is_approved INTEGER DEFAULT 0,          -- 기관 가입 승인 여부
    
    UNIQUE (oauth_provider, oauth_id),
    CHECK (role IN ('system_admin', 'org_admin', 'user'))
);
```

#### 신규 테이블

1. **organization_join_requests**: 기관 가입 요청 관리
2. **audit_logs**: 관리자 행위 감사 로그

#### Organizations 테이블 강화
- `created_by_admin_id`: 기관 생성자 추적
- `status`: 기관 상태 관리

---

### 2. 3단계 권한 미들웨어 (`middleware/roleAuth.js`) ✅

#### 구현된 미들웨어

| 미들웨어 | 설명 | 대상 |
|---------|------|------|
| `requireSystemAdmin` | 시스템 관리자 전용 | system_admin |
| `requireOrgAdmin` | 기관 관리자 이상 | system_admin + org_admin |
| `requireOwnOrgAdmin` | 자기 기관만 접근 | org_admin (자기 기관만) |
| `requireUser` | 로그인 사용자 | 모든 로그인 사용자 |
| `requireOrganizationMember` | 기관 소속 + 승인됨 | 승인된 기관 직원 |
| `requireSelfOrAdmin` | 본인 또는 관리자 | 자신 or 관리자 |

#### 권한 계층 구조

```
system_admin (최고 관리자)
    ├─ 모든 기관 및 사용자 관리
    ├─ 기관 생성/수정/삭제
    └─ 기관 관리자 지정

org_admin (기관 관리자)
    ├─ 자기 기관의 직원 관리
    ├─ 직원 가입 승인/거부
    └─ 직원 역할 변경

user (일반 사용자)
    └─ 서비스 이용
```

---

### 3. System Admin API (`routes/system-admin.js`) ✅

#### 기관 관리 API

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/system-admin/organizations` | 기관 목록 조회 | system_admin |
| POST | `/api/system-admin/organizations` | 기관 생성 + 관리자 지정 | system_admin |
| PUT | `/api/system-admin/organizations/:id` | 기관 정보 수정 | system_admin |
| DELETE | `/api/system-admin/organizations/:id` | 기관 삭제 (soft) | system_admin |

#### 사용자 관리 API

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/system-admin/users` | 전체 사용자 조회 | system_admin |
| PUT | `/api/system-admin/users/:id/role` | 사용자 권한 변경 | system_admin |

#### 감사 로그 API

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/system-admin/audit-logs` | 감사 로그 조회 | system_admin |

#### 주요 기능

1. **기관 생성 시 관리자 자동 지정**
   ```javascript
   POST /api/system-admin/organizations
   {
     "name": "서울시니어복지센터",
     "admin_user_id": 123  // 이 사용자를 org_admin으로 지정
   }
   ```

2. **사용자 권한 변경**
   ```javascript
   PUT /api/system-admin/users/123/role
   {
     "role": "org_admin",
     "organization_id": 5
   }
   ```

3. **감사 로그 자동 기록**
   - 모든 관리자 행위 추적
   - IP, User-Agent 저장
   - 변경 내용 상세 기록

---

## 🚧 진행 중 / 필요한 추가 작업

### 1. Organization Admin API (필요)

기관 관리자가 자기 기관의 직원을 관리하는 API:

```javascript
// routes/org-admin.js
GET    /api/org-admin/employees           // 소속 직원 목록
POST   /api/org-admin/employees/invite    // 직원 초대
PUT    /api/org-admin/employees/:id       // 직원 정보 수정
DELETE /api/org-admin/employees/:id       // 직원 제거

GET    /api/org-admin/join-requests       // 가입 요청 목록
PUT    /api/org-admin/join-requests/:id/approve   // 가입 승인
PUT    /api/org-admin/join-requests/:id/reject    // 가입 거부
```

### 2. 소셜 로그인 플로우 수정

기존 Passport.js 전략 수정 필요:

```javascript
// config/passport.js
// 카카오 로그인 시:
// 1. 신규 사용자 → role='user', organization_id=NULL, is_approved=0
// 2. 기존 사용자 → 기존 정보 유지

// 회원가입 후 플로우:
// 1. 개인 사용자로 시작
// 2. 기관 가입 요청 생성 가능
// 3. org_admin이 승인 → is_approved=1
```

### 3. 기존 이메일/비밀번호 인증 제거

```javascript
// routes/auth.js
// 제거할 엔드포인트:
// - POST /api/auth/register
// - POST /api/auth/login

// 유지할 엔드포인트:
// - GET  /api/auth/me
// - POST /api/auth/logout
// - GET  /api/auth/kakao (OAuth)
// - GET  /api/auth/naver (OAuth)
```

### 4. UI 구현 (선택사항)

- System Admin 대시보드
- Organization Admin 대시보드
- 기관 가입 요청 UI

---

## 🔄 마이그레이션 절차

### 1. DB Migration 실행

```bash
# 백업 먼저!
cp database/casenetai.db database/casenetai_backup_$(date +%Y%m%d).db

# Migration 실행
node database/run-migration-006.js
```

### 2. 최초 System Admin 생성

```javascript
// create-system-admin.js (신규 생성 필요)
const { getDB } = require('./database/db');

async function createSystemAdmin() {
  const db = getDB();
  
  // 이미 존재하는 OAuth 사용자를 system_admin으로 승격
  await db.run(`
    UPDATE users 
    SET role = 'system_admin', 
        status = 'active',
        is_approved = 1
    WHERE id = 1  -- 또는 특정 사용자 ID
  `);
  
  console.log('✅ System Admin 생성 완료');
}
```

### 3. 기존 사용자 마이그레이션

- OAuth 사용자만 마이그레이션됨
- 이메일/비밀번호 사용자는 삭제됨 (주의!)

---

## 📊 권한 시나리오 예시

### 시나리오 1: 새 기관 생성

1. **System Admin**: 기관 생성 + 기관 관리자 지정
   ```
   POST /api/system-admin/organizations
   {
     "name": "부산노인복지관",
     "admin_user_id": 456
   }
   ```

2. **결과**:
   - 기관 생성 (ID: 10)
   - 사용자 456 → role='org_admin', organization_id=10, is_approved=1

### 시나리오 2: 직원 가입

1. **User**: 카카오 로그인 → role='user', organization_id=NULL
2. **User**: 기관 가입 요청 생성
   ```
   POST /api/join-requests
   {
     "organization_id": 10,
     "message": "부산노인복지관 사회복지사입니다"
   }
   ```

3. **Org Admin**: 가입 요청 승인
   ```
   PUT /api/org-admin/join-requests/123/approve
   ```

4. **결과**:
   - User → organization_id=10, is_approved=1

### 시나리오 3: 권한 확인

```javascript
// System Admin: 모든 기관 접근 가능
GET /api/system-admin/organizations
✅ 성공

// Org Admin: 자기 기관만 접근
GET /api/org-admin/employees
✅ 성공 (자기 기관만)

GET /api/system-admin/organizations
❌ 403 Forbidden (권한 없음)

// User: 서비스만 이용 가능
GET /api/analyze-audio
✅ 성공 (기관 승인된 경우)

GET /api/org-admin/employees
❌ 403 Forbidden (권한 없음)
```

---

## 🔐 보안 강화 사항

### 1. 감사 로그

모든 관리자 행위 자동 기록:
- 누가 (user_id, user_role)
- 무엇을 (action, resource_type, resource_id)
- 언제 (created_at)
- 어디서 (ip_address, user_agent)

### 2. Soft Delete

데이터 복구 가능성을 위한 soft delete:
- 기관 삭제 → status='deleted'
- 사용자 비활성화 → status='suspended'

### 3. 승인 프로세스

기관 가입 시 2단계 승인:
1. 사용자 가입 요청 생성
2. Org Admin 승인 → is_approved=1

---

## 📝 TODO: 추가 개발 필요 사항

### 긴급 (High Priority)

- [ ] `routes/org-admin.js` 구현
- [ ] `create-system-admin.js` 생성
- [ ] `database/run-migration-006.js` 생성
- [ ] Passport.js OAuth 전략 수정

### 중요 (Medium Priority)

- [ ] 기존 `/api/auth/register`, `/api/auth/login` 제거
- [ ] 기관 가입 요청 API 구현
- [ ] 사용자 가입 플로우 UI 수정

### 선택 (Low Priority)

- [ ] System Admin 대시보드 UI
- [ ] Organization Admin 대시보드 UI
- [ ] 감사 로그 조회 UI

---

## 🎯 최종 목표 시스템 구조

```
┌─────────────────────────────────────────────┐
│          System Administrator               │
│  (최고 관리자 - 전체 시스템 관리)               │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌──────▼────────┐
│ Organization A │  │ Organization B │
│  (기관 A)       │  │  (기관 B)      │
└───────┬────────┘  └──────┬─────────┘
        │                  │
  ┌─────▼─────┐      ┌────▼─────┐
  │ Org Admin │      │ Org Admin│
  │ (기관관리자) │      │ (기관관리자) │
  └─────┬─────┘      └────┬─────┘
        │                 │
  ┌─────▼─────────┐  ┌────▼──────────┐
  │  직원 1, 2, 3  │  │  직원 4, 5, 6  │
  │  (Users)      │  │  (Users)       │
  └───────────────┘  └────────────────┘
```

---

**작성일**: 2025-12-10
**상태**: 🟡 70% 완료 (핵심 구조 완성, 추가 API 개발 필요)
**다음 단계**: Organization Admin API 구현 + Migration 스크립트 작성

