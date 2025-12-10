/**
 * 인증 미들웨어
 */

const authService = require('../services/authService');

/**
 * JWT 토큰 검증 미들웨어
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: '인증 토큰이 필요합니다'
    });
  }
  
  const result = authService.verifyToken(token);
  
  if (!result.valid) {
    return res.status(403).json({
      success: false,
      error: '유효하지 않은 토큰입니다',
      details: result.error
    });
  }
  
  // 사용자 정보를 req에 저장
  req.user = {
    userId: result.userId,
    email: result.email,
    role: result.role
  };
  
  next();
}

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없으면 통과)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    const result = authService.verifyToken(token);
    if (result.valid) {
      req.user = {
        userId: result.userId,
        email: result.email,
        role: result.role
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
 * router.use(isAdmin)로 사용하기 위한 미들웨어 체인
 */
function isAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: '인증 토큰이 필요합니다'
    });
  }
  
  const result = authService.verifyToken(token);
  
  if (!result.valid) {
    return res.status(403).json({
      success: false,
      error: '유효하지 않은 토큰입니다',
      details: result.error
    });
  }
  
  // 사용자 정보를 req에 저장
  req.user = {
    userId: result.userId,
    email: result.email,
    role: result.role
  };
  
  // 관리자 권한 확인
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
  isAdmin
};
