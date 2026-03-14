/**
 * 구조적 로깅 시스템 (Winston 기반)
 * - JSON 포맷 (프로덕션) / 읽기 쉬운 포맷 (개발)
 * - 요청 ID 추적
 * - 민감 정보 자동 마스킹
 */

const winston = require('winston');
const crypto = require('crypto');

// 민감 정보 마스킹
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie', 'creditCard'];
const SENSITIVE_PATTERNS = [
  { regex: /\b\d{6}-?\d{7}\b/g, replacement: '******-*******' }, // 주민번호
  { regex: /\b01[016789]-?\d{3,4}-?\d{4}\b/g, replacement: '010-****-****' }, // 전화번호
];

function maskSensitiveData(obj) {
  if (typeof obj === 'string') {
    let masked = obj;
    SENSITIVE_PATTERNS.forEach(({ regex, replacement }) => {
      masked = masked.replace(regex, replacement);
    });
    return masked;
  }
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(maskSensitiveData);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = maskSensitiveData(value);
    }
  }
  return result;
}

// 로그 포맷 정의
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqTag = requestId ? `[${requestId}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(maskSensitiveData(meta))}` : '';
    return `${timestamp} ${level}: ${reqTag}${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json({
    replacer: (key, value) => {
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) return '***REDACTED***';
      return value;
    },
  })
);

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'casenetai' },
  transports: [new winston.transports.Console()],
});

// 요청 ID 생성
function generateRequestId() {
  return crypto.randomBytes(4).toString('hex');
}

// Express 미들웨어: 요청 로깅 + 요청 ID 부여
function requestLogger(req, res, next) {
  req.requestId = req.headers['x-request-id'] || generateRequestId();
  req.log = logger.child({ requestId: req.requestId });

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (res.statusCode >= 500) {
      req.log.error('요청 처리 실패', logData);
    } else if (res.statusCode >= 400) {
      req.log.warn('클라이언트 오류', logData);
    } else if (duration > 3000) {
      req.log.warn('느린 응답', logData);
    } else {
      req.log.info('요청 처리 완료', logData);
    }
  });

  next();
}

module.exports = { logger, requestLogger, generateRequestId, maskSensitiveData };
