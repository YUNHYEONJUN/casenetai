# 데이터베이스 마이그레이션 가이드

이 디렉토리에는 Supabase PostgreSQL 데이터베이스 마이그레이션 SQL 파일들이 있습니다.

---

## 📋 마이그레이션 목록

### `003_add_check_constraints.sql` - 크레딧 잔액 음수 방지
- **목적**: credits 테이블에 CHECK 제약 추가
- **내용**:
  - `balance >= 0` 제약 추가 (음수 잔액 방지)
  - `free_trial_count >= 0` 제약 추가
- **실행 시기**: 즉시 (HIGH 우선순위)

### `004_add_foreign_key_policies.sql` - 외래키 ON DELETE 정책
- **목적**: 외래키에 CASCADE/SET NULL 정책 추가
- **내용**:
  - 사용자 삭제 시 관련 데이터 자동 처리
  - 고아 레코드 방지
- **실행 시기**: 백업 후 실행 (MEDIUM 우선순위)

---

## 🚀 실행 방법

### 1. Supabase 대시보드 접속
```
https://supabase.com/dashboard
```

### 2. 프로젝트 선택
- **casenetai-production** 프로젝트 클릭

### 3. SQL Editor 열기
- 좌측 메뉴에서 **SQL Editor** 클릭

### 4. 마이그레이션 실행

#### ✅ **003_add_check_constraints.sql** 실행:
1. 새 쿼리 생성 (+ 버튼)
2. 파일 내용 복사 → 붙여넣기
3. **먼저 확인 쿼리 실행**:
   ```sql
   SELECT * FROM credits WHERE balance < 0 OR free_trial_count < 0;
   ```
4. 음수 잔액이 있으면 수정:
   ```sql
   UPDATE credits SET balance = 0 WHERE balance < 0;
   UPDATE credits SET free_trial_count = 0 WHERE free_trial_count < 0;
   ```
5. CHECK 제약 추가 쿼리 실행
6. 확인:
   ```sql
   SELECT constraint_name, check_clause
   FROM information_schema.check_constraints
   WHERE constraint_name IN ('positive_balance', 'positive_free_trial');
   ```

#### ⚠️ **004_add_foreign_key_policies.sql** 실행 (주의!):
1. **백업 먼저!**
   ```sql
   -- 중요 테이블 백업
   CREATE TABLE users_backup AS SELECT * FROM users;
   CREATE TABLE credits_backup AS SELECT * FROM credits;
   ```
2. 기존 외래키 확인 (파일 내 첫 번째 SELECT 실행)
3. 주석 처리된 ALTER TABLE 문을 **하나씩** 실행
4. 각 실행 후 확인:
   ```sql
   SELECT * FROM information_schema.table_constraints 
   WHERE constraint_type = 'FOREIGN KEY' 
     AND table_name = '테이블명';
   ```

---

## ⚠️ 주의사항

### CHECK 제약 추가 시:
- ✅ 기존 데이터에 음수 값이 없는지 먼저 확인
- ✅ 음수 값이 있으면 0으로 수정 후 제약 추가
- ❌ 음수 값이 있는 상태에서 제약 추가하면 실패

### 외래키 정책 변경 시:
- ✅ 반드시 백업 후 실행
- ✅ 프로덕션 환경에서는 유지보수 시간에 실행
- ✅ 한 번에 하나씩 실행하고 확인
- ❌ 여러 외래키를 동시에 변경하지 말 것

### ON DELETE CASCADE 정책:
- **의미**: 부모 레코드 삭제 시 자식 레코드도 자동 삭제
- **주의**: 복구 불가능! 실수로 사용자 삭제 시 모든 데이터 삭제됨
- **권장**: 중요 데이터는 **soft delete** (deleted_at 컬럼) 사용 고려

---

## 🔙 롤백 방법

### CHECK 제약 제거:
```sql
ALTER TABLE credits DROP CONSTRAINT positive_balance;
ALTER TABLE credits DROP CONSTRAINT positive_free_trial;
```

### 외래키 정책 원복:
```sql
-- 예시: credits 테이블 외래키 원복
ALTER TABLE credits DROP CONSTRAINT credits_user_id_fkey;
ALTER TABLE credits 
ADD CONSTRAINT credits_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id);
```

---

## 📊 마이그레이션 상태 확인

### 현재 적용된 CHECK 제약:
```sql
SELECT constraint_name, check_clause, table_name
FROM information_schema.check_constraints
WHERE table_schema = 'public'
ORDER BY table_name;
```

### 현재 외래키 정책:
```sql
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc 
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

---

## 📝 마이그레이션 이력

| 파일 | 실행일 | 상태 | 비고 |
|------|--------|------|------|
| 003_add_check_constraints.sql | - | ⏳ 대기 | Supabase에서 수동 실행 필요 |
| 004_add_foreign_key_policies.sql | - | ⏳ 대기 | 백업 후 실행 권장 |

---

**작성일**: 2026-02-28  
**작성자**: AI 코드 분석 기반 자동 생성  
**참고**: CaseNetAI_오류분석_보고서.md
