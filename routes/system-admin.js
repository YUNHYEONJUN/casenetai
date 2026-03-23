/**
 * System Admin API
 * 최고 관리자 전용: 기관 및 기관 관리자 관리
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDB } = require('../database/db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { requireSystemAdmin } = require('../middleware/roleAuth');
const { validate } = require('../middleware/validate');
const { success, created } = require('../lib/response');
const { NotFoundError, ValidationError } = require('../lib/errors');
const { logger } = require('../lib/logger');

// 모든 라우트에 인증 + System Admin 권한 필요
router.use(authenticateToken, requireSystemAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const orgsListSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    subscription_status: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

router.get('/organizations', validate(orgsListSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { status, subscription_status, search, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let paramIndex = 1;

    if (status) {
      where.push(`o.status = $${paramIndex++}`);
      params.push(status);
    }

    if (subscription_status) {
      where.push(`o.subscription_status = $${paramIndex++}`);
      params.push(subscription_status);
    }

    if (search) {
      where.push(`(o.name ILIKE $${paramIndex} OR o.business_registration_number ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

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
      GROUP BY o.id, admin_user.name, admin_user.oauth_email
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM organizations o ${whereClause}
    `, params);

    const total = parseInt(totalResult.count) || 0;

    success(res, {
      organizations,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    next(err);
  }
});

const createOrgSchema = z.object({
  body: z.object({
    name: z.string().min(1, '기관명은 필수입니다').max(200),
    business_registration_number: z.string().max(50).optional(),
    plan_type: z.string().max(50).optional().default('free'),
    subscription_status: z.string().max(50).optional().default('inactive'),
    monthly_fee: z.coerce.number().min(0).optional().default(0),
    max_users: z.coerce.number().int().min(0).optional().default(0),
    contract_date: z.string().optional(),
    expiry_date: z.string().optional(),
    admin_user_id: z.coerce.number().int().positive().optional(),
  }),
});

router.post('/organizations', validate(createOrgSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const {
      name, business_registration_number, plan_type, subscription_status,
      monthly_fee, max_users, contract_date, expiry_date, admin_user_id
    } = req.body;

    let adminUser = null;
    if (admin_user_id) {
      adminUser = await db.get(
        'SELECT id, name, oauth_email, role, organization_id FROM users WHERE id = $1',
        [admin_user_id]
      );

      if (!adminUser) {
        throw new NotFoundError('지정한 사용자');
      }

      if (adminUser.organization_id) {
        throw new ValidationError('이미 다른 기관에 소속된 사용자입니다');
      }
    }

    const organizationId = await db.transaction(async (client) => {
      const orgResult = await client.query(`
        INSERT INTO organizations (
          name, business_registration_number, plan_type, subscription_status,
          monthly_fee, max_users, contract_date, expiry_date, created_by_admin_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING id
      `, [
        name, business_registration_number || null, plan_type, subscription_status,
        monthly_fee, max_users, contract_date || null, expiry_date || null,
        admin_user_id || null
      ]);

      const newOrgId = orgResult.rows[0].id;

      if (admin_user_id) {
        await client.query(`
          UPDATE users
          SET organization_id = $1, role = 'org_admin', is_approved = true,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newOrgId, admin_user_id]);
      }

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'create', 'organization', newOrgId,
        `기관 생성: ${name}` + (admin_user_id ? ` (관리자: ${adminUser.name})` : ''),
        req.ip, req.get('user-agent')
      ]);

      return newOrgId;
    });

    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    logger.info('기관 생성', { name, id: organizationId });

    created(res, { message: '기관이 생성되었습니다', organization });

  } catch (err) {
    next(err);
  }
});

const orgIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

const updateOrgSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    name: z.string().max(200).optional(),
    business_registration_number: z.string().max(50).optional(),
    plan_type: z.string().max(50).optional(),
    subscription_status: z.string().max(50).optional(),
    monthly_fee: z.coerce.number().min(0).optional(),
    max_users: z.coerce.number().int().min(0).optional(),
    contract_date: z.string().optional().nullable(),
    expiry_date: z.string().optional().nullable(),
    status: z.string().max(50).optional(),
  }),
});

router.put('/organizations/:id', validate(updateOrgSchema), async (req, res, next) => {
  const db = getDB();
  const organizationId = req.params.id;

  try {
    const {
      name, business_registration_number, plan_type, subscription_status,
      monthly_fee, max_users, contract_date, expiry_date, status
    } = req.body;

    const org = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (!org) {
      throw new NotFoundError('기관');
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE organizations
        SET name = COALESCE($1, name),
            business_registration_number = COALESCE($2, business_registration_number),
            plan_type = COALESCE($3, plan_type),
            subscription_status = COALESCE($4, subscription_status),
            monthly_fee = COALESCE($5, monthly_fee),
            max_users = COALESCE($6, max_users),
            contract_date = COALESCE($7, contract_date),
            expiry_date = COALESCE($8, expiry_date),
            status = COALESCE($9, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
      `, [
        name, business_registration_number, plan_type, subscription_status,
        monthly_fee, max_users, contract_date, expiry_date, status, organizationId
      ]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'update', 'organization', organizationId,
        `기관 정보 수정: ${org.name}`, req.ip, req.get('user-agent')
      ]);
    });

    const updated = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    success(res, { message: '기관 정보가 수정되었습니다', organization: updated });

  } catch (err) {
    next(err);
  }
});

router.delete('/organizations/:id', validate(orgIdSchema), async (req, res, next) => {
  const db = getDB();
  const organizationId = req.params.id;

  try {
    const org = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (!org) {
      throw new NotFoundError('기관');
    }

    await db.transaction(async (client) => {
      await client.query(
        'UPDATE organizations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['deleted', organizationId]
      );

      await client.query(
        'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2',
        ['suspended', organizationId]
      );

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'delete', 'organization', organizationId,
        `기관 삭제: ${org.name}`, req.ip, req.get('user-agent')
      ]);
    });

    success(res, { message: '기관이 삭제되었습니다' });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용자 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const usersListSchema = z.object({
  query: z.object({
    role: z.string().optional(),
    organization_id: z.coerce.number().int().positive().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

router.get('/users', validate(usersListSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { role, organization_id, status, search, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let paramIndex = 1;

    if (role) {
      where.push(`u.role = $${paramIndex++}`);
      params.push(role);
    }

    if (organization_id) {
      where.push(`u.organization_id = $${paramIndex++}`);
      params.push(organization_id);
    }

    if (status) {
      where.push(`u.status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      where.push(`(u.name ILIKE $${paramIndex} OR u.oauth_email ILIKE $${paramIndex} OR u.oauth_nickname ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
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
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM users u ${whereClause}
    `, params);

    const total = parseInt(totalResult.count) || 0;

    success(res, {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    next(err);
  }
});

const userRoleSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    role: z.enum(['user', 'org_admin', 'system_admin'], { message: '유효하지 않은 권한입니다' }),
    organization_id: z.coerce.number().int().positive().optional(),
  }),
});

router.put('/users/:id/role', validate(userRoleSchema), async (req, res, next) => {
  const db = getDB();
  const userId = req.params.id;

  try {
    const { role, organization_id } = req.body;

    const user = await db.get('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new NotFoundError('사용자');
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE users
        SET role = $1,
            organization_id = COALESCE($2, organization_id),
            is_approved = CASE WHEN $3 = 'org_admin' THEN true ELSE is_approved END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [role, organization_id, role, userId]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'update', 'user', userId,
        `사용자 권한 변경: ${user.name} (${user.role} → ${role})`,
        req.ip, req.get('user-agent')
      ]);
    });

    success(res, { message: '사용자 권한이 변경되었습니다' });

  } catch (err) {
    next(err);
  }
});

const auditLogsSchema = z.object({
  query: z.object({
    action: z.string().optional(),
    resource_type: z.string().optional(),
    user_id: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

router.get('/audit-logs', validate(auditLogsSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { action, resource_type, user_id, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let paramIndex = 1;

    if (action) {
      where.push(`a.action = $${paramIndex++}`);
      params.push(action);
    }

    if (resource_type) {
      where.push(`a.resource_type = $${paramIndex++}`);
      params.push(resource_type);
    }

    if (user_id) {
      where.push(`a.user_id = $${paramIndex++}`);
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
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM audit_logs a ${whereClause}
    `, params);

    const total = parseInt(totalResult.count) || 0;

    success(res, {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 대시보드 통계 및 사용자 승인 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/stats', async (req, res, next) => {
  const db = getDB();

  try {
    const orgsResult = await db.get('SELECT COUNT(*) as count FROM organizations');
    const usersResult = await db.get('SELECT COUNT(*) as count FROM users');
    const pendingResult = await db.get('SELECT COUNT(*) as count FROM users WHERE is_approved = false');
    const orgAdminsResult = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'org_admin' AND is_approved = true");

    success(res, {
      totalOrganizations: orgsResult.count,
      totalUsers: usersResult.count,
      pendingApprovals: pendingResult.count,
      orgAdmins: orgAdminsResult.count,
    });

  } catch (err) {
    next(err);
  }
});

const pendingUsersSchema = z.object({
  query: z.object({
    filter: z.enum(['all', 'user', 'org_admin']).default('all'),
  }),
});

router.get('/pending-users', validate(pendingUsersSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { filter } = req.query;

    let whereClause = 'WHERE u.is_approved = false';

    if (filter === 'user') {
      whereClause += " AND u.role = 'user'";
    } else if (filter === 'org_admin') {
      whereClause += " AND u.role = 'org_admin'";
    }

    const users = await db.query(`
      SELECT
        u.id, u.name, u.oauth_provider, u.oauth_email, u.oauth_nickname,
        u.role, u.organization_id, u.created_at,
        o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT 100
    `);

    success(res, users);

  } catch (err) {
    next(err);
  }
});

const userIdParamSchema = z.object({
  params: z.object({
    userId: z.coerce.number().int().positive(),
  }),
});

router.post('/approve-user/:userId', validate(userIdParamSchema), async (req, res, next) => {
  const db = getDB();
  const { userId } = req.params;
  const validRoles = ['user', 'org_admin', 'system_admin'];
  const rawRole = req.body.role || 'user';
  const role = validRoles.includes(rawRole) ? rawRole : 'user';

  try {
    const result = await db.run(
      `UPDATE users
       SET is_approved = true, role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [role, userId]
    );

    if (result.changes === 0) {
      throw new NotFoundError('사용자');
    }

    await db.run(
      `INSERT INTO audit_logs (user_id, user_role, action, resource_type, resource_id, description, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.userId, req.user.role, 'APPROVE_USER', 'user', userId,
        JSON.stringify({ role, approved_by: req.user.userId }),
        req.ip, req.get('user-agent')
      ]
    );

    success(res, { message: '사용자가 승인되었습니다' });

  } catch (err) {
    next(err);
  }
});

const promoteSchema = z.object({
  params: z.object({
    userId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    organization_id: z.coerce.number().int().positive('소속 기관 ID가 필요합니다'),
  }),
});

router.post('/promote-to-org-admin/:userId', validate(promoteSchema), async (req, res, next) => {
  const db = getDB();
  const { userId } = req.params;
  const { organization_id } = req.body;

  try {
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
      throw new NotFoundError('사용자');
    }

    await db.run(
      `INSERT INTO audit_logs (user_id, user_role, action, resource_type, resource_id, description, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.userId, req.user.role, 'PROMOTE_TO_ORG_ADMIN', 'user', userId,
        JSON.stringify({ organization_id, promoted_by: req.user.userId }),
        req.ip, req.get('user-agent')
      ]
    );

    success(res, { message: '기관 관리자로 승격되었습니다' });

  } catch (err) {
    next(err);
  }
});

router.post('/reject-user/:userId', validate(userIdParamSchema), async (req, res, next) => {
  const db = getDB();
  const { userId } = req.params;

  try {
    const result = await db.run(
      `DELETE FROM users WHERE id = $1 AND is_approved = false`,
      [userId]
    );

    if (result.changes === 0) {
      throw new NotFoundError('사용자');
    }

    await db.run(
      `INSERT INTO audit_logs (user_id, user_role, action, resource_type, resource_id, description, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.userId, req.user.role, 'REJECT_USER', 'user', userId,
        JSON.stringify({ rejected_by: req.user.userId }),
        req.ip, req.get('user-agent')
      ]
    );

    success(res, { message: '사용자가 거부되었습니다' });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
