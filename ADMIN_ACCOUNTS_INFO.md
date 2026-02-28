# 🔐 CaseNetAI 테스트 계정 정보

## 📋 관리자 및 개발자 계정

### 1️⃣ 시스템 관리자 계정
```
📧 이메일: admin@casenetai.kr
🔑 비밀번호: (Vercel 환경변수 ADMIN_PASSWORD 참조)
👤 이름: 시스템 관리자
🎭 역할: system_admin
```

### 2️⃣ 개발자 계정
```
📧 이메일: dev@casenetai.kr
🔑 비밀번호: (Vercel 환경변수 DEV_PASSWORD 참조)
👤 이름: 개발자
🎭 역할: system_admin
```

### 3️⃣ 테스트 사용자 계정
```
📧 이메일: test@casenetai.kr
🔑 비밀번호: (Vercel 환경변수 TEST_PASSWORD 참조)
👤 이름: 테스트 사용자
🎭 역할: user
```

---

## ⚠️ 보안 주의사항

- **비밀번호를 이 파일이나 코드에 절대 직접 작성하지 마세요**
- 모든 비밀번호는 Vercel 환경변수 또는 로컬 .env 파일에서만 관리
- 계정 생성 시: `ADMIN_PASSWORD=비밀번호 node create-test-admin.js`
- 첫 로그인 후 반드시 비밀번호 변경

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

## 📝 계정 생성 방법

### 환경변수로 비밀번호 전달하여 실행:
```bash
ADMIN_PASSWORD=안전한비밀번호 DEV_PASSWORD=안전한비밀번호 TEST_PASSWORD=안전한비밀번호 node create-test-admin.js
```

---

**작성일:** 2026-01-21
**작성자:** AI Developer
