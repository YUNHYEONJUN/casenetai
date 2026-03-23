/**
 * auth middleware unit tests
 */

process.env.JWT_SECRET = 'test-secret-key-for-jest';

const jwt = require('jsonwebtoken');

const mockDb = {
  query: jest.fn(async () => []),
  get: jest.fn(async () => undefined),
  run: jest.fn(async () => ({ lastID: null, changes: 0 })),
  all: jest.fn(async () => []),
};

jest.mock('../../database/db-postgres', () => ({
  getDB: () => mockDb,
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockBlacklist = {
  add: jest.fn(),
  has: jest.fn(() => false),
};
jest.mock('../../lib/tokenBlacklist', () => mockBlacklist);

const {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  isAdmin,
  extractToken,
} = require('../../middleware/auth');

const JWT_SECRET = 'test-secret-key-for-jest';

function createToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options });
}

const validPayload = {
  userId: 1,
  email: 'test@example.com',
  role: 'user',
  organizationId: 5,
};

const adminPayload = {
  userId: 2,
  email: 'admin@example.com',
  role: 'system_admin',
  organizationId: 1,
};

function createMocks(overrides = {}) {
  const req = { headers: {}, cookies: {}, user: null, ...overrides };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlacklist.has.mockReturnValue(false);
  });

  // ─── extractToken ───────────────────────────────────────────

  describe('extractToken', () => {
    it('should return token from Authorization: Bearer header', () => {
      const { req } = createMocks({
        headers: { authorization: 'Bearer my-token-123' },
      });
      expect(extractToken(req)).toBe('my-token-123');
    });

    it('should return token from cookie when no header', () => {
      const { req } = createMocks({
        cookies: { access_token: 'cookie-token-456' },
      });
      expect(extractToken(req)).toBe('cookie-token-456');
    });

    it('should prioritize header over cookie', () => {
      const { req } = createMocks({
        headers: { authorization: 'Bearer header-token' },
        cookies: { access_token: 'cookie-token' },
      });
      expect(extractToken(req)).toBe('header-token');
    });

    it('should return null when neither present', () => {
      const { req } = createMocks();
      expect(extractToken(req)).toBeNull();
    });

    it('should ignore non-Bearer auth headers', () => {
      const { req } = createMocks({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(extractToken(req)).toBeNull();
    });
  });

  // ─── authenticateToken ──────────────────────────────────────

  describe('authenticateToken', () => {
    it('should return 401 with no token', async () => {
      const { req, res, next } = createMocks();
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is blacklisted', async () => {
      const token = createToken(validPayload);
      mockBlacklist.has.mockReturnValue(true);
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for invalid JWT', async () => {
      const { req, res, next } = createMocks({
        headers: { authorization: 'Bearer not-a-valid-jwt' },
      });
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for expired JWT', async () => {
      const token = createToken(validPayload, { expiresIn: '-1s' });
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when no DB session found', async () => {
      const token = createToken(validPayload);
      mockDb.get.mockResolvedValueOnce(undefined);
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should fall through on DB error and call next', async () => {
      const token = createToken(validPayload);
      mockDb.get.mockRejectedValueOnce(new Error('DB connection failed'));
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        userId: validPayload.userId,
        email: validPayload.email,
        role: validPayload.role,
        organizationId: validPayload.organizationId,
      });
    });

    it('should set req.user correctly on success', async () => {
      const token = createToken(validPayload);
      mockDb.get.mockResolvedValueOnce({ id: 1 });
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        userId: 1,
        email: 'test@example.com',
        role: 'user',
        organizationId: 5,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should read token from cookie when no header', async () => {
      const token = createToken(validPayload);
      mockDb.get.mockResolvedValueOnce({ id: 1 });
      const { req, res, next } = createMocks({
        cookies: { access_token: token },
      });
      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.userId).toBe(validPayload.userId);
    });
  });

  // ─── optionalAuth ──────────────────────────────────────────

  describe('optionalAuth', () => {
    it('should set req.user with valid token', () => {
      const token = createToken(validPayload);
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        userId: validPayload.userId,
        email: validPayload.email,
        role: validPayload.role,
        organizationId: validPayload.organizationId,
      });
    });

    it('should call next without req.user when no token', () => {
      const { req, res, next } = createMocks();
      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });

    it('should call next without req.user when blacklisted token', () => {
      const token = createToken(validPayload);
      mockBlacklist.has.mockReturnValue(true);
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });

    it('should call next without req.user when invalid token', () => {
      const { req, res, next } = createMocks({
        headers: { authorization: 'Bearer garbage-token' },
      });
      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });
  });

  // ─── requireAdmin ──────────────────────────────────────────

  describe('requireAdmin', () => {
    it('should return 401 if no req.user', () => {
      const { req, res, next } = createMocks();
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for role user', () => {
      const { req, res, next } = createMocks({
        user: { userId: 1, role: 'user' },
      });
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next for system_admin', () => {
      const { req, res, next } = createMocks({
        user: { userId: 1, role: 'system_admin' },
      });
      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next for org_admin', () => {
      const { req, res, next } = createMocks({
        user: { userId: 1, role: 'org_admin' },
      });
      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ─── isAdmin (compound) ────────────────────────────────────

  describe('isAdmin', () => {
    it('should return 401 with no token', async () => {
      const { req, res, next } = createMocks();
      await isAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for non-admin user with valid token', async () => {
      const token = createToken(validPayload);
      mockDb.get.mockResolvedValueOnce({ id: 1 }); // session exists
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await isAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next for admin user with valid token and session', async () => {
      const token = createToken(adminPayload);
      mockDb.get.mockResolvedValueOnce({ id: 1 }); // session exists
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });
      await isAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
