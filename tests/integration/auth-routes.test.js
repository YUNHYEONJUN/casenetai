/**
 * Integration tests for /api/auth routes
 * Uses supertest to make real HTTP requests against the Express app
 * with mocked database and external dependencies.
 */

// Set env vars FIRST (before any imports)
process.env.JWT_SECRET = 'test-secret-key-for-jest-integration';
process.env.MASTER_PASSWORD = 'test-master-password';
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

// Mock rate limiters to pass through
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

// Mock passport strategies (avoid needing real OAuth credentials)
jest.mock('../../config/passport', () => require('passport'));

// Mock session cleanup
jest.mock('../../lib/sessionCleanup', () => ({
  cleanExpiredSessions: jest.fn(),
  startSessionCleanup: jest.fn(),
  stopSessionCleanup: jest.fn(),
}));

const request = require('supertest');
const app = require('../../server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../../lib/tokenBlacklist');

// Pre-generate bcrypt hash with low rounds for speed
const TEST_PASSWORD = 'Password1!';
const testHash = bcrypt.hashSync(TEST_PASSWORD, 4);

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
      organizationId: null,
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Helper: generate a valid refresh token
 */
function generateRefreshToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 1,
      type: 'refresh',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset default mock implementations
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
// POST /api/auth/login
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/auth/login', () => {
  test('400 with missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with password > 72 chars', async () => {
    const longPassword = 'A'.repeat(73);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: longPassword });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('401 with non-existent user', async () => {
    // db.get returns undefined (user not found)
    mockDb.get.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('401 with wrong password', async () => {
    mockDb.get.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      organization_id: null,
      service_type: 'elderly_protection',
      password_hash: testHash,
      status: 'active',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('401 with suspended user', async () => {
    mockDb.get.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      organization_id: null,
      service_type: 'elderly_protection',
      password_hash: testHash,
      status: 'suspended',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 success with correct credentials', async () => {
    // First call: user lookup in authService.login
    // Subsequent calls: credit lookup
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        organization_id: null,
        service_type: 'elderly_protection',
        password_hash: testHash,
        status: 'active',
      })
      .mockResolvedValueOnce({
        balance: 100,
        free_trial_count: 3,
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
  });

  test('response sets 3 cookies: access_token, refresh_token, is_logged_in', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        organization_id: null,
        service_type: 'elderly_protection',
        password_hash: testHash,
        status: 'active',
      })
      .mockResolvedValueOnce({
        balance: 100,
        free_trial_count: 3,
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies)).toBe(true);

    const cookieNames = cookies.map((c) => c.split('=')[0]);
    expect(cookieNames).toContain('access_token');
    expect(cookieNames).toContain('refresh_token');
    expect(cookieNames).toContain('is_logged_in');

    // access_token and refresh_token should be httpOnly
    const accessCookie = cookies.find((c) => c.startsWith('access_token='));
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
    const isLoggedInCookie = cookies.find((c) => c.startsWith('is_logged_in='));

    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    // is_logged_in should NOT be httpOnly
    expect(isLoggedInCookie).not.toMatch(/HttpOnly/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/register
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/auth/register', () => {
  const validPayload = {
    email: 'newuser@example.com',
    password: 'StrongPass1!',
    name: 'New User',
    phone: '010-1234-5678',
    masterPassword: 'test-master-password',
    role: 'user',
    credits: 10,
  };

  test('403 with wrong master password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, masterPassword: 'wrong-password' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, email: undefined });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with email > 254 chars', async () => {
    const longEmail = 'a'.repeat(250) + '@b.co';
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, email: longEmail });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with short password (< 8)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, password: 'Ab1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with password > 72 chars', async () => {
    const longPassword = 'Aa1!' + 'x'.repeat(69);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, password: longPassword });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 with weak password (letters only)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, password: 'abcdefghij' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 success with valid data and master password', async () => {
    // db.get for email duplicate check returns undefined (no existing user)
    mockDb.get.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/register')
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBeDefined();
  });

  test('negative credits should be normalized to 0', async () => {
    mockDb.get.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload, credits: -50 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The route calls Math.max(0, parseInt(credits) || 0) before passing to service
    // Verify the transaction was called (service ran successfully)
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/logout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/auth/logout', () => {
  test('200 even without token (always succeeds)', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('200 with valid token and clears cookies', async () => {
    const token = generateAccessToken();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify token was added to blacklist
    expect(tokenBlacklist.add).toHaveBeenCalledWith(token);

    // Verify cookies are cleared (set-cookie with empty values or past expiry)
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieNames = cookies.map((c) => c.split('=')[0]);
    expect(cookieNames).toContain('access_token');
    expect(cookieNames).toContain('refresh_token');
    expect(cookieNames).toContain('is_logged_in');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/refresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/auth/refresh', () => {
  test('400 with no refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('401 with invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['refresh_token=invalid-token-string']);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid refresh token from cookie', async () => {
    const refreshToken = generateRefreshToken({ userId: 1 });

    // First db.get call: session lookup by refresh_token
    // Second db.get call: user lookup
    mockDb.get
      .mockResolvedValueOnce({ id: 10, user_id: 1 }) // session found
      .mockResolvedValueOnce({
        id: 1,
        email: 'test@example.com',
        role: 'user',
        organization_id: null,
        status: 'active',
      });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${refreshToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    // Should set new cookies
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieNames = cookies.map((c) => c.split('=')[0]);
    expect(cookieNames).toContain('access_token');
    expect(cookieNames).toContain('refresh_token');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/auth/me
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/auth/me', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid token and session exists', async () => {
    const token = generateAccessToken({ userId: 1 });

    // First db.get call: session check in authenticateToken middleware
    // Second db.get call: user info query in authService.getUserInfo
    mockDb.get
      .mockResolvedValueOnce({ id: 10 }) // session exists
      .mockResolvedValueOnce({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        phone: '010-1234-5678',
        role: 'user',
        organization_id: null,
        created_at: '2026-01-01T00:00:00Z',
        balance: 100,
        free_trial_count: 3,
        total_purchased: 0,
        total_used: 0,
      });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.name).toBe('Test User');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/change-password
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/auth/change-password', () => {
  test('401 without token', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing fields', async () => {
    const token = generateAccessToken({ userId: 1 });

    // Session check in authenticateToken
    mockDb.get.mockResolvedValueOnce({ id: 10 });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', [`access_token=${token}`])
      .send({ currentPassword: 'OldPass1!' });
    // newPassword is missing

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
