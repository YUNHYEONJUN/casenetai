-- =====================================================
-- CaseNetAI 관리자 계정 생성 SQL
-- =====================================================
-- Supabase 대시보드 → SQL Editor에서 실행하세요
-- https://supabase.com/dashboard/project/lsrfzqgvtaxjqnhtzebz/sql
-- =====================================================

-- 1. 기존 테스트 계정 삭제 (있다면)
DELETE FROM credits WHERE user_id IN (
  SELECT id FROM users WHERE email IN ('admin@casenetai.kr', 'dev@casenetai.kr', 'test@casenetai.kr')
);
DELETE FROM users WHERE email IN ('admin@casenetai.kr', 'dev@casenetai.kr', 'test@casenetai.kr');

-- 2. 관리자 계정 생성
-- ⚠️ password_hash는 bcrypt로 해시된 값입니다
-- 실제 비밀번호: Admin2026!@#$

-- 시스템 관리자
INSERT INTO users (
  email, 
  password_hash, 
  name, 
  role, 
  is_email_verified, 
  is_approved,
  oauth_provider,
  created_at, 
  updated_at
) VALUES (
  'admin@casenetai.kr',
  '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',  -- Admin2026!@#$
  '시스템 관리자',
  'system_admin',
  true,
  true,
  'local',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) RETURNING id;

-- 3. 크레딧 생성 (방금 생성된 사용자 ID 사용)
INSERT INTO credits (
  user_id, 
  balance, 
  total_purchased, 
  total_used, 
  free_trial_count,
  updated_at
)
SELECT 
  id,
  10000000,  -- 1천만원
  0,
  0,
  0,
  CURRENT_TIMESTAMP
FROM users 
WHERE email = 'admin@casenetai.kr';

-- 4. 확인
SELECT 
  u.id,
  u.email,
  u.name,
  u.role,
  u.is_approved,
  c.balance as credit_balance
FROM users u
LEFT JOIN credits c ON u.id = c.user_id
WHERE u.email = 'admin@casenetai.kr';

-- =====================================================
-- 로그인 정보
-- =====================================================
-- 📧 이메일: admin@casenetai.kr
-- 🔑 비밀번호: Admin2026!@#$
-- 🌐 로그인 URL: https://casenetai.kr/login.html
-- =====================================================

-- =====================================================
-- 추가 계정 생성 (선택사항)
-- =====================================================

-- 개발자 계정
INSERT INTO users (
  email, password_hash, name, role, is_email_verified, is_approved, oauth_provider, created_at, updated_at
) VALUES (
  'dev@casenetai.kr',
  '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',  -- Admin2026!@#$ (동일 비밀번호)
  '개발자',
  'system_admin',
  true,
  true,
  'local',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) RETURNING id;

INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
SELECT id, 10000000, 0, 0, 0, CURRENT_TIMESTAMP FROM users WHERE email = 'dev@casenetai.kr';

-- 테스트 사용자
INSERT INTO users (
  email, password_hash, name, role, is_email_verified, is_approved, oauth_provider, created_at, updated_at
) VALUES (
  'test@casenetai.kr',
  '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',  -- Admin2026!@#$ (동일 비밀번호)
  '테스트 사용자',
  'user',
  true,
  true,
  'local',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) RETURNING id;

INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
SELECT id, 10000000, 0, 0, 3, CURRENT_TIMESTAMP FROM users WHERE email = 'test@casenetai.kr';
