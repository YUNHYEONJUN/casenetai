/**
 * 데이터 분석 서비스
 * 익명화 성능, 사용 패턴, 트렌드 분석
 */

const { getDB } = require('../database/db-postgres');

class AnalyticsService {
  /**
   * 전체 대시보드 통계
   */
  async getDashboardSummary(filters = {}) {
    const { startDate, endDate, organizationId } = filters;

    const [
      usageStats,
      anonymizationStats,
      feedbackStats,
      performanceStats,
      errorStats
    ] = await Promise.all([
      this.getUsageStatistics(filters),
      this.getAnonymizationStatistics(filters),
      this.getFeedbackSummary(filters),
      this.getPerformanceMetrics(filters),
      this.getErrorAnalysis(filters)
    ]);

    return {
      success: true,
      summary: {
        usage: usageStats,
        anonymization: anonymizationStats,
        feedback: feedbackStats,
        performance: performanceStats,
        errors: errorStats
      },
      period: {
        start_date: startDate,
        end_date: endDate
      }
    };
  }

  _buildDateOrgFilter(filters) {
    const { startDate, endDate, organizationId } = filters;
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      params.push(organizationId);
    }

    return { conditions, params, paramIndex };
  }

  /**
   * 사용 통계
   */
  async getUsageStatistics(filters = {}) {
    const db = getDB();
    const { conditions, params } = this._buildDateOrgFilter(filters);

    const allConditions = ["status IN ('success','completed')", ...conditions];
    const whereClause = 'WHERE ' + allConditions.join(' AND ');

    const row = await db.get(`
      SELECT
        COUNT(*) as total_requests,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT organization_id) as active_organizations,
        COALESCE(SUM(processing_time_seconds), 0) as total_processing_time,
        COALESCE(AVG(processing_time_seconds), 0) as avg_processing_time,
        COALESCE(SUM(file_size_kb), 0) as total_data_processed_kb
      FROM anonymization_logs
      ${whereClause}
    `, params);

    return {
      total_requests: Number(row.total_requests) || 0,
      unique_users: Number(row.unique_users) || 0,
      active_organizations: Number(row.active_organizations) || 0,
      total_processing_time: Number(row.total_processing_time) || 0,
      avg_processing_time: Number(row.avg_processing_time) || 0,
      total_data_processed_kb: Number(row.total_data_processed_kb) || 0
    };
  }

  /**
   * 익명화 통계 (탐지 정확도 등)
   */
  async getAnonymizationStatistics(filters = {}) {
    const db = getDB();
    const { conditions, params } = this._buildDateOrgFilter(filters);

    const allConditions = ["status IN ('success','completed')", ...conditions];
    const whereClause = 'WHERE ' + allConditions.join(' AND ');

    const byFileType = await db.query(`
      SELECT
        COUNT(*) as total_anonymizations,
        COALESCE(SUM(anonymized_names), 0) as total_names,
        COALESCE(SUM(COALESCE(anonymized_phones,0) + COALESCE(anonymized_emails,0) + COALESCE(anonymized_addresses,0)), 0) as total_contacts,
        COALESCE(SUM(anonymized_ids), 0) as total_identifiers,
        COALESCE(SUM(anonymized_facilities), 0) as total_facilities,
        COALESCE(AVG(total_anonymized), 0) as avg_entities_per_doc,
        COALESCE(file_type, 'unknown') as file_type,
        COUNT(*) as count
      FROM anonymization_logs
      ${whereClause}
      GROUP BY file_type
    `, params);

    const total = await db.get(`
      SELECT
        COALESCE(SUM(anonymized_names), 0) as total_names,
        COALESCE(SUM(COALESCE(anonymized_phones,0) + COALESCE(anonymized_emails,0) + COALESCE(anonymized_addresses,0)), 0) as total_contacts,
        COALESCE(SUM(anonymized_ids), 0) as total_identifiers,
        COALESCE(SUM(anonymized_facilities), 0) as total_facilities
      FROM anonymization_logs
      ${whereClause}
    `, params);

    return {
      total,
      by_file_type: byFileType
    };
  }

  /**
   * 피드백 요약
   */
  async getFeedbackSummary(filters = {}) {
    const db = getDB();
    const { conditions, params } = this._buildDateOrgFilter(filters);

    const allConditions = ['1=1', ...conditions];
    const whereClause = 'WHERE ' + allConditions.join(' AND ');

    const row = await db.get(`
      SELECT
        COUNT(*) as total_feedbacks,
        COALESCE(AVG(rating), 0) as avg_rating,
        COALESCE(AVG(accuracy_score), 0) as avg_accuracy,
        COALESCE(SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END), 0) as positive_count,
        COALESCE(SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END), 0) as negative_count,
        COALESCE(SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END), 0) as false_positive_count,
        COALESCE(SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END), 0) as false_negative_count
      FROM anonymization_feedback
      ${whereClause}
    `, params);

    return {
      total_feedbacks: Number(row.total_feedbacks) || 0,
      avg_rating: Number(row.avg_rating) || 0,
      avg_accuracy: Number(row.avg_accuracy) || 0,
      positive_count: Number(row.positive_count) || 0,
      negative_count: Number(row.negative_count) || 0,
      false_positive_count: Number(row.false_positive_count) || 0,
      false_negative_count: Number(row.false_negative_count) || 0
    };
  }

  /**
   * 성능 메트릭
   */
  async getPerformanceMetrics(filters = {}) {
    const db = getDB();
    const { startDate, endDate, method } = filters;

    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (method) {
      conditions.push(`anonymization_method = $${paramIndex++}`);
      params.push(method);
    }

    const rows = await db.query(`
      SELECT
        anonymization_method,
        COUNT(*) as count,
        AVG(processing_time_ms) as avg_processing_time,
        MIN(processing_time_ms) as min_processing_time,
        MAX(processing_time_ms) as max_processing_time,
        AVG(detected_entities_count) as avg_entities_detected
      FROM anonymization_feedback
      WHERE ${conditions.join(' AND ')}
      GROUP BY anonymization_method
    `, params);

    return { by_method: rows };
  }

  /**
   * 오류 분석
   */
  async getErrorAnalysis(filters = {}) {
    const db = getDB();
    const { startDate, endDate } = filters;

    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex++}`);
      params.push(endDate);
    }

    const rows = await db.query(`
      SELECT
        anonymization_method,
        SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END) as false_positive_count,
        SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END) as false_negative_count,
        SUM(CASE WHEN has_incorrect_mapping = true THEN 1 ELSE 0 END) as incorrect_mapping_count,
        COUNT(*) as total_feedbacks,
        ROUND(100.0 * SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END) / COUNT(*), 2) as false_positive_rate,
        ROUND(100.0 * SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END) / COUNT(*), 2) as false_negative_rate
      FROM anonymization_feedback
      WHERE ${conditions.join(' AND ')}
      GROUP BY anonymization_method
    `, params);

    return { by_method: rows };
  }

  /**
   * 시계열 트렌드 (일별)
   */
  async getDailyTrend(filters = {}) {
    const db = getDB();
    const { startDate, endDate, metric = 'requests' } = filters;

    let sql;
    if (metric === 'requests') {
      sql = `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(processing_time_seconds) as total_processing_time
        FROM anonymization_logs
        WHERE status = 'success'
      `;
    } else {
      sql = `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          AVG(rating) as avg_rating,
          AVG(accuracy_score) as avg_accuracy
        FROM anonymization_feedback
        WHERE 1=1
      `;
    }

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      sql += ` AND DATE(created_at) >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND DATE(created_at) <= $${paramIndex++}`;
      params.push(endDate);
    }

    sql += ` GROUP BY DATE(created_at) ORDER BY date ASC`;

    const rows = await db.query(sql, params);

    return {
      success: true,
      metric,
      data: rows
    };
  }

  /**
   * 기관별 비교
   */
  async getOrganizationComparison(filters = {}) {
    const db = getDB();
    const { startDate, endDate } = filters;

    let sql = `
      SELECT
        o.id,
        o.name,
        o.region,
        COUNT(DISTINCT l.id) as total_requests,
        AVG(l.processing_time_seconds) as avg_processing_time,
        SUM(l.processing_time_seconds) as total_usage_seconds,
        AVG(f.rating) as avg_rating,
        COUNT(DISTINCT f.id) as feedback_count
      FROM organizations o
      LEFT JOIN anonymization_logs l ON o.id = l.organization_id AND l.status = 'success'
      LEFT JOIN anonymization_feedback f ON o.id = f.organization_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      sql += ` AND (l.created_at IS NULL OR DATE(l.created_at) >= $${paramIndex++})`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND (l.created_at IS NULL OR DATE(l.created_at) <= $${paramIndex++})`;
      params.push(endDate);
    }

    sql += ` GROUP BY o.id, o.name, o.region ORDER BY total_requests DESC`;

    const rows = await db.query(sql, params);

    return {
      success: true,
      organizations: rows
    };
  }

  /**
   * 방식별 비교 (Rule vs AI vs CLOVA vs Hybrid)
   */
  async getMethodComparison(filters = {}) {
    const db = getDB();
    const { startDate, endDate } = filters;

    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex++}`);
      params.push(endDate);
    }

    const rows = await db.query(`
      SELECT
        anonymization_method,
        COUNT(*) as usage_count,
        AVG(rating) as avg_rating,
        AVG(accuracy_score) as avg_accuracy,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END) as false_positive_count,
        SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END) as false_negative_count,
        ROUND(100.0 * SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) / COUNT(*), 2) as satisfaction_rate
      FROM anonymization_feedback
      WHERE ${conditions.join(' AND ')}
      GROUP BY anonymization_method ORDER BY usage_count DESC
    `, params);

    return {
      success: true,
      methods: rows
    };
  }

  /**
   * 주요 문제점 분석
   */
  async getTopIssues(filters = {}) {
    const db = getDB();
    const { limit = 10 } = filters;

    const fpRows = await db.query(`
      SELECT
        false_positive_examples,
        COUNT(*) as count,
        anonymization_method
      FROM anonymization_feedback
      WHERE has_false_positive = true AND false_positive_examples IS NOT NULL
      GROUP BY false_positive_examples, anonymization_method
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);

    const fnRows = await db.query(`
      SELECT
        false_negative_examples,
        COUNT(*) as count,
        anonymization_method
      FROM anonymization_feedback
      WHERE has_false_negative = true AND false_negative_examples IS NOT NULL
      GROUP BY false_negative_examples, anonymization_method
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);

    const safeParse = (val) => {
      if (val == null) return [];
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return []; }
    };

    return {
      success: true,
      false_positives: fpRows.map(row => ({
        ...row,
        examples: safeParse(row.false_positive_examples)
      })),
      false_negatives: fnRows.map(row => ({
        ...row,
        examples: safeParse(row.false_negative_examples)
      }))
    };
  }
}

module.exports = new AnalyticsService();
