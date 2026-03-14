/**
 * 음성 파일 처리 API
 * - 오디오 분석 (비용 견적)
 * - 음성 업로드 → STT → AI 상담일지 생성
 * - SSE 스트리밍 음성 처리
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { del } = require('@vercel/blob');
const { authenticateToken } = require('../middleware/auth');
const { audioUpload } = require('../config/multer');
const aiService = require('../services/aiService');
const creditService = require('../services/creditService');
const { logger } = require('../lib/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API 키 검증 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let apiKeyValid = false;
let apiKeyChecked = false;

async function checkApiKey() {
  if (!apiKeyChecked) {
    apiKeyValid = await aiService.validateApiKey();
    apiKeyChecked = true;
    if (!apiKeyValid) {
      logger.warn('OpenAI API 키가 설정되지 않았거나 유효하지 않습니다. Mock 모드로 실행됩니다.');
    }
  }
  return apiKeyValid;
}

// Mock 상담일지 생성
function generateMockReport(consultationType) {
  const currentDate = new Date().toISOString().split('T')[0];
  return {
    기본정보: {
      상담일자: currentDate,
      상담유형: consultationType,
      상담원: '(자동입력 필요)',
      접수번호: `2025-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    },
    피해노인정보: { 성명: '(자동입력 필요)', 성별: '(자동입력 필요)', 연령: '(자동입력 필요)', 연락처: '(자동입력 필요)', 주소: '(자동입력 필요)' },
    행위자정보: { 성명: '(자동입력 필요)', 관계: '(자동입력 필요)', 연령: '(자동입력 필요)', 연락처: '(자동입력 필요)' },
    상담내용: { 신고경위: '(자동입력 필요)', 학대유형: '(자동입력 필요)', 학대내용: '(자동입력 필요)', 피해노인상태: '(자동입력 필요)', 현장상황: '(자동입력 필요)' },
    조치사항: { 즉시조치내용: '(자동입력 필요)', 연계기관: '(자동입력 필요)', 향후계획: '(자동입력 필요)' },
    특이사항: '(자동입력 필요)',
  };
}

// 오디오 길이 및 비용 계산 유틸
async function measureAudioDuration(audioFilePath) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioFilePath,
  ]);

  const durationSeconds = parseFloat(stdout.trim());
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const exchangeRate = 1320;
  const whisperPricePerMinute = 0.006;
  const whisperCostKRW = Math.ceil(durationMinutes * whisperPricePerMinute * exchangeRate);

  return {
    duration: {
      seconds: Math.floor(durationSeconds),
      minutes: durationMinutes,
      formatted: `${Math.floor(durationSeconds / 60)}분 ${Math.floor(durationSeconds % 60)}초`,
    },
    sttCost: whisperCostKRW,
    aiCost: 0,
    totalCost: whisperCostKRW,
    engine: 'OpenAI Whisper',
  };
}

// SSRF 방어: Vercel Blob URL 검증
function isAllowedBlobUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(url);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 오디오 분석 (비용 견적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/analyze-audio', authenticateToken, audioUpload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const audioFilePath = req.file.path;
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

    try {
      const cost = await measureAudioDuration(audioFilePath);
      const clovaCostKRW = Math.ceil(cost.duration.minutes * 0.02 * 1320);

      res.json({
        success: true,
        fileInfo: { filename: req.file.filename, originalName: req.file.originalname, sizeMB: parseFloat(fileSizeMB) },
        duration: cost.duration,
        costEstimate: {
          stt: {
            whisper: { pricePerMinute: 0.006, costKRW: cost.sttCost, engine: 'OpenAI Whisper (1순위)' },
            clova: { pricePerMinute: 0.02, costKRW: clovaCostKRW, engine: '네이버 Clova (2순위 폴백)' },
          },
          aiAnalysis: {
            best: { cost: 0, engine: 'Google Gemini 2.0 Flash (무료)' },
            worst: { cost: 12, engine: 'OpenAI GPT-4o-mini (폴백)' },
          },
          total: { best: cost.sttCost, worst: cost.sttCost + 12, average: Math.ceil((cost.sttCost * 2 + 12) / 2) },
        },
        message: `이 녹음 파일은 ${cost.duration.minutes}분 분량으로 약 ${cost.sttCost}~${cost.sttCost + 12}원의 요금이 예상됩니다.`,
      });
    } catch (err) {
      // ffprobe 실패 시 파일 크기로 추정
      const estimatedMinutes = Math.ceil(fileSizeMB / 0.5);
      const estimatedCost = Math.ceil(estimatedMinutes * 0.006 * 1320);
      res.json({
        success: true,
        fileInfo: { filename: req.file.filename, originalName: req.file.originalname, sizeMB: parseFloat(fileSizeMB) },
        duration: { minutes: estimatedMinutes, formatted: `약 ${estimatedMinutes}분 (추정)`, note: '정확한 길이를 측정할 수 없어 파일 크기로 추정했습니다.' },
        costEstimate: { total: { best: estimatedCost, worst: estimatedCost + 12, average: estimatedCost + 6 } },
        message: `이 녹음 파일은 약 ${estimatedMinutes}분 분량으로 약 ${estimatedCost}~${estimatedCost + 12}원의 요금이 예상됩니다.`,
      });
    }
  } catch (error) {
    logger.error('파일 분석 오류', { error: error.message });
    res.status(500).json({ success: false, error: '파일 분석 중 오류가 발생했습니다.' });
  } finally {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 음성 업로드 → STT → 상담일지 생성 (통합)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/upload-audio', authenticateToken, (req, res, next) => {
  if (req.headers['content-type']?.includes('application/json')) {
    next();
  } else {
    audioUpload.single('audioFile')(req, res, next);
  }
}, async (req, res) => {
  let audioFilePath = null;
  let blobUrl = null;

  try {
    const { consultationType, consultationStage, sttEngine } = req.body;
    blobUrl = req.body.blobUrl;

    if (blobUrl) {
      if (!isAllowedBlobUrl(blobUrl)) {
        return res.status(400).json({ error: '허용되지 않는 Blob URL입니다.' });
      }
      const tmpFilename = `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      audioFilePath = path.join(os.tmpdir(), tmpFilename);
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error('Blob 파일 다운로드 실패');
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(audioFilePath, buffer);
    } else if (req.file) {
      audioFilePath = req.file.path;
    } else {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const selectedEngine = sttEngine || 'openai';
    const isApiKeyValid = await checkApiKey();

    let report;
    if (isApiKeyValid) {
      try {
        const startTime = Date.now();
        let actualCost = null;
        try {
          actualCost = await measureAudioDuration(audioFilePath);
        } catch (_) { /* ffprobe 없을 수 있음 */ }

        report = await aiService.processAudioToCounselingReport(audioFilePath, consultationType, consultationStage);
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

        let creditResult = null;
        if (req.user && actualCost) {
          try {
            creditResult = await creditService.deduct(
              req.user.userId, actualCost.totalCost,
              actualCost.duration.seconds / 60, consultationType,
              selectedEngine === 'clova' ? 'clova' : 'whisper', 'gemini'
            );
          } catch (creditError) {
            logger.error('크레딧 차감 실패', { error: creditError.message });
          }
        }

        res.json({
          success: true, mode: 'ai', report,
          processingTime: `${processingTime}초`, actualCost, creditInfo: creditResult,
          message: '상담일지가 성공적으로 생성되었습니다.',
        });
      } catch (error) {
        logger.error('AI 처리 오류', { error: error.message });
        let userMessage = '음성 파일 처리 중 오류가 발생했습니다.';
        if (error.message.includes('502') || error.message.includes('503')) userMessage = 'OpenAI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
        else if (error.message.includes('timeout')) userMessage = '처리 시간이 너무 오래 걸립니다. 더 짧은 음성 파일을 사용해주세요.';
        else if (error.message.includes('401')) userMessage = 'API 키가 유효하지 않습니다. 관리자에게 문의하세요.';
        else if (error.message.includes('429')) userMessage = 'API 사용량 한도를 초과했습니다. 관리자에게 문의하세요.';
        res.status(500).json({ success: false, error: userMessage, message: '처리 실패. 다시 시도해주세요.' });
      }
    } else {
      report = generateMockReport(consultationType);
      res.json({
        success: true, mode: 'mock', report,
        warning: 'OpenAI API 키가 설정되지 않아 기본 양식을 제공합니다.',
        message: '기본 상담일지 양식이 생성되었습니다.',
      });
    }

    // 임시 파일 및 Blob 정리
    if (audioFilePath) { try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ } }
    if (blobUrl) { try { await del(blobUrl); } catch (_) { /* ignore */ } }
  } catch (error) {
    logger.error('업로드 오류', { error: error.message });
    if (audioFilePath) { try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ } }
    if (blobUrl) { try { await del(blobUrl); } catch (_) { /* ignore */ } }
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSE 스트리밍 음성 처리 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/upload-audio-stream', authenticateToken, (req, res, next) => {
  if (req.headers['content-type']?.includes('application/json')) {
    next();
  } else {
    audioUpload.single('audioFile')(req, res, next);
  }
}, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let audioFilePath = null;
  let blobUrl = null;
  let isChunkedFile = false;

  try {
    const { consultationType, consultationStage, sttEngine } = req.body;
    blobUrl = req.body.blobUrl;
    const serverFilePath = req.body.serverFilePath;

    if (serverFilePath) {
      const resolvedPath = path.resolve(serverFilePath);
      const tmpDir = path.resolve(os.tmpdir());
      const relative = path.relative(tmpDir, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        sendEvent('error', { message: '잘못된 파일 경로입니다.' });
        res.end();
        return;
      }
      if (!fs.existsSync(resolvedPath)) {
        sendEvent('error', { message: '업로드된 파일을 찾을 수 없습니다.' });
        res.end();
        return;
      }
      audioFilePath = resolvedPath;
      isChunkedFile = true;
      sendEvent('progress', { stage: 'upload_done', percent: 20, message: '파일 업로드 완료' });
    } else if (req.file) {
      audioFilePath = req.file.path;
      sendEvent('progress', { stage: 'upload_done', percent: 20, message: '파일 업로드 완료' });
    } else if (blobUrl) {
      if (!isAllowedBlobUrl(blobUrl)) {
        sendEvent('error', { message: '허용되지 않는 Blob URL입니다.' });
        res.end();
        return;
      }
      sendEvent('progress', { stage: 'download', percent: 10, message: '음성 파일 다운로드 중...' });
      const tmpFilename = `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      audioFilePath = path.join(os.tmpdir(), tmpFilename);
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error('Blob 파일 다운로드 실패');
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(audioFilePath, buffer);
      sendEvent('progress', { stage: 'download_done', percent: 20, message: `파일 다운로드 완료 (${(buffer.length / 1024 / 1024).toFixed(2)}MB)` });
    } else {
      sendEvent('error', { message: '파일이 업로드되지 않았습니다.' });
      res.end();
      return;
    }

    const isApiKeyValid = await checkApiKey();
    if (!isApiKeyValid) {
      sendEvent('progress', { stage: 'mock', percent: 50, message: 'Mock 모드: 기본 양식 생성 중...' });
      sendEvent('complete', {
        success: true, mode: 'mock', report: generateMockReport(consultationType),
        warning: 'OpenAI API 키가 설정되지 않아 기본 양식을 제공합니다.',
      });
      res.end();
      return;
    }

    // 비용 계산
    const startTime = Date.now();
    let actualCost = null;
    try { actualCost = await measureAudioDuration(audioFilePath); } catch (_) { /* ffprobe 없음 */ }

    const report = await aiService.processAudioWithProgress(
      audioFilePath, consultationType, consultationStage,
      (stage, percent, message) => sendEvent('progress', { stage, percent, message })
    );

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

    let creditResult = null;
    if (req.user && actualCost) {
      try {
        creditResult = await creditService.deduct(
          req.user.userId, actualCost.totalCost,
          actualCost.duration.seconds / 60, consultationType,
          sttEngine === 'clova' ? 'clova' : 'whisper', 'gemini'
        );
      } catch (creditError) {
        logger.error('크레딧 차감 실패', { error: creditError.message });
      }
    }

    sendEvent('complete', {
      success: true, mode: 'ai', report,
      processingTime: `${processingTime}초`, actualCost, creditInfo: creditResult,
      message: '상담일지가 성공적으로 생성되었습니다.',
    });
  } catch (error) {
    logger.error('SSE 처리 오류', { error: error.message });
    sendEvent('error', { message: error.message || '처리 중 오류가 발생했습니다.' });
  } finally {
    if (audioFilePath) { try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ } }
    if (blobUrl) { try { await del(blobUrl); } catch (_) { /* ignore */ } }
    res.end();
  }
});

// API 상태 확인
router.get('/status', async (req, res) => {
  const isValid = await checkApiKey();
  const { getDB } = require('../database/db-postgres');
  const db = getDB();
  const dbHealthy = await db.healthCheck();
  const poolStatus = db.getPoolStatus();

  res.json({
    status: 'running',
    apiKeyConfigured: isValid,
    mode: isValid ? 'production' : 'mock',
    database: { healthy: dbHealthy, pool: poolStatus }
  });
});

module.exports = router;
module.exports.checkApiKey = checkApiKey;
