/**
 * PaymentService unit tests
 */

process.env.JWT_SECRET = 'test-secret-key-for-jest';

const mockDb = {
  query: jest.fn(async () => []),
  get: jest.fn(async () => undefined),
  run: jest.fn(async () => ({ lastID: 1, changes: 1 })),
  all: jest.fn(async () => []),
  transaction: jest.fn(async (cb) => cb({
    query: jest.fn(async () => ({ rows: [] })),
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

jest.mock('../../services/creditService', () => ({}));

jest.mock('axios');

const paymentService = require('../../services/paymentService');

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateBonus', () => {
    it('should return 0% bonus for amount < 5000', () => {
      expect(paymentService.calculateBonus(0)).toBe(0);
      expect(paymentService.calculateBonus(1000)).toBe(0);
      expect(paymentService.calculateBonus(4999)).toBe(0);
    });

    it('should return 10% bonus for amount 5000-9999', () => {
      expect(paymentService.calculateBonus(5000)).toBe(500);
      expect(paymentService.calculateBonus(9999)).toBe(999);
    });

    it('should return 20% bonus for amount 10000-29999', () => {
      expect(paymentService.calculateBonus(10000)).toBe(2000);
      expect(paymentService.calculateBonus(29999)).toBe(5999);
    });

    it('should return 25% bonus for amount 30000-49999', () => {
      expect(paymentService.calculateBonus(30000)).toBe(7500);
      expect(paymentService.calculateBonus(49999)).toBe(12499);
    });

    it('should return 30% bonus for amount >= 50000', () => {
      expect(paymentService.calculateBonus(50000)).toBe(15000);
      expect(paymentService.calculateBonus(100000)).toBe(30000);
      expect(paymentService.calculateBonus(10000000)).toBe(3000000);
    });

    it('should use Math.floor (no fractional credits)', () => {
      expect(paymentService.calculateBonus(5001)).toBe(500);
      expect(paymentService.calculateBonus(10001)).toBe(2000);
    });
  });

  describe('preparePayment', () => {
    it('should reject amount below 1000', async () => {
      await expect(paymentService.preparePayment(1, 999)).rejects.toThrow(
        '최소 충전 금액은 1,000원입니다'
      );
    });

    it('should reject amount of 0', async () => {
      await expect(paymentService.preparePayment(1, 0)).rejects.toThrow(
        '최소 충전 금액은 1,000원입니다'
      );
    });

    it('should reject negative amount', async () => {
      await expect(paymentService.preparePayment(1, -5000)).rejects.toThrow(
        '최소 충전 금액은 1,000원입니다'
      );
    });

    it('should reject amount above 10,000,000', async () => {
      await expect(paymentService.preparePayment(1, 10000001)).rejects.toThrow(
        '최대 충전 금액은 10,000,000원입니다'
      );
    });

    it('should reject NaN amount', async () => {
      await expect(paymentService.preparePayment(1, 'abc')).rejects.toThrow(
        '최소 충전 금액은 1,000원입니다'
      );
    });

    it('should accept exactly 1000', async () => {
      const result = await paymentService.preparePayment(1, 1000);
      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000);
      expect(result.bonusAmount).toBe(0);
    });

    it('should accept exactly 10,000,000', async () => {
      const result = await paymentService.preparePayment(1, 10000000);
      expect(result.success).toBe(true);
      expect(result.amount).toBe(10000000);
      expect(result.bonusAmount).toBe(3000000);
      expect(result.totalCredit).toBe(13000000);
    });

    it('should parse string amounts via parseInt', async () => {
      const result = await paymentService.preparePayment(1, '5000');
      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
      expect(result.bonusAmount).toBe(500);
    });

    it('should generate order ID with userId', async () => {
      const result = await paymentService.preparePayment(42, 5000);
      expect(result.orderId).toMatch(/^ORDER_42_/);
    });

    it('should return clientKey and URLs', async () => {
      const result = await paymentService.preparePayment(1, 1000);
      expect(result.clientKey).toBeDefined();
      expect(result.successUrl).toContain('payment-success');
      expect(result.failUrl).toContain('payment-fail');
    });
  });

  describe('failPayment', () => {
    it('should update payment status to failed', async () => {
      const result = await paymentService.failPayment('ORD_1', 'ERR_CODE', 'Error msg');
      expect(result.success).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.any(Array)
      );
    });
  });

  describe('cancelPayment', () => {
    it('should throw if payment not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await expect(
        paymentService.cancelPayment('ORD_X', 'reason', 1)
      ).rejects.toThrow('결제 정보를 찾을 수 없습니다');
    });

    it('should throw if user is not payment owner', async () => {
      mockDb.get.mockResolvedValueOnce({
        payment_key: 'pk', amount: 5000, status: 'success', user_id: 2, total_credit: 5500,
      });
      await expect(
        paymentService.cancelPayment('ORD_1', 'reason', 1)
      ).rejects.toThrow('해당 결제에 대한 권한이 없습니다');
    });

    it('should throw if payment status is not success', async () => {
      mockDb.get.mockResolvedValueOnce({
        payment_key: 'pk', amount: 5000, status: 'pending', user_id: 1, total_credit: 5500,
      });
      await expect(
        paymentService.cancelPayment('ORD_1', 'reason', 1)
      ).rejects.toThrow('취소할 수 있는 결제가 아닙니다');
    });
  });

  describe('getPaymentHistory', () => {
    it('should return payment list with pagination', async () => {
      mockDb.query.mockResolvedValueOnce([
        { order_id: 'O1', amount: 5000, status: 'success' },
      ]);
      mockDb.get.mockResolvedValueOnce({ count: 1 });

      const result = await paymentService.getPaymentHistory(1, 20, 0);
      expect(result.success).toBe(true);
      expect(result.payments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should use default limit and offset', async () => {
      mockDb.query.mockResolvedValueOnce([]);
      mockDb.get.mockResolvedValueOnce({ count: 0 });

      const result = await paymentService.getPaymentHistory(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });
  });
});
