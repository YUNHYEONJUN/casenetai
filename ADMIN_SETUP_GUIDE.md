# CaseNetAI 관리자 권한 설정 가이드

## 📋 3단계 권한 구조

```
시스템 관리자 (system_admin)
    ↓ 승인
기관 관리자 (org_admin)
    ↓ 승인
기관 사용자 (user)
```

---

## 1️⃣ 시스템 관리자 (System Admin) 로그인 및 권한 부여

### 🔐 로그인 방법

시스템 관리자는 **카카오톡/네이버/구글 소셜 로그인**을 사용합니다.

1. **https://casenetai.kr** 접속
2. 카카오톡/네이버/구글 중 하나로 로그인
3. 초기에는 일반 사용자로 등록됨 (승인 대기 상태)

### 🛠️ 시스템 관리자 권한 부여 (수동)

**Supabase Dashboard에서 권한 부여:**

1. **Supabase 로그인**
   - https://supabase.com/dashboard
   
2. **프로젝트 선택**
   - `casenetai` 프로젝트 클릭
   
3. **Table Editor 이동**
   - 좌측 메뉴에서 `Table Editor` 클릭
   
4. **users 테이블 열기**
   - `users` 테이블 선택
   
5. **관리자 계정 찾기**
   - 로그인한 계정의 `oauth_email` 또는 `oauth_id` 검색
   
6. **권한 수정**
   - 해당 행 클릭
   - `role` 필드를 `'system_admin'`으로 변경
   - `is_approved`를 `true`로 변경
   - `Save` 클릭

**SQL 쿼리로 권한 부여 (대안):**

```sql
-- 카카오 계정으로 로그인한 경우
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'kakao' 
  AND oauth_email = 'admin@example.com';

-- 또는 oauth_id로 검색
UPDATE users 
SET role = 'system_admin', 
    is_approved = true 
WHERE oauth_provider = 'kakao' 
  AND oauth_id = '1234567890';
```

### 📊 시스템 관리자 대시보드 접근

권한 부여 후:
- **https://casenetai.kr/system-admin.html** 접속
- 로그인하면 자동으로 시스템 관리자 대시보드로 이동
- 모든 기관 및 사용자 관리 가능

---

## 2️⃣ 기관 관리자 (Organization Admin) 승인

### 🏢 기관 관리자 신청 프로세스

1. **사용자가 소셜 로그인** (카카오/네이버/구글)
2. **기관 가입 요청**
   - 사용자가 본인이 속한 기관 선택 또는 신규 기관 등록
   
3. **시스템 관리자 승인**
   - 시스템 관리자가 대시보드에서 확인
   - 오프라인 확인 (공식 문서, 신분증 등)
   - `기관 관리자` 권한 부여

### 👨‍💼 시스템 관리자 승인 방법

**대시보드에서 승인:**
1. https://casenetai.kr/system-admin.html 로그인
2. "기관 관리" 탭 클릭
3. 승인 대기 중인 기관 관리자 목록 확인
4. "승인" 버튼 클릭

**Supabase에서 수동 승인:**
```sql
-- 기관 관리자 권한 부여
UPDATE users 
SET role = 'org_admin', 
    is_approved = true,
    organization_id = 1  -- 해당 기관 ID
WHERE oauth_email = 'org_admin@example.com';
```

---

## 3️⃣ 기관 사용자 (User) 승인

### 👥 기관 사용자 신청 프로세스

1. **사용자가 소셜 로그인** (카카오/네이버/구글)
2. **기관 가입 신청**
   - 본인이 속한 기관 선택
   
3. **기관 관리자 승인**
   - 기관 관리자가 본인 기관 소속 직원 확인
   - 서비스 이용 권한 부여

### 🔓 기관 관리자 승인 방법

**대시보드에서 승인:**
1. https://casenetai.kr/org-admin.html 로그인
2. "소속 직원 관리" 탭 클릭
3. 승인 대기 중인 사용자 목록 확인
4. "승인" 버튼 클릭

---

## 📊 권한별 접근 가능 페이지

### System Admin (system_admin)
- ✅ https://casenetai.kr/system-admin.html
- ✅ 모든 기관 관리
- ✅ 모든 사용자 관리
- ✅ 기관 관리자 권한 부여
- ✅ 통계 및 분석

### Organization Admin (org_admin)
- ✅ https://casenetai.kr/org-admin.html
- ✅ 본인 기관 소속 사용자 관리
- ✅ 기관 사용자 승인
- ✅ 본인 기관 통계

### User (user)
- ✅ https://casenetai.kr/dashboard.html
- ✅ 서비스 이용 (승인된 경우에만)

---

## 🔑 초기 시스템 관리자 설정 체크리스트

- [ ] 카카오/네이버/구글로 로그인
- [ ] Supabase에서 `role = 'system_admin'` 설정
- [ ] Supabase에서 `is_approved = true` 설정
- [ ] https://casenetai.kr/system-admin.html 접속 확인
- [ ] 기관 생성 및 관리 테스트
- [ ] 기관 관리자 승인 테스트

---

## 📞 문의

시스템 관리자 권한 설정 문제 발생 시:
- Supabase Dashboard: https://supabase.com/dashboard
- GitHub: https://github.com/YUNHYEONJUN/casenetai
