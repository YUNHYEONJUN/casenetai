/**
 * 관리자 대시보드 라우터
 * - 전체 기관 사용량 모니터링
 * - 기관별 상세 통계
 * - 월별 리포트
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const usageTrackingService = require('../services/usageTrackingService');
const { getDB } = require('../database/db-postgres');

// 유틸리티 함수: 안전한 parseInt with validation
function safeParseInt(value, defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(value);
  if (isNaN(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

// 관리자 인증 미들웨어 적용
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/dashboard/overview
 * 대시보드 전체 개요
 */
router.get('/dashboard/overview', async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : (now.getMonth() + 1);
    
    // 전체 기관 사용량
    const usageStats = await usageTrackingService.getAllOrganizationsUsage(targetYear, targetMonth);
    
    // 추가 통계
    const db = getDB();
    
    // 전체 익명화 요청 수 (이번 달)
    const totalAnonymizations = await db.get(
      `SELECT COUNT(*) as count, 
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
              SUM(CASE WHEN status = 'quota_exceeded' THEN 1 ELSE 0 END) as quota_exceeded_count,
              SUM(total_anonymized) as total_items_anonymized,
              AVG(processing_time_seconds) as avg_processing_time
       FROM anonymization_logs
       WHERE strftime('%Y', created_at) = ? 
       AND strftime('%m', created_at) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );
    
    // 전체 사용자 수
    const totalUsers = await db.get(
      'SELECT COUNT(*) as count FROM users WHERE role != "system_admin"'
    );
    
    // 전체 기관 수
    const totalOrgs = await db.get(
      'SELECT COUNT(*) as count FROM organizations'
    );
    
    res.json({
      success: true,
      period: {
        year: targetYear,
        month: targetMonth
      },
      usage: usageStats,
      statistics: {
        totalUsers: totalUsers.count,
        totalOrganizations: totalOrgs.count,
        totalAnonymizations: totalAnonymizations.count || 0,
        successfulAnonymizations: totalAnonymizations.success_count || 0,
        failedAnonymizations: totalAnonymizations.failed_count || 0,
        quotaExceeded: totalAnonymizations.quota_exceeded_count || 0,
        totalItemsAnonymized: totalAnonymizations.total_items_anonymized || 0,
        averageProcessingTime: totalAnonymizations.avg_processing_time || 0
      }
    });
    
  } catch (error) {
    console.error('❌ 대시보드 개요 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/organizations
 * 전체 기관 목록 조회
 */
router.get('/organizations', async (req, res) => {
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
         AND ouq.year = ? AND ouq.month = ?
       ORDER BY o.name`,
      [new Date().getFullYear(), new Date().getMonth() + 1]
    );
    
    res.json({
      success: true,
      count: organizations.length,
      organizations: organizations
    });
    
  } catch (error) {
    console.error('❌ 기관 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/organizations/:id
 * 특정 기관 상세 정보
 */
router.get('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    // 기관 기본 정보
    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1',
      [id]
    );
    
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: '기관을 찾을 수 없습니다'
      });
    }
    
    // 기관 사용자 목록
    const users = await db.query(
      `SELECT id, email, name, role, created_at, last_login_at 
       FROM users 
       WHERE organization_id = ?
       ORDER BY created_at DESC`,
      [id]
    );
    
    // 현재 월 사용량
    const currentQuota = await usageTrackingService.getOrganizationQuota(id);
    
    // 최근 6개월 사용 추이
    const usageTrend = await usageTrackingService.getOrganizationUsageTrend(id, 6);
    
    // 최근 익명화 로그
    const recentLogs = await usageTrackingService.getOrganizationAnonymizationLogs(id, 20);
    
    res.json({
      success: true,
      organization: organization,
      users: users,
      currentQuota: currentQuota,
      usageTrend: usageTrend,
      recentLogs: recentLogs
    });
    
  } catch (error) {
    console.error('❌ 기관 상세 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/organizations
 * 새 기관 등록
 */
router.post('/organizations', async (req, res) => {
  try {
    const {
      name,
      organizationType,
      region,
      contactEmail,
      contactPhone,
      address,
      isSponsored,
      sponsorName,
      notes
    } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: '기관명은 필수입니다'
      });
    }
    
    const db = getDB();
    
    const result = await db.run(
      `INSERT INTO organizations 
       (name, organization_type, region, contact_email, contact_phone, 
        address, is_sponsored, sponsor_name, notes, plan_type, subscription_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'free', 'active')`,
      [name, organizationType || 'elderly_protection', region, contactEmail, contactPhone,
       address, isSponsored, sponsorName, notes]
    );
    
    const organizationId = result.lastID;
    
    // 현재 월 할당량 초기화
    await usageTrackingService.getOrganizationQuota(organizationId);
    
    console.log(`✅ 새 기관 등록: ${name} (ID: ${organizationId})`);
    
    res.json({
      success: true,
      organizationId: organizationId,
      message: '기관이 등록되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 기관 등록 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/organizations/:id
 * 기관 정보 수정
 */
router.put('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      organizationType,
      region,
      contactEmail,
      contactPhone,
      address,
      isSponsored,
      sponsorName,
      notes,
      subscriptionStatus
    } = req.body;
    
    const db = getDB();
    
    await db.run(
      `UPDATE organizations 
       SET name = COALESCE(?, name),
           organization_type = COALESCE(?, organization_type),
           region = COALESCE(?, region),
           contact_email = COALESCE(?, contact_email),
           contact_phone = COALESCE(?, contact_phone),
           address = COALESCE(?, address),
           is_sponsored = COALESCE(?, is_sponsored),
           sponsor_name = COALESCE(?, sponsor_name),
           notes = COALESCE(?, notes),
           subscription_status = COALESCE(?, subscription_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, organizationType, region, contactEmail, contactPhone,
       address, isSponsored, sponsorName, notes, subscriptionStatus, id]
    );
    
    console.log(`✅ 기관 정보 수정: ID ${id}`);
    
    res.json({
      success: true,
      message: '기관 정보가 수정되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 기관 정보 수정 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/organizations/:id/quota
 * 기관 할당량 수정 (월별)
 */
router.put('/organizations/:id/quota', async (req, res) => {
  try {
    const { id } = req.params;
    const { year, month, quotaHours } = req.body;
    
    if (!quotaHours || quotaHours < 0) {
      return res.status(400).json({
        success: false,
        error: '유효한 할당 시간을 입력해주세요'
      });
    }
    
    const db = getDB();
    
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);
    
    // 해당 월 할당량 조회 또는 생성
    let quota = await db.get(
      `SELECT * FROM organization_usage_quotas 
       WHERE organization_id = ? AND year = ? AND month = ?`,
      [id, targetYear, targetMonth]
    );
    
    if (quota) {
      // 업데이트
      await db.run(
        `UPDATE organization_usage_quotas 
         SET quota_hours = ?,
             remaining_hours = ? - used_hours,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND year = ? AND month = ?`,
        [quotaHours, quotaHours, id, targetYear, targetMonth]
      );
    } else {
      // 생성
      await db.run(
        `INSERT INTO organization_usage_quotas 
         (organization_id, year, month, quota_hours, used_hours, remaining_hours)
         VALUES (?, ?, ?, ?, 0.0, ?)`,
        [id, targetYear, targetMonth, quotaHours, quotaHours]
      );
    }
    
    console.log(`✅ 기관 할당량 수정: ID ${id}, ${targetYear}-${targetMonth}, ${quotaHours}시간`);
    
    res.json({
      success: true,
      message: '할당량이 수정되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 할당량 수정 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/logs/anonymization
 * 전체 익명화 로그 조회 (페이징)
 */
router.get('/logs/anonymization', async (req, res) => {
  try {
    const { limit = 100, offset = 0, organizationId, status, startDate, endDate } = req.query;
    
    const db = getDB();
    
    let whereClauses = [];
    let params = [];
    
    if (organizationId) {
      whereClauses.push('al.organization_id = $1');
      params.push(organizationId);
    }
    
    if (status) {
      whereClauses.push('al.status = $1');
      params.push(status);
    }
    
    if (startDate) {
      whereClauses.push('al.created_at >= $1');
      params.push(startDate);
    }
    
    if (endDate) {
      whereClauses.push('al.created_at <= $1');
      params.push(endDate);
    }
    
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const logs = await db.query(
      `SELECT 
         al.*,
         u.name as user_name,
         u.email as user_email,
         o.name as organization_name
       FROM anonymization_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN organizations o ON al.organization_id = o.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    
    // 전체 개수
    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM anonymization_logs al ${whereClause}`,
      params
    );
    
    res.json({
      success: true,
      total: countResult.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      logs: logs
    });
    
  } catch (error) {
    console.error('❌ 익명화 로그 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/reports/monthly
 * 월별 리포트 생성
 */
router.get('/reports/monthly', async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : (now.getMonth() + 1);
    
    // 전체 기관 사용량
    const usageStats = await usageTrackingService.getAllOrganizationsUsage(targetYear, targetMonth);
    
    // 상위 5개 기관 (사용량 기준)
    const topOrganizations = usageStats.organizations
      .sort((a, b) => b.used_hours - a.used_hours)
      .slice(0, 5);
    
    // 할당량 초과 위험 기관 (80% 이상 사용)
    const atRiskOrganizations = usageStats.organizations
      .filter(org => (org.used_hours / org.quota_hours) >= 0.8)
      .sort((a, b) => (b.used_hours / b.quota_hours) - (a.used_hours / a.quota_hours));
    
    // 미사용 기관
    const inactiveOrganizations = usageStats.organizations
      .filter(org => org.used_hours === 0);
    
    res.json({
      success: true,
      period: {
        year: targetYear,
        month: targetMonth
      },
      summary: {
        totalOrganizations: usageStats.totalOrganizations,
        totalQuotaHours: usageStats.totalQuotaHours,
        totalUsedHours: usageStats.totalUsedHours,
        totalRemainingHours: usageStats.totalRemainingHours,
        totalRequests: usageStats.totalRequests,
        averageUsagePercent: usageStats.averageUsagePercent
      },
      topOrganizations: topOrganizations,
      atRiskOrganizations: atRiskOrganizations,
      inactiveOrganizations: inactiveOrganizations,
      allOrganizations: usageStats.organizations
    });
    
  } catch (error) {
    console.error('❌ 월별 리포트 생성 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
