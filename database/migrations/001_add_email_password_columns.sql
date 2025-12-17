-- 관리자 이메일/비밀번호 로그인을 위한 컬럼 추가
-- Migration: 001_add_email_password_columns

-- 1. email 컬럼 추가 (고유값, NULL 허용)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- 2. password 컬럼 추가 (NULL 허용 - OAuth 사용자는 불필요)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- 3. email_verified 컬럼 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- 4. oauth_provider NULL 허용으로 변경 (이메일 로그인 사용자를 위해)
ALTER TABLE users
ALTER COLUMN oauth_provider DROP NOT NULL;

-- 5. oauth_id NULL 허용으로 변경
ALTER TABLE users
ALTER COLUMN oauth_id DROP NOT NULL;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

COMMENT ON COLUMN users.email IS '이메일 (관리자 로그인용)';
COMMENT ON COLUMN users.password IS '비밀번호 해시 (bcrypt)';
COMMENT ON COLUMN users.email_verified IS '이메일 인증 여부';
