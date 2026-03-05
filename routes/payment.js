/**
 * 결제 관련 라우터
 */

const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const creditService = require('../services/creditService');
const { authenticateToken } = require('../middleware/auth');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 크레딧 잔액 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/credit/balance', authenticateToken, async (req, res) => {
  try {
    const balance = await creditService.getBalance(req.user.userId);
    res.json({
      success: true,
      ...balance
    });
  } catch (error) {
    console.error('❌ 잔액 조회 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 거래 내역 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/credit/transactions', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await creditService.getTransactions(req.user.userId, limit, offset);
    res.json(result);
  } catch (error) {
    console.error('❌ 거래 내역 조회 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용 통계 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/credit/stats', authenticateToken, async (req, res) => {
  try {
    const result = await creditService.getUsageStats(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('❌ 사용 통계 조회 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 요청 준비
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/prepare', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount < 1000) {
      return res.status(400).json({
        success: false,
        error: '최소 충전 금액은 1,000원입니다'
      });
    }
    
    const result = await paymentService.preparePayment(req.user.userId, amount);
    res.json(result);
  } catch (error) {
    console.error('❌ 결제 준비 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 승인 (토스페이먼츠 콜백)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/confirm', async (req, res) => {
  try {
    const { orderId, paymentKey, amount } = req.body;
    
    if (!orderId || !paymentKey || !amount) {
      return res.status(400).json({
        success: false,
        error: '필수 파라미터가 누락되었습니다'
      });
    }
    
    const result = await paymentService.confirmPayment(orderId, paymentKey, amount);
    res.json(result);
  } catch (error) {
    console.error('❌ 결제 승인 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 실패 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/fail', async (req, res) => {
  try {
    const { orderId, errorCode, errorMessage } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId가 필요합니다'
      });
    }
    
    const result = await paymentService.failPayment(orderId, errorCode, errorMessage);
    res.json(result);
  } catch (error) {
    console.error('❌ 결제 실패 처리 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 내역 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await paymentService.getPaymentHistory(req.user.userId, limit, offset);
    res.json(result);
  } catch (error) {
    console.error('❌ 결제 내역 조회 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 보너스 계산 (미리보기)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/bonus/:amount', (req, res) => {
  try {
    // Null safety 체크
    if (!req.params.amount) {
      return res.status(400).json({
        success: false,
        error: '금액이 필요합니다.'
      });
    }
    
    const amount = parseInt(req.params.amount);
    
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        error: '올바른 금액을 입력해주세요'
      });
    }
    
    const bonusAmount = paymentService.calculateBonus(amount);
    const totalCredit = amount + bonusAmount;
    
    res.json({
      success: true,
      amount: amount,
      bonusAmount: bonusAmount,
      totalCredit: totalCredit,
      bonusRate: amount > 0 ? Math.round((bonusAmount / amount) * 100) : 0
    });
  } catch (error) {
    console.error('❌ 보너스 계산 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
