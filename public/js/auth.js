/**
 * 인증 유틸리티
 * - httpOnly 쿠키 기반 인증 (JS에서 토큰 접근 불가)
 * - 자동 토큰 갱신 (401 응답 시 refresh token 사용)
 * - credentials: 'include'로 쿠키 자동 전송
 */

(function() {
  var isRefreshing = false;
  var refreshPromise = null;

  /**
   * refresh token으로 access token 갱신
   * - 모든 토큰은 httpOnly 쿠키로 관리 → credentials: 'include'로 자동 전송
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
        return false;
      }

      var data = await response.json();
      return data.success === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 타임아웃 지원 fetch
   */
  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(function() { clearTimeout(timeoutId); });
  }

  /**
   * 인증된 API 호출 (httpOnly 쿠키 자동 전송 + 자동 갱신)
   */
  async function authenticatedFetch(url, options) {
    options = options || {};
    var timeout = options.timeout || 30000;
    var headers = Object.assign({}, options.headers || {});

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

      var refreshed = await refreshPromise;

      if (refreshed) {
        response = await fetchWithTimeout(url, Object.assign({}, options, {
          headers: headers,
          credentials: 'include'
        }), timeout);
      } else {
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
      // 즉시 로그인 상태 쿠키 제거 (서버 응답 전이라도)
      document.cookie = 'is_logged_in=; path=/; max-age=0';
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      }).finally(function() {
        window.location.href = '/';
      });
    }
  }

  /**
   * 인증 체크 (비로그인 시 로그인 페이지로)
   * - authenticatedFetch로 /api/auth/me 호출 → 401이면 자동 refresh 시도
   */
  function requireAuth() {
    // 인증 확인 전 페이지 내용 숨김 (플래시 방지)
    document.documentElement.style.visibility = 'hidden';

    authenticatedFetch('/api/auth/me')
      .then(function(res) {
        if (!res || !res.ok) {
          document.cookie = 'is_logged_in=; path=/; max-age=0';
          localStorage.setItem('loginRedirect', window.location.pathname);
          window.location.href = '/login.html';
        } else {
          // 인증 성공 시 페이지 표시
          document.documentElement.style.visibility = '';
        }
      })
      .catch(function() {
        document.cookie = 'is_logged_in=; path=/; max-age=0';
        localStorage.setItem('loginRedirect', window.location.pathname);
        window.location.href = '/login.html';
      });
    return true;
  }

  // 전역 노출
  window.AuthUtils = {
    authenticatedFetch: authenticatedFetch,
    apiCall: apiCall,
    logout: logout,
    requireAuth: requireAuth,
    refreshAccessToken: refreshAccessToken
  };
})();
