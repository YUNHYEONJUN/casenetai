/**
 * 결제 서비스 (토스페이먼츠 연동)
 */

const axios = require('axios');
const { getDB } = require('../database/db');
const creditService = require('./creditService');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_sk_YOUR_SECRET_KEY';
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || 'test_ck_YOUR_CLIENT_KEY';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 보너스 정책
const BONUS_TIERS = [
  { min: 50000, bonus: 0.30 },  // 50,000원 이상: 30% 보너스
  { min: 30000, bonus: 0.25 },  // 30,000원 이상: 25% 보너스
  { min: 10000, bonus: 0.20 },  // 10,000원 이상: 20% 보너스
  { min: 5000, bonus: 0.10 },   // 5,000원 이상: 10% 보너스
  { min: 0, bonus: 0 }           // 그 외: 보너스 없음
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
    const db = getDB();
    
    try {
      // 최소 금액 체크
      if (amount < 1000) {
        throw new Error('최소 충전 금액은 1,000원입니다');
      }
      
      // 보너스 계산
      const bonusAmount = this.calculateBonus(amount);
      const totalCredit = amount + bonusAmount;
      
      // Order ID 생성
      const orderId = `ORDER_${userId}_${Date.now()}`;
      
      // 결제 정보 저장 (pending 상태)
      await db.run(
        `INSERT INTO payments (user_id, order_id, amount, bonus_amount, total_credit, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [userId, orderId, amount, bonusAmount, totalCredit]
      );
      
      console.log(`✅ 결제 준비 완료: orderId=${orderId}, amount=${amount}, bonus=${bonusAmount}`);
      
      return {
        success: true,
        orderId: orderId,
        amount: amount,
        bonusAmount: bonusAmount,
        totalCredit: totalCredit,
        clientKey: TOSS_CLIENT_KEY,
        successUrl: `${BASE_URL}/payment-success.html`,
        failUrl: `${BASE_URL}/payment-fail.html`
      };
      
    } catch (error) {
      console.error('❌ 결제 준비 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 결제 승인 (토스페이먼츠 콜백 후 실행)
   */
  async confirmPayment(orderId, paymentKey, amount) {
    const db = getDB();
    
    try {
      // 결제 정보 조회
      const payment = await db.get(
        'SELECT user_id, amount, bonus_amount, total_credit, status FROM payments WHERE order_id = $1',
        [orderId]
      );
      
      if (!payment) {
        throw new Error('결제 정보를 찾을 수 없습니다');
      }
      
      if (payment.status !== 'pending') {
        throw new Error('이미 처리된 결제입니다');
      }
      
      if (payment.amount !== amount) {
        throw new Error('결제 금액이 일치하지 않습니다');
      }
      
      // 토스페이먼츠 API 호출 (결제 승인)
      const authHeader = 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
      
      let tossResponse;
      try {
        tossResponse = await axios.post(
          'https://api.tosspayments.com/v1/payments/confirm',
          {
            orderId: orderId,
            amount: amount,
            paymentKey: paymentKey
          },
          {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (apiError) {
        console.error('❌ 토스페이먼츠 API 오류:', apiError.response?.data || apiError.message);
        
        // Mock 모드 (테스트 키인 경우)
        if (TOSS_SECRET_KEY.startsWith('test_')) {
          console.log('⚠️ 테스트 모드: 결제 승인 스킵');
          tossResponse = {
            data: {
              orderId: orderId,
              paymentKey: paymentKey,
              status: 'DONE',
              method: 'card',
              approvedAt: new Date().toISOString()
            }
          };
        } else {
          throw apiError;
        }
      }
      
      // 트랜잭션 시작
      await db.beginTransaction();
      
      try {
        // 결제 정보 업데이트
        await db.run(
          `UPDATE payments 
           SET payment_key = ?, 
               status = 'success', 
               payment_method = ?,
               pg_response = ?,
               approved_at = CURRENT_TIMESTAMP
           WHERE order_id = ?`,
          [
            paymentKey,
            tossResponse.data.method,
            JSON.stringify(tossResponse.data),
            orderId
          ]
        );
        
        // 크레딧 충전
        await creditService.charge(
          payment.user_id,
          payment.amount,
          payment.bonus_amount,
          orderId,
          paymentKey
        );
        
        // 충전 후 잔액 조회
        const balanceInfo = await creditService.getBalance(payment.user_id);
        
        await db.commit();
        
        console.log(`✅ 결제 승인 완료: orderId=${orderId}, paymentKey=${paymentKey}`);
        
        return {
          success: true,
          orderId: orderId,
          payment: {
            amount: payment.amount,
            bonusAmount: payment.bonus_amount,
            totalCredit: payment.total_credit
          },
          balance: balanceInfo.balance,
          approvedAt: tossResponse.data.approvedAt
        };
        
      } catch (err) {
        await db.rollback();
        
        // 결제 실패로 업데이트
        await db.run(
          "UPDATE payments SET status = 'failed' WHERE order_id = $1",
          [orderId]
        );
        
        throw err;
      }
      
    } catch (error) {
      console.error('❌ 결제 승인 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 결제 실패 처리
   */
  async failPayment(orderId, errorCode, errorMessage) {
    const db = getDB();
    
    try {
      await db.run(
        `UPDATE payments 
         SET status = 'failed', 
             pg_response = ?
         WHERE order_id = ?`,
        [JSON.stringify({ errorCode, errorMessage }), orderId]
      );
      
      console.log(`⚠️ 결제 실패 처리: orderId=${orderId}, error=${errorMessage}`);
      
      return {
        success: true,
        message: '결제 실패 처리 완료'
      };
      
    } catch (error) {
      console.error('❌ 결제 실패 처리 중 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 결제 취소
   */
  async cancelPayment(orderId, cancelReason) {
    const db = getDB();
    
    try {
      // 결제 정보 조회
      const payment = await db.get(
        'SELECT payment_key, amount, status FROM payments WHERE order_id = $1',
        [orderId]
      );
      
      if (!payment) {
        throw new Error('결제 정보를 찾을 수 없습니다');
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
          {
            cancelReason: cancelReason
          },
          {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (apiError) {
        // Mock 모드
        if (TOSS_SECRET_KEY.startsWith('test_')) {
          console.log('⚠️ 테스트 모드: 결제 취소 스킵');
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
      
      // 결제 상태 업데이트
      await db.run(
        "UPDATE payments SET status = 'cancelled', pg_response = $1 WHERE order_id = $2",
        [JSON.stringify(tossResponse.data), orderId]
      );
      
      console.log(`✅ 결제 취소 완료: orderId=${orderId}`);
      
      return {
        success: true,
        message: '결제가 취소되었습니다'
      };
      
    } catch (error) {
      console.error('❌ 결제 취소 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 결제 내역 조회
   */
  async getPaymentHistory(userId, limit = 20, offset = 0) {
    const db = getDB();
    
    try {
      const payments = await db.query(
        `SELECT order_id, amount, bonus_amount, total_credit, status, payment_method, approved_at, created_at
         FROM payments
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      
      const total = await db.get(
        'SELECT COUNT(*) as count FROM payments WHERE user_id = $1',
        [userId]
      );
      
      return {
        success: true,
        payments: payments,
        total: total.count,
        limit: limit,
        offset: offset
      };
      
    } catch (error) {
      console.error('❌ 결제 내역 조회 실패:', error.message);
      throw error;
    }
  }
}

module.exports = new PaymentService();
