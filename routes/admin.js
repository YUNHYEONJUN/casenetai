/**
 * 관리자 대시보드 라우터
 * - 전체 기관 사용량 모니터링
 * - 기관별 상세 통계
 * - 월별 리포트
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { success, created } = require('../lib/response');
const { ValidationError, NotFoundError } = require('../lib/errors');
const { logger } = require('../lib/logger');
const usageTrackingService = require('../services/usageTrackingService');
const { getDB } = require('../database/db-postgres');

// 관리자 인증 미들웨어 적용
router.use(authenticateToken);
router.use(requireAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/dashboard/overview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const periodSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

router.get('/dashboard/overview', validate(periodSchema), async (req, res, next) => {
  try {
    const now = new Date();
    const targetYear = req.query.year || now.getFullYear();
    const targetMonth = req.query.month || (now.getMonth() + 1);

    const usageStats = await usageTrackingService.getAllOrganizationsUsage(targetYear, targetMonth);

    const db = getDB();

    const totalAnonymizations = await db.get(
      `SELECT COUNT(*) as count,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
              SUM(CASE WHEN status = 'quota_exceeded' THEN 1 ELSE 0 END) as quota_exceeded_count,
              SUM(total_anonymized) as total_items_anonymized,
              AVG(processing_time_seconds) as avg_processing_time
       FROM anonymization_logs
       WHERE EXTRACT(YEAR FROM created_at) = $1
       AND EXTRACT(MONTH FROM created_at) = $2`,
      [targetYear, targetMonth]
    );

    const totalUsers = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE role != 'system_admin'"
    );

    const totalOrgs = await db.get(
      'SELECT COUNT(*) as count FROM organizations'
    );

    success(res, {
      period: { year: targetYear, month: targetMonth },
      usage: usageStats,
      statistics: {
        totalUsers: totalUsers.count,
        totalOrganizations: totalOrgs.count,
        totalAnonymizations: totalAnonymizations.count || 0,
        successfulAnonymizations: totalAnonymizations.success_count || 0,
        failedAnonymizations: totalAnonymizations.failed_count || 0,
        quotaExceeded: totalAnonymizations.quota_exceeded_count || 0,
        totalItemsAnonymized: totalAnonymizations.total_items_anonymized || 0,
        averageProcessingTime: totalAnonymizations.avg_processing_time || 0,
      },
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/organizations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/organizations', async (req, res, next) => {
  try {
    const db = getDB();

    const organizations = await db.query(
      `SELECT
         o.*,
         (SELECT COUNT(*) FROM users WHERE organization_id = o.id) as user_count,
         ouq.quota_hours,
         ouq.used_hours,
         ouq.remaining_hours,
         ouq.request_count,
         ouq.last_used_at
       FROM organizations o
       LEFT JOIN organization_usage_quotas ouq ON o.id = ouq.organization_id
         AND ouq.year = $1 AND ouq.month = $2
       ORDER BY o.name`,
      [new Date().getFullYear(), new Date().getMonth() + 1]
    );

    success(res, {
      count: organizations.length,
      organizations,
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/organizations/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const orgIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.get('/organizations/:id', validate(orgIdSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();

    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [id]
    );

    if (!organization) {
      throw new NotFoundError('기관');
    }

    const users = await db.query(
      `SELECT id, oauth_email as email, name, role, created_at, last_login_at
       FROM users
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    const currentQuota = await usageTrackingService.getOrganizationQuota(id);
    const usageTrend = await usageTrackingService.getOrganizationUsageTrend(id, 6);
    const recentLogs = await usageTrackingService.getOrganizationAnonymizationLogs(id, 20);

    success(res, {
      organization,
      users,
      currentQuota,
      usageTrend,
      recentLogs,
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/organizations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const createOrgSchema = z.object({
  body: z.object({
    name: z.string().min(1, '기관명은 필수입니다').max(200),
    organizationType: z.string().max(50).optional().default('elderly_protection'),
    region: z.string().max(100).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    isSponsored: z.boolean().optional(),
    sponsorName: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

router.post('/organizations', validate(createOrgSchema), async (req, res, next) => {
  try {
    const {
      name, organizationType, region, contactEmail, contactPhone,
      address, isSponsored, sponsorName, notes
    } = req.body;

    const db = getDB();

    const result = await db.run(
      `INSERT INTO organizations
       (name, organization_type, region, contact_email, contact_phone,
        address, is_sponsored, sponsor_name, notes, plan_type, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'free', 'active')
       RETURNING id`,
      [name, organizationType, region, contactEmail, contactPhone,
       address, isSponsored, sponsorName, notes]
    );

    const organizationId = result.lastID;

    await usageTrackingService.getOrganizationQuota(organizationId);

    logger.info('새 기관 등록', { name, id: organizationId });

    created(res, {
      organizationId,
      message: '기관이 등록되었습니다',
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/admin/organizations/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const updateOrgSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    name: z.string().max(200).optional(),
    organizationType: z.string().max(50).optional(),
    region: z.string().max(100).optional(),
    contactEmail: z.string().email().optional().nullable(),
    contactPhone: z.string().max(20).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    isSponsored: z.boolean().optional(),
    sponsorName: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    subscriptionStatus: z.string().max(50).optional(),
  }),
});

router.put('/organizations/:id', validate(updateOrgSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, organizationType, region, contactEmail, contactPhone,
      address, isSponsored, sponsorName, notes, subscriptionStatus
    } = req.body;

    const db = getDB();

    await db.run(
      `UPDATE organizations
       SET name = COALESCE($1, name),
           organization_type = COALESCE($2, organization_type),
           region = COALESCE($3, region),
           contact_email = COALESCE($4, contact_email),
           contact_phone = COALESCE($5, contact_phone),
           address = COALESCE($6, address),
           is_sponsored = COALESCE($7, is_sponsored),
           sponsor_name = COALESCE($8, sponsor_name),
           notes = COALESCE($9, notes),
           subscription_status = COALESCE($10, subscription_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [name, organizationType, region, contactEmail, contactPhone,
       address, isSponsored, sponsorName, notes, subscriptionStatus, id]
    );

    logger.info('기관 정보 수정', { id });

    success(res, { message: '기관 정보가 수정되었습니다' });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/admin/organizations/:id/quota
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const quotaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    quotaHours: z.coerce.number().min(0, '유효한 할당 시간을 입력해주세요'),
  }),
});

router.put('/organizations/:id/quota', validate(quotaSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quotaHours } = req.body;

    const db = getDB();

    const now = new Date();
    const targetYear = req.body.year || now.getFullYear();
    const targetMonth = req.body.month || (now.getMonth() + 1);

    let quota = await db.get(
      `SELECT * FROM organization_usage_quotas
       WHERE organization_id = $1 AND year = $2 AND month = $3`,
      [id, targetYear, targetMonth]
    );

    if (quota) {
      await db.run(
        `UPDATE organization_usage_quotas
         SET quota_hours = $1,
             remaining_hours = $1 - used_hours,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $2 AND year = $3 AND month = $4`,
        [quotaHours, id, targetYear, targetMonth]
      );
    } else {
      await db.run(
        `INSERT INTO organization_usage_quotas
         (organization_id, year, month, quota_hours, used_hours, remaining_hours)
         VALUES ($1, $2, $3, $4, 0.0, $4)`,
        [id, targetYear, targetMonth, quotaHours]
      );
    }

    logger.info('기관 할당량 수정', { id, year: targetYear, month: targetMonth, quotaHours });

    success(res, { message: '할당량이 수정되었습니다' });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/logs/anonymization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const logsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
    organizationId: z.coerce.number().int().positive().optional(),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

router.get('/logs/anonymization', validate(logsSchema), async (req, res, next) => {
  try {
    const { limit, offset, organizationId, status, startDate, endDate } = req.query;

    const db = getDB();

    let whereClauses = [];
    let params = [];
    let paramIndex = 1;

    if (organizationId) {
      whereClauses.push(`al.organization_id = $${paramIndex++}`);
      params.push(organizationId);
    }

    if (status) {
      whereClauses.push(`al.status = $${paramIndex++}`);
      params.push(status);
    }

    if (startDate) {
      whereClauses.push(`al.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`al.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const logs = await db.query(
      `SELECT
         al.*,
         u.name as user_name,
         u.oauth_email as user_email,
         o.name as organization_name
       FROM anonymization_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN organizations o ON al.organization_id = o.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM anonymization_logs al ${whereClause}`,
      params
    );

    success(res, {
      total: parseInt(countResult.count),
      limit,
      offset,
      logs,
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/reports/monthly
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/reports/monthly', validate(periodSchema), async (req, res, next) => {
  try {
    const now = new Date();
    const targetYear = req.query.year || now.getFullYear();
    const targetMonth = req.query.month || (now.getMonth() + 1);

    const usageStats = await usageTrackingService.getAllOrganizationsUsage(targetYear, targetMonth);

    const topOrganizations = usageStats.organizations
      .sort((a, b) => b.used_hours - a.used_hours)
      .slice(0, 5);

    const atRiskOrganizations = usageStats.organizations
      .filter(org => org.quota_hours > 0 && (org.used_hours / org.quota_hours) >= 0.8)
      .sort((a, b) => (b.used_hours / b.quota_hours) - (a.used_hours / a.quota_hours));

    const inactiveOrganizations = usageStats.organizations
      .filter(org => org.used_hours === 0);

    success(res, {
      period: { year: targetYear, month: targetMonth },
      summary: {
        totalOrganizations: usageStats.totalOrganizations,
        totalQuotaHours: usageStats.totalQuotaHours,
        totalUsedHours: usageStats.totalUsedHours,
        totalRemainingHours: usageStats.totalRemainingHours,
        totalRequests: usageStats.totalRequests,
        averageUsagePercent: usageStats.averageUsagePercent,
      },
      topOrganizations,
      atRiskOrganizations,
      inactiveOrganizations,
      allOrganizations: usageStats.organizations,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
