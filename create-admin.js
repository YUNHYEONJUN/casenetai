/**
 * 관리자 계정 생성 스크립트
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database', 'casenetai.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 관리자 계정 생성');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 관리자 정보 - 환경 변수 또는 커맨드 라인 입력으로 변경
const adminEmail = process.env.ADMIN_EMAIL || 'admin@casenetai.com';
const adminPassword = process.env.ADMIN_PASSWORD || (() => {
  // 비밀번호가 환경 변수에 없으면 경고 메시지 출력
  console.error('\n⚠️  경고: ADMIN_PASSWORD 환경 변수가 설정되지 않았습니다!');
  console.error('   보안을 위해 환경 변수로 설정하세요: ADMIN_PASSWORD=your_secure_password\n');
  return 'ChangeMe123!@#'; // 임시 기본값 (반드시 변경 필요)
})();
const adminName = process.env.ADMIN_NAME || 'System Admin';

// 데이터베이스 연결
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 연결 실패:', err);
    process.exit(1);
  }
  console.log('✅ 데이터베이스 연결 성공\n');
});

// 비밀번호 해싱 및 관리자 생성
bcrypt.hash(adminPassword, 10, (err, hash) => {
  if (err) {
    console.error('❌ 비밀번호 해싱 실패:', err);
    process.exit(1);
  }
  
  console.log('✅ 비밀번호 해싱 완료\n');
  
  // 기존 관리자 계정 삭제
  db.run('DELETE FROM users WHERE email = ?', [adminEmail], (err) => {
    if (err) {
      console.error('❌ 기존 계정 삭제 실패:', err);
    }
    
    // 새 관리자 계정 생성
    db.run(
      `INSERT INTO users (email, password_hash, name, role, is_email_verified, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [adminEmail, hash, adminName, 'system_admin', 1],
      function(err) {
        if (err) {
          console.error('❌ 관리자 계정 생성 실패:', err);
          db.close();
          process.exit(1);
        }
        
        const adminId = this.lastID;
        console.log('✅ 관리자 계정 생성 완료');
        console.log(`   ID: ${adminId}`);
        console.log(`   이메일: ${adminEmail}`);
        console.log(`   비밀번호: ********** (보안상 표시 안 함)`);
        console.log(`   이름: ${adminName}`);
        console.log(`   권한: system_admin\n`);
        
        // 관리자 크레딧 생성
        db.run(
          `INSERT OR REPLACE INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [adminId, 1000000, 0, 0, 0],
          (err) => {
            if (err) {
              console.error('❌ 크레딧 생성 실패:', err);
            } else {
              console.log('✅ 관리자 크레딧 생성 완료');
              console.log('   잔액: 1,000,000원\n');
            }
            
            // 계정 확인
            db.get(
              'SELECT id, email, name, role, is_email_verified FROM users WHERE id = ?',
              [adminId],
              (err, user) => {
                if (err) {
                  console.error('❌ 계정 확인 실패:', err);
                } else {
                  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  console.log('✨ 관리자 계정이 준비되었습니다!');
                  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                  console.log('📝 로그인 정보:');
                  console.log(`   URL: http://localhost:3000/login.html`);
                  console.log(`   이메일: ${adminEmail}`);
                  console.log(`   비밀번호: (보안상 표시 안 함 - 환경 변수 확인)`);
                  console.log('\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
                }
                
                db.close();
              }
            );
          }
        );
      }
    );
  });
});
