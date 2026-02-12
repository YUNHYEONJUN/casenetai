/**
 * 데이터 분석 서비스
 * 익명화 성능, 사용 패턴, 트렌드 분석
 */

const { getDB } = require('../database/db-postgres');

// SQLite 콜백 스타일 호환 래퍼
const db = {
  get: (sql, params, callback) => {
    const database = getDB();
    database.get(sql, params)
      .then(row => callback(null, row))
      .catch(err => callback(err));
  },
  all: (sql, params, callback) => {
    const database = getDB();
    database.query(sql, params)
      .then(rows => callback(null, rows))
      .catch(err => callback(err));
  },
  run: (sql, params, callback) => {
    const database = getDB();
    database.run(sql, params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  }
};

class AnalyticsService {
  /**
   * 전체 대시보드 통계
   */
  async getDashboardSummary(filters = {}) {
    const { startDate, endDate, organizationId } = filters;

    try {
      // 병렬 실행
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
    } catch (error) {
      throw error;
    }
  }

  /**
   * 사용 통계
   */
  async getUsageStatistics(filters = {}) {
    const { startDate, endDate, organizationId } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT organization_id) as active_organizations,
          SUM(processing_time_seconds) as total_processing_time,
          AVG(processing_time_seconds) as avg_processing_time,
          SUM(file_size_kb) as total_data_processed_kb
        FROM anonymization_logs
        WHERE status = 'completed'
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      if (organizationId) {
        sql += ` AND organization_id = $1`;
        params.push(organizationId);
      }

      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 익명화 통계 (탐지 정확도 등)
   */
  async getAnonymizationStatistics(filters = {}) {
    const { startDate, endDate, organizationId } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_anonymizations,
          SUM(names_detected) as total_names,
          SUM(contacts_detected) as total_contacts,
          SUM(identifiers_detected) as total_identifiers,
          SUM(facilities_detected) as total_facilities,
          AVG(names_detected + contacts_detected + identifiers_detected + facilities_detected) as avg_entities_per_doc,
          file_type,
          COUNT(*) as count
        FROM anonymization_logs
        WHERE status = 'completed'
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      if (organizationId) {
        sql += ` AND organization_id = $1`;
        params.push(organizationId);
      }

      sql += ` GROUP BY file_type`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // 전체 합계
          const totalSql = `
            SELECT 
              SUM(names_detected) as total_names,
              SUM(contacts_detected) as total_contacts,
              SUM(identifiers_detected) as total_identifiers,
              SUM(facilities_detected) as total_facilities
            FROM anonymization_logs
            WHERE status = 'completed'
            ${startDate ? 'AND DATE(created_at) >= $1' : ''}
            ${endDate ? 'AND DATE(created_at) <= $1' : ''}
            ${organizationId ? 'AND organization_id = $1' : ''}
          `;

          const totalParams = [];
          if (startDate) totalParams.push(startDate);
          if (endDate) totalParams.push(endDate);
          if (organizationId) totalParams.push(organizationId);

          db.get(totalSql, totalParams, (err2, total) => {
            if (err2) {
              reject(err2);
            } else {
              resolve({
                total: total,
                by_file_type: rows
              });
            }
          });
        }
      });
    });
  }

  /**
   * 피드백 요약
   */
  async getFeedbackSummary(filters = {}) {
    const { startDate, endDate, organizationId } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_feedbacks,
          AVG(rating) as avg_rating,
          AVG(accuracy_score) as avg_accuracy,
          SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_count,
          SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) as false_positive_count,
          SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) as false_negative_count
        FROM anonymization_feedback
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      if (organizationId) {
        sql += ` AND organization_id = $1`;
        params.push(organizationId);
      }

      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 성능 메트릭
   */
  async getPerformanceMetrics(filters = {}) {
    const { startDate, endDate, method } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          anonymization_method,
          COUNT(*) as count,
          AVG(processing_time_ms) as avg_processing_time,
          MIN(processing_time_ms) as min_processing_time,
          MAX(processing_time_ms) as max_processing_time,
          AVG(detected_entities_count) as avg_entities_detected
        FROM anonymization_feedback
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      if (method) {
        sql += ` AND anonymization_method = $1`;
        params.push(method);
      }

      sql += ` GROUP BY anonymization_method`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            by_method: rows
          });
        }
      });
    });
  }

  /**
   * 오류 분석
   */
  async getErrorAnalysis(filters = {}) {
    const { startDate, endDate } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          anonymization_method,
          SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) as false_positive_count,
          SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) as false_negative_count,
          SUM(CASE WHEN has_incorrect_mapping = 1 THEN 1 ELSE 0 END) as incorrect_mapping_count,
          COUNT(*) as total_feedbacks,
          ROUND(100.0 * SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as false_positive_rate,
          ROUND(100.0 * SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as false_negative_rate
        FROM anonymization_feedback
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      sql += ` GROUP BY anonymization_method`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            by_method: rows
          });
        }
      });
    });
  }

  /**
   * 시계열 트렌드 (일별)
   */
  async getDailyTrend(filters = {}) {
    const { startDate, endDate, metric = 'requests' } = filters;

    return new Promise((resolve, reject) => {
      let sql;
      
      if (metric === 'requests') {
        sql = `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as count,
            COUNT(DISTINCT user_id) as unique_users,
            SUM(processing_time_seconds) as total_processing_time
          FROM anonymization_logs
          WHERE status = 'completed'
        `;
      } else if (metric === 'feedback') {
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

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      sql += ` GROUP BY DATE(created_at) ORDER BY date ASC`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            metric,
            data: rows
          });
        }
      });
    });
  }

  /**
   * 기관별 비교
   */
  async getOrganizationComparison(filters = {}) {
    const { startDate, endDate } = filters;

    return new Promise((resolve, reject) => {
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
        LEFT JOIN anonymization_logs l ON o.id = l.organization_id AND l.status = 'completed'
        LEFT JOIN anonymization_feedback f ON o.id = f.organization_id
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        sql += ` AND (l.created_at IS NULL OR DATE(l.created_at) >= $1)`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND (l.created_at IS NULL OR DATE(l.created_at) <= $1)`;
        params.push(endDate);
      }

      sql += ` GROUP BY o.id, o.name, o.region ORDER BY total_requests DESC`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            organizations: rows
          });
        }
      });
    });
  }

  /**
   * 방식별 비교 (Rule vs AI vs CLOVA vs Hybrid)
   */
  async getMethodComparison(filters = {}) {
    const { startDate, endDate } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          anonymization_method,
          COUNT(*) as usage_count,
          AVG(rating) as avg_rating,
          AVG(accuracy_score) as avg_accuracy,
          AVG(processing_time_ms) as avg_processing_time,
          SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) as false_positive_count,
          SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) as false_negative_count,
          ROUND(100.0 * SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) / COUNT(*), 2) as satisfaction_rate
        FROM anonymization_feedback
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        sql += ` AND DATE(created_at) >= $1`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND DATE(created_at) <= $1`;
        params.push(endDate);
      }

      sql += ` GROUP BY anonymization_method ORDER BY usage_count DESC`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            methods: rows
          });
        }
      });
    });
  }

  /**
   * 주요 문제점 분석
   */
  async getTopIssues(filters = {}) {
    const { limit = 10 } = filters;

    return new Promise((resolve, reject) => {
      // 가장 많이 보고된 오탐 패턴
      const falsePositiveSql = `
        SELECT 
          false_positive_examples,
          COUNT(*) as count,
          anonymization_method
        FROM anonymization_feedback
        WHERE has_false_positive = 1 AND false_positive_examples IS NOT NULL
        GROUP BY false_positive_examples, anonymization_method
        ORDER BY count DESC
        LIMIT ?
      `;

      db.all(falsePositiveSql, [limit], (err, fpRows) => {
        if (err) {
          reject(err);
          return;
        }

        // 가장 많이 보고된 미탐 패턴
        const falseNegativeSql = `
          SELECT 
            false_negative_examples,
            COUNT(*) as count,
            anonymization_method
          FROM anonymization_feedback
          WHERE has_false_negative = 1 AND false_negative_examples IS NOT NULL
          GROUP BY false_negative_examples, anonymization_method
          ORDER BY count DESC
          LIMIT ?
        `;

        db.all(falseNegativeSql, [limit], (err2, fnRows) => {
          if (err2) {
            reject(err2);
          } else {
            resolve({
              success: true,
              false_positives: fpRows.map(row => ({
                ...row,
                examples: JSON.parse(row.false_positive_examples)
              })),
              false_negatives: fnRows.map(row => ({
                ...row,
                examples: JSON.parse(row.false_negative_examples)
              }))
            });
          }
        });
      });
    });
  }
}

module.exports = new AnalyticsService();
