/**
 * CreditService 단위 테스트
 * - DB 계층을 모킹하여 비즈니스 로직만 테스트
 */

// DB 모킹
const mockDb = {
  get: jest.fn(),
  run: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn(),
};

jest.mock('../../database/db-postgres', () => ({
  getDB: () => mockDb,
}));

const service = require('../../services/creditService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CreditService', () => {
  describe('getBalance', () => {
    it('기존 사용자의 잔액을 조회한다', async () => {
      mockDb.get.mockResolvedValue({
        balance: 5000,
        free_trial_count: 2,
        total_purchased: 10000,
        total_used: 5000,
        total_bonus: 500,
      });

      const result = await service.getBalance(1);

      expect(result).toEqual({
        balance: 5000,
        freeTrialCount: 2,
        totalPurchased: 10000,
        totalUsed: 5000,
        totalBonus: 500,
      });
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT balance'),
        [1]
      );
    });

    it('신규 사용자에게 기본 크레딧을 생성한다', async () => {
      mockDb.get.mockResolvedValue(undefined);
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      const result = await service.getBalance(99);

      expect(result).toEqual({
        balance: 0,
        freeTrialCount: 3,
        totalPurchased: 0,
        totalUsed: 0,
        totalBonus: 0,
      });
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credits'),
        [99]
      );
    });

    it('DB 오류 시 예외를 전파한다', async () => {
      mockDb.get.mockRejectedValue(new Error('DB 연결 실패'));

      await expect(service.getBalance(1)).rejects.toThrow('DB 연결 실패');
    });
  });

  describe('charge', () => {
    it('충전 금액과 보너스를 합산하여 잔액을 업데이트한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ balance: 1000 }] }) // SELECT balance FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ balance: 6500 }] }) // UPDATE credits RETURNING balance
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT transactions (purchase)
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }), // INSERT transactions (bonus)
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await service.charge(1, 5000, 500, 'order-123', 'pay-key-456');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(6500);
      expect(result.charged).toBe(5000);
      expect(result.bonus).toBe(500);
      expect(result.total).toBe(5500);

      // UPDATE 쿼리 파라미터 검증
      const updateCall = mockClient.query.mock.calls[1];
      expect(updateCall[1][0]).toBe(5500); // totalCredit (amount + bonus)
      expect(updateCall[1][1]).toBe(5000); // amount (total_purchased)
      expect(updateCall[1][2]).toBe(500); // bonusAmount (total_bonus)
    });

    it('크레딧 정보가 없으면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.charge(999, 5000, 0, 'order-1', 'pay-1'))
        .rejects.toThrow('크레딧 정보를 찾을 수 없습니다');
    });
  });
});
