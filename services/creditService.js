/**
 * 크레딧 서비스
 * - 크레딧 충전, 차감, 조회
 * - 무료 체험 관리
 */

const { getDB } = require('../database/db-postgres');
const { logger } = require('../lib/logger');

class CreditService {

  /**
   * 크레딧 잔액 조회
   */
  async getBalance(userId) {
    const db = getDB();

    const credit = await db.get(
      `SELECT balance, free_trial_count, total_purchased, total_used, total_bonus
       FROM credits WHERE user_id = $1`,
      [userId]
    );

    if (!credit) {
      await db.run(
        'INSERT INTO credits (user_id, balance, free_trial_count) VALUES ($1, 0, 3)',
        [userId]
      );

      return {
        balance: 0,
        freeTrialCount: 3,
        totalPurchased: 0,
        totalUsed: 0,
        totalBonus: 0
      };
    }

    return {
      balance: credit.balance,
      freeTrialCount: credit.free_trial_count,
      totalPurchased: credit.total_purchased,
      totalUsed: credit.total_used,
      totalBonus: credit.total_bonus
    };
  }

  /**
   * 크레딧 충전 (결제 완료 후 호출)
   * - 원자적 balance 증가 (SELECT 후 SET 대신 SET balance = balance + $1)
   */
  async charge(userId, amount, bonusAmount, orderId, paymentKey) {
    const db = getDB();

    const result = await db.transaction(async (client) => {
      // 크레딧 존재 확인
      const creditResult = await client.query(
        'SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (!creditResult.rows[0]) {
        throw new Error('크레딧 정보를 찾을 수 없습니다');
      }

      const totalCredit = Number(amount) + Number(bonusAmount);

      // 원자적 잔액 증가 + RETURNING으로 새 잔액 확인
      const updateResult = await client.query(
        `UPDATE credits
         SET balance = balance + $1,
             total_purchased = total_purchased + $2,
             total_bonus = total_bonus + $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4
         RETURNING balance`,
        [totalCredit, amount, bonusAmount, userId]
      );

      const newBalance = updateResult.rows[0].balance;

      // 충전 거래 기록
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id, payment_id)
         VALUES ($1, 'purchase', $2, $3, $4, $5, $6)`,
        [userId, amount, newBalance, `크레딧 충전 ${amount.toLocaleString()}원`, orderId, paymentKey]
      );

      // 보너스 거래 기록
      if (bonusAmount > 0) {
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id)
           VALUES ($1, 'bonus', $2, $3, $4, $5)`,
          [userId, bonusAmount, newBalance, `보너스 크레딧 ${bonusAmount.toLocaleString()}원`, orderId]
        );
      }

      return { newBalance, totalCredit };
    });

    logger.info('크레딧 충전 성공', { userId, amount, bonus: bonusAmount });

    return {
      success: true,
      newBalance: result.newBalance,
      charged: amount,
      bonus: bonusAmount,
      total: result.totalCredit
    };
  }

  /**
   * 크레딧 차감 (상담일지 생성 시)
   * - FOR UPDATE로 행 잠금 (동시 요청 직렬화)
   * - 원자적 차감 + RETURNING으로 결과 확인
   */
  async deduct(userId, cost, audioLength, consultationType, sttProvider, aiProvider) {
    const db = getDB();
    audioLength = Number(audioLength) || 0;

    const deductResult = await db.transaction(async (client) => {
      // 사용자 정보 조회 (기관 여부 확인)
      const userResult = await client.query(
        'SELECT organization_id FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows[0]) {
        throw new Error('사용자를 찾을 수 없습니다');
      }

      const user = userResult.rows[0];

      // 기관 사용자: 구독 상태 + 만료일 검증
      if (user.organization_id) {
        const orgResult = await client.query(
          `SELECT subscription_status, expiry_date, status
           FROM organizations WHERE id = $1`,
          [user.organization_id]
        );

        const org = orgResult.rows[0];
        if (org
            && org.subscription_status === 'active'
            && org.status === 'active'
            && (!org.expiry_date || new Date(org.expiry_date) > new Date())) {
          return { type: 'org_free' };
        }
      }

      // 개인 사용자: 크레딧 확인 (FOR UPDATE로 행 잠금)
      const creditResult = await client.query(
        'SELECT balance, free_trial_count FROM credits WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (!creditResult.rows[0]) {
        throw new Error('크레딧 정보를 찾을 수 없습니다');
      }

      const credit = creditResult.rows[0];

      // 무료 체험: 원자적 차감 + WHERE 조건으로 동시성 보호
      if (credit.free_trial_count > 0) {
        const trialUpdate = await client.query(
          `UPDATE credits
           SET free_trial_count = free_trial_count - 1,
               free_trial_used = free_trial_used + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND free_trial_count > 0
           RETURNING free_trial_count, balance`,
          [userId]
        );

        if (trialUpdate.rowCount === 0) {
          throw new Error('무료 체험 횟수가 부족합니다');
        }

        const updated = trialUpdate.rows[0];

        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
           VALUES ($1, 'free_trial', 0, $2, $3, $4)`,
          [userId, updated.balance, `무료 체험 사용 (${audioLength.toFixed(1)}분)`, audioLength]
        );

        return {
          type: 'free_trial',
          balance: updated.balance,
          freeTrialRemaining: updated.free_trial_count
        };
      }

      // 잔액 부족 사전 확인 (의미있는 에러 메시지용)
      if (credit.balance < cost) {
        throw new Error('크레딧이 부족합니다');
      }

      // 원자적 크레딧 차감: WHERE (balance - cost) >= 0 으로 음수 방지
      const updateResult = await client.query(
        `UPDATE credits
         SET balance = balance - $1,
             total_used = total_used + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND (balance - $1) >= 0
         RETURNING balance`,
        [cost, userId]
      );

      if (updateResult.rowCount === 0) {
        throw new Error('크레딧이 부족하거나 동시 요청이 발생했습니다');
      }

      const newBalance = updateResult.rows[0].balance;

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
         VALUES ($1, 'usage', $2, $3, $4, $5)`,
        [userId, -cost, newBalance, `음성 파일 처리 (${audioLength.toFixed(1)}분)`, audioLength]
      );

      return { type: 'charged', newBalance };
    });

    // 사용 로그 기록 (트랜잭션 외부)
    if (deductResult.type === 'org_free') {
      await this._logUsage(userId, 0, audioLength, consultationType, sttProvider, aiProvider, false);
      return {
        success: true,
        charged: 0,
        balance: null,
        message: '기관 플랜으로 무료 사용되었습니다'
      };
    }

    if (deductResult.type === 'free_trial') {
      await this._logUsage(userId, 0, audioLength, consultationType, sttProvider, aiProvider, true);
      return {
        success: true,
        charged: 0,
        balance: deductResult.balance,
        freeTrialRemaining: deductResult.freeTrialRemaining,
        message: `무료 체험이 사용되었습니다 (남은 횟수: ${deductResult.freeTrialRemaining}회)`
      };
    }

    await this._logUsage(userId, cost, audioLength, consultationType, sttProvider, aiProvider, false);
    logger.info('크레딧 차감 성공', { userId, cost, newBalance: deductResult.newBalance });

    return {
      success: true,
      charged: cost,
      balance: deductResult.newBalance,
      message: `${cost}원이 차감되었습니다`
    };
  }

  /**
   * 사용 내역 로깅
   */
  async _logUsage(userId, cost, audioLength, consultationType, sttProvider, aiProvider, isFree) {
    const db = getDB();

    const sttCost = Math.round(cost * 0.97);
    const aiCost = cost - sttCost;

    await db.run(
      `INSERT INTO usage_logs
       (user_id, consultation_type, audio_duration_seconds, stt_provider, stt_cost, ai_provider, ai_cost, total_cost, is_free_trial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, consultationType, audioLength * 60, sttProvider, sttCost, aiProvider, aiCost, cost, isFree]
    );
  }

  /**
   * 거래 내역 조회
   */
  async getTransactions(userId, limit = 50, offset = 0) {
    const db = getDB();

    const transactions = await db.query(
      `SELECT id, type, amount, balance_after, description, audio_duration_minutes, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = await db.get(
      'SELECT COUNT(*) as count FROM transactions WHERE user_id = $1',
      [userId]
    );

    return {
      success: true,
      transactions,
      total: total.count,
      limit,
      offset
    };
  }

  /**
   * 사용 통계 조회
   */
  async getUsageStats(userId) {
    const db = getDB();

    const totalStats = await db.get(
      `SELECT
         COUNT(*) as total_count,
         SUM(audio_duration_seconds) / 60.0 as total_minutes,
         SUM(total_cost) as total_cost,
         SUM(CASE WHEN is_free_trial = true THEN 1 ELSE 0 END) as free_trial_used
       FROM usage_logs
       WHERE user_id = $1`,
      [userId]
    );

    const monthStats = await db.get(
      `SELECT
         COUNT(*) as count,
         SUM(audio_duration_seconds) / 60.0 as minutes,
         SUM(total_cost) as cost
       FROM usage_logs
       WHERE user_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)`,
      [userId]
    );

    const recentUsage = await db.query(
      `SELECT consultation_type, audio_duration_seconds, total_cost, is_free_trial, created_at
       FROM usage_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    return {
      success: true,
      total: {
        count: totalStats.total_count || 0,
        minutes: totalStats.total_minutes || 0,
        cost: totalStats.total_cost || 0,
        freeTrialUsed: totalStats.free_trial_used || 0
      },
      thisMonth: {
        count: monthStats.count || 0,
        minutes: monthStats.minutes || 0,
        cost: monthStats.cost || 0
      },
      recent: recentUsage
    };
  }
}

module.exports = new CreditService();
