/**
 * Unit tests for Feedback routes (/api/feedback/*) and Analytics routes (/api/analytics/*)
 */

// Set env vars FIRST (before any imports)
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.MASTER_PASSWORD = 'test-master';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost/mock';
process.env.NODE_ENV = 'test';

// Mock database
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

const request = require('supertest');
const app = require('../../server');
const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../../lib/tokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Helper: generate a valid access token
 */
function generateAccessToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 1,
      email: 'test@example.com',
      role: 'user',
      organizationId: 1,
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Helper: generate an admin access token
 */
function generateAdminToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 99,
      email: 'admin@example.com',
      role: 'system_admin',
      organizationId: 1,
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue([]);
  mockDb.get.mockResolvedValue(undefined);
  mockDb.run.mockResolvedValue({ lastID: null, changes: 0 });
  mockDb.all.mockResolvedValue([]);
  mockDb.transaction.mockImplementation(async (cb) => {
    const client = { query: jest.fn(async () => ({ rows: [{ id: 1 }] })) };
    return cb(client);
  });
  tokenBlacklist.has.mockReturnValue(false);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/feedback (simple feedback - optionalAuth, no login required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/feedback', () => {
  test('200 with valid data (no auth)', async () => {
    mockDb.run.mockResolvedValueOnce({ lastID: 1, changes: 1 });

    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 4, comment: 'Good job' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  test('200 with minimum valid data (rating only)', async () => {
    mockDb.run.mockResolvedValueOnce({ lastID: 2, changes: 1 });

    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('400 with missing rating', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ comment: 'No rating provided' });

    expect(res.status).toBe(400);
  });

  test('400 with rating out of range (0)', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 0 });

    expect(res.status).toBe(400);
  });

  test('400 with rating out of range (6)', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 6 });

    expect(res.status).toBe(400);
  });

  test('200 with authenticated user (userId is set)', async () => {
    const token = generateAccessToken({ userId: 5 });
    // optionalAuth does NOT do session DB check, so no need to mock db.get for session
    mockDb.run.mockResolvedValueOnce({ lastID: 3, changes: 1 });

    const res = await request(app)
      .post('/api/feedback')
      .set('Cookie', [`access_token=${token}`])
      .send({ rating: 5, comment: 'Great with auth' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify db.run was called with userId=5
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.any(String),
      [5, 5, 'Great with auth', 'consultation']
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/feedback/submit (authenticateToken required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/feedback/submit', () => {
  test('401 without auth', async () => {
    const res = await request(app)
      .post('/api/feedback/submit')
      .send({ rating: 4, comment: 'Test' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid feedback', async () => {
    const token = generateAccessToken({ userId: 1, organizationId: 10 });

    // 1st db.get: session check in authenticateToken
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    // feedbackService.submitFeedback calls db.run
    mockDb.run.mockResolvedValueOnce({ lastID: 42, changes: 1 });

    const res = await request(app)
      .post('/api/feedback/submit')
      .set('Cookie', [`access_token=${token}`])
      .send({ rating: 5, comment: 'Excellent service' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedbackId).toBe(42);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/feedback/my-feedbacks (authenticateToken required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/feedback/my-feedbacks', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/feedback/my-feedbacks');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns user feedbacks', async () => {
    const token = generateAccessToken({ userId: 1 });

    // 1st db.get: session check
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    // feedbackService.getFeedbacks calls db.query
    const mockFeedbacks = [
      {
        id: 1,
        user_id: 1,
        rating: 5,
        comment: 'Great',
        false_positive_examples: null,
        false_negative_examples: null,
        incorrect_mapping_examples: null,
      },
      {
        id: 2,
        user_id: 1,
        rating: 3,
        comment: 'OK',
        false_positive_examples: null,
        false_negative_examples: null,
        incorrect_mapping_examples: null,
      },
    ];
    mockDb.query.mockResolvedValueOnce(mockFeedbacks);

    const res = await request(app)
      .get('/api/feedback/my-feedbacks')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedbacks).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  test('200 returns empty array when no feedbacks', async () => {
    const token = generateAccessToken({ userId: 1 });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([]); // no feedbacks

    const res = await request(app)
      .get('/api/feedback/my-feedbacks')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedbacks).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/feedback/admin/all (isAdmin = authenticateToken + admin role check)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/feedback/admin/all', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/feedback/admin/all');

    expect(res.status).toBe(401);
  });

  test('403 for non-admin user', async () => {
    const token = generateAccessToken({ role: 'user' });

    // session check passes
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/feedback/admin/all')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for admin user', async () => {
    const token = generateAdminToken();

    // session check
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    // feedbackService.getFeedbacks calls db.query
    mockDb.query.mockResolvedValueOnce([
      {
        id: 1,
        rating: 4,
        comment: 'Good',
        user_name: 'User A',
        false_positive_examples: null,
        false_negative_examples: null,
        incorrect_mapping_examples: null,
      },
    ]);

    const res = await request(app)
      .get('/api/feedback/admin/all')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedbacks).toHaveLength(1);
  });

  test('200 for org_admin user', async () => {
    const token = generateAdminToken({ role: 'org_admin', organizationId: 5 });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([]); // feedbacks

    const res = await request(app)
      .get('/api/feedback/admin/all')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/feedback/admin/respond/:id (isAdmin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/feedback/admin/respond/:id', () => {
  test('401 without auth', async () => {
    const res = await request(app)
      .post('/api/feedback/admin/respond/1')
      .send({ response: 'Thank you for your feedback' });

    expect(res.status).toBe(401);
  });

  test('403 for non-admin user', async () => {
    const token = generateAccessToken({ role: 'user' });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .post('/api/feedback/admin/respond/1')
      .set('Cookie', [`access_token=${token}`])
      .send({ response: 'Thank you' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for admin with valid response', async () => {
    const token = generateAdminToken();

    // session check
    mockDb.get
      .mockResolvedValueOnce({ id: 1 })  // session
      .mockResolvedValueOnce({ id: 1 }); // feedback exists check in respondToFeedback
    // feedbackService.respondToFeedback calls db.run
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/feedback/admin/respond/1')
      .set('Cookie', [`access_token=${token}`])
      .send({ response: 'Thank you for your feedback!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.changes).toBe(1);
  });

  test('400 with missing response body', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .post('/api/feedback/admin/respond/1')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
  });

  test('400 with invalid id param (non-numeric)', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .post('/api/feedback/admin/respond/abc')
      .set('Cookie', [`access_token=${token}`])
      .send({ response: 'Test' });

    expect(res.status).toBe(400);
  });

  test('500 when feedback not found', async () => {
    const token = generateAdminToken();

    mockDb.get
      .mockResolvedValueOnce({ id: 1 })   // session
      .mockResolvedValueOnce(undefined);   // feedback not found

    const res = await request(app)
      .post('/api/feedback/admin/respond/999')
      .set('Cookie', [`access_token=${token}`])
      .send({ response: 'Test response' });

    expect(res.status).toBe(500);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Routes - all use isAdmin (router.use(isAdmin))
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/dashboard', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/analytics/dashboard');

    expect(res.status).toBe(401);
  });

  test('403 for non-admin user', async () => {
    const token = generateAccessToken({ role: 'user' });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    // session check
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    // getDashboardSummary calls multiple sub-methods via Promise.all:
    // getUsageStatistics -> db.get
    // getAnonymizationStatistics -> db.query + db.get
    // getFeedbackSummary -> db.get
    // getPerformanceMetrics -> db.query
    // getErrorAnalysis -> db.query
    const usageRow = {
      total_requests: '10',
      unique_users: '3',
      active_organizations: '2',
      total_processing_time: '120',
      avg_processing_time: '12',
      total_data_processed_kb: '5000',
    };
    const feedbackRow = {
      total_feedbacks: '5',
      avg_rating: '4.2',
      avg_accuracy: '0.9',
      positive_count: '3',
      negative_count: '1',
      false_positive_count: '0',
      false_negative_count: '1',
    };
    const anonymizationTotal = {
      total_names: '50',
      total_contacts: '30',
      total_identifiers: '20',
      total_facilities: '10',
    };

    // db.get calls: usageStats row, anonymizationStats total, feedbackStats row
    mockDb.get
      .mockResolvedValueOnce(usageRow)       // getUsageStatistics
      .mockResolvedValueOnce(anonymizationTotal) // getAnonymizationStatistics total
      .mockResolvedValueOnce(feedbackRow);   // getFeedbackSummary

    // db.query calls: anonymizationStats byFileType, performanceMetrics, errorAnalysis
    mockDb.query
      .mockResolvedValueOnce([])  // getAnonymizationStatistics byFileType
      .mockResolvedValueOnce([])  // getPerformanceMetrics
      .mockResolvedValueOnce([]); // getErrorAnalysis

    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.usage).toBeDefined();
    expect(res.body.summary.feedback).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/usage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/usage', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/analytics/usage');

    expect(res.status).toBe(401);
  });

  test('403 for non-admin user', async () => {
    const token = generateAccessToken({ role: 'user' });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .get('/api/analytics/usage')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    // session check
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    // getUsageStatistics -> db.get
    mockDb.get.mockResolvedValueOnce({
      total_requests: '25',
      unique_users: '5',
      active_organizations: '3',
      total_processing_time: '300',
      avg_processing_time: '12',
      total_data_processed_kb: '10000',
    });

    const res = await request(app)
      .get('/api/analytics/usage')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.usage).toBeDefined();
    expect(res.body.usage.total_requests).toBe(25);
    expect(res.body.usage.unique_users).toBe(5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/performance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/performance', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/analytics/performance');

    expect(res.status).toBe(401);
  });

  test('403 for non-admin user', async () => {
    const token = generateAccessToken({ role: 'user' });

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .get('/api/analytics/performance')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    // session check
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    // getPerformanceMetrics -> db.query
    mockDb.query.mockResolvedValueOnce([
      {
        anonymization_method: 'rule',
        count: '10',
        avg_processing_time: '150',
        min_processing_time: '50',
        max_processing_time: '500',
        avg_entities_detected: '12',
      },
      {
        anonymization_method: 'ai',
        count: '8',
        avg_processing_time: '300',
        min_processing_time: '100',
        max_processing_time: '800',
        avg_entities_detected: '15',
      },
    ]);

    const res = await request(app)
      .get('/api/analytics/performance')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.performance).toBeDefined();
    expect(res.body.performance.by_method).toHaveLength(2);
  });

  test('200 for admin with method filter', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([
      {
        anonymization_method: 'rule',
        count: '10',
        avg_processing_time: '150',
        min_processing_time: '50',
        max_processing_time: '500',
        avg_entities_detected: '12',
      },
    ]);

    const res = await request(app)
      .get('/api/analytics/performance?method=rule')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.performance.by_method).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/anonymization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/anonymization', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session

    const res = await request(app)
      .get('/api/analytics/anonymization')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    // getAnonymizationStatistics -> db.query (byFileType) + db.get (total)
    mockDb.query.mockResolvedValueOnce([]);
    mockDb.get.mockResolvedValueOnce({
      total_names: '0',
      total_contacts: '0',
      total_identifiers: '0',
      total_facilities: '0',
    });

    const res = await request(app)
      .get('/api/analytics/anonymization')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.anonymization).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/feedback-summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/feedback-summary', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/feedback-summary')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    // getFeedbackSummary -> db.get
    mockDb.get.mockResolvedValueOnce({
      total_feedbacks: '10',
      avg_rating: '3.5',
      avg_accuracy: '0.85',
      positive_count: '5',
      negative_count: '2',
      false_positive_count: '1',
      false_negative_count: '1',
    });

    const res = await request(app)
      .get('/api/analytics/feedback-summary')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.feedback).toBeDefined();
    expect(res.body.feedback.total_feedbacks).toBe(10);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/errors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/errors', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/errors')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([
      {
        anonymization_method: 'rule',
        false_positive_count: '2',
        false_negative_count: '1',
        incorrect_mapping_count: '0',
        total_feedbacks: '10',
        false_positive_rate: '20.00',
        false_negative_rate: '10.00',
      },
    ]);

    const res = await request(app)
      .get('/api/analytics/errors')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.by_method).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/trend
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/trend', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/trend')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin with default metric', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([
      { date: '2026-03-20', count: '5', unique_users: '2', total_processing_time: '60' },
      { date: '2026-03-21', count: '8', unique_users: '3', total_processing_time: '90' },
    ]);

    const res = await request(app)
      .get('/api/analytics/trend')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/organizations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/organizations', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Org A', region: 'Seoul', total_requests: '15', avg_processing_time: '10', total_usage_seconds: '150', avg_rating: '4.0', feedback_count: '5' },
    ]);

    const res = await request(app)
      .get('/api/analytics/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.organizations).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/methods
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/methods', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/methods')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    mockDb.query.mockResolvedValueOnce([
      { anonymization_method: 'rule', usage_count: '20', avg_rating: '3.8', avg_accuracy: '0.85', avg_processing_time: '100', false_positive_count: '2', false_negative_count: '1', satisfaction_rate: '60.00' },
      { anonymization_method: 'ai', usage_count: '15', avg_rating: '4.5', avg_accuracy: '0.95', avg_processing_time: '250', false_positive_count: '0', false_negative_count: '0', satisfaction_rate: '90.00' },
    ]);

    const res = await request(app)
      .get('/api/analytics/methods')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.methods).toHaveLength(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/top-issues
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/analytics/top-issues', () => {
  test('403 for non-admin', async () => {
    const token = generateAccessToken({ role: 'user' });
    mockDb.get.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .get('/api/analytics/top-issues')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
  });

  test('200 for admin', async () => {
    const token = generateAdminToken();

    mockDb.get.mockResolvedValueOnce({ id: 1 }); // session
    // getTopIssues -> 2x db.query (fpRows, fnRows)
    mockDb.query
      .mockResolvedValueOnce([]) // false positives
      .mockResolvedValueOnce([]); // false negatives

    const res = await request(app)
      .get('/api/analytics/top-issues')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.false_positives).toBeDefined();
    expect(res.body.false_negatives).toBeDefined();
  });
});
