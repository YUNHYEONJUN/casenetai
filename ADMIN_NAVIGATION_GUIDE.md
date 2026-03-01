# 🎯 시스템 관리자 메인 서비스 접근 가이드

**날짜**: 2026-03-01  
**커밋**: `a819148`  
**기능**: 시스템 관리자 양방향 네비게이션

---

## ✨ 새로운 기능

시스템 관리자가 **관리자 대시보드**와 **메인 서비스(상담일지 작성)** 사이를 자유롭게 이동할 수 있는 버튼이 추가되었습니다.

---

## 📍 추가된 버튼

### 1. 시스템 관리자 대시보드 → 메인 서비스

**위치**: 시스템 관리자 대시보드 (`/system-admin-dashboard.html`)  
**버튼**: `📋 메인 서비스`  
**위치**: 헤더 우측 (로그아웃 버튼 왼쪽)  
**동작**: 클릭 시 `/dashboard.html`로 이동

```
┌────────────────────────────────────────────────────────┐
│  최고 관리자 대시보드        [📋 메인 서비스] [로그아웃] │
└────────────────────────────────────────────────────────┘
```

---

### 2. 메인 서비스 → 시스템 관리자 대시보드

**위치**: 메인 대시보드 (`/dashboard.html`)  
**버튼**: `🔧 관리자 대시보드`  
**표시 조건**: `role === 'system_admin'` (시스템 관리자만)  
**동작**: 클릭 시 `/system-admin-dashboard.html`로 이동

```
┌────────────────────────────────────────────────────────────┐
│  안녕하세요, 관리자님!  [홈으로] [🔧 관리자 대시보드] [로그아웃] │
└────────────────────────────────────────────────────────────┘
```

**일반 사용자 화면** (버튼 미표시):
```
┌────────────────────────────────────────────┐
│  안녕하세요, 사용자님!  [홈으로] [로그아웃] │
└────────────────────────────────────────────┘
```

---

## 🔄 사용 흐름

### 시나리오 1: 관리 업무 중 상담일지 작성

1. 시스템 관리자로 로그인
2. 자동으로 **시스템 관리자 대시보드** 진입
3. 사용자 관리, 기관 관리 등 수행
4. 상담일지를 작성하고 싶을 때 → **📋 메인 서비스** 버튼 클릭
5. 상담일지 작성 페이지에서 작업
6. 다시 관리 업무로 돌아가려면 → **🔧 관리자 대시보드** 버튼 클릭

### 시나리오 2: 로그인 후 바로 메인 서비스

1. 시스템 관리자로 로그인
2. 시스템 관리자 대시보드 진입
3. 즉시 **📋 메인 서비스** 버튼 클릭
4. 메인 서비스에서 작업

---

## 💻 기술 구현

### system-admin-dashboard.html

**CSS 추가**:
```css
.header-btn {
  background: rgba(255,255,255,0.2);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.main-service-btn {
  background: rgba(255,255,255,0.9);
  color: #667eea;
  font-weight: 600;
}

.main-service-btn:hover {
  background: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
```

**HTML 수정**:
```html
<div class="header-right">
  <div class="user-info">
    <div class="name" id="userName">관리자</div>
    <div class="role">SYSTEM ADMIN</div>
  </div>
  <button class="header-btn main-service-btn" onclick="goToMainService()">📋 메인 서비스</button>
  <button class="header-btn" onclick="logout()">로그아웃</button>
</div>
```

**JavaScript 추가**:
```javascript
function goToMainService() {
  window.location.href = '/dashboard.html';
}
```

---

### dashboard.html

**HTML 수정**:
```html
<div class="header-actions">
  <a href="/" class="btn btn-secondary">홈으로</a>
  <button class="btn btn-primary" id="adminDashboardBtn" 
          onclick="goToAdminDashboard()" 
          style="display: none;">🔧 관리자 대시보드</button>
  <button class="btn btn-secondary" onclick="logout()">로그아웃</button>
</div>
```

**JavaScript 추가**:
```javascript
// 관리자 대시보드로 이동
function goToAdminDashboard() {
  window.location.href = '/system-admin-dashboard.html';
}

// 사용자 정보 로드 시 역할 확인
async function loadUserInfo() {
  try {
    const data = await apiCall('/api/auth/me');
    
    if (data.success) {
      document.getElementById('userName').textContent = data.user.name;
      document.getElementById('userEmail').textContent = data.user.email;
      
      // 시스템 관리자인 경우 관리자 대시보드 버튼 표시
      if (data.user.role === 'system_admin') {
        document.getElementById('adminDashboardBtn').style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('사용자 정보 로드 실패:', error);
  }
}
```

---

## 🎨 버튼 디자인

### 메인 서비스 버튼
- **배경**: 흰색 (관리자 대시보드의 보라색 배경에서 돋보임)
- **텍스트**: 보라색 (`#667eea`)
- **아이콘**: 📋 (클립보드)
- **효과**: 호버 시 약간 위로 이동 + 그림자

### 관리자 대시보드 버튼
- **배경**: 파란색 (`.btn-primary`)
- **텍스트**: 흰색
- **아이콘**: 🔧 (렌치/설정)
- **조건부 표시**: 시스템 관리자만

---

## ✅ 테스트 체크리스트

### 시스템 관리자로 테스트

- [ ] 로그인 → 시스템 관리자 대시보드 진입
- [ ] 헤더에 "📋 메인 서비스" 버튼 보임
- [ ] "📋 메인 서비스" 클릭 → `/dashboard.html` 이동
- [ ] 메인 대시보드에 "🔧 관리자 대시보드" 버튼 보임
- [ ] "🔧 관리자 대시보드" 클릭 → `/system-admin-dashboard.html` 이동
- [ ] 양방향 이동 정상 작동

### 일반 사용자로 테스트

- [ ] 일반 사용자로 로그인
- [ ] `/dashboard.html`에서 "🔧 관리자 대시보드" 버튼 **안 보임**
- [ ] 시스템 관리자 전용 기능 접근 불가

---

## 🔒 보안 고려사항

1. **프론트엔드 조건부 표시**: `role === 'system_admin'` 체크
2. **백엔드 권한 검증**: 서버사이드에서도 권한 확인 (이미 구현됨)
3. **URL 직접 접근**: `/system-admin-dashboard.html` 직접 접근 시 서버에서 권한 체크

---

## 📊 영향받는 파일

| 파일 | 변경 사항 | 라인 수 |
|------|----------|--------|
| `public/system-admin-dashboard.html` | 버튼 추가, CSS, 함수 | +28 |
| `public/dashboard.html` | 조건부 버튼, 함수 | +10 |
| `FIX_ADMIN_ACCOUNT.sql` | 테이블 구조 수정 | +60 |

**총 변경**: 3개 파일, +98줄, -3줄

---

## 🚀 배포 후 확인

1. **Vercel 자동 배포** 완료 대기
2. **프로덕션 URL 접속**: https://casenetai.kr
3. **시스템 관리자 로그인**:
   - 이메일: `admin@casenetai.kr`
   - 비밀번호: `Admin2026!@#$`
4. **버튼 작동 확인**

---

## 📝 사용 시나리오 예시

### 케이스 1: 급하게 상담일지 작성
```
1. 관리자 업무 중
2. 📋 메인 서비스 클릭
3. 빠르게 상담일지 작성
4. 🔧 관리자 대시보드 클릭
5. 관리 업무 재개
```

### 케이스 2: 사용자 지원
```
1. 사용자가 "상담일지 작성이 안 돼요" 문의
2. 📋 메인 서비스로 이동
3. 직접 테스트 및 확인
4. 문제 파악 후 🔧 관리자 대시보드로 복귀
5. 시스템 설정 수정
```

---

## 🎯 향후 개선 사항

1. **빠른 메뉴**: 드롭다운으로 모든 페이지 접근
2. **최근 방문**: 최근 방문한 페이지 기록
3. **바로가기**: 자주 사용하는 기능 북마크
4. **알림**: 시스템 알림 실시간 표시

---

**작성**: AI Developer  
**날짜**: 2026-03-01  
**버전**: 1.0  
**커밋**: https://github.com/YUNHYEONJUN/casenetai/commit/a819148
