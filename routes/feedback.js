/**
 * 피드백 API 라우터
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const feedbackService = require('../services/feedbackService');
const { authenticateToken, optionalAuth, isAdmin } = require('../middleware/auth');
const { validate, paginationQuery } = require('../middleware/validate');
const { success, created, error } = require('../lib/response');
const { ValidationError } = require('../lib/errors');
const { logger } = require('../lib/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용자 피드백 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 간단 피드백 제출 (비로그인 허용)
 * POST /api/feedback
 */
const simpleFeedbackSchema = z.object({
  body: z.object({
    rating: z.coerce.number().int().min(1, '평점은 1~5 사이여야 합니다').max(5, '평점은 1~5 사이여야 합니다'),
    comment: z.string().max(2000).optional().default(''),
    reportType: z.string().max(50).optional().default('consultation'),
    timestamp: z.string().optional(),
  }),
});

router.post('/', optionalAuth, validate(simpleFeedbackSchema), async (req, res, next) => {
  try {
    const { rating, comment, reportType } = req.body;
    const userId = req.user?.userId || null;

    const { getDB } = require('../database/db-postgres');
    const db = getDB();
    await db.run(
      `INSERT INTO anonymization_feedback (user_id, rating, comment, report_type)
       VALUES ($1, $2, $3, $4)`,
      [userId, rating, comment, reportType]
    );
    success(res, { message: '피드백이 저장되었습니다.' });
  } catch (err) {
    logger.error('간단 피드백 저장 오류:', err);
    res.status(500).json({ success: false, error: { code: 'FEEDBACK_SAVE_ERROR', message: '피드백 저장 중 오류가 발생했습니다.' } });
  }
});

/**
 * 피드백 제출
 * POST /api/feedback/submit
 */
const submitFeedbackSchema = z.object({
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().max(5000).optional(),
    method: z.string().max(50).optional(),
    reportId: z.coerce.number().int().positive().optional(),
    errorDetails: z.string().max(5000).optional(),
    category: z.string().max(50).optional(),
  }),
});

router.post('/submit', authenticateToken, validate(submitFeedbackSchema), async (req, res, next) => {
  try {
    const feedbackData = {
      ...req.body,
      userId: req.user.userId,
    };

    const result = await feedbackService.submitFeedback(feedbackData);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 내 피드백 목록 조회
 * GET /api/feedback/my-feedbacks
 */
const myFeedbacksSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    method: z.string().optional(),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    maxRating: z.coerce.number().int().min(1).max(5).optional(),
  }),
});

router.get('/my-feedbacks', authenticateToken, validate(myFeedbacksSchema), async (req, res, next) => {
  try {
    const result = await feedbackService.getFeedbacks({
      userId: req.user.userId,
      ...req.query,
    });

    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 피드백 통계 (내 기관)
 * GET /api/feedback/stats
 */
const statsSchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    method: z.string().optional(),
  }),
});

router.get('/stats', authenticateToken, validate(statsSchema), async (req, res, next) => {
  try {
    const authService = require('../services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);

    if (!userInfo.success || !userInfo.user.organization) {
      throw new ValidationError('기관 정보를 찾을 수 없습니다.');
    }

    const { startDate, endDate, method } = req.query;

    const result = await feedbackService.getFeedbackStatistics({
      organizationId: userInfo.user.organization.id,
      startDate,
      endDate,
      method,
    });

    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 개선 제안 제출
 * POST /api/feedback/suggestion
 */
const suggestionSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    category: z.string().max(50).optional(),
    content: z.string().min(1).max(5000),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
});

router.post('/suggestion', authenticateToken, validate(suggestionSchema), async (req, res, next) => {
  try {
    const authService = require('../services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);

    if (!userInfo.success || !userInfo.user.organization) {
      throw new ValidationError('기관 정보를 찾을 수 없습니다.');
    }

    const suggestionData = {
      ...req.body,
      userId: req.user.userId,
      organizationId: userInfo.user.organization.id,
    };

    const result = await feedbackService.submitSuggestion(suggestionData);
    created(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 개선 제안 목록 조회
 * GET /api/feedback/suggestions
 */
const suggestionsListSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

router.get('/suggestions', authenticateToken, validate(suggestionsListSchema), async (req, res, next) => {
  try {
    const result = await feedbackService.getSuggestions(req.query);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 관리자 전용 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 모든 피드백 조회 (관리자)
 * GET /api/feedback/admin/all
 */
const adminAllSchema = z.object({
  query: z.object({
    organizationId: z.coerce.number().int().positive().optional(),
    method: z.string().optional(),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    maxRating: z.coerce.number().int().min(1).max(5).optional(),
    hasErrors: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
    isReviewed: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

router.get('/admin/all', isAdmin, validate(adminAllSchema), async (req, res, next) => {
  try {
    const filters = { ...req.query };
    // org_admin은 자기 기관 피드백만 조회 가능
    if (req.user.role === 'org_admin' && req.user.organizationId) {
      filters.organizationId = req.user.organizationId;
    }
    const result = await feedbackService.getFeedbacks(filters);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 피드백에 응답 (관리자)
 * POST /api/feedback/admin/respond/:id
 */
const respondSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive('유효하지 않은 Feedback ID입니다'),
  }),
  body: z.object({
    response: z.string().min(1, '응답 내용이 필요합니다').max(5000),
  }),
});

router.post('/admin/respond/:id', isAdmin, validate(respondSchema), async (req, res, next) => {
  try {
    const result = await feedbackService.respondToFeedback(
      req.params.id,
      req.user.userId,
      req.body.response
    );

    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 전체 피드백 통계 (관리자)
 * GET /api/feedback/admin/statistics
 */
const adminStatsSchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    organizationId: z.coerce.number().int().positive().optional(),
    method: z.string().optional(),
  }),
});

router.get('/admin/statistics', isAdmin, validate(adminStatsSchema), async (req, res, next) => {
  try {
    const { startDate, endDate, organizationId, method } = req.query;

    const result = await feedbackService.getFeedbackStatistics({
      startDate,
      endDate,
      organizationId,
      method,
    });

    success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * 일별 통계 집계 실행 (관리자)
 * POST /api/feedback/admin/aggregate-daily
 */
const aggregateSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD여야 합니다'),
  }),
});

router.post('/admin/aggregate-daily', isAdmin, validate(aggregateSchema), async (req, res, next) => {
  try {
    const result = await feedbackService.aggregateDailyStatistics(req.body.date);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
