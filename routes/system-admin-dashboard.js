/**
 * System Admin Dashboard API
 * 기관별/계정별 사용 현황 조회 및 통계
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireSystemAdmin } = require('../middleware/roleAuth');
const { getDB } = require('../database/db-postgres');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 전체 시스템 통계 (Overview)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/overview', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    
    // 1. 전체 기관 통계
    const orgStats = await db.get(`
      SELECT 
        COUNT(*) as total_organizations,
        SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) as active_organizations,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as alive_organizations
      FROM organizations
    `);
    
    // 2. 전체 사용자 통계
    const userStats = await db.get(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'system_admin' THEN 1 ELSE 0 END) as system_admins,
        SUM(CASE WHEN role = 'org_admin' THEN 1 ELSE 0 END) as org_admins,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regular_users,
        SUM(CASE WHEN is_approved = true THEN 1 ELSE 0 END) as approved_users,
        SUM(CASE WHEN is_approved = false THEN 1 ELSE 0 END) as pending_users
      FROM users
      WHERE deleted_at IS NULL
    `);
    
    // 3. 이번 달 사용량 통계 (익명화)
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
      WHERE year = ? AND month = ?
    `, [currentYear, currentMonth]);
    
    // 4. 크레딧 통계
    const creditStats = await db.get(`
      SELECT 
        SUM(balance) as total_balance,
        SUM(total_purchased) as total_purchased,
        SUM(total_used) as total_used,
        SUM(total_bonus) as total_bonus,
        AVG(balance) as avg_balance
      FROM credits
    `);
    
    // 5. 이번 달 결제 통계
    const paymentStats = await db.get(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'success' THEN amount ELSE NULL END) as avg_payment_amount
      FROM payments
      WHERE strftime('%Y-%m', created_at) = ?
    `, [`${currentYear}-${String(currentMonth).padStart(2, '0')}`]);
    
    // 6. 최근 7일 활동 통계
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
        period: {
          year: currentYear,
          month: currentMonth
        },
        organizations: {
          total: orgStats.total_organizations || 0,
          active: orgStats.active_organizations || 0,
          alive: orgStats.alive_organizations || 0
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
    console.error('❌ Overview 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 기관별 사용 현황 (상세)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/organizations/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { year, month, sort = 'used_hours', order = 'DESC', page = 1, limit = 20 } = req.query;
    
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : (now.getMonth() + 1);
    
    const offset = (page - 1) * limit;
    
    // 정렬 컬럼 검증
    const validSortColumns = ['used_hours', 'remaining_hours', 'request_count', 'name'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'used_hours';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // 기관별 사용 현황 조회
    const organizations = await db.all(`
      SELECT 
        o.id,
        o.name,
        o.business_registration_number,
        o.plan_type,
        o.subscription_status,
        o.max_users,
        o.region,
        o.organization_type,
        COALESCE(q.quota_hours, 10.0) as quota_hours,
        COALESCE(q.used_hours, 0.0) as used_hours,
        COALESCE(q.remaining_hours, 10.0) as remaining_hours,
        COALESCE(q.request_count, 0) as request_count,
        q.last_used_at,
        (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND deleted_at IS NULL) as user_count,
        (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND is_approved = true AND deleted_at IS NULL) as approved_user_count,
        (SELECT COUNT(*) FROM anonymization_logs WHERE organization_id = o.id) as total_anonymizations
      FROM organizations o
      LEFT JOIN organization_usage_quotas q ON o.id = q.organization_id 
        AND q.year = ? AND q.month = ?
      WHERE o.deleted_at IS NULL
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [targetYear, targetMonth, parseInt(limit), offset]);
    
    // 전체 개수
    const totalCount = await db.get(`
      SELECT COUNT(*) as count 
      FROM organizations 
      WHERE deleted_at IS NULL
    `);
    
    // 사용률 계산 추가
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
        period: {
          year: targetYear,
          month: targetMonth
        },
        organizations: enrichedOrgs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 기관별 사용 현황 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '기관별 사용 현황 조회에 실패했습니다'
    });
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
    
    // 기관 정보
    const organization = await db.get(`
      SELECT * FROM organizations WHERE id = ? AND deleted_at IS NULL
    `, [id]);
    
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: '기관을 찾을 수 없습니다'
      });
    }
    
    // 해당 월 사용량
    const quota = await db.get(`
      SELECT * FROM organization_usage_quotas
      WHERE organization_id = ? AND year = ? AND month = ?
    `, [id, targetYear, targetMonth]);
    
    // 소속 사용자 목록 및 사용량
    const users = await db.all(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.oauth_nickname,
        u.role,
        u.is_approved,
        u.last_login_at,
        c.balance,
        c.total_used as credit_total_used,
        (SELECT COUNT(*) FROM anonymization_logs WHERE user_id = u.id) as total_anonymizations,
        (SELECT SUM(processing_time_minutes) FROM anonymization_logs 
         WHERE user_id = u.id AND organization_id = ?) as total_processing_minutes,
        (SELECT COUNT(*) FROM anonymization_logs 
         WHERE user_id = u.id 
         AND strftime('%Y', created_at) = ? 
         AND strftime('%m', created_at) = ?) as monthly_anonymizations
      FROM users u
      LEFT JOIN credits c ON u.id = c.user_id
      WHERE u.organization_id = ? AND u.deleted_at IS NULL
      ORDER BY monthly_anonymizations DESC
    `, [id, String(targetYear), String(targetMonth).padStart(2, '0'), id]);
    
    // 최근 익명화 로그 (최근 20개)
    const recentLogs = await db.all(`
      SELECT 
        al.id,
        al.user_id,
        u.name as user_name,
        al.file_name,
        al.file_type,
        al.file_size_kb,
        al.processing_time_minutes,
        al.total_anonymized,
        al.status,
        al.quota_deducted,
        al.created_at
      FROM anonymization_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = ?
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [id]);
    
    // 월별 사용 트렌드 (최근 6개월)
    const trends = await db.all(`
      SELECT 
        year,
        month,
        quota_hours,
        used_hours,
        remaining_hours,
        request_count
      FROM organization_usage_quotas
      WHERE organization_id = ?
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
          quota: quota || {
            quota_hours: 10.0,
            used_hours: 0.0,
            remaining_hours: 10.0,
            request_count: 0
          }
        },
        users: {
          total: users.length,
          list: users
        },
        recent_logs: recentLogs,
        trends: trends.reverse()
      }
    });
    
  } catch (error) {
    console.error('❌ 기관 상세 사용 현황 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '기관 상세 사용 현황 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 계정별 사용 현황 (전체 사용자)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/users/usage', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { 
      organization_id, 
      role, 
      sort = 'total_used', 
      order = 'DESC', 
      page = 1, 
      limit = 50,
      search 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // WHERE 조건 구성
    let whereConditions = ['u.deleted_at IS NULL'];
    let params = [];
    
    if (organization_id) {
      whereConditions.push('u.organization_id = $1');
      params.push(parseInt(organization_id));
    }
    
    if (role) {
      whereConditions.push('u.role = $1');
      params.push(role);
    }
    
    if (search) {
      whereConditions.push('(u.name LIKE $1 OR u.email LIKE $2 OR u.oauth_nickname LIKE $3)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';
    
    // 정렬 검증
    const validSortColumns = ['total_used', 'balance', 'total_anonymizations', 'last_login_at', 'name'];
    const sortColumn = validSortColumns.includes(sort) ? 
      (sort === 'total_anonymizations' ? 'total_anonymizations' : `c.${sort}`) : 
      'c.total_used';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // 사용자별 사용 현황 조회
    const users = await db.all(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.oauth_nickname,
        u.oauth_provider,
        u.role,
        u.organization_id,
        o.name as organization_name,
        u.is_approved,
        u.is_active,
        u.last_login_at,
        u.created_at,
        c.balance,
        c.total_purchased,
        c.total_used,
        c.total_bonus,
        c.free_trial_count,
        (SELECT COUNT(*) FROM anonymization_logs WHERE user_id = u.id) as total_anonymizations,
        (SELECT SUM(processing_time_minutes) FROM anonymization_logs WHERE user_id = u.id) as total_processing_minutes,
        (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as total_transactions,
        (SELECT COUNT(*) FROM usage_logs WHERE user_id = u.id) as total_usage_logs
      FROM users u
      LEFT JOIN credits c ON u.id = c.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    
    // 전체 개수
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM users u
      ${whereClause}
    `;
    const totalCount = await db.get(countQuery, params);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        },
        filters: {
          organization_id: organization_id || null,
          role: role || null,
          search: search || null
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 계정별 사용 현황 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '계정별 사용 현황 조회에 실패했습니다'
    });
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
    
    // 사용자 기본 정보
    const user = await db.get(`
      SELECT 
        u.*,
        o.name as organization_name,
        o.plan_type,
        c.balance,
        c.total_purchased,
        c.total_used,
        c.total_bonus,
        c.free_trial_count,
        c.free_trial_used
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN credits c ON u.id = c.user_id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `, [id]);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });
    }
    
    // 익명화 로그
    const anonymizationLogs = await db.all(`
      SELECT *
      FROM anonymization_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, parseInt(limit)]);
    
    // 거래 내역
    const transactions = await db.all(`
      SELECT *
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, parseInt(limit)]);
    
    // 사용 로그
    const usageLogs = await db.all(`
      SELECT *
      FROM usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, parseInt(limit)]);
    
    // 결제 내역
    const payments = await db.all(`
      SELECT *
      FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, parseInt(limit)]);
    
    // 통계
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
      data: {
        user,
        stats,
        anonymization_logs: anonymizationLogs,
        transactions,
        usage_logs: usageLogs,
        payments
      }
    });
    
  } catch (error) {
    console.error('❌ 사용자 상세 사용 현황 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '사용자 상세 사용 현황 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 시스템 활동 로그 (최근 활동)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/activity-logs', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { days = 7, limit = 100 } = req.query;
    
    // 최근 익명화 활동
    const recentAnonymizations = await db.all(`
      SELECT 
        al.*,
        u.name as user_name,
        u.oauth_nickname,
        o.name as organization_name
      FROM anonymization_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN organizations o ON al.organization_id = o.id
      WHERE al.created_at >= datetime('now', '-${parseInt(days)} days')
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    
    // 최근 결제
    const recentPayments = await db.all(`
      SELECT 
        p.*,
        u.name as user_name,
        u.oauth_nickname
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.created_at >= datetime('now', '-${parseInt(days)} days')
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    
    // 최근 가입 신청
    const recentJoinRequests = await db.all(`
      SELECT 
        jr.*,
        u.name as user_name,
        o.name as organization_name
      FROM organization_join_requests jr
      LEFT JOIN users u ON jr.user_id = u.id
      LEFT JOIN organizations o ON jr.organization_id = o.id
      WHERE jr.created_at >= datetime('now', '-${parseInt(days)} days')
      ORDER BY jr.created_at DESC
      LIMIT 50
    `);
    
    // 최근 로그인 사용자
    const recentLogins = await db.all(`
      SELECT 
        u.id,
        u.name,
        u.oauth_nickname,
        u.role,
        u.last_login_at,
        o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.last_login_at >= datetime('now', '-${parseInt(days)} days')
        AND u.deleted_at IS NULL
      ORDER BY u.last_login_at DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      data: {
        period_days: parseInt(days),
        recent_anonymizations: recentAnonymizations,
        recent_payments: recentPayments,
        recent_join_requests: recentJoinRequests,
        recent_logins: recentLogins
      }
    });
    
  } catch (error) {
    console.error('❌ 활동 로그 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '활동 로그 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 사용 통계 차트 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/charts/usage-trends', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { months = 6 } = req.query;
    
    // 월별 사용량 트렌드
    const usageTrends = await db.all(`
      SELECT 
        year,
        month,
        SUM(quota_hours) as total_quota,
        SUM(used_hours) as total_used,
        SUM(remaining_hours) as total_remaining,
        SUM(request_count) as total_requests,
        COUNT(DISTINCT organization_id) as active_organizations
      FROM organization_usage_quotas
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ?
    `, [parseInt(months)]);
    
    // 월별 결제 트렌드
    const paymentTrends = await db.all(`
      SELECT 
        strftime('%Y', created_at) as year,
        strftime('%m', created_at) as month,
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_revenue
      FROM payments
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ?
    `, [parseInt(months)]);
    
    // 월별 신규 사용자
    const userGrowth = await db.all(`
      SELECT 
        strftime('%Y', created_at) as year,
        strftime('%m', created_at) as month,
        COUNT(*) as new_users,
        SUM(CASE WHEN role = 'org_admin' THEN 1 ELSE 0 END) as new_org_admins
      FROM users
      WHERE deleted_at IS NULL
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ?
    `, [parseInt(months)]);
    
    res.json({
      success: true,
      data: {
        usage_trends: usageTrends.reverse(),
        payment_trends: paymentTrends.reverse(),
        user_growth: userGrowth.reverse()
      }
    });
    
  } catch (error) {
    console.error('❌ 차트 데이터 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '차트 데이터 조회에 실패했습니다'
    });
  }
});

module.exports = router;
