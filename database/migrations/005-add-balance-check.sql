-- 마이그레이션 005: 크레딧 잔액 CHECK 제약조건 추가
-- 음수 잔액 방지

-- SQLite는 ALTER TABLE ... ADD CONSTRAINT를 지원하지 않으므로
-- 새 테이블 생성 후 데이터 복사하는 방식 사용

BEGIN TRANSACTION;

-- 백업 테이블 생성
CREATE TABLE credits_backup AS SELECT * FROM credits;

-- 기존 테이블 삭제
DROP TABLE IF EXISTS credits;

-- CHECK 제약조건이 포함된 새 테이블 생성
CREATE TABLE credits (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER DEFAULT 0 CHECK(balance >= 0), -- 음수 방지
  total_purchased INTEGER DEFAULT 0 CHECK(total_purchased >= 0),
  total_used INTEGER DEFAULT 0 CHECK(total_used >= 0),
  total_bonus INTEGER DEFAULT 0 CHECK(total_bonus >= 0),
  free_trial_count INTEGER DEFAULT 3 CHECK(free_trial_count >= 0),
  free_trial_used INTEGER DEFAULT 0 CHECK(free_trial_used >= 0),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 데이터 복원
INSERT INTO credits SELECT * FROM credits_backup;

-- 백업 테이블 삭제
DROP TABLE credits_backup;

-- 인덱스 재생성
CREATE INDEX idx_credits_balance ON credits(balance);

COMMIT;
