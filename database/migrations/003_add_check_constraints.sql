-- 크레딧 잔액 음수 방지 CHECK 제약 추가
-- 이 마이그레이션은 Supabase SQL Editor에서 실행하세요

-- 1. credits 테이블에 balance CHECK 제약 추가
ALTER TABLE credits 
ADD CONSTRAINT positive_balance CHECK (balance >= 0);

-- 2. credits 테이블에 free_trial_count CHECK 제약 추가
ALTER TABLE credits 
ADD CONSTRAINT positive_free_trial CHECK (free_trial_count >= 0);

-- 3. 이미 음수 잔액이 있는 경우 수정 (마이그레이션 전 확인)
-- UPDATE credits SET balance = 0 WHERE balance < 0;
-- UPDATE credits SET free_trial_count = 0 WHERE free_trial_count < 0;

-- 확인 쿼리
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN ('positive_balance', 'positive_free_trial');
