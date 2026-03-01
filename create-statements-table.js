require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createStatementsTable() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 진술서 테이블 생성 시작...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // statements 테이블 생성
    console.log('\n📌 1단계: statements 테이블 생성...');
    await pool.query(`
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
        statement_content JSONB,
        
        -- 메타데이터
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- 검색용
        search_vector TSVECTOR
      )
    `);
    console.log('✅ statements 테이블 생성 완료');

    // 인덱스 생성
    console.log('\n📌 2단계: 인덱스 생성...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_statements_user_id ON statements(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_statements_organization_id ON statements(organization_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_statements_investigation_date ON statements(investigation_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_statements_status ON statements(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_statements_search ON statements USING GIN(search_vector)');
    console.log('✅ 인덱스 생성 완료');

    // 검색 트리거 생성
    console.log('\n📌 3단계: 검색 트리거 생성...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION statements_search_trigger() RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('simple', COALESCE(NEW.subject_name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(NEW.subject_organization, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(NEW.investigation_agency, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(NEW.transcript, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS statements_search_update ON statements;
      CREATE TRIGGER statements_search_update
        BEFORE INSERT OR UPDATE ON statements
        FOR EACH ROW EXECUTE FUNCTION statements_search_trigger()
    `);
    console.log('✅ 검색 트리거 생성 완료');

    // updated_at 트리거 생성
    console.log('\n📌 4단계: updated_at 트리거 생성...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_statements_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS statements_updated_at ON statements;
      CREATE TRIGGER statements_updated_at
        BEFORE UPDATE ON statements
        FOR EACH ROW EXECUTE FUNCTION update_statements_updated_at()
    `);
    console.log('✅ updated_at 트리거 생성 완료');

    // 테이블 확인
    console.log('\n📌 5단계: 테이블 확인...');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'statements'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 statements 테이블 구조:');
    console.table(result.rows);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 진술서 테이블 생성 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ 테이블 생성 실패:', error.message);
    console.error('상세:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createStatementsTable();
