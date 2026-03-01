-- =====================================================
-- CaseNetAI 데이터베이스 스키마 확인
-- =====================================================
-- Supabase SQL Editor에서 실행하여 테이블 구조 확인
-- =====================================================

-- 1. users 테이블 컬럼 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- 2. 기존 사용자 확인 (이메일 컬럼명 확인)
SELECT 
    id,
    email,
    oauth_email,
    name,
    role,
    is_approved,
    oauth_provider,
    created_at
FROM users
LIMIT 5;

-- 3. credits 테이블 확인
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'credits'
ORDER BY ordinal_position;

-- 4. 전체 사용자 수 및 관리자 수 확인
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN role = 'system_admin' THEN 1 END) as admin_count,
    COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count
FROM users;

-- 5. 관리자 계정 존재 여부 확인 (모든 이메일 필드)
SELECT 
    id,
    email,
    oauth_email,
    name,
    role,
    password_hash IS NOT NULL as has_password,
    is_approved,
    oauth_provider
FROM users
WHERE 
    email LIKE '%admin%' OR 
    oauth_email LIKE '%admin%' OR
    role = 'system_admin';
