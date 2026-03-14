/**
 * roleAuth middleware unit tests
 */

process.env.JWT_SECRET = 'test-secret-key-for-jest';

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

const {
  requireSystemAdmin,
  requireOrgAdmin,
  requireOwnOrgAdmin,
  requireUser,
  requireOrganizationMember,
  requireSelfOrAdmin,
} = require('../../middleware/roleAuth');

function createMocks(user, params, body) {
  const req = { user: user || null, params: params || {}, body: body || {} };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('roleAuth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireSystemAdmin', () => {
    it('should return 401 if no user', () => {
      const { req, res, next } = createMocks(null);
      requireSystemAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for regular user', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'user' });
      requireSystemAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for org_admin', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'org_admin' });
      requireSystemAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next for system_admin', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'system_admin' });
      requireSystemAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireOrgAdmin', () => {
    it('should return 401 if no user', () => {
      const { req, res, next } = createMocks(null);
      requireOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 for regular user', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'user' });
      requireOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should allow org_admin', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'org_admin' });
      requireOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow system_admin', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'system_admin' });
      requireOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireOwnOrgAdmin', () => {
    it('should return 401 if no user', () => {
      const { req, res, next } = createMocks(null);
      requireOwnOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should allow system_admin regardless of org', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'system_admin' },
        { organizationId: '99' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 403 for org_admin without organizationId', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: null },
        { organizationId: '5' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 for org_admin accessing different org', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { organizationId: '10' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should allow org_admin accessing own org (params)', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { organizationId: '5' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow org_admin accessing own org (body)', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        {},
        { organizationId: '5' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 403 for regular user', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'user', organizationId: 5 },
        { organizationId: '5' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 for org_admin with NaN target org', () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { organizationId: 'abc' }
      );
      requireOwnOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireUser', () => {
    it('should return 401 if no user', () => {
      const { req, res, next } = createMocks(null);
      requireUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should allow any authenticated user', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'user' });
      requireUser(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow system_admin', () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'system_admin' });
      requireUser(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireOrganizationMember', () => {
    it('should return 401 if no user', async () => {
      const { req, res, next } = createMocks(null);
      await requireOrganizationMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should allow system_admin without org check', async () => {
      const { req, res, next } = createMocks({ userId: 1, role: 'system_admin' });
      await requireOrganizationMember(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    it('should return 403 if user has no organizationId', async () => {
      const { req, res, next } = createMocks({
        userId: 1, role: 'user', organizationId: null,
      });
      await requireOrganizationMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 if user is not approved in DB', async () => {
      mockDb.get.mockResolvedValueOnce({ is_approved: false });
      const { req, res, next } = createMocks({
        userId: 1, role: 'user', organizationId: 5,
      });
      await requireOrganizationMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 if user not found in DB', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      const { req, res, next } = createMocks({
        userId: 999, role: 'user', organizationId: 5,
      });
      await requireOrganizationMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should allow approved organization member', async () => {
      mockDb.get.mockResolvedValueOnce({ is_approved: true });
      const { req, res, next } = createMocks({
        userId: 1, role: 'user', organizationId: 5,
      });
      await requireOrganizationMember(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 500 on DB error', async () => {
      mockDb.get.mockRejectedValueOnce(new Error('DB connection failed'));
      const { req, res, next } = createMocks({
        userId: 1, role: 'user', organizationId: 5,
      });
      await requireOrganizationMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('requireSelfOrAdmin', () => {
    it('should return 401 if no user', async () => {
      const { req, res, next } = createMocks(null, { userId: '1' });
      await requireSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should allow user accessing own resource', async () => {
      const { req, res, next } = createMocks(
        { userId: 5, role: 'user' },
        { userId: '5' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow system_admin accessing any resource', async () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'system_admin' },
        { userId: '99' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow org_admin accessing same-org user', async () => {
      mockDb.get.mockResolvedValueOnce({ organization_id: 5 });
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { userId: '10' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject org_admin accessing different-org user', async () => {
      mockDb.get.mockResolvedValueOnce({ organization_id: 99 });
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { userId: '10' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should reject regular user accessing other user resource', async () => {
      const { req, res, next } = createMocks(
        { userId: 1, role: 'user' },
        { userId: '99' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should use req.params.id as fallback', async () => {
      const { req, res, next } = createMocks(
        { userId: 5, role: 'user' },
        { id: '5' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 500 on DB error for org_admin check', async () => {
      mockDb.get.mockRejectedValueOnce(new Error('DB error'));
      const { req, res, next } = createMocks(
        { userId: 1, role: 'org_admin', organizationId: 5 },
        { userId: '10' }
      );
      await requireSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
