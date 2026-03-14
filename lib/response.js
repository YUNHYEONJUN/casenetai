/**
 * API 응답 표준화 헬퍼
 *
 * 모든 API 응답을 일관된 포맷으로 반환:
 *   성공: { success: true, data: {...}, meta?: {...} }
 *   실패: { success: false, error: { code, message, field? } }
 */

/**
 * 성공 응답
 */
function success(res, data = null, statusCode = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
}

/**
 * 생성 성공 응답 (201)
 */
function created(res, data = null) {
  return success(res, data, 201);
}

/**
 * 페이지네이션 응답
 */
function paginated(res, { items, total, page, limit }) {
  return res.status(200).json({
    success: true,
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * 에러 응답
 */
function error(res, statusCode, message, code = 'ERROR', field = null) {
  const body = {
    success: false,
    error: { code, message },
  };
  if (field) body.error.field = field;
  return res.status(statusCode).json(body);
}

/**
 * 전역 에러 핸들러 미들웨어
 * - AppError: 운영 에러 → 클라이언트에 코드/메시지 전달
 * - 기타 에러: 프로그래밍 버그 → 500 + 제네릭 메시지
 */
function errorHandler(err, req, res, _next) {
  if (res.headersSent) return _next(err);
  const log = req.log || console;

  if (err.isOperational) {
    // 예측 가능한 운영 에러
    log.warn('운영 에러', { code: err.code, message: err.message, statusCode: err.statusCode });
    return error(res, err.statusCode, err.message, err.code, err.field);
  }

  // 예측하지 못한 에러 (버그)
  log.error('예상치 못한 에러', { message: err.message, stack: err.stack });

  const isProduction = process.env.NODE_ENV === 'production';
  return error(
    res,
    500,
    isProduction ? '서버 내부 오류가 발생했습니다' : err.message,
    'INTERNAL_ERROR'
  );
}

module.exports = { success, created, paginated, error, errorHandler };
