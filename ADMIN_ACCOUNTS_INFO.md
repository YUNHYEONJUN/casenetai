# 🔐 CaseNetAI 테스트 계정 정보

## 📋 관리자 및 개발자 계정

### 1️⃣ 시스템 관리자 계정
```
📧 이메일: admin@casenetai.kr
🔑 비밀번호: Admin2026!
👤 이름: 시스템 관리자
🎭 역할: system_admin
💰 크레딧: 10,000,000원
```

### 2️⃣ 개발자 계정
```
📧 이메일: dev@casenetai.kr
🔑 비밀번호: Dev2026!
👤 이름: 개발자
🎭 역할: system_admin
💰 크레딧: 10,000,000원
```

### 3️⃣ 테스트 사용자 계정
```
📧 이메일: test@casenetai.kr
🔑 비밀번호: Test2026!
👤 이름: 테스트 사용자
🎭 역할: user
💰 크레딧: 10,000,000원
```

---

## 🌐 로그인 방법

### **URL:**
```
https://casenetai.kr/login.html
```

### **로그인 단계:**
1. 위 URL 접속
2. 이메일과 비밀번호 입력
3. "로그인" 버튼 클릭
4. ✅ 대시보드로 이동

---

## 🚨 현재 상태

**⚠️ Supabase 데이터베이스 연결 문제로 인해 계정이 생성되지 않았습니다.**

### **해결 방법:**

#### **방법 1: 회원가입 페이지 사용 (권장)**

1. https://casenetai.kr/register.html 접속
2. 위 정보로 회원가입
3. 이메일 인증 (자동 승인 예정)
4. 로그인 후 사용

#### **방법 2: Supabase 대시보드에서 직접 생성**

1. Supabase 대시보드 접속
2. SQL Editor 사용
3. 아래 SQL 실행:

```sql
-- 관리자 계정 생성 (비밀번호: Admin2026!)
INSERT INTO users (
  email, 
  password_hash, 
  name, 
  role, 
  is_email_verified, 
  is_approved,
  created_at, 
  updated_at
) VALUES (
  'admin@casenetai.kr',
  '$2b$10$YourHashedPasswordHere', -- bcrypt hash 필요
  '시스템 관리자',
  'system_admin',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) RETURNING id;

-- 크레딧 추가 (user_id는 위에서 반환된 id 사용)
INSERT INTO credits (
  user_id, 
  balance, 
  total_purchased, 
  total_used, 
  free_trial_count, 
  updated_at
) VALUES (
  1, -- user_id
  10000000,
  0,
  0,
  0,
  CURRENT_TIMESTAMP
);
```

---

## 🔒 비밀번호 해시 생성 (Node.js)

```javascript
const bcrypt = require('bcrypt');

// Admin2026! 해시 생성
bcrypt.hash('Admin2026!', 10, (err, hash) => {
  console.log(hash);
});

// Dev2026! 해시 생성
bcrypt.hash('Dev2026!', 10, (err, hash) => {
  console.log(hash);
});

// Test2026! 해시 생성
bcrypt.hash('Test2026!', 10, (err, hash) => {
  console.log(hash);
});
```

---

## 📝 참고 사항

- **보안:** 첫 로그인 후 비밀번호 변경 권장
- **권한:** system_admin은 모든 기능 접근 가능
- **크레딧:** 10,000,000원으로 충분한 테스트 가능
- **승인:** is_approved = true로 즉시 사용 가능

---

**작성일:** 2026-01-21
**작성자:** AI Developer
