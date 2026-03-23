/**
 * Statement routes integration tests
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Environment setup (MUST be before any require of app code)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.MASTER_PASSWORD = 'test-master';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost/mock';
process.env.NODE_ENV = 'test';

const mockDb = {
  query: jest.fn(async () => []),
  get: jest.fn(async () => undefined),
  run: jest.fn(async () => ({ lastID: null, changes: 0 })),
  all: jest.fn(async () => []),
  transaction: jest.fn(async (cb) => {
    const client = { query: jest.fn(async () => ({ rows: [{ id: 1 }] })) };
    return cb(client);
  }),
};

jest.mock('../../database/db-postgres', () => ({ getDB: () => mockDb }));
jest.mock('../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  requestLogger: (req, res, next) => next(),
}));
jest.mock('../../lib/tokenBlacklist', () => ({
  add: jest.fn(),
  has: jest.fn(() => false),
  size: 0,
  startCleanup: jest.fn(),
}));
jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('../../config/passport', () => require('passport'));
jest.mock('../../lib/sessionCleanup', () => ({
  cleanExpiredSessions: jest.fn(),
  startSessionCleanup: jest.fn(),
  stopSessionCleanup: jest.fn(),
}));

// Mock OpenAI (used directly by statement.js)
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn(async () => ({
          text: 'transcribed text',
          duration: 60,
          words: [],
        })),
      },
    },
    chat: {
      completions: {
        create: jest.fn(async () => ({
          choices: [{ message: { content: 'generated statement' } }],
        })),
      },
    },
  }));
});

// Mock multer to avoid actual file handling in tests
jest.mock('multer', () => {
  const multer = () => ({
    single: () => (req, res, next) => next(),
  });
  multer.diskStorage = jest.fn(() => ({}));
  return multer;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Imports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function authToken(userId = 1) {
  return jwt.sign(
    { userId, email: 'test@test.com', role: 'user', organizationId: 1 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Set up mockDb.get to return a valid session for authenticateToken's DB check.
 * authenticateToken calls db.get('SELECT id FROM sessions WHERE token = $1 ...')
 * so we need the first call to return a session object.
 */
function mockAuthSession() {
  mockDb.get.mockResolvedValueOnce({ id: 1 }); // session check
}

// Valid statement body for POST /save
const validSaveBody = {
  investigationDate: '2026-03-20',
  investigationLocation: '서울시 강남구',
  investigationAgency: '경기북서부노인보호전문기관',
  subjectName: '홍길동',
  subjectBirthDate: '1960-01-01',
  subjectOrganization: 'OO요양원',
  subjectPosition: '요양보호사',
  subjectContact: '010-1234-5678',
  transcript: '테스트 녹취록 내용',
  statementContent: { qa: [{ question: '질문', answer: '답변' }] },
  status: 'draft',
};

// Sample statement row from DB
const sampleStatement = {
  id: 1,
  user_id: 1,
  organization_id: 1,
  investigation_date: '2026-03-20',
  investigation_location: '서울시 강남구',
  investigation_agency: '경기북서부노인보호전문기관',
  subject_name: '홍길동',
  subject_birth_date: '1960-01-01',
  subject_organization: 'OO요양원',
  subject_position: '요양보호사',
  subject_contact: '010-1234-5678',
  transcript: '테스트 녹취록 내용',
  statement_content: '{"qa":[]}',
  status: 'draft',
  created_at: '2026-03-20T00:00:00Z',
  updated_at: '2026-03-20T00:00:00Z',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Statement Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────
  // POST /api/statement/save
  // ─────────────────────────────────────────
  describe('POST /api/statement/save', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/statement/save')
        .send(validSaveBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 with missing required fields', async () => {
      mockAuthSession();

      const res = await request(app)
        .post('/api/statement/save')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({ status: 'draft' }); // missing investigationDate and subjectName

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 201 with valid data', async () => {
      mockAuthSession();

      const savedRow = { ...sampleStatement, id: 5 };
      mockDb.query.mockResolvedValueOnce([savedRow]); // INSERT RETURNING *

      const res = await request(app)
        .post('/api/statement/save')
        .set('Authorization', `Bearer ${authToken()}`)
        .send(validSaveBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.statement).toBeDefined();
      expect(res.body.statement.id).toBe(5);

      // Verify the INSERT query was called with correct params
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO statements');
      expect(params[0]).toBe(1); // userId
      expect(params[1]).toBe(1); // organizationId
      expect(params[5]).toBe('홍길동'); // subjectName
    });

    it('should return 400 with invalid status value', async () => {
      mockAuthSession();

      const res = await request(app)
        .post('/api/statement/save')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({ ...validSaveBody, status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // GET /api/statement/list
  // ─────────────────────────────────────────
  describe('GET /api/statement/list', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/statement/list');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 200 with list of statements', async () => {
      mockAuthSession();

      const statements = [
        { ...sampleStatement, id: 1 },
        { ...sampleStatement, id: 2, subject_name: '김철수' },
      ];

      // First query: list query
      mockDb.query.mockResolvedValueOnce(statements);
      // Second query: count query
      mockDb.query.mockResolvedValueOnce([{ count: '2' }]);

      const res = await request(app)
        .get('/api/statement/list')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.page).toBe(1);
    });

    it('should support pagination query params', async () => {
      mockAuthSession();

      mockDb.query.mockResolvedValueOnce([sampleStatement]);
      mockDb.query.mockResolvedValueOnce([{ count: '10' }]);

      const res = await request(app)
        .get('/api/statement/list?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(5);
      expect(res.body.meta.total).toBe(10);
      expect(res.body.meta.totalPages).toBe(2);

      // Check OFFSET = (page - 1) * limit = 5
      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toContain(5); // limit
      expect(params).toContain(5); // offset = (2-1)*5
    });

    it('should support status and search filters', async () => {
      mockAuthSession();

      mockDb.query.mockResolvedValueOnce([]);
      mockDb.query.mockResolvedValueOnce([{ count: '0' }]);

      const res = await request(app)
        .get('/api/statement/list?status=completed&search=홍길동')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);

      // Verify status and search params were passed
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('s.status = $');
      expect(sql).toContain('ILIKE');
      expect(params).toContain('completed');
      expect(params).toContain('%홍길동%');
    });
  });

  // ─────────────────────────────────────────
  // GET /api/statement/:id
  // ─────────────────────────────────────────
  describe('GET /api/statement/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/statement/1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when statement not found', async () => {
      mockAuthSession();

      mockDb.query.mockResolvedValueOnce([]); // no matching rows

      const res = await request(app)
        .get('/api/statement/999')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 with statement data', async () => {
      mockAuthSession();

      mockDb.query.mockResolvedValueOnce([{ ...sampleStatement, creator_name: '테스터' }]);

      const res = await request(app)
        .get('/api/statement/1')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statement).toBeDefined();
      expect(res.body.statement.id).toBe(1);
      expect(res.body.statement.subject_name).toBe('홍길동');
    });

    it('should return 404 when accessing another user\'s statement (query filters by user_id)', async () => {
      mockAuthSession();

      // The query uses WHERE s.id = $1 AND s.user_id = $2, so if user_id
      // doesn't match, it returns empty result → NotFoundError
      mockDb.query.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/statement/1')
        .set('Authorization', `Bearer ${authToken(999)}`); // different userId

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // PUT /api/statement/:id
  // ─────────────────────────────────────────
  describe('PUT /api/statement/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put('/api/statement/1')
        .send({ subjectName: '김영희' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 when statement not found or not owned', async () => {
      mockAuthSession();

      // First query: ownership check returns empty
      mockDb.query.mockResolvedValueOnce([]);

      const res = await request(app)
        .put('/api/statement/999')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({ subjectName: '김영희' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 400 when no fields to update', async () => {
      mockAuthSession();

      // Ownership check passes
      mockDb.query.mockResolvedValueOnce([sampleStatement]);

      const res = await request(app)
        .put('/api/statement/1')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({}); // no updatable fields

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 200 with updated statement', async () => {
      mockAuthSession();

      // First query: ownership check
      mockDb.query.mockResolvedValueOnce([sampleStatement]);
      // Second query: UPDATE RETURNING *
      const updatedStatement = { ...sampleStatement, subject_name: '김영희' };
      mockDb.query.mockResolvedValueOnce([updatedStatement]);

      const res = await request(app)
        .put('/api/statement/1')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({ subjectName: '김영희', status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statement).toBeDefined();
      expect(res.body.statement.subject_name).toBe('김영희');

      // Verify the UPDATE query includes only the changed fields
      const [sql] = mockDb.query.mock.calls[1];
      expect(sql).toContain('UPDATE statements SET');
      expect(sql).toContain('subject_name');
      expect(sql).toContain('status');
    });

    it('should return 400 with invalid status value', async () => {
      mockAuthSession();

      const res = await request(app)
        .put('/api/statement/1')
        .set('Authorization', `Bearer ${authToken()}`)
        .send({ status: 'bad_status' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // DELETE /api/statement/:id
  // ─────────────────────────────────────────
  describe('DELETE /api/statement/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).delete('/api/statement/1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 when statement not found or not owned', async () => {
      mockAuthSession();

      // Ownership check returns empty
      mockDb.query.mockResolvedValueOnce([]);

      const res = await request(app)
        .delete('/api/statement/999')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 200 on successful delete', async () => {
      mockAuthSession();

      // First query: ownership check
      mockDb.query.mockResolvedValueOnce([sampleStatement]);
      // Second query: DELETE
      mockDb.query.mockResolvedValueOnce([]);

      const res = await request(app)
        .delete('/api/statement/1')
        .set('Authorization', `Bearer ${authToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('진술서가 삭제되었습니다.');

      // Verify DELETE query was called
      const [sql, params] = mockDb.query.mock.calls[1];
      expect(sql).toContain('DELETE FROM statements');
      expect(params).toEqual([1, 1]); // statementId, userId
    });
  });
});
