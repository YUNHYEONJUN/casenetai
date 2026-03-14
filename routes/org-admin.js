/**
 * Organization Admin API
 * 기관 관리자 전용: 소속 직원 관리
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDB } = require('../database/db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { requireOrgAdmin, requireOwnOrgAdmin } = require('../middleware/roleAuth');
const { validate } = require('../middleware/validate');
const { success, paginated } = require('../lib/response');
const { NotFoundError, ForbiddenError, ValidationError } = require('../lib/errors');
const { logger } = require('../lib/logger');

// 모든 라우트에 인증 + Org Admin 권한 필요
router.use(authenticateToken, requireOrgAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 직원 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const employeesListSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    search: z.string().optional(),
    organization_id: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

router.get('/employees', validate(employeesListSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { status, search, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let organizationId;
    if (req.user.role === 'system_admin') {
      organizationId = req.query.organization_id || req.user.organizationId;
    } else {
      organizationId = req.user.organizationId;
    }

    if (!organizationId) {
      throw new ValidationError('기관 ID가 필요합니다');
    }

    let where = ['u.organization_id = $1'];
    let params = [organizationId];
    let paramIndex = 2;

    if (status) {
      where.push(`u.status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      where.push(`(u.name ILIKE $${paramIndex} OR u.oauth_email ILIKE $${paramIndex + 1})`);
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
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
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM users u ${whereClause}
    `, params);

    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    const total = parseInt(totalResult.count) || 0;

    success(res, {
      organization,
      employees,
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

const employeeIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.get('/employees/:id', validate(employeeIdSchema), async (req, res, next) => {
  const db = getDB();
  const employeeId = req.params.id;

  try {
    const employee = await db.get(`
      SELECT
        u.*,
        c.balance, c.total_purchased, c.total_used, c.free_trial_count,
        o.name as organization_name
      FROM users u
      LEFT JOIN credits c ON c.user_id = u.id
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1
    `, [employeeId]);

    if (!employee) {
      throw new NotFoundError('직원');
    }

    if (req.user.role === 'org_admin' && employee.organization_id !== req.user.organizationId) {
      throw new ForbiddenError('다른 기관의 직원 정보에 접근할 수 없습니다');
    }

    const recentUsage = await db.query(`
      SELECT * FROM usage_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [employeeId]);

    success(res, { employee, recentUsage });

  } catch (err) {
    next(err);
  }
});

const updateEmployeeSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    name: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    role: z.string().max(50).optional(),
    status: z.string().max(50).optional(),
  }),
});

router.put('/employees/:id', validate(updateEmployeeSchema), async (req, res, next) => {
  const db = getDB();
  const employeeId = req.params.id;

  try {
    const { name, phone, role, status } = req.body;

    const employee = await db.get(
      'SELECT * FROM users WHERE id = $1',
      [employeeId]
    );

    if (!employee) {
      throw new NotFoundError('직원');
    }

    if (req.user.role === 'org_admin') {
      if (employee.organization_id !== req.user.organizationId) {
        throw new ForbiddenError('다른 기관의 직원을 수정할 수 없습니다');
      }

      if (role && ['system_admin', 'org_admin'].includes(role)) {
        throw new ForbiddenError('관리자 권한을 부여할 수 없습니다');
      }
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE users
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            role = COALESCE($3, role),
            status = COALESCE($4, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [name, phone, role, status, employeeId]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'update', 'user', employeeId,
        `직원 정보 수정: ${employee.name}`, req.ip, req.get('user-agent')
      ]);
    });

    success(res, { message: '직원 정보가 수정되었습니다' });

  } catch (err) {
    next(err);
  }
});

router.delete('/employees/:id', validate(employeeIdSchema), async (req, res, next) => {
  const db = getDB();
  const employeeId = req.params.id;

  try {
    const employee = await db.get(
      'SELECT * FROM users WHERE id = $1',
      [employeeId]
    );

    if (!employee) {
      throw new NotFoundError('직원');
    }

    if (req.user.role === 'org_admin' && employee.organization_id !== req.user.organizationId) {
      throw new ForbiddenError('다른 기관의 직원을 제거할 수 없습니다');
    }

    if (employeeId === req.user.userId) {
      throw new ValidationError('본인은 제거할 수 없습니다');
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE users
        SET organization_id = NULL,
            role = 'user',
            is_approved = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [employeeId]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'delete', 'user', employeeId,
        `직원 제거: ${employee.name}`, req.ip, req.get('user-agent')
      ]);
    });

    success(res, { message: '직원이 기관에서 제거되었습니다' });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 가입 요청 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const joinRequestsSchema = z.object({
  query: z.object({
    status: z.string().default('pending'),
    organization_id: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

router.get('/join-requests', validate(joinRequestsSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { status, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let organizationId;
    if (req.user.role === 'system_admin') {
      organizationId = req.query.organization_id;
    } else {
      organizationId = req.user.organizationId;
    }

    if (!organizationId) {
      throw new ValidationError('기관 ID가 필요합니다');
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
      WHERE r.organization_id = $1 AND r.status = $2
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4
    `, [organizationId, status, limit, offset]);

    const totalResult = await db.get(`
      SELECT COUNT(*) as count
      FROM organization_join_requests
      WHERE organization_id = $1 AND status = $2
    `, [organizationId, status]);

    const total = parseInt(totalResult.count) || 0;

    success(res, {
      requests,
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

const joinRequestIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    review_message: z.string().max(1000).optional(),
  }),
});

router.put('/join-requests/:id/approve', validate(joinRequestIdSchema), async (req, res, next) => {
  const db = getDB();
  const requestId = req.params.id;

  try {
    const { review_message } = req.body;

    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new NotFoundError('가입 요청');
    }

    if (req.user.role === 'org_admin' && request.organization_id !== req.user.organizationId) {
      throw new ForbiddenError('다른 기관의 가입 요청을 처리할 수 없습니다');
    }

    if (request.status !== 'pending') {
      throw new ValidationError('이미 처리된 요청입니다');
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE organization_join_requests
        SET status = 'approved',
            reviewed_by = $1,
            reviewed_at = CURRENT_TIMESTAMP,
            review_message = $2
        WHERE id = $3
      `, [req.user.userId, review_message || '승인되었습니다', requestId]);

      await client.query(`
        UPDATE users
        SET organization_id = $1,
            is_approved = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [request.organization_id, request.user_id]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'approve', 'join_request', requestId,
        `가입 요청 승인: user_id=${request.user_id}`, req.ip, req.get('user-agent')
      ]);
    });

    logger.info('가입 요청 승인', { requestId, userId: request.user_id });

    success(res, { message: '가입 요청이 승인되었습니다' });

  } catch (err) {
    next(err);
  }
});

router.put('/join-requests/:id/reject', validate(joinRequestIdSchema), async (req, res, next) => {
  const db = getDB();
  const requestId = req.params.id;

  try {
    const { review_message } = req.body;

    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new NotFoundError('가입 요청');
    }

    if (req.user.role === 'org_admin' && request.organization_id !== req.user.organizationId) {
      throw new ForbiddenError('다른 기관의 가입 요청을 처리할 수 없습니다');
    }

    if (request.status !== 'pending') {
      throw new ValidationError('이미 처리된 요청입니다');
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE organization_join_requests
        SET status = 'rejected',
            reviewed_by = $1,
            reviewed_at = CURRENT_TIMESTAMP,
            review_message = $2
        WHERE id = $3
      `, [req.user.userId, review_message || '요청이 거절되었습니다', requestId]);

      await client.query(`
        INSERT INTO audit_logs (
          user_id, user_role, action, resource_type, resource_id,
          description, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        req.user.userId, req.user.role, 'reject', 'join_request', requestId,
        `가입 요청 거절: user_id=${request.user_id}`, req.ip, req.get('user-agent')
      ]);
    });

    success(res, { message: '가입 요청이 거절되었습니다' });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 통계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const statisticsSchema = z.object({
  query: z.object({
    organization_id: z.coerce.number().int().positive().optional(),
  }),
});

router.get('/statistics', validate(statisticsSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const organizationId = req.user.role === 'system_admin'
      ? req.query.organization_id
      : req.user.organizationId;

    if (!organizationId) {
      throw new ValidationError('기관 ID가 필요합니다');
    }

    const employeeStats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_approved = true THEN 1 ELSE 0 END) as approved
      FROM users
      WHERE organization_id = $1
    `, [organizationId]);

    const usageStats = await db.get(`
      SELECT
        COUNT(*) as total_count,
        SUM(total_cost) as total_cost,
        AVG(total_cost) as avg_cost
      FROM usage_logs u
      JOIN users usr ON usr.id = u.user_id
      WHERE usr.organization_id = $1
        AND u.created_at >= CURRENT_TIMESTAMP + INTERVAL '-30 days'
    `, [organizationId]);

    const pendingRequests = await db.get(`
      SELECT COUNT(*) as count
      FROM organization_join_requests
      WHERE organization_id = $1 AND status = 'pending'
    `, [organizationId]);

    success(res, {
      statistics: {
        employees: employeeStats,
        usage: usageStats,
        pendingRequests: pendingRequests.count,
      },
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
