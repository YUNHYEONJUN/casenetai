/**
 * 기관 가입 요청 API
 * 일반 사용자가 기관에 가입 요청
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDB } = require('../database/db-postgres');
const { authenticateToken } = require('../middleware/auth');
const { validate, paginationQuery } = require('../middleware/validate');
const { success, created, paginated, error } = require('../lib/response');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../lib/errors');
const { logger } = require('../lib/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 목록 조회 (공개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const listOrgsSchema = z.object({
  query: paginationQuery.extend({
    search: z.string().optional(),
  }),
});

router.get('/organizations', validate(listOrgsSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { search, page, limit } = req.query;
    const offset = (page - 1) * limit;

    let where = ['status = $1'];
    let params = ['active'];
    let paramIndex = 2;

    if (search) {
      where.push(`name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const organizations = await db.query(`
      SELECT id, name, plan_type, subscription_status, created_at
      FROM organizations
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    const totalResult = await db.get(
      `SELECT COUNT(*) as count FROM organizations ${whereClause}`,
      params
    );

    paginated(res, {
      items: organizations,
      total: parseInt(totalResult.count) || 0,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 가입 요청 (로그인 필요)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.use(authenticateToken);

const createRequestSchema = z.object({
  body: z.object({
    organization_id: z.coerce.number().int().positive('기관 ID는 필수입니다'),
    message: z.string().max(500).optional().default(''),
  }),
});

router.post('/', validate(createRequestSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const { organization_id, message } = req.body;

    if (req.user.organizationId) {
      throw new ConflictError('이미 기관에 소속되어 있습니다');
    }

    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1 AND status = $2',
      [organization_id, 'active']
    );

    if (!organization) {
      throw new NotFoundError('기관');
    }

    const existingRequest = await db.get(`
      SELECT * FROM organization_join_requests
      WHERE user_id = $1 AND organization_id = $2 AND status = 'pending'
    `, [req.user.userId, organization_id]);

    if (existingRequest) {
      throw new ConflictError('이미 가입 요청이 대기 중입니다');
    }

    const result = await db.run(`
      INSERT INTO organization_join_requests (user_id, organization_id, message, status)
      VALUES ($1, $2, $3, 'pending') RETURNING id
    `, [req.user.userId, organization_id, message]);

    logger.info('가입 요청 생성', { userId: req.user.userId, orgId: organization_id });

    created(res, { requestId: result.lastID, message: '가입 요청이 제출되었습니다' });
  } catch (err) {
    next(err);
  }
});

router.get('/my', async (req, res, next) => {
  const db = getDB();

  try {
    const requests = await db.query(`
      SELECT
        r.*,
        o.name as organization_name,
        reviewer.name as reviewer_name
      FROM organization_join_requests r
      JOIN organizations o ON o.id = r.organization_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [req.user.userId]);

    success(res, { requests });
  } catch (err) {
    next(err);
  }
});

const deleteRequestSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.delete('/:id', validate(deleteRequestSchema), async (req, res, next) => {
  const db = getDB();
  const requestId = req.params.id;

  try {
    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = $1',
      [requestId]
    );

    if (!request) {
      throw new NotFoundError('가입 요청');
    }

    if (request.user_id !== req.user.userId) {
      throw new ForbiddenError('다른 사용자의 요청을 취소할 수 없습니다');
    }

    if (request.status !== 'pending') {
      throw new ValidationError('이미 처리된 요청은 취소할 수 없습니다');
    }

    await db.run('DELETE FROM organization_join_requests WHERE id = $1', [requestId]);

    success(res, { message: '가입 요청이 취소되었습니다' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
