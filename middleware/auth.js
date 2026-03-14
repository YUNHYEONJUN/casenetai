/**
 * 인증 미들웨어
 * - Authorization 헤더 또는 쿠키에서 JWT 추출
 * - 블랙리스트 확인
 */

const authService = require('../services/authService');
const tokenBlacklist = require('../lib/tokenBlacklist');

/**
 * 요청에서 JWT 토큰 추출 (헤더 > 쿠키 우선순위)
 */
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  // 2. access_token 쿠키
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  return null;
}

/**
 * JWT 토큰 검증 미들웨어
 */
function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: '인증 토큰이 필요합니다'
    });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({
      success: false,
      error: '로그아웃된 토큰입니다'
    });
  }

  const result = authService.verifyToken(token);

  if (!result.valid) {
    return res.status(403).json({
      success: false,
      error: '유효하지 않은 토큰입니다'
    });
  }

  req.user = {
    userId: result.userId,
    email: result.email,
    role: result.role,
    organizationId: result.organizationId
  };

  next();
}

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없으면 통과)
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (token && !tokenBlacklist.has(token)) {
    const result = authService.verifyToken(token);
    if (result.valid) {
      req.user = {
        userId: result.userId,
        email: result.email,
        role: result.role,
        organizationId: result.organizationId
      };
    }
  }

  next();
}

/**
 * 관리자 권한 확인 미들웨어
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '인증이 필요합니다'
    });
  }

  if (req.user.role !== 'system_admin' && req.user.role !== 'org_admin') {
    return res.status(403).json({
      success: false,
      error: '관리자 권한이 필요합니다'
    });
  }

  next();
}

/**
 * 관리자 전용 미들웨어 (인증 + 권한 확인)
 */
function isAdmin(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: '인증 토큰이 필요합니다'
    });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({
      success: false,
      error: '로그아웃된 토큰입니다'
    });
  }

  const result = authService.verifyToken(token);

  if (!result.valid) {
    return res.status(403).json({
      success: false,
      error: '유효하지 않은 토큰입니다'
    });
  }

  req.user = {
    userId: result.userId,
    email: result.email,
    role: result.role,
    organizationId: result.organizationId
  };

  if (req.user.role !== 'system_admin' && req.user.role !== 'org_admin') {
    return res.status(403).json({
      success: false,
      error: '관리자 권한이 필요합니다'
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  isAdmin,
  extractToken
};
