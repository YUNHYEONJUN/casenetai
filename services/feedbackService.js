/**
 * 사용자 피드백 서비스
 * 익명화 결과에 대한 피드백 수집 및 관리
 */

const { getDB } = require('../database/db');

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

class FeedbackService {
  /**
   * 피드백 제출
   */
  async submitFeedback(feedbackData) {
    const {
      logId,
      userId,
      organizationId,
      rating,
      accuracyScore,
      hasFalsePositive,
      hasFalseNegative,
      hasIncorrectMapping,
      falsePositiveExamples,
      falseNegativeExamples,
      incorrectMappingExamples,
      comment,
      improvementSuggestion,
      anonymizationMethod,
      processingTimeMs,
      detectedEntitiesCount
    } = feedbackData;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO anonymization_feedback (
          log_id, user_id, organization_id,
          rating, accuracy_score,
          has_false_positive, has_false_negative, has_incorrect_mapping,
          false_positive_examples, false_negative_examples, incorrect_mapping_examples,
          comment, improvement_suggestion,
          anonymization_method, processing_time_ms, detected_entities_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        logId, userId, organizationId,
        rating, accuracyScore || null,
        hasFalsePositive,
        hasFalseNegative,
        hasIncorrectMapping,
        falsePositiveExamples ? JSON.stringify(falsePositiveExamples) : null,
        falseNegativeExamples ? JSON.stringify(falseNegativeExamples) : null,
        incorrectMappingExamples ? JSON.stringify(incorrectMappingExamples) : null,
        comment || null,
        improvementSuggestion || null,
        anonymizationMethod,
        processingTimeMs,
        detectedEntitiesCount
      ];

      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            feedbackId: this.lastID,
            message: '피드백이 성공적으로 제출되었습니다.'
          });
        }
      });
    });
  }

  /**
   * 피드백 목록 조회
   */
  async getFeedbacks(filters = {}) {
    const {
      organizationId,
      userId,
      method,
      minRating,
      maxRating,
      hasErrors,
      isReviewed,
      limit = 50,
      offset = 0
    } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          f.*,
          u.name as user_name,
          u.email as user_email,
          o.name as organization_name,
          l.file_name,
          l.file_type
        FROM anonymization_feedback f
        LEFT JOIN users u ON f.user_id = u.id
        LEFT JOIN organizations o ON f.organization_id = o.id
        LEFT JOIN anonymization_logs l ON f.log_id = l.id
        WHERE 1=1
      `;

      const params = [];

      if (organizationId) {
        sql += ` AND f.organization_id = $1`;
        params.push(organizationId);
      }

      if (userId) {
        sql += ` AND f.user_id = $1`;
        params.push(userId);
      }

      if (method) {
        sql += ` AND f.anonymization_method = $1`;
        params.push(method);
      }

      if (minRating) {
        sql += ` AND f.rating >= $1`;
        params.push(minRating);
      }

      if (maxRating) {
        sql += ` AND f.rating <= $1`;
        params.push(maxRating);
      }

      if (hasErrors) {
        sql += ` AND (f.has_false_positive = 1 OR f.has_false_negative = 1 OR f.has_incorrect_mapping = 1)`;
      }

      if (isReviewed !== undefined) {
        sql += ` AND f.is_reviewed = $1`;
        params.push(isReviewed);
      }

      sql += ` ORDER BY f.created_at DESC LIMIT $1 OFFSET $2`;
      params.push(limit, offset);

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // JSON 파싱
          const feedbacks = rows.map(row => ({
            ...row,
            false_positive_examples: row.false_positive_examples ? JSON.parse(row.false_positive_examples) : null,
            false_negative_examples: row.false_negative_examples ? JSON.parse(row.false_negative_examples) : null,
            incorrect_mapping_examples: row.incorrect_mapping_examples ? JSON.parse(row.incorrect_mapping_examples) : null
          }));

          resolve({
            success: true,
            feedbacks,
            count: feedbacks.length
          });
        }
      });
    });
  }

  /**
   * 피드백 통계 조회
   */
  async getFeedbackStatistics(filters = {}) {
    const { startDate, endDate, organizationId, method } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_feedbacks,
          AVG(rating) as average_rating,
          AVG(accuracy_score) as average_accuracy,
          SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) as false_positive_count,
          SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) as false_negative_count,
          SUM(CASE WHEN has_incorrect_mapping = 1 THEN 1 ELSE 0 END) as incorrect_mapping_count,
          SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_feedbacks,
          SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_feedbacks,
          anonymization_method,
          COUNT(CASE WHEN is_reviewed = true THEN 1 END) as reviewed_count
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

      if (method) {
        sql += ` AND anonymization_method = $1`;
        params.push(method);
      }

      sql += ` GROUP BY anonymization_method`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // 전체 통계
          const totalSql = `
            SELECT 
              COUNT(*) as total_feedbacks,
              AVG(rating) as average_rating,
              AVG(accuracy_score) as average_accuracy
            FROM anonymization_feedback
            WHERE 1=1 ${startDate ? 'AND DATE(created_at) >= $1' : ''} ${endDate ? 'AND DATE(created_at) <= $2' : ''}
          `;

          const totalParams = [];
          if (startDate) totalParams.push(startDate);
          if (endDate) totalParams.push(endDate);

          db.get(totalSql, totalParams, (err2, totalRow) => {
            if (err2) {
              reject(err2);
            } else {
              resolve({
                success: true,
                overall: totalRow,
                by_method: rows
              });
            }
          });
        }
      });
    });
  }

  /**
   * 관리자 응답 추가
   */
  async respondToFeedback(feedbackId, adminId, response) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE anonymization_feedback
        SET 
          is_reviewed = true,
          admin_response = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = ?
        WHERE id = ?
      `;

      db.run(sql, [response, adminId, feedbackId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            message: '응답이 등록되었습니다.',
            changes: this.changes
          });
        }
      });
    });
  }

  /**
   * 개선 제안 제출
   */
  async submitSuggestion(suggestionData) {
    const { userId, organizationId, category, title, description, priority } = suggestionData;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO improvement_suggestions (
          user_id, organization_id, category, title, description, priority
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, [userId, organizationId, category, title, description, priority || 'medium'], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            suggestionId: this.lastID,
            message: '개선 제안이 제출되었습니다.'
          });
        }
      });
    });
  }

  /**
   * 개선 제안 목록 조회
   */
  async getSuggestions(filters = {}) {
    const { category, status, organizationId, limit = 50, offset = 0 } = filters;

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          s.*,
          u.name as user_name,
          o.name as organization_name
        FROM improvement_suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN organizations o ON s.organization_id = o.id
        WHERE 1=1
      `;

      const params = [];

      if (category) {
        sql += ` AND s.category = $1`;
        params.push(category);
      }

      if (status) {
        sql += ` AND s.status = $1`;
        params.push(status);
      }

      if (organizationId) {
        sql += ` AND s.organization_id = $1`;
        params.push(organizationId);
      }

      sql += ` ORDER BY s.upvotes DESC, s.created_at DESC LIMIT $1 OFFSET $2`;
      params.push(limit, offset);

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            suggestions: rows,
            count: rows.length
          });
        }
      });
    });
  }

  /**
   * 일별 피드백 통계 집계 (배치 작업용)
   */
  async aggregateDailyStatistics(date) {
    return new Promise((resolve, reject) => {
      // 해당 날짜의 피드백 통계 계산
      const sql = `
        SELECT 
          COUNT(*) as total_feedbacks,
          AVG(rating) as average_rating,
          AVG(accuracy_score) as average_accuracy,
          SUM(CASE WHEN has_false_positive = 1 THEN 1 ELSE 0 END) as false_positive_count,
          SUM(CASE WHEN has_false_negative = 1 THEN 1 ELSE 0 END) as false_negative_count,
          SUM(CASE WHEN has_incorrect_mapping = 1 THEN 1 ELSE 0 END) as incorrect_mapping_count
        FROM anonymization_feedback
        WHERE DATE(created_at) = ?
      `;

      db.get(sql, [date], (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        // 방식별 통계
        const methodSql = `
          SELECT 
            anonymization_method,
            COUNT(*) as count,
            AVG(rating) as avg_rating,
            AVG(accuracy_score) as avg_accuracy
          FROM anonymization_feedback
          WHERE DATE(created_at) = ?
          GROUP BY anonymization_method
        `;

        db.all(methodSql, [date], (err2, methodStats) => {
          if (err2) {
            reject(err2);
            return;
          }

          const methodStatistics = {};
          methodStats.forEach(m => {
            methodStatistics[m.anonymization_method] = {
              count: m.count,
              avg_rating: m.avg_rating,
              avg_accuracy: m.avg_accuracy
            };
          });

          // 통계 저장
          const insertSql = `
            INSERT OR REPLACE INTO feedback_statistics (
              date, total_feedbacks, average_rating, average_accuracy,
              false_positive_count, false_negative_count, incorrect_mapping_count,
              method_statistics
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(insertSql, [
            date,
            stats.total_feedbacks,
            stats.average_rating,
            stats.average_accuracy,
            stats.false_positive_count,
            stats.false_negative_count,
            stats.incorrect_mapping_count,
            JSON.stringify(methodStatistics)
          ], function(err3) {
            if (err3) {
              reject(err3);
            } else {
              resolve({
                success: true,
                date,
                statistics: {
                  ...stats,
                  method_statistics: methodStatistics
                }
              });
            }
          });
        });
      });
    });
  }
}

module.exports = new FeedbackService();
