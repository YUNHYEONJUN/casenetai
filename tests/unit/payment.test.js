/**
 * Payment routes unit/integration tests
 * Tests HTTP endpoints via supertest with mocked DB and dependencies.
 */

// Set env vars FIRST (before any imports)
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.MASTER_PASSWORD = 'test-master';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost/mock';
process.env.NODE_ENV = 'test';
process.env.TOSS_CLIENT_KEY = 'test_ck_jest';
process.env.TOSS_SECRET_KEY = 'test_sk_jest';

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
 * Helper: mock session check (authenticateToken middleware does db.get for session)
 * Call this before each authenticated request.
 */
function mockSession() {
  mockDb.get.mockResolvedValueOnce({ id: 10 }); // session row exists
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
// GET /api/payment/credit/balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/payment/credit/balance', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/payment/credit/balance');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns balance for existing credit row', async () => {
    const token = generateAccessToken();

    // 1st db.get: session check (authenticateToken)
    // 2nd db.get: creditService.getBalance SELECT
    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session
      .mockResolvedValueOnce({
        balance: 5000,
        free_trial_count: 2,
        total_purchased: 10000,
        total_used: 5000,
        total_bonus: 500,
      });

    const res = await request(app)
      .get('/api/payment/credit/balance')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.balance).toBe(5000);
    expect(res.body.freeTrialCount).toBe(2);
    expect(res.body.totalPurchased).toBe(10000);
    expect(res.body.totalUsed).toBe(5000);
    expect(res.body.totalBonus).toBe(500);
  });

  test('200 returns default balance for new user (no credit row)', async () => {
    const token = generateAccessToken();

    // 1st db.get: session check
    // 2nd db.get: creditService.getBalance returns undefined (new user)
    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .get('/api/payment/credit/balance')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.balance).toBe(0);
    expect(res.body.freeTrialCount).toBe(3);
    // Should have called db.run to INSERT default credit row
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO credits'),
      expect.any(Array)
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/payment/credit/transactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/payment/credit/transactions', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/payment/credit/transactions');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns transaction list', async () => {
    const token = generateAccessToken();

    const mockTransactions = [
      { id: 1, type: 'purchase', amount: 5000, balance_after: 5000, description: 'test', created_at: '2026-01-01' },
      { id: 2, type: 'usage', amount: -1000, balance_after: 4000, description: 'test2', created_at: '2026-01-02' },
    ];

    // 1st db.get: session check
    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session
      .mockResolvedValueOnce({ count: 2 }); // total count query

    // db.query: transaction list
    mockDb.query.mockResolvedValueOnce(mockTransactions);

    const res = await request(app)
      .get('/api/payment/credit/transactions')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transactions).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(50); // default
    expect(res.body.offset).toBe(0); // default
  });

  test('200 with custom limit and offset', async () => {
    const token = generateAccessToken();

    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ count: 100 });
    mockDb.query.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/payment/credit/transactions?limit=10&offset=20')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(20);
  });

  test('400 with invalid limit (> 100)', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/credit/transactions?limit=200')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with negative offset', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/credit/transactions?offset=-1')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/payment/credit/stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/payment/credit/stats', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/payment/credit/stats');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns usage stats', async () => {
    const token = generateAccessToken();

    // 1st db.get: session
    // 2nd db.get: totalStats
    // 3rd db.get: monthStats
    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({
        total_count: 15,
        total_minutes: 120.5,
        total_cost: 30000,
        free_trial_used: 3,
      })
      .mockResolvedValueOnce({
        count: 5,
        minutes: 40.2,
        cost: 10000,
      });

    // db.query: recentUsage
    mockDb.query.mockResolvedValueOnce([
      { consultation_type: 'general', audio_duration_seconds: 600, total_cost: 2000 },
    ]);

    const res = await request(app)
      .get('/api/payment/credit/stats')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total.count).toBe(15);
    expect(res.body.total.minutes).toBe(120.5);
    expect(res.body.total.cost).toBe(30000);
    expect(res.body.total.freeTrialUsed).toBe(3);
    expect(res.body.thisMonth.count).toBe(5);
    expect(res.body.recent).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/payment/prepare
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/payment/prepare', () => {
  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/api/payment/prepare')
      .send({ amount: 5000 });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing amount', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with amount < 1000', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({ amount: 999 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with amount > 10,000,000', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({ amount: 10000001 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid amount (exact min 1000)', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // session
    mockDb.run.mockResolvedValueOnce({ lastID: 1, changes: 1 }); // INSERT payment

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({ amount: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toMatch(/^ORDER_1_/);
    expect(res.body.amount).toBe(1000);
    expect(res.body.bonusAmount).toBe(0); // < 5000 = no bonus
    expect(res.body.totalCredit).toBe(1000);
    expect(res.body.clientKey).toBeDefined();
    expect(res.body.successUrl).toContain('payment-success');
    expect(res.body.failUrl).toContain('payment-fail');
  });

  test('200 with amount that qualifies for bonus', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 1, changes: 1 });

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({ amount: 10000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.amount).toBe(10000);
    expect(res.body.bonusAmount).toBe(2000); // 20% bonus
    expect(res.body.totalCredit).toBe(12000);
  });

  test('200 with exact max amount (10,000,000)', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 1, changes: 1 });

    const res = await request(app)
      .post('/api/payment/prepare')
      .set('Cookie', [`access_token=${token}`])
      .send({ amount: 10000000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.amount).toBe(10000000);
    expect(res.body.bonusAmount).toBe(3000000); // 30%
    expect(res.body.totalCredit).toBe(13000000);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/payment/confirm
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/payment/confirm', () => {
  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .send({ orderId: 'ORD_1', paymentKey: 'pk_1', amount: 5000 });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing orderId', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ paymentKey: 'pk_1', amount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing paymentKey', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1', amount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing amount', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1', paymentKey: 'pk_1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with non-positive amount', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1', paymentKey: 'pk_1', amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid confirm data (test mode, pending payment)', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // session

    // Mock the transaction: confirmPayment runs inside db.transaction
    const mockClient = {
      query: jest.fn()
        // 1: SELECT payment FOR UPDATE
        .mockResolvedValueOnce({
          rows: [{
            user_id: 1,
            amount: 5000,
            bonus_amount: 500,
            total_credit: 5500,
            status: 'pending',
          }],
        })
        // 2: toss API will fail in test, fallback to test mode mock
        // 3: SELECT credits FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ balance: 1000 }] })
        // 4: UPDATE credits RETURNING balance
        .mockResolvedValueOnce({ rows: [{ balance: 6500 }] })
        // 5: INSERT transaction
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // 6: UPDATE payments SET status='success'
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORDER_1_123', paymentKey: 'pk_test_123', amount: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toBe('ORDER_1_123');
    expect(res.body.balance).toBe(6500);
  });

  test('500 when payment not found in DB', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // session

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }), // no payment found
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_NONEXIST', paymentKey: 'pk_1', amount: 5000 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('500 when payment belongs to different user', async () => {
    const token = generateAccessToken({ userId: 1 });
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            user_id: 999, // different user
            amount: 5000,
            bonus_amount: 0,
            total_credit: 5000,
            status: 'pending',
          }],
        }),
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1', paymentKey: 'pk_1', amount: 5000 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/payment/fail
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/payment/fail', () => {
  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/api/payment/fail')
      .send({ orderId: 'ORD_1' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing orderId', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/payment/fail')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 marks payment as failed', async () => {
    const token = generateAccessToken();
    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session
      .mockResolvedValueOnce({ user_id: 1 }); // payment lookup
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/payment/fail')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1', errorCode: 'PAY_ERR', errorMessage: 'Card declined' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('500 when payment not found', async () => {
    const token = generateAccessToken();
    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session
      .mockResolvedValueOnce(undefined); // payment not found

    const res = await request(app)
      .post('/api/payment/fail')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_NONEXIST' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('500 when user does not own the payment', async () => {
    const token = generateAccessToken({ userId: 1 });
    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ user_id: 999 }); // belongs to different user

    const res = await request(app)
      .post('/api/payment/fail')
      .set('Cookie', [`access_token=${token}`])
      .send({ orderId: 'ORD_1' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/payment/history
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/payment/history', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/payment/history');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns payment history', async () => {
    const token = generateAccessToken();

    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session
      .mockResolvedValueOnce({ count: 2 }); // total count
    mockDb.query.mockResolvedValueOnce([
      { order_id: 'O1', amount: 5000, status: 'success', created_at: '2026-01-01' },
      { order_id: 'O2', amount: 10000, status: 'pending', created_at: '2026-01-02' },
    ]);

    const res = await request(app)
      .get('/api/payment/history')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(20); // default
    expect(res.body.offset).toBe(0); // default
  });

  test('200 with custom pagination', async () => {
    const token = generateAccessToken();

    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ count: 50 });
    mockDb.query.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/payment/history?limit=5&offset=10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    expect(res.body.offset).toBe(10);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/payment/bonus/:amount
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/payment/bonus/:amount', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/payment/bonus/5000');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns bonus calculation for 5000', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/bonus/5000')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.amount).toBe(5000);
    expect(res.body.bonusAmount).toBe(500); // 10%
    expect(res.body.totalCredit).toBe(5500);
    expect(res.body.bonusRate).toBe(10);
  });

  test('200 returns 0 bonus for amount below 5000', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/bonus/1000')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.bonusAmount).toBe(0);
    expect(res.body.totalCredit).toBe(1000);
    expect(res.body.bonusRate).toBe(0);
  });

  test('200 returns 30% bonus for 50000+', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/bonus/100000')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.bonusAmount).toBe(30000);
    expect(res.body.totalCredit).toBe(130000);
    expect(res.body.bonusRate).toBe(30);
  });

  test('400 with negative amount', async () => {
    const token = generateAccessToken();
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .get('/api/payment/bonus/-1')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CreditService direct unit tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('CreditService (deduct via route-level logic)', () => {
  // These test the creditService.deduct method indirectly through its logic
  // The service is already tested in creditService.test.js, but we add
  // additional coverage for the deduction path here.

  const creditService = require('../../services/creditService');

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue([]);
    mockDb.get.mockResolvedValue(undefined);
    mockDb.run.mockResolvedValue({ lastID: null, changes: 0 });
  });

  test('deduct succeeds with sufficient balance', async () => {
    const mockClient = {
      query: jest.fn()
        // 1: user lookup
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        // 2: credit lookup FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
        // 3: UPDATE credits (deduct)
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ balance: 3000 }] })
        // 4: INSERT transaction
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const result = await creditService.deduct(1, 2000, 5, 'general', 'whisper', 'gpt4');

    expect(result.success).toBe(true);
    expect(result.charged).toBe(2000);
    expect(result.balance).toBe(3000);
  });

  test('deduct throws with insufficient balance', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ balance: 500, free_trial_count: 0 }] }),
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    await expect(creditService.deduct(1, 2000, 5, 'general', 'whisper', 'gpt4'))
      .rejects.toThrow('크레딧이 부족합니다');
  });

  test('deduct uses free trial when available', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] }) // user
        .mockResolvedValueOnce({ rows: [{ balance: 1000, free_trial_count: 2 }] }) // credits
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ free_trial_count: 1, balance: 1000 }] }) // trial update
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }), // transaction insert
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const result = await creditService.deduct(1, 2000, 5, 'general', 'whisper', 'gpt4');

    expect(result.success).toBe(true);
    expect(result.charged).toBe(0);
    expect(result.freeTrialRemaining).toBe(1);
  });

  test('deduct is free for active org users', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ organization_id: 10 }] }) // user with org
        .mockResolvedValueOnce({
          rows: [{
            subscription_status: 'active',
            status: 'active',
            expiry_date: null,
          }],
        }), // org status
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    const result = await creditService.deduct(1, 2000, 5, 'general', 'whisper', 'gpt4');

    expect(result.success).toBe(true);
    expect(result.charged).toBe(0);
    expect(result.message).toContain('기관');
  });

  test('deduct throws when user not found', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }), // no user
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    await expect(creditService.deduct(999, 2000, 5, 'general', 'whisper', 'gpt4'))
      .rejects.toThrow('사용자를 찾을 수 없습니다');
  });

  test('deduct throws when credit record not found', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] }) // user
        .mockResolvedValueOnce({ rows: [] }), // no credit record
    };
    mockDb.transaction.mockImplementation(async (cb) => cb(mockClient));

    await expect(creditService.deduct(1, 2000, 5, 'general', 'whisper', 'gpt4'))
      .rejects.toThrow('크레딧 정보를 찾을 수 없습니다');
  });
});
