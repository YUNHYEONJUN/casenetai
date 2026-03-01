-- =====================================================
-- 수정된 관리자 계정 생성 SQL
-- (is_email_verified 컬럼 제거)
-- =====================================================

-- 1. 기존 계정 삭제
DELETE FROM credits WHERE user_id IN (SELECT id FROM users WHERE oauth_email = 'admin@casenetai.kr');
DELETE FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- 2. 새 관리자 계정 생성 (수정됨)
INSERT INTO users (
  oauth_email, 
  password_hash, 
  name, 
  role, 
  is_approved,
  oauth_provider,
  oauth_id,
  created_at, 
  updated_at
)
VALUES (
  'admin@casenetai.kr',
  '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',
  '시스템 관리자',
  'system_admin',
  true,
  'local',
  'admin_' || extract(epoch from now())::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- 3. 크레딧 생성
INSERT INTO credits (
  user_id, 
  balance, 
  total_purchased, 
  total_used, 
  free_trial_count,
  free_trial_used,
  created_at,
  updated_at
)
SELECT 
  id, 
  10000000, 
  0, 
  0, 
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM users 
WHERE oauth_email = 'admin@casenetai.kr';

-- 4. 확인
SELECT 
  u.oauth_email, 
  u.name, 
  u.role, 
  u.is_approved, 
  c.balance 
FROM users u 
LEFT JOIN credits c ON u.id = c.user_id 
WHERE u.oauth_email = 'admin@casenetai.kr';
