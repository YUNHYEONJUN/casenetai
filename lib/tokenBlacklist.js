/**
 * JWT 토큰 블랙리스트
 * - 로그아웃 시 토큰을 즉시 무효화
 * - 인메모리 Set + JWT 만료 시간 기반 자동 정리
 */

const jwt = require('jsonwebtoken');

class TokenBlacklist {
  constructor() {
    this._blacklist = new Map(); // token -> expiresAt (ms)
    this._cleanupInterval = null;
    this._maxSize = 10000; // 최대 10,000개 토큰
  }

  /**
   * 토큰을 블랙리스트에 추가
   * @param {string} token - JWT 토큰
   */
  add(token) {
    // 최대 크기 초과 시 만료된 토큰부터 정리
    if (this._blacklist.size >= this._maxSize) {
      this.cleanup();
      // 정리 후에도 초과면 가장 오래된 항목 제거
      if (this._blacklist.size >= this._maxSize) {
        const firstKey = this._blacklist.keys().next().value;
        this._blacklist.delete(firstKey);
      }
    }

    try {
      // 만료 시간 추출 (검증 없이 디코딩)
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        this._blacklist.set(token, decoded.exp * 1000);
      } else {
        // exp가 없으면 1시간 후 만료 설정
        this._blacklist.set(token, Date.now() + 3600000);
      }
    } catch (_) {
      // 잘못된 토큰이어도 안전하게 추가
      this._blacklist.set(token, Date.now() + 3600000);
    }
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   * @param {string} token
   * @returns {boolean}
   */
  has(token) {
    return this._blacklist.has(token);
  }

  /**
   * 만료된 토큰 정리
   */
  cleanup() {
    const now = Date.now();
    for (const [token, expiresAt] of this._blacklist) {
      if (expiresAt <= now) {
        this._blacklist.delete(token);
      }
    }
  }

  /**
   * 주기적 정리 시작 (기본 10분)
   */
  startCleanup(intervalMs = 600000) {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => this.cleanup(), intervalMs);
    // unref로 프로세스 종료 방해하지 않도록
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * 정리 중지
   */
  stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * 현재 블랙리스트 크기
   */
  get size() {
    return this._blacklist.size;
  }
}

// 싱글턴 인스턴스
const blacklist = new TokenBlacklist();
blacklist.startCleanup();

module.exports = blacklist;
