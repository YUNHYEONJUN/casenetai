/**
 * 결제 서비스 (토스페이먼츠 연동)
 */

const axios = require('axios');
const { getDB } = require('../database/db-postgres');
const creditService = require('./creditService');
const { logger } = require('../lib/logger');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 보너스 정책
const BONUS_TIERS = [
  { min: 50000, bonus: 0.30 },
  { min: 30000, bonus: 0.25 },
  { min: 10000, bonus: 0.20 },
  { min: 5000, bonus: 0.10 },
  { min: 0, bonus: 0 }
];

class PaymentService {

  /**
   * 보너스 계산
   */
  calculateBonus(amount) {
    for (const tier of BONUS_TIERS) {
      if (amount >= tier.min) {
        return Math.floor(amount * tier.bonus);
      }
    }
    return 0;
  }

  /**
   * 결제 요청 준비 (Order ID 생성)
   */
  async preparePayment(userId, amount) {
    if (!TOSS_CLIENT_KEY || !TOSS_SECRET_KEY) {
      throw new Error('결제 서비스가 설정되지 않았습니다. 관리자에게 문의하세요.');
    }

    const db = getDB();

    amount = parseInt(amount, 10);
    if (!Number.isFinite(amount) || amount < 1000) {
      throw new Error('최소 충전 금액은 1,000원입니다');
    }
    if (amount > 10000000) {
      throw new Error('최대 충전 금액은 10,000,000원입니다');
    }

    const bonusAmount = this.calculateBonus(amount);
    const totalCredit = amount + bonusAmount;

    const orderId = `ORDER_${userId}_${Date.now()}`;

    await db.run(
      `INSERT INTO payments (user_id, order_id, amount, bonus_amount, total_credit, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [userId, orderId, amount, bonusAmount, totalCredit]
    );

    logger.info('결제 준비 완료', { orderId, amount, bonus: bonusAmount });

    return {
      success: true,
      orderId,
      amount,
      bonusAmount,
      totalCredit,
      clientKey: TOSS_CLIENT_KEY,
      successUrl: `${BASE_URL}/payment-success.html`,
      failUrl: `${BASE_URL}/payment-fail.html`
    };
  }

  /**
   * 결제 승인 (토스페이먼츠 콜백 후 실행)
   * - 크레딧 충전 성공 후에만 payment status를 'success'로 변경
   */
  async confirmPayment(orderId, paymentKey, amount, userId) {
    const db = getDB();

    // 트랜잭션 내에서 FOR UPDATE로 동시 접근 방지
    return await db.transaction(async (client) => {
      const paymentResult = await client.query(
        'SELECT user_id, amount, bonus_amount, total_credit, status FROM payments WHERE order_id = $1 FOR UPDATE',
        [orderId]
      );

      const payment = paymentResult.rows[0];

      if (!payment) {
        throw new Error('결제 정보를 찾을 수 없습니다');
      }

      if (payment.user_id !== userId) {
        throw new Error('결제 권한이 없습니다');
      }

      // 이미 성공한 결제는 멱등성 보장 (동일 결과 반환)
      if (payment.status === 'success') {
        logger.info('이미 완료된 결제 재요청 (멱등성)', { orderId });
        const balanceResult = await client.query(
          'SELECT balance FROM credits WHERE user_id = $1',
          [payment.user_id]
        );
        return {
          success: true,
          orderId,
          payment: {
            amount: payment.amount,
            bonusAmount: payment.bonus_amount,
            totalCredit: payment.total_credit
          },
          balance: balanceResult.rows[0]?.balance || 0,
          alreadyProcessed: true
        };
      }

      if (payment.status !== 'pending') {
        throw new Error('이미 처리된 결제입니다');
      }

      if (payment.amount !== parseInt(amount, 10)) {
        throw new Error('결제 금액이 일치하지 않습니다');
      }

      // 토스페이먼츠 API 호출 (결제 승인)
      const authHeader = 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');

      let tossResponse;
      try {
        tossResponse = await axios.post(
          'https://api.tosspayments.com/v1/payments/confirm',
          { orderId, amount, paymentKey },
          {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
      } catch (apiError) {
        logger.error('토스페이먼츠 API 오류', { error: apiError.response?.data || apiError.message });

        // Mock 모드 (테스트 키 + 비프로덕션 환경에서만 허용)
        if (TOSS_SECRET_KEY && TOSS_SECRET_KEY.startsWith('test_') && process.env.NODE_ENV !== 'production') {
          logger.warn('테스트 모드: 결제 승인 스킵');
          tossResponse = {
            data: {
              orderId, paymentKey,
              status: 'DONE',
              method: 'card',
              approvedAt: new Date().toISOString()
            }
          };
        } else {
          // 결제 실패로 업데이트
          await client.query(
            "UPDATE payments SET status = 'failed' WHERE order_id = $1",
            [orderId]
          );
          throw apiError;
        }
      }

      try {
        // 크레딧 충전 (트랜잭션 내에서 원자적 처리)
        const totalCredit = Number(payment.amount) + Number(payment.bonus_amount);

        const creditResult = await client.query(
          'SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE',
          [payment.user_id]
        );

        if (!creditResult.rows[0]) {
          throw new Error('크레딧 정보를 찾을 수 없습니다');
        }

        const updateResult = await client.query(
          `UPDATE credits
           SET balance = balance + $1,
               total_purchased = total_purchased + $2,
               total_bonus = total_bonus + $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4
           RETURNING balance`,
          [totalCredit, payment.amount, payment.bonus_amount, payment.user_id]
        );

        const newBalance = updateResult.rows[0].balance;

        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id)
           VALUES ($1, 'charge', $2, $3, $4, $5)`,
          [payment.user_id, totalCredit,
           newBalance,
           `크레딧 충전 ${Number(payment.amount).toLocaleString()}원 + 보너스 ${Number(payment.bonus_amount).toLocaleString()}원`,
           orderId]
        );

        // 크레딧 충전 성공 후에만 결제 상태를 'success'로 변경
        await client.query(
          `UPDATE payments
           SET payment_key = $1,
               status = 'success',
               payment_method = $2,
               pg_response = $3,
               approved_at = CURRENT_TIMESTAMP
           WHERE order_id = $4`,
          [paymentKey, tossResponse.data.method, JSON.stringify(tossResponse.data), orderId]
        );

        logger.info('결제 승인 완료', { orderId, paymentKey });

        return {
          success: true,
          orderId,
          payment: {
            amount: payment.amount,
            bonusAmount: payment.bonus_amount,
            totalCredit: payment.total_credit
          },
          balance: newBalance,
          approvedAt: tossResponse.data.approvedAt
        };

      } catch (err) {
        // 트랜잭션 내이므로 자동 롤백됨
        logger.error('결제 승인 실패', { orderId, error: err.message });
        throw err;
      }
    });
  }

  /**
   * 결제 실패 처리
   */
  async failPayment(orderId, errorCode, errorMessage, userId) {
    const db = getDB();

    const payment = await db.get('SELECT user_id FROM payments WHERE order_id = $1', [orderId]);
    if (!payment) throw new Error('결제 정보를 찾을 수 없습니다');
    if (payment.user_id !== userId) throw new Error('결제 권한이 없습니다');

    await db.run(
      `UPDATE payments
       SET status = 'failed',
           pg_response = $1
       WHERE order_id = $2`,
      [JSON.stringify({ errorCode, errorMessage }), orderId]
    );

    logger.warn('결제 실패 처리', { orderId, errorMessage });

    return {
      success: true,
      message: '결제 실패 처리 완료'
    };
  }

  /**
   * 결제 취소
   */
  async cancelPayment(orderId, cancelReason, userId) {
    const db = getDB();

    const payment = await db.get(
      'SELECT payment_key, amount, status, user_id, total_credit FROM payments WHERE order_id = $1',
      [orderId]
    );

    if (!payment) {
      throw new Error('결제 정보를 찾을 수 없습니다');
    }

    if (userId && payment.user_id !== userId) {
      throw new Error('해당 결제에 대한 권한이 없습니다');
    }

    if (payment.status !== 'success') {
      throw new Error('취소할 수 있는 결제가 아닙니다');
    }

    // 토스페이먼츠 API 호출 (결제 취소)
    const authHeader = 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');

    let tossResponse;
    try {
      tossResponse = await axios.post(
        `https://api.tosspayments.com/v1/payments/${payment.payment_key}/cancel`,
        { cancelReason },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
    } catch (apiError) {
      if (process.env.NODE_ENV !== 'production' && TOSS_SECRET_KEY && TOSS_SECRET_KEY.startsWith('test_')) {
        logger.warn('테스트 모드: 결제 취소 스킵');
        tossResponse = {
          data: {
            status: 'CANCELED',
            canceledAt: new Date().toISOString()
          }
        };
      } else {
        throw apiError;
      }
    }

    // 결제 상태 업데이트 + 크레딧 환불을 트랜잭션으로 처리
    await db.transaction(async (client) => {
      await client.query(
        "UPDATE payments SET status = 'cancelled', pg_response = $1 WHERE order_id = $2",
        [JSON.stringify(tossResponse.data), orderId]
      );

      const refundAmount = payment.total_credit || payment.amount;

      // FOR UPDATE로 크레딧 행 잠금
      const creditResult = await client.query(
        'SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE',
        [payment.user_id]
      );

      const currentBalance = creditResult.rows[0]?.balance || 0;
      const actualDeduction = Math.min(refundAmount, currentBalance);

      const updatedResult = await client.query(
        `UPDATE credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING balance`,
        [actualDeduction, payment.user_id]
      );

      const newBalance = updatedResult.rows[0]?.balance || 0;

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id)
         VALUES ($1, 'refund', $2, $3, $4, $5)`,
        [payment.user_id, -actualDeduction, newBalance, '결제 취소 환불', orderId]
      );
    });

    logger.info('결제 취소 완료', { orderId, userId: payment.user_id });

    return {
      success: true,
      message: '결제가 취소되었습니다'
    };
  }

  /**
   * 결제 내역 조회
   */
  async getPaymentHistory(userId, limit = 20, offset = 0) {
    const db = getDB();

    const payments = await db.query(
      `SELECT order_id, amount, bonus_amount, total_credit, status, payment_method, approved_at, created_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = await db.get(
      'SELECT COUNT(*) as count FROM payments WHERE user_id = $1',
      [userId]
    );

    return {
      success: true,
      payments,
      total: total.count,
      limit,
      offset
    };
  }
}

module.exports = new PaymentService();
