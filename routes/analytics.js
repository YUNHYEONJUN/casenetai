/**
 * 분석 API 라우터 (관리자 전용)
 */

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { isAdmin } = require('../middleware/auth');

// 모든 분석 API는 관리자 전용
router.use(isAdmin);

/**
 * 대시보드 요약 통계
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const result = await analyticsService.getDashboardSummary({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined
    });

    res.json(result);
  } catch (error) {
    console.error('대시보드 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '대시보드 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

/**
 * 사용 통계
 * GET /api/analytics/usage
 */
router.get('/usage', async (req, res) => {
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
    console.error('사용 통계 조회 오류:', error);
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
router.get('/anonymization', async (req, res) => {
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
    console.error('익명화 통계 조회 오류:', error);
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
router.get('/feedback-summary', async (req, res) => {
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
    console.error('피드백 요약 조회 오류:', error);
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
router.get('/performance', async (req, res) => {
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
    console.error('성능 메트릭 조회 오류:', error);
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
router.get('/errors', async (req, res) => {
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
    console.error('오류 분석 조회 오류:', error);
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
router.get('/trend', async (req, res) => {
  try {
    const { startDate, endDate, metric = 'requests' } = req.query;
    
    const result = await analyticsService.getDailyTrend({
      startDate,
      endDate,
      metric
    });

    res.json(result);
  } catch (error) {
    console.error('트렌드 조회 오류:', error);
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
router.get('/organizations', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await analyticsService.getOrganizationComparison({
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    console.error('기관 비교 조회 오류:', error);
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
router.get('/methods', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await analyticsService.getMethodComparison({
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    console.error('방식 비교 조회 오류:', error);
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
router.get('/top-issues', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const result = await analyticsService.getTopIssues({
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('문제점 분석 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '문제점 분석 조회 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
