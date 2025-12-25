-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 진술서 테이블 스키마
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 진술서 메인 테이블
CREATE TABLE IF NOT EXISTS statements (
  id SERIAL PRIMARY KEY,
  
  -- 기본 정보
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- 조사 정보
  investigation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  investigation_location VARCHAR(500),
  investigation_agency VARCHAR(200),
  
  -- 피조사자 정보
  subject_name VARCHAR(100),
  subject_birth_date DATE,
  subject_organization VARCHAR(200),
  subject_position VARCHAR(100),
  subject_contact VARCHAR(50),
  
  -- 진술 내용
  audio_url TEXT,
  transcript TEXT,
  statement_content JSONB, -- 문답 형식 JSON: [{"question": "...", "answer": "..."}]
  
  -- 메타데이터
  status VARCHAR(20) DEFAULT 'draft', -- draft, completed, archived
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 검색용 인덱스
  search_vector TSVECTOR
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_statements_user_id ON statements(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_organization_id ON statements(organization_id);
CREATE INDEX IF NOT EXISTS idx_statements_investigation_date ON statements(investigation_date);
CREATE INDEX IF NOT EXISTS idx_statements_status ON statements(status);
CREATE INDEX IF NOT EXISTS idx_statements_search ON statements USING GIN(search_vector);

-- 전문 검색 트리거 (검색 기능 향상)
CREATE OR REPLACE FUNCTION statements_search_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('korean', COALESCE(NEW.subject_name, '')), 'A') ||
    setweight(to_tsvector('korean', COALESCE(NEW.subject_organization, '')), 'B') ||
    setweight(to_tsvector('korean', COALESCE(NEW.investigation_agency, '')), 'B') ||
    setweight(to_tsvector('korean', COALESCE(NEW.transcript, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER statements_search_update
  BEFORE INSERT OR UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION statements_search_trigger();

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_statements_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER statements_updated_at
  BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION update_statements_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 초기 데이터 (테스트용)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 실제 배포 시에는 이 부분 주석 처리

COMMENT ON TABLE statements IS '노인학대 조사 진술서 테이블';
COMMENT ON COLUMN statements.statement_content IS '문답 형식 JSON 배열: [{"question": "질문", "answer": "답변"}]';
COMMENT ON COLUMN statements.status IS 'draft: 작성 중, completed: 작성 완료, archived: 보관됨';
