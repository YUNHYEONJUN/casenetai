/**
 * 결제 관련 라우터
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const paymentService = require('../services/paymentService');
const creditService = require('../services/creditService');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { success, error } = require('../lib/response');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 크레딧 잔액 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/credit/balance', authenticateToken, async (req, res, next) => {
  try {
    const balance = await creditService.getBalance(req.user.userId);
    success(res, balance);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 거래 내역 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const transactionsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

router.get('/credit/transactions', authenticateToken, validate(transactionsSchema), async (req, res, next) => {
  try {
    const result = await creditService.getTransactions(req.user.userId, req.query.limit, req.query.offset);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사용 통계 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/credit/stats', authenticateToken, async (req, res, next) => {
  try {
    const result = await creditService.getUsageStats(req.user.userId);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 요청 준비
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const prepareSchema = z.object({
  body: z.object({
    amount: z.coerce.number().int().min(1000, '충전 금액은 1,000원 이상이어야 합니다').max(10000000, '충전 금액은 10,000,000원 이하여야 합니다'),
  }),
});

router.post('/prepare', authenticateToken, validate(prepareSchema), async (req, res, next) => {
  try {
    const result = await paymentService.preparePayment(req.user.userId, req.body.amount);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 승인 (토스페이먼츠 콜백)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const confirmSchema = z.object({
  body: z.object({
    orderId: z.string().min(1, 'orderId는 필수입니다'),
    paymentKey: z.string().min(1, 'paymentKey는 필수입니다'),
    amount: z.coerce.number().positive('amount는 필수입니다'),
  }),
});

router.post('/confirm', authenticateToken, validate(confirmSchema), async (req, res, next) => {
  try {
    const { orderId, paymentKey, amount } = req.body;
    const result = await paymentService.confirmPayment(orderId, paymentKey, amount);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 실패 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const failSchema = z.object({
  body: z.object({
    orderId: z.string().min(1, 'orderId가 필요합니다'),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

router.post('/fail', authenticateToken, validate(failSchema), async (req, res, next) => {
  try {
    const { orderId, errorCode, errorMessage } = req.body;
    const result = await paymentService.failPayment(orderId, errorCode, errorMessage);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결제 내역 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const historySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

router.get('/history', authenticateToken, validate(historySchema), async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentHistory(req.user.userId, req.query.limit, req.query.offset);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 보너스 계산 (미리보기)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const bonusSchema = z.object({
  params: z.object({
    amount: z.coerce.number().int().min(0, '올바른 금액을 입력해주세요'),
  }),
});

router.get('/bonus/:amount', validate(bonusSchema), (req, res, next) => {
  try {
    const { amount } = req.params;
    const bonusAmount = paymentService.calculateBonus(amount);
    const totalCredit = amount + bonusAmount;

    success(res, {
      amount,
      bonusAmount,
      totalCredit,
      bonusRate: amount > 0 ? Math.round((bonusAmount / amount) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
