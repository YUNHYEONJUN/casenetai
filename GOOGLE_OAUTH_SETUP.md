# Google OAuth 설정 가이드

## 🎯 목표
Google 계정으로 CaseNetAI 로그인 활성화

---

## 📋 Google Cloud Console 설정

### 1단계: Google Cloud Console 접속

```
https://console.cloud.google.com
```

1. yoonhj79@gmail.com 계정으로 로그인
2. 프로젝트 선택 또는 새 프로젝트 생성

---

### 2단계: 프로젝트 생성 (필요한 경우)

```
1. 상단 프로젝트 선택 드롭다운 클릭
2. "새 프로젝트" 클릭
3. 프로젝트 이름: "CaseNetAI" (또는 원하는 이름)
4. "만들기" 클릭
```

---

### 3단계: OAuth 동의 화면 구성

```
1. 왼쪽 메뉴 → "API 및 서비스" → "OAuth 동의 화면"
2. User Type 선택: "외부" 선택
3. "만들기" 클릭
```

**앱 정보 입력:**
```
앱 이름: CaseNetAI
사용자 지원 이메일: yoonhj79@gmail.com
앱 로고: (선택사항)

앱 도메인:
- 애플리케이션 홈페이지: https://casenetai.kr
- 개인정보처리방침: https://casenetai.kr/privacy (선택사항)
- 서비스 약관: https://casenetai.kr/terms (선택사항)

개발자 연락처 정보:
- 이메일 주소: yoonhj79@gmail.com
```

4. "저장 후 계속" 클릭

**범위 설정:**
```
1. "범위 추가 또는 삭제" 클릭
2. 다음 범위 선택:
   ✅ .../auth/userinfo.email
   ✅ .../auth/userinfo.profile
   ✅ openid
3. "업데이트" 클릭
4. "저장 후 계속" 클릭
```

**테스트 사용자:**
```
1. "테스트 사용자 추가" 클릭
2. yoonhj79@gmail.com 추가
3. "저장 후 계속" 클릭
```

---

### 4단계: OAuth 2.0 클라이언트 ID 만들기

```
1. 왼쪽 메뉴 → "API 및 서비스" → "사용자 인증 정보"
2. 상단 "+ 사용자 인증 정보 만들기" 클릭
3. "OAuth 클라이언트 ID" 선택
```

**애플리케이션 유형:**
```
애플리케이션 유형: 웹 애플리케이션
이름: CaseNetAI Web App
```

**승인된 자바스크립트 원본:**
```
https://casenetai.kr
http://localhost:3000
```

**승인된 리디렉션 URI:**
```
https://casenetai.kr/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

4. "만들기" 클릭

---

### 5단계: 클라이언트 ID 및 보안 비밀 복사

생성 완료 후 팝업이 나타납니다:

```
클라이언트 ID: [복사하세요]
예: 123456789-abcdefghijk.apps.googleusercontent.com

클라이언트 보안 비밀: [복사하세요]
예: GOCSPX-aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

⚠️ **중요**: 이 값들을 안전하게 보관하세요!

---

## 🔧 Vercel 환경변수 설정

### 1. Vercel Dashboard 접속

```
https://vercel.com/dashboard
→ casenetai 프로젝트 선택
→ Settings → Environment Variables
```

### 2. 환경변수 추가

다음 3개의 환경변수를 추가하세요:

**GOOGLE_CLIENT_ID**
```
Key: GOOGLE_CLIENT_ID
Value: [위에서 복사한 클라이언트 ID]
Environments: ✅ Production ✅ Preview ✅ Development
```

**GOOGLE_CLIENT_SECRET**
```
Key: GOOGLE_CLIENT_SECRET
Value: [위에서 복사한 클라이언트 보안 비밀]
Environments: ✅ Production ✅ Preview ✅ Development
```

**GOOGLE_CALLBACK_URL**
```
Key: GOOGLE_CALLBACK_URL
Value: https://casenetai.kr/api/auth/google/callback
Environments: ✅ Production ✅ Preview
```

```
Key: GOOGLE_CALLBACK_URL
Value: http://localhost:3000/api/auth/google/callback
Environments: ✅ Development
```

3. "Save" 클릭

---

## 🚀 배포 및 테스트

### 1. Vercel 재배포

환경변수를 추가한 후 재배포가 필요합니다:

```
Vercel Dashboard
→ casenetai 프로젝트
→ Deployments 탭
→ 최신 배포 우측 "..." 메뉴
→ "Redeploy" 클릭
```

또는 GitHub에 새 커밋 푸시:
```bash
git commit --allow-empty -m "trigger: Google OAuth 환경변수 추가"
git push origin genspark_ai_developer
```

### 2. 테스트

배포 완료 후 (약 2-3분):

```
1. https://casenetai.kr 접속
2. "구글로 시작하기" 버튼 클릭
3. Google 계정 선택
4. 권한 허용
5. 로그인 완료 확인
```

---

## ✅ 완료 체크리스트

- [ ] Google Cloud Console 프로젝트 생성
- [ ] OAuth 동의 화면 구성
- [ ] OAuth 2.0 클라이언트 ID 생성
- [ ] 승인된 리디렉션 URI 추가
- [ ] 클라이언트 ID 복사
- [ ] 클라이언트 보안 비밀 복사
- [ ] Vercel에 GOOGLE_CLIENT_ID 추가
- [ ] Vercel에 GOOGLE_CLIENT_SECRET 추가
- [ ] Vercel에 GOOGLE_CALLBACK_URL 추가
- [ ] Vercel 재배포
- [ ] Google 로그인 테스트

---

## 🔒 보안 참고사항

1. **클라이언트 보안 비밀** 절대 공개하지 마세요
2. **승인된 URI만** 정확하게 추가하세요
3. **프로덕션 환경**에서는 테스트 사용자 제한 해제 필요

---

## 🆘 문제 해결

### 오류: "401 invalid_client"
→ 클라이언트 ID 또는 보안 비밀이 잘못되었습니다
→ Vercel 환경변수 확인

### 오류: "redirect_uri_mismatch"
→ Google Cloud Console에서 리디렉션 URI 확인
→ 정확히 `https://casenetai.kr/api/auth/google/callback` 이어야 함

### 오류: "access_denied"
→ OAuth 동의 화면 구성 확인
→ 테스트 사용자 추가 확인

---

## 📞 다음 단계

1. Google OAuth 설정 완료
2. https://casenetai.kr에서 Google 로그인 테스트
3. Supabase에서 관리자 권한 부여
4. 시스템 관리자 대시보드 접속

**설정 중 문제가 있으면 알려주세요!** 🚀
