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
https://casenetai.kr/login.html
```

**📧 이메일:** 환경 변수 `ADMIN_EMAIL` 참조  
**🔑 비밀번호:** 환경 변수 `ADMIN_PASSWORD` 참조  
**💰 초기 크레딧:** 1,000,000원

> ⚠️ 비밀번호는 절대 이 문서에 기록하지 않습니다. `.env` 파일을 확인하세요.

---

## 🚀 로그인 방법

### 1️⃣ 웹사이트 접속
브라우저에서 아래 URL로 접속:
```
https://casenetai.kr
```

### 2️⃣ 로그인 페이지 이동
- 메인 페이지에서 **"로그인"** 버튼 클릭
- 또는 직접 `/login.html`로 접속

### 3️⃣ 관리자 계정으로 로그인
```
이메일: (환경 변수 ADMIN_EMAIL 참조)
비밀번호: (환경 변수 ADMIN_PASSWORD 참조)
```

### 4️⃣ 로그인 성공
- 대시보드 또는 서비스 페이지로 이동
- 관리자 권한으로 모든 기능 사용 가능

---

## 🔧 관리자 계정 생성/재생성

### PostgreSQL (프로덕션)
```bash
ADMIN_EMAIL=admin@casenetai.kr \
ADMIN_PASSWORD=YourSecurePass! \
node create-admin-postgres.js
```

### SQLite (로컬 개발)
```bash
ADMIN_EMAIL=admin@casenetai.kr \
ADMIN_PASSWORD=YourSecurePass! \
node create-admin.js
```

실행 결과 (비밀번호 마스킹됨):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 관리자 계정 생성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 데이터베이스 연결 성공
✅ 비밀번호 해싱 완료 (bcrypt salt rounds: 12)
✅ 관리자 계정 생성 완료
   이메일: admin@casenetai.kr
   비밀번호: ********** (보안상 표시 안 함)
   이름: System Admin
   권한: system_admin

✅ 관리자 크레딧 생성 완료
   잔액: 1,000,000원
```

---

## 🎯 관리자 기능 (현재 구현된 기능)

### ✅ 사용 가능한 기능
1. **상담일지 자동 생성** — 음성 파일 → STT → AI 분석 → 상담일지 → TXT 다운로드
2. **크레딧 관리** — 잔액 확인, 사용 내역, 토스페이먼츠 충전
3. **판례 검색** — 법률 판례 검색, 북마크, 관련 판례 추천
4. **무제한 크레딧** — 관리자는 초기 100만원 크레딧 보유

### 🔄 추가 개발 예정
- 관리자 대시보드 (사용자/기관 관리)
- 통계 및 리포트
- 시스템 설정 관리

---

## 🔐 보안 권장사항

### ⚠️ 중요!
관리자 비밀번호는 반드시 환경 변수로만 관리합니다.

### 운영 환경 배포 전 필수 작업:
1. **강력한 비밀번호 설정** (환경 변수 `ADMIN_PASSWORD`)
   - 최소 12자 이상
   - 대문자, 소문자, 숫자, 특수문자 포함
   - 정기적 변경 (3개월마다 권장)

2. **Git 히스토리 정리**
   ```bash
   # BFG Repo-Cleaner로 과거 커밋의 비밀번호 제거
   bfg --replace-text passwords.txt
   ```

3. **Supabase DB 비밀번호 변경**
   - Settings → Database → Reset database password

4. **2단계 인증 추가** (향후 구현 예정)

---

## 📊 데이터베이스 스키마 (users 테이블 — PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(100),
  phone VARCHAR(20),
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(50) DEFAULT 'user',
  is_email_verified BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);
```

---

## 🆘 문제 해결

### Q: 로그인이 안 돼요
**A:** 관리자 계정을 재생성하세요:
```bash
ADMIN_EMAIL=admin@casenetai.kr ADMIN_PASSWORD=YourPass! node create-admin-postgres.js
```

### Q: 비밀번호를 잊어버렸어요
**A:** 관리자 계정을 재생성하면 새 비밀번호로 설정됩니다.

### Q: 크레딧이 부족해요
**A:** 관리자 계정을 재생성하면 100만원 크레딧이 다시 충전됩니다.

---

## ✅ 체크리스트

관리자 계정 설정 완료 확인:

- [ ] .env 파일에 ADMIN_EMAIL, ADMIN_PASSWORD 설정
- [ ] 관리자 계정 생성 (node create-admin-postgres.js)
- [ ] 실제 로그인 테스트
- [ ] TXT 다운로드 기능 테스트
- [ ] Git 히스토리에서 과거 비밀번호 제거

---

**마지막 업데이트**: 2026-03-01  
**버전**: 2.0.0
