/**
 * 관리자 계정 생성 스크립트 (SQLite - 로컬 개발용)
 * 
 * 사용법:
 *   ADMIN_EMAIL=admin@casenetai.kr ADMIN_PASSWORD=YourSecurePass! node create-admin.js
 * 
 * ⚠️ 프로덕션 환경에서는 create-admin-postgres.js를 사용하세요.
 * ⚠️ 비밀번호는 반드시 환경 변수로 전달해야 합니다.
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database', 'casenetai.db');
const BCRYPT_SALT_ROUNDS = 12;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 관리자 계정 생성 (SQLite)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 환경 변수 검증 — 기본값 fallback 완전 제거
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || 'System Admin';

if (!adminEmail || !adminPassword) {
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다!');
  console.error('');
  console.error('사용법:');
  console.error('  ADMIN_EMAIL=admin@casenetai.kr \\');
  console.error('  ADMIN_PASSWORD=YourSecurePassword! \\');
  console.error('  node create-admin.js');
  console.error('');
  process.exit(1);
}

if (adminPassword.length < 8) {
  console.error('❌ 비밀번호는 최소 8자 이상이어야 합니다.');
  process.exit(1);
}

// 데이터베이스 연결
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 연결 실패:', err);
    process.exit(1);
  }
  console.log('✅ 데이터베이스 연결 성공\n');
});

// 비밀번호 해싱 및 관리자 생성 (salt rounds: 12)
bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS, (err, hash) => {
  if (err) {
    console.error('❌ 비밀번호 해싱 실패:', err);
    process.exit(1);
  }
  
  console.log(`✅ 비밀번호 해싱 완료 (bcrypt salt rounds: ${BCRYPT_SALT_ROUNDS})\n`);
  
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
                  console.log(`   비밀번호: (환경 변수 ADMIN_PASSWORD 참조)`);
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
