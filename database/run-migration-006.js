/**
 * Migration 006 실행 스크립트
 * 소셜 로그인 전용 + 3단계 권한 시스템
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'casenetai.db');
const MIGRATION_FILE = path.join(__dirname, 'migrations/006-social-login-only.sql');

async function runMigration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Migration 006: 소셜 로그인 전용 시스템');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 1. DB 백업
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = path.join(__dirname, `casenetai_backup_${timestamp}.db`);
  
  try {
    if (fs.existsSync(DB_PATH)) {
      console.log(`📦 DB 백업 중: ${backupPath}`);
      fs.copyFileSync(DB_PATH, backupPath);
      console.log('✅ 백업 완료\n');
    } else {
      console.log('⚠️  기존 DB 파일이 없습니다. 새로 생성합니다.\n');
    }
  } catch (error) {
    console.error('❌ 백업 실패:', error.message);
    process.exit(1);
  }
  
  // 2. Migration SQL 읽기
  let migrationSQL;
  try {
    migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');
    console.log(`📄 Migration 파일 로드: ${MIGRATION_FILE}`);
  } catch (error) {
    console.error('❌ Migration 파일 읽기 실패:', error.message);
    process.exit(1);
  }
  
  // 3. Migration 실행
  const db = new sqlite3.Database(DB_PATH);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('\n🔧 Migration 실행 중...\n');
      
      db.exec(migrationSQL, (err) => {
        if (err) {
          console.error('\n❌ Migration 실행 실패:', err.message);
          console.error('\n💡 백업 파일로 복구하려면:');
          console.error(`   cp ${backupPath} ${DB_PATH}`);
          db.close();
          reject(err);
          return;
        }
        
        // 4. 결과 확인
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
          if (err) {
            console.error('❌ 테이블 조회 실패:', err.message);
            db.close();
            reject(err);
            return;
          }
          
          console.log('✅ Migration 완료!\n');
          console.log('📊 생성된 테이블:');
          tables.forEach(table => {
            console.log(`   - ${table.name}`);
          });
          
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ Migration 006 완료');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          console.log('📝 주요 변경사항:');
          console.log('   1. users 테이블: OAuth 전용으로 변경');
          console.log('   2. organization_join_requests 테이블 생성');
          console.log('   3. audit_logs 테이블 생성');
          console.log('   4. organizations 테이블 강화\n');
          
          console.log('⚠️  다음 단계:');
          console.log('   1. System Admin 계정 생성 필요');
          console.log('   2. OAuth 로그인 설정 확인');
          console.log('   3. 기존 이메일/비밀번호 사용자는 삭제됨\n');
          
          db.close();
          resolve();
        });
      });
    });
  });
}

// 실행
runMigration()
  .then(() => {
    console.log('🎉 모든 작업이 완료되었습니다!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration 실패:', error);
    process.exit(1);
  });
