/**
 * 파일 업로드 관련 API
 * - Blob 업로드 (Vercel Blob)
 * - 청크 업로드 (대용량 파일 분할)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { del, put } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const { authenticateToken } = require('../middleware/auth');
const { audioUpload } = require('../config/multer');
const { logger } = require('../lib/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 서버 경유 Blob 업로드 (FormData → Vercel Blob)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/upload-blob', authenticateToken, audioUpload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const filePath = req.file.path;
    const safeFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname = `audio/${Date.now()}-${safeFilename}`;

    const fileBuffer = fs.readFileSync(filePath);
    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });

    fs.unlink(filePath, (err) => {
      if (err) logger.warn('임시 파일 삭제 실패', { filePath, error: err.message });
    });
    res.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    logger.error('Server blob upload error', { error: error.message });
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vercel Blob 클라이언트 업로드 토큰 발급
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/blob-upload', authenticateToken, async (req, res) => {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a',
          'audio/x-m4a', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm',
        ],
        maximumSizeInBytes: 100 * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        logger.info('Blob upload completed', { url: blob.url });
      },
    });
    res.json(jsonResponse);
  } catch (error) {
    logger.error('Blob upload error', { error: error.message });
    res.status(400).json({ error: '파일 업로드 처리 중 오류가 발생했습니다.' });
  }
});

// 서버사이드 Blob 업로드 (4.5MB 이하)
router.post('/blob-upload-server', authenticateToken, audioUpload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname = `audio/${Date.now()}-${safeFilename}`;
    const fileBuffer = fs.readFileSync(req.file.path);

    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });

    try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    res.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    logger.error('Blob server upload error', { error: error.message });
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// Blob 클라이언트 토큰 발급 (4.5MB 초과용)
router.post('/blob-token', authenticateToken, async (req, res) => {
  try {
    const { pathname } = req.body;
    if (!pathname) {
      return res.status(400).json({ error: 'pathname은 필수입니다.' });
    }
    const jsonResponse = await handleUpload({
      body: {
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          callbackUrl: `${req.protocol}://${req.get('host')}/api/blob-upload`,
        },
      },
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a',
          'audio/x-m4a', 'audio/mp4', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm',
        ],
        maximumSizeInBytes: 100 * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        logger.info('Blob upload completed', { url: blob.url });
      },
    });

    const blobApiUrl = process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob';
    res.json({ ...jsonResponse, uploadUrl: `${blobApiUrl}/${pathname}` });
  } catch (error) {
    logger.error('Blob token error', { error: error.message });
    res.status(500).json({ error: '업로드 토큰 발급 중 오류가 발생했습니다.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 청크 업로드 API (대용량 파일 분할)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
});

router.post('/upload-chunk', authenticateToken, chunkUpload.single('chunk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '청크 데이터가 없습니다.' });
    }
    const { uploadId, chunkIndex, totalChunks } = req.body;
    if (!uploadId || chunkIndex === undefined || !totalChunks) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }

    const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
    const idx = parseInt(chunkIndex, 10);
    const total = parseInt(totalChunks, 10);
    if (isNaN(idx) || idx < 0 || isNaN(total) || total <= 0 || total > 100) {
      return res.status(400).json({ error: '잘못된 청크 파라미터입니다.' });
    }

    const chunkDir = path.join(os.tmpdir(), `upload-${safeUploadId}`);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    const chunkPath = path.join(chunkDir, `chunk-${String(idx).padStart(5, '0')}`);
    fs.renameSync(req.file.path, chunkPath);

    res.json({ success: true, chunkIndex: idx });
  } catch (error) {
    logger.error('Chunk upload error', { error: error.message });
    res.status(500).json({ error: '청크 업로드 중 오류가 발생했습니다.' });
  }
});

router.post('/upload-chunk-complete', authenticateToken, async (req, res) => {
  try {
    const { uploadId, fileName } = req.body;
    if (!uploadId) {
      return res.status(400).json({ error: 'uploadId가 필요합니다.' });
    }

    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkDir = path.join(os.tmpdir(), `upload-${safeUploadId}`);
    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ error: '업로드 데이터를 찾을 수 없습니다.' });
    }

    const chunkFiles = fs.readdirSync(chunkDir).sort();
    const ext = path.extname(fileName || '.webm');
    const assembledPath = path.join(os.tmpdir(), `assembled-${safeUploadId}${ext}`);
    const writeStream = fs.createWriteStream(assembledPath);

    for (const chunkFile of chunkFiles) {
      const chunkData = fs.readFileSync(path.join(chunkDir, chunkFile));
      writeStream.write(chunkData);
    }
    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // 청크 디렉토리 정리
    for (const f of chunkFiles) {
      try { fs.unlinkSync(path.join(chunkDir, f)); } catch (_) { /* ignore */ }
    }
    try { fs.rmdirSync(chunkDir); } catch (_) { /* ignore */ }

    const fileSize = (fs.statSync(assembledPath).size / 1024 / 1024).toFixed(2);
    logger.info('Chunks assembled', { chunks: chunkFiles.length, sizeMB: fileSize });
    // 파일 경로 반환 (audio route에서 path traversal 검증됨)
    res.json({ success: true, filePath: assembledPath });
  } catch (error) {
    logger.error('Chunk complete error', { error: error.message });
    res.status(500).json({ error: '파일 조립 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
