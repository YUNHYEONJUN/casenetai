/**
 * 사용 시간 추적 서비스
 * - 노인보호전문기관 월 10시간 무료 제공
 * - 기관별 사용량 추적 및 제한
 */

const { getDB } = require('../database/db-postgres');

class UsageTrackingService {
  
  /**
   * 현재 월의 기관 사용량 조회
   */
  async getOrganizationQuota(organizationId, year = null, month = null) {
    const db = getDB();
    
    // 현재 년월 사용
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);
    
    try {
      let quota = await db.get(
        `SELECT * FROM organization_usage_quotas 
         WHERE organization_id = ? AND year = ? AND month = ?`,
        [organizationId, targetYear, targetMonth]
      );
      
      // 해당 월 데이터가 없으면 생성
      if (!quota) {
        await db.run(
          `INSERT INTO organization_usage_quotas 
           (organization_id, year, month, quota_hours, used_hours, remaining_hours)
           VALUES (?, ?, ?, 10.0, 0.0, 10.0)`,
          [organizationId, targetYear, targetMonth]
        );
        
        quota = await db.get(
          `SELECT * FROM organization_usage_quotas 
           WHERE organization_id = ? AND year = ? AND month = ?`,
          [organizationId, targetYear, targetMonth]
        );
      }
      
      return quota;
      
    } catch (error) {
      console.error('❌ 기관 사용량 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 사용 시간 차감 가능 여부 확인
   */
  async checkQuotaAvailable(organizationId, estimatedMinutes) {
    try {
      const quota = await this.getOrganizationQuota(organizationId);
      
      const estimatedHours = estimatedMinutes / 60;
      const availableHours = quota.remaining_hours;
      
      return {
        available: availableHours >= estimatedHours,
        remainingHours: availableHours,
        estimatedHours: estimatedHours,
        quotaHours: quota.quota_hours,
        usedHours: quota.used_hours
      };
      
    } catch (error) {
      console.error('❌ 할당량 확인 실패:', error);
      throw error;
    }
  }
  
  /**
   * 익명화 처리 시작 (사용 시간 예약)
   */
  async startAnonymization(userId, organizationId, fileName, fileType, fileSizeKB) {
    const db = getDB();
    
    try {
      // 기본 예상 시간: 1분 (나중에 실제 처리 시간으로 업데이트)
      const estimatedMinutes = 1;
      
      // 할당량 확인
      const check = await this.checkQuotaAvailable(organizationId, estimatedMinutes);
      
      if (!check.available) {
        throw new Error(`월간 무료 사용 시간이 초과되었습니다. (남은 시간: ${check.remainingHours.toFixed(2)}시간)`);
      }
      
      // 로그 생성 (처리 전)
      const result = await db.run(
        `INSERT INTO anonymization_logs 
         (user_id, organization_id, file_name, file_type, file_size_kb, 
          status, processing_time_minutes, quota_deducted)
         VALUES (?, ?, ?, ?, ?, 'processing', ?, 0.0)`,
        [userId, organizationId, fileName, fileType, fileSizeKB, estimatedMinutes]
      );
      
      return {
        logId: result.lastID,
        remainingHours: check.remainingHours,
        estimatedMinutes: estimatedMinutes
      };
      
    } catch (error) {
      console.error('❌ 익명화 시작 실패:', error);
      throw error;
    }
  }
  
  /**
   * 익명화 처리 완료 (실제 사용 시간 기록)
   */
  async completeAnonymization(logId, processingTimeSeconds, anonymizationStats) {
    const db = getDB();
    
    try {
      // 로그 정보 조회
      const log = await db.get(
        'SELECT * FROM anonymization_logs WHERE id = $1',
        [logId]
      );
      
      if (!log) {
        throw new Error('익명화 로그를 찾을 수 없습니다');
      }
      
      // 처리 시간 계산 (분 단위)
      const processingMinutes = processingTimeSeconds / 60;
      
      // 익명화 통계
      const {
        names = 0,
        facilities = 0,
        phones = 0,
        addresses = 0,
        emails = 0,
        ids = 0
      } = anonymizationStats || {};
      
      const totalAnonymized = names + facilities + phones + addresses + emails + ids;
      
      // 트랜잭션 시작
      await db.beginTransaction();
      
      try {
        // 로그 업데이트
        await db.run(
          `UPDATE anonymization_logs 
           SET status = 'success',
               processing_time_seconds = ?,
               processing_time_minutes = ?,
               quota_deducted = ?,
               anonymized_names = ?,
               anonymized_facilities = ?,
               anonymized_phones = ?,
               anonymized_addresses = ?,
               anonymized_emails = ?,
               anonymized_ids = ?,
               total_anonymized = ?
           WHERE id = ?`,
          [processingTimeSeconds, processingMinutes, processingMinutes,
           names, facilities, phones, addresses, emails, ids, totalAnonymized,
           logId]
        );
        
        // 기관 할당량 업데이트
        if (log.organization_id) {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          
          await db.run(
            `UPDATE organization_usage_quotas 
             SET used_hours = used_hours + ?,
                 remaining_hours = quota_hours - (used_hours + ?),
                 request_count = request_count + 1,
                 last_used_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE organization_id = ? AND year = ? AND month = ?`,
            [processingMinutes / 60, processingMinutes / 60, log.organization_id, year, month]
          );
        }
        
        await db.commit();
        
        // 업데이트된 할당량 조회
        const updatedQuota = await this.getOrganizationQuota(log.organization_id);
        
        console.log(`✅ 익명화 완료 - 기관 ${log.organization_id}, 사용: ${processingMinutes.toFixed(2)}분, 남은 시간: ${updatedQuota.remaining_hours.toFixed(2)}시간`);
        
        return {
          success: true,
          processingMinutes: processingMinutes,
          remainingHours: updatedQuota.remaining_hours,
          usedHours: updatedQuota.used_hours,
          totalAnonymized: totalAnonymized
        };
        
      } catch (err) {
        await db.rollback();
        throw err;
      }
      
    } catch (error) {
      console.error('❌ 익명화 완료 처리 실패:', error);
      throw error;
    }
  }
  
  /**
   * 익명화 실패 처리
   */
  async failAnonymization(logId, errorMessage) {
    const db = getDB();
    
    try {
      await db.run(
        `UPDATE anonymization_logs 
         SET status = 'failed',
             error_message = ?,
             quota_deducted = 0.0
         WHERE id = ?`,
        [errorMessage, logId]
      );
      
      console.log(`⚠️ 익명화 실패 - 로그 ID: ${logId}, 에러: ${errorMessage}`);
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ 익명화 실패 처리 실패:', error);
      throw error;
    }
  }
  
  /**
   * 할당량 초과로 익명화 거부
   */
  async rejectAnonymizationOverQuota(logId) {
    const db = getDB();
    
    try {
      await db.run(
        `UPDATE anonymization_logs 
         SET status = 'quota_exceeded',
             error_message = '월간 무료 사용 시간 초과',
             quota_deducted = 0.0
         WHERE id = ?`,
        [logId]
      );
      
      console.log(`⚠️ 할당량 초과 - 로그 ID: ${logId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ 할당량 초과 처리 실패:', error);
      throw error;
    }
  }
  
  /**
   * 사용자의 익명화 로그 조회
   */
  async getUserAnonymizationLogs(userId, limit = 50, offset = 0) {
    const db = getDB();
    
    try {
      const logs = await db.query(
        `SELECT * FROM anonymization_logs 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      
      return logs;
      
    } catch (error) {
      console.error('❌ 사용자 로그 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 기관의 익명화 로그 조회
   */
  async getOrganizationAnonymizationLogs(organizationId, limit = 100, offset = 0) {
    const db = getDB();
    
    try {
      const logs = await db.query(
        `SELECT al.*, u.name as user_name, u.email as user_email
         FROM anonymization_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.organization_id = ? 
         ORDER BY al.created_at DESC 
         LIMIT ? OFFSET ?`,
        [organizationId, limit, offset]
      );
      
      return logs;
      
    } catch (error) {
      console.error('❌ 기관 로그 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 전체 기관 사용량 통계 (관리자용)
   */
  async getAllOrganizationsUsage(year = null, month = null) {
    const db = getDB();
    
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || (now.getMonth() + 1);
    
    try {
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
         WHERE ouq.year = ? AND ouq.month = ?
         ORDER BY ouq.used_hours DESC`,
        [targetYear, targetMonth]
      );
      
      // 전체 통계 계산
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
        totalRequests: totalRequests,
        averageUsagePercent: totalQuota > 0 ? (totalUsed / totalQuota * 100).toFixed(2) : 0,
        organizations: stats
      };
      
    } catch (error) {
      console.error('❌ 전체 기관 사용량 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 기관별 월별 사용 추이 (최근 N개월)
   */
  async getOrganizationUsageTrend(organizationId, months = 6) {
    const db = getDB();
    
    try {
      const now = new Date();
      const trends = [];
      
      for (let i = 0; i < months; i++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        
        const quota = await db.get(
          `SELECT * FROM organization_usage_quotas 
           WHERE organization_id = ? AND year = ? AND month = ?`,
          [organizationId, year, month]
        );
        
        trends.unshift({
          year: year,
          month: month,
          quotaHours: quota ? quota.quota_hours : 10.0,
          usedHours: quota ? quota.used_hours : 0.0,
          remainingHours: quota ? quota.remaining_hours : 10.0,
          requestCount: quota ? quota.request_count : 0,
          usagePercent: quota ? (quota.used_hours / quota.quota_hours * 100).toFixed(2) : 0
        });
      }
      
      return trends;
      
    } catch (error) {
      console.error('❌ 사용 추이 조회 실패:', error);
      throw error;
    }
  }
}

module.exports = new UsageTrackingService();
