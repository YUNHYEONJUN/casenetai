-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 010: 성능 최적화 인덱스 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 세션 조회 (리프레시 토큰, 만료일)
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions (refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

-- 사용자 조회 (기관별, 역할별)
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_oauth_email ON users (oauth_email);

-- 크레딧 조회
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits (user_id);

-- 거래 내역 (사용자별, 시간순)
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_created ON transactions (user_id, created_at DESC);

-- 결제 내역 (사용자별, 주문번호)
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at);

-- 사용 로그 (사용자별)
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs (created_at);

-- 익명화 로그 (기관별, 사용자별, 시간순)
CREATE INDEX IF NOT EXISTS idx_anonymization_logs_org_id ON anonymization_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_anonymization_logs_user_id ON anonymization_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_anonymization_logs_created_at ON anonymization_logs (created_at);

-- 기관 사용량 할당 (복합 키)
CREATE INDEX IF NOT EXISTS idx_org_usage_quotas_lookup
  ON organization_usage_quotas (organization_id, year, month);

-- 가입 요청 (기관별 + 상태)
CREATE INDEX IF NOT EXISTS idx_join_requests_org_status
  ON organization_join_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user_id
  ON organization_join_requests (user_id);

-- 감사 로그 (시간순)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

-- 피드백 (기관별, 시간순)
CREATE INDEX IF NOT EXISTS idx_feedback_org_id ON anonymization_feedback (organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON anonymization_feedback (created_at);

-- 만료된 세션 정리용
CREATE INDEX IF NOT EXISTS idx_sessions_expired
  ON sessions (expires_at) WHERE expires_at < CURRENT_TIMESTAMP;
