/**
 * Zod 스키마 기반 요청 검증 미들웨어
 *
 * 사용법:
 *   const { z } = require('zod');
 *   const { validate } = require('../middleware/validate');
 *
 *   const schema = z.object({
 *     body: z.object({ name: z.string().min(1) }),
 *     query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
 *   });
 *
 *   router.post('/endpoint', validate(schema), handler);
 */

const { z } = require('zod');

/**
 * 범용 검증 미들웨어 팩토리
 * @param {z.ZodSchema} schema - body, query, params를 포함하는 Zod 스키마
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const firstError = result.error.issues[0];
      const field = firstError.path.join('.');
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field,
        },
      });
    }

    // 검증된 데이터로 교체 (기본값 적용 포함)
    if (result.data.body) req.body = result.data.body;
    if (result.data.query) req.query = result.data.query;
    if (result.data.params) req.params = result.data.params;

    next();
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자주 사용하는 공통 스키마
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = { validate, paginationQuery, idParam };
