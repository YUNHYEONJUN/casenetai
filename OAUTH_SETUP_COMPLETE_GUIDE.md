# 🔐 CaseNetAI 소셜 로그인 완전 설정 가이드

## 📋 목차

1. [카카오톡 로그인 설정](#1-카카오톡-로그인-설정)
2. [네이버 로그인 설정](#2-네이버-로그인-설정)
3. [구글 로그인 설정](#3-구글-로그인-설정)
4. [Vercel 환경변수 설정](#4-vercel-환경변수-설정)
5. [테스트 방법](#5-테스트-방법)

---

## 1. 카카오톡 로그인 설정

### 1-1. 카카오 개발자 콘솔 접속

```
🔗 https://developers.kakao.com
```

카카오 계정으로 로그인

---

### 1-2. 앱 생성 또는 선택

**새 앱 만들기:**
1. "내 애플리케이션" 클릭
2. "애플리케이션 추가하기" 클릭
3. 앱 이름: `CaseNetAI`
4. 회사명: (선택사항)
5. 저장

**기존 앱이 있다면:** 해당 앱 선택

---

### 1-3. 앱 설정

#### 앱 키 확인

```
좌측 메뉴 "앱 설정" → "요약 정보"

✅ REST API 키 복사 (예: a1b2c3d4e5f6...)
```

**이 값을 나중에 사용합니다: `KAKAO_CLIENT_ID`**

---

#### 플랫폼 설정

```
좌측 메뉴 "앱 설정" → "플랫폼"

1. "Web 플랫폼 등록" 클릭
2. 사이트 도메인 입력:
   - https://casenetai.kr
3. 저장
```

---

#### Redirect URI 설정

```
좌측 메뉴 "제품 설정" → "카카오 로그인"

1. "카카오 로그인 활성화" ON
2. "Redirect URI" 섹션
3. "Redirect URI 등록" 클릭
4. 다음 URI 추가:
   
   ✅ https://casenetai.kr/api/auth/kakao/callback
   ✅ http://localhost:3000/api/auth/kakao/callback (개발용)

5. 저장
```

---

#### 동의항목 설정

```
좌측 메뉴 "제품 설정" → "카카오 로그인" → "동의항목"

필수 동의항목:
✅ 닉네임 (필수 동의)
✅ 프로필 사진 (선택 동의)
✅ 카카오계정(이메일) (선택 동의)

저장
```

---

#### Client Secret 생성 (선택사항이지만 권장)

```
좌측 메뉴 "제품 설정" → "카카오 로그인" → "보안"

1. "Client Secret" 섹션
2. "코드 생성" 클릭
3. 생성된 코드 복사 (예: abc123def456...)
4. "상태" ON으로 변경
5. 저장
```

**이 값을 나중에 사용합니다: `KAKAO_CLIENT_SECRET`**

---

## 2. 네이버 로그인 설정

### 2-1. 네이버 개발자센터 접속

```
🔗 https://developers.naver.com/apps
```

네이버 계정으로 로그인

---

### 2-2. 애플리케이션 등록

```
1. "Application" → "애플리케이션 등록" 클릭
2. 애플리케이션 정보 입력:

   애플리케이션 이름: CaseNetAI
   
   사용 API: 
   ✅ 네이버 로그인
   
   제공 정보 선택:
   ✅ 회원이름
   ✅ 이메일 주소
   ✅ 프로필 사진
   
   환경 추가:
   - 서비스 URL: https://casenetai.kr
   
   Callback URL:
   ✅ https://casenetai.kr/api/auth/naver/callback
   ✅ http://localhost:3000/api/auth/naver/callback

3. 등록하기 클릭
```

---

### 2-3. Client ID 및 Secret 확인

```
애플리케이션 상세화면에서:

✅ Client ID 복사 (예: ABC123DEF456)
✅ Client Secret 복사 (예: xyz789abc)
```

**이 값들을 나중에 사용합니다:**
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

---

## 3. 구글 로그인 설정

### 3-1. Google Cloud Console 접속

```
🔗 https://console.cloud.google.com
```

Google 계정으로 로그인 (yoonhj79@gmail.com)

---

### 3-2. 프로젝트 생성 또는 선택

**새 프로젝트:**
```
1. 상단 프로젝트 선택 드롭다운 클릭
2. "새 프로젝트" 클릭
3. 프로젝트 이름: CaseNetAI
4. "만들기" 클릭
```

**기존 프로젝트:** "elder abuse" 프로젝트 선택

---

### 3-3. OAuth 동의 화면 구성

```
1. 좌측 메뉴 (≡) → "API 및 서비스" → "OAuth 동의 화면"
2. User Type: "외부" 선택
3. "만들기" 클릭

앱 정보:
- 앱 이름: CaseNetAI
- 사용자 지원 이메일: yoonhj79@gmail.com
- 앱 로고: (선택사항)
- 애플리케이션 홈페이지: https://casenetai.kr
- 개발자 연락처 이메일: yoonhj79@gmail.com

4. "저장 후 계속" 클릭
```

---

### 3-4. 범위(Scope) 설정

```
1. "범위 추가 또는 삭제" 클릭
2. 다음 범위 선택:
   ✅ .../auth/userinfo.email
   ✅ .../auth/userinfo.profile
   ✅ openid
3. "업데이트" 클릭
4. "저장 후 계속" 클릭
```

---

### 3-5. 테스트 사용자 추가

```
1. "테스트 사용자 추가" 클릭
2. yoonhj79@gmail.com 추가
3. "저장 후 계속" 클릭
```

---

### 3-6. OAuth 2.0 클라이언트 ID 만들기

```
1. 좌측 메뉴 → "API 및 서비스" → "사용자 인증 정보"
2. 상단 "+ 사용자 인증 정보 만들기" 클릭
3. "OAuth 클라이언트 ID" 선택

애플리케이션 유형: 웹 애플리케이션
이름: CaseNetAI Web

승인된 자바스크립트 원본:
✅ https://casenetai.kr
✅ http://localhost:3000

승인된 리디렉션 URI:
✅ https://casenetai.kr/api/auth/google/callback
✅ http://localhost:3000/api/auth/google/callback

4. "만들기" 클릭
```

---

### 3-7. 클라이언트 ID 및 보안 비밀 복사

```
팝업 창에 표시됨:

✅ 클라이언트 ID 복사
   (예: 123456789-abcdefg.apps.googleusercontent.com)

✅ 클라이언트 보안 비밀 복사
   (예: GOCSPX-aBcDeFgHiJkL...)
```

**이 값들을 나중에 사용합니다:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

---

## 4. Vercel 환경변수 설정

### 4-1. Vercel Dashboard 접속

```
🔗 https://vercel.com/dashboard
→ casenetai 프로젝트 선택
→ Settings
→ Environment Variables
```

---

### 4-2. 환경변수 추가

**총 9개의 환경변수를 추가해야 합니다:**

---

#### 카카오 환경변수 (3개)

**1. KAKAO_CLIENT_ID**
```
Key: KAKAO_CLIENT_ID
Value: [카카오 REST API 키]
Environments: ✅ Production ✅ Preview ✅ Development
```

**2. KAKAO_CLIENT_SECRET**
```
Key: KAKAO_CLIENT_SECRET
Value: [카카오 Client Secret]
Environments: ✅ Production ✅ Preview ✅ Development
```

**3. KAKAO_CALLBACK_URL**
```
Key: KAKAO_CALLBACK_URL
Value: https://casenetai.kr/api/auth/kakao/callback
Environments: ✅ Production ✅ Preview

(Development용 별도 추가)
Value: http://localhost:3000/api/auth/kakao/callback
Environments: ✅ Development
```

---

#### 네이버 환경변수 (3개)

**4. NAVER_CLIENT_ID**
```
Key: NAVER_CLIENT_ID
Value: [네이버 Client ID]
Environments: ✅ Production ✅ Preview ✅ Development
```

**5. NAVER_CLIENT_SECRET**
```
Key: NAVER_CLIENT_SECRET
Value: [네이버 Client Secret]
Environments: ✅ Production ✅ Preview ✅ Development
```

**6. NAVER_CALLBACK_URL**
```
Key: NAVER_CALLBACK_URL
Value: https://casenetai.kr/api/auth/naver/callback
Environments: ✅ Production ✅ Preview

(Development용 별도 추가)
Value: http://localhost:3000/api/auth/naver/callback
Environments: ✅ Development
```

---

#### 구글 환경변수 (3개)

**7. GOOGLE_CLIENT_ID**
```
Key: GOOGLE_CLIENT_ID
Value: [구글 클라이언트 ID]
Environments: ✅ Production ✅ Preview ✅ Development
```

**8. GOOGLE_CLIENT_SECRET**
```
Key: GOOGLE_CLIENT_SECRET
Value: [구글 클라이언트 보안 비밀]
Environments: ✅ Production ✅ Preview ✅ Development
```

**9. GOOGLE_CALLBACK_URL**
```
Key: GOOGLE_CALLBACK_URL
Value: https://casenetai.kr/api/auth/google/callback
Environments: ✅ Production ✅ Preview

(Development용 별도 추가)
Value: http://localhost:3000/api/auth/google/callback
Environments: ✅ Development
```

---

### 4-3. Vercel 재배포

환경변수 추가 후 반드시 재배포:

```
Vercel Dashboard
→ Deployments 탭
→ 최신 배포 우측 "..." 메뉴
→ "Redeploy" 클릭
```

또는 GitHub에 푸시:
```bash
git commit --allow-empty -m "trigger: OAuth 환경변수 추가"
git push origin genspark_ai_developer
```

배포 완료까지 약 2-3분 소요

---

## 5. 테스트 방법

### 5-1. 배포 완료 확인

```
Vercel Dashboard → Deployments → "Ready" 상태 확인
```

---

### 5-2. 로그인 테스트

```
🔗 https://casenetai.kr

1. 카카오톡으로 시작하기 클릭 → 로그인 성공 확인
2. 네이버로 시작하기 클릭 → 로그인 성공 확인
3. 구글로 시작하기 클릭 → 로그인 성공 확인
```

---

### 5-3. 관리자 권한 부여

로그인 성공 후:

```
1. https://supabase.com/dashboard
2. yoonhj79@gmail.com 로그인
3. casenetai 프로젝트
4. Table Editor → users 테이블
5. 본인 계정 찾기
6. role: 'system_admin', is_approved: true
7. Save
```

---

### 5-4. 관리자 대시보드 접속

```
🔗 https://casenetai.kr/system-admin.html
```

---

## ✅ 최종 체크리스트

### 카카오톡 설정
- [ ] 카카오 개발자 콘솔 앱 생성
- [ ] REST API 키 복사
- [ ] Redirect URI 등록
- [ ] Client Secret 생성 (선택)
- [ ] Vercel에 KAKAO_CLIENT_ID 추가
- [ ] Vercel에 KAKAO_CLIENT_SECRET 추가
- [ ] Vercel에 KAKAO_CALLBACK_URL 추가

### 네이버 설정
- [ ] 네이버 개발자센터 애플리케이션 등록
- [ ] Client ID 복사
- [ ] Client Secret 복사
- [ ] Callback URL 등록
- [ ] Vercel에 NAVER_CLIENT_ID 추가
- [ ] Vercel에 NAVER_CLIENT_SECRET 추가
- [ ] Vercel에 NAVER_CALLBACK_URL 추가

### 구글 설정
- [ ] Google Cloud Console 프로젝트 생성
- [ ] OAuth 동의 화면 구성
- [ ] OAuth 2.0 클라이언트 ID 생성
- [ ] 클라이언트 ID 복사
- [ ] 클라이언트 보안 비밀 복사
- [ ] Vercel에 GOOGLE_CLIENT_ID 추가
- [ ] Vercel에 GOOGLE_CLIENT_SECRET 추가
- [ ] Vercel에 GOOGLE_CALLBACK_URL 추가

### 최종 테스트
- [ ] Vercel 재배포
- [ ] 카카오톡 로그인 테스트
- [ ] 네이버 로그인 테스트
- [ ] 구글 로그인 테스트
- [ ] 관리자 권한 부여
- [ ] 시스템 관리자 대시보드 접속

---

## 🆘 문제 해결

### 카카오: KOE101 에러
→ Redirect URI 확인
→ 카카오 로그인 활성화 확인

### 네이버: 페이지를 찾을 수 없음
→ Callback URL 확인
→ 네이버 애플리케이션 등록 상태 확인

### 구글: 401 invalid_client
→ 클라이언트 ID/Secret 확인
→ Redirect URI 확인

### 모든 로그인: Vercel 환경변수 확인
→ Settings → Environment Variables
→ 값이 정확한지 확인
→ Production, Preview, Development 모두 체크 확인

---

## 📞 완료!

모든 설정이 끝나면:
- ✅ 카카오톡 로그인 작동
- ✅ 네이버 로그인 작동
- ✅ 구글 로그인 작동

**설정하시다가 막히는 부분이 있으면 언제든지 알려주세요!** 🚀
