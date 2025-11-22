# CaseNetAI 설정 가이드

이 가이드는 CaseNetAI 시스템에서 실제 AI 기능을 사용하기 위한 OpenAI API 키 설정 방법을 안내합니다.

## 📋 목차

1. [OpenAI API 키 발급](#1-openai-api-키-발급)
2. [환경 변수 설정](#2-환경-변수-설정)
3. [서버 실행 및 확인](#3-서버-실행-및-확인)
4. [비용 안내](#4-비용-안내)
5. [문제 해결](#5-문제-해결)

---

## 1. OpenAI API 키 발급

### 1.1 OpenAI 계정 생성
1. [OpenAI 웹사이트](https://platform.openai.com/) 접속
2. 우측 상단 "Sign Up" 클릭
3. 이메일 또는 Google/Microsoft 계정으로 가입

### 1.2 API 키 발급
1. [API Keys 페이지](https://platform.openai.com/api-keys) 접속
2. "Create new secret key" 버튼 클릭
3. 키 이름 입력 (예: "CaseNetAI")
4. 생성된 키 복사 (⚠️ **중요**: 이 키는 다시 볼 수 없으므로 안전한 곳에 보관)

### 1.3 결제 정보 등록
1. [Billing 페이지](https://platform.openai.com/account/billing/overview) 접속
2. 결제 정보 등록
3. 최소 $5 이상 충전 (사용량에 따라 과금)

---

## 2. 환경 변수 설정

### 2.1 .env 파일 생성
프로젝트 루트 디렉토리에 `.env` 파일이 이미 있습니다.

### 2.2 API 키 입력
`.env` 파일을 열고 발급받은 API 키를 입력하세요:

```env
# OpenAI API Key
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 서버 포트
PORT=3000

# 환경
NODE_ENV=development
```

⚠️ **보안 주의사항:**
- `.env` 파일은 절대 Git에 커밋하지 마세요 (`.gitignore`에 이미 포함됨)
- API 키를 다른 사람과 공유하지 마세요
- 프로덕션 환경에서는 환경 변수를 서버 설정으로 관리하세요

---

## 3. 서버 실행 및 확인

### 3.1 서버 시작
```bash
npm start
```

### 3.2 API 키 확인
서버 시작 시 다음과 같은 메시지를 확인하세요:

**✅ API 키가 올바르게 설정된 경우:**
```
┌─────────────────────────────────────────────┐
│   🏥 CaseNetAI - 노인보호 업무자동화 시스템    │
└─────────────────────────────────────────────┘

🌐 서버 주소: http://localhost:3000
🚀 환경: development
✅ OpenAI API 키 인증 성공

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 서버가 정상적으로 시작되었습니다.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**⚠️ API 키가 설정되지 않은 경우:**
```
⚠️  경고: OpenAI API 키가 설정되지 않았거나 유효하지 않습니다.
⚠️  .env 파일에 OPENAI_API_KEY를 설정해주세요.
⚠️  Mock 모드로 실행됩니다.
```

### 3.3 웹 브라우저 확인
1. 브라우저에서 `http://localhost:3000` 접속
2. 상담일지 생성 섹션으로 이동
3. 테스트 음성 파일 업로드
4. 결과 확인

---

## 4. 비용 안내

### 4.1 OpenAI API 가격 (2024년 기준)

**Whisper API (STT - 음성→텍스트):**
- $0.006 / 분

**GPT-4o (AI 분석):**
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens

### 4.2 예상 비용 예시

**1건의 상담 처리 비용:**
- 10분 음성 파일: $0.06 (STT)
- AI 분석 (약 3,000 tokens): $0.04
- **총 비용: 약 $0.10 (약 140원)**

**월 100건 처리 시:**
- 약 $10 (약 14,000원)

**월 1,000건 처리 시:**
- 약 $100 (약 140,000원)

### 4.3 비용 절감 팁
1. **음성 파일 길이 최적화**: 불필요한 부분 제거
2. **배치 처리**: 여러 건을 한번에 처리
3. **캐싱**: 동일한 음성 파일은 재처리하지 않음
4. **사용량 모니터링**: OpenAI 대시보드에서 일일 사용량 확인

---

## 5. 문제 해결

### 5.1 API 키 오류
**증상:** "OpenAI API 키가 설정되지 않았거나 유효하지 않습니다"

**해결 방법:**
1. `.env` 파일에 API 키가 올바르게 입력되었는지 확인
2. API 키 앞뒤로 공백이 없는지 확인
3. OpenAI 대시보드에서 키가 활성화되어 있는지 확인
4. 서버 재시작: `npm start`

### 5.2 결제 오류
**증상:** "Billing hard limit has been reached"

**해결 방법:**
1. [Billing 페이지](https://platform.openai.com/account/billing/overview)에서 잔액 확인
2. 충전 또는 한도 증액
3. 사용량 제한 설정 확인

### 5.3 Rate Limit 오류
**증상:** "Rate limit exceeded"

**해결 방법:**
1. 요청 간격 늘리기
2. Tier 업그레이드 고려
3. 동시 요청 수 제한

### 5.4 파일 형식 오류
**증상:** "Invalid file format"

**해결 방법:**
1. 지원 형식 확인: MP3, WAV, M4A, OGG, WebM, MP4
2. 파일 크기 확인: 최대 100MB
3. 음성 파일이 손상되지 않았는지 확인

---

## 6. 추가 정보

### 6.1 Mock 모드
API 키 없이도 시스템을 테스트할 수 있습니다:
- UI와 파일 업로드 기능은 정상 작동
- 빈 템플릿 형태의 상담일지 생성
- "(자동입력 필요)" 텍스트로 표시

### 6.2 프로덕션 배포
프로덕션 환경에서는:
```env
NODE_ENV=production
OPENAI_API_KEY=your_production_key
PORT=3000
```

### 6.3 보안 권장사항
1. **환경 변수 관리**: AWS Secrets Manager, Azure Key Vault 등 사용
2. **접근 제한**: IP 화이트리스트 설정
3. **로그 관리**: 민감 정보 로깅 방지
4. **정기 키 로테이션**: 주기적으로 API 키 교체

---

## 7. 지원

문제가 지속되면:
- 📧 이메일: support@wellpartners.co.kr
- 🌐 웹사이트: https://wellpartners.co.kr
- 📖 OpenAI 문서: https://platform.openai.com/docs

---

**© 2025 WellPartners. All rights reserved.**
