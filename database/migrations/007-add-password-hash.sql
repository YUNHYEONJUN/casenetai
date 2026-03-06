-- Migration 007: Add password_hash column for email/password login
-- Required for admin accounts that use email/password instead of OAuth

-- 1. Add password_hash column
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Allow 'local' as oauth_provider (for email/password accounts)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_oauth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_oauth_provider_check
    CHECK (oauth_provider IN ('kakao', 'naver', 'google', 'local'));
