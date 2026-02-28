-- 외래키 ON DELETE 정책 추가
-- 이 마이그레이션은 Supabase SQL Editor에서 실행하세요

-- 기존 외래키 확인
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 외래키 재생성 (ON DELETE CASCADE/SET NULL 추가)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. credits 테이블: 사용자 삭제 시 크레딧도 삭제
-- ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_user_id_fkey;
-- ALTER TABLE credits 
-- ADD CONSTRAINT credits_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. transactions 테이블: 사용자 삭제 시 거래 내역도 삭제
-- ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
-- ALTER TABLE transactions 
-- ADD CONSTRAINT transactions_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 3. statements 테이블: 사용자 삭제 시 진술서도 삭제
-- ALTER TABLE statements DROP CONSTRAINT IF EXISTS statements_user_id_fkey;
-- ALTER TABLE statements 
-- ADD CONSTRAINT statements_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. fact_confirmations 테이블: 사용자 삭제 시 사실확인서도 삭제
-- ALTER TABLE fact_confirmations DROP CONSTRAINT IF EXISTS fact_confirmations_user_id_fkey;
-- ALTER TABLE fact_confirmations 
-- ADD CONSTRAINT fact_confirmations_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 5. usage_logs 테이블: 사용자 삭제 시 사용 로그도 삭제
-- ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_user_id_fkey;
-- ALTER TABLE usage_logs 
-- ADD CONSTRAINT usage_logs_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6. anonymization_logs 테이블: 사용자 삭제 시 익명화 로그도 삭제
-- ALTER TABLE anonymization_logs DROP CONSTRAINT IF EXISTS anonymization_logs_user_id_fkey;
-- ALTER TABLE anonymization_logs 
-- ADD CONSTRAINT anonymization_logs_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 7. users 테이블: 조직 삭제 시 조직 사용자의 organization_id를 NULL로 설정
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;
-- ALTER TABLE users 
-- ADD CONSTRAINT users_organization_id_fkey 
-- FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 주의사항
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 위 SQL은 주석 처리되어 있습니다. 
-- 2. 실제 실행 전에 기존 제약 조건 이름을 확인하세요.
-- 3. 프로덕션에서는 백업 후 실행하세요.
-- 4. ON DELETE CASCADE: 부모 삭제 시 자식도 자동 삭제
-- 5. ON DELETE SET NULL: 부모 삭제 시 자식의 외래키를 NULL로 설정
