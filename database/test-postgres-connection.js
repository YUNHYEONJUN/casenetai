/**
 * PostgreSQL 연결 테스트 스크립트
 * Supabase PostgreSQL 데이터베이스 연결 확인용
 */

require('dotenv').config();
const { Pool } = require('pg');

async function testConnection() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PostgreSQL 연결 테스트 시작...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 환경 변수 확인
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ 오류: DATABASE_URL 환경 변수가 설정되지 않았습니다!');
    console.error('\n📝 .env 파일에 다음을 추가하세요:');
    console.error('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres\n');
    process.exit(1);
  }

  console.log('✅ DATABASE_URL 환경 변수 확인됨');
  console.log(`📍 호스트: ${DATABASE_URL.split('@')[1]?.split('/')[0] || '비공개'}\n`);

  // PostgreSQL 연결 풀 생성
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Supabase는 SSL 필요
    }
  });

  try {
    // 1. 기본 연결 테스트
    console.log('1️⃣ 데이터베이스 연결 테스트...');
    const client = await pool.connect();
    console.log('   ✅ 연결 성공!\n');

    // 2. 버전 확인
    console.log('2️⃣ PostgreSQL 버전 확인...');
    const versionResult = await client.query('SELECT version()');
    const version = versionResult.rows[0].version;
    console.log(`   ✅ 버전: ${version.split(',')[0]}\n`);

    // 3. 현재 데이터베이스 확인
    console.log('3️⃣ 현재 데이터베이스 확인...');
    const dbResult = await client.query('SELECT current_database()');
    const dbName = dbResult.rows[0].current_database;
    console.log(`   ✅ 데이터베이스: ${dbName}\n`);

    // 4. 테이블 목록 확인
    console.log('4️⃣ 생성된 테이블 확인...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('   ⚠️  테이블이 없습니다. 스키마를 먼저 생성하세요!');
      console.log('   📝 Supabase SQL Editor에서 database/postgres-schema.sql 실행\n');
    } else {
      console.log(`   ✅ 총 ${tablesResult.rows.length}개 테이블 발견:`);
      tablesResult.rows.forEach(row => {
        console.log(`      - ${row.table_name}`);
      });
      console.log('');
    }

    // 5. 간단한 쿼리 테스트
    console.log('5️⃣ 쿼리 실행 테스트...');
    const testQuery = await client.query('SELECT 1 + 1 AS result');
    console.log(`   ✅ 쿼리 성공: 1 + 1 = ${testQuery.rows[0].result}\n`);

    // 연결 해제
    client.release();
    await pool.end();

    // 최종 결과
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 모든 테스트 통과!');
    console.log('✅ PostgreSQL 데이터베이스가 정상적으로 작동합니다.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📌 다음 단계:');
    console.log('1. database/db.js 파일 수정 (sqlite3 → pg)');
    console.log('2. SQL 쿼리 문법 수정');
    console.log('3. 로컬 서버 실행 테스트: npm start');
    console.log('4. Vercel 배포\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    console.error('\n🔧 해결 방법:');
    console.error('1. DATABASE_URL이 올바른지 확인');
    console.error('2. Supabase 프로젝트가 활성화되었는지 확인');
    console.error('3. 비밀번호가 정확한지 확인');
    console.error('4. 방화벽/네트워크 설정 확인\n');
    
    await pool.end();
    process.exit(1);
  }
}

// 스크립트 실행
testConnection();
