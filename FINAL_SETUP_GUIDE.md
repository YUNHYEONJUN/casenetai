# 🎉 CaseNetAI 최종 설정 가이드

## ✅ 완료된 작업

1. ✅ **이메일/비밀번호 로그인 폼 제거**
2. ✅ **구글 로그인 버튼 제거**
3. ✅ **카카오톡/네이버 로그인만 지원**
4. ✅ **3단계 권한 시스템 구현 완료**
5. ✅ **코드 배포 완료**

---

## 🚀 지금 바로 사용 가능!

### 지원되는 로그인 방식

```
✅ 카카오톡 로그인
✅ 네이버 로그인
❌ 구글 로그인 (제거됨)
❌ 이메일/비밀번호 (제거됨)
```

---

## 📝 관리자 설정 (5분)

### 1단계: Vercel 배포 완료 확인

```
https://vercel.com/dashboard
→ casenetai 프로젝트
→ Deployments 탭
→ 최신 배포 "Ready" 확인 (약 2-3분 소요)
```

---

### 2단계: 카카오톡 또는 네이버로 로그인

```
🔗 https://casenetai.kr

1. "카카오톡으로 시작하기" 또는 "네이버로 시작하기" 클릭
2. 계정 선택 및 로그인
3. 권한 허용
```

**중요**: 어떤 계정으로 로그인했는지 기억하세요!
- 카카오톡: 카카오 이메일 (예: abc@kakao.com)
- 네이버: 네이버 이메일 (예: abc@naver.com)

---

### 3단계: Supabase에서 관리자 권한 부여

#### A. Supabase 로그인

```
🔗 https://supabase.com/dashboard

1. yoonhj79@gmail.com으로 로그인
2. 'casenetai' 프로젝트 클릭
```

#### B. users 테이블에서 권한 설정

```
3. 왼쪽 메뉴 'Table Editor' 클릭
4. 'users' 테이블 선택
5. 방금 로그인한 계정 찾기
   - oauth_email 컬럼에서 검색
   - oauth_provider로 필터링 (kakao 또는 naver)
```

#### C. 관리자 권한으로 변경

```
6. 해당 행 클릭하여 편집
7. 다음 값 변경:
   
   role: 'user' → 'system_admin'
   is_approved: false → true

8. 'Save' 버튼 클릭
```

**SQL로 직접 실행 (대안):**

카카오톡으로 로그인한 경우:
```sql
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'kakao' 
  AND oauth_email = 'your-kakao-email@kakao.com';
```

네이버로 로그인한 경우:
```sql
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'naver' 
  AND oauth_email = 'your-naver-email@naver.com';
```

**SQL 실행 위치:**
```
Supabase Dashboard
→ SQL Editor (왼쪽 메뉴)
→ 위 SQL 입력
→ 'Run' 버튼 클릭
```

---

### 4단계: 시스템 관리자 대시보드 접속

```
🔗 https://casenetai.kr/system-admin.html
```

✅ 기관 관리 대시보드가 보이면 성공!

---

## 🎯 사용 가능한 기능

### System Admin (system_admin) - 최고 관리자

**접속:** https://casenetai.kr/system-admin.html

**기능:**
- ✅ 모든 기관 관리 (생성/수정/삭제)
- ✅ 각 기관별 통계 확인
- ✅ 사용자를 기관 관리자로 승격
- ✅ 전체 사용자 관리
- ✅ 감사 로그 조회

---

### Organization Admin (org_admin) - 기관 관리자

**접속:** https://casenetai.kr/org-admin.html

**승인 방법:**
- System Admin이 대시보드에서 승격
- 또는 Supabase에서 role='org_admin' 설정

**기능:**
- ✅ 본인 기관 소속 직원 관리
- ✅ 기관 가입 요청 승인/거절
- ✅ 기관 사용자 권한 부여
- ✅ 본인 기관 통계 조회
- ❌ 다른 기관 접근 불가

---

### User (user) - 일반 사용자

**접속:** https://casenetai.kr/dashboard.html

**승인 방법:**
- Organization Admin이 승인

**기능:**
- ✅ CaseNetAI 서비스 이용 (AI 분석)
- ✅ 본인 사용 내역 조회
- ❌ 다른 사용자 관리 불가

---

## 📊 3단계 권한 승인 흐름

```
사용자 소셜 로그인 (카카오톡/네이버)
        ↓
[선택지]
   ├─→ 기관 관리자 신청
   │        ↓
   │   시스템 관리자 오프라인 확인 (공식 문서)
   │        ↓
   │   시스템 관리자 승인
   │        ↓
   │   기관 관리자 권한 부여 ✅
   │
   └─→ 기관 사용자 신청
            ↓
       기관 관리자 재직 확인
            ↓
       기관 관리자 승인
            ↓
       기관 사용자 권한 부여 ✅
```

---

## ✅ 최종 체크리스트

### 지금 바로 할 것

- [ ] Vercel 배포 완료 확인 (2-3분 대기)
- [ ] https://casenetai.kr 접속
- [ ] 카카오톡 또는 네이버로 로그인
- [ ] 로그인 화면에 구글 버튼이 없는지 확인
- [ ] 로그인 화면에 이메일/비밀번호 폼이 없는지 확인
- [ ] Supabase 로그인 (yoonhj79@gmail.com)
- [ ] users 테이블에서 본인 계정 찾기
- [ ] role → 'system_admin', is_approved → true 변경
- [ ] https://casenetai.kr/system-admin.html 접속 확인

---

## 🔗 중요 링크

### 서비스
- **Homepage**: https://casenetai.kr
- **Login**: https://casenetai.kr/login.html
- **System Admin Dashboard**: https://casenetai.kr/system-admin.html
- **Org Admin Dashboard**: https://casenetai.kr/org-admin.html

### 관리 도구
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://supabase.com/dashboard
- **GitHub Repository**: https://github.com/YUNHYEONJUN/casenetai

### 참고 문서
- **ADMIN_SETUP_GUIDE.md**: 관리자 설정 상세 가이드
- **USER_APPROVAL_FLOW.md**: 사용자 승인 프로세스
- **QUICK_START.md**: 빠른 시작 가이드

---

## 🎉 완료!

모든 준비가 끝났습니다!

**지금 바로:**
1. https://casenetai.kr 접속
2. 카카오톡/네이버로 로그인
3. Supabase에서 관리자 권한 부여
4. 시스템 관리자 대시보드 사용 시작!

**로그인 방식:**
- ✅ 카카오톡만 지원
- ✅ 네이버만 지원
- ✅ 소셜 계정으로 실명 확인
- ✅ 오프라인 신원 확인 후 수동 승인

**문제가 있으면 언제든지 알려주세요!** 🚀
