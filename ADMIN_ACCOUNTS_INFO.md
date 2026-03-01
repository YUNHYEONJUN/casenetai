# 🔐 CaseNetAI 테스트 계정 정보

> ⚠️ **보안 경고**: 비밀번호는 절대 이 문서에 기록하지 않습니다.
> 모든 비밀번호는 `.env` 파일 또는 Vercel 환경 변수에서 관리합니다.

## 📋 관리자 및 개발자 계정

### 1️⃣ 시스템 관리자 계정
```
📧 이메일: (환경 변수 ADMIN_EMAIL 참조)
🔑 비밀번호: (환경 변수 ADMIN_PASSWORD 참조)
👤 이름: 시스템 관리자
🎭 역할: system_admin
💰 크레딧: 10,000,000원
```

### 2️⃣ 개발자 계정
```
📧 이메일: (환경 변수 DEV_EMAIL 참조)
🔑 비밀번호: (환경 변수 DEV_PASSWORD 참조)
👤 이름: 개발자
🎭 역할: system_admin
💰 크레딧: 10,000,000원
```

### 3️⃣ 테스트 사용자 계정
```
📧 이메일: (환경 변수 TEST_EMAIL 참조)
🔑 비밀번호: (환경 변수 TEST_PASSWORD 참조)
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

## 🔧 계정 생성 방법

### **방법 1: 스크립트 사용 (권장)**

```bash
# .env 파일에 비밀번호 설정 후 실행
ADMIN_PASSWORD=YourSecurePass! \
DEV_PASSWORD=YourDevPass! \
TEST_PASSWORD=YourTestPass! \
node create-test-admin.js
```

### **방법 2: 개별 관리자 생성**

```bash
ADMIN_EMAIL=admin@casenetai.kr \
ADMIN_PASSWORD=YourSecurePass! \
node create-admin-postgres.js
```

### **방법 3: Supabase SQL Editor**

```sql
-- 비밀번호 해시는 Node.js에서 생성 후 사용
-- node -e "require('bcrypt').hash('YourPass', 12, (e,h)=>console.log(h))"

INSERT INTO users (
  email, password_hash, name, role, 
  is_email_verified, is_approved,
  created_at, updated_at
) VALUES (
  'admin@casenetai.kr',
  '$2b$12$[bcrypt_hash_here]',
  '시스템 관리자',
  'system_admin',
  true, true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) RETURNING id;
```

---

## 🔒 비밀번호 해시 생성 방법

```bash
# Node.js 명령어로 bcrypt 해시 생성
node -e "const b=require('bcrypt'); b.hash(process.env.ADMIN_PASSWORD, 12, (e,h)=>console.log(h))"
```

---

## 📝 참고 사항

- **보안:** 첫 로그인 후 비밀번호 변경 권장
- **권한:** system_admin은 모든 기능 접근 가능
- **크레딧:** 10,000,000원으로 충분한 테스트 가능
- **승인:** is_approved = true로 즉시 사용 가능

---

## ⚠️ 필수 환경 변수 (.env)

```env
# 관리자 계정
ADMIN_EMAIL=admin@casenetai.kr
ADMIN_PASSWORD=(보안상 여기에 기록하지 않음)

# 개발자 계정
DEV_EMAIL=dev@casenetai.kr
DEV_PASSWORD=(보안상 여기에 기록하지 않음)

# 테스트 계정
TEST_EMAIL=test@casenetai.kr
TEST_PASSWORD=(보안상 여기에 기록하지 않음)
```

---

**마지막 업데이트:** 2026-03-01
**작성자:** AI Developer
