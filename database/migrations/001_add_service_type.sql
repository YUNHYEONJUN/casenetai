-- Add service_type column to users table
-- This allows users to be associated with specific service types

ALTER TABLE users ADD COLUMN service_type TEXT DEFAULT 'elderly_protection';

-- Possible values:
-- 'elderly_protection' - 노인보호전문기관
-- 'child_protection' - 아동보호전문기관
-- 'disability_welfare' - 장애인복지관
-- 'domestic_violence' - 가정폭력상담소
-- 'sexual_violence' - 성폭력상담소
-- 'mental_health' - 정신건강복지센터

CREATE INDEX IF NOT EXISTS idx_users_service_type ON users(service_type);
