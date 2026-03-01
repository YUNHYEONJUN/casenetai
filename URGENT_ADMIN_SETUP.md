# 🚨 긴급: 관리자 계정 생성 가이드

**문제**: 데이터베이스 연결 불가로 인해 Node.js 스크립트 사용 불가  
**해결**: Supabase에서 직접 SQL 실행 필요

---

## 📍 Step 1: Supabase 대시보드 접속

1. 브라우저에서 다음 URL을 엽니다:
   ```
   https://supabase.com/dashboard/project/lsrfzqgvtaxjqnhtzebz/sql
   ```

2. Supabase 계정으로 로그인합니다.

---

## 📍 Step 2: SQL 스크립트 복사

아래 SQL 코드 전체를 복사하세요:

```sql
-- =====================================================
-- 1단계: 기존 계정 삭제 (있다면)
-- =====================================================
DELETE FROM credits WHERE user_id IN (
  SELECT id FROM users WHERE oauth_email = 'admin@casenetai.kr'
);
DELETE FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- =====================================================
-- 2단계: 관리자 계정 생성
-- =====================================================
INSERT INTO users (
  oauth_email,
  password_hash,
  name,
  role,
  is_email_verified,
  is_approved,
  oauth_provider,
  oauth_id,
  created_at,
  updated_at
) VALUES (
  'admin@casenetai.kr',
  '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',
  '시스템 관리자',
  'system_admin',
  true,
  true,
  'local',
  'admin_' || extract(epoch from now())::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- =====================================================
-- 3단계: 크레딧 생성
-- =====================================================
INSERT INTO credits (
  user_id,
  balance,
  total_purchased,
  total_used,
  free_trial_count,
  free_trial_used,
  created_at,
  updated_at
)
SELECT
  id,
  10000000,
  0,
  0,
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM users
WHERE oauth_email = 'admin@casenetai.kr';

-- =====================================================
-- 4단계: 생성 확인
-- =====================================================
SELECT
  u.id,
  u.oauth_email as email,
  u.name,
  u.role,
  u.is_approved,
  u.is_email_verified,
  c.balance as credit_balance,
  u.password_hash IS NOT NULL as has_password
FROM users u
LEFT JOIN credits c ON u.id = c.user_id
WHERE u.oauth_email = 'admin@casenetai.kr';
```

---

## 📍 Step 3: SQL 실행

1. Supabase SQL Editor에 복사한 코드를 붙여넣습니다.
2. 오른쪽 아래 **"Run"** 버튼을 클릭합니다.
3. 실행 결과에서 다음을 확인합니다:
   ```
   id | email               | name         | role         | is_approved | credit_balance
   ---+--------------------+--------------+--------------+-------------+---------------
   1  | admin@casenetai.kr | 시스템 관리자 | system_admin | true        | 10000000
   ```

---

## 📍 Step 4: 로그인 테스트

1. **로그인 페이지 접속**:
   ```
   https://casenetai.kr/login.html
   ```

2. **로그인 정보 입력**:
   - 📧 이메일: `admin@casenetai.kr`
   - 🔑 비밀번호: `Admin2026!@#$`

3. **"로그인" 버튼 클릭**

---

## 🔧 문제 해결

### ❌ "이메일 또는 비밀번호가 올바르지 않습니다"

**원인 1: 계정이 생성되지 않음**

Supabase SQL Editor에서 다시 확인:
```sql
SELECT oauth_email, name, role, password_hash 
FROM users 
WHERE oauth_email = 'admin@casenetai.kr';
```

결과가 없으면 → Step 2의 SQL을 다시 실행

**원인 2: password_hash가 NULL**

```sql
UPDATE users 
SET password_hash = '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2'
WHERE oauth_email = 'admin@casenetai.kr';
```

**원인 3: is_approved가 false**

```sql
UPDATE users 
SET is_approved = true, is_email_verified = true
WHERE oauth_email = 'admin@casenetai.kr';
```

---

### ❌ "승인 대기 중입니다"

```sql
UPDATE users 
SET is_approved = true
WHERE oauth_email = 'admin@casenetai.kr';
```

---

### ❌ "소셜 로그인으로 가입된 계정입니다"

authService.js의 로그인 로직 문제입니다. 다음 SQL로 확인:

```sql
SELECT oauth_provider, password_hash IS NULL as no_password
FROM users 
WHERE oauth_email = 'admin@casenetai.kr';
```

password_hash가 NULL이면:
```sql
UPDATE users 
SET password_hash = '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2'
WHERE oauth_email = 'admin@casenetai.kr';
```

---

## 🔍 디버깅: 로그인 프로세스 확인

### 1. 브라우저 개발자 도구 열기
- Chrome: `F12` 또는 `Ctrl+Shift+I`
- Firefox: `F12`

### 2. Network 탭 확인
- "Preserve log" 체크
- 로그인 시도
- `/api/auth/login` 요청 확인
- Response 탭에서 에러 메시지 확인

### 3. Console 탭 확인
- 자바스크립트 에러 확인

---

## 🎯 확실한 방법: 수동 비밀번호 해시 업데이트

만약 위 방법들이 모두 실패한다면, 다른 비밀번호로 새 해시를 생성:

### 새 비밀번호 해시 생성

로컬에서 실행:
```bash
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('YourNewPassword123!', 12, (e,h)=>console.log(h))"
```

### 생성된 해시로 업데이트

Supabase SQL Editor에서:
```sql
UPDATE users 
SET password_hash = '[위에서_생성된_해시값]'
WHERE oauth_email = 'admin@casenetai.kr';
```

---

## 📋 최종 체크리스트

- [ ] Supabase SQL Editor 접속 완료
- [ ] Step 2의 SQL 실행 완료
- [ ] SELECT 쿼리로 계정 생성 확인
- [ ] oauth_email = 'admin@casenetai.kr' 확인
- [ ] password_hash가 NULL이 아님 확인
- [ ] is_approved = true 확인
- [ ] credit_balance = 10000000 확인
- [ ] 로그인 페이지에서 로그인 시도
- [ ] 대시보드 정상 접속 확인

---

## 🆘 여전히 안 될 경우

다음 정보를 확인해주세요:

1. **Supabase SQL 실행 결과 스크린샷**
2. **브라우저 Console 에러 메시지**
3. **Network 탭의 /api/auth/login 응답**

이 정보들이 있으면 정확한 원인을 파악할 수 있습니다.

---

## 📞 긴급 연락

문제가 지속되면:
1. Supabase 프로젝트 설정 확인
2. 데이터베이스 접근 권한 확인
3. Row Level Security (RLS) 정책 확인

---

**작성**: 2026-03-01  
**우선순위**: 🚨 긴급  
**예상 소요 시간**: 5분
