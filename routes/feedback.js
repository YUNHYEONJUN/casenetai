/**
 * 피드백 API 라우터
 */

const express = require('express');
const router = express.Router();
const feedbackService = require('../services/feedbackService');
const analyticsService = require('../services/analyticsService');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용자 피드백 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 피드백 제출
 * POST /api/feedback/submit
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const feedbackData = {
      ...req.body,
      userId: req.user.userId
    };

    const result = await feedbackService.submitFeedback(feedbackData);
    res.json(result);
  } catch (error) {
    console.error('피드백 제출 오류:', error);
    res.status(500).json({
      success: false,
      error: '피드백 제출 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

/**
 * 내 피드백 목록 조회
 * GET /api/feedback/my-feedbacks
 */
router.get('/my-feedbacks', authenticateToken, async (req, res) => {
  try {
    const { limit, offset, method, minRating, maxRating } = req.query;
    
    const result = await feedbackService.getFeedbacks({
      userId: req.user.userId,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      method,
      minRating: minRating ? parseInt(minRating) : undefined,
      maxRating: maxRating ? parseInt(maxRating) : undefined
    });

    res.json(result);
  } catch (error) {
    console.error('피드백 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '피드백 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 피드백 통계 (내 기관)
 * GET /api/feedback/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const authService = require('../services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);
    
    if (!userInfo.success || !userInfo.user.organization) {
      return res.status(400).json({
        success: false,
        error: '기관 정보를 찾을 수 없습니다.'
      });
    }

    const { startDate, endDate, method } = req.query;
    
    const result = await feedbackService.getFeedbackStatistics({
      organizationId: userInfo.user.organization.id,
      startDate,
      endDate,
      method
    });

    res.json(result);
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 개선 제안 제출
 * POST /api/feedback/suggestion
 */
router.post('/suggestion', authenticateToken, async (req, res) => {
  try {
    const authService = require('../services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);
    
    if (!userInfo.success || !userInfo.user.organization) {
      return res.status(400).json({
        success: false,
        error: '기관 정보를 찾을 수 없습니다.'
      });
    }

    const suggestionData = {
      ...req.body,
      userId: req.user.userId,
      organizationId: userInfo.user.organization.id
    };

    const result = await feedbackService.submitSuggestion(suggestionData);
    res.json(result);
  } catch (error) {
    console.error('제안 제출 오류:', error);
    res.status(500).json({
      success: false,
      error: '제안 제출 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 개선 제안 목록 조회
 * GET /api/feedback/suggestions
 */
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const { category, status, limit, offset } = req.query;
    
    const result = await feedbackService.getSuggestions({
      category,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json(result);
  } catch (error) {
    console.error('제안 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '제안 조회 중 오류가 발생했습니다.'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 관리자 전용 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 모든 피드백 조회 (관리자)
 * GET /api/feedback/admin/all
 */
router.get('/admin/all', isAdmin, async (req, res) => {
  try {
    const { organizationId, method, minRating, maxRating, hasErrors, isReviewed, limit, offset } = req.query;
    
    const result = await feedbackService.getFeedbacks({
      organizationId: organizationId ? parseInt(organizationId) : undefined,
      method,
      minRating: minRating ? parseInt(minRating) : undefined,
      maxRating: maxRating ? parseInt(maxRating) : undefined,
      hasErrors: hasErrors === 'true',
      isReviewed: isReviewed === 'true',
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0
    });

    res.json(result);
  } catch (error) {
    console.error('피드백 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '피드백 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 피드백에 응답 (관리자)
 * POST /api/feedback/admin/respond/:id
 */
router.post('/admin/respond/:id', isAdmin, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id);
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({
        success: false,
        error: '응답 내용이 필요합니다.'
      });
    }

    const result = await feedbackService.respondToFeedback(
      feedbackId,
      req.user.userId,
      response
    );

    res.json(result);
  } catch (error) {
    console.error('응답 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '응답 등록 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 전체 피드백 통계 (관리자)
 * GET /api/feedback/admin/statistics
 */
router.get('/admin/statistics', isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, organizationId, method } = req.query;
    
    const result = await feedbackService.getFeedbackStatistics({
      startDate,
      endDate,
      organizationId: organizationId ? parseInt(organizationId) : undefined,
      method
    });

    res.json(result);
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 일별 통계 집계 실행 (관리자)
 * POST /api/feedback/admin/aggregate-daily
 */
router.post('/admin/aggregate-daily', isAdmin, async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: '날짜가 필요합니다. (형식: YYYY-MM-DD)'
      });
    }

    const result = await feedbackService.aggregateDailyStatistics(date);
    res.json(result);
  } catch (error) {
    console.error('통계 집계 오류:', error);
    res.status(500).json({
      success: false,
      error: '통계 집계 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
