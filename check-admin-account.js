require('dotenv').config();
const { Pool } = require('pg');

// 여러 가능한 연결 문자열 시도
const connectionStrings = [
  process.env.DATABASE_URL,
  'postgresql://postgres.lsrfzqgvtaxjqnhtzebz:QygHI7sKcKIKTvJb@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.lsrfzqgvtaxjqnhtzebz:pPJXJ7%25A6tGdGvH@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres'
];

async function tryConnection(connString) {
  const pool = new Pool({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ 연결 성공:', connString.replace(/:[^:@]+@/, ':****@'));
    
    // 관리자 계정 확인
    const users = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.oauth_email,
        u.name,
        u.role,
        u.is_approved,
        u.password_hash IS NOT NULL as has_password,
        LENGTH(u.password_hash) as password_length,
        u.oauth_provider
      FROM users u
      WHERE u.email = 'admin@casenetai.kr' OR u.oauth_email = 'admin@casenetai.kr'
    `);
    
    if (users.rows.length > 0) {
      console.log('\n📋 관리자 계정 정보:');
      users.rows.forEach(user => {
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email || 'null'}`);
        console.log(`   OAuth Email: ${user.oauth_email || 'null'}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Approved: ${user.is_approved}`);
        console.log(`   Has Password: ${user.has_password}`);
        console.log(`   Password Length: ${user.password_length}`);
        console.log(`   OAuth Provider: ${user.oauth_provider}`);
      });
    } else {
      console.log('\n❌ 관리자 계정 없음');
    }
    
    // 모든 사용자 수 확인
    const count = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n📊 전체 사용자 수: ${count.rows[0].count}`);
    
    await pool.end();
    return true;
  } catch (error) {
    console.log('❌ 연결 실패:', error.message);
    await pool.end();
    return false;
  }
}

(async () => {
  console.log('🔍 데이터베이스 연결 시도 중...\n');
  
  for (const connString of connectionStrings) {
    const success = await tryConnection(connString);
    if (success) {
      process.exit(0);
    }
    console.log('\n---\n');
  }
  
  console.log('❌ 모든 연결 시도 실패');
  process.exit(1);
})();
