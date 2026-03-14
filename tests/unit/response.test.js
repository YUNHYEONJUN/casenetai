/**
 * API 응답 헬퍼 + 에러 클래스 테스트
 */

const { success, created, paginated, error, errorHandler } = require('../../lib/response');
const { AppError, ValidationError, NotFoundError, QuotaExceededError } = require('../../lib/errors');

// Express res 모킹
function createMockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    status: jest.fn(function (code) { this.statusCode = code; return this; }),
    json: jest.fn(function (data) { this._json = data; return this; }),
  };
  return res;
}

describe('Response 헬퍼', () => {
  describe('success', () => {
    it('기본 성공 응답을 반환한다', () => {
      const res = createMockRes();
      success(res, { id: 1, name: '테스트' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._json).toEqual({
        success: true,
        data: { id: 1, name: '테스트' },
      });
    });

    it('데이터 없이 성공 응답을 반환한다', () => {
      const res = createMockRes();
      success(res);

      expect(res._json).toEqual({ success: true });
    });
  });

  describe('created', () => {
    it('201 상태코드로 응답한다', () => {
      const res = createMockRes();
      created(res, { id: 42 });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._json.data.id).toBe(42);
    });
  });

  describe('paginated', () => {
    it('페이지네이션 메타 정보를 포함한다', () => {
      const res = createMockRes();
      paginated(res, { items: [{ id: 1 }, { id: 2 }], total: 50, page: 3, limit: 10 });

      expect(res._json).toEqual({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        meta: { total: 50, page: 3, limit: 10, totalPages: 5 },
      });
    });
  });

  describe('error', () => {
    it('에러 응답을 반환한다', () => {
      const res = createMockRes();
      error(res, 400, '유효하지 않은 입력', 'VALIDATION_ERROR', 'email');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json).toEqual({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '유효하지 않은 입력', field: 'email' },
      });
    });
  });
});

describe('에러 클래스', () => {
  it('AppError는 isOperational=true', () => {
    const err = new AppError('테스트', 500, 'TEST');
    expect(err.isOperational).toBe(true);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TEST');
  });

  it('ValidationError는 400 코드', () => {
    const err = new ValidationError('필수 항목 누락', 'name');
    expect(err.statusCode).toBe(400);
    expect(err.field).toBe('name');
  });

  it('NotFoundError는 404 코드', () => {
    const err = new NotFoundError('사용자');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('사용자');
  });

  it('QuotaExceededError는 429 코드', () => {
    const err = new QuotaExceededError();
    expect(err.statusCode).toBe(429);
  });
});

describe('errorHandler 미들웨어', () => {
  it('운영 에러는 클라이언트에 코드/메시지를 전달한다', () => {
    const res = createMockRes();
    const req = { log: { warn: jest.fn() } };
    const err = new ValidationError('이름은 필수입니다', 'name');

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._json.error.code).toBe('VALIDATION_ERROR');
  });

  it('프로그래밍 에러는 500 + 제네릭 메시지 (프로덕션)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = createMockRes();
    const req = { log: { error: jest.fn() } };
    const err = new Error('Cannot read property of undefined');

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res._json.error.message).toBe('서버 내부 오류가 발생했습니다');

    process.env.NODE_ENV = originalEnv;
  });
});
