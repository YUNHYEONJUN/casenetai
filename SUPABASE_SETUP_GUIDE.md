# 🚀 Supabase PostgreSQL 설정 가이드

CaseNetAI를 Vercel에 배포하기 위한 Supabase PostgreSQL 데이터베이스 설정 가이드입니다.

## 📋 목차
1. [Supabase 계정 생성 및 프로젝트 생성](#1-supabase-계정-생성-및-프로젝트-생성)
2. [데이터베이스 스키마 생성](#2-데이터베이스-스키마-생성)
3. [연결 정보 확인](#3-연결-정보-확인)
4. [환경 변수 설정](#4-환경-변수-설정)

---

## 1. Supabase 계정 생성 및 프로젝트 생성

### 1.1 Supabase 회원가입
1. **Supabase 접속**: https://supabase.com
2. **Sign Up** 클릭 → GitHub 계정으로 로그인 (추천)
3. 이메일 인증 완료

### 1.2 프로젝트 생성
1. **"New project"** 클릭
2. 프로젝트 설정:
   - **Name**: `casenetai-production`
   - **Database Password**: 강력한 비밀번호 생성 (자동 생성 추천)
     - ⚠️ **비밀번호 반드시 복사해서 저장!** (다시 확인 불가)
   - **Region**: `Northeast Asia (Seoul)` 선택 (한국 사용자 위해)
   - **Pricing Plan**: `Free` (무료 플랜으로 충분)
3. **Create new project** 클릭
4. 프로젝트 생성 대기 (약 2분 소요)

---

## 2. 데이터베이스 스키마 생성

### 2.1 SQL Editor 접속
1. 좌측 메뉴에서 **"SQL Editor"** 클릭
2. **"+ New query"** 클릭

### 2.2 스키마 실행
1. 아래 전체 SQL을 복사하여 SQL Editor에 붙여넣기
2. **"Run"** (또는 Ctrl/Cmd + Enter) 실행
3. 성공 메시지 확인: `Success. No rows returned`

```sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CaseNetAI PostgreSQL Schema
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 파일은 database/postgres-schema.sql 참조
```

### 2.3 스키마 생성 확인
1. 좌측 메뉴 **"Table Editor"** 클릭
2. 다음 테이블들이 보이는지 확인:
   - ✅ users
   - ✅ organizations
   - ✅ organization_join_requests
   - ✅ audit_logs
   - ✅ credits
   - ✅ transactions
   - ✅ payments
   - ✅ usage_logs
   - ✅ sessions
   - ✅ bookmarked_cases

---

## 3. 연결 정보 확인

### 3.1 Connection String 확인
1. 좌측 메뉴에서 **"Settings"** (톱니바퀴 아이콘) 클릭
2. **"Database"** 클릭
3. **"Connection string"** 섹션에서 **"URI"** 선택
4. **Connection string** 복사 (예시):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnop.supabase.co:5432/postgres
   ```

### 3.2 환경 변수 형식으로 변환
위 Connection String을 다음과 같이 분리합니다:

```bash
# Supabase PostgreSQL 연결 정보
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnop.supabase.co:5432/postgres

# 또는 분리된 형식
POSTGRES_HOST=db.abcdefghijklmnop.supabase.co
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=[YOUR-PASSWORD]
```

⚠️ **중요**: `[YOUR-PASSWORD]` 부분을 프로젝트 생성 시 설정한 실제 비밀번호로 교체하세요!

---

## 4. 환경 변수 설정

### 4.1 로컬 개발 환경 (.env)
프로젝트 루트의 `.env` 파일에 추가:

```bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database Configuration (PostgreSQL)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnop.supabase.co:5432/postgres

# 또는
POSTGRES_HOST=db.abcdefghijklmnop.supabase.co
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=[YOUR-PASSWORD]
```

### 4.2 Vercel 환경 변수
Vercel 배포 시 환경 변수 설정:

1. Vercel 대시보드 → 프로젝트 선택
2. **Settings** → **Environment Variables**
3. 다음 변수 추가:
   - **Name**: `DATABASE_URL`
   - **Value**: `postgresql://postgres:[YOUR-PASSWORD]@...`
   - **Environments**: `Production`, `Preview`, `Development` 모두 체크
4. **Save** 클릭

---

## 5. 연결 테스트

### 5.1 로컬 테스트
```bash
# PostgreSQL 라이브러리 설치
npm install pg

# 서버 실행
npm start

# 브라우저에서 접속
# http://localhost:3000
```

### 5.2 테스트 스크립트 실행
```bash
node database/test-postgres-connection.js
```

성공 메시지:
```
✅ PostgreSQL 연결 성공!
✅ Database: postgres
✅ Version: PostgreSQL 15.x
```

---

## 6. 보안 설정 (선택사항)

### 6.1 Row Level Security (RLS) 비활성화
개발 초기에는 RLS를 비활성화하고, 나중에 활성화하세요.

SQL Editor에서 실행:
```sql
-- 모든 테이블에 대해 RLS 비활성화
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarked_cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_join_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
```

⚠️ **프로덕션 환경에서는 RLS를 활성화하고 정책을 설정하는 것이 권장됩니다.**

---

## 7. 자주 발생하는 문제 해결

### 문제 1: "password authentication failed"
- **원인**: 비밀번호가 잘못되었거나 Connection String이 잘못됨
- **해결**: Supabase 대시보드에서 Database Password 재설정
  1. Settings → Database → Database Settings
  2. "Reset database password" 클릭
  3. 새 비밀번호로 `DATABASE_URL` 업데이트

### 문제 2: "connection timeout"
- **원인**: 방화벽 또는 네트워크 문제
- **해결**: 
  1. Supabase 프로젝트가 `Paused` 상태인지 확인 (무료 플랜은 1주일 미사용 시 자동 일시정지)
  2. 프로젝트 재시작: Settings → General → "Resume project"

### 문제 3: "too many connections"
- **원인**: 연결 풀 설정 문제
- **해결**: Connection Pooling 사용
  ```
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:6543/postgres?pgbouncer=true
  ```
  (포트를 5432 → 6543으로 변경)

---

## 8. 다음 단계

✅ Supabase PostgreSQL 설정 완료!

다음 작업:
1. ✅ 데이터베이스 연결 코드 수정 (`database/db.js`)
2. ✅ SQL 쿼리 문법 차이 수정
3. ✅ Vercel 배포 설정
4. ✅ 도메인 연결

---

## 📞 지원

- **Supabase 문서**: https://supabase.com/docs
- **PostgreSQL 문서**: https://www.postgresql.org/docs/
- **Vercel 문서**: https://vercel.com/docs

문제가 발생하면 위 문서를 참조하거나, Supabase Discord/GitHub에 문의하세요.
