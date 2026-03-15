-- Migration 011: Ensure core tables exist
-- sessions, payments, transactions, usage_logs may only exist in initial schema
-- This migration makes them safe to run independently

-- 1. sessions 테이블
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    refresh_token TEXT UNIQUE,
    ip_address VARCHAR(50),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 2. payments 테이블
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    payment_key VARCHAR(255),
    amount INTEGER NOT NULL,
    bonus_amount INTEGER DEFAULT 0,
    total_credit INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    payment_method VARCHAR(100),
    pg_provider VARCHAR(50) DEFAULT 'tosspayments',
    pg_response JSONB,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 3. transactions 테이블
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('purchase', 'usage', 'bonus', 'refund', 'free_trial', 'charge')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    audio_duration_minutes REAL,
    payment_id VARCHAR(255),
    order_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- 4. usage_logs 테이블
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consultation_type VARCHAR(50),
    audio_file_name VARCHAR(255),
    audio_duration_seconds REAL,
    stt_provider VARCHAR(50),
    stt_cost INTEGER DEFAULT 0,
    ai_provider VARCHAR(50),
    ai_cost INTEGER DEFAULT 0,
    total_cost INTEGER DEFAULT 0,
    is_free_trial BOOLEAN DEFAULT FALSE,
    processing_time_seconds REAL,
    status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);

-- 5. bookmarked_cases 테이블
CREATE TABLE IF NOT EXISTS bookmarked_cases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_number VARCHAR(255) NOT NULL,
    title TEXT,
    court_type VARCHAR(100),
    case_type VARCHAR(100),
    date VARCHAR(50),
    summary TEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarked_cases(user_id);

-- 6. updated_at 자동 업데이트 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
