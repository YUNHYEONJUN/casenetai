/**
 * 만료된 세션 자동 정리
 * - 서버 시작 시 1회 실행
 * - 이후 6시간마다 반복
 */

const { logger } = require('./logger');

let cleanupInterval = null;

async function cleanExpiredSessions() {
  try {
    const { getDB } = require('../database/db-postgres');
    const db = getDB();

    const result = await db.run(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );

    if (result.changes > 0) {
      logger.info('만료 세션 정리 완료', { deleted: result.changes });
    }
  } catch (error) {
    logger.error('세션 정리 실패', { error: error.message });
  }
}

function startSessionCleanup() {
  // 서버 시작 30초 후 첫 실행 (DB 연결 안정화 대기)
  setTimeout(() => {
    cleanExpiredSessions();
    // 이후 6시간마다 반복
    cleanupInterval = setInterval(cleanExpiredSessions, 6 * 60 * 60 * 1000);
  }, 30000);
}

function stopSessionCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = { startSessionCleanup, stopSessionCleanup, cleanExpiredSessions };
