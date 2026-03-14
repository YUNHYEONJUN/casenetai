/**
 * 로거 유틸리티 테스트
 */

const { maskSensitiveData, generateRequestId } = require('../../lib/logger');

describe('maskSensitiveData', () => {
  it('주민번호를 마스킹한다', () => {
    const result = maskSensitiveData('주민번호: 900101-1234567');
    expect(result).toBe('주민번호: ******-*******');
  });

  it('전화번호를 마스킹한다', () => {
    const result = maskSensitiveData('연락처: 010-1234-5678');
    expect(result).toBe('연락처: 010-****-****');
  });

  it('객체 내 민감 키를 마스킹한다', () => {
    const result = maskSensitiveData({
      username: '홍길동',
      password: 'secret123',
      token: 'jwt.token.here',
    });

    expect(result.username).toBe('홍길동');
    expect(result.password).toBe('***REDACTED***');
    expect(result.token).toBe('***REDACTED***');
  });

  it('중첩 객체도 처리한다', () => {
    const result = maskSensitiveData({
      user: { name: '김철수', authorization: 'Bearer xxx' },
    });

    expect(result.user.name).toBe('김철수');
    expect(result.user.authorization).toBe('***REDACTED***');
  });

  it('null, undefined, 숫자는 그대로 반환한다', () => {
    expect(maskSensitiveData(null)).toBeNull();
    expect(maskSensitiveData(undefined)).toBeUndefined();
    expect(maskSensitiveData(42)).toBe(42);
  });
});

describe('generateRequestId', () => {
  it('8자 hex 문자열을 반환한다', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('매번 고유한 값을 생성한다', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });
});
