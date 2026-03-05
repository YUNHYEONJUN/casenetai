-- CaseNetAI 데이터베이스 스키마
-- SQLite/D1 Database

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 사용자 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  organization_id INTEGER,
  role TEXT DEFAULT 'user', -- 'user', 'org_admin', 'system_admin'
  is_email_verified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 기관 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business_registration_number TEXT,
  plan_type TEXT DEFAULT 'free', -- 'free', 'small', 'medium', 'large'
  subscription_status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'trial', 'expired'
  monthly_fee INTEGER DEFAULT 0,
  max_users INTEGER DEFAULT 0,
  contract_date DATE,
  expiry_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_status ON organizations(subscription_status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 크레딧 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS credits (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER DEFAULT 0, -- 현재 잔액 (원)
  total_purchased INTEGER DEFAULT 0, -- 총 구매 금액
  total_used INTEGER DEFAULT 0, -- 총 사용 금액
  total_bonus INTEGER DEFAULT 0, -- 총 보너스 금액
  free_trial_count INTEGER DEFAULT 3, -- 남은 무료 체험 횟수
  free_trial_used INTEGER DEFAULT 0, -- 사용한 무료 체험 횟수
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_credits_balance ON credits(balance);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 거래 내역 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'purchase', 'usage', 'bonus', 'refund', 'free_trial'
  amount INTEGER NOT NULL, -- 양수: 충전, 음수: 사용
  balance_after INTEGER NOT NULL,
  description TEXT,
  audio_duration_minutes REAL, -- 음성 파일 길이 (분)
  payment_id TEXT, -- 토스페이먼츠 결제 ID
  order_id TEXT, -- 주문 ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 결제 정보 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  payment_key TEXT,
  amount INTEGER NOT NULL,
  bonus_amount INTEGER DEFAULT 0,
  total_credit INTEGER NOT NULL, -- amount + bonus_amount
  status TEXT DEFAULT 'pending', -- 'pending', 'success', 'failed', 'cancelled'
  payment_method TEXT, -- 'card', 'transfer', 'virtual_account'
  pg_provider TEXT DEFAULT 'tosspayments',
  pg_response TEXT, -- JSON 응답 저장
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 사용 내역 테이블 (상세)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  consultation_type TEXT, -- 'phone', 'visit', 'office'
  audio_file_name TEXT,
  audio_duration_seconds REAL,
  stt_provider TEXT, -- 'openai', 'clova'
  stt_cost INTEGER DEFAULT 0,
  ai_provider TEXT, -- 'gemini', 'gpt'
  ai_cost INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  is_free_trial INTEGER DEFAULT 0,
  processing_time_seconds REAL,
  status TEXT DEFAULT 'success', -- 'success', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 세션 테이블 (JWT 토큰 관리)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  refresh_token TEXT UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 판례 북마크 테이블 (기존)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bookmarked_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  case_number TEXT NOT NULL,
  title TEXT,
  court_type TEXT,
  case_type TEXT,
  date TEXT,
  summary TEXT,
  url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, case_number)
);

CREATE INDEX idx_bookmarks_user ON bookmarked_cases(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 초기 데이터
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 시스템 관리자 계정 (비밀번호: admin123)
-- 실제 배포 시 반드시 변경할 것!
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, is_email_verified)
VALUES (1, 'admin@casenetai.com', '$2b$10$xZq7Y0yQhKF6HLXVxGxKZexamplehash', 'System Admin', 'system_admin', 1);

-- 관리자 크레딧 초기화
INSERT OR IGNORE INTO credits (user_id, balance, free_trial_count)
VALUES (1, 1000000, 0);
