/**
 * 관리자 계정 설정 스크립트
 * Vercel에서 실행: POST /api/setup-admin (body에 key + email)
 * 로컬에서 실행: DATABASE_URL 환경변수 설정 후 node scripts/setup-admin.js
 */

require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DEFAULT_ADMIN_EMAIL = 'admin@casenetai.kr';
const DEFAULT_ADMIN_PASSWORD = 'CaseNet2026!@#';
const DEFAULT_ADMIN_NAME = 'System Admin';
const SALT_ROUNDS = 12;

/**
 * 관리자 계정 설정
 * @param {Object} poolOrDb - pg Pool 또는 Database 래퍼 객체
 */
async function setupAdmin(poolOrDb) {
  // Database 래퍼 객체인 경우 내부 pool 사용
  const pool = poolOrDb.pool || poolOrDb;
  const client = await pool.connect();

  try {
    console.log('1. password_hash 컬럼 추가...');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT');

    console.log('2. oauth_provider CHECK 제약조건 업데이트...');
    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_oauth_provider_check');
    await client.query(`ALTER TABLE users ADD CONSTRAINT users_oauth_provider_check CHECK (oauth_provider IN ('kakao', 'naver', 'google', 'local'))`);

    console.log('2b. 누락 테이블 생성...');
    await client.query(`CREATE TABLE IF NOT EXISTS organization_usage_quotas (
      id SERIAL PRIMARY KEY, organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      monthly_quota INTEGER DEFAULT 1000, used_this_month INTEGER DEFAULT 0,
      quota_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS anonymization_logs (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      original_length INTEGER, anonymized_length INTEGER, entities_found INTEGER DEFAULT 0,
      processing_time_ms INTEGER, status VARCHAR(50) DEFAULT 'completed', error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS anonymization_feedback (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      anonymization_log_id INTEGER REFERENCES anonymization_logs(id) ON DELETE SET NULL,
      rating INTEGER CHECK (rating >= 1 AND rating <= 5), comment TEXT,
      report_type VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('3. 기존 local 관리자 계정 및 관련 데이터 삭제...');
    const existing = await client.query(
      `SELECT id FROM users WHERE oauth_provider = 'local'`
    );
    for (const row of existing.rows) {
      await client.query('DELETE FROM credits WHERE user_id = $1', [row.id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
    }
    const deleted = await client.query(
      `DELETE FROM users WHERE oauth_provider = 'local' RETURNING id, oauth_email`
    );
    if (deleted.rows.length > 0) {
      deleted.rows.forEach(r => console.log(`   삭제됨: ${r.oauth_email} (id: ${r.id})`));
    }

    console.log('4. 새 관리자 계정 생성...');
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, SALT_ROUNDS);

    const result = await client.query(
      `INSERT INTO users (oauth_email, name, oauth_provider, oauth_id, role, is_approved, password_hash, service_type)
       VALUES ($1, $2, 'local', $3, 'system_admin', true, $4, 'elderly_protection')
       RETURNING id`,
      [DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME, 'admin_' + Date.now(), passwordHash]
    );

    const userId = result.rows[0].id;

    await client.query(
      `INSERT INTO credits (user_id, balance, free_trial_count)
       VALUES ($1, 10000000, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance = 10000000`,
      [userId]
    );

    console.log('완료!');
    return { success: true, email: DEFAULT_ADMIN_EMAIL, userId };

  } finally {
    client.release();
  }
}

// CLI 실행
if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  setupAdmin(pool)
    .then(result => {
      console.log('\n관리자 계정:', result.email);
      console.log('비밀번호:', DEFAULT_ADMIN_PASSWORD);
      process.exit(0);
    })
    .catch(err => {
      console.error('실패:', err.message);
      process.exit(1);
    });
}

module.exports = setupAdmin;
