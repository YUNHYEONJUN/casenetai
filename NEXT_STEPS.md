# 🎯 다음 단계 가이드

## ✅ 완료된 작업

1. ✅ **이메일/비밀번호 로그인 폼 제거**
   - 소셜 로그인만 사용 (카카오톡/네이버/구글)
   - 사용자 혼란 방지

2. ✅ **Google OAuth 코드 구현 완료**
   - config/passport.js에 GoogleStrategy 구현됨
   - routes/auth.js에 Google 로그인 라우트 구현됨
   - 환경변수만 설정하면 즉시 작동

3. ✅ **상세 가이드 문서 작성**
   - GOOGLE_OAUTH_SETUP.md: Google OAuth 설정 가이드
   - ADMIN_SETUP_GUIDE.md: 관리자 권한 설정 가이드
   - USER_APPROVAL_FLOW.md: 사용자 승인 프로세스
   - QUICK_START.md: 빠른 시작 가이드

4. ✅ **코드 배포 완료**
   - GitHub에 푸시 완료
   - Vercel 자동 배포 시작 (2-3분 소요)

---

## 🚀 지금 해야 할 일 (순서대로)

### 1️⃣ Vercel 배포 완료 대기 (2-3분)

```
https://vercel.com/dashboard
→ casenetai 프로젝트
→ Deployments 탭
→ 최신 배포 "Ready" 확인
```

---

### 2️⃣ Google OAuth 설정 (30분)

**중요**: 구글 로그인을 사용하려면 이 단계가 필수입니다!

#### A. Google Cloud Console 설정

📖 **상세 가이드**: `GOOGLE_OAUTH_SETUP.md` 파일 참조

**간단 요약:**
```
1. https://console.cloud.google.com 접속
2. 프로젝트 생성: "CaseNetAI"
3. OAuth 동의 화면 구성
   - User Type: 외부
   - 앱 이름: CaseNetAI
   - 범위: email, profile, openid
4. OAuth 2.0 클라이언트 ID 만들기
   - 유형: 웹 애플리케이션
   - 리디렉션 URI: https://casenetai.kr/api/auth/google/callback
5. 클라이언트 ID와 보안 비밀 복사
```

#### B. Vercel 환경변수 추가

```
https://vercel.com/dashboard
→ casenetai 프로젝트
→ Settings
→ Environment Variables
→ Add New
```

**추가할 환경변수 3개:**

1. **GOOGLE_CLIENT_ID**
   ```
   Key: GOOGLE_CLIENT_ID
   Value: [Google에서 복사한 클라이언트 ID]
   Environments: Production, Preview, Development 모두 체크
   ```

2. **GOOGLE_CLIENT_SECRET**
   ```
   Key: GOOGLE_CLIENT_SECRET
   Value: [Google에서 복사한 클라이언트 보안 비밀]
   Environments: Production, Preview, Development 모두 체크
   ```

3. **GOOGLE_CALLBACK_URL**
   ```
   Key: GOOGLE_CALLBACK_URL
   Value: https://casenetai.kr/api/auth/google/callback
   Environments: Production, Preview만 체크
   
   (Development용 별도 추가)
   Value: http://localhost:3000/api/auth/google/callback
   Environments: Development만 체크
   ```

#### C. Vercel 재배포

환경변수 추가 후:
```
Deployments 탭 → 최신 배포 → "..." 메뉴 → "Redeploy"
```

또는 빈 커밋 푸시:
```bash
git commit --allow-empty -m "trigger: Google OAuth 환경변수 추가"
git push origin genspark_ai_developer
```

---

### 3️⃣ 로그인 테스트 (5분)

#### Google OAuth 설정 전 (지금 바로 가능)

```
✅ 카카오톡 로그인 - 정상 작동
✅ 네이버 로그인 - 정상 작동
❌ 구글 로그인 - 환경변수 설정 후 작동
```

**테스트 방법:**
```
1. https://casenetai.kr 접속
2. "카카오톡으로 시작하기" 또는 "네이버로 시작하기" 클릭
3. 로그인 완료
4. (이메일/비밀번호 입력 폼이 사라졌는지 확인)
```

#### Google OAuth 설정 후

```
1. https://casenetai.kr 접속
2. "구글로 시작하기" 클릭
3. Google 계정 선택
4. 권한 허용
5. 로그인 완료 확인
```

---

### 4️⃣ 관리자 권한 설정 (5분) ⭐ 매우 중요!

#### A. Supabase 로그인

```
1. https://supabase.com/dashboard
2. yoonhj79@gmail.com으로 로그인
3. 'casenetai' 프로젝트 클릭
```

#### B. 관리자 권한 부여

```
4. 왼쪽 메뉴 'Table Editor' 클릭
5. 'users' 테이블 선택
6. 방금 로그인한 계정 찾기
   - oauth_email 컬럼에서 검색
   - 또는 oauth_provider로 필터링 (kakao/naver/google)
7. 해당 행 클릭하여 편집:
   ┌─────────────────────────────────────┐
   │ role: 'user' → 'system_admin'      │
   │ is_approved: false → true          │
   └─────────────────────────────────────┘
8. 'Save' 버튼 클릭
```

**SQL로 바로 실행 (대안):**
```sql
-- 카카오톡으로 로그인한 경우
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'kakao' 
  AND oauth_email = 'your-kakao-email';

-- 네이버로 로그인한 경우
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'naver' 
  AND oauth_email = 'your-naver-email';

-- 구글로 로그인한 경우
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'google' 
  AND oauth_email = 'yoonhj79@gmail.com';
```

SQL 실행 위치:
```
Supabase Dashboard → SQL Editor → 위 SQL 입력 → Run
```

---

### 5️⃣ 시스템 관리자 대시보드 접속 (1분)

```
https://casenetai.kr/system-admin.html
```

✅ 대시보드가 보이면 성공!

이제 다음 기능 사용 가능:
- ✅ 모든 기관 관리
- ✅ 사용자를 기관 관리자로 승격
- ✅ 전체 통계 조회
- ✅ 감사 로그 확인

---

## 📊 현재 상태 요약

### ✅ 작동 중
- 카카오톡 로그인
- 네이버 로그인
- 이메일/비밀번호 폼 제거 (소셜 로그인만 표시)
- 3단계 권한 시스템 (System Admin → Org Admin → User)
- 시스템 관리자 대시보드
- 기관 관리자 대시보드
- Vercel 자동 배포

### ⏳ 설정 필요
- Google 로그인 (환경변수 설정 후 작동)

### 🎯 다음 작업
1. Vercel 배포 완료 확인 (2-3분)
2. 카카오톡/네이버로 로그인 테스트
3. Google OAuth 설정 (30분)
4. Supabase에서 관리자 권한 부여
5. 시스템 관리자 대시보드 접속

---

## 🔗 중요 링크

### 서비스
- **Homepage**: https://casenetai.kr
- **System Admin**: https://casenetai.kr/system-admin.html
- **Org Admin**: https://casenetai.kr/org-admin.html

### 관리
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Google Cloud Console**: https://console.cloud.google.com
- **GitHub Repository**: https://github.com/YUNHYEONJUN/casenetai

### 문서
- **GOOGLE_OAUTH_SETUP.md**: Google OAuth 설정 가이드
- **ADMIN_SETUP_GUIDE.md**: 관리자 권한 설정 가이드
- **USER_APPROVAL_FLOW.md**: 사용자 승인 프로세스
- **QUICK_START.md**: 빠른 시작 가이드

---

## ✅ 최종 체크리스트

### 즉시 가능 (Google OAuth 없이)
- [ ] Vercel 배포 완료 확인 (2-3분 대기)
- [ ] https://casenetai.kr 접속
- [ ] 카카오톡 또는 네이버로 로그인
- [ ] 이메일/비밀번호 폼이 없는지 확인
- [ ] Supabase 로그인 (yoonhj79@gmail.com)
- [ ] users 테이블에서 본인 계정 찾기
- [ ] role → 'system_admin', is_approved → true
- [ ] https://casenetai.kr/system-admin.html 접속

### Google OAuth 설정 (30분 소요)
- [ ] Google Cloud Console 프로젝트 생성
- [ ] OAuth 동의 화면 구성
- [ ] OAuth 2.0 클라이언트 ID 생성
- [ ] 클라이언트 ID와 보안 비밀 복사
- [ ] Vercel 환경변수 추가 (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)
- [ ] Vercel 재배포
- [ ] 구글 로그인 테스트

---

## 🆘 도움이 필요하신가요?

진행하시다가 막히는 부분이 있으면:
1. 스크린샷 공유
2. 어느 단계에서 막혔는지 알려주세요
3. 오류 메시지 공유

**지금 바로 진행하시면 됩니다!** 🚀

---

## 🎉 축하합니다!

모든 코드 작업이 완료되었습니다!
이제 설정만 하시면 즉시 사용 가능합니다.
