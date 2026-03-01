/**
 * 데이터베이스 무결성 검증 스크립트 (PostgreSQL/Supabase)
 * 
 * 사용법: node check-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 데이터베이스 무결성 검증 (PostgreSQL)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

(async () => {
  try {
    // 연결 확인
    const versionResult = await pool.query('SELECT version()');
    console.log('✅ DB 연결 성공');
    console.log(`   ${versionResult.rows[0].version.split(',')[0]}\n`);

    // 테이블 목록 조회
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`📋 테이블 목록 (${tables.length}개):`);
    tables.forEach(t => console.log(`   ✓ ${t}`));

    // 필수 테이블 확인
    const required = [
      'users', 'organizations', 'credits', 'transactions',
      'payments', 'usage_logs', 'sessions'
    ];

    const missing = required.filter(r => !tables.includes(r));
    
    if (missing.length > 0) {
      console.log(`\n❌ 누락된 필수 테이블: ${missing.join(', ')}`);
    } else {
      console.log('\n✅ 모든 필수 테이블 존재');
    }

    // 인덱스 개수 확인
    const indexResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);
    console.log(`\n📊 인덱스 개수: ${indexResult.rows[0].count}`);

    // 외래키 제약조건 확인
    const fkResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    `);
    console.log(`🔗 외래키 제약조건: ${fkResult.rows[0].count}개`);

    // CHECK 제약조건 확인
    const checkResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.table_constraints
      WHERE constraint_type = 'CHECK'
        AND table_schema = 'public'
    `);
    console.log(`✅ CHECK 제약조건: ${checkResult.rows[0].count}개`);

    // 데이터 통계
    console.log('\n📈 데이터 통계:');
    
    const statsQueries = [
      { label: '🏢 등록된 기관 수', table: 'organizations' },
      { label: '👥 등록된 사용자 수', table: 'users' },
      { label: '💰 크레딧 레코드 수', table: 'credits' },
    ];

    for (const q of statsQueries) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${q.table}`);
        console.log(`   ${q.label}: ${result.rows[0].count}`);
      } catch (e) {
        console.log(`   ${q.label}: (테이블 없음)`);
      }
    }

    // 관리자 계정 확인
    try {
      const adminResult = await pool.query(
        "SELECT email, role, is_approved FROM users WHERE role = 'system_admin'"
      );
      console.log(`\n🔐 관리자 계정: ${adminResult.rows.length}개`);
      adminResult.rows.forEach(a => {
        console.log(`   📧 ${a.email} (승인: ${a.is_approved ? '✅' : '❌'})`);
      });
    } catch (e) {
      console.log('\n🔐 관리자 계정: (조회 불가)');
    }

    // password_hash 누락 사용자 확인
    try {
      const noHashResult = await pool.query(
        "SELECT COUNT(*) as count FROM users WHERE password_hash IS NULL AND oauth_provider IS NULL"
      );
      const noHashCount = parseInt(noHashResult.rows[0].count, 10);
      if (noHashCount > 0) {
        console.log(`\n⚠️  비밀번호 해시 누락 사용자: ${noHashCount}명 (로그인 불가 상태)`);
      }
    } catch (e) {
      // 컬럼이 없을 수 있음
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 데이터베이스 검증 완료');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await pool.end();
  } catch (error) {
    console.error('❌ 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
