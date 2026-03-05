/**
 * 시스템 관리자 계정 생성 스크립트
 * 
 * 사용법:
 * node scripts/create-system-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { getDB } = require('../database/db');

const SALT_ROUNDS = 12;

async function createSystemAdmin() {
  console.log('🔐 시스템 관리자 계정 생성 중...\n');
  
  const db = getDB();
  
  try {
    // 관리자 정보
    const adminEmail = 'admin@casenetai.kr';
    const adminPassword = 'CaseNetAI2024!Admin'; // 초기 비밀번호 (변경 필요!)
    const adminName = '시스템 관리자';
    
    // 기존 관리자 확인
    const existing = await db.get(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );
    
    if (existing) {
      console.log('⚠️  이미 시스템 관리자 계정이 존재합니다.');
      console.log(`   이메일: ${adminEmail}`);
      
      // 역할을 system_admin으로 업데이트
      await db.run(
        `UPDATE users 
         SET role = 'system_admin', is_approved = true 
         WHERE email = $1`,
        [adminEmail]
      );
      
      console.log('✅ 역할을 system_admin으로 업데이트했습니다.\n');
      return;
    }
    
    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    
    // 관리자 생성
    const result = await db.run(
      `INSERT INTO users (
        email, password, name, role, is_approved, 
        email_verified, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING id`,
      [adminEmail, hashedPassword, adminName, 'system_admin', true, true]
    );
    
    console.log('✅ 시스템 관리자 계정이 생성되었습니다!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 이메일:', adminEmail);
    console.log('🔑 비밀번호:', adminPassword);
    console.log('👤 이름:', adminName);
    console.log('🎯 역할: system_admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  중요: 보안을 위해 첫 로그인 후 반드시 비밀번호를 변경하세요!\n');
    console.log('🌐 로그인: https://casenetai.kr/login.html\n');
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
createSystemAdmin()
  .then(() => {
    console.log('✅ 완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 실패:', error);
    process.exit(1);
  });
