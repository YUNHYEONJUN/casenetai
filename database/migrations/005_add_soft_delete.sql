-- Soft Delete 기능 추가 (deleted_at 컬럼)
-- 이 마이그레이션은 Supabase SQL Editor에서 실행하세요

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. users 테이블에 deleted_at 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE users 
ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

-- 인덱스 추가 (deleted_at IS NULL 조회 최적화)
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. credits 테이블에 deleted_at 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE credits 
ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

CREATE INDEX idx_credits_deleted_at ON credits(deleted_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. statements 테이블에 deleted_at 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE statements 
ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

CREATE INDEX idx_statements_deleted_at ON statements(deleted_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. fact_confirmations 테이블에 deleted_at 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE fact_confirmations 
ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;

CREATE INDEX idx_fact_confirmations_deleted_at ON fact_confirmations(deleted_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 사용 예시 (애플리케이션 코드에서)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 사용자 삭제 (Soft Delete):
-- UPDATE users SET deleted_at = NOW() WHERE id = 'user-id';

-- 활성 사용자만 조회:
-- SELECT * FROM users WHERE deleted_at IS NULL;

-- 삭제된 사용자만 조회:
-- SELECT * FROM users WHERE deleted_at IS NOT NULL;

-- 사용자 복구:
-- UPDATE users SET deleted_at = NULL WHERE id = 'user-id';

-- 30일 이상 지난 삭제 데이터 영구 삭제 (정기 작업):
-- DELETE FROM users WHERE deleted_at < NOW() - INTERVAL '30 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 확인 쿼리
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE column_name = 'deleted_at'
  AND table_schema = 'public'
ORDER BY table_name;
