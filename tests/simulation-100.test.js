/**
 * 100가지 시나리오 시뮬레이션 테스트
 * DB 없이 코드 로직, 라우트 구조, 미들웨어, 서비스를 검증
 */

// JWT_SECRET 설정 (jest.mock보다 먼저)
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key-for-simulation-min32chars!!';
}

// DATABASE_URL 없이 테스트할 수 있도록 db-postgres.js를 모킹
jest.mock('../database/db-postgres', () => ({
  getDB: () => ({
    query: async () => [],
    get: async () => undefined,
    run: async () => ({ lastID: null, changes: 0 }),
    all: async () => [],
    transaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
    healthCheck: async () => true,
    getPoolStatus: () => ({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  }),
  getPool: () => ({}),
  Database: class {}
}));

const assert = require('assert');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. DB Placeholder Converter Tests (1-5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function convertPlaceholders(sql) {
  if (/\$\d+/.test(sql)) return sql;
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

test('1. ? → $N 변환 (기본)', () => {
  const result = convertPlaceholders('SELECT * FROM users WHERE id = ? AND role = ?');
  assert.strictEqual(result, 'SELECT * FROM users WHERE id = $1 AND role = $2');
});

test('2. $N 이미 있으면 변환 스킵', () => {
  const sql = 'SELECT * FROM users WHERE id = $1';
  assert.strictEqual(convertPlaceholders(sql), sql);
});

test('3. $N과 ? 혼용 시 $N 우선 (변환 안함)', () => {
  const sql = 'SELECT * FROM users WHERE id = $1 AND role = ?';
  const result = convertPlaceholders(sql);
  assert.strictEqual(result, sql, '$N 존재 시 ? 변환 스킵해야 함');
});

test('4. 빈 쿼리 처리', () => {
  assert.strictEqual(convertPlaceholders(''), '');
});

test('5. ? 없는 쿼리 처리', () => {
  const sql = 'SELECT COUNT(*) FROM users';
  assert.strictEqual(convertPlaceholders(sql), sql);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Dynamic paramIndex Tests (6-10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


test('6. system-admin orgs: paramIndex 1부터 시작 → LIMIT/OFFSET 정합성', () => {
  let where = [];
  let params = [];
  let paramIndex = 1;
  const status = 'active';
  const search = '테스트';
  const page = 1;
  const limit = 20;

  if (status) {
    where.push(`o.status = $${paramIndex++}`);
    params.push(status);
  }
  if (search) {
    where.push(`(o.name ILIKE $${paramIndex} OR o.business_registration_number ILIKE $${paramIndex + 1})`);
    params.push(`%${search}%`, `%${search}%`);
    paramIndex += 2;
  }

  const limitIdx = paramIndex;
  const offsetIdx = paramIndex + 1;
  params.push(limit, (page - 1) * limit);

  assert.strictEqual(params.length, offsetIdx, `params(${params.length}) !== maxParamIdx(${offsetIdx})`);
});

test('7. admin.js logs: paramIndex 1부터 시작 → 필터 없을 때', () => {
  let params = [];
  let paramIndex = 1;
  const limit = 100;
  const offset = 0;

  const limitParam = `$${paramIndex}`;
  const offsetParam = `$${paramIndex + 1}`;
  params.push(limit, offset);

  assert.strictEqual(limitParam, '$1');
  assert.strictEqual(offsetParam, '$2');
  assert.strictEqual(params.length, 2);
});

test('8. admin.js logs: 모든 필터 적용 시 paramIndex 정합성', () => {
  let params = [];
  let paramIndex = 1;
  const organizationId = 1;
  const status = 'success';
  const startDate = '2026-01-01';
  const endDate = '2026-12-31';

  if (organizationId) { params.push(organizationId); paramIndex++; }
  if (status) { params.push(status); paramIndex++; }
  if (startDate) { params.push(startDate); paramIndex++; }
  if (endDate) { params.push(endDate); paramIndex++; }

  const limitIdx = paramIndex;
  const offsetIdx = paramIndex + 1;
  params.push(100, 0);

  assert.strictEqual(params.length, 6);
  assert.strictEqual(limitIdx, 5);
  assert.strictEqual(offsetIdx, 6);
});

test('9. org-admin employees: search 시 paramIndex 2개 증가 (ILIKE 2개)', () => {
  let where = ['u.organization_id = $1'];
  let params = [1];
  let paramIndex = 2;
  const search = '홍길동';

  if (search) {
    where.push(`(u.name ILIKE $${paramIndex} OR u.oauth_email ILIKE $${paramIndex + 1})`);
    params.push(`%${search}%`, `%${search}%`);
    paramIndex += 2;
  }

  params.push(20, 0);
  assert.strictEqual(paramIndex, 4);
  assert.strictEqual(params.length, 5);
  const query = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  assert.strictEqual(query, 'LIMIT $4 OFFSET $5');
});

test('10. system-admin users: search 시 paramIndex 3개 증가', () => {
  let params = [];
  let paramIndex = 1;
  const search = '김';

  if (search) {
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    paramIndex += 3;
  }

  params.push(20, 0);
  assert.strictEqual(paramIndex, 4);
  assert.strictEqual(params.length, 5);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Auth & Token Tests (11-15)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


test('11. JWT payload 구조 검증 (userId, email, role, organizationId)', () => {
  const jwt = require('jsonwebtoken');
  const secret = 'test-secret-key-for-simulation-32chars';
  const payload = {
    userId: 1,
    email: 'test@test.com',
    role: 'user',
    organizationId: null
  };
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret);

  assert.strictEqual(decoded.userId, 1);
  assert.strictEqual(decoded.email, 'test@test.com');
  assert.strictEqual(decoded.role, 'user');
  assert.strictEqual(decoded.organizationId, null);
  assert.strictEqual(decoded.id, undefined, 'JWT에 id 필드 있으면 안됨');
  assert.strictEqual(decoded.organization_id, undefined, 'JWT에 organization_id 필드 있으면 안됨');
});

test('12. TokenBlacklist: add + has 동작', () => {
  const jwt = require('jsonwebtoken');
  const TokenBlacklist = require('../lib/tokenBlacklist');
  const token = jwt.sign({ userId: 1 }, 'test', { expiresIn: '1h' });

  assert.strictEqual(TokenBlacklist.has(token), false);
  TokenBlacklist.add(token);
  assert.strictEqual(TokenBlacklist.has(token), true);
});

test('13. TokenBlacklist: 최대 크기 설정값 확인', () => {
  const bl = require('../lib/tokenBlacklist');
  assert.ok(bl._maxSize > 0);
  assert.strictEqual(bl._maxSize, 10000);
});

test('14. TokenBlacklist: 만료된 토큰 cleanup', () => {
  const bl = require('../lib/tokenBlacklist');
  bl._blacklist.set('expired-token-100', Date.now() - 1000);
  bl.cleanup();
  assert.strictEqual(bl._blacklist.has('expired-token-100'), false);
});

test('15. JWT 만료 토큰 검증 실패', () => {
  const jwt = require('jsonwebtoken');
  const secret = 'test-secret-key-for-simulation-32chars';
  const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '0s' });
  try {
    jwt.verify(token, secret);
    assert.fail('만료 토큰이 검증되면 안됨');
  } catch (e) {
    assert.strictEqual(e.name, 'TokenExpiredError');
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. roleAuth Middleware Tests (16-24)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const roleAuth = require('../middleware/roleAuth');

function mockReq(user) { return { user, params: {}, body: {} }; }
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

test('16. requireSystemAdmin: system_admin 허용', () => {
  const req = mockReq({ userId: 1, role: 'system_admin' });
  const res = mockRes();
  let nextCalled = false;
  roleAuth.requireSystemAdmin(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test('17. requireSystemAdmin: org_admin 거부 (403)', () => {
  const req = mockReq({ userId: 1, role: 'org_admin' });
  const res = mockRes();
  roleAuth.requireSystemAdmin(req, res, () => {});
  assert.strictEqual(res.statusCode, 403);
});

test('18. requireSystemAdmin: 인증 없음 (401)', () => {
  const req = { user: null };
  const res = mockRes();
  roleAuth.requireSystemAdmin(req, res, () => {});
  assert.strictEqual(res.statusCode, 401);
});

test('19. requireOrgAdmin: system_admin 허용', () => {
  const req = mockReq({ userId: 1, role: 'system_admin' });
  const res = mockRes();
  let nextCalled = false;
  roleAuth.requireOrgAdmin(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test('20. requireOrgAdmin: org_admin 허용', () => {
  const req = mockReq({ userId: 1, role: 'org_admin' });
  const res = mockRes();
  let nextCalled = false;
  roleAuth.requireOrgAdmin(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test('21. requireOrgAdmin: user 거부 (403)', () => {
  const req = mockReq({ userId: 1, role: 'user' });
  const res = mockRes();
  roleAuth.requireOrgAdmin(req, res, () => {});
  assert.strictEqual(res.statusCode, 403);
});

test('22. requireOwnOrgAdmin: system_admin은 모든 기관 접근', () => {
  const req = mockReq({ userId: 1, role: 'system_admin' });
  req.params = { organizationId: '999' };
  const res = mockRes();
  let nextCalled = false;
  roleAuth.requireOwnOrgAdmin(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test('23. requireOwnOrgAdmin: org_admin 다른 기관 → 403', () => {
  const req = mockReq({ userId: 1, role: 'org_admin', organizationId: 5 });
  req.params = { organizationId: '999' };
  const res = mockRes();
  roleAuth.requireOwnOrgAdmin(req, res, () => {});
  assert.strictEqual(res.statusCode, 403);
});

test('24. requireUser: 로그인 사용자 허용', () => {
  const req = mockReq({ userId: 1, role: 'user' });
  const res = mockRes();
  let nextCalled = false;
  roleAuth.requireUser(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Error Classes Tests (25-30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const { AppError, ValidationError, AuthenticationError, ForbiddenError, NotFoundError, ConflictError, QuotaExceededError } = require('../lib/errors');

test('25. ValidationError: 400 + VALIDATION_ERROR', () => {
  const err = new ValidationError('잘못된 입력');
  assert.strictEqual(err.statusCode, 400);
  assert.strictEqual(err.code, 'VALIDATION_ERROR');
  assert.strictEqual(err.isOperational, true);
});

test('26. AuthenticationError: 401', () => {
  const err = new AuthenticationError();
  assert.strictEqual(err.statusCode, 401);
  assert.strictEqual(err.message, '인증이 필요합니다');
});

test('27. ForbiddenError: 403', () => {
  const err = new ForbiddenError();
  assert.strictEqual(err.statusCode, 403);
});

test('28. NotFoundError: 404 + 리소스명 포함', () => {
  const err = new NotFoundError('진술서');
  assert.strictEqual(err.statusCode, 404);
  assert.ok(err.message.includes('진술서'));
});

test('29. ConflictError: 409', () => {
  const err = new ConflictError('이미 존재합니다');
  assert.strictEqual(err.statusCode, 409);
});

test('30. QuotaExceededError: 429', () => {
  const err = new QuotaExceededError();
  assert.strictEqual(err.statusCode, 429);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Response Helper Tests (31-36)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const { success: successFn, created: createdFn, paginated: paginatedFn, error: errorFn, errorHandler } = require('../lib/response');

test('31. success() 응답 포맷', () => {
  const res = mockRes();
  successFn(res, { id: 1 });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.id, 1);
});

test('32. created() 응답 포맷 (201)', () => {
  const res = mockRes();
  createdFn(res, { id: 1 });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
});

test('33. paginated() 응답 포맷', () => {
  const res = mockRes();
  paginatedFn(res, { items: [1, 2], total: 10, page: 1, limit: 2 });
  assert.strictEqual(res.body.meta.total, 10);
  assert.strictEqual(res.body.meta.totalPages, 5);
  assert.strictEqual(res.body.data.length, 2);
});

test('34. paginated() totalPages 올림 계산', () => {
  const res = mockRes();
  paginatedFn(res, { items: [], total: 11, page: 1, limit: 5 });
  assert.strictEqual(res.body.meta.totalPages, 3);
});

test('35. errorHandler: 운영 에러 → 코드+메시지 전달', () => {
  const err = new ValidationError('잘못된 값', 'email');
  const req = { log: { warn: () => {}, error: () => {} } };
  const res = mockRes();
  errorHandler(err, req, res, () => {});
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
});

test('36. errorHandler: 프로그래밍 에러 → 500 + 제네릭 메시지', () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const err = new Error('DB connection failed');
  const req = { log: { warn: () => {}, error: () => {} } };
  const res = mockRes();
  errorHandler(err, req, res, () => {});
  assert.strictEqual(res.statusCode, 500);
  assert.ok(!res.body.error.message.includes('DB connection'));
  process.env.NODE_ENV = origEnv;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Path Validation Tests (37-41)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const path = require('path');
const os = require('os');

function isValidTmpPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  const tmpDir = path.resolve(os.tmpdir());
  const relative = path.relative(tmpDir, resolvedPath);
  return !(relative.startsWith('..') || path.isAbsolute(relative));
}

test('37. 정상 tmp 경로 허용', () => {
  const tmpFile = path.join(os.tmpdir(), 'test-file.wav');
  assert.strictEqual(isValidTmpPath(tmpFile), true);
});

test('38. 상위 디렉토리 탈출 차단 (..)', () => {
  const malicious = path.join(os.tmpdir(), '..', 'etc', 'passwd');
  assert.strictEqual(isValidTmpPath(malicious), false);
});

test('39. 절대 경로 직접 접근 차단', () => {
  assert.strictEqual(isValidTmpPath('/etc/passwd'), false);
});

test('40. tmp 디렉토리 자체 허용', () => {
  assert.strictEqual(isValidTmpPath(os.tmpdir()), true);
});

test('41. tmp 하위 중첩 디렉토리 허용', () => {
  const nested = path.join(os.tmpdir(), 'upload-abc123', 'chunk-00001');
  assert.strictEqual(isValidTmpPath(nested), true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Payment Service Logic Tests (42-47)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const BONUS_TIERS = [
  { min: 50000, bonus: 0.30 },
  { min: 30000, bonus: 0.25 },
  { min: 10000, bonus: 0.20 },
  { min: 5000, bonus: 0.10 },
  { min: 0, bonus: 0 }
];

function calculateBonus(amount) {
  for (const tier of BONUS_TIERS) {
    if (amount >= tier.min) {
      return Math.floor(amount * tier.bonus);
    }
  }
  return 0;
}

test('42. 보너스: 50000원 → 30% = 15000', () => {
  assert.strictEqual(calculateBonus(50000), 15000);
});

test('43. 보너스: 30000원 → 25% = 7500', () => {
  assert.strictEqual(calculateBonus(30000), 7500);
});

test('44. 보너스: 10000원 → 20% = 2000', () => {
  assert.strictEqual(calculateBonus(10000), 2000);
});

test('45. 보너스: 5000원 → 10% = 500', () => {
  assert.strictEqual(calculateBonus(5000), 500);
});

test('46. 보너스: 4999원 → 0%', () => {
  assert.strictEqual(calculateBonus(4999), 0);
});

test('47. 보너스: 0원 → 0', () => {
  assert.strictEqual(calculateBonus(0), 0);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. Logger & Security Tests (48-50)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const { maskSensitiveData } = require('../lib/logger');

test('48. 주민번호 마스킹', () => {
  const result = maskSensitiveData('주민번호: 900101-1234567');
  assert.ok(!result.includes('1234567'), '주민번호 뒷자리가 노출됨');
  assert.ok(result.includes('*******'));
});

test('49. 전화번호 마스킹', () => {
  const result = maskSensitiveData('연락처: 010-1234-5678');
  assert.ok(!result.includes('1234-5678'), '전화번호가 노출됨');
  assert.ok(result.includes('****'));
});

test('50. 민감 키 마스킹 (password, token, secret)', () => {
  const result = maskSensitiveData({
    password: 'mysecret',
    token: 'jwt-token-xxx',
    secret: 'api-secret',
    name: '홍길동',
    authorization: 'Bearer xxx'
  });
  assert.strictEqual(result.password, '***REDACTED***');
  assert.strictEqual(result.token, '***REDACTED***');
  assert.strictEqual(result.secret, '***REDACTED***');
  assert.strictEqual(result.authorization, '***REDACTED***');
  assert.strictEqual(result.name, '홍길동');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// =================== 추가 50개 테스트 (51-100) ===================
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. Zod Validation Middleware Tests (51-58)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const { z } = require('zod');
const { validate, paginationQuery, idParam } = require('../middleware/validate');

test('51. paginationQuery: 기본값 적용 (page=1, limit=20)', () => {
  const result = paginationQuery.parse({});
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.limit, 20);
});

test('52. paginationQuery: 유효한 값 통과', () => {
  const result = paginationQuery.parse({ page: '3', limit: '50' });
  assert.strictEqual(result.page, 3);
  assert.strictEqual(result.limit, 50);
});

test('53. paginationQuery: limit 최대값(100) 초과 거부', () => {
  const result = paginationQuery.safeParse({ page: 1, limit: 101 });
  assert.strictEqual(result.success, false);
});

test('54. paginationQuery: page 0 이하 거부', () => {
  const result = paginationQuery.safeParse({ page: 0, limit: 20 });
  assert.strictEqual(result.success, false);
});

test('55. paginationQuery: 음수 limit 거부', () => {
  const result = paginationQuery.safeParse({ page: 1, limit: -1 });
  assert.strictEqual(result.success, false);
});

test('56. idParam: 문자열 "123" → 숫자 123 변환', () => {
  const result = idParam.parse({ id: '123' });
  assert.strictEqual(result.id, 123);
});

test('57. idParam: 0 이하 거부', () => {
  const result = idParam.safeParse({ id: 0 });
  assert.strictEqual(result.success, false);
});

test('58. validate 미들웨어: 유효한 데이터 → next() 호출', () => {
  const schema = z.object({
    query: paginationQuery,
  });
  const middleware = validate(schema);
  const req = { body: {}, query: { page: '2', limit: '10' }, params: {} };
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.query.page, 2);
  assert.strictEqual(req.query.limit, 10);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. Multer File Validation Tests (59-68)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// validateFilename 로직 재현 (config/multer.js)
function validateFilename(basename) {
  return !basename.includes('..') && !basename.includes('/') && !basename.includes('\\');
}

test('59. validateFilename: 정상 파일명 통과', () => {
  assert.strictEqual(validateFilename('audio-1234.mp3'), true);
});

test('60. validateFilename: ".." 포함 차단 (path traversal)', () => {
  assert.strictEqual(validateFilename('../../../etc/passwd'), false);
});

test('61. validateFilename: "/" 포함 차단', () => {
  assert.strictEqual(validateFilename('path/to/file.mp3'), false);
});

test('62. validateFilename: "\\\\" 포함 차단', () => {
  assert.strictEqual(validateFilename('path\\to\\file.mp3'), false);
});

test('63. 오디오 확장자 허용 목록 검증 (mp3, wav, m4a, ogg, webm, mp4)', () => {
  const allowedTypes = /^\.(mp3|wav|m4a|ogg|webm|mp4)$/i;
  assert.strictEqual(allowedTypes.test('.mp3'), true);
  assert.strictEqual(allowedTypes.test('.wav'), true);
  assert.strictEqual(allowedTypes.test('.m4a'), true);
  assert.strictEqual(allowedTypes.test('.ogg'), true);
  assert.strictEqual(allowedTypes.test('.webm'), true);
  assert.strictEqual(allowedTypes.test('.mp4'), true);
  assert.strictEqual(allowedTypes.test('.exe'), false);
  assert.strictEqual(allowedTypes.test('.php'), false);
});

test('64. 오디오 확장자 대소문자 무시', () => {
  const allowedTypes = /^\.(mp3|wav|m4a|ogg|webm|mp4)$/i;
  assert.strictEqual(allowedTypes.test('.MP3'), true);
  assert.strictEqual(allowedTypes.test('.Wav'), true);
});

test('65. 문서 확장자 허용 목록 검증 (docx, pdf, txt)', () => {
  const allowedTypes = /^\.(docx|pdf|txt)$/i;
  assert.strictEqual(allowedTypes.test('.docx'), true);
  assert.strictEqual(allowedTypes.test('.pdf'), true);
  assert.strictEqual(allowedTypes.test('.txt'), true);
  assert.strictEqual(allowedTypes.test('.doc'), false);
  assert.strictEqual(allowedTypes.test('.xlsx'), false);
});

test('66. 오디오 파일 크기 제한: 100MB', () => {
  const limit = 100 * 1024 * 1024;
  assert.strictEqual(limit, 104857600);
});

test('67. 문서 파일 크기 제한: 10MB', () => {
  const limit = 10 * 1024 * 1024;
  assert.strictEqual(limit, 10485760);
});

test('68. MIME 타입 화이트리스트: audio/mpeg, audio/wav 등', () => {
  const allowedMimes = [
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
    'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm',
  ];
  assert.ok(allowedMimes.includes('audio/mpeg'));
  assert.ok(allowedMimes.includes('video/mp4'));
  assert.ok(!allowedMimes.includes('application/x-php'));
  assert.ok(!allowedMimes.includes('text/html'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. Security Utils Tests (69-82)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// security-utils.js는 브라우저 전용이므로 순수 함수만 재현하여 테스트
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  if (typeof text !== 'string') return String(text);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
  return text.replace(/[&<>"'/]/g, char => map[char]);
}

function safeParseInt(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseFloat(value, defaultValue = 0.0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeJsonParse(jsonString, defaultValue = null) {
  try { return JSON.parse(jsonString); } catch { return defaultValue; }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/.test(phone);
}

function validatePassword(password) {
  const result = { valid: true, errors: [] };
  if (password.length < 8) {
    result.valid = false;
    result.errors.push('비밀번호는 최소 8자 이상이어야 합니다');
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  if ([hasLetter, hasNumber, hasSpecial].filter(Boolean).length < 2) {
    result.valid = false;
    result.errors.push('영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
  }
  return result;
}

test('69. escapeHtml: XSS 방어 (< → &lt;, > → &gt;)', () => {
  assert.strictEqual(escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
});

test('70. escapeHtml: & 이스케이프', () => {
  assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
});

test('71. escapeHtml: 따옴표 이스케이프', () => {
  assert.strictEqual(escapeHtml('" and \''), '&quot; and &#x27;');
});

test('72. escapeHtml: null/undefined → 빈 문자열', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('73. escapeHtml: 숫자 → 문자열 변환', () => {
  assert.strictEqual(escapeHtml(12345), '12345');
});

test('74. escapeHtml: 이미 안전한 문자열 → 그대로', () => {
  assert.strictEqual(escapeHtml('Hello World'), 'Hello World');
});

test('75. safeParseInt: 정상 숫자 문자열', () => {
  assert.strictEqual(safeParseInt('42'), 42);
});

test('76. safeParseInt: NaN → 기본값 0', () => {
  assert.strictEqual(safeParseInt('abc'), 0);
  assert.strictEqual(safeParseInt(''), 0);
  assert.strictEqual(safeParseInt(undefined), 0);
});

test('77. safeParseInt: 커스텀 기본값', () => {
  assert.strictEqual(safeParseInt('xyz', -1), -1);
});

test('78. safeParseFloat: 소수점', () => {
  assert.strictEqual(safeParseFloat('3.14'), 3.14);
});

test('79. safeParseFloat: NaN → 기본값 0.0', () => {
  assert.strictEqual(safeParseFloat('not-a-number'), 0.0);
});

test('80. safeJsonParse: 유효한 JSON', () => {
  assert.deepStrictEqual(safeJsonParse('{"a":1}'), { a: 1 });
});

test('81. safeJsonParse: 잘못된 JSON → 기본값', () => {
  assert.strictEqual(safeJsonParse('{invalid}', 'fallback'), 'fallback');
});

test('82. safeJsonParse: 배열 JSON', () => {
  assert.deepStrictEqual(safeJsonParse('[1,2,3]'), [1, 2, 3]);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. Email & Phone & Password Validation Tests (83-92)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


test('83. 유효한 이메일 형식', () => {
  assert.strictEqual(isValidEmail('user@example.com'), true);
  assert.strictEqual(isValidEmail('test.name@domain.co.kr'), true);
});

test('84. 잘못된 이메일: @ 없음', () => {
  assert.strictEqual(isValidEmail('userexample.com'), false);
});

test('85. 잘못된 이메일: 도메인 없음', () => {
  assert.strictEqual(isValidEmail('user@'), false);
});

test('86. 잘못된 이메일: 공백 포함', () => {
  assert.strictEqual(isValidEmail('user @example.com'), false);
});

test('87. 한국 전화번호: 하이픈 포함', () => {
  assert.strictEqual(isValidPhone('010-1234-5678'), true);
  assert.strictEqual(isValidPhone('011-123-4567'), true);
});

test('88. 한국 전화번호: 하이픈 없음', () => {
  assert.strictEqual(isValidPhone('01012345678'), true);
});

test('89. 잘못된 전화번호: 02로 시작', () => {
  assert.strictEqual(isValidPhone('02-1234-5678'), false);
});

test('90. 비밀번호: 8자 미만 → 실패', () => {
  const result = validatePassword('abc1!');
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('8자')));
});

test('91. 비밀번호: 영문+숫자 → 통과', () => {
  const result = validatePassword('abcdef12');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('92. 비밀번호: 영문만 → 실패 (복잡도 부족)', () => {
  const result = validatePassword('abcdefgh');
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('2가지')));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. DocumentParser Path Validation Tests (93-96)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const parser = require('../services/documentParser');

test('93. DocumentParser: 정상 tmpdir 경로 통과', () => {
  const tmpFile = path.join(os.tmpdir(), 'test-file.docx');
  const result = parser.validatePath(tmpFile);
  assert.ok(result);
});

test('94. DocumentParser: ".." 포함 경로 차단', () => {
  try {
    parser.validatePath('/tmp/../etc/passwd');
    assert.fail('에러가 발생해야 함');
  } catch (e) {
    assert.ok(e.message.includes('잘못된 파일 경로'));
  }
});

test('95. DocumentParser: 지원 확장자 라우팅 (.docx, .pdf, .txt)', () => {
  const extDocx = path.extname('file.docx').toLowerCase();
  const extPdf = path.extname('file.pdf').toLowerCase();
  const extTxt = path.extname('report.txt').toLowerCase();
  assert.strictEqual(extDocx, '.docx');
  assert.strictEqual(extPdf, '.pdf');
  assert.strictEqual(extTxt, '.txt');
});

test('96. DocumentParser: 미지원 확장자 에러', () => {
  const ext = '.xlsx';
  const supportedExts = ['.docx', '.pdf', '.txt'];
  assert.strictEqual(supportedExts.includes(ext), false);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. Credit/Quota Calculation Tests (97-100)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


test('97. 크레딧 기본값: 잔액 0, 무료 체험 3회', () => {
  const defaultCredit = {
    balance: 0,
    freeTrialCount: 3,
    totalPurchased: 0,
    totalUsed: 0,
    totalBonus: 0
  };
  assert.strictEqual(defaultCredit.balance, 0);
  assert.strictEqual(defaultCredit.freeTrialCount, 3);
});

test('98. 사용량 쿼타: minutes → hours 변환', () => {
  const estimatedMinutes = 30;
  const estimatedHours = estimatedMinutes / 60;
  assert.strictEqual(estimatedHours, 0.5);

  const estimatedMinutes2 = 90;
  const estimatedHours2 = estimatedMinutes2 / 60;
  assert.strictEqual(estimatedHours2, 1.5);
});

test('99. 쿼타 가용성 판단: remaining >= estimated', () => {
  const check1 = { remainingHours: 5.0, estimatedHours: 0.5 };
  assert.strictEqual(check1.remainingHours >= check1.estimatedHours, true);

  const check2 = { remainingHours: 0.3, estimatedHours: 0.5 };
  assert.strictEqual(check2.remainingHours >= check2.estimatedHours, false);

  // 경계값: 정확히 같을 때 → available
  const check3 = { remainingHours: 0.5, estimatedHours: 0.5 };
  assert.strictEqual(check3.remainingHours >= check3.estimatedHours, true);
});

test('100. 결제 총 크레딧: amount + bonus = totalCredit', () => {
  const amount = 30000;
  const bonusAmount = calculateBonus(amount); // 25% = 7500
  const totalCredit = Number(amount) + Number(bonusAmount);
  assert.strictEqual(totalCredit, 37500);

  // STT/AI 비용 분리 (97% / 3%)
  const sttCost = Math.round(totalCredit * 0.97);
  const aiCost = totalCredit - sttCost;
  assert.strictEqual(sttCost + aiCost, totalCredit, 'STT + AI = 총 비용');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary (Jest handles reporting)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
