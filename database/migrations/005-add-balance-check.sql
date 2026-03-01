-- =====================================================
-- CaseNetAI 마이그레이션 005: 크레딧 잔액 음수 방지
-- 날짜: 2026-03-01
-- 설명: credits 테이블에 CHECK 제약조건을 추가하여
--       데이터베이스 레벨에서 음수 잔액을 방지합니다.
--       이는 애플리케이션 로직 + DB 제약조건의 이중 방어입니다.
-- =====================================================

-- PostgreSQL (Supabase) 용 마이그레이션
-- =====================================================

-- 1. 기존 credits 테이블에 CHECK 제약조건 추가
-- PostgreSQL은 ALTER TABLE ADD CONSTRAINT로 기존 테이블에 제약 추가 가능

-- 잔액 음수 방지
ALTER TABLE credits 
  ADD CONSTRAINT chk_credits_balance_non_negative 
  CHECK (balance >= 0);

-- free_trial_count 음수 방지
ALTER TABLE credits 
  ADD CONSTRAINT chk_credits_free_trial_non_negative 
  CHECK (free_trial_count >= 0);

-- 2. 크레딧 차감 시 원자적 업데이트를 강제하는 함수 (선택사항)
-- 이 함수를 사용하면 애플리케이션에서 직접 UPDATE하지 않고
-- 안전한 차감 함수를 호출할 수 있습니다.

CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS TABLE(new_balance INTEGER, was_deducted BOOLEAN) AS $$
DECLARE
  v_rows_affected INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 원자적 업데이트: balance >= amount 조건으로 동시성 문제 방지
  UPDATE credits 
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id 
    AND balance >= p_amount;
  
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  IF v_rows_affected = 0 THEN
    -- 잔액 부족 또는 사용자 없음
    SELECT c.balance INTO v_new_balance 
    FROM credits c WHERE c.user_id = p_user_id;
    
    RETURN QUERY SELECT COALESCE(v_new_balance, 0), FALSE;
  ELSE
    -- 차감 성공 - 새 잔액 조회
    SELECT c.balance INTO v_new_balance 
    FROM credits c WHERE c.user_id = p_user_id;
    
    RETURN QUERY SELECT v_new_balance, TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. 크레딧 충전 함수 (선택사항)
CREATE OR REPLACE FUNCTION add_credit(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE credits 
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  IF v_new_balance IS NULL THEN
    -- 크레딧 레코드가 없으면 생성
    INSERT INTO credits (user_id, balance)
    VALUES (p_user_id, p_amount)
    RETURNING balance INTO v_new_balance;
  END IF;
  
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 롤백 스크립트 (필요시 사용)
-- =====================================================
-- ALTER TABLE credits DROP CONSTRAINT IF EXISTS chk_credits_balance_non_negative;
-- ALTER TABLE credits DROP CONSTRAINT IF EXISTS chk_credits_free_trial_non_negative;
-- DROP FUNCTION IF EXISTS deduct_credit(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS add_credit(UUID, INTEGER);
