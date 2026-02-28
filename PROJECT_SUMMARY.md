# CaseNetAI 프로젝트 전체 요약

## 파일 구조
```
casenetai/
├── server.js
├── package.json
├── vercel.json
├── database/
│   └── db-postgres.js
├── services/
│   ├── authService.js
│   ├── anonymizationService.js
│   └── aiService.js
├── routes/
│   ├── auth.js
│   ├── payment.js
│   └── admin.js
└── public/
    ├── index.html
    ├── login.html
    └── ...
```

## 주요 기능
1. 음성 → 텍스트 변환 (STT)
2. 문서 비식별화 (AI)
3. 진술조서 생성
4. 사실확인서 생성

## 기술 스택
- Backend: Node.js/Express
- Database: Supabase PostgreSQL
- AI: OpenAI GPT-4, Google Gemini, Naver CLOVA
- Hosting: Vercel
- Domain: casenetai.kr

## 주요 API 엔드포인트
- POST /api/auth/login
- POST /api/auth/register
- POST /api/elderly-protection/transcribe
- POST /api/anonymization/anonymize
- POST /api/statement/generate
- POST /api/fact-confirmation/create

