/**
 * TokenBlacklist 단위 테스트
 */

const jwt = require('jsonwebtoken');

// 테스트용 secret
const TEST_SECRET = 'test-secret-key';

describe('TokenBlacklist', () => {
  let blacklist;

  beforeEach(() => {
    // 매 테스트마다 새 인스턴스 사용
    jest.resetModules();
    blacklist = require('../../lib/tokenBlacklist');
    // 기존 엔트리 정리
    blacklist._blacklist.clear();
  });

  afterAll(() => {
    blacklist.stopCleanup();
  });

  it('토큰을 블랙리스트에 추가하고 확인한다', () => {
    const token = jwt.sign({ userId: 1 }, TEST_SECRET, { expiresIn: '1h' });

    expect(blacklist.has(token)).toBe(false);
    blacklist.add(token);
    expect(blacklist.has(token)).toBe(true);
  });

  it('블랙리스트에 없는 토큰은 false를 반환한다', () => {
    const token = jwt.sign({ userId: 2 }, TEST_SECRET, { expiresIn: '1h' });
    expect(blacklist.has(token)).toBe(false);
  });

  it('만료된 토큰은 cleanup 시 제거된다', () => {
    // 이미 만료된 토큰 시뮬레이션
    const token = 'expired-token';
    blacklist._blacklist.set(token, Date.now() - 1000);

    expect(blacklist.has(token)).toBe(true);
    blacklist.cleanup();
    expect(blacklist.has(token)).toBe(false);
  });

  it('아직 유효한 토큰은 cleanup 후에도 유지된다', () => {
    const token = jwt.sign({ userId: 3 }, TEST_SECRET, { expiresIn: '1h' });
    blacklist.add(token);

    blacklist.cleanup();
    expect(blacklist.has(token)).toBe(true);
  });

  it('size가 정확한 개수를 반환한다', () => {
    expect(blacklist.size).toBe(0);

    blacklist.add(jwt.sign({ userId: 1 }, TEST_SECRET, { expiresIn: '1h' }));
    blacklist.add(jwt.sign({ userId: 2 }, TEST_SECRET, { expiresIn: '1h' }));

    expect(blacklist.size).toBe(2);
  });

  it('잘못된 형식의 토큰도 안전하게 추가된다', () => {
    blacklist.add('not-a-valid-jwt');
    expect(blacklist.has('not-a-valid-jwt')).toBe(true);
  });
});
