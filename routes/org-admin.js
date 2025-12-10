/**
 * Organization Admin API
 * 기관 관리자 전용: 소속 직원 관리
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireOrgAdmin, requireOwnOrgAdmin } = require('../middleware/roleAuth');

// 모든 라우트에 인증 + Org Admin 권한 필요
router.use(authenticateToken, requireOrgAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 직원 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/org-admin/employees
 * 소속 직원 목록 조회
 */
router.get('/employees', async (req, res) => {
  const db = getDB();
  
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // System Admin: 모든 기관 조회 가능, Org Admin: 자기 기관만
    let organizationId;
    if (req.user.role === 'system_admin') {
      organizationId = req.query.organization_id || req.user.organization_id;
    } else {
      organizationId = req.user.organization_id;
    }
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: '기관 ID가 필요합니다'
      });
    }
    
    let where = ['u.organization_id = ?'];
    let params = [organizationId];
    
    if (status) {
      where.push('u.status = ?');
      params.push(status);
    }
    
    if (search) {
      where.push('(u.name LIKE ? OR u.oauth_email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const whereClause = 'WHERE ' + where.join(' AND ');
    
    const employees = await db.query(`
      SELECT 
        u.id, u.oauth_provider, u.oauth_email, u.oauth_nickname,
        u.name, u.phone, u.role, u.status, u.is_approved,
        u.created_at, u.last_login_at,
        c.balance, c.free_trial_count
      FROM users u
      LEFT JOIN credits c ON c.user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM users u ${whereClause}
    `, params);
    
    // 기관 정보도 함께 조회
    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = ?',
      [organizationId]
    );
    
    res.json({
      success: true,
      organization,
      employees,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 직원 목록 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '직원 목록 조회에 실패했습니다'
    });
  }
});

/**
 * GET /api/org-admin/employees/:id
 * 특정 직원 상세 조회
 */
router.get('/employees/:id', async (req, res) => {
  const db = getDB();
  const employeeId = parseInt(req.params.id);
  
  try {
    const employee = await db.get(`
      SELECT 
        u.*,
        c.balance, c.total_purchased, c.total_used, c.free_trial_count,
        o.name as organization_name
      FROM users u
      LEFT JOIN credits c ON c.user_id = u.id
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ?
    `, [employeeId]);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '직원을 찾을 수 없습니다'
      });
    }
    
    // 권한 확인: Org Admin은 자기 기관 직원만
    if (req.user.role === 'org_admin' && employee.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: '다른 기관의 직원 정보에 접근할 수 없습니다'
      });
    }
    
    // 최근 사용 내역
    const recentUsage = await db.query(`
      SELECT * FROM usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [employeeId]);
    
    res.json({
      success: true,
      employee,
      recentUsage
    });
    
  } catch (error) {
    console.error('❌ 직원 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '직원 조회에 실패했습니다'
    });
  }
});

/**
 * PUT /api/org-admin/employees/:id
 * 직원 정보 수정
 */
router.put('/employees/:id', async (req, res) => {
  const db = getDB();
  const employeeId = parseInt(req.params.id);
  
  try {
    const { name, phone, role, status } = req.body;
    
    // 직원 확인
    const employee = await db.get(
      'SELECT * FROM users WHERE id = ?',
      [employeeId]
    );
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '직원을 찾을 수 없습니다'
      });
    }
    
    // 권한 확인: Org Admin은 자기 기관 직원만
    if (req.user.role === 'org_admin') {
      if (employee.organization_id !== req.user.organization_id) {
        return res.status(403).json({
          success: false,
          error: '다른 기관의 직원을 수정할 수 없습니다'
        });
      }
      
      // Org Admin은 system_admin이나 다른 org_admin으로 승격 불가
      if (role && ['system_admin', 'org_admin'].includes(role)) {
        return res.status(403).json({
          success: false,
          error: '관리자 권한을 부여할 수 없습니다'
        });
      }
    }
    
    await db.beginTransaction();
    
    try {
      // 직원 정보 업데이트
      await db.run(`
        UPDATE users
        SET name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            role = COALESCE(?, role),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, phone, role, status, employeeId]);
      
      // 감사 로그
      await db.run(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        req.user.role,
        'update',
        'user',
        employeeId,
        `직원 정보 수정: ${employee.name}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      res.json({
        success: true,
        message: '직원 정보가 수정되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 직원 수정 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '직원 수정에 실패했습니다'
    });
  }
});

/**
 * DELETE /api/org-admin/employees/:id
 * 직원 제거 (기관에서 제외)
 */
router.delete('/employees/:id', async (req, res) => {
  const db = getDB();
  const employeeId = parseInt(req.params.id);
  
  try {
    const employee = await db.get(
      'SELECT * FROM users WHERE id = ?',
      [employeeId]
    );
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '직원을 찾을 수 없습니다'
      });
    }
    
    // 권한 확인
    if (req.user.role === 'org_admin' && employee.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: '다른 기관의 직원을 제거할 수 없습니다'
      });
    }
    
    // 본인은 제거 불가
    if (employeeId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: '본인은 제거할 수 없습니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 기관에서 제외 (organization_id를 NULL로, role을 user로)
      await db.run(`
        UPDATE users
        SET organization_id = NULL,
            role = 'user',
            is_approved = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [employeeId]);
      
      // 감사 로그
      await db.run(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        req.user.role,
        'delete',
        'user',
        employeeId,
        `직원 제거: ${employee.name}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      res.json({
        success: true,
        message: '직원이 기관에서 제거되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 직원 제거 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '직원 제거에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 가입 요청 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/org-admin/join-requests
 * 기관 가입 요청 목록
 */
router.get('/join-requests', async (req, res) => {
  const db = getDB();
  
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // System Admin: 모든 요청, Org Admin: 자기 기관만
    let organizationId;
    if (req.user.role === 'system_admin') {
      organizationId = req.query.organization_id;
    } else {
      organizationId = req.user.organization_id;
    }
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: '기관 ID가 필요합니다'
      });
    }
    
    const requests = await db.query(`
      SELECT 
        r.*,
        u.name as user_name,
        u.oauth_email as user_email,
        u.oauth_provider,
        u.phone as user_phone,
        reviewer.name as reviewer_name
      FROM organization_join_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.organization_id = ? AND r.status = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [organizationId, status, limit, offset]);
    
    const totalResult = await db.get(`
      SELECT COUNT(*) as count 
      FROM organization_join_requests
      WHERE organization_id = ? AND status = ?
    `, [organizationId, status]);
    
    res.json({
      success: true,
      requests,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 가입 요청 목록 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 요청 목록 조회에 실패했습니다'
    });
  }
});

/**
 * PUT /api/org-admin/join-requests/:id/approve
 * 가입 요청 승인
 */
router.put('/join-requests/:id/approve', async (req, res) => {
  const db = getDB();
  const requestId = parseInt(req.params.id);
  
  try {
    const { review_message } = req.body;
    
    // 요청 확인
    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = ?',
      [requestId]
    );
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: '가입 요청을 찾을 수 없습니다'
      });
    }
    
    // 권한 확인
    if (req.user.role === 'org_admin' && request.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: '다른 기관의 가입 요청을 처리할 수 없습니다'
      });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: '이미 처리된 요청입니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 1. 요청 승인 처리
      await db.run(`
        UPDATE organization_join_requests
        SET status = 'approved',
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            review_message = ?
        WHERE id = ?
      `, [req.user.id, review_message || '승인되었습니다', requestId]);
      
      // 2. 사용자를 기관에 추가
      await db.run(`
        UPDATE users
        SET organization_id = ?,
            is_approved = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [request.organization_id, request.user_id]);
      
      // 3. 감사 로그
      await db.run(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        req.user.role,
        'approve',
        'join_request',
        requestId,
        `가입 요청 승인: user_id=${request.user_id}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      console.log(`✅ 가입 요청 승인: request_id=${requestId}, user_id=${request.user_id}`);
      
      res.json({
        success: true,
        message: '가입 요청이 승인되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 가입 승인 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 승인에 실패했습니다'
    });
  }
});

/**
 * PUT /api/org-admin/join-requests/:id/reject
 * 가입 요청 거절
 */
router.put('/join-requests/:id/reject', async (req, res) => {
  const db = getDB();
  const requestId = parseInt(req.params.id);
  
  try {
    const { review_message } = req.body;
    
    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = ?',
      [requestId]
    );
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: '가입 요청을 찾을 수 없습니다'
      });
    }
    
    // 권한 확인
    if (req.user.role === 'org_admin' && request.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: '다른 기관의 가입 요청을 처리할 수 없습니다'
      });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: '이미 처리된 요청입니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 요청 거절 처리
      await db.run(`
        UPDATE organization_join_requests
        SET status = 'rejected',
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            review_message = ?
        WHERE id = ?
      `, [req.user.id, review_message || '요청이 거절되었습니다', requestId]);
      
      // 감사 로그
      await db.run(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        req.user.role,
        'reject',
        'join_request',
        requestId,
        `가입 요청 거절: user_id=${request.user_id}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      res.json({
        success: true,
        message: '가입 요청이 거절되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 가입 거절 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 거절에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 통계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/org-admin/statistics
 * 기관 통계 (직원 수, 사용량 등)
 */
router.get('/statistics', async (req, res) => {
  const db = getDB();
  
  try {
    // Org Admin: 자기 기관만
    const organizationId = req.user.role === 'system_admin' 
      ? req.query.organization_id 
      : req.user.organization_id;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: '기관 ID가 필요합니다'
      });
    }
    
    // 직원 통계
    const employeeStats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_approved = 1 THEN 1 ELSE 0 END) as approved
      FROM users
      WHERE organization_id = ?
    `, [organizationId]);
    
    // 사용량 통계 (최근 30일)
    const usageStats = await db.get(`
      SELECT 
        COUNT(*) as total_count,
        SUM(total_cost) as total_cost,
        AVG(total_cost) as avg_cost
      FROM usage_logs u
      JOIN users usr ON usr.id = u.user_id
      WHERE usr.organization_id = ?
        AND u.created_at >= datetime('now', '-30 days')
    `, [organizationId]);
    
    // 대기 중인 가입 요청
    const pendingRequests = await db.get(`
      SELECT COUNT(*) as count
      FROM organization_join_requests
      WHERE organization_id = ? AND status = 'pending'
    `, [organizationId]);
    
    res.json({
      success: true,
      statistics: {
        employees: employeeStats,
        usage: usageStats,
        pendingRequests: pendingRequests.count
      }
    });
    
  } catch (error) {
    console.error('❌ 통계 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다'
    });
  }
});

module.exports = router;
