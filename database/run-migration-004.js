/**
 * 마이그레이션 004 실행: 사용자 피드백 시스템
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'casenetai.db');
const migrationPath = path.join(__dirname, 'migrations', '004-feedback-system.sql');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 마이그레이션 004: 사용자 피드백 시스템');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
  console.log('\n📋 생성된 테이블:');
  console.log('   1. anonymization_feedback - 사용자 피드백');
  console.log('   2. feedback_statistics - 피드백 통계 (일별 집계)');
  console.log('   3. learning_data - AI 학습 데이터');
  console.log('   4. improvement_suggestions - 개선 제안');

  // 테이블 확인
  db.all(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND (
      name='anonymization_feedback' OR 
      name='feedback_statistics' OR 
      name='learning_data' OR 
      name='improvement_suggestions'
    )
    ORDER BY name
  `, (err, tables) => {
    if (err) {
      console.error('❌ 테이블 확인 실패:', err);
    } else {
      console.log('\n🗂️  테이블 확인:');
      tables.forEach(table => {
        console.log(`   ✓ ${table.name}`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 준비 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    db.close();
  });
});
