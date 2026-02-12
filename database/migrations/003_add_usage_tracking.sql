-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 노인보호전문기관 사용 시간 추적 마이그레이션
-- 전국 39개 지역노인보호전문기관 × 월 10시간 무료 제공
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 기관별 월간 사용 시간 추적 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS organization_usage_quotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL, -- 1~12
  quota_hours REAL DEFAULT 10.0, -- 월간 할당 시간 (10시간)
  used_hours REAL DEFAULT 0.0, -- 사용한 시간
  remaining_hours REAL DEFAULT 10.0, -- 남은 시간
  request_count INTEGER DEFAULT 0, -- 익명화 요청 횟수
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, year, month)
);

CREATE INDEX idx_usage_quotas_org ON organization_usage_quotas(organization_id);
CREATE INDEX idx_usage_quotas_period ON organization_usage_quotas(year, month);
CREATE INDEX idx_usage_quotas_remaining ON organization_usage_quotas(remaining_hours);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. 익명화 사용 로그 테이블 (상세)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS anonymization_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  organization_id INTEGER,
  file_name TEXT,
  file_type TEXT, -- 'docx', 'pdf', 'txt'
  file_size_kb INTEGER,
  processing_time_seconds REAL, -- 처리 시간 (초)
  processing_time_minutes REAL, -- 처리 시간 (분, 요금 계산용)
  
  -- 익명화 통계
  anonymized_names INTEGER DEFAULT 0,
  anonymized_facilities INTEGER DEFAULT 0,
  anonymized_phones INTEGER DEFAULT 0,
  anonymized_addresses INTEGER DEFAULT 0,
  anonymized_emails INTEGER DEFAULT 0,
  anonymized_ids INTEGER DEFAULT 0,
  total_anonymized INTEGER DEFAULT 0,
  
  -- 상태
  status TEXT DEFAULT 'success', -- 'success', 'failed', 'quota_exceeded'
  error_message TEXT,
  
  -- 시간 차감 정보
  quota_deducted REAL DEFAULT 0.0, -- 차감된 시간 (분)
  is_free INTEGER DEFAULT 1, -- 무료 할당량 사용 여부
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX idx_anon_logs_user ON anonymization_logs(user_id);
CREATE INDEX idx_anon_logs_org ON anonymization_logs(organization_id);
CREATE INDEX idx_anon_logs_created ON anonymization_logs(created_at DESC);
CREATE INDEX idx_anon_logs_status ON anonymization_logs(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. users 테이블에 service_type 컬럼 추가 (이미 있으면 무시)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- service_type: 'elderly_protection', 'child_protection', 'disability_protection', 'domestic_violence', 'sexual_violence'
ALTER TABLE users ADD COLUMN service_type TEXT DEFAULT 'elderly_protection';

CREATE INDEX IF NOT EXISTS idx_users_service_type ON users(service_type);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. organizations 테이블 확장
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 기관 유형 추가
ALTER TABLE organizations ADD COLUMN organization_type TEXT DEFAULT 'elderly_protection';
-- 'elderly_protection', 'child_protection', 'disability_protection', 'domestic_violence', 'sexual_violence', 'law_firm', 'general'

-- 지역 정보 추가
ALTER TABLE organizations ADD COLUMN region TEXT; -- '서울', '경기', '부산' 등

-- 연락처 정보
ALTER TABLE organizations ADD COLUMN contact_email TEXT;
ALTER TABLE organizations ADD COLUMN contact_phone TEXT;
ALTER TABLE organizations ADD COLUMN address TEXT;

-- 계약 정보
ALTER TABLE organizations ADD COLUMN is_sponsored INTEGER DEFAULT 0; -- 기업 후원 여부
ALTER TABLE organizations ADD COLUMN sponsor_name TEXT; -- 후원 기업명
ALTER TABLE organizations ADD COLUMN notes TEXT; -- 비고

CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);
CREATE INDEX IF NOT EXISTS idx_organizations_region ON organizations(region);
CREATE INDEX IF NOT EXISTS idx_organizations_sponsored ON organizations(is_sponsored);
