/**
 * 분석 API 라우터 (관리자 전용)
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const analyticsService = require('../services/analyticsService');
const { isAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logger } = require('../lib/logger');

// 공통 쿼리 스키마
const dateRangeQuery = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    organizationId: z.coerce.number().int().positive().optional(),
  }),
});

const dateRangeOnlyQuery = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
  }),
});

// 모든 분석 API는 관리자 전용
router.use(isAdmin);

/**
 * 대시보드 요약 통계
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', validate(dateRangeQuery), async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const result = await analyticsService.getDashboardSummary({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined
    });

    res.json(result);
  } catch (error) {
    logger.error('대시보드 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '대시보드 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 사용 통계
 * GET /api/analytics/usage
 */
router.get('/usage', validate(dateRangeQuery), async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const result = await analyticsService.getUsageStatistics({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined
    });

    res.json({
      success: true,
      usage: result
    });
  } catch (error) {
    logger.error('사용 통계 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '사용 통계 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 익명화 통계
 * GET /api/analytics/anonymization
 */
router.get('/anonymization', validate(dateRangeQuery), async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const result = await analyticsService.getAnonymizationStatistics({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined
    });

    res.json({
      success: true,
      anonymization: result
    });
  } catch (error) {
    logger.error('익명화 통계 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '익명화 통계 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 피드백 요약
 * GET /api/analytics/feedback-summary
 */
router.get('/feedback-summary', validate(dateRangeQuery), async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const result = await analyticsService.getFeedbackSummary({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined
    });

    res.json({
      success: true,
      feedback: result
    });
  } catch (error) {
    logger.error('피드백 요약 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '피드백 요약 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 성능 메트릭
 * GET /api/analytics/performance
 */
const performanceQuery = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    method: z.string().max(50).optional(),
  }),
});

router.get('/performance', validate(performanceQuery), async (req, res) => {
  try {
    const { startDate, endDate, method } = req.query;
    
    const result = await analyticsService.getPerformanceMetrics({
      startDate,
      endDate,
      method
    });

    res.json({
      success: true,
      performance: result
    });
  } catch (error) {
    logger.error('성능 메트릭 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '성능 메트릭 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 오류 분석
 * GET /api/analytics/errors
 */
router.get('/errors', validate(dateRangeOnlyQuery), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await analyticsService.getErrorAnalysis({
      startDate,
      endDate
    });

    res.json({
      success: true,
      errors: result
    });
  } catch (error) {
    logger.error('오류 분석 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '오류 분석 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 시계열 트렌드
 * GET /api/analytics/trend
 */
const trendQuery = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
    metric: z.enum(['requests', 'duration', 'cost', 'errors']).optional(),
  }),
});

router.get('/trend', validate(trendQuery), async (req, res) => {
  try {
    const { startDate, endDate, metric = 'requests' } = req.query;
    
    const result = await analyticsService.getDailyTrend({
      startDate,
      endDate,
      metric
    });

    res.json(result);
  } catch (error) {
    logger.error('트렌드 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '트렌드 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 기관별 비교
 * GET /api/analytics/organizations
 */
router.get('/organizations', validate(dateRangeOnlyQuery), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await analyticsService.getOrganizationComparison({
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    logger.error('기관 비교 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '기관 비교 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 방식별 비교 (Rule vs AI vs CLOVA vs Hybrid)
 * GET /api/analytics/methods
 */
router.get('/methods', validate(dateRangeOnlyQuery), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await analyticsService.getMethodComparison({
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    logger.error('방식 비교 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '방식 비교 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 주요 문제점 분석
 * GET /api/analytics/top-issues
 */
const topIssuesQuery = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

router.get('/top-issues', validate(topIssuesQuery), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await analyticsService.getTopIssues({
      limit: parseInt(limit) || 10
    });

    res.json(result);
  } catch (error) {
    logger.error('문제점 분석 조회 오류', { error: error.message });
    res.status(500).json({
      success: false,
      error: '문제점 분석 조회 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
