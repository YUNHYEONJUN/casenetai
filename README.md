# CaseNetAI - 노인보호전문기관 업무자동화 시스템

웰파트너스(WellPartners)에서 제공하는 노인보호전문기관 상담일지 자동 생성 서비스입니다.

## 프로젝트 개요

CaseNetAI는 노인보호전문기관의 상담원이 진행한 상담(전화, 방문, 내방)의 녹음 파일을 업로드하면, AI 기술을 활용하여 자동으로 표준화된 상담일지를 생성해주는 웹 기반 서비스입니다.

## 주요 기능

### 1. 음성 파일 업로드
- 전화상담, 방문상담, 내방상담 녹음 파일 지원
- 지원 형식: MP3, WAV, M4A, OGG, WebM, MP4
- 최대 파일 크기: 100MB
- 드래그 앤 드롭 지원

### 2. 자동 텍스트 변환 (STT)
- 음성 파일을 텍스트로 자동 변환
- 한국어 음성 인식 최적화

### 3. 상담일지 자동 생성
- 노인보호전문기관 업무수행지침 준수
- 표준화된 상담일지 양식 자동 작성
- 다음 항목 자동 추출:
  - 기본정보 (상담일자, 상담유형, 접수번호)
  - 피해노인 정보 (성명, 성별, 연령, 연락처, 주소)
  - 행위자 정보 (성명, 관계, 연령, 연락처)
  - 상담내용 (신고경위, 학대유형, 학대내용, 피해노인상태, 현장상황)
  - 조치사항 (즉시조치내용, 연계기관, 향후계획)
  - 특이사항

### 4. 결과 다운로드
- 생성된 상담일지를 텍스트 파일로 다운로드
- 표준 양식 준수

## 기술 스택

### Backend
- Node.js + Express
- Multer (파일 업로드)
- CORS 지원

### Frontend
- HTML5
- CSS3 (반응형 디자인)
- Vanilla JavaScript
- Modern UI/UX 디자인

### 향후 통합 예정
- STT API (음성-텍스트 변환)
- AI API (상담일지 자동 생성)

## 설치 및 실행

### 사전 요구사항
- Node.js 14.x 이상
- npm 6.x 이상

### 설치
```bash
npm install
```

### 실행
```bash
npm start
```

서버는 기본적으로 포트 3000에서 실행됩니다.

## 디렉토리 구조

```
webapp/
├── server.js              # Express 서버
├── package.json           # 프로젝트 설정
├── public/                # 정적 파일
│   ├── index.html        # 메인 페이지
│   ├── css/
│   │   └── style.css     # 스타일시트
│   └── js/
│       └── main.js       # 클라이언트 JavaScript
├── uploads/              # 업로드된 파일 저장
└── README.md             # 프로젝트 문서
```

## API 엔드포인트

### POST /api/upload-audio
음성 파일 업로드

**요청:**
- Content-Type: multipart/form-data
- Body:
  - audioFile: 음성 파일
  - consultationType: 상담 유형 (phone/visit/office)

**응답:**
```json
{
  "success": true,
  "filename": "업로드된 파일명",
  "consultationType": "상담유형",
  "message": "처리 메시지"
}
```

### POST /api/generate-report
상담일지 생성

**요청:**
```json
{
  "filename": "업로드된 파일명",
  "consultationType": "상담유형"
}
```

**응답:**
```json
{
  "success": true,
  "report": {
    "기본정보": {...},
    "피해노인정보": {...},
    "행위자정보": {...},
    "상담내용": {...},
    "조치사항": {...},
    "특이사항": "..."
  }
}
```

## 참고 문서

본 시스템은 다음 문서들을 기반으로 개발되었습니다:
- 2025년 노인보호전문기관 업무수행지침 1권(기관운영)
- 2025년 노인보호전문기관 업무수행지침 2권(사례개입)
- 노인학대상담매뉴얼(2009년)
- 노인보호 상담일지 기록 매뉴얼

## 라이선스

Copyright © 2025 WellPartners. All rights reserved.

## 문의

웹사이트: https://wellpartners.co.kr

---

**Made with ❤️ by WellPartners**
