require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('📡 데이터베이스 연결 테스트 중...\n');
    console.log('🔗 연결 문자열:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
    
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('\n✅ 연결 성공!');
    console.log('⏰ 서버 시간:', result.rows[0].current_time);
    
    // 사용자 테이블 확인
    const users = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log('👤 등록된 사용자 수:', users.rows[0].count);
    
    // 관리자 계정 확인
    const admins = await pool.query("SELECT email, name, role FROM users WHERE email IN ('admin@casenetai.kr', 'dev@casenetai.kr', 'test@casenetai.kr')");
    console.log('\n📋 기존 테스트 계정:');
    if (admins.rows.length > 0) {
      admins.rows.forEach(admin => {
        console.log(`   - ${admin.email} (${admin.name}, ${admin.role})`);
      });
    } else {
      console.log('   없음 - 새로 생성이 필요합니다.');
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 연결 실패:', error.message);
    console.error('   에러 코드:', error.code);
    await pool.end();
    process.exit(1);
  }
})();
