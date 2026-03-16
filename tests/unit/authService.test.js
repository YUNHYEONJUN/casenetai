/**
 * AuthService unit tests
 */

// Set JWT_SECRET before requiring authService (it throws without it)
process.env.JWT_SECRET = 'test-secret-key-for-jest';

const jwt = require('jsonwebtoken');

// Mock db-postgres
const mockDb = {
  query: jest.fn(async () => []),
  get: jest.fn(async () => undefined),
  run: jest.fn(async () => ({ lastID: null, changes: 0 })),
  all: jest.fn(async () => []),
  transaction: jest.fn(async (cb) => cb({
    query: jest.fn(async () => ({ rows: [{ id: 1 }] })),
  })),
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

jest.mock('../../lib/tokenBlacklist', () => ({
  add: jest.fn(),
  has: jest.fn(() => false),
}));

const authService = require('../../services/authService');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should reject duplicate email', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 1 });
      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password1!',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('이미 사용 중인 이메일입니다');
    });

    it('should reject password shorter than 8 characters', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Ab1!',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 최소 8자 이상이어야 합니다');
    });

    it('should reject empty/null password', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: '',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 최소 8자 이상이어야 합니다');
    });

    it('should reject password with only letters (needs 2+ categories)', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'abcdefgh',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
    });

    it('should reject password with only numbers', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: '12345678',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
    });

    it('should accept password with letters + numbers', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 42 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password1',
        name: 'Test',
        phone: '010-1234-5678',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(42);
    });

    it('should accept password with letters + special chars', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 10 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.register({
        email: 'test2@example.com',
        password: 'Password!@#',
        name: 'Test',
        phone: '010-1234-5678',
      });

      expect(result.success).toBe(true);
    });

    it('should accept password with numbers + special chars', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 11 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.register({
        email: 'test3@example.com',
        password: '12345678!@',
        name: 'Test',
        phone: '010-1234-5678',
      });

      expect(result.success).toBe(true);
    });

    it('should create user with free trial credits in transaction', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 99 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.register({
        email: 'new@example.com',
        password: 'StrongPass1!',
        name: 'New User',
        phone: '010-9999-8888',
        organizationId: 5,
        serviceType: 'elderly_protection',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(99);
      // 2 ALTER TABLE (constraint fix) + INSERT user + INSERT credits = 4
      expect(clientQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user', organizationId: null },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const result = authService.verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(1);
      expect(result.email).toBe('test@test.com');
      expect(result.role).toBe('user');
    });

    it('should reject an invalid token', () => {
      const result = authService.verifyToken('invalid.token.here');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an expired token', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );
      const result = authService.verifyToken(token);
      expect(result.valid).toBe(false);
    });

    it('should reject a token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      const result = authService.verifyToken(token);
      expect(result.valid).toBe(false);
    });

    it('should return null organizationId when not present', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const result = authService.verifyToken(token);
      expect(result.organizationId).toBeNull();
    });
  });

  describe('refreshTokenWithRotation', () => {
    it('should reject access token used as refresh token (has email/role)', async () => {
      const accessToken = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      await expect(authService.refreshTokenWithRotation(accessToken)).rejects.toThrow(
        '유효하지 않은 리프레시 토큰입니다'
      );
    });

    it('should invalidate all sessions when reused refresh token detected', async () => {
      const refreshToken = jwt.sign(
        { userId: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get.mockResolvedValueOnce(undefined);

      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow(
        '보안 위험 감지'
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE user_id = $1',
        [1]
      );
    });

    it('should reject if user not found after valid session', async () => {
      const refreshToken = jwt.sign(
        { userId: 999 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get
        .mockResolvedValueOnce({ id: 10, user_id: 999 })
        .mockResolvedValueOnce(undefined);

      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow(
        '사용자를 찾을 수 없습니다'
      );
    });

    it('should issue new tokens on valid refresh', async () => {
      const refreshToken = jwt.sign(
        { userId: 5 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get
        .mockResolvedValueOnce({ id: 10, user_id: 5 })
        .mockResolvedValueOnce({ id: 5, email: 'u@test.com', role: 'user', organization_id: 2 });

      const result = await authService.refreshTokenWithRotation(refreshToken);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.newRefreshToken).toBeDefined();
      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(5);
      expect(decoded.role).toBe('user');
      expect(decoded.organizationId).toBe(2);
    });

    it('should reject expired refresh token', async () => {
      const refreshToken = jwt.sign(
        { userId: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );
      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('should reject non-existent user', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.login({ email: 'nobody@test.com', password: 'pass' })
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    it('should reject social-only account (no password_hash)', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        email: 'social@test.com',
        role: 'user',
        password_hash: null,
      });
      await expect(
        authService.login({ email: 'social@test.com', password: 'pass' })
      ).rejects.toThrow('소셜 로그인 전용');
    });
  });

  describe('logout', () => {
    it('should delete session and blacklist token', async () => {
      mockDb.run.mockResolvedValueOnce({ changes: 1 });
      const result = await authService.logout('some-token');
      expect(result.success).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE token = $1',
        ['some-token']
      );
    });
  });

  describe('getUserInfo', () => {
    it('should throw if user not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(authService.getUserInfo(999)).rejects.toThrow('사용자를 찾을 수 없습니다');
    });

    it('should return user info with organization', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1, email: 'u@test.com', name: 'User', phone: '010',
          role: 'user', organization_id: 3, created_at: '2025-01-01',
          balance: 100, free_trial_count: 2, total_purchased: 500, total_used: 400,
        })
        .mockResolvedValueOnce({
          id: 3, name: 'Org', plan_type: 'pro', subscription_status: 'active',
        });

      const result = await authService.getUserInfo(1);
      expect(result.success).toBe(true);
      expect(result.user.email).toBe('u@test.com');
      expect(result.user.credit).toBe(100);
      expect(result.user.organization.name).toBe('Org');
    });

    it('should return user info without organization', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 2, email: 'solo@test.com', name: 'Solo', phone: '010',
        role: 'user', organization_id: null, created_at: '2025-01-01',
        balance: null, free_trial_count: null,
      });

      const result = await authService.getUserInfo(2);
      expect(result.success).toBe(true);
      expect(result.user.organization).toBeNull();
      expect(result.user.credit).toBe(0);
      expect(result.user.freeTrialCount).toBe(0);
    });
  });
});
