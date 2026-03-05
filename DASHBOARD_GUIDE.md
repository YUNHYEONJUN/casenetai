# 📊 System Admin Dashboard 가이드

## 개요

System Admin Dashboard는 CaseNetAI 시스템의 전체 사용 현황을 실시간으로 모니터링하고 관리할 수 있는 종합 관리 대시보드입니다.

---

## 🎯 주요 기능

### 1. **전체 시스템 통계 (Overview)**
- 전체 기관 통계 (총 기관 수, 활성 기관, 전체 기관)
- 전체 사용자 통계 (총 사용자, 역할별 분포, 승인 상태)
- 이번 달 사용량 (할당 시간, 사용 시간, 사용률)
- 크레딧 통계 (총 잔액, 총 사용액, 총 구매액)
- 결제 통계 (이번 달 매출, 성공 결제 건수)
- 최근 7일 활동 (활성 사용자, 익명화 건수)

### 2. **기관별 사용 현황**
- 기관별 월간 사용량 조회
- 사용률 시각화 (Progress Bar)
- 할당량 초과 경고
- 소속 사용자 수
- 기관별 정렬 및 필터링

### 3. **계정별 사용 현황**
- 전체 사용자 목록
- 크레딧 잔액 및 사용 내역
- 익명화 사용 통계
- 소속 기관 정보
- 역할 및 승인 상태

### 4. **최근 활동 로그**
- 최근 익명화 활동 (파일명, 처리 시간, 사용자)
- 최근 결제 내역 (금액, 상태, 결제 수단)
- 최근 가입 요청
- 최근 로그인 사용자

### 5. **실시간 데이터 갱신**
- 5분마다 자동 갱신
- 수동 새로고침 버튼
- 실시간 상태 업데이트

---

## 🚀 접속 방법

### 1. URL
```
https://yourdomain.com/admin-dashboard.html
```

### 2. 인증 요구사항
- **System Admin 권한 필수**
- JWT 토큰 (localStorage에 저장)
- 토큰 만료 시 자동 로그인 페이지 이동

### 3. 권한 확인
```javascript
// JWT 토큰에 role 확인
{
  "userId": 1,
  "email": "admin@casenetai.com",
  "role": "system_admin",  // ← 필수
  "iat": 1702123456,
  "exp": 1702209856
}
```

---

## 📡 API 엔드포인트

### Base URL
```
/api/system-admin-dashboard
```

### 1. 전체 시스템 통계
```
GET /api/system-admin-dashboard/overview

Response:
{
  "success": true,
  "data": {
    "timestamp": "2025-12-10T12:00:00.000Z",
    "period": { "year": 2025, "month": 12 },
    "organizations": {
      "total": 39,
      "active": 35,
      "alive": 39
    },
    "users": {
      "total": 150,
      "system_admins": 1,
      "org_admins": 39,
      "regular_users": 110,
      "approved": 140,
      "pending": 10
    },
    "usage": {
      "total_quota_hours": 390.0,
      "total_used_hours": 245.5,
      "total_remaining_hours": 144.5,
      "total_requests": 1250,
      "organizations_with_usage": 35,
      "usage_percentage": "62.95"
    },
    "credits": {
      "total_balance": 5000000,
      "total_purchased": 10000000,
      "total_used": 5000000,
      "total_bonus": 500000,
      "avg_balance": 33333
    },
    "payments": {
      "total_payments": 50,
      "successful_payments": 48,
      "total_revenue": 5000000,
      "avg_payment_amount": 104166
    },
    "recent_activity": {
      "active_users_7d": 80,
      "total_logs_7d": 350
    }
  }
}
```

### 2. 기관별 사용 현황
```
GET /api/system-admin-dashboard/organizations/usage?year=2025&month=12&page=1&limit=20&sort=used_hours&order=DESC

Parameters:
- year: 연도 (기본값: 현재 연도)
- month: 월 (기본값: 현재 월)
- page: 페이지 번호 (기본값: 1)
- limit: 페이지당 항목 수 (기본값: 20)
- sort: 정렬 기준 (used_hours, remaining_hours, request_count, name)
- order: 정렬 순서 (ASC, DESC)

Response:
{
  "success": true,
  "data": {
    "period": { "year": 2025, "month": 12 },
    "organizations": [
      {
        "id": 1,
        "name": "서울시청 노인복지과",
        "region": "서울",
        "plan_type": "enterprise",
        "subscription_status": "active",
        "quota_hours": 10.0,
        "used_hours": 8.5,
        "remaining_hours": 1.5,
        "request_count": 45,
        "user_count": 10,
        "approved_user_count": 9,
        "total_anonymizations": 120,
        "usage_percentage": "85.00",
        "is_quota_exceeded": false,
        "is_high_usage": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 39,
      "totalPages": 2
    }
  }
}
```

### 3. 특정 기관 상세 사용 현황
```
GET /api/system-admin-dashboard/organizations/:id/usage?year=2025&month=12

Response:
{
  "success": true,
  "data": {
    "organization": { /* 기관 정보 */ },
    "current_period": {
      "year": 2025,
      "month": 12,
      "quota": {
        "quota_hours": 10.0,
        "used_hours": 8.5,
        "remaining_hours": 1.5,
        "request_count": 45
      }
    },
    "users": {
      "total": 10,
      "list": [ /* 사용자 목록 */ ]
    },
    "recent_logs": [ /* 최근 익명화 로그 */ ],
    "trends": [ /* 월별 사용 트렌드 (최근 6개월) */ ]
  }
}
```

### 4. 계정별 사용 현황
```
GET /api/system-admin-dashboard/users/usage?organization_id=1&role=user&search=홍길동&page=1&limit=50&sort=total_used&order=DESC

Parameters:
- organization_id: 기관 ID 필터
- role: 역할 필터 (system_admin, org_admin, user)
- search: 검색어 (이름, 이메일, OAuth 닉네임)
- page: 페이지 번호
- limit: 페이지당 항목 수
- sort: 정렬 기준 (total_used, balance, total_anonymizations, last_login_at, name)
- order: 정렬 순서

Response:
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 10,
        "name": "홍길동",
        "email": "hong@example.com",
        "role": "user",
        "organization_name": "서울시청 노인복지과",
        "balance": 50000,
        "total_used": 150000,
        "total_purchased": 200000,
        "total_anonymizations": 45,
        "total_processing_minutes": 120.5,
        "is_approved": true,
        "last_login_at": "2025-12-10T10:00:00.000Z"
      }
    ],
    "pagination": { /* ... */ },
    "filters": { /* ... */ }
  }
}
```

### 5. 특정 사용자 상세 사용 현황
```
GET /api/system-admin-dashboard/users/:id/usage?limit=50

Response:
{
  "success": true,
  "data": {
    "user": { /* 사용자 정보 */ },
    "stats": {
      "total_anonymizations": 45,
      "total_processing_minutes": 120.5,
      "total_transactions": 15,
      "total_usage_logs": 50,
      "total_payments": 3,
      "total_payment_amount": 200000
    },
    "anonymization_logs": [ /* ... */ ],
    "transactions": [ /* ... */ ],
    "usage_logs": [ /* ... */ ],
    "payments": [ /* ... */ ]
  }
}
```

### 6. 시스템 활동 로그
```
GET /api/system-admin-dashboard/activity-logs?days=7&limit=100

Response:
{
  "success": true,
  "data": {
    "period_days": 7,
    "recent_anonymizations": [ /* ... */ ],
    "recent_payments": [ /* ... */ ],
    "recent_join_requests": [ /* ... */ ],
    "recent_logins": [ /* ... */ ]
  }
}
```

### 7. 사용 통계 차트 데이터
```
GET /api/system-admin-dashboard/charts/usage-trends?months=6

Response:
{
  "success": true,
  "data": {
    "usage_trends": [
      {
        "year": 2025,
        "month": 7,
        "total_quota": 390.0,
        "total_used": 245.5,
        "total_remaining": 144.5,
        "total_requests": 1250,
        "active_organizations": 35
      }
    ],
    "payment_trends": [ /* ... */ ],
    "user_growth": [ /* ... */ ]
  }
}
```

---

## 🎨 UI 구성

### 1. 헤더 (Header)
- 페이지 제목: "System Admin Dashboard"
- 실시간 시스템 모니터링 설명

### 2. Overview 통계 카드
- **6개의 통계 카드** (Grid Layout)
  - 전체 기관
  - 전체 사용자
  - 이번 달 사용량 (Progress Bar 포함)
  - 총 크레딧
  - 이번 달 결제
  - 최근 7일 활동

### 3. 탭 시스템
- **기관별 사용 현황** (Organizations Tab)
  - 검색 박스
  - 새로고침 버튼
  - 기관 테이블 (정렬 가능)
  - Progress Bar로 사용률 시각화

- **계정별 사용 현황** (Users Tab)
  - 검색 박스
  - 새로고침 버튼
  - 사용자 테이블
  - 역할별 Badge

- **최근 활동** (Activity Tab)
  - 새로고침 버튼
  - 최근 익명화 활동 테이블
  - 최근 결제 테이블

### 4. 인터랙션
- **Hover Effects**: 카드 및 테이블 행
- **자동 갱신**: 5분마다 전체 데이터 자동 갱신
- **수동 갱신**: 각 탭별 새로고침 버튼
- **로딩 상태**: Spinner 애니메이션

---

## 🔧 사용 예시

### JavaScript 코드 예시

```javascript
// API 호출 함수
async function apiCall(endpoint) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/system-admin-dashboard' + endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
}

// Overview 로드
async function loadOverview() {
  const result = await apiCall('/overview');
  if (result.success) {
    updateOverviewUI(result.data);
  }
}

// 기관별 사용 현황 로드
async function loadOrganizations() {
  const result = await apiCall('/organizations/usage?limit=50&sort=used_hours&order=DESC');
  if (result.success) {
    updateOrganizationsTable(result.data.organizations);
  }
}

// 특정 기관 상세 조회
async function loadOrganizationDetail(orgId) {
  const result = await apiCall(`/organizations/${orgId}/usage`);
  if (result.success) {
    showOrganizationDetail(result.data);
  }
}
```

---

## 🎯 사용 시나리오

### 시나리오 1: 일일 모니터링
1. 대시보드 접속
2. Overview 통계 확인
   - 전체 시스템 상태 파악
   - 이번 달 사용률 확인
3. 할당량 초과 기관 확인
   - 기관별 사용 현황 탭 이동
   - 사용률 80% 이상 기관 확인
4. 필요 시 할당량 조정 조치

### 시나리오 2: 월간 보고서 작성
1. 차트 데이터 조회
   - `/charts/usage-trends?months=12`
2. 기관별 사용 통계 다운로드
   - `/organizations/usage?limit=all`
3. 결제 통계 수집
   - Overview의 payment_trends 활용
4. 사용자 증가 추이 분석
   - user_growth 데이터 활용

### 시나리오 3: 이상 활동 감지
1. 최근 활동 탭 확인
2. 비정상적인 익명화 패턴 감지
   - 짧은 시간에 대량 요청
   - 특정 사용자의 과도한 사용
3. 해당 사용자 상세 조회
   - `/users/:id/usage`
4. 필요 시 계정 제한 조치

---

## 📊 데이터 해석 가이드

### 사용률 (Usage Percentage)
- **0-50%**: 정상 (녹색)
- **50-80%**: 주의 (주황색)
- **80-100%**: 경고 (빨강색)
- **100% 초과**: 할당량 초과 (빨강색 + 경고 Badge)

### 승인 상태 (Approval Status)
- **승인 (Approved)**: 정상적으로 서비스 이용 가능
- **대기 (Pending)**: Org Admin 승인 대기 중

### 결제 상태 (Payment Status)
- **성공 (Success)**: 결제 완료
- **실패 (Failed)**: 결제 실패
- **대기 (Pending)**: 결제 처리 중

---

## 🚨 경고 및 알림

### 자동 경고 조건
1. **할당량 80% 초과**: 기관 사용률 경고
2. **할당량 100% 초과**: 긴급 알림
3. **결제 실패 증가**: 시스템 오류 가능성
4. **비정상 활동 패턴**: 보안 위험

### 대응 절차
1. **기관 할당량 조정**
   - `/api/system-admin/organizations/:id` (PUT)
   - quota_hours 증가

2. **사용자 계정 제한**
   - `/api/system-admin/users/:id/role` (POST)
   - is_active = false 설정

3. **기관 일시 정지**
   - subscription_status = 'suspended'

---

## 🔒 보안 고려사항

### 1. 인증 확인
- 모든 API 요청에 JWT 토큰 필수
- System Admin 역할 검증
- 토큰 만료 시 자동 로그아웃

### 2. 민감 정보 보호
- 사용자 비밀번호는 표시하지 않음
- OAuth ID는 마스킹 처리
- 결제 정보는 일부만 표시

### 3. API Rate Limiting
- 일반 API: 15분당 100회
- Dashboard API: System Admin 전용
- DDoS 공격 방어

---

## 📈 성능 최적화

### 1. 페이지네이션
- 기본 20개 항목
- 최대 100개 항목
- 대용량 데이터 처리

### 2. 캐싱
- Overview 통계: 5분 캐싱
- 기관/사용자 목록: 실시간 조회
- 차트 데이터: 1시간 캐싱

### 3. 자동 갱신
- 5분마다 자동 갱신
- 백그라운드 갱신 (사용자 경험 방해 없음)

---

## 🛠️ 트러블슈팅

### 문제 1: "로그인이 필요합니다" 오류
**원인**: JWT 토큰 없음 또는 만료
**해결**:
```javascript
localStorage.setItem('token', 'your-jwt-token');
```

### 문제 2: "통계 로드 실패"
**원인**: API 권한 부족 또는 서버 오류
**해결**:
1. JWT 토큰의 role 확인 (`system_admin`)
2. 서버 로그 확인
3. 네트워크 연결 확인

### 문제 3: 데이터가 표시되지 않음
**원인**: 데이터 없음 또는 API 오류
**해결**:
1. 브라우저 콘솔 확인
2. Network 탭에서 API 응답 확인
3. 빈 상태 메시지 확인

---

## 📝 개발자 노트

### 파일 구조
```
/routes/system-admin-dashboard.js  (22KB, 7개 API)
/public/admin-dashboard.html       (17KB, UI)
/middleware/roleAuth.js            (requireSystemAdmin)
```

### 기술 스택
- **Backend**: Node.js + Express
- **Database**: SQLite (production: Cloudflare D1)
- **Frontend**: Vanilla JavaScript + CSS
- **Authentication**: JWT + Role-Based Access Control

### 확장 가능성
- 차트 라이브러리 추가 (Chart.js, D3.js)
- Excel/PDF 내보내기 기능
- 실시간 WebSocket 알림
- 커스터마이징 가능한 대시보드

---

## 🎉 결론

System Admin Dashboard는 CaseNetAI 시스템의 **중앙 관리 허브**로서:

✅ **실시간 모니터링**: 시스템 전체 상태 파악
✅ **데이터 기반 의사결정**: 통계 및 차트로 트렌드 분석
✅ **효율적인 관리**: 기관/사용자 현황 한눈에 파악
✅ **보안 및 권한**: System Admin 전용 접근 제어

**즉시 사용 가능!** 🚀
