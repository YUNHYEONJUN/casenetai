/**
 * 마이그레이션 005 실행 스크립트
 * 크레딧 잔액 음수 방지 CHECK 제약조건 추가
 * 
 * 사용법:
 *   node database/run-migration-005.js
 * 
 * 필수 환경변수:
 *   DATABASE_URL - PostgreSQL 연결 문자열
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('🔄 마이그레이션 005 시작...');
  console.log('📋 작업: 크레딧 잔액 CHECK 제약조건 추가');
  
  const client = await pool.connect();
  
  try {
    // 트랜잭션 시작
    await client.query('BEGIN');
    
    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, 'migrations', '005-add-balance-check.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 SQL 파일 로드 완료');
    
    // SQL 실행
    await client.query(sql);
    
    console.log('✅ CHECK 제약조건 추가 완료');
    
    // deduct_credit 함수 테스트
    const testUserId = '00000000-0000-0000-0000-000000000000'; // 테스트용 UUID
    const testResult = await client.query(
      'SELECT * FROM deduct_credit($1, $2)',
      [testUserId, 100]
    );
    
    console.log('✅ deduct_credit() 함수 생성 완료');
    
    // 커밋
    await client.query('COMMIT');
    
    console.log('');
    console.log('🎉 마이그레이션 005 완료!');
    console.log('');
    console.log('📊 추가된 제약조건:');
    console.log('  - chk_credits_balance_non_negative (balance >= 0)');
    console.log('  - chk_credits_free_trial_non_negative (free_trial_count >= 0)');
    console.log('');
    console.log('⚡ 추가된 함수:');
    console.log('  - deduct_credit(user_id, amount) → (new_balance, was_deducted)');
    console.log('');
    console.log('📝 사용 예시:');
    console.log("  SELECT * FROM deduct_credit('user-uuid', 1000);");
    console.log('');
    
  } catch (error) {
    // 롤백
    await client.query('ROLLBACK');
    
    console.error('❌ 마이그레이션 실패:', error.message);
    
    // 이미 제약조건이 존재하는 경우
    if (error.message.includes('already exists')) {
      console.log('');
      console.log('ℹ️  제약조건이 이미 존재합니다. 마이그레이션을 건너뜁니다.');
      console.log('');
    } else {
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// 환경 변수 확인
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
  console.error('   .env 파일을 확인해주세요.');
  process.exit(1);
}

// 마이그레이션 실행
runMigration()
  .then(() => {
    console.log('✅ 프로세스 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  });
