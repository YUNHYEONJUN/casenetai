/**
 * 사용자 피드백 서비스
 * 익명화 결과에 대한 피드백 수집 및 관리
 */

const { getDB } = require('../database/db-postgres');

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

    const db = getDB();
    const result = await db.run(`
      INSERT INTO anonymization_feedback (
        log_id, user_id, organization_id,
        rating, accuracy_score,
        has_false_positive, has_false_negative, has_incorrect_mapping,
        false_positive_examples, false_negative_examples, incorrect_mapping_examples,
        comment, improvement_suggestion,
        anonymization_method, processing_time_ms, detected_entities_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
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
    ]);

    return {
      success: true,
      feedbackId: result.lastID,
      message: '피드백이 성공적으로 제출되었습니다.'
    };
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

    const db = getDB();
    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (organizationId) {
      conditions.push(`f.organization_id = $${paramIndex++}`);
      params.push(organizationId);
    }

    if (userId) {
      conditions.push(`f.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (method) {
      conditions.push(`f.anonymization_method = $${paramIndex++}`);
      params.push(method);
    }

    if (minRating) {
      conditions.push(`f.rating >= $${paramIndex++}`);
      params.push(minRating);
    }

    if (maxRating) {
      conditions.push(`f.rating <= $${paramIndex++}`);
      params.push(maxRating);
    }

    if (hasErrors) {
      conditions.push(`(f.has_false_positive = true OR f.has_false_negative = true OR f.has_incorrect_mapping = true)`);
    }

    if (isReviewed !== undefined) {
      conditions.push(`f.is_reviewed = $${paramIndex++}`);
      params.push(isReviewed);
    }

    const whereClause = conditions.join(' AND ');

    const rows = await db.query(`
      SELECT
        f.*,
        u.name as user_name,
        u.oauth_email as user_email,
        o.name as organization_name,
        l.file_name,
        l.file_type
      FROM anonymization_feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN organizations o ON f.organization_id = o.id
      LEFT JOIN anonymization_logs l ON f.log_id = l.id
      WHERE ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const feedbacks = rows.map(row => ({
      ...row,
      false_positive_examples: row.false_positive_examples ? JSON.parse(row.false_positive_examples) : null,
      false_negative_examples: row.false_negative_examples ? JSON.parse(row.false_negative_examples) : null,
      incorrect_mapping_examples: row.incorrect_mapping_examples ? JSON.parse(row.incorrect_mapping_examples) : null
    }));

    return {
      success: true,
      feedbacks,
      count: feedbacks.length
    };
  }

  /**
   * 피드백 통계 조회
   */
  async getFeedbackStatistics(filters = {}) {
    const { startDate, endDate, organizationId, method } = filters;

    const db = getDB();
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

    if (organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      params.push(organizationId);
    }

    if (method) {
      conditions.push(`anonymization_method = $${paramIndex++}`);
      params.push(method);
    }

    const whereClause = conditions.join(' AND ');

    const byMethod = await db.query(`
      SELECT
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        AVG(accuracy_score) as average_accuracy,
        SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END) as false_positive_count,
        SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END) as false_negative_count,
        SUM(CASE WHEN has_incorrect_mapping = true THEN 1 ELSE 0 END) as incorrect_mapping_count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_feedbacks,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_feedbacks,
        anonymization_method,
        COUNT(CASE WHEN is_reviewed = true THEN 1 END) as reviewed_count
      FROM anonymization_feedback
      WHERE ${whereClause}
      GROUP BY anonymization_method
    `, params);

    // 전체 통계 (startDate/endDate만 적용)
    let totalConditions = ['1=1'];
    let totalParams = [];
    let totalParamIndex = 1;

    if (startDate) {
      totalConditions.push(`DATE(created_at) >= $${totalParamIndex++}`);
      totalParams.push(startDate);
    }
    if (endDate) {
      totalConditions.push(`DATE(created_at) <= $${totalParamIndex++}`);
      totalParams.push(endDate);
    }

    const totalRow = await db.get(`
      SELECT
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        AVG(accuracy_score) as average_accuracy
      FROM anonymization_feedback
      WHERE ${totalConditions.join(' AND ')}
    `, totalParams);

    return {
      success: true,
      overall: totalRow,
      by_method: byMethod
    };
  }

  /**
   * 관리자 응답 추가
   */
  async respondToFeedback(feedbackId, adminId, response) {
    const db = getDB();
    const result = await db.run(`
      UPDATE anonymization_feedback
      SET
        is_reviewed = true,
        admin_response = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?
      WHERE id = ?
    `, [response, adminId, feedbackId]);

    return {
      success: true,
      message: '응답이 등록되었습니다.',
      changes: result.changes
    };
  }

  /**
   * 개선 제안 제출
   */
  async submitSuggestion(suggestionData) {
    const { userId, organizationId, category, title, description, priority } = suggestionData;

    const db = getDB();
    const result = await db.run(`
      INSERT INTO improvement_suggestions (
        user_id, organization_id, category, title, description, priority
      ) VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [userId, organizationId, category, title, description, priority || 'medium']);

    return {
      success: true,
      suggestionId: result.lastID,
      message: '개선 제안이 제출되었습니다.'
    };
  }

  /**
   * 개선 제안 목록 조회
   */
  async getSuggestions(filters = {}) {
    const { category, status, organizationId, limit = 50, offset = 0 } = filters;

    const db = getDB();
    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`s.category = $${paramIndex++}`);
      params.push(category);
    }

    if (status) {
      conditions.push(`s.status = $${paramIndex++}`);
      params.push(status);
    }

    if (organizationId) {
      conditions.push(`s.organization_id = $${paramIndex++}`);
      params.push(organizationId);
    }

    const whereClause = conditions.join(' AND ');

    const rows = await db.query(`
      SELECT
        s.*,
        u.name as user_name,
        o.name as organization_name
      FROM improvement_suggestions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN organizations o ON s.organization_id = o.id
      WHERE ${whereClause}
      ORDER BY s.upvotes DESC, s.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    return {
      success: true,
      suggestions: rows,
      count: rows.length
    };
  }

  /**
   * 일별 피드백 통계 집계 (배치 작업용)
   */
  async aggregateDailyStatistics(date) {
    const db = getDB();

    const stats = await db.get(`
      SELECT
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        AVG(accuracy_score) as average_accuracy,
        SUM(CASE WHEN has_false_positive = true THEN 1 ELSE 0 END) as false_positive_count,
        SUM(CASE WHEN has_false_negative = true THEN 1 ELSE 0 END) as false_negative_count,
        SUM(CASE WHEN has_incorrect_mapping = true THEN 1 ELSE 0 END) as incorrect_mapping_count
      FROM anonymization_feedback
      WHERE DATE(created_at) = $1
    `, [date]);

    const methodStats = await db.query(`
      SELECT
        anonymization_method,
        COUNT(*) as count,
        AVG(rating) as avg_rating,
        AVG(accuracy_score) as avg_accuracy
      FROM anonymization_feedback
      WHERE DATE(created_at) = $1
      GROUP BY anonymization_method
    `, [date]);

    const methodStatistics = {};
    methodStats.forEach(m => {
      methodStatistics[m.anonymization_method] = {
        count: m.count,
        avg_rating: m.avg_rating,
        avg_accuracy: m.avg_accuracy
      };
    });

    // 통계 저장 (INSERT ON CONFLICT for PostgreSQL)
    await db.run(`
      INSERT INTO feedback_statistics (
        date, total_feedbacks, average_rating, average_accuracy,
        false_positive_count, false_negative_count, incorrect_mapping_count,
        method_statistics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (date) DO UPDATE SET
        total_feedbacks = EXCLUDED.total_feedbacks,
        average_rating = EXCLUDED.average_rating,
        average_accuracy = EXCLUDED.average_accuracy,
        false_positive_count = EXCLUDED.false_positive_count,
        false_negative_count = EXCLUDED.false_negative_count,
        incorrect_mapping_count = EXCLUDED.incorrect_mapping_count,
        method_statistics = EXCLUDED.method_statistics
    `, [
      date,
      stats.total_feedbacks,
      stats.average_rating,
      stats.average_accuracy,
      stats.false_positive_count,
      stats.false_negative_count,
      stats.incorrect_mapping_count,
      JSON.stringify(methodStatistics)
    ]);

    return {
      success: true,
      date,
      statistics: {
        ...stats,
        method_statistics: methodStatistics
      }
    };
  }
}

module.exports = new FeedbackService();
