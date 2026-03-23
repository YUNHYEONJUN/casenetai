/**
 * CreditService 단위 테스트
 * - DB 계층을 모킹하여 비즈니스 로직만 테스트
 */

process.env.JWT_SECRET = 'test-secret-key-for-jest';

// DB 모킹
const mockDb = {
  get: jest.fn(),
  run: jest.fn(),
  query: jest.fn(async () => []),
  all: jest.fn(async () => []),
  transaction: jest.fn(),
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

const service = require('../../services/creditService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CreditService', () => {
  // ─────────────────────────────────────────────
  // getBalance
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // charge
  // ─────────────────────────────────────────────
  describe('charge', () => {
    it('충전 금액과 보너스를 합산하여 잔액을 업데이트한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ balance: 1000 }] })   // SELECT balance FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ balance: 6500 }] })   // UPDATE credits RETURNING balance
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })           // INSERT transactions (purchase)
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }),          // INSERT transactions (bonus)
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
      expect(updateCall[1][0]).toBe(5500);  // totalCredit (amount + bonus)
      expect(updateCall[1][1]).toBe(5000);  // amount (total_purchased)
      expect(updateCall[1][2]).toBe(500);   // bonusAmount (total_bonus)
    });

    it('보너스가 0이면 보너스 거래 기록을 생성하지 않는다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ balance: 1000 }] })   // SELECT
          .mockResolvedValueOnce({ rows: [{ balance: 6000 }] })   // UPDATE
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),          // INSERT (purchase only)
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await service.charge(1, 5000, 0, 'order-1', 'pay-1');

      expect(result.success).toBe(true);
      // 3 queries: SELECT, UPDATE, INSERT (purchase). No bonus INSERT.
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });

    it('크레딧 정보가 없으면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.charge(999, 5000, 0, 'order-1', 'pay-1'))
        .rejects.toThrow('크레딧 정보를 찾을 수 없습니다');
    });

    it('문자열 amount도 Number()로 올바르게 합산한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ balance: 0 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5500 }] })
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await service.charge(1, '5000', '500', 'order-1', 'pay-1');

      expect(result.total).toBe(5500);
      // UPDATE call의 totalCredit 파라미터
      const updateCall = mockClient.query.mock.calls[1];
      expect(updateCall[1][0]).toBe(5500);
    });
  });

  // ─────────────────────────────────────────────
  // deduct
  // ─────────────────────────────────────────────
  describe('deduct', () => {
    it('개인 사용자의 크레딧을 차감한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })         // SELECT user
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] }) // SELECT credits FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ balance: 4000 }], rowCount: 1 })    // UPDATE credits
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),                        // INSERT transactions
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 }); // _logUsage

      const result = await service.deduct(1, 1000, 5.5, 'elder_abuse', 'whisper', 'gpt4');

      expect(result.success).toBe(true);
      expect(result.charged).toBe(1000);
      expect(result.balance).toBe(4000);
      expect(result.message).toContain('1000원이 차감');
    });

    it('잔액이 부족하면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })         // SELECT user
          .mockResolvedValueOnce({ rows: [{ balance: 500, free_trial_count: 0 }] }), // SELECT credits
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.deduct(1, 1000, 5, 'type', 'stt', 'ai'))
        .rejects.toThrow('크레딧이 부족합니다');
    });

    it('무료 체험 횟수가 있으면 무료로 사용한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })         // SELECT user
          .mockResolvedValueOnce({ rows: [{ balance: 0, free_trial_count: 2 }] }) // SELECT credits
          .mockResolvedValueOnce({ rows: [{ free_trial_count: 1, balance: 0 }], rowCount: 1 }) // UPDATE free trial
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),                        // INSERT transactions
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 }); // _logUsage

      const result = await service.deduct(1, 1000, 3, 'type', 'stt', 'ai');

      expect(result.success).toBe(true);
      expect(result.charged).toBe(0);
      expect(result.freeTrialRemaining).toBe(1);
      expect(result.message).toContain('무료 체험');
    });

    it('기관 사용자(활성 구독)는 무료로 사용한다', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: 10 }] })   // SELECT user (has org)
          .mockResolvedValueOnce({ rows: [{ subscription_status: 'active', status: 'active', expiry_date: futureDate }] }), // SELECT org
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 }); // _logUsage

      const result = await service.deduct(1, 1000, 5, 'type', 'stt', 'ai');

      expect(result.success).toBe(true);
      expect(result.charged).toBe(0);
      expect(result.balance).toBeNull();
      expect(result.message).toContain('기관 플랜');
    });

    it('기관의 구독이 만료되면 크레딧을 차감한다', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: 10 }] })
          .mockResolvedValueOnce({ rows: [{ subscription_status: 'active', status: 'active', expiry_date: pastDate }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 4000 }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      const result = await service.deduct(1, 1000, 5, 'type', 'stt', 'ai');

      expect(result.success).toBe(true);
      expect(result.charged).toBe(1000);
    });

    it('사용자를 찾을 수 없으면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.deduct(999, 1000, 5, 'type', 'stt', 'ai'))
        .rejects.toThrow('사용자를 찾을 수 없습니다');
    });

    it('크레딧 정보가 없으면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
          .mockResolvedValueOnce({ rows: [] }), // no credits row
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.deduct(1, 1000, 5, 'type', 'stt', 'ai'))
        .rejects.toThrow('크레딧 정보를 찾을 수 없습니다');
    });

    it('동시 요청으로 UPDATE rowCount가 0이면 예외를 발생시킨다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // concurrent depletion
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(service.deduct(1, 1000, 5, 'type', 'stt', 'ai'))
        .rejects.toThrow('크레딧이 부족하거나 동시 요청이 발생했습니다');
    });

    it('audioLength를 숫자로 변환한다 (문자열 입력)', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 4000 }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      // 문자열 audioLength
      const result = await service.deduct(1, 1000, '5.5', 'type', 'stt', 'ai');
      expect(result.success).toBe(true);

      // INSERT transactions 호출에서 audioLength가 숫자로 사용됨
      const insertCall = mockClient.query.mock.calls[3];
      expect(insertCall[1][4]).toBe(5.5); // audioLength as number
    });
  });

  // ─────────────────────────────────────────────
  // getTransactions
  // ─────────────────────────────────────────────
  describe('getTransactions', () => {
    it('사용자의 거래 내역을 조회한다', async () => {
      const mockTransactions = [
        { id: 1, type: 'purchase', amount: 5000, balance_after: 5000, description: '충전', created_at: '2026-01-01' },
        { id: 2, type: 'usage', amount: -1000, balance_after: 4000, description: '사용', created_at: '2026-01-02' },
      ];
      mockDb.query.mockResolvedValue(mockTransactions);
      mockDb.get.mockResolvedValue({ count: 2 });

      const result = await service.getTransactions(1, 50, 0);

      expect(result.success).toBe(true);
      expect(result.transactions).toEqual(mockTransactions);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('기본 limit/offset을 사용한다', async () => {
      mockDb.query.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ count: 0 });

      const result = await service.getTransactions(1);

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [1, 50, 0]
      );
    });
  });

  // ─────────────────────────────────────────────
  // getUsageStats
  // ─────────────────────────────────────────────
  describe('getUsageStats', () => {
    it('사용 통계를 조회한다', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          total_count: 10,
          total_minutes: 150.5,
          total_cost: 25000,
          free_trial_used: 3,
        })
        .mockResolvedValueOnce({
          count: 3,
          minutes: 45.0,
          cost: 8000,
        });
      mockDb.query.mockResolvedValue([
        { consultation_type: 'elder_abuse', audio_duration_seconds: 300, total_cost: 1000, is_free_trial: false, created_at: '2026-03-01' },
      ]);

      const result = await service.getUsageStats(1);

      expect(result.success).toBe(true);
      expect(result.total.count).toBe(10);
      expect(result.total.minutes).toBe(150.5);
      expect(result.total.cost).toBe(25000);
      expect(result.total.freeTrialUsed).toBe(3);
      expect(result.thisMonth.count).toBe(3);
      expect(result.recent).toHaveLength(1);
    });

    it('통계가 null일 때 0을 기본값으로 사용한다', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          total_count: null,
          total_minutes: null,
          total_cost: null,
          free_trial_used: null,
        })
        .mockResolvedValueOnce({
          count: null,
          minutes: null,
          cost: null,
        });
      mockDb.query.mockResolvedValue([]);

      const result = await service.getUsageStats(1);

      expect(result.total.count).toBe(0);
      expect(result.total.minutes).toBe(0);
      expect(result.total.cost).toBe(0);
      expect(result.thisMonth.count).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // _logUsage (간접 테스트: deduct를 통해)
  // ─────────────────────────────────────────────
  describe('_logUsage (via deduct)', () => {
    it('차감 후 사용 로그를 DB에 기록한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 4000 }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      await service.deduct(1, 1000, 10, 'elder_abuse', 'whisper', 'gpt4');

      // _logUsage calls db.run with INSERT INTO usage_logs
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_logs'),
        expect.arrayContaining([1, 'elder_abuse', 600, 'whisper']) // userId, type, seconds (10*60), sttProvider
      );
    });

    it('비용 분배: STT 97%, AI 3%로 계산한다', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
          .mockResolvedValueOnce({ rows: [{ balance: 5000, free_trial_count: 0 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 4000 }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }),
      };
      mockDb.transaction.mockImplementation(async (fn) => fn(mockClient));
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      await service.deduct(1, 1000, 5, 'type', 'stt', 'ai');

      const logCall = mockDb.run.mock.calls[0];
      const params = logCall[1];
      // stt_cost = Math.round(1000 * 0.97) = 970
      // ai_cost = 1000 - 970 = 30
      expect(params[4]).toBe(970);  // stt_cost
      expect(params[6]).toBe(30);   // ai_cost
      expect(params[7]).toBe(1000); // total_cost
    });
  });
});
