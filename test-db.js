/**
 * PostgreSQL 연결 테스트 스크립트
 * 
 * 사용법: node test-db.js
 * 
 * ⚠️ DATABASE_URL 환경 변수가 .env에 설정되어 있어야 합니다.
 */

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  console.error('');
  console.error('.env 파일에 다음을 추가하세요:');
  console.error('  DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres');
  console.error('');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL 연결 성공!');
    
    const result = await client.query('SELECT NOW()');
    console.log('⏰ 현재 시간:', result.rows[0].now);
    
    const users = await client.query('SELECT COUNT(*) FROM users');
    console.log('👥 Users 테이블 레코드 수:', users.rows[0].count);
    
    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testConnection();
