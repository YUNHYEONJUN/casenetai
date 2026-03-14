/**
 * 문서 익명화 API
 * - 텍스트 비교 익명화
 * - 문서 업로드 → 파싱 → 익명화
 * - 헬스체크
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { documentUpload } = require('../config/multer');
const anonymizationService = require('../services/anonymizationService');
const documentParser = require('../services/documentParser');
const usageTrackingService = require('../services/usageTrackingService');
const HybridAnonymizationService = require('../services/hybridAnonymizationService');
const { logger } = require('../lib/logger');

// 하이브리드 익명화 서비스 초기화
const hybridService = new HybridAnonymizationService({
  openaiApiKey: process.env.OPENAI_API_KEY,
  clovaClientId: process.env.CLOVA_CLIENT_ID,
  clovaClientSecret: process.env.CLOVA_CLIENT_SECRET,
  defaultMethod: 'hybrid',
  minConfidence: 0.7,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 텍스트 비교 익명화 (rate limit은 server.js에서 적용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/text-compare', authenticateToken, express.json(), async (req, res) => {
  try {
    const { text, method = 'compare' } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: '텍스트가 비어있습니다.' });
    }
    if (text.length > 50000) {
      return res.status(400).json({ success: false, error: '텍스트가 너무 깁니다. 최대 50,000자까지 지원합니다.' });
    }

    const result = await hybridService.anonymize(text, { method });
    if (!result.success) throw new Error(result.error || '익명화 실패');

    res.json({
      success: true,
      method: result.method,
      originalText: text,
      anonymizedText: result.anonymized_text,
      mappings: result.mappings,
      stats: result.stats,
      performance: { processingTimeMs: result.processing_time_ms || 0, breakdown: result.breakdown || null },
      cost: result.cost_estimate || { usd: 0, krw: 0 },
      results: result.results || null,
      comparison: result.comparison || null,
      recommendation: result.recommendation || null,
    });
  } catch (error) {
    logger.error('텍스트 비교 오류', { error: error.message });
    res.status(500).json({ success: false, error: '텍스트 비교 중 오류가 발생했습니다.' });
  }
});

// 헬스체크
router.get('/health', async (req, res) => {
  try {
    const health = await hybridService.healthCheck();
    res.json({ success: true, ...health });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 문서 업로드 → 익명화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/document', authenticateToken, documentUpload.single('document'), async (req, res) => {
  let filePath = null;
  let logId = null;
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const authService = require('../services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);
    if (!userInfo.success || !userInfo.user.organization) {
      return res.status(400).json({ error: '기관 정보를 찾을 수 없습니다. 노인보호전문기관 소속 사용자만 이용 가능합니다.' });
    }

    const organizationId = userInfo.user.organization.id;
    const fileSizeKB = Math.round(req.file.size / 1024);
    const fileType = path.extname(req.file.originalname).replace('.', '').toLowerCase();
    filePath = req.file.path;

    // 할당량 확인
    try {
      const trackingStart = await usageTrackingService.startAnonymization(
        req.user.userId, organizationId, req.file.originalname, fileType, fileSizeKB
      );
      logId = trackingStart.logId;
    } catch (quotaError) {
      return res.status(429).json({ success: false, error: quotaError.message, errorCode: 'QUOTA_EXCEEDED' });
    }

    // 문서 파싱
    const parseResult = await documentParser.parse(filePath);
    const originalText = parseResult.text;

    // 익명화 처리
    const anonymizationMethod = req.body.method || 'hybrid';
    let anonymizationResult;
    try {
      anonymizationResult = await hybridService.anonymize(originalText, { method: anonymizationMethod, minConfidence: 0.7 });
      if (!anonymizationResult.success) throw new Error(anonymizationResult.error || '익명화 실패');
    } catch (aiError) {
      logger.warn('AI 익명화 실패, 룰 기반으로 폴백', { error: aiError.message });
      anonymizationService.reset();
      const fallbackResult = anonymizationService.anonymize(originalText);
      anonymizationResult = {
        success: true, method: 'rule_fallback',
        anonymized_text: fallbackResult.anonymizedText,
        mappings: fallbackResult.mappings || [],
        stats: {
          names: fallbackResult.mappings?.names?.length || 0,
          facilities: fallbackResult.mappings?.facilities?.length || 0,
          phones: fallbackResult.mappings?.phones?.length || 0,
          addresses: fallbackResult.mappings?.addresses?.length || 0,
          emails: fallbackResult.mappings?.emails?.length || 0,
          residentIds: fallbackResult.mappings?.residentIds?.length || 0,
        },
        processing_time_ms: 0, cost_estimate: { usd: 0, krw: 0 },
      };
    }

    // 사용 시간 기록
    const processingTimeSeconds = (Date.now() - startTime) / 1000;
    const usageResult = await usageTrackingService.completeAnonymization(logId, processingTimeSeconds, anonymizationResult.stats || {});

    res.json({
      success: true,
      method: anonymizationResult.method,
      originalText,
      anonymizedText: anonymizationResult.anonymized_text,
      mappings: anonymizationResult.mappings,
      stats: anonymizationResult.stats || {},
      metadata: parseResult.metadata,
      performance: { processingTimeMs: anonymizationResult.processing_time_ms || 0, breakdown: anonymizationResult.breakdown || null, sources: anonymizationResult.sources || null },
      cost: anonymizationResult.cost_estimate || { usd: 0, krw: 0 },
      usage: {
        processingTimeSeconds, processingMinutes: usageResult.processingMinutes,
        remainingHours: usageResult.remainingHours, usedHours: usageResult.usedHours, quotaHours: 10.0,
      },
      comparison: anonymizationResult.comparison || null,
      recommendation: anonymizationResult.recommendation || null,
    });
  } catch (error) {
    logger.error('문서 익명화 오류', { error: error.message });
    if (logId) {
      try { await usageTrackingService.failAnonymization(logId, error.message); } catch (_) { /* ignore */ }
    }
    res.status(500).json({ success: false, error: '문서 익명화 중 오류가 발생했습니다.' });
  } finally {
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
    }
  }
});

module.exports = router;
