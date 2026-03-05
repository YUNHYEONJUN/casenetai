# 🧪 CaseNetAI 결제 시스템 테스트 가이드

## 📋 목차
1. [빠른 시작](#빠른-시작)
2. [회원가입/로그인 테스트](#1-회원가입로그인-테스트)
3. [크레딧 시스템 테스트](#2-크레딧-시스템-테스트)
4. [결제 시스템 테스트](#3-결제-시스템-테스트)
5. [무료 체험 테스트](#4-무료-체험-테스트)
6. [상담일지 생성 테스트](#5-상담일지-생성-테스트-크레딧-차감)
7. [사용 내역 조회](#6-사용-내역-조회)

---

## 🚀 빠른 시작

### 서비스 URL
```
https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai
```

### 준비물
- 터미널 (curl 명령어 사용)
- 또는 Postman, Insomnia 같은 API 테스트 도구
- 또는 브라우저 개발자 도구 (F12)

---

## 1. 회원가입/로그인 테스트

### Step 1: 회원가입 ✅

**요청:**
```bash
curl -X POST https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "yourpassword123",
    "name": "홍길동",
    "phone": "010-1234-5678"
  }'
```

**성공 응답:**
```json
{
  "success": true,
  "userId": 2,
  "message": "회원가입이 완료되었습니다"
}
```

**💡 Tip:** 이메일은 유니크해야 합니다. 중복 시 에러가 납니다.

---

### Step 2: 로그인 ✅

**요청:**
```bash
curl -X POST https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "yourpassword123"
  }'
```

**성공 응답:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "email": "your-email@example.com",
    "name": "홍길동",
    "role": "user",
    "credit": 0,
    "freeTrialCount": 3  // 🎁 무료 체험 3회!
  }
}
```

**💾 토큰 저장:**
```bash
# 토큰을 변수로 저장 (이후 요청에서 사용)
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Step 3: 내 정보 조회 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "user": {
    "id": 2,
    "email": "your-email@example.com",
    "name": "홍길동",
    "phone": "010-1234-5678",
    "role": "user",
    "credit": 0,
    "freeTrialCount": 3,
    "totalPurchased": 0,
    "totalUsed": 0,
    "organization": null,
    "createdAt": "2025-11-29T12:00:00.000Z"
  }
}
```

---

## 2. 크레딧 시스템 테스트

### Step 4: 잔액 조회 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/balance \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "balance": 0,           // 현재 크레딧 잔액
  "freeTrialCount": 3,    // 남은 무료 체험 횟수
  "totalPurchased": 0,    // 총 구매 금액
  "totalUsed": 0,         // 총 사용 금액
  "totalBonus": 0         // 총 보너스 금액
}
```

---

### Step 5: 사용 통계 조회 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/stats \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "total": {
    "count": 0,              // 총 사용 건수
    "minutes": 0,            // 총 사용 시간 (분)
    "cost": 0,               // 총 비용 (원)
    "freeTrialUsed": 0       // 사용한 무료 체험 횟수
  },
  "thisMonth": {
    "count": 0,
    "minutes": 0,
    "cost": 0
  },
  "recent": []               // 최근 10건 사용 내역
}
```

---

## 3. 결제 시스템 테스트

### Step 6: 보너스 계산 미리보기 ✅

**5,000원 충전 시:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/bonus/5000
```

**응답:**
```json
{
  "success": true,
  "amount": 5000,
  "bonusAmount": 500,      // 10% 보너스
  "totalCredit": 5500,     // 총 5,500원 크레딧
  "bonusRate": 10          // 10%
}
```

**10,000원 충전 시:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/bonus/10000
```

**응답:**
```json
{
  "success": true,
  "amount": 10000,
  "bonusAmount": 2000,     // 20% 보너스
  "totalCredit": 12000,    // 총 12,000원 크레딧
  "bonusRate": 20
}
```

**50,000원 충전 시:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/bonus/50000
```

**응답:**
```json
{
  "success": true,
  "amount": 50000,
  "bonusAmount": 15000,    // 30% 보너스
  "totalCredit": 65000,    // 총 65,000원 크레딧
  "bonusRate": 30
}
```

---

### Step 7: 결제 준비 ✅

**요청:**
```bash
curl -X POST https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/prepare \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000}'
```

**성공 응답:**
```json
{
  "success": true,
  "orderId": "ORDER_2_1764491923760",
  "amount": 10000,
  "bonusAmount": 2000,
  "totalCredit": 12000,
  "clientKey": "test_ck_YOUR_CLIENT_KEY",
  "successUrl": "https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/payment/success",
  "failUrl": "https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/payment/fail"
}
```

**💡 Note:** 실제 결제는 토스페이먼츠 UI를 통해 진행됩니다. 현재는 테스트 모드이므로 Mock 데이터가 사용됩니다.

---

### Step 8: 결제 내역 조회 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/history \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "payments": [
    {
      "order_id": "ORDER_2_1764491923760",
      "amount": 10000,
      "bonus_amount": 2000,
      "total_credit": 12000,
      "status": "pending",
      "payment_method": null,
      "approved_at": null,
      "created_at": "2025-11-29T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## 4. 무료 체험 테스트

### 무료 체험 작동 방식

1. **신규 가입 시 자동으로 3회 제공**
2. **크레딧이 부족할 때 자동으로 사용**
3. **사용 시마다 1회씩 차감**

### Step 9: 무료 체험 확인 ✅

**현재 남은 횟수 확인:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/balance \
  -H "Authorization: Bearer $TOKEN"
```

**응답에서 확인:**
```json
{
  "freeTrialCount": 3  // 남은 무료 체험 횟수
}
```

---

## 5. 상담일지 생성 테스트 (크레딧 차감)

### Step 10: 음성 파일 업로드 및 처리 ✅

**⚠️ 중요:** 실제 음성 파일이 필요합니다. 테스트용 음성 파일을 준비하세요.

**요청:**
```bash
curl -X POST https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/upload-audio \
  -H "Authorization: Bearer $TOKEN" \
  -F "audioFile=@/path/to/your/audio.mp3" \
  -F "consultationType=phone" \
  -F "sttEngine=openai"
```

**성공 응답:**
```json
{
  "success": true,
  "mode": "ai",
  "report": {
    "basicInfo": { ... },
    "summary": "...",
    "victimInfo": { ... },
    "perpetratorInfo": { ... }
  },
  "processingTime": "125.3초",
  "actualCost": {
    "duration": {
      "seconds": 2903,
      "minutes": 49,
      "formatted": "48분 23초"
    },
    "sttCost": 389,
    "aiCost": 0,
    "totalCost": 389,
    "engine": "OpenAI Whisper"
  },
  "creditInfo": {
    "success": true,
    "charged": 0,              // 무료 체험 사용 시 0원
    "balance": 0,
    "freeTrialRemaining": 2,   // 남은 무료 체험: 2회
    "message": "무료 체험이 사용되었습니다 (남은 횟수: 2회)"
  }
}
```

**무료 체험을 모두 사용한 후 (크레딧 차감):**
```json
{
  "creditInfo": {
    "success": true,
    "charged": 389,            // 389원 차감
    "balance": 11611,          // 남은 잔액
    "message": "389원이 차감되었습니다"
  }
}
```

**크레딧 부족 시:**
```json
{
  "error": "크레딧이 부족합니다"
}
```

---

## 6. 사용 내역 조회

### Step 11: 거래 내역 조회 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/transactions \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": 1,
      "type": "free_trial",
      "amount": 0,
      "balance_after": 0,
      "description": "무료 체험 사용 (48.4분)",
      "audio_duration_minutes": 48.38,
      "created_at": "2025-11-29T12:10:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**거래 유형:**
- `purchase`: 크레딧 충전
- `bonus`: 보너스 크레딧
- `usage`: 크레딧 사용
- `free_trial`: 무료 체험 사용
- `refund`: 환불

---

### Step 12: 상세 사용 통계 ✅

**요청:**
```bash
curl https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/stats \
  -H "Authorization: Bearer $TOKEN"
```

**성공 응답:**
```json
{
  "success": true,
  "total": {
    "count": 1,              // 총 1건 사용
    "minutes": 48.38,        // 총 48.38분
    "cost": 0,               // 무료 체험 사용
    "freeTrialUsed": 1       // 무료 체험 1회 사용
  },
  "thisMonth": {
    "count": 1,
    "minutes": 48.38,
    "cost": 0
  },
  "recent": [
    {
      "consultation_type": "phone",
      "audio_duration_seconds": 2903,
      "total_cost": 0,
      "is_free_trial": 1,
      "created_at": "2025-11-29T12:10:00.000Z"
    }
  ]
}
```

---

## 🎯 테스트 시나리오 (전체 플로우)

### 시나리오 1: 신규 사용자 (무료 체험)

1. ✅ 회원가입
2. ✅ 로그인 (토큰 받기)
3. ✅ 잔액 확인 (무료 체험 3회 확인)
4. ✅ 음성 파일 업로드 (1차 - 무료)
5. ✅ 음성 파일 업로드 (2차 - 무료)
6. ✅ 음성 파일 업로드 (3차 - 무료)
7. ✅ 잔액 확인 (무료 체험 0회)
8. ✅ 크레딧 충전 (10,000원 → 12,000원 크레딧)
9. ✅ 음성 파일 업로드 (4차 - 유료, 크레딧 차감)
10. ✅ 사용 내역 확인

---

### 시나리오 2: 크레딧 충전 및 사용

1. ✅ 로그인
2. ✅ 보너스 계산 (10,000원 → 12,000원)
3. ✅ 결제 준비 (orderId 받기)
4. ✅ 결제 승인 (Mock 모드)
5. ✅ 잔액 확인 (12,000원)
6. ✅ 음성 파일 업로드 (389원 차감)
7. ✅ 잔액 확인 (11,611원)
8. ✅ 거래 내역 조회
9. ✅ 사용 통계 조회

---

## 📱 브라우저에서 테스트

### 개발자 도구 (F12) 사용

**회원가입:**
```javascript
fetch('https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123',
    name: '테스트',
    phone: '010-1234-5678'
  })
})
.then(r => r.json())
.then(console.log);
```

**로그인:**
```javascript
fetch('https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
})
.then(r => r.json())
.then(data => {
  localStorage.setItem('token', data.token);
  console.log('로그인 성공:', data);
});
```

**잔액 조회:**
```javascript
const token = localStorage.getItem('token');
fetch('https://3000-ixy5t1tdycwtc8cmz10wu-8f57ffe2.sandbox.novita.ai/api/payment/credit/balance', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(console.log);
```

---

## 🛠️ 문제 해결

### 문제 1: "인증 토큰이 필요합니다"
**해결:** 로그인 후 받은 토큰을 `Authorization: Bearer TOKEN` 헤더에 포함시키세요.

### 문제 2: "크레딧이 부족합니다"
**해결:** 
1. 무료 체험 횟수 확인
2. 크레딧 충전
3. 관리자에게 문의

### 문제 3: "이메일 또는 비밀번호가 올바르지 않습니다"
**해결:** 이메일과 비밀번호를 다시 확인하세요.

### 문제 4: "이미 사용 중인 이메일입니다"
**해결:** 다른 이메일로 회원가입하세요.

---

## 📊 예상 비용 계산

| 음성 길이 | STT 비용 (Whisper) | 무료 체험 | 유료 사용 |
|-----------|-------------------|----------|----------|
| 10분 | 79원 | ✅ 무료 (3회) | 79원 |
| 30분 | 238원 | ✅ 무료 (3회) | 238원 |
| 48분 | 389원 | ✅ 무료 (3회) | 389원 |
| 60분 | 475원 | ✅ 무료 (3회) | 475원 |

**계산식:** `음성 길이 (분) × 30원/분`

---

## ✅ 체크리스트

테스트 완료 여부를 체크하세요:

- [ ] 회원가입 성공
- [ ] 로그인 성공 (토큰 받기)
- [ ] 내 정보 조회
- [ ] 잔액 조회 (무료 체험 3회 확인)
- [ ] 보너스 계산 미리보기
- [ ] 결제 준비
- [ ] 음성 파일 업로드 (무료 체험 사용)
- [ ] 잔액 확인 (무료 체험 차감 확인)
- [ ] 크레딧 충전
- [ ] 음성 파일 업로드 (유료, 크레딧 차감)
- [ ] 거래 내역 조회
- [ ] 사용 통계 조회

---

## 🎉 테스트 완료!

모든 기능이 정상 작동하면 프로덕션 배포를 준비하세요!

**다음 단계:**
1. 프론트엔드 UI 개발
2. 토스페이먼츠 실제 키 발급
3. HTTPS 설정
4. 도메인 연결
5. 프로덕션 배포

**문의:** 문제가 있으면 로그를 확인하거나 개발자에게 문의하세요.

---

**작성일:** 2025-11-29  
**버전:** 1.0.0  
**상태:** ✅ 테스트 준비 완료
