/**
 * Multer 파일 업로드 설정
 * - 음성 파일 업로드 (audioUpload)
 * - 문서 파일 업로드 (documentUpload)
 */

const multer = require('multer');
const path = require('path');
const os = require('os');

// 공통: 파일명 보안 검증
function validateFilename(basename) {
  return !basename.includes('..') && !basename.includes('/') && !basename.includes('\\');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 음성 파일 업로드 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeExtname = path.extname(path.basename(file.originalname));
    cb(null, file.fieldname + '-' + uniqueSuffix + safeExtname);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const basename = path.basename(file.originalname);
    if (!validateFilename(basename)) {
      return cb(new Error('잘못된 파일명입니다.'));
    }
    const allowedTypes = /^\.(mp3|wav|m4a|ogg|webm|mp4)$/i;
    const allowedMimes = [
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
      'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm',
    ];
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedMimes.includes(file.mimetype);
    if (mimeOk && extOk) return cb(null, true);
    cb(new Error('음성 파일만 업로드 가능합니다 (mp3, wav, m4a, ogg, webm, mp4)'));
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 문서 파일 업로드 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeExtname = path.extname(path.basename(file.originalname));
    cb(null, 'doc-' + uniqueSuffix + safeExtname);
  },
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const basename = path.basename(file.originalname);
    if (!validateFilename(basename)) {
      return cb(new Error('잘못된 파일명입니다.'));
    }
    const allowedTypes = /^\.(docx|pdf|txt)$/i;
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf', 'text/plain',
    ];
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedMimes.includes(file.mimetype);
    if (mimeOk && extOk) return cb(null, true);
    cb(new Error('문서 파일만 업로드 가능합니다 (DOCX, PDF, TXT)'));
  },
});

module.exports = { audioUpload, documentUpload };
