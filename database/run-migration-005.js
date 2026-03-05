/**
 * 마이그레이션 005 실행: 크레딧 잔액 CHECK 제약조건 추가
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'casenetai.db');
const migrationPath = path.join(__dirname, 'migrations', '005-add-balance-check.sql');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 마이그레이션 005: 크레딧 잔액 CHECK 제약조건');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!fs.existsSync(dbPath)) {
  console.error('❌ 데이터베이스 파일이 없습니다:', dbPath);
  process.exit(1);
}

// DB 연결
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ DB 연결 실패:', err);
    process.exit(1);
  }
  console.log('✅ DB 연결 성공:', dbPath);
});

// 마이그레이션 SQL 읽기
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// 실행
db.exec(migrationSQL, (err) => {
  if (err) {
    console.error('❌ 마이그레이션 실패:', err);
    db.close();
    process.exit(1);
  }

  console.log('\n✅ 마이그레이션 완료!');
  console.log('\n📋 변경 사항:');
  console.log('   - credits 테이블에 CHECK 제약조건 추가');
  console.log('   - balance >= 0 (음수 방지)');
  console.log('   - total_purchased >= 0');
  console.log('   - total_used >= 0');
  console.log('   - total_bonus >= 0');
  console.log('   - free_trial_count >= 0');
  console.log('   - free_trial_used >= 0');

  // 제약조건 확인
  db.all(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='credits'
  `, (err, tables) => {
    if (err) {
      console.error('❌ 테이블 확인 실패:', err);
    } else {
      console.log('\n🗂️  테이블 정의 확인:');
      console.log(tables[0].sql);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 준비 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    db.close();
  });
});
