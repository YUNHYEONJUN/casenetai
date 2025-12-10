/**
 * 인증 서비스
 * - 회원가입, 로그인, JWT 토큰 관리
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'casenetai-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7일
const SALT_ROUNDS = 10;

class AuthService {
  
  /**
   * 회원가입
   */
  async register({ email, password, name, phone, organizationId = null, serviceType = 'elderly_protection' }) {
    const db = getDB();
    
    try {
      // 이메일 중복 체크
      const existingUser = await db.get(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      
      if (existingUser) {
        throw new Error('이미 사용 중인 이메일입니다');
      }
      
      // 비밀번호 해시
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      // 트랜잭션 시작
      await db.beginTransaction();
      
      try {
        // 사용자 생성
        const result = await db.run(
          `INSERT INTO users (email, password_hash, name, phone, organization_id, service_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [email, passwordHash, name, phone, organizationId, serviceType]
        );
        
        const userId = result.lastID;
        
        // 크레딧 초기화 (무료 체험 3회)
        await db.run(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES (?, 0, 3)`,
          [userId]
        );
        
        await db.commit();
        
        console.log('✅ 회원가입 성공:', email);
        
        return {
          success: true,
          userId: userId,
          message: '회원가입이 완료되었습니다'
        };
        
      } catch (err) {
        await db.rollback();
        throw err;
      }
      
    } catch (error) {
      console.error('❌ 회원가입 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 로그인
   */
  async login({ email, password, ipAddress, userAgent }) {
    const db = getDB();
    
    try {
      // 사용자 조회
      const user = await db.get(
        `SELECT id, email, password_hash, name, role, organization_id, service_type
         FROM users WHERE email = ?`,
        [email]
      );
      
      if (!user) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
      }
      
      // 비밀번호 확인
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
      }
      
      // JWT 토큰 생성
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // Refresh Token 생성 (30일)
      const refreshToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // 세션 저장
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await db.run(
        `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, token, refreshToken, ipAddress, userAgent, expiresAt.toISOString()]
      );
      
      // 마지막 로그인 시간 업데이트
      await db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );
      
      // 크레딧 정보 조회
      const credit = await db.get(
        'SELECT balance, free_trial_count FROM credits WHERE user_id = ?',
        [user.id]
      );
      
      console.log('✅ 로그인 성공:', email);
      
      return {
        success: true,
        token: token,
        refreshToken: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization_id,
          serviceType: user.service_type || 'elderly_protection',
          credit: credit ? credit.balance : 0,
          freeTrialCount: credit ? credit.free_trial_count : 0
        }
      };
      
    } catch (error) {
      console.error('❌ 로그인 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 토큰 검증
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return {
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
  
  /**
   * Refresh Token으로 새 토큰 발급
   */
  async refreshToken(refreshToken) {
    const db = getDB();
    
    try {
      // Refresh Token 검증
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // 세션 확인
      const session = await db.get(
        'SELECT user_id FROM sessions WHERE refresh_token = ? AND expires_at > CURRENT_TIMESTAMP',
        [refreshToken]
      );
      
      if (!session) {
        throw new Error('유효하지 않은 리프레시 토큰입니다');
      }
      
      // 사용자 정보 조회
      const user = await db.get(
        'SELECT id, email, role FROM users WHERE id = ?',
        [decoded.userId]
      );
      
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      
      // 새 액세스 토큰 생성
      const newToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // 세션 업데이트
      await db.run(
        'UPDATE sessions SET token = ? WHERE refresh_token = ?',
        [newToken, refreshToken]
      );
      
      return {
        success: true,
        token: newToken
      };
      
    } catch (error) {
      console.error('❌ 토큰 갱신 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 로그아웃
   */
  async logout(token) {
    const db = getDB();
    
    try {
      await db.run(
        'DELETE FROM sessions WHERE token = ?',
        [token]
      );
      
      return {
        success: true,
        message: '로그아웃되었습니다'
      };
      
    } catch (error) {
      console.error('❌ 로그아웃 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 사용자 정보 조회
   */
  async getUserInfo(userId) {
    const db = getDB();
    
    try {
      const user = await db.get(
        `SELECT u.id, u.email, u.name, u.phone, u.role, u.organization_id, u.created_at,
                c.balance, c.free_trial_count, c.total_purchased, c.total_used
         FROM users u
         LEFT JOIN credits c ON u.id = c.user_id
         WHERE u.id = ?`,
        [userId]
      );
      
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      
      // 기관 정보 조회
      let organization = null;
      if (user.organization_id) {
        organization = await db.get(
          'SELECT id, name, plan_type, subscription_status FROM organizations WHERE id = ?',
          [user.organization_id]
        );
      }
      
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          credit: user.balance || 0,
          freeTrialCount: user.free_trial_count || 0,
          totalPurchased: user.total_purchased || 0,
          totalUsed: user.total_used || 0,
          organization: organization,
          createdAt: user.created_at
        }
      };
      
    } catch (error) {
      console.error('❌ 사용자 정보 조회 실패:', error.message);
      throw error;
    }
  }
}

module.exports = new AuthService();
