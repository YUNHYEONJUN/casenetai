/**
 * 크레딧 서비스
 * - 크레딧 충전, 차감, 조회
 * - 무료 체험 관리
 */

const { getDB } = require('../database/db-postgres');

class CreditService {
  
  /**
   * 크레딧 잔액 조회
   */
  async getBalance(userId) {
    const db = getDB();
    
    try {
      const credit = await db.get(
        `SELECT balance, free_trial_count, total_purchased, total_used, total_bonus
         FROM credits WHERE user_id = $1`,
        [userId]
      );
      
      if (!credit) {
        // 크레딧 레코드가 없으면 생성
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
      return await db.transaction(async (client) => {
        // 현재 잔액 조회
        const creditResult = await client.query(
          'SELECT balance FROM credits WHERE user_id = $1',
          [userId]
        );
        
        if (creditResult.rows.length === 0) {
          throw new Error('크레딧 정보를 찾을 수 없습니다');
        }
        
        const credit = creditResult.rows[0];
        const totalCredit = amount + bonusAmount;
        const newBalance = credit.balance + totalCredit;
        
        // 크레딧 업데이트
        await client.query(
          `UPDATE credits 
           SET balance = $1,
               total_purchased = total_purchased + $2,
               total_bonus = total_bonus + $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4`,
          [newBalance, amount, bonusAmount, userId]
        );
        
        // 충전 거래 기록
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id, payment_id)
           VALUES ($1, 'purchase', $2, $3, $4, $5, $6)`,
          [userId, amount, newBalance, `크레딧 충전 ${amount.toLocaleString()}원`, orderId, paymentKey]
        );
        
        // 보너스 거래 기록 (보너스가 있는 경우)
        if (bonusAmount > 0) {
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, order_id)
             VALUES ($1, 'bonus', $2, $3, $4, $5)`,
            [userId, bonusAmount, newBalance, `보너스 크레딧 ${bonusAmount.toLocaleString()}원`, orderId]
          );
        }
        
        console.log(`✅ 크레딧 충전 성공: userId=${userId}, amount=${amount}, bonus=${bonusAmount}`);
        
        return {
          success: true,
          newBalance: newBalance,
          charged: amount,
          bonus: bonusAmount,
          total: totalCredit
        };
      });
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
      return await db.transaction(async (client) => {
        // 사용자 정보 조회 (기관 여부 확인)
        const userResult = await client.query(
          'SELECT organization_id FROM users WHERE id = $1',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          throw new Error('사용자를 찾을 수 없습니다');
        }
        
        const user = userResult.rows[0];
        
        // 기관 사용자인 경우: 기관 구독 확인
        if (user.organization_id) {
          const orgResult = await client.query(
            'SELECT subscription_status FROM organizations WHERE id = $1',
            [user.organization_id]
          );
          
          if (orgResult.rows.length > 0 && orgResult.rows[0].subscription_status === 'active') {
            // 기관 플랜: 무료 사용 (차감 없음)
            await this._logUsageWithClient(client, userId, 0, audioLength, consultationType, sttProvider, aiProvider, false);
            
            return {
              success: true,
              charged: 0,
              balance: null,
              message: '기관 플랜으로 무료 사용되었습니다'
            };
          }
        }
        
        // 개인 사용자: 크레딧 확인 및 차감
        const creditResult = await client.query(
          'SELECT balance, free_trial_count FROM credits WHERE user_id = $1',
          [userId]
        );
        
        if (creditResult.rows.length === 0) {
          throw new Error('크레딧 정보를 찾을 수 없습니다');
        }
        
        const credit = creditResult.rows[0];
        
        // 무료 체험 사용 가능한지 확인
        if (credit.free_trial_count > 0) {
          // 무료 체험 사용
          await client.query(
            `UPDATE credits 
             SET free_trial_count = free_trial_count - 1,
                 free_trial_used = free_trial_used + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1`,
            [userId]
          );
          
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
             VALUES ($1, 'free_trial', 0, $2, $3, $4)`,
            [userId, credit.balance, `무료 체험 사용 (${audioLength.toFixed(1)}분)`, audioLength]
          );
          
          await this._logUsageWithClient(client, userId, 0, audioLength, consultationType, sttProvider, aiProvider, true);
          
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
        
        // 크레딧 원자적 차감 (Race Condition 방지)
        const updateResult = await client.query(
          `UPDATE credits 
           SET balance = balance - $1,
               total_used = total_used + $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $3 AND balance >= $4
           RETURNING balance`,
          [cost, cost, userId, cost]
        );
        
        // 업데이트된 행이 없으면 동시 요청으로 인한 잔액 부족
        if (updateResult.rows.length === 0) {
          throw new Error('크레딧이 부족하거나 동시 요청이 발생했습니다');
        }
        
        const newBalance = updateResult.rows[0].balance;
        
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, audio_duration_minutes)
           VALUES ($1, 'usage', $2, $3, $4, $5)`,
          [userId, -cost, newBalance, `음성 파일 처리 (${audioLength.toFixed(1)}분)`, audioLength]
        );
        
        await this._logUsageWithClient(client, userId, cost, audioLength, consultationType, sttProvider, aiProvider, false);
        
        console.log(`✅ 크레딧 차감 성공: userId=${userId}, cost=${cost}, newBalance=${newBalance}`);
        
        return {
          success: true,
          charged: cost,
          balance: newBalance,
          message: `${cost}원이 차감되었습니다`
        };
      });
    } catch (error) {
      console.error('❌ 크레딧 차감 실패:', error.message);
      throw error;
    }
  }
  
  /**
   * 사용 내역 로깅 (트랜잭션 내)
   */
  async _logUsageWithClient(client, userId, cost, audioLength, consultationType, sttProvider, aiProvider, isFree) {
    const sttCost = Math.round(cost * 0.97); // STT 비용 약 97%
    const aiCost = cost - sttCost;
    
    await client.query(
      `INSERT INTO usage_logs 
       (user_id, consultation_type, audio_duration_seconds, stt_provider, stt_cost, ai_provider, ai_cost, total_cost, is_free_trial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, consultationType, audioLength * 60, sttProvider, sttCost, aiProvider, aiCost, cost, isFree]
    );
  }
  
  /**
   * 사용 내역 로깅 (레거시 호환)
   */
  async _logUsage(userId, cost, audioLength, consultationType, sttProvider, aiProvider, isFree) {
    const db = getDB();
    
    const sttCost = Math.round(cost * 0.97); // STT 비용 약 97%
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
    
    try {
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
           SUM(CASE WHEN is_free_trial = true THEN 1 ELSE 0 END) as free_trial_used
         FROM usage_logs
         WHERE user_id = $1`,
        [userId]
      );
      
      // 이번 달 통계
      const monthStats = await db.get(
        `SELECT 
           COUNT(*) as count,
           SUM(audio_duration_seconds) / 60.0 as minutes,
           SUM(total_cost) as cost
         FROM usage_logs
         WHERE user_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)`,
        [userId]
      );
      
      // 최근 사용 내역
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
      
    } catch (error) {
      console.error('❌ 사용 통계 조회 실패:', error.message);
      throw error;
    }
  }
}

module.exports = new CreditService();
