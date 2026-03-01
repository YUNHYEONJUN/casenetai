/**
 * 구조화된 로깅 유틸리티
 * 환경별(development/production) 로그 레벨 자동 분리
 * 
 * 사용법:
 *   const logger = require('./utils/logger');
 *   logger.info('사용자 로그인', { userId: 'abc123', ip: '1.2.3.4' });
 *   logger.error('DB 연결 실패', { error: err.message });
 *   logger.debug('상세 디버그 정보', { query: sql }); // production에서 미출력
 * 
 * @module utils/logger
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// 환경별 최소 로그 레벨 설정
const currentLevel = process.env.NODE_ENV === 'production' 
  ? LOG_LEVELS.info  // 프로덕션: error, warn, info만
  : LOG_LEVELS.debug; // 개발: 모두 출력

/**
 * 민감 정보 마스킹 처리
 * @param {Object} data - 로그 데이터
 * @returns {Object} 마스킹된 데이터
 */
function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const masked = { ...data };
  const sensitiveKeys = [
    'password', 'password_hash', 'token', 'secret', 'apiKey', 'api_key',
    'authorization', 'cookie', 'ssn', 'resident_id', 'account_number',
    'credit_card', 'phone', 'email'
  ];
  
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      masked[key] = '***MASKED***';
    }
  }
  
  return masked;
}

/**
 * 로그 포맷 생성
 * @param {string} level - 로그 레벨
 * @param {string} message - 메시지
 * @param {Object} [meta] - 추가 메타데이터
 * @returns {string} 포맷된 로그 문자열
 */
function formatLog(level, message, meta) {
  const timestamp = new Date().toISOString();
  const prefix = {
    error: '❌',
    warn: '⚠️ ',
    info: '✅',
    debug: '🔍'
  }[level] || '';
  
  let logStr = `[${timestamp}] ${prefix} [${level.toUpperCase()}] ${message}`;
  
  if (meta && Object.keys(meta).length > 0) {
    const safeMeta = maskSensitiveData(meta);
    logStr += ` | ${JSON.stringify(safeMeta)}`;
  }
  
  return logStr;
}

const logger = {
  error(message, meta) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatLog('error', message, meta));
    }
  },
  
  warn(message, meta) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatLog('warn', message, meta));
    }
  },
  
  info(message, meta) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatLog('info', message, meta));
    }
  },
  
  debug(message, meta) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatLog('debug', message, meta));
    }
  },

  /**
   * 요청 로깅 미들웨어 (Express)
   * 사용법: app.use(logger.requestLogger);
   */
  requestLogger(req, res, next) {
    if (process.env.NODE_ENV === 'production' && req.path === '/api/status') {
      return next(); // 헬스체크는 프로덕션에서 로깅 스킵
    }
    
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level](`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
    });
    
    next();
  }
};

module.exports = logger;
