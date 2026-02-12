/**
 * 보안 로깅 유틸리티
 * 민감한 정보를 마스킹하여 로깅
 */

/**
 * 민감한 정보 마스킹
 * @param {string} str - 원본 문자열
 * @param {string} type - 'email', 'phone', 'password', 'token'
 * @returns {string} - 마스킹된 문자열
 */
function maskSensitiveData(str, type = 'default') {
  if (!str) return '';
  
  switch (type) {
    case 'email':
      // example@domain.com -> e***e@d***.com
      const [local, domain] = str.split('@');
      if (!domain) return str;
      const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
      const [domainName, ext] = domain.split('.');
      const maskedDomain = domainName.charAt(0) + '***' + '.' + ext;
      return maskedLocal + '@' + maskedDomain;
      
    case 'phone':
      // 010-1234-5678 -> 010-****-5678
      return str.replace(/(\d{3})-?\d{4}-?(\d{4})/, '$1-****-$2');
      
    case 'password':
      // 완전히 마스킹
      return '********';
      
    case 'token':
      // JWT 토큰 앞 10자, 뒤 10자만 표시
      if (str.length > 20) {
        return str.substring(0, 10) + '...' + str.substring(str.length - 10);
      }
      return '***';
      
    case 'ip':
      // IP 주소 마지막 옥텟 마스킹
      return str.replace(/\.\d+$/, '.***');
      
    default:
      return str;
  }
}

/**
 * 객체 내 민감한 필드 마스킹
 * @param {Object} obj - 원본 객체
 * @returns {Object} - 마스킹된 객체
 */
function maskObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveFields = {
    password: 'password',
    email: 'email',
    oauth_email: 'email',
    phone: 'phone',
    token: 'token',
    access_token: 'token',
    refresh_token: 'token',
    api_key: 'token',
    secret: 'password',
    ip_address: 'ip'
  };
  
  const masked = { ...obj };
  
  for (const [key, value] of Object.entries(masked)) {
    if (sensitiveFields[key]) {
      masked[key] = maskSensitiveData(value, sensitiveFields[key]);
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskObject(value);
    }
  }
  
  return masked;
}

/**
 * 안전한 로그 출력
 * @param {string} level - 'info', 'warn', 'error'
 * @param {string} message - 로그 메시지
 * @param {Object} data - 추가 데이터
 */
function secureLog(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const maskedData = maskObject(data);
  
  const logEntry = {
    timestamp,
    level,
    message,
    data: maskedData
  };
  
  switch (level) {
    case 'error':
      console.error(`[${timestamp}] ❌ ${message}`, maskedData);
      break;
    case 'warn':
      console.warn(`[${timestamp}] ⚠️  ${message}`, maskedData);
      break;
    default:
      console.log(`[${timestamp}] ℹ️  ${message}`, maskedData);
  }
  
  return logEntry;
}

module.exports = {
  maskSensitiveData,
  maskObject,
  secureLog,
  info: (msg, data) => secureLog('info', msg, data),
  warn: (msg, data) => secureLog('warn', msg, data),
  error: (msg, data) => secureLog('error', msg, data)
};
