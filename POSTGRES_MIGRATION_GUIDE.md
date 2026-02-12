# 🔄 PostgreSQL 마이그레이션 가이드

CaseNetAI를 SQLite에서 PostgreSQL (Supabase)로 마이그레이션하는 단계별 가이드입니다.

## 📋 마이그레이션 체크리스트

- [ ] 1. Supabase PostgreSQL 설정
- [ ] 2. 데이터베이스 스키마 생성
- [ ] 3. PostgreSQL 패키지 설치
- [ ] 4. 데이터베이스 연결 코드 수정
- [ ] 5. SQL 쿼리 문법 수정
- [ ] 6. 환경 변수 설정
- [ ] 7. 로컬 테스트
- [ ] 8. Vercel 배포
- [ ] 9. 도메인 연결
- [ ] 10. 프로덕션 테스트

---

## Step 1: Supabase PostgreSQL 설정

자세한 내용은 `SUPABASE_SETUP_GUIDE.md` 참조

### 요약
1. https://supabase.com 회원가입
2. 프로젝트 생성 (casenetai-production)
3. Region: Northeast Asia (Seoul)
4. Database Password 저장

---

## Step 2: 데이터베이스 스키마 생성

### 2.1 Supabase SQL Editor 접속
1. 좌측 메뉴 **"SQL Editor"** 클릭
2. **"+ New query"** 클릭

### 2.2 스키마 실행
`database/postgres-schema.sql` 파일 내용을 복사하여 실행

```bash
# 로컬에서 파일 확인
cat database/postgres-schema.sql
```

---

## Step 3: PostgreSQL 패키지 설치

```bash
# PostgreSQL 드라이버 설치
npm install pg

# 설치 확인
npm list pg
```

---

## Step 4: 데이터베이스 연결 코드 수정

### 4.1 기존 SQLite 코드 백업
```bash
cp database/db.js database/db-sqlite.js.backup
```

### 4.2 PostgreSQL 코드로 교체
```bash
cp database/db-postgres.js database/db.js
```

### 4.3 환경 변수 설정
`.env` 파일에 추가:

```bash
# PostgreSQL (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
```

---

## Step 5: SQL 쿼리 문법 수정

### 주요 변경 사항

| SQLite | PostgreSQL | 설명 |
|--------|------------|------|
| `?` | `$1, $2, $3` | 파라미터 placeholder |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Auto increment |
| `INTEGER` (boolean) | `BOOLEAN` | Boolean 타입 |
| `IFNULL(a, b)` | `COALESCE(a, b)` | NULL 처리 |
| `CAST(x AS INTEGER)` | `CAST(x AS INTEGER)` | 동일 (호환) |
| `datetime('now')` | `CURRENT_TIMESTAMP` | 현재 시간 |
| `strftime('%Y-%m-%d')` | `TO_CHAR(..., 'YYYY-MM-DD')` | 날짜 포맷 |

### 예시 1: INSERT 쿼리
```javascript
// SQLite (변경 전)
const result = await db.run(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  [name, email]
);
const userId = result.lastID;

// PostgreSQL (변경 후)
const result = await db.run(
  'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
  [name, email]
);
const userId = result.lastID;
```

### 예시 2: Boolean 값
```javascript
// SQLite (변경 전)
const result = await db.query(
  'SELECT * FROM users WHERE is_approved = ?',
  [1] // 0 또는 1
);

// PostgreSQL (변경 후)
const result = await db.query(
  'SELECT * FROM users WHERE is_approved = $1',
  [true] // true 또는 false
);
```

### 예시 3: LIMIT/OFFSET
```javascript
// 둘 다 동일
const result = await db.query(
  'SELECT * FROM users LIMIT $1 OFFSET $2',
  [limit, offset]
);
```

---

## Step 6: 수정이 필요한 파일 목록

다음 파일들의 SQL 쿼리를 확인하고 수정하세요:

### 우선순위 1 (필수)
- [ ] `database/db.js` ✅ (이미 완료)
- [ ] `routes/auth.js`
- [ ] `routes/admin.js`
- [ ] `routes/payment.js`
- [ ] `routes/system-admin.js`
- [ ] `routes/org-admin.js`
- [ ] `routes/join-requests.js`

### 우선순위 2 (서비스)
- [ ] `services/authService.js`
- [ ] `services/creditService.js`
- [ ] `services/paymentService.js`
- [ ] `services/usageTrackingService.js`
- [ ] `services/analyticsService.js`
- [ ] `services/feedbackService.js`

### 우선순위 3 (스크립트)
- [ ] `scripts/create-system-admin.js`
- [ ] `database/seed-organizations.js`

---

## Step 7: 연결 테스트

```bash
# PostgreSQL 연결 테스트
node database/test-postgres-connection.js
```

성공 메시지:
```
✅ PostgreSQL 연결 성공!
✅ 모든 테스트 통과!
```

---

## Step 8: 로컬 서버 테스트

```bash
# 서버 실행
npm start

# 브라우저에서 접속
# http://localhost:3000
```

### 테스트 항목
- [ ] 로그인 (소셜 로그인)
- [ ] 상담일지 생성
- [ ] 크레딧 조회
- [ ] 관리자 기능

---

## Step 9: Vercel 배포

### 9.1 Vercel CLI 설치 (선택사항)
```bash
npm i -g vercel
```

### 9.2 GitHub 연동 배포 (추천)

#### 방법 1: Vercel 대시보드에서 설정
1. https://vercel.com 로그인
2. **"Add New..." → "Project"** 클릭
3. GitHub 저장소 선택: `YUNHYEONJUN/casenetai`
4. **Root Directory**: `.` (루트)
5. **Build Command**: 비워두기 (Node.js 서버는 빌드 불필요)
6. **Output Directory**: 비워두기
7. **Install Command**: `npm install`

#### 방법 2: Vercel CLI로 배포
```bash
cd /home/user/webapp
vercel

# 프로덕션 배포
vercel --prod
```

### 9.3 환경 변수 설정 (Vercel Dashboard)
1. Project Settings → Environment Variables
2. 다음 변수 추가:

```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
OPENAI_API_KEY=sk-proj-...
GOOGLE_AI_API_KEY=...
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...
KAKAO_CALLBACK_URL=https://casenetai.com/api/auth/kakao/callback
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NAVER_CALLBACK_URL=https://casenetai.com/api/auth/naver/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://casenetai.com/api/auth/google/callback
JWT_SECRET=...
TOSS_CLIENT_KEY=...
TOSS_SECRET_KEY=...
```

⚠️ **중요**: 모든 환경 변수를 Production, Preview, Development에 추가하세요!

---

## Step 10: 도메인 연결

### 10.1 Vercel에 도메인 추가
1. Project Settings → Domains
2. **Add Domain** 클릭
3. `casenetai.com` 입력
4. DNS 설정 안내 확인

### 10.2 Cafe24 DNS 설정
1. Cafe24 로그인 → 도메인 관리
2. `casenetai.com` 선택 → DNS 설정
3. 다음 레코드 추가:

```
Type: A
Name: @
Value: 76.76.21.21 (Vercel IP)
TTL: 3600

Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 3600
```

### 10.3 DNS 전파 확인
```bash
# DNS 확인 (최대 48시간 소요)
nslookup casenetai.com

# 또는
dig casenetai.com
```

---

## Step 11: 프로덕션 테스트

### 11.1 기능 테스트
- [ ] https://casenetai.com 접속
- [ ] 소셜 로그인 (Kakao, Naver, Google)
- [ ] 상담일지 생성
- [ ] 익명화 기능
- [ ] 크레딧 충전
- [ ] 관리자 대시보드

### 11.2 성능 테스트
- [ ] 페이지 로딩 속도 (<3초)
- [ ] API 응답 시간 (<500ms)
- [ ] 대용량 파일 업로드 (50MB)

### 11.3 보안 테스트
- [ ] HTTPS 적용 확인
- [ ] 환경 변수 노출 확인
- [ ] SQL Injection 방어 확인

---

## 롤백 계획 (문제 발생 시)

### SQLite로 되돌리기
```bash
# 1. database/db.js 복구
cp database/db-sqlite.js.backup database/db.js

# 2. .env에서 DATABASE_URL 제거

# 3. 서버 재시작
npm start
```

---

## 자주 발생하는 문제 해결

### 문제 1: "Cannot find module 'pg'"
```bash
# 해결
npm install pg
```

### 문제 2: "$1 syntax error"
- **원인**: SQLite의 `?` placeholder를 PostgreSQL의 `$1, $2`로 변경하지 않음
- **해결**: 모든 쿼리에서 `?`를 `$1, $2, $3` 형식으로 변경

### 문제 3: "connection timeout"
- **원인**: Supabase 프로젝트가 일시정지됨 (무료 플랜)
- **해결**: Supabase Dashboard에서 프로젝트 재시작

### 문제 4: "lastID is undefined"
- **원인**: PostgreSQL은 `RETURNING id` 필요
- **해결**: INSERT 쿼리에 `RETURNING id` 추가

```sql
-- 잘못된 예
INSERT INTO users (name) VALUES ($1)

-- 올바른 예
INSERT INTO users (name) VALUES ($1) RETURNING id
```

---

## 성능 최적화 팁

### 1. Connection Pooling
이미 `db-postgres.js`에 구현되어 있음 (max: 20 connections)

### 2. 인덱스 최적화
```sql
-- 자주 검색되는 컬럼에 인덱스 추가
CREATE INDEX idx_users_email ON users(oauth_email);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
```

### 3. 쿼리 최적화
```sql
-- EXPLAIN을 사용하여 쿼리 분석
EXPLAIN ANALYZE SELECT * FROM users WHERE oauth_email = 'test@example.com';
```

---

## 다음 단계

✅ PostgreSQL 마이그레이션 완료!
✅ Vercel 배포 완료!
✅ 도메인 연결 완료!

이제 다음 작업을 진행할 수 있습니다:
- 📊 모니터링 설정 (Vercel Analytics)
- 🔐 보안 강화 (RLS, API Rate Limiting)
- 📈 성능 모니터링
- 💾 자동 백업 설정

---

## 참고 자료

- **PostgreSQL 문서**: https://www.postgresql.org/docs/
- **Supabase 문서**: https://supabase.com/docs
- **Vercel 문서**: https://vercel.com/docs
- **node-postgres (pg)**: https://node-postgres.com/

---

문제가 발생하면 이 가이드를 참조하거나 GitHub Issues에 문의하세요.
