/**
 * 크레딧 서비스
 * - 크레딧 충전, 차감, 조회
 * - 무료 체험 관리
 */

const { getDB } = require('../database/db');

class CreditService {
  
  /**
   * 크레딧 잔액 조회
   */
  async getBalance(userId) {
    const db = getDB();
    
    try {
      const credit = await db.get(
        `SELECT balance, free_trial_count, total_purchased, total_used, total_bonus
         FROM credits WHERE user_id = ?`,
        [userId]
      );
      
      if (!credit) {
        // 크레딧 레코드가 없으면 생성
        await db.run(
          'INSERT INTO credits (user_id, balance, free_trial_count) VALUES (?, 0, 3)',
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
      
    } catch (error) {
      console.error('❌ 잔액 조회 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 크레딧 충전 (결제 완료 후 호출)
   */
  async charge(userId, amount, bonusAmount, orderId, paymentKey) {
    const db = getDB();
    
    try {
      await db.beginTransaction();
      
      try {
        // 현재 잔액 조회
        const credit = await db.get(
          'SELECT balance FROM credits WHERE user_id = ?',
          [userId]
        );
        
        if (!credit) {
          throw new Error('크레딧 정보를 찾을 수 없습니다');
        }
        
        const totalCredit = amount + bonusAmount;
        const newBalance = credit.balance + totalCredit;
        
        // 크레딧 업데이트
        await db.run(
          `UPDATE credits 
           SET balance = ?,
               total_purchased = total_purchased + ?,
               total_bonus = total_bonus + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [newBalance, amount, bonusAmount, userId]
        );
        
        // 충전 거래 기록
        await db.run(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id, payment_id)
           VALUES (?, 'purchase', ?, ?, ?, ?, ?)`,
          [userId, amount, newBalance, `크레딧 충전 ${amount.toLocaleString()}원`, orderId, paymentKey]
        );
        
        // 보너스 거래 기록 (보너스가 있는 경우)
        if (bonusAmount > 0) {
          await db.run(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id)
             VALUES (?, 'bonus', ?, ?, ?, ?)`,
            [userId, bonusAmount, newBalance, `보너스 크레딧 ${bonusAmount.toLocaleString()}원`, orderId]
          );
        }
        
        await db.commit();
        
        console.log(`✅ 크레딧 충전 성공: userId=${userId}, amount=${amount}, bonus=${bonusAmount}`);
        
        return {
          success: true,
          newBalance: newBalance,
          charged: amount,
          bonus: bonusAmount,
          total: totalCredit
        };
        
      } catch (err) {
        await db.rollback();
        throw err;
      }
      
    } catch (error) {
      console.error('❌ 크레딧 충전 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 크레딧 차감 (상담일지 생성 시)
   */
  async deduct(userId, cost, audioLength, consultationType, sttProvider, aiProvider) {
    const db = getDB();
    
    try {
      await db.beginTransaction();
      
      try {
        // 사용자 정보 조회 (기관 여부 확인)
        const user = await db.get(
          'SELECT organization_id FROM users WHERE id = ?',
          [userId]
        );
        
        if (!user) {
          throw new Error('사용자를 찾을 수 없습니다');
        }
        
        // 기관 사용자인 경우: 기관 구독 확인
        if (user.organization_id) {
          const org = await db.get(
            'SELECT subscription_status FROM organizations WHERE id = ?',
            [user.organization_id]
          );
          
          if (org && org.subscription_status === 'active') {
            // 기관 플랜: 무료 사용 (차감 없음)
            await this._logUsage(userId, 0, audioLength, consultationType, sttProvider, aiProvider, false);
            await db.commit();
            
            return {
              success: true,
              charged: 0,
              balance: null,
              message: '기관 플랜으로 무료 사용되었습니다'
            };
          }
        }
        
        // 개인 사용자: 크레딧 확인 및 차감
        const credit = await db.get(
          'SELECT balance, free_trial_count FROM credits WHERE user_id = ?',
          [userId]
        );
        
        if (!credit) {
          throw new Error('크레딧 정보를 찾을 수 없습니다');
        }
        
        // 무료 체험 사용 가능한지 확인
        if (credit.free_trial_count > 0) {
          // 무료 체험 사용
          await db.run(
            `UPDATE credits 
             SET free_trial_count = free_trial_count - 1,
                 free_trial_used = free_trial_used + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [userId]
          );
          
          await db.run(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
             VALUES (?, 'free_trial', 0, ?, ?, ?)`,
            [userId, credit.balance, `무료 체험 사용 (${audioLength.toFixed(1)}분)`, audioLength]
          );
          
          await this._logUsage(userId, 0, audioLength, consultationType, sttProvider, aiProvider, true);
          await db.commit();
          
          return {
            success: true,
            charged: 0,
            balance: credit.balance,
            freeTrialRemaining: credit.free_trial_count - 1,
            message: `무료 체험이 사용되었습니다 (남은 횟수: ${credit.free_trial_count - 1}회)`
          };
        }
        
        // 잔액 확인
        if (credit.balance < cost) {
          throw new Error('크레딧이 부족합니다');
        }
        
        // 크레딧 차감
        const newBalance = credit.balance - cost;
        
        await db.run(
          `UPDATE credits 
           SET balance = ?,
               total_used = total_used + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [newBalance, cost, userId]
        );
        
        await db.run(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
           VALUES (?, 'usage', ?, ?, ?, ?)`,
          [userId, -cost, newBalance, `음성 파일 처리 (${audioLength.toFixed(1)}분)`, audioLength]
        );
        
        await this._logUsage(userId, cost, audioLength, consultationType, sttProvider, aiProvider, false);
        await db.commit();
        
        console.log(`✅ 크레딧 차감 성공: userId=${userId}, cost=${cost}, newBalance=${newBalance}`);
        
        return {
          success: true,
          charged: cost,
          balance: newBalance,
          message: `${cost}원이 차감되었습니다`
        };
        
      } catch (err) {
        await db.rollback();
        throw err;
      }
      
    } catch (error) {
      console.error('❌ 크레딧 차감 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 사용 내역 로깅
   */
  async _logUsage(userId, cost, audioLength, consultationType, sttProvider, aiProvider, isFree) {
    const db = getDB();
    
    const sttCost = Math.round(cost * 0.97); // STT 비용 약 97%
    const aiCost = cost - sttCost;
    
    await db.run(
      `INSERT INTO usage_logs 
       (user_id, consultation_type, audio_duration_seconds, stt_provider, stt_cost, ai_provider, ai_cost, total_cost, is_free_trial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, consultationType, audioLength * 60, sttProvider, sttCost, aiProvider, aiCost, cost, isFree ? 1 : 0]
    );
  }
  
  /**
   * 거래 내역 조회
   */
  async getTransactions(userId, limit = 50, offset = 0) {
    const db = getDB();
    
    try {
      const transactions = await db.query(
        `SELECT id, type, amount, balance_after, description, audio_duration_minutes, created_at
         FROM transactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      
      const total = await db.get(
        'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?',
        [userId]
      );
      
      return {
        success: true,
        transactions: transactions,
        total: total.count,
        limit: limit,
        offset: offset
      };
      
    } catch (error) {
      console.error('❌ 거래 내역 조회 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 사용 통계 조회
   */
  async getUsageStats(userId) {
    const db = getDB();
    
    try {
      // 전체 통계
      const totalStats = await db.get(
        `SELECT 
           COUNT(*) as total_count,
           SUM(audio_duration_seconds) / 60.0 as total_minutes,
           SUM(total_cost) as total_cost,
           SUM(CASE WHEN is_free_trial = 1 THEN 1 ELSE 0 END) as free_trial_used
         FROM usage_logs
         WHERE user_id = ?`,
        [userId]
      );
      
      // 이번 달 통계
      const monthStats = await db.get(
        `SELECT 
           COUNT(*) as count,
           SUM(audio_duration_seconds) / 60.0 as minutes,
           SUM(total_cost) as cost
         FROM usage_logs
         WHERE user_id = ? AND date(created_at) >= date('now', 'start of month')`,
        [userId]
      );
      
      // 최근 사용 내역
      const recentUsage = await db.query(
        `SELECT consultation_type, audio_duration_seconds, total_cost, is_free_trial, created_at
         FROM usage_logs
         WHERE user_id = ?
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
      
    } catch (error) {
      console.error('❌ 사용 통계 조회 실패:', error.message);
      throw error;
    }
  }
}

module.exports = new CreditService();
