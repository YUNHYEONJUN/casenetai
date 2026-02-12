# 🚀 Vercel 배포 가이드

## 📋 배포 전 체크리스트

### ✅ 준비 완료 항목
- [x] PostgreSQL 데이터베이스 (Supabase) 설정 완료
- [x] 모든 코드 보안 강화 완료
- [x] Git 커밋 및 Push 완료
- [x] 환경 변수 준비 완료

---

## 🎯 **Step 1: Vercel 계정 생성 및 로그인**

### 1-1. Vercel 접속
```
https://vercel.com
```

### 1-2. GitHub으로 로그인
- "Sign Up" 또는 "Login" 클릭
- "Continue with GitHub" 선택
- GitHub 계정으로 로그인
- Vercel 권한 승인

---

## 🔗 **Step 2: 프로젝트 Import**

### 2-1. New Project 클릭
- Vercel 대시보드에서 "Add New..." → "Project" 클릭

### 2-2. GitHub 저장소 연결
- "Import Git Repository" 섹션에서
- **저장소:** `YUNHYEONJUN/casenetai`
- "Import" 클릭

### 2-3. 프로젝트 설정
```
Project Name: casenetai (또는 원하는 이름)
Framework Preset: Other (자동 감지)
Root Directory: ./ (루트)
Build Command: (비워두기 - Node.js는 자동)
Output Directory: (비워두기)
Install Command: npm install
```

### 2-4. 브랜치 선택
⚠️ **중요:** `genspark_ai_developer` 브랜치 선택!
```
Production Branch: genspark_ai_developer
```

---

## 🔐 **Step 3: 환경 변수 설정 (매우 중요!)**

"Environment Variables" 섹션에서 다음 변수들을 **정확히** 입력하세요:

### 3-1. 데이터베이스 (필수)
```env
Name: DATABASE_URL
Value: [Supabase에서 복사한 Connection String]
Environment: Production, Preview, Development (모두 체크)

⚠️ 형식: postgresql://postgres.[project-ref]:[PASSWORD]@aws-region.pooler.supabase.com:5432/postgres
```

### 3-2. JWT Secret (필수)
```env
Name: JWT_SECRET
Value: [.env 파일에서 복사]
Environment: Production, Preview, Development (모두 체크)

⚠️ 최소 32자 이상의 랜덤 문자열
```

### 3-3. AI API Keys
```env
Name: GOOGLE_AI_API_KEY
Value: [.env 파일에서 복사]
Environment: Production, Preview, Development

Name: OPENAI_API_KEY
Value: [.env 파일에서 복사]
Environment: Production, Preview, Development
```

### 3-4. Naver Clova STT
```env
Name: CLOVA_CLIENT_ID
Value: [.env 파일에서 복사]
Environment: Production, Preview, Development

Name: CLOVA_CLIENT_SECRET
Value: [.env 파일에서 복사]
Environment: Production, Preview, Development
```

### 3-5. OAuth Keys (나중에 업데이트 필요)
```env
Name: KAKAO_CLIENT_ID
Value: (Kakao Developers에서 발급)
Environment: Production

Name: KAKAO_CLIENT_SECRET
Value: (Kakao Developers에서 발급)
Environment: Production

Name: NAVER_CLIENT_ID
Value: (Naver Developers에서 발급)
Environment: Production

Name: NAVER_CLIENT_SECRET
Value: (Naver Developers에서 발급)
Environment: Production

Name: GOOGLE_CLIENT_ID
Value: (Google Cloud Console에서 발급)
Environment: Production

Name: GOOGLE_CLIENT_SECRET
Value: (Google Cloud Console에서 발급)
Environment: Production
```

### 3-6. 기타 설정
```env
Name: NODE_ENV
Value: production
Environment: Production

Name: BASE_URL
Value: https://casenetai.vercel.app (배포 후 실제 URL로 변경)
Environment: Production

Name: PORT
Value: 3000
Environment: Production, Preview, Development
```

⚠️ **주의:** 모든 환경 변수는 따옴표 없이 값만 입력!

---

## 🚀 **Step 4: 배포 시작**

### 4-1. Deploy 버튼 클릭
- 모든 환경 변수 입력 확인
- "Deploy" 버튼 클릭

### 4-2. 빌드 진행 상황 확인
```
⏳ Building...
   → npm install
   → 파일 최적화
   → 서버 준비
   
✅ Deployment Ready (약 2-3분 소요)
```

### 4-3. 배포 완료!
```
🎉 Deployment successful!

Your project is live at:
https://casenetai-xxxx.vercel.app
```

---

## 🌐 **Step 5: 도메인 연결 (casenetai.com)**

### 5-1. Vercel에서 도메인 추가
1. 프로젝트 → "Settings" → "Domains"
2. "Add" 버튼 클릭
3. 입력: `casenetai.com`
4. "Add" 클릭

### 5-2. Vercel이 제공하는 DNS 설정 확인
```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### 5-3. Cafe24 DNS 설정
1. Cafe24 관리자 페이지 로그인
2. 도메인 관리 → DNS 관리
3. A 레코드 추가:
   - 호스트: @
   - 값: 76.76.21.21
4. CNAME 레코드 추가:
   - 호스트: www
   - 값: cname.vercel-dns.com
5. 저장

### 5-4. DNS 전파 대기
```
⏳ 보통 5분 ~ 24시간 소요
💡 빠르면 10분 내 완료
```

### 5-5. 확인
```bash
# 터미널에서 확인
nslookup casenetai.com

# 또는 브라우저에서
https://casenetai.com
```

---

## 🔧 **Step 6: OAuth 콜백 URL 업데이트**

배포 완료 후 **반드시** 각 OAuth 제공자의 콜백 URL을 업데이트하세요!

### 6-1. Kakao Developers
```
내 애플리케이션 → 앱 설정 → 플랫폼 → Web 플랫폼

Redirect URI:
https://casenetai.com/api/auth/kakao/callback
```

### 6-2. Naver Developers
```
내 애플리케이션 → API 설정

Callback URL:
https://casenetai.com/api/auth/naver/callback
```

### 6-3. Google Cloud Console
```
사용자 인증 정보 → OAuth 2.0 클라이언트 ID

승인된 리디렉션 URI:
https://casenetai.com/api/auth/google/callback
```

---

## ✅ **Step 7: 프로덕션 테스트**

### 7-1. 기본 접속 테스트
```
https://casenetai.com
→ 메인 페이지 로드 확인
```

### 7-2. 데이터베이스 연결 확인
```
https://casenetai.com/api/status
→ {"status":"running","apiKeyConfigured":true}
```

### 7-3. 로그인 테스트
- Kakao 로그인 시도
- Naver 로그인 시도
- Google 로그인 시도

### 7-4. 핵심 기능 테스트
- 상담 로그 생성 (음성 업로드)
- 문서 익명화
- 크레딧 차감 확인

---

## 🔍 **트러블슈팅**

### 문제 1: 빌드 실패
```
원인: 환경 변수 누락
해결: DATABASE_URL, JWT_SECRET 확인
```

### 문제 2: 서버 500 에러
```
원인: PostgreSQL 연결 실패
해결: 
1. DATABASE_URL 정확성 확인
2. Supabase 프로젝트 활성화 확인
3. Vercel 로그 확인 (Functions 탭)
```

### 문제 3: OAuth 로그인 실패
```
원인: 콜백 URL 미업데이트
해결:
1. 각 OAuth 제공자 콘솔에서 콜백 URL 업데이트
2. https://casenetai.com/api/auth/*/callback
```

### 문제 4: 도메인 접속 불가
```
원인: DNS 전파 중
해결: 
1. 10분~24시간 대기
2. nslookup casenetai.com 으로 확인
3. Vercel에서 도메인 상태 확인
```

---

## 📊 **배포 후 모니터링**

### Vercel 대시보드에서 확인 가능:
```
✅ 배포 상태 (성공/실패)
✅ 실시간 로그
✅ 성능 모니터링
✅ 에러 추적
✅ 트래픽 통계
```

---

## 🎉 **배포 완료 체크리스트**

- [ ] Vercel 프로젝트 생성
- [ ] GitHub 저장소 연결
- [ ] 환경 변수 설정 (12개)
- [ ] 첫 배포 성공
- [ ] 도메인 연결 (casenetai.com)
- [ ] DNS 설정 (Cafe24)
- [ ] OAuth 콜백 URL 업데이트
- [ ] 프로덕션 테스트 완료
- [ ] 모니터링 설정

---

## 💡 **유용한 명령어**

### Vercel 대시보드 주소
```
https://vercel.com/dashboard
```

### Supabase 대시보드
```
https://supabase.com/dashboard/project/lsrfzqgvtaxjqnhtzebz
```

### GitHub 저장소
```
https://github.com/YUNHYEONJUN/casenetai
```

---

## 🆘 **도움이 필요하면**

1. Vercel 로그 확인: 프로젝트 → Deployments → 최신 배포 → Function Logs
2. Supabase 로그 확인: 프로젝트 → Logs
3. GitHub Actions 확인 (있는 경우)

---

**🚀 준비 완료! 이제 Vercel에 배포하세요!**

**Step 1부터 차근차근 따라하시면 됩니다!** 😊
