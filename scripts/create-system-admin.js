/**
 * System Admin 계정 생성 스크립트 (PostgreSQL용)
 * 
 * 사용법:
 *   node scripts/create-system-admin.js <oauth_provider> <oauth_id> <name> <email>
 * 
 * 예시:
 *   node scripts/create-system-admin.js kakao 123456789 "관리자" admin@casenetai.com
 */

require('dotenv').config();
const db = require('../database/db');

// 명령행 인자 파싱
const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('❌ 사용법: node scripts/create-system-admin.js <oauth_provider> <oauth_id> <name> <email>');
  console.error('예시 (카카오): node scripts/create-system-admin.js kakao 123456789 "관리자" admin@casenetai.com');
  console.error('예시 (네이버): node scripts/create-system-admin.js naver abc123def456 "관리자" admin@casenetai.com');
  console.error('예시 (구글): node scripts/create-system-admin.js google 123456789012345678901 "관리자" admin@casenetai.com');
  process.exit(1);
}

const [oauth_provider, oauth_id, name, email] = args;

// 유효성 검사
if (!['kakao', 'naver', 'google'].includes(oauth_provider)) {
  console.error('❌ oauth_provider는 "kakao", "naver", 또는 "google"이어야 합니다');
  process.exit(1);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ 올바른 이메일 형식이 아닙니다');
  process.exit(1);
}

console.log('');
console.log('🔧 System Admin 계정 생성 중...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  OAuth Provider: ${oauth_provider}`);
console.log(`  OAuth ID: ${oauth_id}`);
console.log(`  이름: ${name}`);
console.log(`  이메일: ${email}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// 메인 실행 함수
async function createSystemAdmin() {
  try {
    // 트랜잭션 시작
    await db.query('BEGIN');

    // 1. 기존 사용자 확인
    const existingUser = await db.get(
      `SELECT id, role FROM users 
       WHERE oauth_provider = $1 AND oauth_id = $2`,
      [oauth_provider, oauth_id]
    );

    if (existingUser) {
      // 기존 사용자가 있으면 역할만 업데이트
      console.log(`⚠️  기존 사용자 발견 (ID: ${existingUser.id})`);
      console.log(`   현재 역할: ${existingUser.role}`);
      console.log('');
      
      if (existingUser.role === 'system_admin') {
        console.log('✅ 이미 System Admin 권한을 가지고 있습니다');
        await db.query('COMMIT');
        await db.close();
        process.exit(0);
      }
      
      console.log('🔄 System Admin으로 권한 업그레이드 중...');
      
      await db.run(
        `UPDATE users 
         SET role = $1, is_active = $2, is_approved = $3
         WHERE id = $4`,
        ['system_admin', true, true, existingUser.id]
      );

      // Audit Log 기록
      try {
        await db.run(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            existingUser.id,
            'system_admin_created',
            'user',
            existingUser.id,
            JSON.stringify({
              previous_role: existingUser.role,
              new_role: 'system_admin',
              method: 'create-system-admin script'
            })
          ]
        );
      } catch (auditErr) {
        console.error('⚠️  Audit Log 기록 실패:', auditErr.message);
        // Audit Log 실패는 치명적이지 않으므로 계속 진행
      }

      await db.query('COMMIT');

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

      await db.close();
      process.exit(0);
    }

    // 2. 신규 사용자 생성
    console.log('👤 신규 System Admin 계정 생성 중...');
    
    const userResult = await db.run(
      `INSERT INTO users (
        oauth_provider, oauth_id, oauth_nickname,
        name, email, role,
        is_active, is_approved,
        service_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        oauth_provider,
        oauth_id,
        name,
        name,
        email,
        'system_admin',
        true,  // is_active
        true,  // is_approved
        'elderly_protection'
      ]
    );

    const userId = userResult.lastID;

    // 3. 크레딧 초기화
    await db.run(
      `INSERT INTO credits (user_id, balance, free_trial_count)
       VALUES ($1, $2, $3)`,
      [userId, 0, 100]  // System Admin은 무료 체험 100회
    );

    // 4. Audit Log 기록
    try {
      await db.run(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          'system_admin_created',
          'user',
          userId,
          JSON.stringify({
            oauth_provider,
            oauth_id,
            name,
            email,
            method: 'create-system-admin script'
          })
        ]
      );
    } catch (auditErr) {
      console.error('⚠️  Audit Log 기록 실패:', auditErr.message);
      // Audit Log 실패는 치명적이지 않으므로 계속 진행
    }

    // 5. 커밋
    await db.query('COMMIT');

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

    await db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error(error.stack);
    
    try {
      await db.query('ROLLBACK');
      await db.close();
    } catch (rollbackError) {
      console.error('❌ 롤백 실패:', rollbackError.message);
    }
    
    process.exit(1);
  }
}

// 실행
createSystemAdmin();
