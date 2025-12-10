/**
 * 3단계 권한 미들웨어
 * - system_admin: 최고 관리자 (기관 및 기관 관리자 관리)
 * - org_admin: 기관 관리자 (소속 직원 관리)
 * - user: 일반 사용자 (서비스 이용)
 */

/**
 * System Admin 권한 확인
 * 최고 관리자만 접근 가능
 */
function requireSystemAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '인증이 필요합니다'
    });
  }

  if (req.user.role !== 'system_admin') {
    return res.status(403).json({
      success: false,
      error: '시스템 관리자 권한이 필요합니다'
    });
  }

  next();
}

/**
 * Organization Admin 권한 확인
 * 기관 관리자 이상 접근 가능 (system_admin + org_admin)
 */
function requireOrgAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '인증이 필요합니다'
    });
  }

  const allowedRoles = ['system_admin', 'org_admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: '기관 관리자 권한이 필요합니다'
    });
  }

  next();
}

/**
 * Organization Admin (자신의 기관만)
 * 기관 관리자가 자신의 기관에만 접근 가능
 */
function requireOwnOrgAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '인증이 필요합니다'
    });
  }

  // System Admin은 모든 기관 접근 가능
  if (req.user.role === 'system_admin') {
    return next();
  }

  // Organization Admin은 자신의 기관만
  if (req.user.role === 'org_admin') {
    const targetOrgId = parseInt(req.params.organizationId || req.body.organizationId);
    
    if (!req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: '기관에 소속되지 않은 관리자입니다'
      });
    }

    if (req.user.organization_id !== targetOrgId) {
      return res.status(403).json({
        success: false,
        error: '다른 기관의 정보에 접근할 수 없습니다'
      });
    }

    return next();
  }

  return res.status(403).json({
    success: false,
    error: '기관 관리자 권한이 필요합니다'
  });
}

/**
 * 사용자 권한 확인 (모든 로그인 사용자)
 */
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '로그인이 필요합니다'
    });
  }

  // status가 active인 사용자만
  if (req.user.status !== 'active') {
    return res.status(403).json({
      success: false,
      error: '계정이 비활성화되었습니다'
    });
  }

  next();
}

/**
 * 기관 소속 사용자 확인
 * 기관에 가입되고 승인된 사용자만 접근 가능
 */
function requireOrganizationMember(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '로그인이 필요합니다'
    });
  }

  // System Admin은 항상 허용
  if (req.user.role === 'system_admin') {
    return next();
  }

  // 기관 소속 확인
  if (!req.user.organization_id) {
    return res.status(403).json({
      success: false,
      error: '기관에 소속되지 않은 사용자입니다'
    });
  }

  // 승인 여부 확인
  if (!req.user.is_approved) {
    return res.status(403).json({
      success: false,
      error: '기관 가입 승인이 필요합니다'
    });
  }

  next();
}

/**
 * 본인 또는 관리자 확인
 * 자신의 정보이거나 관리자인 경우 접근 가능
 */
function requireSelfOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '로그인이 필요합니다'
    });
  }

  const targetUserId = parseInt(req.params.userId || req.params.id);

  // 본인 확인
  if (req.user.id === targetUserId) {
    return next();
  }

  // System Admin은 모든 사용자 접근 가능
  if (req.user.role === 'system_admin') {
    return next();
  }

  // Organization Admin은 같은 기관 사용자만 접근 가능
  if (req.user.role === 'org_admin' && req.user.organization_id) {
    // 대상 사용자의 기관 확인 필요 (추가 쿼리)
    req.needsOrgCheck = true;
    return next();
  }

  return res.status(403).json({
    success: false,
    error: '권한이 없습니다'
  });
}

module.exports = {
  requireSystemAdmin,
  requireOrgAdmin,
  requireOwnOrgAdmin,
  requireUser,
  requireOrganizationMember,
  requireSelfOrAdmin
};
