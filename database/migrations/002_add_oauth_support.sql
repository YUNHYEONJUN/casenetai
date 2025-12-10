-- OAuth 지원을 위한 DB 마이그레이션
-- 작성일: 2025-11-30
-- 목적: 카카오/네이버 OAuth 로그인 지원

-- SQLite는 ALTER COLUMN을 지원하지 않으므로 새 테이블을 만들고 데이터를 복사

-- 1. 새 users 테이블 생성 (OAuth 지원)
CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,                              -- NULL 허용 (OAuth 사용자는 선택)
    password_hash TEXT,                      -- NULL 허용 (OAuth 사용자)
    name TEXT,                               -- NULL 허용 (OAuth 닉네임으로 대체)
    phone TEXT,
    organization_id INTEGER,
    role TEXT DEFAULT 'user',
    is_email_verified INTEGER DEFAULT 0,
    
    -- OAuth 관련 새 컬럼
    oauth_provider TEXT,                     -- 'kakao', 'naver', null
    oauth_id TEXT,                           -- OAuth 제공자의 사용자 ID
    oauth_nickname TEXT,                     -- OAuth 닉네임
    profile_image TEXT,                      -- 프로필 이미지 URL
    service_type TEXT DEFAULT 'elderly_protection',  -- 서비스 타입
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- 2. 기존 데이터 복사
INSERT INTO users_new (
    id, email, password_hash, name, phone, organization_id, role,
    is_email_verified, created_at, updated_at, last_login_at
)
SELECT 
    id, email, password_hash, name, phone, organization_id, role,
    is_email_verified, created_at, updated_at, last_login_at
FROM users;

-- 3. 기존 테이블 삭제
DROP TABLE users;

-- 4. 새 테이블 이름 변경
ALTER TABLE users_new RENAME TO users;

-- 5. 인덱스 생성
-- 이메일 인덱스 (이메일이 있는 경우에만)
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

-- OAuth 인덱스 (빠른 조회)
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- OAuth 고유성 보장 (같은 제공자의 같은 ID는 하나만)
CREATE UNIQUE INDEX idx_users_oauth_unique ON users(oauth_provider, oauth_id) 
WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

-- 기관 인덱스
CREATE INDEX idx_users_organization ON users(organization_id);

-- 서비스 타입 인덱스
CREATE INDEX idx_users_service_type ON users(service_type);

-- 마이그레이션 완료!
-- 이제 users 테이블은 다음을 지원:
-- 1. 기존: 이메일/비밀번호 (email, password_hash 필수)
-- 2. 신규: 카카오 OAuth (oauth_provider='kakao', oauth_id 필수)
-- 3. 신규: 네이버 OAuth (oauth_provider='naver', oauth_id 필수)
