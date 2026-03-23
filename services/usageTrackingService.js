/**
 * 사용 시간 추적 서비스
 * - 노인보호전문기관 월 10시간 무료 제공
 * - 기관별 사용량 추적 및 제한
 */

const { getDB } = require('../database/db-postgres');
const { logger } = require('../lib/logger');

class UsageTrackingService {

  /**
   * 현재 월의 기관 사용량 조회
   */
  async getOrganizationQuota(organizationId, year = null, month = null) {
    const db = getDB();

    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    let quota = await db.get(
      `SELECT * FROM organization_usage_quotas
       WHERE organization_id = $1 AND year = $2 AND month = $3`,
      [organizationId, targetYear, targetMonth]
    );

    if (!quota) {
      await db.run(
        `INSERT INTO organization_usage_quotas
         (organization_id, year, month, quota_hours, used_hours, remaining_hours)
         VALUES ($1, $2, $3, 10.0, 0.0, 10.0)
         ON CONFLICT (organization_id, year, month) DO NOTHING`,
        [organizationId, targetYear, targetMonth]
      );

      quota = await db.get(
        `SELECT * FROM organization_usage_quotas
         WHERE organization_id = $1 AND year = $2 AND month = $3`,
        [organizationId, targetYear, targetMonth]
      );
    }

    return quota;
  }

  /**
   * 사용 시간 차감 가능 여부 확인
   */
  async checkQuotaAvailable(organizationId, estimatedMinutes) {
    const quota = await this.getOrganizationQuota(organizationId);

    const estimatedHours = estimatedMinutes / 60;
    const availableHours = quota.remaining_hours;

    return {
      available: availableHours >= estimatedHours,
      remainingHours: availableHours,
      estimatedHours,
      quotaHours: quota.quota_hours,
      usedHours: quota.used_hours
    };
  }

  /**
   * 익명화 처리 시작 (사용 시간 예약)
   */
  async startAnonymization(userId, organizationId, fileName, fileType, fileSizeKB) {
    const db = getDB();

    const estimatedMinutes = 1;

    const check = await this.checkQuotaAvailable(organizationId, estimatedMinutes);

    if (!check.available) {
      throw new Error(`월간 무료 사용 시간이 초과되었습니다. (남은 시간: ${check.remainingHours.toFixed(2)}시간)`);
    }

    const result = await db.run(
      `INSERT INTO anonymization_logs
       (user_id, organization_id, file_name, file_type, file_size_kb,
        status, processing_time_minutes, quota_deducted)
       VALUES ($1, $2, $3, $4, $5, 'processing', $6, 0.0)
       RETURNING id`,
      [userId, organizationId, fileName, fileType, fileSizeKB, estimatedMinutes]
    );

    return {
      logId: result.lastID,
      remainingHours: check.remainingHours,
      estimatedMinutes
    };
  }

  /**
   * 익명화 처리 완료 (실제 사용 시간 기록)
   * - remaining_hours = quota_hours - (used_hours + hoursUsed) 로 정확히 계산
   */
  async completeAnonymization(logId, processingTimeSeconds, anonymizationStats) {
    const db = getDB();

    const log = await db.get(
      'SELECT * FROM anonymization_logs WHERE id = $1',
      [logId]
    );

    if (!log) {
      throw new Error('익명화 로그를 찾을 수 없습니다');
    }

    const processingMinutes = processingTimeSeconds / 60;

    const {
      names = 0,
      facilities = 0,
      phones = 0,
      addresses = 0,
      emails = 0,
      ids = 0
    } = anonymizationStats || {};

    const totalAnonymized = names + facilities + phones + addresses + emails + ids;

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE anonymization_logs
         SET status = 'success',
             processing_time_seconds = $1,
             processing_time_minutes = $2,
             quota_deducted = $3,
             anonymized_names = $4,
             anonymized_facilities = $5,
             anonymized_phones = $6,
             anonymized_addresses = $7,
             anonymized_emails = $8,
             anonymized_ids = $9,
             total_anonymized = $10
         WHERE id = $11`,
        [processingTimeSeconds, processingMinutes, processingMinutes,
         names, facilities, phones, addresses, emails, ids, totalAnonymized,
         logId]
      );

      if (log.organization_id) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const hoursUsed = processingMinutes / 60;

        // remaining_hours = quota_hours - (old_used_hours + hoursUsed)
        // PostgreSQL SET에서 used_hours는 old value이므로 (used_hours + $1)이 새 값
        await client.query(
          `UPDATE organization_usage_quotas
           SET used_hours = used_hours + $1,
               remaining_hours = quota_hours - (used_hours + $1),
               request_count = request_count + 1,
               last_used_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = $2 AND year = $3 AND month = $4`,
          [hoursUsed, log.organization_id, year, month]
        );
      }
    });

    let remainingHours = 0;
    let usedHours = 0;

    if (log.organization_id) {
      const updatedQuota = await this.getOrganizationQuota(log.organization_id);
      remainingHours = updatedQuota.remaining_hours;
      usedHours = updatedQuota.used_hours;

      logger.info('익명화 완료', {
        orgId: log.organization_id,
        processingMinutes: processingMinutes.toFixed(2),
        remainingHours: remainingHours.toFixed(2)
      });
    } else {
      logger.info('익명화 완료 (개인 사용자)', { processingMinutes: processingMinutes.toFixed(2) });
    }

    return {
      success: true,
      processingMinutes,
      remainingHours,
      usedHours,
      totalAnonymized
    };
  }

  /**
   * 익명화 실패 처리
   */
  async failAnonymization(logId, errorMessage) {
    const db = getDB();

    await db.run(
      `UPDATE anonymization_logs
       SET status = 'failed',
           error_message = $1,
           quota_deducted = 0.0
       WHERE id = $2`,
      [errorMessage, logId]
    );

    logger.warn('익명화 실패', { logId, error: errorMessage });

    return { success: true };
  }

  /**
   * 할당량 초과로 익명화 거부
   */
  async rejectAnonymizationOverQuota(logId) {
    const db = getDB();

    await db.run(
      `UPDATE anonymization_logs
       SET status = 'quota_exceeded',
           error_message = '월간 무료 사용 시간 초과',
           quota_deducted = 0.0
       WHERE id = $1`,
      [logId]
    );

    logger.warn('할당량 초과', { logId });

    return { success: true };
  }

  /**
   * 사용자의 익명화 로그 조회
   */
  async getUserAnonymizationLogs(userId, limit = 50, offset = 0) {
    const db = getDB();

    return await db.query(
      `SELECT * FROM anonymization_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
  }

  /**
   * 기관의 익명화 로그 조회
   */
  async getOrganizationAnonymizationLogs(organizationId, limit = 100, offset = 0) {
    const db = getDB();

    return await db.query(
      `SELECT al.*, u.name as user_name, u.oauth_email as user_email
       FROM anonymization_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.organization_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );
  }

  /**
   * 전체 기관 사용량 통계 (관리자용)
   */
  async getAllOrganizationsUsage(year = null, month = null) {
    const db = getDB();

    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);

    const stats = await db.query(
      `SELECT
         ouq.*,
         o.name as organization_name,
         o.region,
         o.organization_type,
         o.is_sponsored,
         o.sponsor_name,
         (SELECT COUNT(*) FROM users WHERE organization_id = o.id) as user_count
       FROM organization_usage_quotas ouq
       LEFT JOIN organizations o ON ouq.organization_id = o.id
       WHERE ouq.year = $1 AND ouq.month = $2
       ORDER BY ouq.used_hours DESC`,
      [targetYear, targetMonth]
    );

    const totalQuota = stats.reduce((sum, s) => sum + s.quota_hours, 0);
    const totalUsed = stats.reduce((sum, s) => sum + s.used_hours, 0);
    const totalRemaining = stats.reduce((sum, s) => sum + s.remaining_hours, 0);
    const totalRequests = stats.reduce((sum, s) => sum + s.request_count, 0);

    return {
      year: targetYear,
      month: targetMonth,
      totalOrganizations: stats.length,
      totalQuotaHours: totalQuota,
      totalUsedHours: totalUsed,
      totalRemainingHours: totalRemaining,
      totalRequests,
      averageUsagePercent: totalQuota > 0 ? (totalUsed / totalQuota * 100).toFixed(2) : 0,
      organizations: stats
    };
  }

  /**
   * 기관별 월별 사용 추이 (최근 N개월)
   */
  async getOrganizationUsageTrend(organizationId, months = 6) {
    const db = getDB();

    const now = new Date();
    // 시작 연/월 계산
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    // 단일 쿼리로 전체 기간 조회
    const quotas = await db.query(
      `SELECT * FROM organization_usage_quotas
       WHERE organization_id = $1 AND (year > $2 OR (year = $2 AND month >= $3))
       ORDER BY year ASC, month ASC`,
      [organizationId, startYear, startMonth]
    );

    const quotaMap = new Map();
    for (const q of quotas) {
      quotaMap.set(`${q.year}-${q.month}`, q);
    }

    const trends = [];
    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const quota = quotaMap.get(`${year}-${month}`);

      trends.push({
        year,
        month,
        quotaHours: quota ? quota.quota_hours : 10.0,
        usedHours: quota ? quota.used_hours : 0.0,
        remainingHours: quota ? quota.remaining_hours : 10.0,
        requestCount: quota ? quota.request_count : 0,
        usagePercent: quota && quota.quota_hours > 0 ? (quota.used_hours / quota.quota_hours * 100).toFixed(2) : 0
      });
    }

    return trends;
  }
}

module.exports = new UsageTrackingService();
