const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.lsrfzqgvtaxjqnhtzebz:pPJXJ7%25A6tGdGvH@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres',
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
    process.exit(1);
  }
}

testConnection();
