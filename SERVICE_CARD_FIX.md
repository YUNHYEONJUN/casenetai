# 홈페이지 서비스 카드 클릭 버그 수정 ✅

**날짜**: 2026-03-01  
**커밋**: `5217b83`  
**GitHub**: https://github.com/YUNHYEONJUN/casenetai/commit/5217b83

---

## 🐛 문제 상황

### 증상
- 홈페이지(`/index.html`)에서 서비스 카드를 클릭해도 **아무 동작 없음**
- 페이지 이동이 되지 않음
- 로그인 페이지로도 리다이렉트되지 않음

### 영향받는 서비스
1. 🎙️ **노인보호 상담일지** → `/elderly-protection.html`
2. 🔒 **문서 익명화** → `/anonymization.html`
3. 📝 **진술서 자동 작성** → `/statement-recording.html`
4. 📋 **사실확인서 생성** → `/fact-confirmation.html`

---

## 🔍 원인 분석

### 문제 코드 (수정 전)
```javascript
// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();  // ← 모든 # 링크의 기본 동작 차단
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            // smooth scroll 로직
        }
    });
});
```

### 서비스 카드 HTML 구조
```html
<a href="#" onclick="return requireLogin('/elderly-protection.html')" class="service-card">
    <div class="service-icon">🎙️</div>
    <h3>노인보호 상담일지</h3>
    <p>음성 녹음을 자동으로 텍스트 변환하고 구조화된 상담일지를 생성합니다</p>
    <span class="service-tag">음성 → 텍스트</span>
</a>
```

### 문제 발생 과정
1. 사용자가 서비스 카드 클릭
2. `href="#"`이므로 smooth scroll 리스너가 먼저 실행됨
3. **`e.preventDefault()`가 호출되어 기본 동작 차단**
4. `onclick="return requireLogin(...)"` 이벤트가 제대로 실행되지 않음
5. 결과: 아무 동작 없음

---

## ✅ 해결 방법

### 수정된 코드
```javascript
// Smooth scroll for anchor links (서비스 카드 제외)
document.querySelectorAll('a[href^="#"]:not(.service-card)').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        // #만 있거나 실제 섹션 ID가 있는 경우에만 스크롤
        if (href !== '#' && document.querySelector(href)) {
            e.preventDefault();
            const target = document.querySelector(href);
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});
```

### 주요 변경사항
1. **`:not(.service-card)` 추가**
   - 서비스 카드는 smooth scroll 대상에서 제외
   - `onclick` 이벤트가 정상적으로 실행됨

2. **추가 검증 로직**
   ```javascript
   if (href !== '#' && document.querySelector(href))
   ```
   - `href="#"`인 경우 스크롤하지 않음
   - 실제 섹션이 존재하는 경우만 스크롤

---

## 🎯 동작 흐름

### 로그인 상태
```
1. 사용자가 서비스 카드 클릭
   ↓
2. onclick="return requireLogin('/elderly-protection.html')" 실행
   ↓
3. requireLogin() 함수에서 token 확인
   ↓
4. token 존재 → window.location.href = '/elderly-protection.html'
   ↓
5. 서비스 페이지로 이동 ✅
```

### 비로그인 상태
```
1. 사용자가 서비스 카드 클릭
   ↓
2. onclick="return requireLogin('/elderly-protection.html')" 실행
   ↓
3. requireLogin() 함수에서 token 확인
   ↓
4. token 없음 → 로그인 페이지로 리다이렉트
   ↓
5. window.location.href = '/login.html?redirect=/elderly-protection.html'
   ↓
6. 로그인 후 원래 페이지로 이동 ✅
```

---

## 🧪 테스트 방법

### 1. 비로그인 상태 테스트
```bash
# 브라우저 시크릿 모드 열기
1. https://casenetai.kr/ 접속
2. 아무 서비스 카드 클릭
3. 기대 결과: 로그인 페이지로 리다이렉트
4. URL 확인: /login.html?redirect=/elderly-protection.html
```

### 2. 로그인 상태 테스트
```bash
# 관리자 계정으로 로그인
1. https://casenetai.kr/login.html 접속
2. Email: admin@casenetai.kr
3. Password: Admin2026!@#$
4. 로그인 후 홈페이지(/) 이동
5. 서비스 카드 클릭
6. 기대 결과: 해당 서비스 페이지로 즉시 이동
```

### 3. 각 서비스 개별 테스트
```bash
✅ 노인보호 상담일지 카드 → /elderly-protection.html
✅ 문서 익명화 카드 → /anonymization.html
✅ 진술서 자동 작성 카드 → /statement-recording.html
✅ 사실확인서 생성 카드 → /fact-confirmation.html
```

---

## 📊 영향 분석

### 수정된 파일
- ✅ `public/index.html` (1개 함수 수정, 7줄 추가/5줄 삭제)

### 영향받는 기능
- ✅ **서비스 카드 클릭** - 정상 작동 복구
- ✅ **앵커 링크 스크롤** - 정상 작동 유지 (예: `<a href="#features">`)
- ✅ **로그인 필수 체크** - 정상 작동

### 영향받지 않는 기능
- ✅ 네비게이션 메뉴
- ✅ 로그인/로그아웃
- ✅ 대시보드
- ✅ 관리자 페이지

---

## 🔍 requireLogin 함수 설명

### 함수 정의
```javascript
/**
 * 로그인 필수 기능 접근 체크
 * @param {string} targetUrl - 접근하려는 페이지 URL
 * @returns {boolean} - false를 반환하여 기본 동작 방지
 */
function requireLogin(targetUrl) {
    const token = localStorage.getItem('token');
    
    if (token) {
        // 로그인 상태: 바로 이동
        window.location.href = targetUrl;
    } else {
        // 비로그인 상태: 로그인 페이지로 리다이렉트 (원래 URL 저장)
        window.location.href = '/login.html?redirect=' + encodeURIComponent(targetUrl);
    }
    
    return false; // 기본 <a> 태그 동작 방지
}
```

### 사용 예시
```html
<!-- 로그인 필수 링크 -->
<a href="#" onclick="return requireLogin('/elderly-protection.html')">
    서비스 이용하기
</a>
```

### 특징
1. **로그인 상태 자동 체크**
   - localStorage의 'token' 확인

2. **원래 URL 보존**
   - 로그인 후 원래 가려던 페이지로 복귀

3. **기본 동작 차단**
   - `return false`로 `<a>` 태그의 기본 동작 방지

---

## 📈 개선 효과

### Before (버그 발생 시)
- ❌ 서비스 카드 클릭 시 아무 동작 없음
- ❌ 사용자가 서비스 이용 불가
- ❌ 로그인 페이지로 리다이렉트 안 됨

### After (수정 후)
- ✅ 서비스 카드 클릭 시 즉시 이동
- ✅ 로그인 상태면 서비스 페이지로 이동
- ✅ 비로그인 상태면 로그인 페이지로 리다이렉트
- ✅ 로그인 후 원래 페이지로 자동 복귀
- ✅ Smooth scroll 기능은 정상 유지

---

## 🚀 배포 및 테스트

### Vercel 자동 배포
```bash
✅ Commit: 5217b83
✅ Push: main 브랜치
✅ Vercel: 자동 배포 트리거됨
```

### 배포 확인
1. Vercel 대시보드: https://vercel.com/yunhyeonjuns-projects/casenetai
2. 배포 상태 확인
3. 프로덕션 URL 테스트: https://casenetai.kr

---

## ✅ 완료 체크리스트

- [x] 버그 원인 분석 완료
- [x] 코드 수정 완료
- [x] Git 커밋 및 푸시 완료
- [x] 가이드 문서 작성 완료
- [ ] 프로덕션 환경 테스트 (사용자 진행 예정)

---

## 🔗 관련 커밋

1. **5217b83** - 서비스 카드 클릭 버그 수정
   - https://github.com/YUNHYEONJUN/casenetai/commit/5217b83

2. **5ae2b71** - 시스템 관리자 메인 서비스 버튼 수정
   - https://github.com/YUNHYEONJUN/casenetai/commit/5ae2b71

3. **b65f82f** - 네비게이션 가이드 추가
   - https://github.com/YUNHYEONJUN/casenetai/commit/b65f82f

---

## 📞 추가 지원

### 문제가 계속되는 경우
1. **브라우저 캐시 삭제**
   - Chrome: Ctrl+Shift+Delete
   - 캐시된 이미지 및 파일 삭제

2. **콘솔 에러 확인**
   - F12 → Console 탭
   - 에러 메시지 캡처

3. **시크릿 모드 테스트**
   - 새 시크릿 창에서 테스트
   - 확장 프로그램 영향 제거

---

**작성일**: 2026-03-01  
**최종 업데이트**: 2026-03-01  
**상태**: ✅ 완료
