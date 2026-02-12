/**
 * 입력 검증 유틸리티
 * XSS, SQL Injection 등 공격 방어
 */

/**
 * 이메일 형식 검증
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // RFC 5322 기본 패턴
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // 길이 제한 (최대 254자)
  if (email.length > 254) return false;
  
  return emailRegex.test(email);
}

/**
 * 비밀번호 강도 검증
 * - 최소 8자
 * - 영문, 숫자, 특수문자 중 2가지 이상 조합
 * @param {string} password
 * @returns {Object} { valid, message }
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: '비밀번호를 입력해주세요.' };
  }
  
  if (password.length < 8) {
    return { valid: false, message: '비밀번호는 8자 이상이어야 합니다.' };
  }
  
  if (password.length > 128) {
    return { valid: false, message: '비밀번호가 너무 깁니다.' };
  }
  
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const complexity = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  
  if (complexity < 2) {
    return { 
      valid: false, 
      message: '비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다.' 
    };
  }
  
  return { valid: true, message: '유효한 비밀번호입니다.' };
}

/**
 * 전화번호 형식 검증 (한국)
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  // 하이픈 제거
  const cleaned = phone.replace(/-/g, '');
  
  // 010, 011, 016, 017, 018, 019로 시작하는 11자리 또는
  // 02, 031-054, 061-064로 시작하는 지역번호
  const phoneRegex = /^(01[0-9]|02|0[3-6][0-9])\d{7,8}$/;
  
  return phoneRegex.test(cleaned);
}

/**
 * SQL Injection 패턴 검증
 * @param {string} input
 * @returns {boolean} - true면 안전, false면 위험
 */
function isSafeSqlInput(input) {
  if (!input || typeof input !== 'string') return true;
  
  // 위험한 SQL 패턴
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/)/,
    /('|(\\'))/,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i,
    /(\bUNION\b)/i
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * XSS 패턴 검증
 * @param {string} input
 * @returns {boolean} - true면 안전, false면 위험
 */
function isSafeXssInput(input) {
  if (!input || typeof input !== 'string') return true;
  
  // 위험한 HTML/JavaScript 패턴
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick, onerror 등
    /<embed[^>]*>/gi,
    /<object[^>]*>/gi
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * 파일명 안전성 검증
 * @param {string} filename
 * @returns {boolean}
 */
function isSafeFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  
  // 경로 탐색 공격 방지
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Null 바이트 공격 방지
  if (filename.includes('\0')) {
    return false;
  }
  
  // 파일명 길이 제한 (255자)
  if (filename.length > 255) {
    return false;
  }
  
  // 허용된 문자만 (영문, 숫자, 하이픈, 언더스코어, 점, 한글)
  const safePattern = /^[\w가-힣.-]+$/;
  
  return safePattern.test(filename);
}

/**
 * 입력 문자열 정제 (XSS 방어)
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return input;
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 포괄적 입력 검증
 * @param {Object} data - { field: value, ... }
 * @param {Object} rules - { field: 'email|required', ... }
 * @returns {Object} { valid, errors }
 */
function validate(data, rules) {
  const errors = {};
  
  for (const [field, ruleString] of Object.entries(rules)) {
    const ruleList = ruleString.split('|');
    const value = data[field];
    
    for (const rule of ruleList) {
      if (rule === 'required' && !value) {
        errors[field] = `${field}은(는) 필수 항목입니다.`;
        break;
      }
      
      if (rule === 'email' && value && !isValidEmail(value)) {
        errors[field] = '유효한 이메일 주소를 입력해주세요.';
        break;
      }
      
      if (rule === 'phone' && value && !isValidPhone(value)) {
        errors[field] = '유효한 전화번호를 입력해주세요.';
        break;
      }
      
      if (rule === 'password' && value) {
        const pwdCheck = isValidPassword(value);
        if (!pwdCheck.valid) {
          errors[field] = pwdCheck.message;
          break;
        }
      }
      
      if (rule.startsWith('min:')) {
        const min = parseInt(rule.split(':')[1]);
        if (value && value.length < min) {
          errors[field] = `${field}은(는) 최소 ${min}자 이상이어야 합니다.`;
          break;
        }
      }
      
      if (rule.startsWith('max:')) {
        const max = parseInt(rule.split(':')[1]);
        if (value && value.length > max) {
          errors[field] = `${field}은(는) 최대 ${max}자 이하여야 합니다.`;
          break;
        }
      }
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  isSafeSqlInput,
  isSafeXssInput,
  isSafeFilename,
  sanitizeInput,
  validate
};
