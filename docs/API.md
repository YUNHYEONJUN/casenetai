# CaseNetAI API 문서

## 개요

- **Base URL**: `https://casenetai.kr/api` (프로덕션) / `http://localhost:3000/api` (개발)
- **인증**: JWT Bearer Token (쿠키 `access_token` 또는 `Authorization: Bearer <token>` 헤더)
- **Content-Type**: `application/json` (파일 업로드 제외)

## 인증 레벨

| 레벨 | 설명 |
|------|------|
| `none` | 인증 불필요 |
| `user` | JWT 인증 필요 (모든 사용자) |
| `org_admin` | 기관 관리자 또는 시스템 관리자 |
| `system_admin` | 시스템 관리자만 |

## Rate Limiting

| 대상 | 제한 | 윈도우 |
|------|------|--------|
| 전역 API | 100회 | 15분 |
| 로그인 | 5회 (실패만) | 15분 |
| 익명화 | 10회 | 1분 |
| 결제 | 10회 | 1시간 |
| 관리자 설정 | 5회 | 15분 |

## 에러 응답 형식

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "사용자에게 보여줄 메시지"
  }
}
```

주요 에러 코드: `VALIDATION_ERROR` (400), `AUTHENTICATION_ERROR` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `QUOTA_EXCEEDED` (429), `RATE_LIMIT` (429), `INTERNAL_ERROR` (500)

---

## 1. 인증 (`/api/auth`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/auth/register` | none | 회원가입 (관리자 생성용) |
| POST | `/auth/login` | none | 이메일/비밀번호 로그인 |
| POST | `/auth/logout` | user | 로그아웃 (토큰 블랙리스트) |
| POST | `/auth/refresh` | none | 리프레시 토큰으로 액세스 토큰 갱신 |
| GET | `/auth/me` | user | 내 정보 조회 |
| GET | `/auth/kakao` | none | 카카오 OAuth 시작 |
| GET | `/auth/kakao/callback` | none | 카카오 OAuth 콜백 |
| GET | `/auth/naver` | none | 네이버 OAuth 시작 |
| GET | `/auth/naver/callback` | none | 네이버 OAuth 콜백 |
| GET | `/auth/google` | none | 구글 OAuth 시작 |
| GET | `/auth/google/callback` | none | 구글 OAuth 콜백 |

**POST /auth/login**
```json
// Request
{ "email": "user@example.com", "password": "password123!" }
// Response (쿠키에 access_token, refresh_token 설정)
{ "success": true, "data": { "user": { "id", "email", "role", "name" }, "redirectUrl": "/dashboard.html" } }
```

## 2. 음성 처리 (`/api`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/analyze-audio` | user | 오디오 분석 (비용 견적) |
| POST | `/upload-audio` | user | 음성 업로드 → STT → 상담일지 생성 |
| POST | `/upload-audio-stream` | user | SSE 스트리밍 음성 처리 |
| GET | `/status` | none | API 상태 확인 |

## 3. 파일 업로드 (`/api`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/upload-blob` | user | 서버 경유 Blob 업로드 |
| POST | `/blob-upload` | user | Vercel Blob 클라이언트 업로드 토큰 |
| POST | `/blob-upload-server` | user | 서버사이드 Blob 업로드 |
| POST | `/blob-token` | user | Blob 클라이언트 토큰 (대용량) |
| POST | `/upload-chunk` | user | 청크 업로드 (대용량 파일) |
| POST | `/upload-chunk-complete` | user | 청크 업로드 완료 |

## 4. 문서 다운로드 (`/api`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/download-word` | user | 상담일지 Word 파일 다운로드 |

## 5. 진술서 (`/api/statement`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/statement/transcribe` | user | 음성 파일 STT 변환 |
| POST | `/statement/parse` | user | STT 텍스트 → AI 문답 분리 |
| POST | `/statement/save` | user | 진술서 저장 |
| PUT | `/statement/:id` | user | 진술서 수정 |
| GET | `/statement/list` | user | 진술서 목록 조회 |
| GET | `/statement/:id` | user | 진술서 상세 조회 |
| DELETE | `/statement/:id` | user | 진술서 삭제 |

## 6. 사실확인서 (`/api/fact-confirmation`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/fact-confirmation/transcribe` | user | 음성 파일 STT 변환 |
| POST | `/fact-confirmation/generate` | user | STT → 사실확인서 구조화 |
| POST | `/fact-confirmation/download` | user | 사실확인서 Word 다운로드 |

## 7. 익명화 (`/api/anonymization`, `/api/anonymize-*`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/anonymize-text-compare` | user | 텍스트 비교 익명화 (rate limit: 10회/분) |
| POST | `/anonymization/text-compare` | user | 텍스트 비교 익명화 (라우터) |
| GET | `/anonymization/health` | none | 익명화 서비스 헬스체크 |
| POST | `/anonymize-document` | user | 문서 업로드 → 익명화 |

## 8. 결제 · 크레딧 (`/api/payment`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/payment/credit/balance` | user | 크레딧 잔액 조회 |
| GET | `/payment/credit/transactions` | user | 거래 내역 조회 |
| GET | `/payment/credit/stats` | user | 사용 통계 조회 |
| POST | `/payment/prepare` | user | 결제 요청 준비 (rate limit: 10회/시간) |
| POST | `/payment/confirm` | user | 결제 승인 - 토스페이먼츠 (rate limit: 10회/시간) |
| POST | `/payment/fail` | user | 결제 실패 처리 |
| GET | `/payment/history` | user | 결제 내역 조회 |
| GET | `/payment/bonus/:amount` | none | 보너스 계산 미리보기 |

**보너스 티어**:
| 금액 | 보너스 |
|------|--------|
| 50,000원 이상 | 30% |
| 30,000원 이상 | 25% |
| 10,000원 이상 | 20% |
| 5,000원 이상 | 10% |

## 9. 관리 (`/api/admin`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/admin/dashboard/overview` | org_admin | 대시보드 개요 |
| GET | `/admin/organizations` | org_admin | 기관 목록 |
| GET | `/admin/organizations/:id` | org_admin | 기관 상세 정보 |
| POST | `/admin/organizations` | org_admin | 기관 생성 |
| PUT | `/admin/organizations/:id` | org_admin | 기관 수정 |
| PUT | `/admin/organizations/:id/quota` | org_admin | 기관 할당량 수정 |
| GET | `/admin/logs/anonymization` | org_admin | 익명화 로그 조회 |
| GET | `/admin/reports/monthly` | org_admin | 월별 리포트 |

## 10. 피드백 (`/api/feedback`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/feedback` | none | 간단 피드백 제출 |
| POST | `/feedback/submit` | user | 피드백 제출 |
| GET | `/feedback/my-feedbacks` | user | 내 피드백 목록 |
| GET | `/feedback/stats` | user | 피드백 통계 (내 기관) |
| POST | `/feedback/suggestion` | user | 개선 제안 제출 |
| GET | `/feedback/suggestions` | user | 개선 제안 목록 |
| GET | `/feedback/admin/all` | system_admin | 모든 피드백 조회 |
| POST | `/feedback/admin/respond/:id` | system_admin | 피드백 응답 |
| GET | `/feedback/admin/statistics` | system_admin | 전체 피드백 통계 |
| POST | `/feedback/admin/aggregate-daily` | system_admin | 일별 통계 집계 |

## 11. 분석 (`/api/analytics`) — 시스템 관리자 전용

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/analytics/dashboard` | 대시보드 요약 통계 |
| GET | `/analytics/usage` | 사용 통계 |
| GET | `/analytics/anonymization` | 익명화 통계 |
| GET | `/analytics/feedback-summary` | 피드백 요약 |
| GET | `/analytics/performance` | 성능 메트릭 |
| GET | `/analytics/errors` | 오류 분석 |
| GET | `/analytics/trend` | 시계열 트렌드 |
| GET | `/analytics/organizations` | 기관별 비교 |
| GET | `/analytics/methods` | 방식별 비교 (Rule/AI/CLOVA/Hybrid) |
| GET | `/analytics/top-issues` | 주요 문제점 분석 |

## 12. 시스템 관리 (`/api/system-admin`) — 시스템 관리자 전용

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/system-admin/organizations` | 기관 목록 |
| POST | `/system-admin/organizations` | 기관 생성 |
| PUT | `/system-admin/organizations/:id` | 기관 수정 |
| DELETE | `/system-admin/organizations/:id` | 기관 삭제 |
| GET | `/system-admin/users` | 사용자 목록 |
| PUT | `/system-admin/users/:id/role` | 사용자 권한 변경 |
| GET | `/system-admin/audit-logs` | 감사 로그 조회 |
| GET | `/system-admin/stats` | 대시보드 통계 |
| GET | `/system-admin/pending-users` | 승인 대기 사용자 |
| POST | `/system-admin/approve-user/:userId` | 사용자 승인 |
| POST | `/system-admin/promote-to-org-admin/:userId` | 기관 관리자로 승격 |
| POST | `/system-admin/reject-user/:userId` | 사용자 거부 |

## 13. 기관 관리 (`/api/org-admin`) — 기관 관리자 이상

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/org-admin/employees` | 직원 목록 |
| GET | `/org-admin/employees/:id` | 직원 상세 정보 |
| PUT | `/org-admin/employees/:id` | 직원 정보 수정 |
| DELETE | `/org-admin/employees/:id` | 직원 제거 |
| GET | `/org-admin/join-requests` | 가입 요청 목록 |
| PUT | `/org-admin/join-requests/:id/approve` | 가입 요청 승인 |
| PUT | `/org-admin/join-requests/:id/reject` | 가입 요청 거절 |
| GET | `/org-admin/statistics` | 기관 통계 |

## 14. 가입 요청 (`/api/join-requests`)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/join-requests/organizations` | none | 기관 목록 조회 (공개) |
| POST | `/join-requests` | user | 가입 요청 생성 |
| GET | `/join-requests/my` | user | 내 가입 요청 조회 |
| DELETE | `/join-requests/:id` | user | 가입 요청 취소 |

## 15. 시스템 대시보드 (`/api/system-admin-dashboard`) — 시스템 관리자 전용

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/system-admin-dashboard/overview` | 전체 시스템 통계 |
| GET | `/system-admin-dashboard/organizations/usage` | 기관별 사용 현황 |
| GET | `/system-admin-dashboard/organizations/:id/usage` | 특정 기관 상세 사용 |
| GET | `/system-admin-dashboard/users/usage` | 계정별 사용 현황 |
| GET | `/system-admin-dashboard/users/:id/usage` | 특정 사용자 상세 사용 |
| GET | `/system-admin-dashboard/activity-logs` | 시스템 활동 로그 |
| GET | `/system-admin-dashboard/charts/usage-trends` | 사용 통계 차트 데이터 |

## 16. 인라인 라우트 (server.js)

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/setup-admin` | none | 관리자 초기 설정 (마스터 비밀번호 필요) |
| POST | `/api/error-log` | none | 프론트엔드 에러 로그 수신 |

---

## 공통 페이지네이션 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `page` | number | 1 | 페이지 번호 (1 이상) |
| `limit` | number | 20 | 페이지당 항목 수 (1~100) |

**페이지네이션 응답 형식**:
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```
