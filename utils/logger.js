/**
 * Winston 로깅 시스템
 * - 레벨별 로그 관리
 * - 파일 및 콘솔 출력
 * - 프로덕션 환경 최적화
 */

const winston = require('winston');
const path = require('path');

// 로그 레벨 정의
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 환경별 로그 레벨 설정
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// 로그 색상 정의
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// 로그 포맷 정의
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 콘솔 출력 포맷 (개발 환경용)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// 트랜스포트 설정
const transports = [
  // 콘솔 출력
  new winston.transports.Console({
    format: consoleFormat,
  }),
  
  // 에러 로그 파일 (프로덕션에서만)
  ...(process.env.NODE_ENV === 'production' ? [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // 전체 로그 파일
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      format,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ] : []),
];

// Winston 로거 생성
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  // 처리되지 않은 예외 로깅
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  // 처리되지 않은 Promise rejection 로깅
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/rejections.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// 개인정보 마스킹 헬퍼 함수
function maskSensitiveData(data) {
  if (typeof data !== 'object' || data === null) return data;
  
  const sensitiveKeys = ['password', 'password_hash', 'token', 'apiKey', 'api_key', 'secret'];
  const masked = { ...data };
  
  Object.keys(masked).forEach(key => {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    }
  });
  
  return masked;
}

// 편의 메서드 추가
logger.logRequest = (req) => {
  logger.http(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
};

logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    context: maskSensitiveData(context),
  });
};

logger.logAuth = (userId, action, success = true) => {
  logger.info(`Auth: ${action}`, {
    userId,
    action,
    success,
    timestamp: new Date().toISOString(),
  });
};

logger.logCredit = (userId, action, amount, balance) => {
  logger.info(`Credit: ${action}`, {
    userId,
    action,
    amount,
    balance,
    timestamp: new Date().toISOString(),
  });
};

module.exports = logger;
