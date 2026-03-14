/**
 * 인증 관련 라우터
 * - OAuth 콜백에서 httpOnly 쿠키로 토큰 설정 (URL 노출 방지)
 * - 리프레시 토큰 로테이션 (사용 시 새 리프레시 토큰 발급)
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authService = require('../services/authService');
const { authenticateToken, extractToken } = require('../middleware/auth');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { logger } = require('../lib/logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// 쿠키 기본 옵션
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'strict' : 'lax',
  path: '/',
};

/**
 * 토큰 쿠키 설정 헬퍼
 */
function setTokenCookies(res, token, refreshToken) {
  // access_token: 1시간 (JS에서 읽을 수 있도록 httpOnly: false)
  res.cookie('access_token', token, {
    ...COOKIE_OPTIONS,
    httpOnly: false, // 프론트엔드에서 읽어야 하므로
    maxAge: 60 * 60 * 1000, // 1시간
  });

  // refresh_token: 7일 (httpOnly - JS 접근 불가)
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  });
}

/**
 * 토큰 쿠키 제거 헬퍼
 */
function clearTokenCookies(res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

/**
 * OAuth 콜백 공통 처리
 */
async function handleOAuthCallback(req, res, provider) {
  try {
    const token = jwt.sign(
      {
        userId: req.user.id,
        email: req.user.oauth_email || req.user.oauth_nickname,
        role: req.user.role,
        organizationId: req.user.organization_id || null
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: req.user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // 세션 저장
    const { getDB } = require('../database/db-postgres');
    const db = getDB();
    await db.run(
      `INSERT INTO sessions (user_id, token, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
      [req.user.id, token, refreshToken, req.ip, req.get('user-agent')]
    );

    await db.run(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user.id]
    );

    logger.info(`${provider} 로그인 완료`, {
      nickname: req.user.oauth_nickname,
      role: req.user.role
    });

    // 쿠키로 토큰 설정 (URL 파라미터 노출 방지)
    setTokenCookies(res, token, refreshToken);

    // URL에는 토큰 없이 메타데이터만 전달
    const serviceType = req.user.service_type || 'elderly_protection';
    res.redirect(`/login-success.html?provider=${provider}&role=${req.user.role}&service=${serviceType}`);

  } catch (error) {
    logger.error(`${provider} 콜백 오류`, { error: error.message });
    res.redirect(`/login.html?error=${provider}_callback_failed`);
  }
}

// 로그인 시도 제한
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { success: false, error: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.' }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 회원가입 (관리자 전용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/register', loginLimiter, async (req, res) => {
  try {
    const { email, password, name, phone, organizationId, masterPassword, role, credits } = req.body;

    const MASTER_PASSWORD = process.env.MASTER_PASSWORD;
    if (!MASTER_PASSWORD) {
      return res.status(500).json({ success: false, error: '서버 설정 오류가 발생했습니다.' });
    }
    const mpBuf = Buffer.from(String(masterPassword || ''));
    const correctBuf = Buffer.from(String(MASTER_PASSWORD));
    if (mpBuf.length !== correctBuf.length || !crypto.timingSafeEqual(mpBuf, correctBuf)) {
      return res.status(403).json({ success: false, error: '인증에 실패했습니다.' });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: '필수 정보를 입력해주세요' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: '올바른 이메일 형식이 아닙니다' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: '비밀번호는 최소 8자 이상이어야 합니다' });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    if ([hasLetter, hasNumber, hasSpecial].filter(Boolean).length < 2) {
      return res.status(400).json({ success: false, error: '비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다' });
    }

    const validRoles = ['user', 'org_admin', 'system_admin'];
    const safeRole = (role && validRoles.includes(role)) ? role : 'user';

    const result = await authService.registerWithRole({
      email, password, name, phone, organizationId,
      role: safeRole,
      credits: credits || 0,
      serviceType: req.body.serviceType || 'elderly_protection'
    });

    res.json(result);

  } catch (error) {
    logger.error('회원가입 오류', { error: error.message });
    // 사용자 입력 관련 에러만 전달, 나머지는 제네릭 메시지
    const safeErrors = ['이미 사용 중인 이메일', '비밀번호는 최소', '비밀번호는 영문'];
    const isSafe = safeErrors.some(e => error.message.includes(e));
    res.status(isSafe ? 400 : 500).json({ success: false, error: isSafe ? error.message : '계정 생성 중 오류가 발생했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그인 (DEPRECATED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: '이메일과 비밀번호를 입력해주세요' });
    }

    const result = await authService.login({
      email, password,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // 쿠키에도 토큰 설정
    if (result.success) {
      setTokenCookies(res, result.token, result.refreshToken);
    }

    res.json(result);

  } catch (error) {
    logger.error('로그인 오류', { error: error.message });
    // 로그인 실패 시 상세 이유 노출 최소화
    const safeLoginErrors = ['이메일 또는 비밀번호', '소셜 로그인 전용'];
    const isSafe = safeLoginErrors.some(e => error.message.includes(e));
    res.status(401).json({ success: false, error: isSafe ? error.message : '로그인에 실패했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그아웃
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = extractToken(req);
    const result = await authService.logout(token);

    // 쿠키 제거
    clearTokenCookies(res);

    res.json(result);
  } catch (error) {
    logger.error('로그아웃 오류', { error: error.message });
    res.status(500).json({ success: false, error: '로그아웃 처리 중 오류가 발생했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 토큰 갱신 (리프레시 토큰 로테이션)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/refresh', async (req, res) => {
  try {
    // httpOnly 쿠키 또는 body에서 리프레시 토큰 추출
    const refreshToken = (req.cookies && req.cookies.refresh_token) || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: '리프레시 토큰이 필요합니다' });
    }

    // 토큰 로테이션: 새 access + 새 refresh 토큰 발급
    const result = await authService.refreshTokenWithRotation(refreshToken);

    if (result.success) {
      setTokenCookies(res, result.token, result.newRefreshToken);
    }

    res.json({
      success: result.success,
      token: result.token
    });

  } catch (error) {
    logger.error('토큰 갱신 오류', { error: error.message });
    // 리프레시 실패 시 쿠키 제거 (재로그인 유도)
    clearTokenCookies(res);
    res.status(401).json({ success: false, error: '토큰 갱신에 실패했습니다. 다시 로그인해주세요.' });
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
    logger.error('사용자 정보 조회 오류', { error: error.message });
    res.status(500).json({ success: false, error: '사용자 정보 조회에 실패했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 카카오 OAuth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/kakao', passport.authenticate('kakao'));

router.get('/kakao/callback',
  passport.authenticate('kakao', {
    failureRedirect: '/login.html?error=kakao_auth_failed',
    session: false
  }),
  (req, res) => handleOAuthCallback(req, res, 'kakao')
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버 OAuth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/naver', passport.authenticate('naver'));

router.get('/naver/callback',
  passport.authenticate('naver', {
    failureRedirect: '/login.html?error=naver_auth_failed',
    session: false
  }),
  (req, res) => handleOAuthCallback(req, res, 'naver')
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 구글 OAuth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login.html?error=google_auth_failed',
    session: false
  }),
  (req, res) => handleOAuthCallback(req, res, 'google')
);

module.exports = router;
