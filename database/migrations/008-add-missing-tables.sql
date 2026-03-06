-- Migration 008: Add missing tables referenced by services
-- organization_usage_quotas, anonymization_logs, anonymization_feedback

-- 1. Organization usage quotas
CREATE TABLE IF NOT EXISTS organization_usage_quotas (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_quota INTEGER DEFAULT 1000,
    used_this_month INTEGER DEFAULT 0,
    quota_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id)
);

-- 2. Anonymization logs
CREATE TABLE IF NOT EXISTS anonymization_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    original_length INTEGER,
    anonymized_length INTEGER,
    entities_found INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    status VARCHAR(50) DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Anonymization feedback
CREATE TABLE IF NOT EXISTS anonymization_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    anonymization_log_id INTEGER REFERENCES anonymization_logs(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    report_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anon_logs_user ON anonymization_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_anon_logs_org ON anonymization_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_anon_feedback_user ON anonymization_feedback(user_id);
