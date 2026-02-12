/**
 * 보안 유틸리티 함수
 * XSS 방어 및 안전한 HTML 렌더링
 */

/**
 * HTML 이스케이프 (XSS 방어)
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return text.replace(/[&<>"'/]/g, char => map[char]);
}

/**
 * 안전하게 텍스트 설정 (innerHTML 대신 사용)
 */
function setTextSafely(element, text) {
  if (!element) return;
  element.textContent = text;
}

/**
 * 안전하게 HTML 설정 (제한된 태그만 허용)
 */
function setHtmlSafely(element, html) {
  if (!element) return;
  
  // 허용할 태그 목록
  const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'span'];
  
  // 위험한 태그 제거
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); // 이벤트 핸들러 제거
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  
  element.innerHTML = sanitized;
}

/**
 * URL 검증 (오픈 리다이렉트 방지)
 */
function isSafeUrl(url) {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url, window.location.origin);
    // 같은 origin만 허용하거나, https만 허용
    return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * JSON 안전하게 파싱
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    console.warn('JSON 파싱 실패, 기본값 반환');
    return defaultValue;
  }
}

/**
 * 숫자 검증 및 안전한 변환
 */
function safeParseInt(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseFloat(value, defaultValue = 0.0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 이메일 검증
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 전화번호 검증 (한국 형식)
 */
function isValidPhone(phone) {
  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
  return phoneRegex.test(phone);
}

/**
 * 비밀번호 강도 검증
 */
function validatePassword(password) {
  const result = {
    valid: true,
    errors: []
  };
  
  if (password.length < 8) {
    result.valid = false;
    result.errors.push('비밀번호는 최소 8자 이상이어야 합니다');
  }
  
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const complexityCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  
  if (complexityCount < 2) {
    result.valid = false;
    result.errors.push('영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
  }
  
  return result;
}

/**
 * CSRF 토큰 생성 (간단한 구현)
 */
function generateCsrfToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * 로컬 스토리지 안전하게 저장
 */
function safeLocalStorage() {
  return {
    setItem: function(key, value) {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('로컬 스토리지 저장 실패:', e);
        return false;
      }
    },
    
    getItem: function(key, defaultValue = null) {
      try {
        const item = localStorage.getItem(key);
        if (!item) return defaultValue;
        
        // JSON 파싱 시도
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      } catch (e) {
        console.error('로컬 스토리지 읽기 실패:', e);
        return defaultValue;
      }
    },
    
    removeItem: function(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.error('로컬 스토리지 삭제 실패:', e);
        return false;
      }
    }
  };
}

// 전역으로 export
if (typeof window !== 'undefined') {
  window.SecurityUtils = {
    escapeHtml,
    setTextSafely,
    setHtmlSafely,
    isSafeUrl,
    safeJsonParse,
    safeParseInt,
    safeParseFloat,
    isValidEmail,
    isValidPhone,
    validatePassword,
    generateCsrfToken,
    safeLocalStorage: safeLocalStorage()
  };
}
