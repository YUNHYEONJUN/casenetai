/**
 * 커스텀 에러 클래스
 * - HTTP 상태 코드 + 에러 코드 + 메시지 표준화
 * - 운영 에러(예측 가능)와 프로그래밍 에러(버그) 구분
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 예측 가능한 운영 에러
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = '인증이 필요합니다') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = '접근 권한이 없습니다') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = '리소스') {
    super(`${resource}을(를) 찾을 수 없습니다`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

class QuotaExceededError extends AppError {
  constructor(message = '할당량을 초과했습니다') {
    super(message, 429, 'QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  QuotaExceededError,
};
