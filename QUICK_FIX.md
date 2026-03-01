# ⚡ 빠른 해결: 관리자 로그인

## 🎯 1분 안에 해결하기

### 1단계: Supabase 접속
```
https://supabase.com/dashboard/project/lsrfzqgvtaxjqnhtzebz/sql
```

### 2단계: 이 코드 복사 & 붙여넣기 & 실행

```sql
-- 기존 계정 삭제
DELETE FROM credits WHERE user_id IN (SELECT id FROM users WHERE oauth_email = 'admin@casenetai.kr');
DELETE FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- 새 관리자 계정 생성
INSERT INTO users (oauth_email, password_hash, name, role, is_email_verified, is_approved, oauth_provider, oauth_id, created_at, updated_at)
VALUES ('admin@casenetai.kr', '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2', '시스템 관리자', 'system_admin', true, true, 'local', 'admin_' || extract(epoch from now())::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 크레딧 생성
INSERT INTO credits (user_id, balance, total_purchased, total_used, free_trial_count, free_trial_used, created_at, updated_at)
SELECT id, 10000000, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM users WHERE oauth_email = 'admin@casenetai.kr';

-- 확인
SELECT u.oauth_email, u.name, u.role, u.is_approved, c.balance FROM users u LEFT JOIN credits c ON u.id = c.user_id WHERE u.oauth_email = 'admin@casenetai.kr';
```

### 3단계: 로그인
```
URL: https://casenetai.kr/login.html
이메일: admin@casenetai.kr
비밀번호: Admin2026!@#$
```

---

## 🔧 안 되면?

### 방법 A: 테이블 구조 확인
`CHECK_DB_SCHEMA.sql` 파일 실행 → 결과 확인

### 방법 B: 수동 수정
```sql
UPDATE users SET 
  password_hash = '$2b$12$PG6FlhGiMfrki66jR8jDy.Ir2cImvHpHnm8QBJ3p/Na11tSN5CrR2',
  is_approved = true,
  is_email_verified = true
WHERE oauth_email = 'admin@casenetai.kr';
```

### 방법 C: 브라우저 콘솔 확인
F12 → Console/Network 탭에서 에러 메시지 확인

---

## 📋 체크리스트
- [ ] Supabase SQL 실행 완료
- [ ] SELECT 결과에 계정 보임
- [ ] balance = 10000000 확인
- [ ] 로그인 시도
- [ ] ✅ 성공!

---

**문제 지속 시**: `URGENT_ADMIN_SETUP.md` 파일의 상세 가이드 참조
