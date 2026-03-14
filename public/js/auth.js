/**
 * 인증 유틸리티
 * - 자동 토큰 갱신 (401 응답 시 refresh token 사용)
 * - httpOnly 쿠키 기반 리프레시 (JS에서 refresh token 접근 불가)
 * - 인증 체크 및 로그아웃
 */

(function() {
  let isRefreshing = false;
  let refreshPromise = null;

  /**
   * 쿠키에서 값 읽기
   */
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  /**
   * access token 가져오기 (localStorage > cookie 우선순위)
   */
  function getAccessToken() {
    return localStorage.getItem('token') || getCookie('access_token');
  }

  /**
   * refresh token으로 access token 갱신
   * - refresh_token은 httpOnly 쿠키이므로 credentials: 'include'로 자동 전송
   */
  async function refreshAccessToken() {
    try {
      var response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });

      if (!response.ok) {
        return null;
      }

      var data = await response.json();
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        return data.token;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 타임아웃 지원 fetch
   */
  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 30000; // 기본 30초
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(function() { clearTimeout(timeoutId); });
  }

  /**
   * 인증된 API 호출 (자동 토큰 갱신 + 타임아웃 포함)
   */
  async function authenticatedFetch(url, options) {
    options = options || {};
    var token = getAccessToken();
    if (!token) {
      window.location.href = '/login.html';
      return null;
    }

    var timeout = options.timeout || 30000;
    var headers = Object.assign({}, options.headers || {}, {
      'Authorization': 'Bearer ' + token
    });

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    var response = await fetchWithTimeout(url, Object.assign({}, options, {
      headers: headers,
      credentials: 'include'
    }), timeout);

    if (response.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(function() {
          isRefreshing = false;
        });
      }

      var newToken = await refreshPromise;

      if (newToken) {
        headers['Authorization'] = 'Bearer ' + newToken;
        response = await fetchWithTimeout(url, Object.assign({}, options, {
          headers: headers,
          credentials: 'include'
        }), timeout);
      } else {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        return null;
      }
    }

    return response;
  }

  /**
   * 인증된 API 호출 + JSON 파싱
   */
  async function apiCall(url, options) {
    var response = await authenticatedFetch(url, options);
    if (!response) return null;
    return response.json();
  }

  /**
   * 로그아웃
   */
  function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + getAccessToken(),
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }).finally(function() {
        localStorage.removeItem('token');
        window.location.href = '/';
      });
    }
  }

  /**
   * 인증 체크 (비로그인 시 로그인 페이지로)
   */
  function requireAuth() {
    var token = getAccessToken();
    if (!token) {
      localStorage.setItem('loginRedirect', window.location.pathname);
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  // 전역 노출
  window.AuthUtils = {
    authenticatedFetch: authenticatedFetch,
    apiCall: apiCall,
    logout: logout,
    requireAuth: requireAuth,
    refreshAccessToken: refreshAccessToken,
    getAccessToken: getAccessToken
  };
})();
