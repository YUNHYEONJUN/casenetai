# 🚀 CaseNetAI 빠른 시작 가이드

## 1️⃣ 관리자 권한 질문 답변

### Q1: 관리자는 어떻게 로그인 하나요?

**A: 소셜 로그인 (카카오톡/네이버/구글)**

```
1. https://casenetai.kr 접속
2. 카카오톡/네이버/구글 중 하나로 로그인
3. 처음에는 일반 사용자로 등록됨
4. Supabase에서 수동으로 권한 부여 필요
```

**Supabase에서 권한 부여:**
```
https://supabase.com/dashboard
→ casenetai 프로젝트 선택
→ Table Editor → users 테이블
→ 로그인한 계정 찾기 (oauth_email로 검색)
→ role: 'system_admin' 으로 변경
→ is_approved: true로 변경
→ Save
```

**권한 부여 후:**
```
https://casenetai.kr/system-admin.html 접속 가능
```

---

## 2️⃣ 기관별 관리자와 사용자 관리 대시보드

### 시스템 관리자 대시보드

**URL**: https://casenetai.kr/system-admin.html

**기능:**
- ✅ 모든 기관 조회/생성/수정
- ✅ 각 기관별 통계 확인
  - 기관별 직원 수
  - 기관별 사용량
  - 기관별 구독 상태
- ✅ 기관 관리자 권한 부여
- ✅ 전체 사용자 관리
- ✅ 감사 로그 조회

**주요 화면:**
```
┌─────────────────────────────────────────┐
│         시스템 관리자 대시보드            │
├─────────────────────────────────────────┤
│                                         │
│  📊 통계 카드                            │
│  ┌──────┐ ┌──────┐ ┌──────┐           │
│  │ 기관수│ │직원수 │ │사용량 │           │
│  └──────┘ └──────┘ └──────┘           │
│                                         │
│  🏢 기관 관리                            │
│  ┌─────────────────────────────────┐   │
│  │ ABC 노인보호전문기관              │   │
│  │ - 직원: 15명                      │   │
│  │ - 구독: Active                   │   │
│  │ [관리] [통계]                     │   │
│  ├─────────────────────────────────┤   │
│  │ XYZ 복지센터                     │   │
│  │ - 직원: 8명                       │   │
│  │ - 구독: Trial                    │   │
│  │ [관리] [통계]                     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  👥 승인 대기 사용자                    │
│  ┌─────────────────────────────────┐   │
│  │ 홍길동 (kakao)                    │   │
│  │ - 요청 기관: ABC 노인보호전문기관  │   │
│  │ [기관 관리자로 승격] [거부]        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 기관 관리자 대시보드

**URL**: https://casenetai.kr/org-admin.html

**기능:**
- ✅ 본인 기관 소속 직원 목록
- ✅ 본인 기관 통계
  - 직원 수
  - 사용량
  - 활성 사용자
- ✅ 가입 요청 승인/거절
- ✅ 직원 정보 수정
- ❌ 다른 기관 접근 불가

**주요 화면:**
```
┌─────────────────────────────────────────┐
│         기관 관리자 대시보드              │
│       (ABC 노인보호전문기관)              │
├─────────────────────────────────────────┤
│                                         │
│  📊 기관 통계                            │
│  ┌──────┐ ┌──────┐ ┌──────┐           │
│  │직원 15│ │활성 12│ │대기 3│           │
│  └──────┘ └──────┘ └──────┘           │
│                                         │
│  👥 소속 직원 관리                       │
│  ┌─────────────────────────────────┐   │
│  │ 김철수 (naver)                    │   │
│  │ - 상태: Active                    │   │
│  │ - 가입일: 2025-01-10              │   │
│  │ [상세] [수정]                     │   │
│  ├─────────────────────────────────┤   │
│  │ 이영희 (kakao)                    │   │
│  │ - 상태: Active                    │   │
│  │ - 가입일: 2025-01-12              │   │
│  │ [상세] [수정]                     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📋 가입 요청 (승인 대기)                │
│  ┌─────────────────────────────────┐   │
│  │ 박민수 (google)                   │   │
│  │ - 신청일: 2025-01-15              │   │
│  │ - 메시지: "ABC 복지팀 소속입니다"  │   │
│  │ [승인] [거절]                     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 3️⃣ 승인 프로세스 구현

### 전체 흐름

```
사용자 소셜 로그인
      ↓
카카오/네이버/구글 선택
      ↓
[선택지]
   ├─→ 기관 관리자로 신청
   │        ↓
   │   시스템 관리자가 오프라인 확인
   │   (공식 문서: 사업자등록증, 재직증명서 등)
   │        ↓
   │   시스템 관리자가 대시보드에서 승격
   │        ↓
   │   기관 관리자 권한 부여 ✅
   │        ↓
   │   org-admin.html 접속 가능
   │
   └─→ 기관 사용자로 신청
            ↓
       기관 선택 및 가입 신청
            ↓
       기관 관리자가 재직 확인
       (카카오톡/네이버 계정, 직원 명부 대조)
            ↓
       기관 관리자가 대시보드에서 승인
            ↓
       기관 사용자 권한 부여 ✅
            ↓
       dashboard.html 접속 및 서비스 이용
```

### API 호출 흐름

**1. 사용자 로그인 (소셜)**
```
POST /api/auth/kakao/callback  (또는 naver, google)
→ JWT 토큰 발급
→ role: 'user', is_approved: false로 등록
```

**2. 기관 가입 신청**
```
POST /api/join-requests
Body: {
  organization_id: 1,
  message: "ABC 복지팀 소속입니다"
}
→ status: 'pending'으로 요청 생성
```

**3-A. 시스템 관리자 → 기관 관리자 승격**
```
POST /api/system-admin/promote-to-org-admin/:userId
Body: {
  organization_id: 1
}
→ role: 'org_admin', is_approved: true
```

**3-B. 기관 관리자 → 사용자 승인**
```
PUT /api/org-admin/join-requests/:requestId/approve
Body: {
  review_message: "승인되었습니다"
}
→ organization_id 설정, is_approved: true
```

---

## 🔐 권한 확인 로직

### 시스템 관리자 (system_admin)
```javascript
// 미들웨어
requireSystemAdmin(req, res, next)

// 확인 조건
req.user.role === 'system_admin'
req.user.is_approved === true
```

### 기관 관리자 (org_admin)
```javascript
// 미들웨어
requireOrgAdmin(req, res, next)

// 확인 조건
req.user.role === 'org_admin'
req.user.is_approved === true
req.user.organization_id !== null
```

### 기관 사용자 (user)
```javascript
// 미들웨어
authenticateToken(req, res, next)

// 확인 조건
req.user.role === 'user'
req.user.is_approved === true
req.user.organization_id !== null
```

### 데이터 접근 제한
```sql
-- 기관 관리자는 본인 기관만 조회
SELECT * FROM users
WHERE organization_id = :current_user_org_id

-- 시스템 관리자는 모든 기관 조회
SELECT * FROM users
-- WHERE 조건 없음 (전체 조회 가능)
```

---

## 📝 실전 사용 예시

### 예시 1: 신규 기관 관리자 등록

**시나리오**: "ABC 노인보호전문기관"의 김철수 팀장을 기관 관리자로 등록

```bash
# 1단계: 김철수가 카카오톡으로 로그인
https://casenetai.kr → 카카오톡 로그인

# 2단계: 시스템 관리자 확인
# - 김철수의 재직 증명서 확인
# - 카카오톡 계정 확인 (kim-cs@kakao.com)
# - ABC 노인보호전문기관 사업자등록증 확인

# 3단계: Supabase에서 승격
UPDATE users 
SET role = 'org_admin', 
    is_approved = true,
    organization_id = 1  -- ABC 기관 ID
WHERE oauth_email = 'kim-cs@kakao.com';

# 4단계: 김철수가 기관 관리자 대시보드 접속
https://casenetai.kr/org-admin.html
```

### 예시 2: 기관 직원 승인

**시나리오**: 이영희가 "ABC 노인보호전문기관" 직원으로 가입

```bash
# 1단계: 이영희가 네이버로 로그인
https://casenetai.kr → 네이버 로그인

# 2단계: 이영희가 기관 가입 신청
# (UI에서) 기관 선택: "ABC 노인보호전문기관"
# 메시지: "복지팀 사회복지사 이영희입니다"

# 3단계: 기관 관리자 김철수가 확인
# - org-admin 대시보드 접속
# - 가입 요청 목록에서 "이영희" 확인
# - 직원 명부와 대조 (네이버 계정: lee-yh@naver.com)
# - 재직 확인 완료

# 4단계: 김철수가 승인 버튼 클릭
# (대시보드에서) [승인] 버튼 클릭

# 5단계: 이영희가 서비스 이용 시작
https://casenetai.kr/dashboard.html
```

---

## 🎯 빠른 설정 체크리스트

### 시스템 관리자 설정 (5분)
- [ ] 카카오/네이버/구글로 로그인
- [ ] Supabase Dashboard 접속
- [ ] users 테이블에서 본인 계정 찾기
- [ ] role → 'system_admin' 변경
- [ ] is_approved → true 변경
- [ ] system-admin.html 접속 확인

### 첫 번째 기관 생성 (3분)
- [ ] system-admin 대시보드 접속
- [ ] "기관 생성" 버튼 클릭
- [ ] 기관 정보 입력
- [ ] 저장

### 첫 번째 기관 관리자 승격 (2분)
- [ ] 대상 사용자가 소셜 로그인 완료
- [ ] system-admin 대시보드에서 사용자 찾기
- [ ] "기관 관리자로 승격" 버튼 클릭
- [ ] 기관 선택
- [ ] 승격 완료

---

## 📚 추가 문서

자세한 내용은 다음 문서를 참조하세요:

1. **ADMIN_SETUP_GUIDE.md**: 관리자 권한 설정 상세 가이드
2. **USER_APPROVAL_FLOW.md**: 사용자 승인 프로세스 상세 가이드
3. **IMPLEMENTATION_SUMMARY.md**: 전체 구현 내역 및 기술 문서

---

## 🚀 지금 바로 시작하기!

```bash
# 1. 소셜 로그인
https://casenetai.kr

# 2. Supabase 권한 부여
https://supabase.com/dashboard

# 3. 시스템 관리자 대시보드
https://casenetai.kr/system-admin.html
```

**배포 완료! 🎉**
약 2-4분 후 모든 기능 사용 가능합니다.
