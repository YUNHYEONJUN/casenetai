/**
 * 인증 서비스
 * - 회원가입, 로그인, JWT 토큰 관리
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/db-postgres');

// JWT_SECRET 필수 검증
if (!process.env.JWT_SECRET) {
  throw new Error('❌ JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '1h'; // 1시간 (보안 강화)
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // 7일
const SALT_ROUNDS = 12; // 보안 강화 (10 → 12)

class AuthService {
  
  /**
   * 회원가입
   */
  async register({ email, password, name, phone, organizationId = null, serviceType = 'elderly_protection' }) {
    const db = getDB();
    
    try {
      // 이메일 중복 체크
      const existingUser = await db.get(
        'SELECT id FROM users WHERE oauth_email = $1',
        [email]
      );
      
      if (existingUser) {
        throw new Error('이미 사용 중인 이메일입니다');
      }
      
      // 비밀번호 해시
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      // 트랜잭션으로 사용자 생성 및 크레딧 초기화
      const result = await db.transaction(async (client) => {
        // 사용자 생성
        const userResult = await client.query(
          `INSERT INTO users (oauth_email, name, phone, organization_id, service_type, oauth_provider, oauth_id)
           VALUES ($1, $2, $3, $4, $5, 'local', $6) RETURNING id`,
          [email, name, phone, organizationId, serviceType, 'legacy_' + Date.now()]
        );
        
        const userId = userResult.rows[0].id;
        
        // 크레딧 초기화 (무료 체험 3회)
        await client.query(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES ($1, 0, 3)`,
          [userId]
        );
        
        return userId;
      });
      
      console.log('✅ 회원가입 성공:', email);
      
      return {
        success: true,
        userId: result,
        message: '회원가입이 완료되었습니다'
      };
      
    } catch (error) {
      console.error('❌ 회원가입 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 관리자 전용: 역할 및 크레딧 설정 가능한 회원가입
   */
  async registerWithRole({ email, password, name, phone, organizationId = null, role = 'system_admin', credits = 10000000, serviceType = 'elderly_protection' }) {
    const db = getDB();
    
    try {
      // 이메일 중복 체크
      const existingUser = await db.get(
        'SELECT id FROM users WHERE oauth_email = $1',
        [email]
      );
      
      if (existingUser) {
        throw new Error('이미 사용 중인 이메일입니다');
      }
      
      // 비밀번호 해시
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      // 트랜잭션으로 사용자 생성 및 크레딧 초기화
      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (관리자 권한 포함)
        const userResult = await client.query(
          `INSERT INTO users (oauth_email, name, phone, organization_id, service_type, oauth_provider, oauth_id, role, is_approved)
           VALUES ($1, $2, $3, $4, $5, 'local', $6, $7, true) RETURNING id`,
          [email, name, phone, organizationId, serviceType, 'admin_' + Date.now(), role]
        );
        
        const newUserId = userResult.rows[0].id;
        
        // 크레딧 초기화 (관리자 지정 금액)
        await client.query(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES ($1, $2, 0)`,
          [newUserId, credits]
        );
        
        return newUserId;
      });
      
      console.log(`✅ 관리자 계정 생성 성공: ${email} (${role}, ${credits}원)`);
      
      return {
        success: true,
        userId: userId,
        role: role,
        credits: credits,
        message: '관리자 계정이 성공적으로 생성되었습니다'
      };
      
    } catch (error) {
      console.error('❌ 관리자 계정 생성 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 로그인
   */
  async login({ email, password, ipAddress, userAgent }) {
    const db = getDB();
    
    try {
      // 사용자 조회 (password_hash 포함)
      const result = await db.query(
        `SELECT id, oauth_email as email, password_hash, name, role, organization_id, service_type
         FROM users WHERE oauth_email = $1`,
        [email]
      );
      
      const user = result[0]; // db.query()는 이미 rows 배열을 반환
      
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
      
      // Refresh Token 생성
      const refreshToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
      );
      
      // 세션 저장 (Access Token 만료 시간에 맞춤)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1시간
      
      await db.run(
        `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, token, refreshToken, ipAddress, userAgent, expiresAt.toISOString()]
      );
      
      // 마지막 로그인 시간 업데이트
      await db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      // 크레딧 정보 조회
      const credit = await db.get(
        'SELECT balance, free_trial_count FROM credits WHERE user_id = $1',
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
        'SELECT user_id FROM sessions WHERE refresh_token = $1 AND expires_at > CURRENT_TIMESTAMP',
        [refreshToken]
      );
      
      if (!session) {
        throw new Error('유효하지 않은 리프레시 토큰입니다');
      }
      
      // 사용자 정보 조회
      const user = await db.get(
        'SELECT id, oauth_email as email, role FROM users WHERE id = $1',
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
        'UPDATE sessions SET token = $1 WHERE refresh_token = $2',
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
        'DELETE FROM sessions WHERE token = $1',
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
        `SELECT u.id, u.oauth_email as email, u.name, u.phone, u.role, u.organization_id, u.created_at,
                c.balance, c.free_trial_count, c.total_purchased, c.total_used
         FROM users u
         LEFT JOIN credits c ON u.id = c.user_id
         WHERE u.id = $1`,
        [userId]
      );
      
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      
      // 기관 정보 조회
      let organization = null;
      if (user.organization_id) {
        organization = await db.get(
          'SELECT id, name, plan_type, subscription_status FROM organizations WHERE id = $1',
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
