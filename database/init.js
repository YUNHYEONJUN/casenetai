/**
 * 데이터베이스 초기화 스크립트
 * SQLite3를 사용한 로컬 개발 환경
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'casenetai.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🗄️  데이터베이스 초기화 시작');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 기존 DB 파일 삭제 (개발 환경)
if (fs.existsSync(DB_PATH)) {
  console.log('⚠️  기존 데이터베이스 파일 삭제:', DB_PATH);
  fs.unlinkSync(DB_PATH);
}

// 새 DB 생성
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 생성 실패:', err);
    process.exit(1);
  }
  console.log('✅ 데이터베이스 파일 생성:', DB_PATH);
});

// 스키마 파일 읽기
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

// 스키마 실행
db.exec(schema, (err) => {
  if (err) {
    console.error('❌ 스키마 실행 실패:', err);
    process.exit(1);
  }
  
  console.log('✅ 스키마 실행 완료');
  
  // 테이블 목록 확인
  db.all(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    [],
    (err, tables) => {
      if (err) {
        console.error('❌ 테이블 조회 실패:', err);
        process.exit(1);
      }
      
      console.log('\n📊 생성된 테이블 목록:');
      tables.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table.name}`);
      });
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✨ 데이터베이스 초기화 완료!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      db.close();
    }
  );
});
