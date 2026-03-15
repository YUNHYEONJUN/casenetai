-- Migration 012: Allow 'local' as oauth_provider for email/password login
-- The original schema only allows ('kakao', 'naver', 'google')
-- This blocks the /api/auth/register endpoint

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_oauth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_oauth_provider_check
  CHECK (oauth_provider IN ('kakao', 'naver', 'google', 'local'));
