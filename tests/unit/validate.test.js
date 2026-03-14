/**
 * Zod 검증 미들웨어 테스트
 */

const { z } = require('zod');
const { validate, paginationQuery, idParam } = require('../../middleware/validate');

function createMockReqRes(overrides = {}) {
  const req = { body: {}, query: {}, params: {}, ...overrides };
  const res = {
    statusCode: 200,
    _json: null,
    status: jest.fn(function (code) { this.statusCode = code; return this; }),
    json: jest.fn(function (data) { this._json = data; return this; }),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('validate 미들웨어', () => {
  it('유효한 요청은 통과시킨다', () => {
    const schema = z.object({
      body: z.object({ name: z.string().min(1) }),
    });

    const { req, res, next } = createMockReqRes({ body: { name: '홍길동' } });
    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.name).toBe('홍길동');
  });

  it('유효하지 않은 요청은 400 에러를 반환한다', () => {
    const schema = z.object({
      body: z.object({ name: z.string().min(1, '이름은 필수입니다') }),
    });

    const { req, res, next } = createMockReqRes({ body: { name: '' } });
    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._json.error.code).toBe('VALIDATION_ERROR');
  });

  it('기본값이 적용된다', () => {
    const schema = z.object({
      query: paginationQuery,
    });

    const { req, res, next } = createMockReqRes({ query: {} });
    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query.page).toBe(1);
    expect(req.query.limit).toBe(20);
  });

  it('limit 최대값(100)을 초과하면 에러를 반환한다', () => {
    const schema = z.object({
      query: paginationQuery,
    });

    const { req, res, next } = createMockReqRes({ query: { limit: '200' } });
    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('문자열 숫자를 자동 변환한다 (coerce)', () => {
    const schema = z.object({
      params: idParam,
    });

    const { req, res, next } = createMockReqRes({ params: { id: '42' } });
    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.params.id).toBe(42);
  });
});
