/**
 * 통합 입력 검증 미들웨어
 * - parseInt NaN 검증 (보고서 High 이슈 22개 대응)
 * - 필수 필드 검증
 * - 문자열 정제 (XSS 기본 방어)
 * 
 * 사용법:
 *   const { validateBody, validateQuery, validateParams, safeParseInt } = require('./middleware/validation');
 *   
 *   router.post('/api/users', validateBody(['email', 'name']), handler);
 *   router.get('/api/users', validateQuery({ page: 'number', limit: 'number' }), handler);
 * 
 * @module middleware/validation
 */

/**
 * 안전한 정수 파싱 (NaN 방지)
 * parseInt 결과가 NaN인 경우 기본값을 반환합니다.
 * 
 * @param {*} value - 파싱할 값
 * @param {number} defaultValue - 기본값
 * @param {Object} [options] - 옵션
 * @param {number} [options.min] - 최솟값
 * @param {number} [options.max] - 최댓값
 * @returns {number} 파싱된 정수 또는 기본값
 */
function safeParseInt(value, defaultValue = 0, options = {}) {
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    return defaultValue;
  }
  
  if (options.min !== undefined && parsed < options.min) {
    return options.min;
  }
  
  if (options.max !== undefined && parsed > options.max) {
    return options.max;
  }
  
  return parsed;
}

/**
 * 안전한 실수 파싱 (NaN 방지)
 * @param {*} value - 파싱할 값
 * @param {number} defaultValue - 기본값
 * @returns {number} 파싱된 실수 또는 기본값
 */
function safeParseFloat(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * HTML 특수문자 이스케이프 (XSS 기본 방어)
 * @param {string} str - 입력 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * req.body 필수 필드 검증 미들웨어
 * @param {string[]} requiredFields - 필수 필드 이름 배열
 * @returns {Function} Express 미들웨어
 * 
 * @example
 *   router.post('/login', validateBody(['email', 'password']), loginHandler);
 */
function validateBody(requiredFields) {
  return (req, res, next) => {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: '요청 본문이 비어있습니다.',
        errorCode: 'MISSING_BODY'
      });
    }
    
    const missing = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `필수 항목이 누락되었습니다: ${missing.join(', ')}`,
        errorCode: 'MISSING_FIELDS',
        missingFields: missing
      });
    }
    
    next();
  };
}

/**
 * req.query 파라미터 타입 검증 미들웨어
 * @param {Object} schema - { fieldName: 'number' | 'string' | 'boolean' }
 * @returns {Function} Express 미들웨어
 * 
 * @example
 *   router.get('/users', validateQuery({ page: 'number', limit: 'number' }), handler);
 */
function validateQuery(schema) {
  return (req, res, next) => {
    for (const [field, type] of Object.entries(schema)) {
      const value = req.query[field];
      
      if (value === undefined) continue; // 선택 파라미터는 건너뜀
      
      if (type === 'number') {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          return res.status(400).json({
            success: false,
            error: `'${field}' 파라미터는 유효한 숫자여야 합니다.`,
            errorCode: 'INVALID_PARAM_TYPE'
          });
        }
        req.query[field] = parsed; // 파싱된 값으로 교체
      }
      
      if (type === 'boolean') {
        req.query[field] = value === 'true' || value === '1';
      }
    }
    
    next();
  };
}

/**
 * req.params 필수 검증 미들웨어
 * @param {string[]} requiredParams - 필수 파라미터 이름 배열
 * @returns {Function} Express 미들웨어
 */
function validateParams(requiredParams) {
  return (req, res, next) => {
    const missing = requiredParams.filter(param => {
      const value = req.params[param];
      return !value || value.trim() === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `필수 URL 파라미터가 누락되었습니다: ${missing.join(', ')}`,
        errorCode: 'MISSING_PARAMS'
      });
    }
    
    next();
  };
}

/**
 * 연도 검증 유틸리티
 * @param {*} value - 검증할 연도 값
 * @param {number} [defaultYear] - 기본 연도 (미지정 시 현재 연도)
 * @returns {number} 유효한 연도
 */
function safeYear(value, defaultYear) {
  const currentYear = new Date().getFullYear();
  const year = safeParseInt(value, defaultYear || currentYear);
  
  if (year < 2000 || year > currentYear + 5) {
    return defaultYear || currentYear;
  }
  
  return year;
}

/**
 * 월 검증 유틸리티
 * @param {*} value - 검증할 월 값
 * @param {number} [defaultMonth] - 기본 월 (미지정 시 현재 월)
 * @returns {number} 유효한 월 (1-12)
 */
function safeMonth(value, defaultMonth) {
  const currentMonth = new Date().getMonth() + 1;
  return safeParseInt(value, defaultMonth || currentMonth, { min: 1, max: 12 });
}

module.exports = {
  safeParseInt,
  safeParseFloat,
  escapeHtml,
  validateBody,
  validateQuery,
  validateParams,
  safeYear,
  safeMonth
};
