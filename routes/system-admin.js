/**
 * System Admin API
 * 최고 관리자 전용: 기관 및 기관 관리자 관리
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../database/db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { requireSystemAdmin } = require('../middleware/roleAuth');

// 모든 라우트에 인증 + System Admin 권한 필요
router.use(authenticateToken, requireSystemAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/system-admin/organizations
 * 기관 목록 조회
 */
router.get('/organizations', async (req, res) => {
  const db = getDB();
  
  try {
    const { status, subscription_status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let where = [];
    let params = [];
    
    if (status) {
      where.push('o.status = $1');
      params.push(status);
    }
    
    if (subscription_status) {
      where.push('o.subscription_status = $1');
      params.push(subscription_status);
    }
    
    if (search) {
      where.push('(o.name LIKE $1 OR o.business_registration_number LIKE $2)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    
    // 기관 목록 조회 (직원 수 포함)
    const organizations = await db.query(`
      SELECT 
        o.*,
        COUNT(DISTINCT u.id) as user_count,
        admin_user.name as admin_name,
        admin_user.oauth_email as admin_email
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id AND u.status = 'active'
      LEFT JOIN users admin_user ON admin_user.id = o.created_by_admin_id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    // 전체 개수
    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM organizations o ${whereClause}
    `, params);
    
    res.json({
      success: true,
      organizations,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 기관 목록 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '기관 목록 조회에 실패했습니다'
    });
  }
});

/**
 * POST /api/system-admin/organizations
 * 기관 생성 + 기관 관리자 지정
 */
router.post('/organizations', async (req, res) => {
  const db = getDB();
  
  try {
    const {
      name,
      business_registration_number,
      plan_type,
      subscription_status,
      monthly_fee,
      max_users,
      contract_date,
      expiry_date,
      admin_user_id  // 기관 관리자로 지정할 사용자 ID
    } = req.body;
    
    // 입력 검증
    if (!name) {
      return res.status(400).json({
        success: false,
        error: '기관명은 필수입니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 기관 관리자 사용자 확인 (선택사항)
      let adminUser = null;
      if (admin_user_id) {
        adminUser = await db.get(
          'SELECT id, name, oauth_email, role, organization_id FROM users WHERE id = $1',
          [admin_user_id]
        );
        
        if (!adminUser) {
          throw new Error('지정한 사용자를 찾을 수 없습니다');
        }
        
        if (adminUser.organization_id) {
          throw new Error('이미 다른 기관에 소속된 사용자입니다');
        }
      }
      
      // 1. 기관 생성
      const orgResult = await db.run(`
        INSERT INTO organizations (
          name, business_registration_number, plan_type, subscription_status,
          monthly_fee, max_users, contract_date, expiry_date, created_by_admin_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, [
        name,
        business_registration_number || null,
        plan_type || 'free',
        subscription_status || 'inactive',
        monthly_fee || 0,
        max_users || 0,
        contract_date || null,
        expiry_date || null,
        admin_user_id || null
      ]);
      
      const organizationId = orgResult.lastID;
      
      // 2. 관리자 사용자 업데이트 (있는 경우)
      if (admin_user_id) {
        await db.run(`
          UPDATE users 
          SET organization_id = ?,
              role = 'org_admin',
              is_approved = true,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [organizationId, admin_user_id]);
      }
      
      // 3. 감사 로그
      await db.run(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        req.user.role,
        'create',
        'organization',
        organizationId,
        `기관 생성: ${name}` + (admin_user_id ? ` (관리자: ${adminUser.name})` : ''),
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      // 생성된 기관 정보 조회
      const organization = await db.get(
        'SELECT * FROM organizations WHERE id = $1',
        [organizationId]
      );
      
      console.log(`✅ 기관 생성 성공: ${name} (ID: ${organizationId})`);
      
      res.status(201).json({
        success: true,
        message: '기관이 생성되었습니다',
        organization
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 기관 생성 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || '기관 생성에 실패했습니다'
    });
  }
});

/**
 * PUT /api/system-admin/organizations/:id
 * 기관 정보 수정
 */
router.put('/organizations/:id', async (req, res) => {
  const db = getDB();
  const organizationId = parseInt(req.params.id);
  
  try {
    const {
      name,
      business_registration_number,
      plan_type,
      subscription_status,
      monthly_fee,
      max_users,
      contract_date,
      expiry_date,
      status
    } = req.body;
    
    // 기관 존재 확인
    const org = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );
    
    if (!org) {
      return res.status(404).json({
        success: false,
        error: '기관을 찾을 수 없습니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 기관 정보 업데이트
      await db.run(`
        UPDATE organizations
        SET name = COALESCE(?, name),
            business_registration_number = COALESCE(?, business_registration_number),
            plan_type = COALESCE(?, plan_type),
            subscription_status = COALESCE(?, subscription_status),
            monthly_fee = COALESCE(?, monthly_fee),
            max_users = COALESCE(?, max_users),
            contract_date = COALESCE(?, contract_date),
            expiry_date = COALESCE(?, expiry_date),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        name, business_registration_number, plan_type, subscription_status,
        monthly_fee, max_users, contract_date, expiry_date, status, organizationId
      ]);
      
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
        'organization',
        organizationId,
        `기관 정보 수정: ${org.name}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      // 업데이트된 정보 조회
      const updated = await db.get(
        'SELECT * FROM organizations WHERE id = $1',
        [organizationId]
      );
      
      res.json({
        success: true,
        message: '기관 정보가 수정되었습니다',
        organization: updated
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 기관 수정 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '기관 수정에 실패했습니다'
    });
  }
});

/**
 * DELETE /api/system-admin/organizations/:id
 * 기관 삭제 (soft delete)
 */
router.delete('/organizations/:id', async (req, res) => {
  const db = getDB();
  const organizationId = parseInt(req.params.id);
  
  try {
    const org = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );
    
    if (!org) {
      return res.status(404).json({
        success: false,
        error: '기관을 찾을 수 없습니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // Soft delete
      await db.run(
        'UPDATE organizations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['deleted', organizationId]
      );
      
      // 소속 사용자들의 상태도 변경
      await db.run(
        'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2',
        ['suspended', organizationId]
      );
      
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
        'organization',
        organizationId,
        `기관 삭제: ${org.name}`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      res.json({
        success: true,
        message: '기관이 삭제되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 기관 삭제 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '기관 삭제에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용자 관리 (기관 관리자 지정 등)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/system-admin/users
 * 전체 사용자 조회
 */
router.get('/users', async (req, res) => {
  const db = getDB();
  
  try {
    const { role, organization_id, status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let where = [];
    let params = [];
    
    if (role) {
      where.push('u.role = $1');
      params.push(role);
    }
    
    if (organization_id) {
      where.push('u.organization_id = $1');
      params.push(organization_id);
    }
    
    if (status) {
      where.push('u.status = $1');
      params.push(status);
    }
    
    if (search) {
      where.push('(u.name LIKE $1 OR u.oauth_email LIKE $2 OR u.oauth_nickname LIKE $3)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    
    const users = await db.query(`
      SELECT 
        u.id, u.oauth_provider, u.oauth_email, u.oauth_nickname,
        u.name, u.phone, u.organization_id, u.role, u.status,
        u.is_approved, u.created_at, u.last_login_at,
        o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM users u ${whereClause}
    `, params);
    
    res.json({
      success: true,
      users,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 사용자 목록 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '사용자 목록 조회에 실패했습니다'
    });
  }
});

/**
 * PUT /api/system-admin/users/:id/role
 * 사용자 권한 변경 (org_admin 지정 등)
 */
router.put('/users/:id/role', async (req, res) => {
  const db = getDB();
  const userId = parseInt(req.params.id);
  
  try {
    const { role, organization_id } = req.body;
    
    // 입력 검증
    const validRoles = ['user', 'org_admin', 'system_admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 권한입니다'
      });
    }
    
    // 사용자 확인
    const user = await db.get('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }
    
    await db.beginTransaction();
    
    try {
      // 권한 업데이트
      await db.run(`
        UPDATE users
        SET role = ?,
            organization_id = COALESCE(?, organization_id),
            is_approved = CASE WHEN ? = 'org_admin' THEN 1 ELSE is_approved END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [role, organization_id, role, userId]);
      
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
        userId,
        `사용자 권한 변경: ${user.name} (${user.role} → ${role})`,
        req.ip,
        req.get('user-agent')
      ]);
      
      await db.commit();
      
      res.json({
        success: true,
        message: '사용자 권한이 변경되었습니다'
      });
      
    } catch (err) {
      await db.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('❌ 권한 변경 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '권한 변경에 실패했습니다'
    });
  }
});

/**
 * GET /api/system-admin/audit-logs
 * 감사 로그 조회
 */
router.get('/audit-logs', async (req, res) => {
  const db = getDB();
  
  try {
    const { action, resource_type, user_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let where = [];
    let params = [];
    
    if (action) {
      where.push('a.action = $1');
      params.push(action);
    }
    
    if (resource_type) {
      where.push('a.resource_type = $1');
      params.push(resource_type);
    }
    
    if (user_id) {
      where.push('a.user_id = $1');
      params.push(user_id);
    }
    
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    
    const logs = await db.query(`
      SELECT 
        a.*,
        u.name as user_name,
        u.oauth_email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM audit_logs a ${whereClause}
    `, params);
    
    res.json({
      success: true,
      logs,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 감사 로그 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '감사 로그 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 대시보드 통계 및 사용자 승인 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/system-admin/stats
 * 대시보드 통계
 */
router.get('/stats', async (req, res) => {
  const db = getDB();
  
  try {
    // 총 기관 수
    const orgsResult = await db.get('SELECT COUNT(*) as count FROM organizations');
    
    // 총 사용자 수
    const usersResult = await db.get('SELECT COUNT(*) as count FROM users');
    
    // 승인 대기 사용자 수
    const pendingResult = await db.get('SELECT COUNT(*) as count FROM users WHERE is_approved = false');
    
    // 기관 관리자 수
    const orgAdminsResult = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'org_admin' AND is_approved = true");
    
    res.json({
      success: true,
      totalOrganizations: orgsResult.count,
      totalUsers: usersResult.count,
      pendingApprovals: pendingResult.count,
      orgAdmins: orgAdminsResult.count
    });
    
  } catch (error) {
    console.error('❌ 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다'
    });
  }
});

/**
 * GET /api/system-admin/pending-users
 * 승인 대기 사용자 목록
 */
router.get('/pending-users', async (req, res) => {
  const db = getDB();
  
  try {
    const { filter = 'all' } = req.query;
    
    let whereClause = 'WHERE u.is_approved = false';
    
    if (filter === 'user') {
      whereClause += " AND u.role = 'user'";
    } else if (filter === 'org_admin') {
      whereClause += " AND u.role = 'org_admin'";
    }
    
    const users = await db.query(`
      SELECT 
        u.id,
        u.name,
        u.oauth_provider,
        u.oauth_email,
        u.oauth_nickname,
        u.role,
        u.organization_id,
        u.created_at,
        o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    
    res.json(users.rows);
    
  } catch (error) {
    console.error('❌ 승인 대기 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '승인 대기 목록 조회에 실패했습니다'
    });
  }
});

/**
 * GET /api/system-admin/users
 * 전체 사용자 목록
 */
router.get('/users', async (req, res) => {
  const db = getDB();
  
  try {
    const { filter = 'all', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    
    if (filter === 'system_admin') {
      whereClause += " AND u.role = 'system_admin'";
    } else if (filter === 'org_admin') {
      whereClause += " AND u.role = 'org_admin'";
    } else if (filter === 'user') {
      whereClause += " AND u.role = 'user'";
    }
    
    const users = await db.query(`
      SELECT 
        u.id,
        u.name,
        u.oauth_provider,
        u.oauth_email,
        u.oauth_nickname,
        u.role,
        u.is_approved,
        u.organization_id,
        u.last_login_at,
        u.created_at,
        o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    
    res.json(users.rows);
    
  } catch (error) {
    console.error('❌ 사용자 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 목록 조회에 실패했습니다'
    });
  }
});

/**
 * POST /api/system-admin/approve-user/:userId
 * 사용자 승인
 */
router.post('/approve-user/:userId', async (req, res) => {
  const db = getDB();
  const { userId } = req.params;
  const { role = 'user' } = req.body;
  
  try {
    const result = await db.run(
      `UPDATE users 
       SET is_approved = true, role = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [role, userId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 감사 로그 기록
    await db.run(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.userId,
        'APPROVE_USER',
        'user',
        userId,
        JSON.stringify({ role, approved_by: req.user.userId }),
        req.ip
      ]
    );
    
    res.json({
      success: true,
      message: '사용자가 승인되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 사용자 승인 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 승인에 실패했습니다'
    });
  }
});

/**
 * POST /api/system-admin/promote-to-org-admin/:userId
 * 기관 관리자로 승격
 */
router.post('/promote-to-org-admin/:userId', async (req, res) => {
  const db = getDB();
  const { userId } = req.params;
  const { organization_id } = req.body;
  
  try {
    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: '소속 기관 ID가 필요합니다'
      });
    }
    
    const result = await db.run(
      `UPDATE users 
       SET role = 'org_admin', 
           is_approved = true, 
           organization_id = $1, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [organization_id, userId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 감사 로그 기록
    await db.run(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.userId,
        'PROMOTE_TO_ORG_ADMIN',
        'user',
        userId,
        JSON.stringify({ organization_id, promoted_by: req.user.userId }),
        req.ip
      ]
    );
    
    res.json({
      success: true,
      message: '기관 관리자로 승격되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 기관 관리자 승격 실패:', error);
    res.status(500).json({
      success: false,
      error: '기관 관리자 승격에 실패했습니다'
    });
  }
});

/**
 * POST /api/system-admin/reject-user/:userId
 * 사용자 거부 (삭제)
 */
router.post('/reject-user/:userId', async (req, res) => {
  const db = getDB();
  const { userId } = req.params;
  
  try {
    const result = await db.run(
      `DELETE FROM users WHERE id = $1 AND is_approved = false`,
      [userId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 감사 로그 기록
    await db.run(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.userId,
        'REJECT_USER',
        'user',
        userId,
        JSON.stringify({ rejected_by: req.user.userId }),
        req.ip
      ]
    );
    
    res.json({
      success: true,
      message: '사용자가 거부되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 사용자 거부 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 거부에 실패했습니다'
    });
  }
});

module.exports = router;
