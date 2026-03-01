require('dotenv').config();
const { Pool } = require('pg');

// 환경 변수에서 DATABASE_URL 읽기
if (!process.env.DATABASE_URL) {
  console.error('❌ 오류: DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  console.error('📝 .env 파일에 다음을 추가하세요:');
  console.error('   DATABASE_URL=postgresql://user:password@host:port/database');
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
    process.exit(0);
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error.message);
    console.error('상세:', error);
    process.exit(1);
  }
}

testConnection();
