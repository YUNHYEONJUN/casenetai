/**
 * System Admin Dashboard API
 * 기관별/계정별 사용 현황 조회 및 통계
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireSystemAdmin } = require('../middleware/roleAuth');
const { getDB } = require('../database/db-postgres');
const { logger } = require('../lib/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 전체 시스템 통계 (Overview)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/overview', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();

    const orgStats = await db.get(`
      SELECT
        COUNT(*) as total_organizations,
        SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) as active_organizations
      FROM organizations
    `);

    const userStats = await db.get(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'system_admin' THEN 1 ELSE 0 END) as system_admins,
        SUM(CASE WHEN role = 'org_admin' THEN 1 ELSE 0 END) as org_admins,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regular_users,
        SUM(CASE WHEN is_approved = true THEN 1 ELSE 0 END) as approved_users,
        SUM(CASE WHEN is_approved = false THEN 1 ELSE 0 END) as pending_users
      FROM users
    `);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const usageStats = await db.get(`
      SELECT
        SUM(quota_hours) as total_quota_hours,
        SUM(used_hours) as total_used_hours,
        SUM(remaining_hours) as total_remaining_hours,
        SUM(request_count) as total_requests,
        COUNT(*) as organizations_with_usage
      FROM organization_usage_quotas
      WHERE year = $1 AND month = $2
    `, [currentYear, currentMonth]);

    const creditStats = await db.get(`
      SELECT
        SUM(balance) as total_balance,
        SUM(total_purchased) as total_purchased,
        SUM(total_used) as total_used,
        SUM(total_bonus) as total_bonus,
        AVG(balance) as avg_balance
      FROM credits
    `);

    const paymentStats = await db.get(`
      SELECT
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'success' THEN amount ELSE NULL END) as avg_payment_amount
      FROM payments
      WHERE EXTRACT(YEAR FROM created_at) = $1 AND EXTRACT(MONTH FROM created_at) = $2
    `, [currentYear, currentMonth]);

    const recentActivity = await db.get(`
      SELECT
        COUNT(DISTINCT user_id) as active_users_7d,
        COUNT(*) as total_logs_7d
      FROM anonymization_logs
      WHERE created_at >= CURRENT_TIMESTAMP + INTERVAL '-7 days'
    `);

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        period: { year: currentYear, month: currentMonth },
        organizations: {
          total: parseInt(orgStats.total_organizations) || 0,
          active: parseInt(orgStats.active_organizations) || 0
        },
        users: {
          total: userStats.total_users || 0,
          system_admins: userStats.system_admins || 0,
          org_admins: userStats.org_admins || 0,
          regular_users: userStats.regular_users || 0,
          approved: userStats.approved_users || 0,
          pending: userStats.pending_users || 0
        },
        usage: {
          total_quota_hours: usageStats.total_quota_hours || 0,
          total_used_hours: usageStats.total_used_hours || 0,
          total_remaining_hours: usageStats.total_remaining_hours || 0,
          total_requests: usageStats.total_requests || 0,
          organizations_with_usage: usageStats.organizations_with_usage || 0,
          usage_percentage: usageStats.total_quota_hours > 0
            ? ((usageStats.total_used_hours / usageStats.total_quota_hours) * 100).toFixed(2)
            : 0
        },
        credits: {
          total_balance: creditStats.total_balance || 0,
          total_purchased: creditStats.total_purchased || 0,
          total_used: creditStats.total_used || 0,
          total_bonus: creditStats.total_bonus || 0,
          avg_balance: Math.round(creditStats.avg_balance || 0)
        },
        payments: {
          total_payments: paymentStats.total_payments || 0,
          successful_payments: paymentStats.successful_payments || 0,
          total_revenue: paymentStats.total_revenue || 0,
          avg_payment_amount: Math.round(paymentStats.avg_payment_amount || 0)
        },
        recent_activity: {
          active_users_7d: recentActivity.active_users_7d || 0,
          total_logs_7d: recentActivity.total_logs_7d || 0
        }
      }
    });

  } catch (error) {
    logger.error('Overview 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '통계 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 기관별 사용 현황 (상세)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/organizations/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { year, month, sort = 'used_hours', order = 'DESC' } = req.query;
    const safePage = Math.max(1, parseInt(req.query.page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);

    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : (now.getMonth() + 1);
    const offset = (safePage - 1) * safeLimit;

    const validSortColumns = ['used_hours', 'remaining_hours', 'request_count', 'name'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'used_hours';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const organizations = await db.all(`
      SELECT
        o.id, o.name, o.business_registration_number,
        o.plan_type, o.subscription_status, o.max_users,
        o.region, o.organization_type,
        COALESCE(q.quota_hours, 10.0) as quota_hours,
        COALESCE(q.used_hours, 0.0) as used_hours,
        COALESCE(q.remaining_hours, 10.0) as remaining_hours,
        COALESCE(q.request_count, 0) as request_count,
        q.last_used_at,
        (SELECT COUNT(*) FROM users WHERE organization_id = o.id) as user_count,
        (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND is_approved = true) as approved_user_count,
        (SELECT COUNT(*) FROM anonymization_logs WHERE organization_id = o.id) as total_anonymizations
      FROM organizations o
      LEFT JOIN organization_usage_quotas q ON o.id = q.organization_id
        AND q.year = $1 AND q.month = $2
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $3 OFFSET $4
    `, [targetYear, targetMonth, safeLimit, offset]);

    const totalCount = await db.get('SELECT COUNT(*) as count FROM organizations');

    const enrichedOrgs = organizations.map(org => ({
      ...org,
      usage_percentage: org.quota_hours > 0
        ? ((org.used_hours / org.quota_hours) * 100).toFixed(2)
        : 0,
      is_quota_exceeded: org.remaining_hours <= 0,
      is_high_usage: org.quota_hours > 0 && (org.used_hours / org.quota_hours) > 0.8
    }));

    res.json({
      success: true,
      data: {
        period: { year: targetYear, month: targetMonth },
        organizations: enrichedOrgs,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: parseInt(totalCount.count) || 0,
          totalPages: Math.ceil((parseInt(totalCount.count) || 0) / safeLimit)
        }
      }
    });

  } catch (error) {
    logger.error('기관별 사용 현황 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '기관별 사용 현황 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 특정 기관 상세 사용 현황
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/organizations/:id/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { year, month } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : (now.getMonth() + 1);

    const organization = await db.get('SELECT * FROM organizations WHERE id = $1', [id]);

    if (!organization) {
      return res.status(404).json({ success: false, error: '기관을 찾을 수 없습니다' });
    }

    const quota = await db.get(`
      SELECT * FROM organization_usage_quotas
      WHERE organization_id = $1 AND year = $2 AND month = $3
    `, [id, targetYear, targetMonth]);

    const users = await db.all(`
      SELECT
        u.id, u.name, u.oauth_email as email, u.oauth_nickname,
        u.role, u.is_approved, u.last_login_at,
        c.balance, c.total_used as credit_total_used,
        (SELECT COUNT(*) FROM anonymization_logs WHERE user_id = u.id) as total_anonymizations,
        (SELECT SUM(processing_time_minutes) FROM anonymization_logs
         WHERE user_id = u.id AND organization_id = $1) as total_processing_minutes,
        (SELECT COUNT(*) FROM anonymization_logs
         WHERE user_id = u.id
         AND EXTRACT(YEAR FROM created_at) = $2
         AND EXTRACT(MONTH FROM created_at) = $3) as monthly_anonymizations
      FROM users u
      LEFT JOIN credits c ON u.id = c.user_id
      WHERE u.organization_id = $4
      ORDER BY monthly_anonymizations DESC
    `, [id, targetYear, targetMonth, id]);

    const recentLogs = await db.all(`
      SELECT
        al.id, al.user_id, u.name as user_name,
        al.file_name, al.file_type, al.file_size_kb,
        al.processing_time_minutes, al.total_anonymized,
        al.status, al.quota_deducted, al.created_at
      FROM anonymization_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = $1
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [id]);

    const trends = await db.all(`
      SELECT year, month, quota_hours, used_hours, remaining_hours, request_count
      FROM organization_usage_quotas
      WHERE organization_id = $1
      ORDER BY year DESC, month DESC
      LIMIT 6
    `, [id]);

    res.json({
      success: true,
      data: {
        organization,
        current_period: {
          year: targetYear,
          month: targetMonth,
          quota: quota || { quota_hours: 10.0, used_hours: 0.0, remaining_hours: 10.0, request_count: 0 }
        },
        users: { total: users.length, list: users },
        recent_logs: recentLogs,
        trends: trends.reverse()
      }
    });

  } catch (error) {
    logger.error('기관 상세 사용 현황 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '기관 상세 사용 현황 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 계정별 사용 현황 (전체 사용자)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/users/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const {
      organization_id, role,
      sort = 'total_used', order = 'DESC', search
    } = req.query;
    const safePage = Math.max(1, parseInt(req.query.page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const offset = (safePage - 1) * safeLimit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (organization_id) {
      whereConditions.push(`u.organization_id = $${paramIndex++}`);
      params.push(parseInt(organization_id));
    }

    if (role) {
      whereConditions.push(`u.role = $${paramIndex++}`);
      params.push(role);
    }

    if (search) {
      whereConditions.push(`(u.name ILIKE $${paramIndex} OR u.oauth_email ILIKE $${paramIndex + 1} OR u.oauth_nickname ILIKE $${paramIndex + 2})`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      paramIndex += 3;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const validSortColumns = ['total_used', 'balance', 'total_anonymizations', 'last_login_at', 'name'];
    const sortColumnMap = {
      'total_used': 'c.total_used',
      'balance': 'c.balance',
      'total_anonymizations': 'total_anonymizations',
      'last_login_at': 'u.last_login_at',
      'name': 'u.name'
    };
    const sortColumn = validSortColumns.includes(sort) ? sortColumnMap[sort] : 'c.total_used';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const users = await db.all(`
      SELECT
        u.id, u.name, u.oauth_email as email, u.oauth_nickname, u.oauth_provider,
        u.role, u.organization_id, o.name as organization_name,
        u.is_approved, u.last_login_at, u.created_at,
        c.balance, c.total_purchased, c.total_used, c.total_bonus, c.free_trial_count,
        (SELECT COUNT(*) FROM anonymization_logs WHERE user_id = u.id) as total_anonymizations,
        (SELECT SUM(processing_time_minutes) FROM anonymization_logs WHERE user_id = u.id) as total_processing_minutes,
        (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as total_transactions,
        (SELECT COUNT(*) FROM usage_logs WHERE user_id = u.id) as total_usage_logs
      FROM users u
      LEFT JOIN credits c ON u.id = c.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, safeLimit, offset]);

    const totalCount = await db.get(`SELECT COUNT(*) as count FROM users u ${whereClause}`, params);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: parseInt(totalCount.count) || 0,
          totalPages: Math.ceil((parseInt(totalCount.count) || 0) / safeLimit)
        },
        filters: {
          organization_id: organization_id || null,
          role: role || null,
          search: search || null
        }
      }
    });

  } catch (error) {
    logger.error('계정별 사용 현황 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '계정별 사용 현황 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 특정 사용자 상세 사용 현황
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/users/:id/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { limit = 50 } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 500));

    const user = await db.get(`
      SELECT
        u.*, o.name as organization_name, o.plan_type,
        c.balance, c.total_purchased, c.total_used, c.total_bonus,
        c.free_trial_count, c.free_trial_used
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN credits c ON u.id = c.user_id
      WHERE u.id = $1
    `, [id]);

    if (!user) {
      return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다' });
    }

    const anonymizationLogs = await db.all(`
      SELECT * FROM anonymization_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [id, safeLimit]);

    const transactions = await db.all(`
      SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [id, safeLimit]);

    const usageLogs = await db.all(`
      SELECT * FROM usage_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [id, safeLimit]);

    const payments = await db.all(`
      SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [id, safeLimit]);

    const stats = {
      total_anonymizations: anonymizationLogs.length,
      total_processing_minutes: anonymizationLogs.reduce((sum, log) => sum + (log.processing_time_minutes || 0), 0),
      total_transactions: transactions.length,
      total_usage_logs: usageLogs.length,
      total_payments: payments.filter(p => p.status === 'success').length,
      total_payment_amount: payments.filter(p => p.status === 'success').reduce((sum, p) => sum + p.amount, 0)
    };

    res.json({
      success: true,
      data: { user, stats, anonymization_logs: anonymizationLogs, transactions, usage_logs: usageLogs, payments }
    });

  } catch (error) {
    logger.error('사용자 상세 사용 현황 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '사용자 상세 사용 현황 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 시스템 활동 로그 (최근 활동)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/activity-logs', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { days = 7, limit = 100 } = req.query;
    const safeDays = Math.max(1, Math.min(parseInt(days) || 7, 365));
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 100, 500));

    const recentAnonymizations = await db.all(`
      SELECT al.*, u.name as user_name, u.oauth_nickname, o.name as organization_name
      FROM anonymization_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN organizations o ON al.organization_id = o.id
      WHERE al.created_at >= CURRENT_TIMESTAMP - make_interval(days => $1)
      ORDER BY al.created_at DESC
      LIMIT $2
    `, [safeDays, safeLimit]);

    const recentPayments = await db.all(`
      SELECT p.*, u.name as user_name, u.oauth_nickname
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.created_at >= CURRENT_TIMESTAMP - make_interval(days => $1)
      ORDER BY p.created_at DESC
      LIMIT $2
    `, [safeDays, safeLimit]);

    const recentJoinRequests = await db.all(`
      SELECT jr.*, u.name as user_name, o.name as organization_name
      FROM organization_join_requests jr
      LEFT JOIN users u ON jr.user_id = u.id
      LEFT JOIN organizations o ON jr.organization_id = o.id
      WHERE jr.created_at >= CURRENT_TIMESTAMP - make_interval(days => $1)
      ORDER BY jr.created_at DESC
      LIMIT 50
    `, [safeDays]);

    const recentLogins = await db.all(`
      SELECT u.id, u.name, u.oauth_nickname, u.role, u.last_login_at, o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.last_login_at >= CURRENT_TIMESTAMP - make_interval(days => $1)
      ORDER BY u.last_login_at DESC
      LIMIT 50
    `, [safeDays]);

    res.json({
      success: true,
      data: {
        period_days: safeDays,
        recent_anonymizations: recentAnonymizations,
        recent_payments: recentPayments,
        recent_join_requests: recentJoinRequests,
        recent_logins: recentLogins
      }
    });

  } catch (error) {
    logger.error('활동 로그 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '활동 로그 조회에 실패했습니다' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 사용 통계 차트 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/charts/usage-trends', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { months = 6 } = req.query;
    const safeMonths = Math.max(1, Math.min(parseInt(months) || 6, 24));

    const usageTrends = await db.all(`
      SELECT
        year, month,
        SUM(quota_hours) as total_quota,
        SUM(used_hours) as total_used,
        SUM(remaining_hours) as total_remaining,
        SUM(request_count) as total_requests,
        COUNT(DISTINCT organization_id) as active_organizations
      FROM organization_usage_quotas
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT $1
    `, [safeMonths]);

    const paymentTrends = await db.all(`
      SELECT
        EXTRACT(YEAR FROM created_at)::int as year,
        EXTRACT(MONTH FROM created_at)::int as month,
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_revenue
      FROM payments
      GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)
      ORDER BY year DESC, month DESC
      LIMIT $1
    `, [safeMonths]);

    const userGrowth = await db.all(`
      SELECT
        EXTRACT(YEAR FROM created_at)::int as year,
        EXTRACT(MONTH FROM created_at)::int as month,
        COUNT(*) as new_users,
        SUM(CASE WHEN role = 'org_admin' THEN 1 ELSE 0 END) as new_org_admins
      FROM users
      GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)
      ORDER BY year DESC, month DESC
      LIMIT $1
    `, [safeMonths]);

    res.json({
      success: true,
      data: {
        usage_trends: usageTrends.reverse(),
        payment_trends: paymentTrends.reverse(),
        user_growth: userGrowth.reverse()
      }
    });

  } catch (error) {
    logger.error('차트 데이터 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: '차트 데이터 조회에 실패했습니다' });
  }
});

module.exports = router;
