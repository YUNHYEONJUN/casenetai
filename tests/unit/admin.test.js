/**
 * Unit tests for admin routes:
 *   - /api/admin/* (admin.js) - requireAdmin (system_admin + org_admin)
 *   - /api/system-admin/* (system-admin.js) - requireSystemAdmin (system_admin only)
 *   - /api/org-admin/* (org-admin.js) - requireOrgAdmin (system_admin + org_admin)
 *   - /api/join-requests/* (join-requests.js) - public + authenticateToken
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
 * Helper: generate a JWT token for a given role
 */
function tokenFor(role, orgId = 1) {
  return jwt.sign(
    { userId: 1, email: 'admin@test.com', role, organizationId: orgId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Helper: mock db.get to return a valid session row (authenticateToken DB check)
 * then optionally return additional values for subsequent db.get calls.
 */
function mockSession(...additionalGetResults) {
  const impl = jest.fn();
  // First call: session check in authenticateToken
  impl.mockResolvedValueOnce({ id: 10 });
  for (const result of additionalGetResults) {
    impl.mockResolvedValueOnce(result);
  }
  mockDb.get = impl;
  return impl;
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
// System Admin Routes: /api/system-admin/*
// Middleware: authenticateToken + requireSystemAdmin
// Only system_admin role allowed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/system-admin/organizations', () => {
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/system-admin/organizations');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('403 for org_admin role', async () => {
    const token = tokenFor('org_admin');
    mockSession();

    const res = await request(app)
      .get('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('403 for regular user role', async () => {
    const token = tokenFor('user');
    mockSession();

    const res = await request(app)
      .get('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for system_admin with pagination', async () => {
    const token = tokenFor('system_admin');
    // Session check, then totalResult count
    mockSession({ count: '2' });

    const orgs = [
      { id: 1, name: 'Org A', status: 'active', user_count: '3' },
      { id: 2, name: 'Org B', status: 'active', user_count: '1' },
    ];
    mockDb.query.mockResolvedValueOnce(orgs);

    const res = await request(app)
      .get('/api/system-admin/organizations?page=1&limit=10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.organizations).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  test('200 with search filter', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '1' });
    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Test Org' }]);

    const res = await request(app)
      .get('/api/system-admin/organizations?search=Test')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.organizations).toHaveLength(1);
  });
});

describe('POST /api/system-admin/organizations', () => {
  test('403 for org_admin role', async () => {
    const token = tokenFor('org_admin');
    mockSession();

    const res = await request(app)
      .post('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'New Org' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('400 with missing name', async () => {
    const token = tokenFor('system_admin');
    mockSession();

    const res = await request(app)
      .post('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('201 for system_admin with valid data', async () => {
    const token = tokenFor('system_admin');
    // Session check, then db.get for the created org lookup after transaction
    mockSession({ id: 5, name: 'New Org', status: 'active' });

    const res = await request(app)
      .post('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'New Org' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('201 with admin_user_id assigns org admin', async () => {
    const token = tokenFor('system_admin');
    // Session check -> admin user lookup -> created org lookup
    mockSession(
      { id: 10, name: 'Admin User', oauth_email: 'admin@org.com', role: 'user', organization_id: null },
      { id: 5, name: 'New Org', status: 'active' }
    );

    const res = await request(app)
      .post('/api/system-admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'New Org', admin_user_id: 10 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});

describe('GET /api/system-admin/users', () => {
  test('200 for system_admin with pagination', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '5' });

    const users = [
      { id: 1, name: 'User A', role: 'user' },
      { id: 2, name: 'User B', role: 'org_admin' },
    ];
    mockDb.query.mockResolvedValueOnce(users);

    const res = await request(app)
      .get('/api/system-admin/users?page=1&limit=10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(5);
  });

  test('200 with role filter', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '1' });
    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Admin', role: 'org_admin' }]);

    const res = await request(app)
      .get('/api/system-admin/users?role=org_admin')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /api/system-admin/users/:id/role', () => {
  test('200 for system_admin updating user role', async () => {
    const token = tokenFor('system_admin');
    // Session check -> user lookup
    mockSession({ id: 5, name: 'Target User', role: 'user' });

    const res = await request(app)
      .put('/api/system-admin/users/5/role')
      .set('Cookie', [`access_token=${token}`])
      .send({ role: 'org_admin', organization_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('400 with invalid role', async () => {
    const token = tokenFor('system_admin');
    mockSession();

    const res = await request(app)
      .put('/api/system-admin/users/5/role')
      .set('Cookie', [`access_token=${token}`])
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('404 when user not found', async () => {
    const token = tokenFor('system_admin');
    // Session check -> user not found (undefined)
    mockSession(undefined);

    const res = await request(app)
      .put('/api/system-admin/users/999/role')
      .set('Cookie', [`access_token=${token}`])
      .send({ role: 'org_admin' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/system-admin/audit-logs', () => {
  test('200 for system_admin', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '3' });
    mockDb.query.mockResolvedValueOnce([
      { id: 1, action: 'create', resource_type: 'organization' },
    ]);

    const res = await request(app)
      .get('/api/system-admin/audit-logs')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logs).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });
});

describe('GET /api/system-admin/stats', () => {
  test('200 for system_admin', async () => {
    const token = tokenFor('system_admin');
    // Session -> orgs count -> users count -> pending count -> orgAdmins count
    mockSession({ count: '5' }, { count: '20' }, { count: '2' }, { count: '3' });

    const res = await request(app)
      .get('/api/system-admin/stats')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalOrganizations).toBeDefined();
    expect(res.body.totalUsers).toBeDefined();
    expect(res.body.pendingApprovals).toBeDefined();
  });
});

describe('POST /api/system-admin/approve-user/:userId', () => {
  test('200 for system_admin approving user', async () => {
    const token = tokenFor('system_admin');
    mockSession();
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/system-admin/approve-user/5')
      .set('Cookie', [`access_token=${token}`])
      .send({ role: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('404 when user not found (changes=0)', async () => {
    const token = tokenFor('system_admin');
    mockSession();
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 0 });

    const res = await request(app)
      .post('/api/system-admin/approve-user/999')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/system-admin/reject-user/:userId', () => {
  test('200 for system_admin rejecting user', async () => {
    const token = tokenFor('system_admin');
    mockSession();
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/system-admin/reject-user/5')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/system-admin/organizations/:id', () => {
  test('200 for system_admin deleting org', async () => {
    const token = tokenFor('system_admin');
    // Session check -> org lookup
    mockSession({ id: 3, name: 'Old Org', status: 'active' });

    const res = await request(app)
      .delete('/api/system-admin/organizations/3')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('404 when org not found', async () => {
    const token = tokenFor('system_admin');
    mockSession(undefined);

    const res = await request(app)
      .delete('/api/system-admin/organizations/999')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Org Admin Routes: /api/org-admin/*
// Middleware: authenticateToken + requireOrgAdmin
// Allowed: system_admin + org_admin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/org-admin/employees', () => {
  test('403 for regular user', async () => {
    const token = tokenFor('user');
    mockSession();

    const res = await request(app)
      .get('/api/org-admin/employees')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for org_admin with employees list', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> totalResult -> organization
    mockSession({ count: '2' }, { id: 1, name: 'My Org' });

    const employees = [
      { id: 2, name: 'Employee A', role: 'user', organization_id: 1 },
      { id: 3, name: 'Employee B', role: 'user', organization_id: 1 },
    ];
    mockDb.query.mockResolvedValueOnce(employees);

    const res = await request(app)
      .get('/api/org-admin/employees')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.employees).toHaveLength(2);
    expect(res.body.organization).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  test('200 for system_admin accessing any org', async () => {
    const token = tokenFor('system_admin', null);
    mockSession({ count: '1' }, { id: 5, name: 'Other Org' });
    mockDb.query.mockResolvedValueOnce([{ id: 10, name: 'Staff', role: 'user' }]);

    const res = await request(app)
      .get('/api/org-admin/employees?organization_id=5')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /api/org-admin/employees/:id', () => {
  test('200 for org_admin updating employee in same org', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> employee lookup
    mockSession({ id: 5, name: 'Employee', organization_id: 1, role: 'user' });

    const res = await request(app)
      .put('/api/org-admin/employees/5')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'Updated Name', phone: '010-9999-8888' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('403 for org_admin updating employee in different org', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> employee in different org
    mockSession({ id: 5, name: 'Other Employee', organization_id: 99, role: 'user' });

    const res = await request(app)
      .put('/api/org-admin/employees/5')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('403 for org_admin trying to grant org_admin role', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession({ id: 5, name: 'Employee', organization_id: 1, role: 'user' });

    const res = await request(app)
      .put('/api/org-admin/employees/5')
      .set('Cookie', [`access_token=${token}`])
      .send({ role: 'org_admin' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('404 when employee not found', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession(undefined);

    const res = await request(app)
      .put('/api/org-admin/employees/999')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /api/org-admin/employees/:id', () => {
  test('200 for org_admin removing employee from same org', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> employee lookup (userId in token is 1, employee id is 5)
    mockSession({ id: 5, name: 'Employee', organization_id: 1, role: 'user' });

    const res = await request(app)
      .delete('/api/org-admin/employees/5')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('403 for org_admin removing employee from different org', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession({ id: 5, name: 'Other', organization_id: 99, role: 'user' });

    const res = await request(app)
      .delete('/api/org-admin/employees/5')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('400 when trying to remove self', async () => {
    const token = tokenFor('org_admin', 1);
    // Employee id=1 matches userId=1 in the token
    mockSession({ id: 1, name: 'Self', organization_id: 1, role: 'org_admin' });

    const res = await request(app)
      .delete('/api/org-admin/employees/1')
      .set('Cookie', [`access_token=${token}`]);

    // ValidationError -> isOperational -> appropriate status
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('404 when employee not found', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession(undefined);

    const res = await request(app)
      .delete('/api/org-admin/employees/999')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/org-admin/join-requests', () => {
  test('200 for org_admin listing join requests', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession({ count: '1' });
    mockDb.query.mockResolvedValueOnce([
      { id: 1, user_id: 5, organization_id: 1, status: 'pending', user_name: 'Applicant' },
    ]);

    const res = await request(app)
      .get('/api/org-admin/join-requests')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.pagination).toBeDefined();
  });
});

describe('PUT /api/org-admin/join-requests/:id/approve', () => {
  test('200 for org_admin approving request in same org', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> join request lookup
    mockSession({ id: 10, user_id: 5, organization_id: 1, status: 'pending' });

    const res = await request(app)
      .put('/api/org-admin/join-requests/10/approve')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  test('403 for org_admin approving request in different org', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession({ id: 10, user_id: 5, organization_id: 99, status: 'pending' });

    const res = await request(app)
      .put('/api/org-admin/join-requests/10/approve')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('400 when request already processed', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession({ id: 10, user_id: 5, organization_id: 1, status: 'approved' });

    const res = await request(app)
      .put('/api/org-admin/join-requests/10/approve')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/org-admin/statistics', () => {
  test('200 for org_admin', async () => {
    const token = tokenFor('org_admin', 1);
    // Session -> employeeStats -> usageStats -> pendingRequests
    mockSession(
      { total: '10', active: '8', approved: '9' },
      { total_count: '50', total_cost: '100', avg_cost: '2' },
      { count: '3' }
    );

    const res = await request(app)
      .get('/api/org-admin/statistics')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.statistics).toBeDefined();
    expect(res.body.statistics.employees).toBeDefined();
    expect(res.body.statistics.usage).toBeDefined();
    expect(res.body.statistics.pendingRequests).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin Dashboard Routes: /api/admin/*
// Middleware: authenticateToken + requireAdmin
// Allowed: system_admin + org_admin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/admin/dashboard/overview', () => {
  // admin.js uses usageTrackingService which also calls db, so we need to mock carefully
  test('401 without auth token', async () => {
    const res = await request(app).get('/api/admin/dashboard/overview');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('403 for regular user', async () => {
    const token = tokenFor('user');
    mockSession();

    const res = await request(app)
      .get('/api/admin/dashboard/overview')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for system_admin', async () => {
    const token = tokenFor('system_admin');
    // Call order for db.get:
    // 1. session check (authenticateToken)
    // 2. totalAnonymizations (admin.js)
    // 3. totalUsers (admin.js)
    // 4. totalOrgs (admin.js)
    // getAllOrganizationsUsage uses db.query (not db.get), returns [] by default
    mockSession(
      { count: '100', success_count: '90', failed_count: '5', quota_exceeded_count: '5', total_items_anonymized: '500', avg_processing_time: '1.5' },
      { count: '50' },
      { count: '10' }
    );

    const res = await request(app)
      .get('/api/admin/dashboard/overview')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.statistics).toBeDefined();
    expect(res.body.statistics.totalUsers).toBe('50');
    expect(res.body.statistics.totalOrganizations).toBe('10');
    expect(res.body.period).toBeDefined();
  });
});

describe('GET /api/admin/organizations', () => {
  test('403 for regular user', async () => {
    const token = tokenFor('user');
    mockSession();

    const res = await request(app)
      .get('/api/admin/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 for org_admin listing organizations', async () => {
    const token = tokenFor('org_admin', 1);
    mockSession();

    const orgs = [
      { id: 1, name: 'Org A', quota_hours: 10, used_hours: 5 },
    ];
    mockDb.query.mockResolvedValueOnce(orgs);

    const res = await request(app)
      .get('/api/admin/organizations')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.organizations).toBeDefined();
    expect(res.body.count).toBe(1);
  });
});

describe('POST /api/admin/organizations', () => {
  test('400 with missing name', async () => {
    const token = tokenFor('system_admin');
    mockSession();

    const res = await request(app)
      .post('/api/admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('201 for admin creating organization', async () => {
    const token = tokenFor('system_admin');
    mockSession();
    mockDb.run.mockResolvedValueOnce({ lastID: 5, changes: 1 });

    const res = await request(app)
      .post('/api/admin/organizations')
      .set('Cookie', [`access_token=${token}`])
      .send({ name: 'New Organization' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.organizationId).toBeDefined();
  });
});

describe('GET /api/admin/logs/anonymization', () => {
  test('200 for admin with pagination', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '10' });
    mockDb.query.mockResolvedValueOnce([
      { id: 1, status: 'success', user_name: 'User' },
    ]);

    const res = await request(app)
      .get('/api/admin/logs/anonymization?limit=10&offset=0')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logs).toBeDefined();
    expect(res.body.total).toBe(10);
  });

  test('200 with filters', async () => {
    const token = tokenFor('system_admin');
    mockSession({ count: '3' });
    mockDb.query.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/logs/anonymization?status=success&organizationId=1')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Join Requests Routes: /api/join-requests/*
// GET /organizations is public (no auth)
// POST / and others require authenticateToken
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/join-requests/organizations', () => {
  test('200 lists active organizations (no auth required)', async () => {
    mockDb.get.mockResolvedValueOnce({ count: '2' });
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Org A', plan_type: 'free', subscription_status: 'active' },
      { id: 2, name: 'Org B', plan_type: 'paid', subscription_status: 'active' },
    ]);

    const res = await request(app)
      .get('/api/join-requests/organizations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBe(2);
  });

  test('200 with search filter', async () => {
    mockDb.get.mockResolvedValueOnce({ count: '1' });
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Test Org' },
    ]);

    const res = await request(app)
      .get('/api/join-requests/organizations?search=Test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/join-requests/', () => {
  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/api/join-requests/')
      .send({ organization_id: 1 });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 with valid join request', async () => {
    // User with no organization
    const token = jwt.sign(
      { userId: 5, email: 'user@test.com', role: 'user', organizationId: null },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    // Session -> org lookup -> existing request check (none)
    mockSession(
      { id: 1, name: 'Target Org', status: 'active' },
      undefined // no existing pending request
    );
    mockDb.run.mockResolvedValueOnce({ lastID: 10, changes: 1 });

    const res = await request(app)
      .post('/api/join-requests/')
      .set('Cookie', [`access_token=${token}`])
      .send({ organization_id: 1, message: 'Please accept me' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requestId).toBeDefined();
  });

  test('409 when user already belongs to an org', async () => {
    // User already has an organization
    const token = tokenFor('user', 1);
    mockSession();

    const res = await request(app)
      .post('/api/join-requests/')
      .set('Cookie', [`access_token=${token}`])
      .send({ organization_id: 2 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('409 when pending request already exists', async () => {
    const token = jwt.sign(
      { userId: 5, email: 'user@test.com', role: 'user', organizationId: null },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    // Session -> org found -> existing pending request found
    mockSession(
      { id: 1, name: 'Target Org', status: 'active' },
      { id: 99, user_id: 5, organization_id: 1, status: 'pending' }
    );

    const res = await request(app)
      .post('/api/join-requests/')
      .set('Cookie', [`access_token=${token}`])
      .send({ organization_id: 1 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('404 when organization not found', async () => {
    const token = jwt.sign(
      { userId: 5, email: 'user@test.com', role: 'user', organizationId: null },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    // Session -> org not found
    mockSession(undefined);

    const res = await request(app)
      .post('/api/join-requests/')
      .set('Cookie', [`access_token=${token}`])
      .send({ organization_id: 999 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/join-requests/my', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/join-requests/my');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('200 returns user own requests', async () => {
    const token = tokenFor('user', null);
    mockSession();
    mockDb.query.mockResolvedValueOnce([
      { id: 1, organization_id: 1, status: 'pending', organization_name: 'Org A' },
    ]);

    const res = await request(app)
      .get('/api/join-requests/my')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(1);
  });
});

describe('DELETE /api/join-requests/:id', () => {
  test('200 user cancels own pending request', async () => {
    const token = tokenFor('user', null);
    // Session -> request lookup (user_id matches)
    mockSession({ id: 10, user_id: 1, organization_id: 1, status: 'pending' });
    mockDb.run.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .delete('/api/join-requests/10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('403 user cannot cancel another user request', async () => {
    const token = tokenFor('user', null);
    // Request belongs to a different user
    mockSession({ id: 10, user_id: 999, organization_id: 1, status: 'pending' });

    const res = await request(app)
      .delete('/api/join-requests/10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('400 cannot cancel already processed request', async () => {
    const token = tokenFor('user', null);
    mockSession({ id: 10, user_id: 1, organization_id: 1, status: 'approved' });

    const res = await request(app)
      .delete('/api/join-requests/10')
      .set('Cookie', [`access_token=${token}`]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
