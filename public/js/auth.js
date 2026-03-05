/**
 * 인증 유틸리티
 * - 자동 토큰 갱신 (401 응답 시 refresh token 사용)
 * - 인증 체크 및 로그아웃
 */

(function() {
  let isRefreshing = false;
  let refreshPromise = null;

  /**
   * refresh token으로 access token 갱신
   */
  async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 인증된 API 호출 (자동 토큰 갱신 포함)
   */
  async function authenticatedFetch(url, options = {}) {
    let token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html';
      return null;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    let response = await fetch(url, { ...options, headers });

    // 401이면 토큰 갱신 시도
    if (response.status === 401) {
      // 동시 갱신 방지
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken();
      }

      const newToken = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;

      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...options, headers });
      } else {
        // 갱신 실패 - 로그인 페이지로
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login.html';
        return null;
      }
    }

    return response;
  }

  /**
   * 인증된 API 호출 + JSON 파싱
   */
  async function apiCall(url, options = {}) {
    const response = await authenticatedFetch(url, options);
    if (!response) return null;
    return response.json();
  }

  /**
   * 로그아웃
   */
  function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/';
    }
  }

  /**
   * 인증 체크 (비로그인 시 로그인 페이지로)
   */
  function requireAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  }

  // 전역 노출
  window.AuthUtils = {
    authenticatedFetch,
    apiCall,
    logout,
    requireAuth,
    refreshAccessToken
  };
})();
