-- Migration 006: 소셜 로그인 전용 + 3단계 권한 시스템
-- 작성일: 2025-12-10
-- 목적: 이메일/비밀번호 인증 제거, 소셜 로그인 전용으로 전환

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. users 테이블 재구성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 새 테이블 생성 (소셜 로그인 전용)
CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- OAuth 정보 (필수)
    oauth_provider TEXT NOT NULL,           -- 'kakao', 'naver', 'google'
    oauth_id TEXT NOT NULL,                 -- OAuth 제공자의 사용자 ID
    oauth_email TEXT,                       -- OAuth에서 제공하는 이메일 (선택)
    oauth_nickname TEXT,                    -- OAuth 닉네임
    profile_image TEXT,                     -- 프로필 이미지 URL
    
    -- 사용자 기본 정보
    name TEXT NOT NULL,                     -- 실명 (필수)
    phone TEXT,                             -- 전화번호 (선택)
    
    -- 조직 및 권한
    organization_id INTEGER,                -- 소속 기관 (NULL: 개인 사용자)
    role TEXT DEFAULT 'user',               -- 'system_admin', 'org_admin', 'user'
    
    -- 계정 상태
    status TEXT DEFAULT 'active',           -- 'active', 'suspended', 'deleted'
    is_approved INTEGER DEFAULT 0,          -- 기관 가입 승인 여부 (org_admin이 승인)
    
    -- 서비스 설정
    service_type TEXT DEFAULT 'elderly_protection',
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    
    -- 외래키
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    
    -- 제약조건
    UNIQUE (oauth_provider, oauth_id),      -- 같은 제공자의 같은 ID는 하나만
    CHECK (role IN ('system_admin', 'org_admin', 'user')),
    CHECK (status IN ('active', 'suspended', 'deleted'))
);

-- 기존 데이터 마이그레이션 (OAuth 사용자만)
INSERT INTO users_new (
    id, oauth_provider, oauth_id, oauth_email, oauth_nickname, 
    profile_image, name, phone, organization_id, role, 
    service_type, created_at, updated_at, last_login_at, is_approved
)
SELECT 
    id, 
    COALESCE(oauth_provider, 'kakao') as oauth_provider,
    COALESCE(oauth_id, 'migrated_' || id) as oauth_id,
    email as oauth_email,
    COALESCE(oauth_nickname, name) as oauth_nickname,
    profile_image,
    name,
    phone,
    organization_id,
    role,
    COALESCE(service_type, 'elderly_protection') as service_type,
    created_at,
    updated_at,
    last_login_at,
    1 as is_approved  -- 기존 사용자는 모두 승인된 것으로 간주
FROM users
WHERE oauth_provider IS NOT NULL;  -- OAuth 사용자만 마이그레이션

-- 기존 테이블 삭제 및 이름 변경
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 인덱스 생성
CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX idx_users_oauth_email ON users(oauth_email) WHERE oauth_email IS NOT NULL;
CREATE INDEX idx_users_organization ON users(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. organizations 테이블 강화
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE organizations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 기관 기본 정보
    name TEXT NOT NULL,
    business_registration_number TEXT,      -- 사업자등록번호
    
    -- 구독 정보
    plan_type TEXT DEFAULT 'free',          -- 'free', 'small', 'medium', 'large', 'enterprise'
    subscription_status TEXT DEFAULT 'inactive',  -- 'active', 'inactive', 'trial', 'expired'
    monthly_fee INTEGER DEFAULT 0,
    max_users INTEGER DEFAULT 0,            -- 0 = 무제한
    
    -- 계약 정보
    contract_date DATE,
    expiry_date DATE,
    
    -- 기관 관리자 (최초 생성자)
    created_by_admin_id INTEGER,            -- system_admin이 생성한 사용자 ID
    
    -- 기관 상태
    status TEXT DEFAULT 'active',           -- 'active', 'suspended', 'deleted'
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 제약조건
    CHECK (plan_type IN ('free', 'small', 'medium', 'large', 'enterprise')),
    CHECK (subscription_status IN ('active', 'inactive', 'trial', 'expired')),
    CHECK (status IN ('active', 'suspended', 'deleted'))
);

-- 기존 데이터 복사
INSERT INTO organizations_new (
    id, name, business_registration_number, plan_type, subscription_status,
    monthly_fee, max_users, contract_date, expiry_date, created_at, updated_at
)
SELECT 
    id, name, business_registration_number, plan_type, subscription_status,
    monthly_fee, max_users, contract_date, expiry_date, created_at, updated_at
FROM organizations;

DROP TABLE organizations;
ALTER TABLE organizations_new RENAME TO organizations;

-- 인덱스
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_subscription ON organizations(subscription_status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. 기관 가입 요청 테이블 (신규)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS organization_join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 요청자 정보
    user_id INTEGER NOT NULL,
    organization_id INTEGER NOT NULL,
    
    -- 요청 내용
    message TEXT,                           -- 가입 요청 메시지
    
    -- 승인 정보
    status TEXT DEFAULT 'pending',          -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER,                    -- 승인/거절한 org_admin의 user_id
    reviewed_at TIMESTAMP,
    review_message TEXT,                    -- 승인/거절 메시지
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 외래키
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- 제약조건
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_join_requests_user ON organization_join_requests(user_id);
CREATE INDEX idx_join_requests_org ON organization_join_requests(organization_id);
CREATE INDEX idx_join_requests_status ON organization_join_requests(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 감사 로그 테이블 (신규)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 행위자
    user_id INTEGER,
    user_role TEXT,                         -- 행위 당시의 role
    
    -- 행위 내용
    action TEXT NOT NULL,                   -- 'create', 'update', 'delete', 'approve', 'reject', etc.
    resource_type TEXT NOT NULL,            -- 'user', 'organization', 'payment', etc.
    resource_id INTEGER,
    
    -- 상세 정보
    description TEXT,
    metadata TEXT,                          -- JSON 형식의 추가 정보
    
    -- IP 정보
    ip_address TEXT,
    user_agent TEXT,
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 외래키
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 마이그레이션 완료!
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 주요 변경사항:
-- 1. email, password_hash 컬럼 완전 제거 (소셜 로그인 전용)
-- 2. oauth_provider, oauth_id 필수화
-- 3. role 제약조건 명확화 (system_admin, org_admin, user)
-- 4. is_approved 필드 추가 (기관 가입 승인)
-- 5. organization_join_requests 테이블 신규 생성
-- 6. audit_logs 테이블 신규 생성 (관리자 행위 추적)
