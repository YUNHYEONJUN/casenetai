/**
 * API 응답 표준화 유틸리티
 * 모든 API 엔드포인트에서 일관된 응답 형식을 보장합니다.
 * 
 * @module utils/response
 */

/**
 * 성공 응답 생성
 * @param {Object} data - 응답 데이터
 * @param {string} [message] - 사용자 메시지
 * @returns {Object} 표준화된 성공 응답
 */
function successResponse(data, message) {
  const response = {
    success: true,
    timestamp: new Date().toISOString()
  };

  if (data !== undefined && data !== null) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  return response;
}

/**
 * 에러 응답 생성
 * @param {string} error - 사용자 친화적 에러 메시지
 * @param {string} [errorCode] - 에러 코드 (프론트엔드 분기용)
 * @param {Object} [details] - 추가 에러 상세 (개발 환경에서만 포함)
 * @returns {Object} 표준화된 에러 응답
 */
function errorResponse(error, errorCode, details) {
  const response = {
    success: false,
    error: error,
    timestamp: new Date().toISOString()
  };

  if (errorCode) {
    response.errorCode = errorCode;
  }

  // 프로덕션 환경에서는 상세 에러 정보 미포함
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }

  return response;
}

/**
 * 페이지네이션 응답 생성
 * @param {Array} items - 목록 데이터
 * @param {number} total - 전체 개수
 * @param {number} page - 현재 페이지
 * @param {number} limit - 페이지 크기
 * @returns {Object} 표준화된 페이지네이션 응답
 */
function paginatedResponse(items, total, page, limit) {
  return {
    success: true,
    data: items,
    pagination: {
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse
};
