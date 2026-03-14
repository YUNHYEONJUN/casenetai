-- Migration 009: Add missing columns to PostgreSQL tables
-- Migrations 003/004 use SQLite syntax (AUTOINCREMENT) and fail on PostgreSQL.
-- Migration 008 created simplified versions. This migration adds the missing columns.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. organization_usage_quotas: Add year/month tracking columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS month INTEGER;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS quota_hours REAL DEFAULT 10.0;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS used_hours REAL DEFAULT 0.0;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS remaining_hours REAL DEFAULT 10.0;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0;
ALTER TABLE organization_usage_quotas ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;

-- Add unique constraint for year/month if not exists
-- (organization_id alone may already be unique from 008; we need org+year+month)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_quotas_org_year_month
  ON organization_usage_quotas(organization_id, year, month);

CREATE INDEX IF NOT EXISTS idx_usage_quotas_period ON organization_usage_quotas(year, month);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_remaining ON organization_usage_quotas(remaining_hours);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. anonymization_logs: Add detailed tracking columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS file_size_kb INTEGER;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS processing_time_seconds REAL;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS processing_time_minutes REAL;

-- Anonymization statistics
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_names INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_facilities INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_phones INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_addresses INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_emails INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS anonymized_ids INTEGER DEFAULT 0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS total_anonymized INTEGER DEFAULT 0;

-- Quota tracking
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS quota_deducted REAL DEFAULT 0.0;
ALTER TABLE anonymization_logs ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_anon_logs_created ON anonymization_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anon_logs_status ON anonymization_logs(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. anonymization_feedback: Add detailed feedback columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Rename anonymization_log_id to log_id if needed (migration 008 uses anonymization_log_id)
-- We add log_id as alias column, keeping both for compatibility
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS log_id INTEGER;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- Scoring
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS accuracy_score INTEGER;

-- Error types
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS has_false_positive BOOLEAN DEFAULT FALSE;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS has_false_negative BOOLEAN DEFAULT FALSE;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS has_incorrect_mapping BOOLEAN DEFAULT FALSE;

-- Detailed feedback
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS false_positive_examples TEXT;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS false_negative_examples TEXT;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS incorrect_mapping_examples TEXT;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS improvement_suggestion TEXT;

-- Metadata
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS anonymization_method TEXT;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS detected_entities_count INTEGER;

-- Admin review
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN DEFAULT FALSE;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS admin_response TEXT;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;

ALTER TABLE anonymization_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_feedback_log ON anonymization_feedback(log_id);
CREATE INDEX IF NOT EXISTS idx_feedback_org ON anonymization_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON anonymization_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_method ON anonymization_feedback(anonymization_method);
CREATE INDEX IF NOT EXISTS idx_feedback_reviewed ON anonymization_feedback(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON anonymization_feedback(created_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. feedback_statistics table
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS feedback_statistics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_feedbacks INTEGER DEFAULT 0,
  average_rating REAL DEFAULT 0.0,
  average_accuracy REAL DEFAULT 0.0,
  false_positive_count INTEGER DEFAULT 0,
  false_negative_count INTEGER DEFAULT 0,
  incorrect_mapping_count INTEGER DEFAULT 0,
  method_statistics TEXT,
  organization_statistics TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_stats_date ON feedback_statistics(date);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. improvement_suggestions table
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user ON improvement_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_org ON improvement_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_category ON improvement_suggestions(category);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON improvement_suggestions(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. organizations: Add missing columns from migration 003
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_type TEXT DEFAULT 'elderly_protection';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_sponsored INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sponsor_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);
CREATE INDEX IF NOT EXISTS idx_organizations_region ON organizations(region);
