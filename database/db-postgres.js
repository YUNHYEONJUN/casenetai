/**
 * PostgreSQL 데이터베이스 연결 및 헬퍼 함수
 * Supabase PostgreSQL용
 */

const { Pool } = require('pg');

// DATABASE_URL 필수 검증
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

// PostgreSQL 연결 풀 생성
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Supabase는 SSL 필요, 프로덕션에서는 true 권장
  },
  // 연결 풀 설정 (Vercel serverless 환경 최적화)
  max: 20, // 최대 연결 수
  min: 2, // 최소 연결 유지
  idleTimeoutMillis: 30000, // 유휴 연결 타임아웃 (30초)
  connectionTimeoutMillis: 10000, // 연결 타임아웃 (10초)
  // Statement timeout 설정 (10초)
  statement_timeout: 10000,
  // Idle in transaction timeout (30초)
  idle_in_transaction_session_timeout: 30000
});

// 연결 풀 오류 핸들링
pool.on('error', (err) => {
  console.error('❌ PostgreSQL 풀 오류:', err);
});

class Database {
  constructor() {
    this.pool = pool;
    console.log('✅ PostgreSQL 연결 풀 초기화 완료');
  }

  /**
   * Promise 기반 쿼리 실행 (SELECT)
   * @param {string} sql - SQL 쿼리
   * @param {Array} params - 쿼리 파라미터
   * @returns {Promise<Array>} - 결과 rows
   */
  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      // PostgreSQL은 $1, $2 형식 사용 (SQLite는 ? 사용)
      const result = await client.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('❌ Query 오류:', error.message);
      console.error('   SQL:', sql);
      console.error('   Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Promise 기반 단일 row 조회
   * @param {string} sql - SQL 쿼리
   * @param {Array} params - 쿼리 파라미터
   * @returns {Promise<Object|undefined>} - 단일 row 또는 undefined
   */
  async get(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0]; // 첫 번째 row 반환 (없으면 undefined)
  }

  /**
   * Promise 기반 실행 (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL 쿼리
   * @param {Array} params - 쿼리 파라미터
   * @returns {Promise<Object>} - { lastID, changes }
   */
  async run(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      
      // PostgreSQL RETURNING 절로 INSERT ID 가져오기
      return {
        lastID: result.rows[0]?.id || null, // INSERT ... RETURNING id
        changes: result.rowCount // 영향받은 행 수
      };
    } catch (error) {
      console.error('❌ Run 오류:', error.message);
      console.error('   SQL:', sql);
      console.error('   Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 트랜잭션 실행
   * @param {Function} callback - 트랜잭션 내에서 실행할 함수
   * @returns {Promise<any>} - callback 반환값
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 트랜잭션 롤백:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 트랜잭션 시작 (레거시 호환)
   */
  async beginTransaction() {
    // PostgreSQL에서는 transaction() 메서드 사용 권장
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return client;
  }

  /**
   * 트랜잭션 커밋 (레거시 호환)
   */
  async commit(client) {
    if (client) {
      await client.query('COMMIT');
      client.release();
    }
  }

  /**
   * 트랜잭션 롤백 (레거시 호환)
   */
  async rollback(client) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  /**
   * 연결 풀 종료
   */
  async close() {
    await this.pool.end();
    console.log('✅ PostgreSQL 연결 풀 종료');
  }

  /**
   * 헬스 체크
   */
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 AS health');
      return result[0].health === 1;
    } catch (error) {
      console.error('❌ 헬스 체크 실패:', error.message);
      return false;
    }
  }
}

// 싱글톤 인스턴스
let dbInstance = null;

/**
 * 데이터베이스 인스턴스 가져오기
 * @returns {Database}
 */
function getDB() {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

/**
 * 직접 연결 풀 접근 (고급 사용)
 * @returns {Pool}
 */
function getPool() {
  return pool;
}

module.exports = {
  getDB,
  getPool,
  Database
};
