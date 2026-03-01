# 🚨 긴급 보안 조치 필요

## ⚠️ 발견된 보안 문제

다음 파일에서 민감한 자격증명이 노출되었습니다:

### 1. `test-db.js` (Line 4)
```javascript
connectionString: 'postgresql://postgres.lsrfzqgvtaxjqnhtzebz:QygHI7sKcKIKTvJb@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres'
```
- **DB 비밀번호**: `QygHI7sKcKIKTvJb`
- **DB 호스트**: `aws-1-ap-northeast-2.pooler.supabase.com`
- **DB 사용자**: `postgres.lsrfzqgvtaxjqnhtzebz`

### 2. `ADMIN_SETUP_GUIDE.md` (Line 32)
```
마스터 비밀번호: CaseNetAI2026!@#
```

---

## 🔴 즉시 수행 (5분 내)

### 1️⃣ Supabase 데이터베이스 비밀번호 재설정

1. **Supabase 대시보드 접속**: https://supabase.com/dashboard
2. **프로젝트 선택** → Settings → Database
3. **"Reset database password" 클릭**
4. **새 비밀번호 복사** (최소 16자 이상 강력한 비밀번호)
5. **새 `DATABASE_URL` 생성**:
   ```
   postgresql://postgres.lsrfzqgvtaxjqnhtzebz:[새비밀번호]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
   ```

### 2️⃣ Vercel 환경 변수 업데이트

1. **Vercel 대시보드**: https://vercel.com/dashboard
2. CaseNetAI 프로젝트 → **Settings** → **Environment Variables**
3. `DATABASE_URL` 찾기 → **Edit** 클릭
4. 새 DATABASE_URL로 교체
5. **Save** 클릭
6. **Redeploy** (또는 다음 배포 시 자동 반영)

### 3️⃣ 로컬 .env 파일 업데이트

```bash
# /home/user/webapp/.env 파일 수정
DATABASE_URL=postgresql://postgres.lsrfzqgvtaxjqnhtzebz:[새비밀번호]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
```

### 4️⃣ 마스터 비밀번호 변경

1. **Vercel 환경 변수에 새 마스터 비밀번호 추가**:
   ```
   MASTER_PASSWORD=[새로운강력한비밀번호]
   ```
   
2. **로컬 .env 파일에도 추가**:
   ```bash
   MASTER_PASSWORD=[새로운강력한비밀번호]
   ```

---

## 🟡 긴급 (1시간 내)

### 5️⃣ Git 히스토리에서 민감 정보 제거

```bash
# git-filter-repo 설치 (권장)
pip install git-filter-repo

# 민감한 파일 히스토리에서 제거
git filter-repo --path test-db.js --invert-paths
git filter-repo --path ADMIN_SETUP_GUIDE.md --invert-paths

# 강제 푸시 (주의: 협업 중인 경우 팀원과 조율 필요)
git push origin main --force
```

**또는** BFG Repo-Cleaner 사용:
```bash
# BFG 다운로드
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 비밀번호 텍스트 제거
echo "QygHI7sKcKIKTvJb" > passwords.txt
echo "CaseNetAI2026!@#" >> passwords.txt
java -jar bfg-1.14.0.jar --replace-text passwords.txt

# Git 정리 및 푸시
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin main --force
```

---

## 🟢 후속 조치 (24시간 내)

### 6️⃣ 파일 수정 및 재커밋

**test-db.js 수정**:
```javascript
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL 연결 성공!');
    
    const result = await client.query('SELECT NOW()');
    console.log('⏰ 현재 시간:', result.rows[0].now);
    
    const users = await client.query('SELECT COUNT(*) FROM users');
    console.log('👥 Users 테이블 레코드 수:', users.rows[0].count);
    
    client.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error.message);
    process.exit(1);
  }
}

testConnection();
```

**ADMIN_SETUP_GUIDE.md 수정**:
```markdown
## 🛡️ 마스터 비밀번호

**마스터 비밀번호**: 환경 변수 `MASTER_PASSWORD`로 설정

⚠️ **보안 주의사항**:
- 이 비밀번호는 절대 코드나 문서에 기록하지 마세요
- `.env` 파일과 Vercel 환경 변수에만 설정하세요
- `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다
```

### 7️⃣ .gitignore 검증

```bash
# .gitignore에 다음 항목 확인
.env
.env.local
.env.production
test-db.js
test-db-new.js
```

### 8️⃣ 관리자 계정 비밀번호 재설정

```bash
# 새 환경 변수로 관리자 계정 재생성
ADMIN_PASSWORD="[새로운강력한비밀번호]" \
DEV_PASSWORD="[새로운강력한비밀번호]" \
TEST_PASSWORD="[새로운강력한비밀번호]" \
node create-test-admin.js
```

---

## ✅ 확인 체크리스트

- [ ] Supabase DB 비밀번호 재설정 완료
- [ ] Vercel DATABASE_URL 업데이트 완료
- [ ] 로컬 .env DATABASE_URL 업데이트 완료
- [ ] Vercel MASTER_PASSWORD 설정 완료
- [ ] 로컬 .env MASTER_PASSWORD 설정 완료
- [ ] Git 히스토리에서 민감 정보 제거 완료
- [ ] test-db.js 환경 변수로 수정 완료
- [ ] ADMIN_SETUP_GUIDE.md 수정 완료
- [ ] .gitignore 검증 완료
- [ ] 관리자 계정 비밀번호 재설정 완료
- [ ] Vercel 재배포 완료
- [ ] 데이터베이스 연결 테스트 완료
- [ ] 로그인 테스트 완료

---

## 📞 추가 지원

문제가 발생하면 다음 명령으로 연결 테스트:

```bash
# 새 DATABASE_URL로 연결 테스트
node test-db.js

# 관리자 계정 확인
node check-db.js
```

---

**작성일**: 2026-03-01  
**우선순위**: 🚨 CRITICAL  
**예상 소요 시간**: 15-30분 (Git 히스토리 정리 제외)
