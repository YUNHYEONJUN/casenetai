/**
 * AuthService unit tests
 */

// Set JWT_SECRET before requiring authService (it throws without it)
process.env.JWT_SECRET = 'test-secret-key-for-jest';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Pre-hash a known password for login tests (bcryptjs, cost 4 for speed)
const KNOWN_PASSWORD = 'Password1!';
let KNOWN_PASSWORD_HASH;

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

const mockTokenBlacklist = {
  add: jest.fn(),
  has: jest.fn(() => false),
};

jest.mock('../../lib/tokenBlacklist', () => mockTokenBlacklist);

const authService = require('../../services/authService');

beforeAll(async () => {
  KNOWN_PASSWORD_HASH = await bcrypt.hash(KNOWN_PASSWORD, 4);
});

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // register
  // ─────────────────────────────────────────────
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
      // INSERT user + INSERT credits = 2 client.query calls
      expect(clientQuery).toHaveBeenCalledTimes(2);
    });

    it('should reject password longer than 72 characters', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const longPassword = 'Aa1!' + 'x'.repeat(69); // 73 chars
      await expect(
        authService.register({
          email: 'test@example.com',
          password: longPassword,
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 최대 72자까지 가능합니다');
    });

    it('should accept password exactly 72 characters long', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 50 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const maxPassword = 'Aa1!' + 'x'.repeat(68); // exactly 72 chars
      const result = await authService.register({
        email: 'test@example.com',
        password: maxPassword,
        name: 'Test',
        phone: '010-1234-5678',
      });

      expect(result.success).toBe(true);
    });

    it('should reject password containing null byte', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password1!\0hidden',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호에 허용되지 않는 문자가 포함되어 있습니다');
    });

    it('should normalize email to lowercase', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 60 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      await authService.register({
        email: '  TEST@Example.COM  ',
        password: 'Password1!',
        name: 'Test',
        phone: '010-1234-5678',
      });

      // db.get for duplicate check should receive lowercased trimmed email
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.any(String),
        ['test@example.com']
      );
    });

    it('should return userId from transaction result', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 77 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => {
        const res = await cb({ query: clientQuery });
        return res;
      });

      const result = await authService.register({
        email: 'new2@example.com',
        password: 'Password1!',
        name: 'Test',
        phone: '010-0000-0000',
      });

      expect(result.userId).toBe(77);
      expect(result.message).toBe('회원가입이 완료되었습니다');
    });

    it('should reject password with only special chars', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.register({
          email: 'test@example.com',
          password: '!@#$%^&*',
          name: 'Test',
          phone: '010-1234-5678',
        })
      ).rejects.toThrow('비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
    });

    it('should use default serviceType and organizationId', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 80 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      await authService.register({
        email: 'defaults@example.com',
        password: 'Password1!',
        name: 'Test',
        phone: '010-1234-5678',
      });

      // INSERT user query should include null org and 'elderly_protection'
      const insertCall = clientQuery.mock.calls[0];
      expect(insertCall[1]).toContain(null); // organizationId default
      expect(insertCall[1]).toContain('elderly_protection'); // serviceType default
    });
  });

  // ─────────────────────────────────────────────
  // registerWithRole
  // ─────────────────────────────────────────────
  describe('registerWithRole', () => {
    it('should create admin user with role and credits', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 200 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.registerWithRole({
        email: 'admin@example.com',
        password: 'AdminPass1!',
        name: 'Admin',
        phone: '010-1111-2222',
        organizationId: 3,
        role: 'org_admin',
        credits: 1000,
        serviceType: 'elderly_protection',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(200);
      expect(result.role).toBe('org_admin');
      expect(result.credits).toBe(1000);
      expect(result.message).toBe('관리자 계정이 성공적으로 생성되었습니다');
      // INSERT user + INSERT credits = 2 calls
      expect(clientQuery).toHaveBeenCalledTimes(2);
    });

    it('should reject duplicate email', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 1 });
      await expect(
        authService.registerWithRole({
          email: 'exists@example.com',
          password: 'Password1!',
          name: 'Admin',
          phone: '010-1111-2222',
          role: 'org_admin',
        })
      ).rejects.toThrow('이미 사용 중인 이메일입니다');
    });

    it('should reject short password', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.registerWithRole({
          email: 'admin@example.com',
          password: 'Ab1!',
          name: 'Admin',
          phone: '010-1111-2222',
        })
      ).rejects.toThrow('비밀번호는 최소 8자 이상이어야 합니다');
    });

    it('should reject password longer than 72 characters', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.registerWithRole({
          email: 'admin@example.com',
          password: 'Aa1!' + 'x'.repeat(69),
          name: 'Admin',
          phone: '010-1111-2222',
        })
      ).rejects.toThrow('비밀번호는 최대 72자까지 가능합니다');
    });

    it('should reject password with null byte', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.registerWithRole({
          email: 'admin@example.com',
          password: 'Password1!\0evil',
          name: 'Admin',
          phone: '010-1111-2222',
        })
      ).rejects.toThrow('비밀번호에 허용되지 않는 문자가 포함되어 있습니다');
    });

    it('should reject weak password (single category)', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.registerWithRole({
          email: 'admin@example.com',
          password: 'abcdefgh',
          name: 'Admin',
          phone: '010-1111-2222',
        })
      ).rejects.toThrow('비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
    });

    it('should normalize email to lowercase', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 201 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      await authService.registerWithRole({
        email: '  ADMIN@Example.COM  ',
        password: 'Password1!',
        name: 'Admin',
        phone: '010-1111-2222',
      });

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.any(String),
        ['admin@example.com']
      );
    });

    it('should use default role=user and credits=0', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 202 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      const result = await authService.registerWithRole({
        email: 'user@example.com',
        password: 'Password1!',
        name: 'User',
        phone: '010-1111-2222',
      });

      expect(result.role).toBe('user');
      expect(result.credits).toBe(0);
    });

    it('should insert with is_approved=true for admin registration', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 203 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      await authService.registerWithRole({
        email: 'approved@example.com',
        password: 'Password1!',
        name: 'Admin',
        phone: '010-1111-2222',
        role: 'admin',
        credits: 500,
      });

      // The INSERT query includes is_approved and the role
      const insertCall = clientQuery.mock.calls[0];
      const sql = insertCall[0];
      expect(sql).toContain('is_approved');
      expect(insertCall[1]).toContain('admin');
    });

    it('should set specified credits (not free_trial_count)', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const clientQuery = jest.fn(async () => ({ rows: [{ id: 204 }] }));
      mockDb.transaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

      await authService.registerWithRole({
        email: 'credits@example.com',
        password: 'Password1!',
        name: 'Admin',
        phone: '010-1111-2222',
        credits: 5000,
      });

      // Credits INSERT should use the specified amount with free_trial_count=0
      const creditsCall = clientQuery.mock.calls[1];
      const sql = creditsCall[0];
      expect(sql).toContain('credits');
      expect(creditsCall[1]).toContain(5000);
    });
  });

  // ─────────────────────────────────────────────
  // verifyToken
  // ─────────────────────────────────────────────
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

    it('should return organizationId when present', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user', organizationId: 7 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const result = authService.verifyToken(token);
      expect(result.organizationId).toBe(7);
    });
  });

  // ─────────────────────────────────────────────
  // refreshTokenWithRotation
  // ─────────────────────────────────────────────
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
      // First db.get: no session found by refresh_token
      mockDb.get.mockResolvedValueOnce(undefined);
      // Second db.get: no session found by previous_refresh_token (grace period expired)
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

    it('should allow refresh via grace period (previous_refresh_token)', async () => {
      const refreshToken = jwt.sign(
        { userId: 5 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      // First db.get: no session found by current refresh_token
      mockDb.get.mockResolvedValueOnce(undefined);
      // Second db.get: session found via previous_refresh_token (grace period)
      mockDb.get.mockResolvedValueOnce({ id: 20, user_id: 5 });
      // Third db.get: user found
      mockDb.get.mockResolvedValueOnce({ id: 5, email: 'u@test.com', role: 'user', organization_id: null, status: 'active' });

      const result = await authService.refreshTokenWithRotation(refreshToken);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.newRefreshToken).toBeDefined();
    });

    it('should block refresh for suspended user', async () => {
      const refreshToken = jwt.sign(
        { userId: 5 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get
        .mockResolvedValueOnce({ id: 10, user_id: 5 })
        .mockResolvedValueOnce({ id: 5, email: 'u@test.com', role: 'user', organization_id: null, status: 'suspended' });

      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow(
        '비활성화된 계정입니다'
      );
      // Should delete all sessions for that user
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE user_id = $1',
        [5]
      );
    });

    it('should block refresh for deleted user status', async () => {
      const refreshToken = jwt.sign(
        { userId: 5 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get
        .mockResolvedValueOnce({ id: 10, user_id: 5 })
        .mockResolvedValueOnce({ id: 5, email: 'u@test.com', role: 'user', organization_id: null, status: 'deleted' });

      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow(
        '비활성화된 계정입니다'
      );
    });

    it('should update session with rotated tokens', async () => {
      const refreshToken = jwt.sign(
        { userId: 5 },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockDb.get
        .mockResolvedValueOnce({ id: 10, user_id: 5 })
        .mockResolvedValueOnce({ id: 5, email: 'u@test.com', role: 'user', organization_id: null, status: 'active' });

      await authService.refreshTokenWithRotation(refreshToken);

      // Should call db.run to UPDATE sessions with new tokens
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        expect.arrayContaining([10]) // session.id
      );
    });

    it('should reject token with only type=refresh but wrong secret', async () => {
      const refreshToken = jwt.sign(
        { userId: 1, type: 'refresh' },
        'wrong-secret',
        { expiresIn: '7d' }
      );
      await expect(authService.refreshTokenWithRotation(refreshToken)).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────
  // login
  // ─────────────────────────────────────────────
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

    it('should reject wrong password', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        name: 'User',
        role: 'user',
        organization_id: null,
        service_type: 'elderly_protection',
        password_hash: KNOWN_PASSWORD_HASH,
        status: 'active',
      });

      await expect(
        authService.login({
          email: 'user@test.com',
          password: 'WrongPassword1!',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    it('should successfully login with correct credentials', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: 3,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce({ balance: 100, free_trial_count: 2 }); // credit query

      const result = await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest Test',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(1);
      expect(result.user.email).toBe('user@test.com');
      expect(result.user.name).toBe('User');
      expect(result.user.role).toBe('user');
      expect(result.user.organizationId).toBe(3);
      expect(result.user.credit).toBe(100);
      expect(result.user.freeTrialCount).toBe(2);
    });

    it('should reject suspended user', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        name: 'Suspended',
        role: 'user',
        organization_id: null,
        service_type: 'elderly_protection',
        password_hash: KNOWN_PASSWORD_HASH,
        status: 'suspended',
      });

      await expect(
        authService.login({
          email: 'user@test.com',
          password: KNOWN_PASSWORD,
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('정지된 계정입니다');
    });

    it('should reject deleted user', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        name: 'Deleted',
        role: 'user',
        organization_id: null,
        service_type: 'elderly_protection',
        password_hash: KNOWN_PASSWORD_HASH,
        status: 'deleted',
      });

      await expect(
        authService.login({
          email: 'user@test.com',
          password: KNOWN_PASSWORD,
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('삭제된 계정입니다');
    });

    it('should normalize email to lowercase for lookup', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);

      await expect(
        authService.login({
          email: '  USER@Test.COM  ',
          password: 'pass',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.any(String),
        ['user@test.com']
      );
    });

    it('should clean old sessions when exceeding max (10)', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: null,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce({ balance: 0, free_trial_count: 0 }); // credit

      await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      // Should delete old sessions with OFFSET 9 (MAX_SESSIONS - 1)
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sessions WHERE id IN'),
        [1, 9]
      );
    });

    it('should save session with token, refresh token, ip, and user agent', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: null,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce({ balance: 0, free_trial_count: 0 });

      await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Check session INSERT was called with correct params
      const insertSessionCall = mockDb.run.mock.calls.find(
        call => call[0].includes('INSERT INTO sessions')
      );
      expect(insertSessionCall).toBeDefined();
      const params = insertSessionCall[1];
      expect(params[0]).toBe(1); // user_id
      expect(params[3]).toBe('192.168.1.1'); // ip_address
      expect(params[4]).toBe('Mozilla/5.0'); // user_agent
    });

    it('should update last_login_at on successful login', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: null,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce({ balance: 0, free_trial_count: 0 });

      await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      const updateCall = mockDb.run.mock.calls.find(
        call => call[0].includes('UPDATE users SET last_login_at')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([1]);
    });

    it('should return default credit values when no credits record', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: null,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce(undefined); // no credits row

      const result = await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      expect(result.user.credit).toBe(0);
      expect(result.user.freeTrialCount).toBe(0);
    });

    it('should allow login when status is null/undefined (treated as active)', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          email: 'user@test.com',
          name: 'User',
          role: 'user',
          organization_id: null,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: null,
        })
        .mockResolvedValueOnce({ balance: 50, free_trial_count: 1 });

      const result = await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      expect(result.success).toBe(true);
    });

    it('should return valid JWT tokens on login', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 7,
          email: 'user@test.com',
          name: 'User',
          role: 'org_admin',
          organization_id: 5,
          service_type: 'elderly_protection',
          password_hash: KNOWN_PASSWORD_HASH,
          status: 'active',
        })
        .mockResolvedValueOnce({ balance: 0, free_trial_count: 0 });

      const result = await authService.login({
        email: 'user@test.com',
        password: KNOWN_PASSWORD,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      // Verify access token contents
      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(7);
      expect(decoded.email).toBe('user@test.com');
      expect(decoded.role).toBe('org_admin');
      expect(decoded.organizationId).toBe(5);

      // Verify refresh token contents
      const refreshDecoded = jwt.verify(result.refreshToken, process.env.JWT_SECRET);
      expect(refreshDecoded.userId).toBe(7);
      expect(refreshDecoded.type).toBe('refresh');
      // Refresh token should NOT have email/role
      expect(refreshDecoded.email).toBeUndefined();
      expect(refreshDecoded.role).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // logout
  // ─────────────────────────────────────────────
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

    it('should add token to blacklist', async () => {
      mockDb.run.mockResolvedValueOnce({ changes: 1 });
      await authService.logout('blacklist-me');
      expect(mockTokenBlacklist.add).toHaveBeenCalledWith('blacklist-me');
    });

    it('should return success even if session not found', async () => {
      mockDb.run.mockResolvedValueOnce({ changes: 0 });
      const result = await authService.logout('nonexistent-token');
      expect(result.success).toBe(true);
      expect(result.message).toBe('로그아웃되었습니다');
    });

    it('should propagate db errors', async () => {
      mockDb.run.mockRejectedValueOnce(new Error('DB connection lost'));
      await expect(authService.logout('some-token')).rejects.toThrow('DB connection lost');
    });
  });

  // ─────────────────────────────────────────────
  // changePassword
  // ─────────────────────────────────────────────
  describe('changePassword', () => {
    it('should throw if user not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        authService.changePassword({
          userId: 999,
          currentPassword: 'OldPass1!',
          newPassword: 'NewPass1!',
        })
      ).rejects.toThrow('사용자를 찾을 수 없습니다');
    });

    it('should throw if user is social-only (not local)', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: null,
        oauth_provider: 'kakao',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: 'OldPass1!',
          newPassword: 'NewPass1!',
        })
      ).rejects.toThrow('소셜 로그인 계정은 비밀번호를 변경할 수 없습니다');
    });

    it('should throw if oauth_provider is not local even with password_hash', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'google',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'NewPass1!',
        })
      ).rejects.toThrow('소셜 로그인 계정은 비밀번호를 변경할 수 없습니다');
    });

    it('should throw if current password is wrong', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: 'WrongPass1!',
          newPassword: 'NewPass1!',
        })
      ).rejects.toThrow('현재 비밀번호가 올바르지 않습니다');
    });

    it('should reject new password shorter than 8 chars', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'Ab1!',
        })
      ).rejects.toThrow('비밀번호는 최소 8자 이상이어야 합니다');
    });

    it('should reject new password longer than 72 chars', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'Aa1!' + 'x'.repeat(69),
        })
      ).rejects.toThrow('비밀번호는 최대 72자까지 가능합니다');
    });

    it('should reject new password with null byte', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'NewPass1!\0evil',
        })
      ).rejects.toThrow('비밀번호에 허용되지 않는 문자가 포함되어 있습니다');
    });

    it('should reject new password with only one category', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      await expect(
        authService.changePassword({
          userId: 1,
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'abcdefgh',
        })
      ).rejects.toThrow('비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다');
    });

    it('should successfully change password and delete all sessions', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      // db.query for listing sessions
      mockDb.query.mockResolvedValueOnce([
        { token: 'session-token-1' },
        { token: 'session-token-2' },
      ]);

      const result = await authService.changePassword({
        userId: 1,
        currentPassword: KNOWN_PASSWORD,
        newPassword: 'NewStrongPass1!',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('비밀번호가 변경되었습니다. 다시 로그인해주세요.');

      // Should update password_hash
      const updateCall = mockDb.run.mock.calls.find(
        call => call[0].includes('UPDATE users SET password_hash')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][1]).toBe(1); // userId

      // Should blacklist all existing session tokens
      expect(mockTokenBlacklist.add).toHaveBeenCalledWith('session-token-1');
      expect(mockTokenBlacklist.add).toHaveBeenCalledWith('session-token-2');

      // Should delete all sessions for the user
      const deleteCall = mockDb.run.mock.calls.find(
        call => call[0].includes('DELETE FROM sessions WHERE user_id')
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual([1]);
    });

    it('should handle user with no existing sessions', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1,
        password_hash: KNOWN_PASSWORD_HASH,
        oauth_provider: 'local',
      });
      mockDb.query.mockResolvedValueOnce([]); // no sessions

      const result = await authService.changePassword({
        userId: 1,
        currentPassword: KNOWN_PASSWORD,
        newPassword: 'NewStrongPass1!',
      });

      expect(result.success).toBe(true);
      expect(mockTokenBlacklist.add).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // getUserInfo
  // ─────────────────────────────────────────────
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

    it('should return all credit fields with defaults', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 3, email: 'u@test.com', name: 'User', phone: '010',
        role: 'user', organization_id: null, created_at: '2025-01-01',
        balance: null, free_trial_count: null, total_purchased: null, total_used: null,
      });

      const result = await authService.getUserInfo(3);
      expect(result.user.credit).toBe(0);
      expect(result.user.freeTrialCount).toBe(0);
      expect(result.user.totalPurchased).toBe(0);
      expect(result.user.totalUsed).toBe(0);
    });

    it('should return createdAt from user record', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 4, email: 'u@test.com', name: 'User', phone: '010',
        role: 'user', organization_id: null, created_at: '2025-06-15T12:00:00Z',
        balance: 10, free_trial_count: 1, total_purchased: 50, total_used: 40,
      });

      const result = await authService.getUserInfo(4);
      expect(result.user.createdAt).toBe('2025-06-15T12:00:00Z');
    });

    it('should return full organization details', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 5, email: 'u@test.com', name: 'User', phone: '010',
          role: 'org_admin', organization_id: 10, created_at: '2025-01-01',
          balance: 200, free_trial_count: 0, total_purchased: 1000, total_used: 800,
        })
        .mockResolvedValueOnce({
          id: 10, name: 'Big Org', plan_type: 'enterprise', subscription_status: 'active',
        });

      const result = await authService.getUserInfo(5);
      expect(result.user.organization.id).toBe(10);
      expect(result.user.organization.plan_type).toBe('enterprise');
      expect(result.user.organization.subscription_status).toBe('active');
    });
  });
});
