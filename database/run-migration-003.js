/**
 * 마이그레이션 003 실행 스크립트
 * - 사용 시간 추적 테이블 생성
 */

const fs = require('fs');
const path = require('path');
const { getDB } = require('./db');

async function runMigration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 마이그레이션 003 실행: 사용 시간 추적 테이블 생성');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const db = getDB();
  
  try {
    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, 'migrations', '003_add_usage_tracking.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // SQL 문을 파싱 (CREATE, ALTER, INSERT 등을 구분)
    const lines = sql.split('\n');
    let currentStatement = '';
    const statements = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 주석 라인 무시
      if (trimmed.startsWith('--')) continue;
      
      currentStatement += line + '\n';
      
      // 세미콜론으로 끝나면 하나의 statement 완성
      if (trimmed.endsWith(';')) {
        const cleanStmt = currentStatement.trim();
        if (cleanStmt.length > 0 && !cleanStmt.startsWith('--')) {
          statements.push(cleanStmt);
        }
        currentStatement = '';
      }
    }
    
    console.log(`📝 ${statements.length}개의 SQL 문 실행 중...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      try {
        await db.run(stmt);
        
        // 테이블 생성이나 ALTER 문인 경우만 로그 출력
        if (stmt.toLowerCase().includes('create table')) {
          const match = stmt.match(/create table if not exists (\w+)/i);
          if (match) {
            console.log(`✅ 테이블 생성: ${match[1]}`);
          }
        } else if (stmt.toLowerCase().includes('alter table')) {
          const match = stmt.match(/alter table (\w+)/i);
          if (match) {
            console.log(`✅ 테이블 수정: ${match[1]}`);
          }
        } else if (stmt.toLowerCase().includes('create index')) {
          const match = stmt.match(/create index (?:if not exists )?(\w+)/i);
          if (match) {
            console.log(`✅ 인덱스 생성: ${match[1]}`);
          }
        }
      } catch (error) {
        // ALTER TABLE 에러는 이미 컬럼이 존재하는 경우일 수 있으므로 무시
        if (error.message.includes('duplicate column name')) {
          console.log(`⚠️  컬럼이 이미 존재합니다 (무시)`);
        } else if (error.message.includes('already exists')) {
          console.log(`⚠️  이미 존재합니다 (무시)`);
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 마이그레이션 003 완료');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 테이블 확인
    const tables = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    console.log('📊 데이터베이스 테이블 목록:');
    tables.forEach(table => {
      console.log(`   - ${table.name}`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  }
}

runMigration();
