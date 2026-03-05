# 🔐 관리자 계정 가이드

## 📋 관리자 계정 정보

CaseNetAI는 3가지 권한 레벨을 지원합니다:

### 권한 구조
```
1. system_admin (시스템 관리자)
   - 전체 시스템 관리 권한
   - 모든 기관 및 사용자 관리
   - 시스템 설정 변경

2. org_admin (기관 관리자)
   - 소속 기관 내 사용자 관리
   - 기관 설정 관리
   - 소속 기관 데이터 관리

3. user (일반 사용자)
   - 상담일지 생성 기능
   - 개인 크레딧 관리
   - 판례 검색 및 북마크
```

---

## 👤 기본 관리자 계정

### 로그인 정보

**🌐 로그인 URL:**
```
https://3000-ixy5t1tdycwtc8cmz10wu-18e660f9.sandbox.novita.ai/login.html
```

**📧 이메일:**
```
admin@casenetai.com
```

**🔑 비밀번호:**
```
admin123
```

**💰 초기 크레딧:**
```
1,000,000원
```

---

## 🚀 로그인 방법

### 1️⃣ 웹사이트 접속
브라우저에서 아래 URL로 접속:
```
https://3000-ixy5t1tdycwtc8cmz10wu-18e660f9.sandbox.novita.ai
```

### 2️⃣ 로그인 페이지 이동
- 메인 페이지에서 **"로그인"** 버튼 클릭
- 또는 직접 `/login.html`로 접속

### 3️⃣ 관리자 계정으로 로그인
```
이메일: admin@casenetai.com
비밀번호: admin123
```

### 4️⃣ 로그인 성공
- 대시보드 또는 서비스 페이지로 이동
- 관리자 권한으로 모든 기능 사용 가능

---

## 🔧 관리자 계정 재생성

관리자 계정이 필요하거나 비밀번호를 초기화하려면:

```bash
cd /home/user/webapp
node create-admin.js
```

실행 결과:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 관리자 계정 생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 데이터베이스 연결 성공
✅ 비밀번호 해싱 완료
✅ 관리자 계정 생성 완료
   ID: 3
   이메일: admin@casenetai.com
   비밀번호: admin123
   이름: System Admin
   권한: system_admin

✅ 관리자 크레딧 생성 완료
   잔액: 1,000,000원
```

---

## 🎯 관리자 기능 (현재 구현된 기능)

### ✅ 사용 가능한 기능
1. **상담일지 자동 생성**
   - 음성 파일 업로드
   - STT → AI 분석 → 상담일지 생성
   - TXT 파일로 다운로드

2. **크레딧 관리**
   - 잔액 확인
   - 사용 내역 조회
   - 크레딧 충전 (토스페이먼츠)

3. **판례 검색**
   - 법률 판례 검색
   - 북마크 저장
   - 관련 판례 추천

4. **무제한 크레딧**
   - 관리자는 초기 100만원 크레딧 보유
   - 테스트 및 관리 목적으로 충분한 잔액

### 🔄 추가 개발 예정
- 관리자 대시보드 (사용자/기관 관리)
- 통계 및 리포트
- 시스템 설정 관리
- 사용자 권한 관리

---

## 🧪 테스트 시나리오

### 관리자로 TXT 다운로드 테스트

1. **로그인**
   ```
   https://3000-ixy5t1tdycwtc8cmz10wu-18e660f9.sandbox.novita.ai/login.html
   
   이메일: admin@casenetai.com
   비밀번호: admin123
   ```

2. **노인보호전문기관 서비스 선택**
   - 로그인 후 자동으로 서비스 선택 페이지로 이동
   - "노인보호전문기관" 카드 클릭

3. **음성 파일 업로드 및 처리**
   - 상담 유형 선택 (전화상담/방문상담/내방상담)
   - 음성 파일 업로드 (MP3, WAV, M4A 등)
   - "✅ 상담일지 생성하기" 버튼 클릭

4. **TXT 파일 다운로드** ⭐
   - 결과 화면에서 "📥 TXT 다운로드" 버튼 클릭
   - 즉시 TXT 파일 다운로드 (서버 대기 없음)
   - 메모장으로 열어서 확인

5. **결과 확인**
   - 한글 정상 표시
   - 구분선(━━━) 정상 표시
   - 섹션 제목(■) 정상 표시
   - Gem 지침과 동일한 깔끔한 형식

---

## 🔐 보안 권장사항

### ⚠️ 중요!
현재 관리자 비밀번호(`admin123`)는 **테스트용**입니다.

### 운영 환경 배포 전 필수 작업:
1. **비밀번호 변경**
   ```bash
   # create-admin.js 파일 수정
   const adminPassword = 'YOUR_SECURE_PASSWORD_HERE';
   
   # 관리자 계정 재생성
   node create-admin.js
   ```

2. **이메일 변경** (선택사항)
   ```bash
   # create-admin.js 파일 수정
   const adminEmail = 'your-admin@yourdomain.com';
   ```

3. **비밀번호 정책 적용**
   - 최소 12자 이상
   - 대문자, 소문자, 숫자, 특수문자 포함
   - 정기적 변경 (3개월마다 권장)

4. **2단계 인증 추가** (향후 구현 예정)
   - SMS/이메일 인증
   - OTP(Google Authenticator)
   - 생체 인증

---

## 📊 데이터베이스 스키마 (users 테이블)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  organization_id INTEGER,
  role TEXT DEFAULT 'user',              -- 'user', 'org_admin', 'system_admin'
  is_email_verified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

---

## 📝 관련 파일

1. **create-admin.js** - 관리자 계정 생성 스크립트
2. **database/schema.sql** - 데이터베이스 스키마
3. **database/casenetai.db** - SQLite 데이터베이스 파일
4. **routes/auth.js** - 인증 라우터
5. **middleware/auth.js** - 인증 미들웨어

---

## 🆘 문제 해결

### Q: 로그인이 안 돼요
**A:** 관리자 계정을 재생성하세요:
```bash
cd /home/user/webapp
node create-admin.js
```

### Q: 비밀번호를 잊어버렸어요
**A:** 관리자 계정을 재생성하면 비밀번호가 초기화됩니다:
```bash
node create-admin.js
```

### Q: 데이터베이스가 없다고 나와요
**A:** 데이터베이스를 초기화하세요:
```bash
cd /home/user/webapp/database
node init.js
cd ..
node create-admin.js
```

### Q: 크레딧이 부족해요
**A:** 관리자 계정을 재생성하면 100만원 크레딧이 다시 충전됩니다.

---

## 📞 문의

**개발자**: WellPartners  
**이메일**: contact@wellpartners.ai  
**웹사이트**: https://casenetai.com

---

## ✅ 체크리스트

관리자 계정 설정 완료 확인:

- [x] 관리자 계정 생성 (`node create-admin.js`)
- [x] 로그인 정보 확인 (`admin@casenetai.com / admin123`)
- [x] 초기 크레딧 확인 (1,000,000원)
- [ ] 실제 로그인 테스트
- [ ] TXT 다운로드 기능 테스트
- [ ] 운영 환경용 강력한 비밀번호 설정 (배포 전)

---

**마지막 업데이트**: 2025-12-05  
**버전**: 1.0.0
