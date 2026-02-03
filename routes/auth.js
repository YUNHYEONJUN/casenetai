/**
 * 인증 관련 라우터
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'casenetai-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// 로그인 시도 제한 (브루트포스 공격 방어)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회 시도
  skipSuccessfulRequests: true, // 성공한 요청은 카운트 안함
  message: {
    success: false,
    error: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.'
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 회원가입 (관리자 전용 - 마스터 비밀번호 필요)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, organizationId, masterPassword, role, credits } = req.body;
    
    // 🔐 관리자 전용: 마스터 비밀번호 검증
    const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'CaseNetAI2026!@#';
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(403).json({
        success: false,
        error: '관리자 권한이 필요합니다. 마스터 비밀번호를 확인하세요.'
      });
    }
    
    // 입력 검증
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: '필수 정보를 입력해주세요'
      });
    }
    
    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: '올바른 이메일 형식이 아닙니다'
      });
    }
    
    // 비밀번호 강도 검증
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: '비밀번호는 최소 8자 이상이어야 합니다'
      });
    }
    
    // 비밀번호 복잡도 검증 (영문, 숫자, 특수문자 중 2가지 이상)
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const complexityCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (complexityCount < 2) {
      return res.status(400).json({
        success: false,
        error: '비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다'
      });
    }
    
    // 🔐 관리자 권한으로 계정 생성
    const result = await authService.registerWithRole({
      email,
      password,
      name,
      phone,
      organizationId,
      role: role || 'system_admin',  // 기본값: system_admin
      credits: credits || 10000000,  // 기본값: 10,000,000원
      serviceType: req.body.serviceType || 'elderly_protection'
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ 회원가입 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그인 (DEPRECATED - 소셜 로그인으로 대체)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/login', loginLimiter, async (req, res) => {
  // ⚠️ DEPRECATED: 이 엔드포인트는 곧 제거될 예정입니다
  // 소셜 로그인(카카오/네이버)을 사용해주세요
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: '이메일과 비밀번호를 입력해주세요'
      });
    }
    
    const result = await authService.login({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ 로그인 API 오류:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그아웃
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization'].split(' ')[1];
    const result = await authService.logout(token);
    res.json(result);
  } catch (error) {
    console.error('❌ 로그아웃 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 토큰 갱신
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: '리프레시 토큰이 필요합니다'
      });
    }
    
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
    
  } catch (error) {
    console.error('❌ 토큰 갱신 API 오류:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 내 정보 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await authService.getUserInfo(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('❌ 사용자 정보 조회 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 카카오 OAuth 로그인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 카카오 로그인 시작
router.get('/kakao', 
  passport.authenticate('kakao')
);

// 카카오 콜백
router.get('/kakao/callback',
  passport.authenticate('kakao', { 
    failureRedirect: '/login.html$1error=kakao_auth_failed',
    session: false 
  }),
  async (req, res) => {
    try {
      // JWT 토큰 생성 (role 포함)
      const token = jwt.sign(
        { 
          userId: req.user.id, 
          email: req.user.email || req.user.oauth_nickname,
          role: req.user.role,
          organizationId: req.user.organization_id
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      const refreshToken = jwt.sign(
        { userId: req.user.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // 세션 저장
      const { getDB } = require('../database/db-postgres');
      const db = getDB();
      await db.run(
        `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
        [req.user.id, token, refreshToken, req.ip, req.get('user-agent')]
      );
      
      // 로그인 시간 업데이트
      await db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [req.user.id]
      );
      
      console.log('✅ 카카오 로그인 완료:', req.user.oauth_nickname, '| Role:', req.user.role);
      
      // 승인 상태 확인 - 미승인 시 접근 차단
      if (!req.user.is_approved) {
        console.log('⚠️  미승인 사용자 로그인 시도:', req.user.oauth_nickname);
        return res.redirect('/login.html?error=not_approved&provider=kakao');
      }
      
      // 토큰을 URL 파라미터로 전달하고 리다이렉트
      res.redirect(`/login-success.html?token=${token}&refreshToken=${refreshToken}&provider=kakao&role=${req.user.role}`);
      
    } catch (error) {
      console.error('❌ 카카오 콜백 오류:', error);
      res.redirect('/login.html$1error=kakao_callback_failed');
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버 OAuth 로그인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 네이버 로그인 시작
router.get('/naver',
  passport.authenticate('naver')
);

// 네이버 콜백
router.get('/naver/callback',
  passport.authenticate('naver', {
    failureRedirect: '/login.html$1error=naver_auth_failed',
    session: false
  }),
  async (req, res) => {
    try {
      // JWT 토큰 생성 (role 포함)
      const token = jwt.sign(
        { 
          userId: req.user.id, 
          email: req.user.email || req.user.oauth_nickname,
          role: req.user.role,
          organizationId: req.user.organization_id
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      const refreshToken = jwt.sign(
        { userId: req.user.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // 세션 저장
      const { getDB } = require('../database/db-postgres');
      const db = getDB();
      await db.run(
        `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
        [req.user.id, token, refreshToken, req.ip, req.get('user-agent')]
      );
      
      // 로그인 시간 업데이트
      await db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [req.user.id]
      );
      
      console.log('✅ 네이버 로그인 완료:', req.user.oauth_nickname, '| Role:', req.user.role);
      
      // 승인 상태 확인 - 미승인 시 접근 차단
      if (!req.user.is_approved) {
        console.log('⚠️  미승인 사용자 로그인 시도:', req.user.oauth_nickname);
        return res.redirect('/login.html?error=not_approved&provider=naver');
      }
      
      // 토큰을 URL 파라미터로 전달하고 리다이렉트
      res.redirect(`/login-success.html?token=${token}&refreshToken=${refreshToken}&provider=naver&role=${req.user.role}`);
      
    } catch (error) {
      console.error('❌ 네이버 콜백 오류:', error);
      res.redirect('/login.html$1error=naver_callback_failed');
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 구글 OAuth 로그인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 구글 로그인 시작
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email']
  })
);

// 구글 콜백
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login.html$1error=google_auth_failed',
    session: false
  }),
  async (req, res) => {
    try {
      // JWT 토큰 생성 (role 포함)
      const token = jwt.sign(
        { 
          userId: req.user.id, 
          email: req.user.email || req.user.oauth_nickname,
          role: req.user.role,
          organizationId: req.user.organization_id
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      const refreshToken = jwt.sign(
        { userId: req.user.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // 세션 저장
      const { getDB } = require('../database/db-postgres');
      const db = getDB();
      await db.run(
        `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
        [req.user.id, token, refreshToken, req.ip, req.get('user-agent')]
      );
      
      // 로그인 시간 업데이트
      await db.run(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [req.user.id]
      );
      
      console.log('✅ 구글 로그인 완료:', req.user.oauth_nickname, '| Role:', req.user.role);
      
      // 승인 상태 확인 - 미승인 시 접근 차단
      if (!req.user.is_approved) {
        console.log('⚠️  미승인 사용자 로그인 시도:', req.user.oauth_nickname);
        return res.redirect('/login.html?error=not_approved&provider=google');
      }
      
      // 토큰을 URL 파라미터로 전달하고 리다이렉트
      res.redirect(`/login-success.html?token=${token}&refreshToken=${refreshToken}&provider=google&role=${req.user.role}`);
      
    } catch (error) {
      console.error('❌ 구글 콜백 오류:', error);
      res.redirect('/login.html$1error=google_callback_failed');
    }
  }
);

module.exports = router;
