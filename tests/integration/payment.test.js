/**
 * Payment 라우트 통합 테스트
 * - Zod 검증, 응답 형식, 에러 처리 확인
 */

const express = require('express');
const request = require('supertest');

// 모킹
const mockDb = {
  get: jest.fn(),
  run: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn(),
};

jest.mock('../../database/db-postgres', () => ({
  getDB: () => mockDb,
}));

jest.mock('../../services/paymentService', () => ({
  preparePayment: jest.fn(),
  confirmPayment: jest.fn(),
  failPayment: jest.fn(),
  getPaymentHistory: jest.fn(),
  calculateBonus: jest.fn(),
}));

jest.mock('../../services/creditService', () => ({
  getBalance: jest.fn(),
  getTransactions: jest.fn(),
  getUsageStats: jest.fn(),
}));

// auth 미들웨어 모킹
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, email: 'test@test.com', role: 'user', organizationId: 1 };
    next();
  },
}));

const paymentService = require('../../services/paymentService');
const creditService = require('../../services/creditService');
const { errorHandler } = require('../../lib/response');

// Express 앱 설정
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payment', require('../../routes/payment'));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Payment Routes', () => {
  const app = createApp();

  describe('GET /api/payment/credit/balance', () => {
    it('잔액을 표준 형식으로 반환한다', async () => {
      creditService.getBalance.mockResolvedValue({
        balance: 5000,
        freeTrialCount: 2,
      });

      const res = await request(app).get('/api/payment/credit/balance');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance).toBe(5000);
    });
  });

  describe('GET /api/payment/credit/transactions', () => {
    it('기본 파라미터로 거래 내역을 조회한다', async () => {
      creditService.getTransactions.mockResolvedValue({ transactions: [] });

      const res = await request(app).get('/api/payment/credit/transactions');

      expect(res.status).toBe(200);
      expect(creditService.getTransactions).toHaveBeenCalledWith(1, 50, 0);
    });

    it('limit 파라미터를 검증한다', async () => {
      const res = await request(app).get('/api/payment/credit/transactions?limit=200');

      expect(res.status).toBe(400);
    });

    it('offset 음수를 거부한다', async () => {
      const res = await request(app).get('/api/payment/credit/transactions?offset=-1');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/payment/prepare', () => {
    it('유효한 금액으로 결제를 준비한다', async () => {
      paymentService.preparePayment.mockResolvedValue({ orderId: 'order-123' });

      const res = await request(app)
        .post('/api/payment/prepare')
        .send({ amount: 5000 });

      expect(res.status).toBe(200);
      expect(res.body.data.orderId).toBe('order-123');
    });

    it('1000원 미만은 거부한다', async () => {
      const res = await request(app)
        .post('/api/payment/prepare')
        .send({ amount: 500 });

      expect(res.status).toBe(400);
    });

    it('10,000,000원 초과는 거부한다', async () => {
      const res = await request(app)
        .post('/api/payment/prepare')
        .send({ amount: 20000000 });

      expect(res.status).toBe(400);
    });

    it('amount 누락 시 400을 반환한다', async () => {
      const res = await request(app)
        .post('/api/payment/prepare')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/payment/confirm', () => {
    it('유효한 데이터로 결제를 승인한다', async () => {
      paymentService.confirmPayment.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/payment/confirm')
        .send({ orderId: 'order-1', paymentKey: 'key-1', amount: 5000 });

      expect(res.status).toBe(200);
      expect(paymentService.confirmPayment).toHaveBeenCalledWith('order-1', 'key-1', 5000);
    });

    it('필수 필드 누락 시 400을 반환한다', async () => {
      const res = await request(app)
        .post('/api/payment/confirm')
        .send({ orderId: 'order-1' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/payment/bonus/:amount', () => {
    it('보너스를 계산하여 반환한다', async () => {
      paymentService.calculateBonus.mockReturnValue(500);

      const res = await request(app).get('/api/payment/bonus/5000');

      expect(res.status).toBe(200);
      expect(res.body.data.amount).toBe(5000);
      expect(res.body.data.bonusAmount).toBe(500);
      expect(res.body.data.totalCredit).toBe(5500);
    });

    it('음수 금액은 거부한다', async () => {
      const res = await request(app).get('/api/payment/bonus/-100');

      expect(res.status).toBe(400);
    });
  });
});
