# CaseNetAI 사용자 승인 프로세스

## 📊 3단계 권한 승인 흐름도

```
┌─────────────────────────────────────────────────────────────────┐
│                       🔐 소셜 로그인                              │
│              (카카오톡 / 네이버 / 구글)                           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   👤 일반 사용자 등록           │
        │   - role: 'user'              │
        │   - is_approved: false        │
        │   - organization_id: NULL     │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────────┐         ┌────────────────────┐
│  기관 관리자 신청   │         │  기관 사용자 신청   │
│  (Org Admin)      │         │  (User)           │
└─────────┬─────────┘         └──────────┬─────────┘
          │                               │
          │ ① 시스템 관리자 승인            │ ② 기관 관리자 승인
          │                               │
          ▼                               ▼
┌─────────────────────┐         ┌──────────────────────┐
│  🎖️ 기관 관리자       │         │  ✅ 기관 사용자        │
│  - role: org_admin  │         │  - role: user        │
│  - is_approved: ✓   │         │  - is_approved: ✓    │
│  - org_id: 설정됨    │         │  - org_id: 설정됨     │
└─────────────────────┘         └──────────────────────┘
          │                               │
          ▼                               ▼
    기관 직원 관리 가능                  서비스 이용 가능
```

---

## 🔄 상세 승인 프로세스

### 1️⃣ 시스템 관리자 (System Admin) 설정

**초기 설정 (최초 1회만)**

1. **소셜 로그인**
   ```
   https://casenetai.kr → 카카오/네이버/구글 로그인
   ```

2. **Supabase에서 권한 부여**
   - https://supabase.com/dashboard 접속
   - `casenetai` 프로젝트 → `Table Editor` → `users` 테이블
   - 해당 계정 찾기 (oauth_email 또는 oauth_id로 검색)
   - 수정:
     - `role` → `'system_admin'`
     - `is_approved` → `true`

3. **시스템 관리자 대시보드 접근**
   ```
   https://casenetai.kr/system-admin.html
   ```

**시스템 관리자 권한:**
- ✅ 모든 기관 관리
- ✅ 기관 생성/수정/삭제
- ✅ 사용자를 기관 관리자로 승격
- ✅ 모든 사용자 관리
- ✅ 통계 및 분석

---

### 2️⃣ 기관 관리자 (Organization Admin) 승인

**프로세스:**

1. **사용자가 소셜 로그인**
   - 카카오톡/네이버/구글 중 선택
   - 자동으로 일반 사용자로 등록됨

2. **기관 선택/생성**
   - 사용자가 소속 기관 선택 또는 신규 기관 등록 요청

3. **오프라인 확인** ⭐ 중요!
   - 시스템 관리자가 **공식 문서** 확인:
     - 사업자 등록증
     - 재직 증명서
     - 관리자 지정 공문
     - 신분증 등
   - 카카오톡/네이버 계정으로 본인 확인

4. **시스템 관리자 승인**
   
   **방법 A: 대시보드에서 승인**
   ```
   https://casenetai.kr/system-admin.html
   → "기관 관리" 탭
   → 승인 대기 사용자 목록
   → "기관 관리자로 승격" 버튼 클릭
   ```

   **방법 B: Supabase에서 수동 승인**
   ```sql
   UPDATE users 
   SET role = 'org_admin', 
       is_approved = true,
       organization_id = 1  -- 해당 기관 ID
   WHERE oauth_email = 'admin@example.com';
   ```

5. **기관 관리자 대시보드 접근**
   ```
   https://casenetai.kr/org-admin.html
   ```

**기관 관리자 권한:**
- ✅ 본인 기관 소속 직원 관리
- ✅ 기관 가입 요청 승인/거절
- ✅ 기관 사용자 권한 부여
- ✅ 본인 기관 통계 조회
- ❌ 다른 기관 접근 불가
- ❌ 시스템 관리자 권한 부여 불가

---

### 3️⃣ 기관 사용자 (User) 승인

**프로세스:**

1. **사용자가 소셜 로그인**
   - 카카오톡/네이버/구글 중 선택

2. **기관 가입 신청**
   - 사용자가 본인이 속한 기관 선택
   - 가입 요청 메시지 작성 (선택사항)

3. **기관 관리자 확인** ⭐ 중요!
   - 기관 관리자가 **본인 기관 소속 직원인지 확인**:
     - 카카오톡/네이버 계정 확인
     - 재직 확인
     - 부서/직급 확인

4. **기관 관리자 승인**
   
   **방법: 대시보드에서 승인**
   ```
   https://casenetai.kr/org-admin.html
   → "소속 직원 관리" 탭
   → "가입 요청" 섹션
   → 승인 대기 사용자 확인
   → "승인" 버튼 클릭
   ```

5. **서비스 이용 시작**
   ```
   https://casenetai.kr/dashboard.html
   ```

**기관 사용자 권한:**
- ✅ CaseNetAI 서비스 이용 (AI 분석 등)
- ✅ 본인 사용 내역 조회
- ❌ 다른 사용자 관리 불가
- ❌ 기관 설정 변경 불가

---

## 📋 API 엔드포인트 요약

### 시스템 관리자 API

```
GET  /api/system-admin/organizations          # 기관 목록
POST /api/system-admin/organizations          # 기관 생성
PUT  /api/system-admin/organizations/:id      # 기관 수정

GET  /api/system-admin/users                  # 사용자 목록
POST /api/system-admin/approve-user/:userId   # 사용자 승인
POST /api/system-admin/promote-to-org-admin/:userId  # 기관 관리자 승격
POST /api/system-admin/reject-user/:userId    # 사용자 거부

GET  /api/system-admin/statistics             # 통계 조회
```

### 기관 관리자 API

```
GET  /api/org-admin/employees                 # 소속 직원 목록
GET  /api/org-admin/employees/:id             # 직원 상세
PUT  /api/org-admin/employees/:id             # 직원 정보 수정
DELETE /api/org-admin/employees/:id           # 직원 제거

GET  /api/org-admin/join-requests             # 가입 요청 목록
PUT  /api/org-admin/join-requests/:id/approve # 가입 요청 승인
PUT  /api/org-admin/join-requests/:id/reject  # 가입 요청 거절

GET  /api/org-admin/statistics                # 기관 통계
```

### 일반 사용자 API

```
GET  /api/join-requests/organizations         # 가입 가능 기관 목록
POST /api/join-requests                       # 기관 가입 요청
GET  /api/join-requests/my                    # 내 가입 요청 목록
DELETE /api/join-requests/:id                 # 가입 요청 취소
```

---

## 🔐 보안 및 권한 체크

### 인증 미들웨어

```javascript
// 모든 API 요청에 JWT 토큰 필요
authenticateToken(req, res, next)

// System Admin 권한 필요
requireSystemAdmin(req, res, next)

// Org Admin 이상 권한 필요
requireOrgAdmin(req, res, next)

// 본인 기관 Org Admin 권한 필요
requireOwnOrgAdmin(organizationId)(req, res, next)
```

### 데이터베이스 권한 체크

- Org Admin은 `WHERE organization_id = ?` 조건으로 본인 기관만 조회
- System Admin만 모든 기관 데이터 접근 가능
- 승인되지 않은 사용자(`is_approved = false`)는 서비스 이용 불가

---

## 🎯 테스트 시나리오

### 시나리오 1: 신규 기관 관리자 승인

1. 사용자 A가 카카오톡으로 로그인
2. 시스템 관리자가 Supabase에서 A를 `org_admin`으로 설정
3. 사용자 A가 https://casenetai.kr/org-admin.html 접속 성공

### 시나리오 2: 기관 직원 승인

1. 사용자 B가 네이버로 로그인
2. 사용자 B가 기관 "ABC 노인보호전문기관" 가입 신청
3. 기관 관리자 A가 org-admin 대시보드에서 B 승인
4. 사용자 B가 https://casenetai.kr/dashboard.html 접속하여 서비스 이용

### 시나리오 3: 권한 거부

1. 사용자 C가 구글로 로그인
2. 사용자 C가 기관 "ABC 노인보호전문기관" 가입 신청
3. 기관 관리자 A가 확인 후 소속 직원이 아님을 확인
4. 기관 관리자 A가 가입 요청 거절
5. 사용자 C는 서비스 이용 불가

---

## 📞 문의 및 지원

- **시스템 관리자 설정**: `ADMIN_SETUP_GUIDE.md` 참조
- **Supabase Dashboard**: https://supabase.com/dashboard
- **GitHub**: https://github.com/YUNHYEONJUN/casenetai
- **서비스 URL**: https://casenetai.kr

---

## ✅ 체크리스트

### 시스템 관리자 (1회 설정)
- [ ] 카카오/네이버/구글로 로그인
- [ ] Supabase에서 `role = 'system_admin'` 설정
- [ ] Supabase에서 `is_approved = true` 설정
- [ ] https://casenetai.kr/system-admin.html 접속 확인

### 기관 관리자 승인
- [ ] 사용자 소셜 로그인 확인
- [ ] 공식 문서로 신원 확인
- [ ] 시스템 관리자 대시보드에서 승격
- [ ] 기관 관리자 대시보드 접속 확인

### 기관 사용자 승인
- [ ] 사용자 소셜 로그인 확인
- [ ] 기관 가입 신청 확인
- [ ] 재직 여부 확인
- [ ] 기관 관리자 대시보드에서 승인
- [ ] 사용자 서비스 이용 확인
