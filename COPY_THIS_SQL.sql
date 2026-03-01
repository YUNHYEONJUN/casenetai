-- =====================================================
-- 이 코드 전체를 복사하여 Supabase SQL Editor에 붙여넣으세요
-- =====================================================

-- 1. 기존 계정 삭제
DELETE FROM credits WHERE user_id IN (SELECT id FROM users WHERE oauth_email = 'admin@casenetai.kr');
DELETE FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- 2. 새 관리자 계정 생성
INSERT INTO users (oauth_email, password_hash, name, role, is_email_verified, is_approved, oauth_provider, oauth_id, created_at, updated_at)
VALUES ('admin@casenetai.kr', '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2', '시스템 관리자', 'system_admin', true, true, 'local', 'admin_' || extract(epoch from now())::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. 크레딧 생성
INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, free_trial_used, created_at, updated_at)
SELECT id, 10000000, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- 4. 확인 (아래에 결과가 표시되어야 함)
SELECT u.oauth_email, u.name, u.role, u.is_approved, c.balance FROM users u LEFT JOIN credits c ON u.id = c.user_id WHERE u.oauth_email = 'admin@casenetai.kr';

-- =====================================================
-- 결과 확인:
-- oauth_email          | name         | role         | is_approved | balance
-- admin@casenetai.kr  | 시스템 관리자 | system_admin | true        | 10000000
-- 
-- 위와 같이 표시되면 성공!
-- 
-- 로그인:
-- https://casenetai.kr/login.html
-- 이메일: admin@casenetai.kr
-- 비밀번호: Admin2026!@#$
-- =====================================================
