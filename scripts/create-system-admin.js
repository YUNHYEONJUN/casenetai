/**
 * System Admin 계정 생성 스크립트
 * 
 * 사용법:
 *   node scripts/create-system-admin.js <oauth_provider> <oauth_id> <name> <email>
 * 
 * 예시:
 *   node scripts/create-system-admin.js kakao 123456789 "관리자" admin@casenetai.com
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 명령행 인자 파싱
const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('❌ 사용법: node scripts/create-system-admin.js <oauth_provider> <oauth_id> <name> <email>');
  console.error('예시: node scripts/create-system-admin.js kakao 123456789 "관리자" admin@casenetai.com');
  process.exit(1);
}

const [oauth_provider, oauth_id, name, email] = args;

// 유효성 검사
if (!['kakao', 'naver'].includes(oauth_provider)) {
  console.error('❌ oauth_provider는 "kakao" 또는 "naver"여야 합니다');
  process.exit(1);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ 올바른 이메일 형식이 아닙니다');
  process.exit(1);
}

// DB 연결
const dbPath = path.join(__dirname, '../database/casenetai.db');
const db = new sqlite3.Database(dbPath);

console.log('📁 DB 경로:', dbPath);
console.log('');
console.log('🔧 System Admin 계정 생성 중...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  OAuth Provider: ${oauth_provider}`);
console.log(`  OAuth ID: ${oauth_id}`);
console.log(`  이름: ${name}`);
console.log(`  이메일: ${email}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// 트랜잭션으로 안전하게 실행
db.serialize(() => {
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('❌ 트랜잭션 시작 실패:', err.message);
      process.exit(1);
    }

    // 1. 기존 사용자 확인
    db.get(
      `SELECT id, role FROM users 
       WHERE oauth_provider = ? AND oauth_id = ?`,
      [oauth_provider, oauth_id],
      (err, existingUser) => {
        if (err) {
          console.error('❌ 사용자 확인 실패:', err.message);
          db.run('ROLLBACK');
          db.close();
          process.exit(1);
        }

        if (existingUser) {
          // 기존 사용자가 있으면 역할만 업데이트
          console.log(`⚠️  기존 사용자 발견 (ID: ${existingUser.id})`);
          console.log(`   현재 역할: ${existingUser.role}`);
          console.log('');
          
          if (existingUser.role === 'system_admin') {
            console.log('✅ 이미 System Admin 권한을 가지고 있습니다');
            db.run('COMMIT');
            db.close();
            process.exit(0);
          }
          
          console.log('🔄 System Admin으로 권한 업그레이드 중...');
          
          db.run(
            `UPDATE users 
             SET role = 'system_admin', is_active = 1, is_approved = 1
             WHERE id = ?`,
            [existingUser.id],
            function(err) {
              if (err) {
                console.error('❌ 권한 업데이트 실패:', err.message);
                db.run('ROLLBACK');
                db.close();
                process.exit(1);
              }

              // Audit Log 기록
              db.run(
                `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
                 VALUES (?, 'system_admin_created', 'user', ?, ?)`,
                [
                  existingUser.id,
                  existingUser.id,
                  JSON.stringify({
                    previous_role: existingUser.role,
                    new_role: 'system_admin',
                    method: 'create-system-admin script'
                  })
                ],
                (err) => {
                  if (err) {
                    console.error('⚠️  Audit Log 기록 실패:', err.message);
                    // Audit Log 실패는 치명적이지 않으므로 계속 진행
                  }

                  db.run('COMMIT', (err) => {
                    if (err) {
                      console.error('❌ 커밋 실패:', err.message);
                      db.run('ROLLBACK');
                      db.close();
                      process.exit(1);
                    }

                    console.log('');
                    console.log('✅ System Admin 권한이 부여되었습니다!');
                    console.log('');
                    console.log('📋 계정 정보:');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log(`  사용자 ID: ${existingUser.id}`);
                    console.log(`  OAuth Provider: ${oauth_provider}`);
                    console.log(`  OAuth ID: ${oauth_id}`);
                    console.log(`  이름: ${name}`);
                    console.log(`  이메일: ${email}`);
                    console.log(`  역할: system_admin`);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('');
                    console.log('🔐 이제 이 계정으로 로그인하여 System Admin 기능을 사용할 수 있습니다');

                    db.close();
                    process.exit(0);
                  });
                }
              );
            }
          );
          return;
        }

        // 2. 신규 사용자 생성
        console.log('👤 신규 System Admin 계정 생성 중...');
        
        db.run(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, email, role,
            is_active, is_approved,
            service_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            oauth_provider,
            oauth_id,
            name,
            name,
            email,
            'system_admin',
            1,  // is_active
            1,  // is_approved
            'elderly_protection'
          ],
          function(err) {
            if (err) {
              console.error('❌ 사용자 생성 실패:', err.message);
              db.run('ROLLBACK');
              db.close();
              process.exit(1);
            }

            const userId = this.lastID;

            // 3. 크레딧 초기화
            db.run(
              `INSERT INTO credits (user_id, balance, free_trial_count)
               VALUES (?, 0, 100)`,  // System Admin은 무료 체험 100회
              [userId],
              (err) => {
                if (err) {
                  console.error('❌ 크레딧 초기화 실패:', err.message);
                  db.run('ROLLBACK');
                  db.close();
                  process.exit(1);
                }

                // 4. Audit Log 기록
                db.run(
                  `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
                   VALUES (?, 'system_admin_created', 'user', ?, ?)`,
                  [
                    userId,
                    userId,
                    JSON.stringify({
                      oauth_provider,
                      oauth_id,
                      name,
                      email,
                      method: 'create-system-admin script'
                    })
                  ],
                  (err) => {
                    if (err) {
                      console.error('⚠️  Audit Log 기록 실패:', err.message);
                      // Audit Log 실패는 치명적이지 않으므로 계속 진행
                    }

                    // 5. 커밋
                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('❌ 커밋 실패:', err.message);
                        db.run('ROLLBACK');
                        db.close();
                        process.exit(1);
                      }

                      console.log('');
                      console.log('✅ System Admin 계정이 생성되었습니다!');
                      console.log('');
                      console.log('📋 계정 정보:');
                      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                      console.log(`  사용자 ID: ${userId}`);
                      console.log(`  OAuth Provider: ${oauth_provider}`);
                      console.log(`  OAuth ID: ${oauth_id}`);
                      console.log(`  이름: ${name}`);
                      console.log(`  이메일: ${email}`);
                      console.log(`  역할: system_admin`);
                      console.log(`  무료 체험: 100회`);
                      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                      console.log('');
                      console.log('📝 다음 단계:');
                      console.log('  1. 카카오 또는 네이버로 로그인');
                      console.log('  2. System Admin 기능 접근 가능');
                      console.log('  3. 기관 및 관리자 계정 관리');
                      console.log('');
                      console.log('🔐 주의: System Admin은 최고 권한을 가지므로 신중히 관리하세요!');

                      db.close();
                      process.exit(0);
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});
