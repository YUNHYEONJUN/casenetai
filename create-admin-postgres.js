/**
 * PostgreSQL용 관리자 계정 생성 스크립트
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const adminEmail = process.env.ADMIN_EMAIL || 'admin@casenetai.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminName = process.env.ADMIN_NAME || 'System Admin';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 PostgreSQL 관리자 계정 생성');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

(async () => {
  try {
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 비밀번호 해싱
    const hash = await bcrypt.hash(adminPassword, 10);
    console.log('✅ 비밀번호 해싱 완료\n');
    
    // 기존 관리자 계정 삭제 (있다면)
    await pool.query('DELETE FROM users WHERE email = $1', [adminEmail]);
    
    // 새 관리자 계정 생성
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, is_email_verified, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [adminEmail, hash, adminName, 'system_admin', true]
    );
    
    const adminId = result.rows[0].id;
    
    console.log('✅ 관리자 계정 생성 완료');
    console.log(`   ID: ${adminId}`);
    console.log(`   이메일: ${adminEmail}`);
    console.log(`   비밀번호: ${adminPassword}`);
    console.log(`   이름: ${adminName}`);
    console.log(`   권한: system_admin\n`);
    
    // 관리자 크레딧 생성
    await pool.query(
      `INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET balance = $2`,
      [adminId, 1000000, 0, 0, 0]
    );
    
    console.log('✅ 관리자 크레딧 생성 완료');
    console.log('   잔액: 1,000,000원\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 관리자 계정이 준비되었습니다!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 로그인 정보:');
    console.log(`   URL: https://casenetai.kr/login.html`);
    console.log(`   이메일: ${adminEmail}`);
    console.log(`   비밀번호: ${adminPassword}`);
    console.log('\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
