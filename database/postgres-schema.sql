-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CaseNetAI PostgreSQL Schema
-- Migrated from SQLite to PostgreSQL
-- Date: 2025-12-13
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. organizations 테이블 (사용자 테이블보다 먼저 생성)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    
    -- 기관 기본 정보
    name VARCHAR(255) NOT NULL,
    business_registration_number VARCHAR(50),
    
    -- 구독 정보
    plan_type VARCHAR(50) DEFAULT 'free' CHECK (plan_type IN ('free', 'small', 'medium', 'large', 'enterprise')),
    subscription_status VARCHAR(50) DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'trial', 'expired')),
    monthly_fee INTEGER DEFAULT 0,
    max_users INTEGER DEFAULT 0,
    
    -- 계약 정보
    contract_date DATE,
    expiry_date DATE,
    
    -- 기관 관리자
    created_by_admin_id INTEGER,
    
    -- 기관 상태
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_subscription ON organizations(subscription_status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. users 테이블 (소셜 로그인 전용)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    
    -- OAuth 정보 (필수)
    oauth_provider VARCHAR(50) NOT NULL CHECK (oauth_provider IN ('kakao', 'naver', 'google')),
    oauth_id VARCHAR(255) NOT NULL,
    oauth_email VARCHAR(255),
    oauth_nickname VARCHAR(255),
    profile_image TEXT,
    
    -- 사용자 기본 정보
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    
    -- 조직 및 권한
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('system_admin', 'org_admin', 'user')),
    
    -- 계정 상태
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    is_approved BOOLEAN DEFAULT FALSE,
    
    -- 서비스 설정
    service_type VARCHAR(50) DEFAULT 'elderly_protection',
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    
    -- 제약조건
    UNIQUE (oauth_provider, oauth_id)
);

CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX idx_users_oauth_email ON users(oauth_email) WHERE oauth_email IS NOT NULL;
CREATE INDEX idx_users_organization ON users(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. organization_join_requests 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS organization_join_requests (
    id SERIAL PRIMARY KEY,
    
    -- 요청자 정보
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- 요청 내용
    message TEXT,
    
    -- 승인 정보
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_message TEXT,
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_join_requests_user ON organization_join_requests(user_id);
CREATE INDEX idx_join_requests_org ON organization_join_requests(organization_id);
CREATE INDEX idx_join_requests_status ON organization_join_requests(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. audit_logs 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    
    -- 행위자
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_role VARCHAR(50),
    
    -- 행위 내용
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id INTEGER,
    
    -- 상세 정보
    description TEXT,
    metadata JSONB,  -- PostgreSQL의 JSON 타입
    
    -- IP 정보
    ip_address VARCHAR(50),
    user_agent TEXT,
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. credits 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS credits (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0,
    total_purchased INTEGER DEFAULT 0,
    total_used INTEGER DEFAULT 0,
    total_bonus INTEGER DEFAULT 0,
    free_trial_count INTEGER DEFAULT 3,
    free_trial_used INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credits_balance ON credits(balance);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. transactions 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('purchase', 'usage', 'bonus', 'refund', 'free_trial')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    audio_duration_minutes REAL,
    payment_id VARCHAR(255),
    order_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. payments 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    payment_key VARCHAR(255),
    amount INTEGER NOT NULL,
    bonus_amount INTEGER DEFAULT 0,
    total_credit INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    payment_method VARCHAR(100),
    pg_provider VARCHAR(50) DEFAULT 'tosspayments',
    pg_response JSONB,  -- PostgreSQL의 JSON 타입
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. usage_logs 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consultation_type VARCHAR(50),
    audio_file_name VARCHAR(255),
    audio_duration_seconds REAL,
    stt_provider VARCHAR(50),
    stt_cost INTEGER DEFAULT 0,
    ai_provider VARCHAR(50),
    ai_cost INTEGER DEFAULT 0,
    total_cost INTEGER DEFAULT 0,
    is_free_trial BOOLEAN DEFAULT FALSE,
    processing_time_seconds REAL,
    status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. sessions 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    refresh_token TEXT UNIQUE,
    ip_address VARCHAR(50),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. bookmarked_cases 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bookmarked_cases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_number VARCHAR(255) NOT NULL,
    title TEXT,
    court_type VARCHAR(100),
    case_type VARCHAR(100),
    date VARCHAR(50),
    summary TEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, case_number)
);

CREATE INDEX idx_bookmarks_user ON bookmarked_cases(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 트리거: updated_at 자동 업데이트
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users 테이블 트리거
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- organizations 테이블 트리거
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- credits 테이블 트리거
CREATE TRIGGER update_credits_updated_at
BEFORE UPDATE ON credits
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SQLite → PostgreSQL 주요 변경 사항
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
-- 2. TEXT → VARCHAR(n) 또는 TEXT (적절히 선택)
-- 3. INTEGER (boolean) → BOOLEAN
-- 4. TIMESTAMP → TIMESTAMP (동일)
-- 5. JSON 저장 → JSONB (PostgreSQL 최적화)
-- 6. CHECK 제약조건 문법 동일
-- 7. FOREIGN KEY 문법 동일
-- 8. 인덱스 문법 거의 동일 (WHERE 절 지원)
-- 9. UNIQUE 제약조건 동일
-- 10. updated_at 자동 업데이트를 위한 트리거 추가 (PostgreSQL에서 필요)

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 스키마 생성 완료!
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
