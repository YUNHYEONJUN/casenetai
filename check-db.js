const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database/casenetai.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 데이터베이스 무결성 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
  if (err) {
    console.error('❌ 오류:', err);
    db.close();
    return;
  }

  console.log('📋 테이블 목록 (' + tables.length + '개):');
  tables.forEach(t => console.log('   ✓', t.name));

  // 필수 테이블 확인
  const required = [
    'users', 'organizations', 'anonymization_logs', 
    'organization_usage_quotas', 'anonymization_feedback', 
    'feedback_statistics', 'learning_data', 'improvement_suggestions'
  ];

  const missing = required.filter(r => !tables.find(t => t.name === r));
  
  if (missing.length > 0) {
    console.log('\n❌ 누락된 테이블:', missing.join(', '));
  } else {
    console.log('\n✅ 모든 필수 테이블 존재');
  }

  // 인덱스 확인
  db.all("SELECT name, tbl_name FROM sqlite_master WHERE type='index'", (err, indexes) => {
    if (err) {
      console.error('❌ 인덱스 조회 오류:', err);
    } else {
      console.log('\n📊 인덱스 개수:', indexes.length);
    }
    
    // 데이터 확인
    db.get("SELECT COUNT(*) as count FROM organizations", (err, row) => {
      if (!err) {
        console.log('\n🏢 등록된 기관 수:', row.count);
      }
      
      db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (!err) {
          console.log('👥 등록된 사용자 수:', row.count);
        }
        
        db.close();
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      });
    });
  });
});
