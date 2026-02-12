/**
 * 데이터베이스 마이그레이션 실행 스크립트
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDB } = require('../database/db');

async function runMigration(migrationFile) {
  console.log(`🔄 마이그레이션 실행 중: ${migrationFile}`);
  
  const db = getDB();
  const migrationPath = path.join(__dirname, '..', 'database', 'migrations', migrationFile);
  
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // SQL을 세미콜론으로 분리하여 실행
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));
    
    for (const statement of statements) {
      if (statement) {
        await db.query(statement);
      }
    }
    
    console.log(`✅ 마이그레이션 완료: ${migrationFile}\n`);
    
  } catch (error) {
    console.error(`❌ 마이그레이션 실패: ${migrationFile}`);
    console.error('   에러:', error.message);
    throw error;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗄️  데이터베이스 마이그레이션');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // 마이그레이션 파일 목록
    const migrations = [
      '001_add_email_password_columns.sql'
    ];
    
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    console.log('✅ 모든 마이그레이션이 완료되었습니다!\n');
    
  } catch (error) {
    console.error('❌ 마이그레이션 중 오류 발생:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
