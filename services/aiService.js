const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// OpenAI 클라이언트 초기화 (타임아웃 설정 증가)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 5 * 60 * 1000, // 5분 타임아웃
  maxRetries: 3 // 재시도 3회
});

// Whisper API 파일 크기 제한 (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

/**
 * 파일 크기 확인
 * @param {string} filePath - 파일 경로
 * @returns {number} - 파일 크기 (bytes)
 */
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * 오디오 파일 압축
 * @param {string} inputPath - 입력 파일 경로
 * @returns {Promise<string>} - 압축된 파일 경로
 */
async function compressAudio(inputPath) {
  const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp3');
  
  try {
    console.log(`[압축] 오디오 파일 압축 시작: ${inputPath}`);
    
    // ffmpeg를 사용하여 압축 (비트레이트 낮춤)
    execSync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 32k "${outputPath}" -y`,
      { stdio: 'ignore' }
    );
    
    const originalSize = getFileSize(inputPath);
    const compressedSize = getFileSize(outputPath);
    
    console.log(`[압축] 완료. 원본: ${(originalSize / 1024 / 1024).toFixed(2)}MB → 압축: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
    
    return outputPath;
  } catch (error) {
    console.error('[압축] 오류:', error.message);
    throw new Error(`파일 압축 실패: ${error.message}`);
  }
}

/**
 * 음성 파일을 텍스트로 변환 (STT)
 * @param {string} audioFilePath - 음성 파일 경로
 * @returns {Promise<string>} - 변환된 텍스트
 */
async function transcribeAudio(audioFilePath) {
  let processFilePath = audioFilePath;
  let needsCleanup = false;
  
  try {
    console.log(`[STT] 음성 파일 변환 시작: ${audioFilePath}`);
    
    // 파일 크기 확인
    const fileSize = getFileSize(audioFilePath);
    console.log(`[STT] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    // 25MB 초과 시 압축
    if (fileSize > MAX_FILE_SIZE) {
      console.log(`[STT] 파일이 25MB를 초과합니다. 압축을 진행합니다...`);
      processFilePath = await compressAudio(audioFilePath);
      needsCleanup = true;
      
      const compressedSize = getFileSize(processFilePath);
      if (compressedSize > MAX_FILE_SIZE) {
        throw new Error('압축 후에도 파일이 너무 큽니다. 파일을 더 작게 나누어 업로드해주세요.');
      }
    }
    
    console.log(`[STT] Whisper API 호출 시작...`);
    
    // FormData를 사용한 직접 HTTP 요청 (더 안정적)
    const FormData = require('form-data');
    const https = require('https');
    const http = require('http');
    
    // Keep-Alive 에이전트 생성 (연결 재사용)
    const agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 1,
      timeout: 10 * 60 * 1000 // 10분
    });
    
    const form = new FormData();
    form.append('file', fs.createReadStream(processFilePath));
    form.append('model', 'whisper-1');
    form.append('language', 'ko');
    form.append('response_format', 'text');
    
    const transcription = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        agent: agent,
        timeout: 10 * 60 * 1000 // 10분 타임아웃
      };
      
      const req = https.request(options, (res) => {
        console.log(`[STT] 응답 상태: ${res.statusCode}`);
        let data = '';
        let receivedBytes = 0;
        
        res.on('data', (chunk) => {
          data += chunk;
          receivedBytes += chunk.length;
          if (receivedBytes % 1024 === 0) {
            console.log(`[STT] 수신 중: ${(receivedBytes / 1024).toFixed(1)}KB`);
          }
        });
        
        res.on('end', () => {
          console.log(`[STT] 응답 완료: ${receivedBytes} bytes`);
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`API 오류: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('[STT] 요청 오류:', error.message);
        reject(error);
      });
      
      req.on('timeout', () => {
        console.error('[STT] 타임아웃 발생 (10분 초과)');
        req.destroy();
        reject(new Error('요청 타임아웃 (10분 초과)'));
      });
      
      // 업로드 진행 상황
      let uploadedBytes = 0;
      form.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        if (uploadedBytes % (1024 * 1024) === 0) {
          console.log(`[STT] 업로드 중: ${(uploadedBytes / 1024 / 1024).toFixed(1)}MB`);
        }
      });
      
      console.log('[STT] 파일 전송 시작...');
      form.pipe(req);
    });

    console.log(`[STT] 변환 완료. 텍스트 길이: ${transcription.length}자`);
    
    // 압축 파일 정리
    if (needsCleanup && fs.existsSync(processFilePath)) {
      fs.unlinkSync(processFilePath);
      console.log(`[STT] 압축 파일 삭제: ${processFilePath}`);
    }
    
    return transcription;
  } catch (error) {
    console.error('[STT] 오류 상세:', {
      message: error.message,
      type: error.constructor.name,
      code: error.code,
      status: error.status
    });
    
    // 압축 파일 정리
    if (needsCleanup && processFilePath && fs.existsSync(processFilePath)) {
      fs.unlinkSync(processFilePath);
    }
    
    throw new Error(`음성 변환 실패: ${error.message}`);
  }
}

/**
 * 상담 내용 텍스트를 분석하여 상담일지 생성 (AI 분석)
 * @param {string} transcript - 상담 내용 텍스트
 * @param {string} consultationType - 상담 유형 (phone/visit/office)
 * @returns {Promise<Object>} - 구조화된 상담일지 데이터
 */
async function analyzeCounselingTranscript(transcript, consultationType) {
  try {
    console.log(`[AI 분석] 상담일지 생성 시작 (유형: ${consultationType})`);
    
    const systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
상담 녹취록을 분석하여 "노인보호 상담일지 기록 매뉴얼"에 따라 정확하고 상세한 상담일지를 작성해야 합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【 노인보호전문기관 상담일지 작성 지침 】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 1. 신고자/내담자 정보
   - 신고자 성명, 연락처, 피해노인과의 관계
   - 신고 동기 및 경위를 구체적으로 기록
   - 신고 경로 (전화, 방문, 온라인 등)

■ 2. 피해노인(클라이언트) 정보
   ▶ 인적사항:
     • 성명 (필수)
     • 성별 (남/여)
     • 생년월일 및 연령
     • 연락처 (휴대전화, 자택전화)
     • 주소 (시/군/구, 동까지 상세히)
   
   ▶ 건강상태:
     • 신체적 건강: 질병명, 장애 여부, ADL 정도
     • 정신적 건강: 인지기능(치매, 정신질환 등), MMSE 점수
     • 복용 중인 약물
   
   ▶ 경제상태:
     • 주요 수입원 (기초생활수급, 기초연금, 자녀 지원 등)
     • 월 소득 및 재산 상태
     • 경제적 어려움 여부

   ▶ 가족관계:
     • 가족 구성원 (배우자, 자녀, 손자녀 등)
     • 각 가족원과의 관계 및 교류 빈도
     • 주 돌봄 제공자

■ 3. 행위자(학대의심자) 정보
   - 성명
   - 피해노인과의 관계 (구체적으로: 장남, 며느리, 요양보호사, 시설장 등)
   - 성별, 연령
   - 연락처
   - 직업 및 경제상태
   - 음주/약물 문제 여부
   - 정신질환 또는 성격적 특성
   - 과거 학대 이력

■ 4. 학대 의심 내용
   ▶ 학대유형 (중복 가능):
     • 신체적 학대: 폭행, 상해
     • 정서적 학대: 언어폭력, 협박, 모욕
     • 성적 학대: 성희롱, 성추행, 성폭력
     • 경제적 학대: 재산 갈취, 금전 착취, 연금 도용
     • 방임: 의식주 미제공, 의료 방임
     • 유기: 거주지 이탈, 시설 유기
     • 자기방임: 스스로를 돌보지 않음

   ▶ 학대내용:
     • 구체적인 학대 행위 (5W1H 원칙으로 상세히)
       - 언제(When): 발생 시기, 빈도, 지속 기간
       - 어디서(Where): 발생 장소
       - 누가(Who): 행위자
       - 무엇을(What): 구체적 행위
       • 어떻게(How): 방법 및 수단
       - 왜(Why): 동기 및 배경
     
     • 학대의 심각성 정도
     • 학대 증거 (상처, 진단서, 사진, CCTV 등)

   ▶ 학대 발견 경위:
     • 신고자가 어떻게 알게 되었는지
     • 신고 동기
     • 이전 신고 이력

■ 5. 피해노인의 현재 상태
   ▶ 신체적 상태:
     • 외상 유무 (상처, 멍, 골절 등)
     • 영양 상태
     • 위생 상태
     • 통증 호소 여부

   ▶ 정신·정서적 상태:
     • 우울, 불안, 두려움
     • 의사소통 능력
     • 학대에 대한 인식 및 반응

   ▶ 생활환경:
     • 거주 형태 (독거, 가족 동거, 시설)
     • 주거 환경 위생 상태
     • 안전 위험 요소

■ 6. 현장조사 내용 (방문상담 시)
   - 현장 방문 일시
   - 방문자 (상담원 성명)
   - 현장 상황 관찰 내용
   - 피해노인 면담 내용
   - 행위자 면담 내용
   - 목격자 진술
   - 증거 수집 (사진, 녹음 등)

■ 7. 즉시 조치사항
   - 응급조치 (119, 경찰 신고)
   - 분리보호 여부
   - 의료기관 연계
   - 긴급생활지원
   - 법률지원 연계

■ 8. 사례 판정
   - 사례판정회의 결과
   - 학대 여부 판정 (학대, 잠재적 위험, 일반사례, 학대아님)
   - 판정 근거

■ 9. 향후 계획
   - 단기 목표 및 계획
   - 장기 목표 및 계획
   - 서비스 계획 (법률, 의료, 심리, 경제 지원)
   - 모니터링 계획 (주기, 방법)
   - 사후관리 방안

■ 10. 상담원 의견 및 특이사항
   - 상담원의 종합 의견
   - 사례의 특이점
   - 추가 지원이 필요한 사항
   - 타 기관 연계 필요성

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【 작성 시 유의사항 】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 객관적 사실 중심 기록
   - 주관적 해석이나 판단은 배제
   - "~것 같다", "~로 보인다" 등의 추측성 표현 최소화
   - 직접 관찰하거나 들은 내용만 기록

2. 구체적이고 상세한 기록
   - 모호한 표현 지양
   - 5W1H 원칙 준수
   - 숫자, 시간, 장소 등은 정확히 기록

3. 개인정보 보호
   - 민감 정보는 신중히 다루되 필요한 정보는 빠짐없이 기록
   - 제3자가 읽을 것을 고려

4. 정확한 용어 사용
   - 노인보호 업무 표준 용어 사용
   - 학대유형은 정확한 분류 기준 적용

5. 시간순 서술
   - 사건의 흐름을 시간 순서대로 기록
   - 과거-현재-미래 구분 명확히

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

다음 JSON 형식으로 상세히 응답하세요:
{
  "신고자정보": {
    "신고자명": "string or null",
    "관계": "string or null",
    "연락처": "string or null",
    "신고경위": "string"
  },
  "피해노인정보": {
    "성명": "string",
    "성별": "남/여/확인불가",
    "생년월일": "YYYY-MM-DD or 확인불가",
    "연령": "number or 확인불가",
    "연락처": "string or 확인불가",
    "주소": "string",
    "건강상태": {
      "신체": "string",
      "정신": "string",
      "복용약물": "string or 없음"
    },
    "경제상태": "string",
    "가족관계": "string",
    "주돌봄제공자": "string or 없음"
  },
  "행위자정보": {
    "성명": "string or 확인불가",
    "관계": "string (구체적으로)",
    "성별": "남/여/확인불가",
    "연령": "number or 확인불가",
    "연락처": "string or 확인불가",
    "특성": "string (직업, 경제상태, 음주/약물, 정신질환 등)"
  },
  "학대내용": {
    "학대유형": "string (정확한 유형 명시)",
    "발생시기": "string (언제부터, 빈도)",
    "발생장소": "string",
    "구체적행위": "string (매우 상세히)",
    "심각성": "string (경미/중간/심각)",
    "증거": "string or 없음"
  },
  "현재상태": {
    "신체상태": "string",
    "정서상태": "string",
    "생활환경": "string",
    "위험도": "string (낮음/중간/높음)"
  },
  "현장조사": {
    "실시여부": "boolean",
    "방문일시": "string or null",
    "관찰내용": "string or null",
    "면담내용": "string or null"
  },
  "즉시조치": {
    "응급조치": "string or 없음",
    "분리보호": "string or 없음",
    "의료연계": "string or 없음",
    "기타조치": "string or 없음"
  },
  "향후계획": {
    "단기계획": "string",
    "장기계획": "string",
    "모니터링": "string",
    "연계기관": "string or 없음"
  },
  "상담원": "string",
  "상담원의견": "string",
  "특이사항": "string or 없음"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `다음은 ${getConsultationTypeText(consultationType)} 상담의 녹취록입니다. 이를 분석하여 상담일지를 작성해주세요:\n\n${transcript}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // 일관성을 위해 낮은 temperature
      max_tokens: 2000
    });

    const analysisResult = JSON.parse(response.choices[0].message.content);
    
    // 기본정보 추가
    const currentDate = new Date().toISOString().split('T')[0];
    const caseNumber = generateCaseNumber();
    
    const report = {
      기본정보: {
        상담일자: currentDate,
        상담유형: consultationType,
        상담원: analysisResult.상담원 || '정보 없음',
        접수번호: caseNumber
      },
      신고자정보: analysisResult.신고자정보,
      피해노인정보: analysisResult.피해노인정보,
      행위자정보: analysisResult.행위자정보,
      학대내용: analysisResult.학대내용,
      현재상태: analysisResult.현재상태,
      현장조사: analysisResult.현장조사,
      즉시조치: analysisResult.즉시조치,
      향후계획: analysisResult.향후계획,
      상담원의견: analysisResult.상담원의견,
      특이사항: analysisResult.특이사항
    };

    console.log('[AI 분석] 상담일지 생성 완료');
    return report;
  } catch (error) {
    console.error('[AI 분석] 오류:', error.message);
    throw new Error(`상담일지 생성 실패: ${error.message}`);
  }
}

/**
 * 접수번호 생성
 * @returns {string} - 접수번호 (형식: 2025-0001)
 */
function generateCaseNumber() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${year}-${randomNum}`;
}

/**
 * 상담 유형 텍스트 변환
 * @param {string} type - 상담 유형 코드
 * @returns {string} - 상담 유형 텍스트
 */
function getConsultationTypeText(type) {
  const types = {
    'phone': '전화상담',
    'visit': '방문상담',
    'office': '내방상담'
  };
  return types[type] || type;
}

/**
 * 전체 처리 파이프라인 (STT + AI 분석)
 * @param {string} audioFilePath - 음성 파일 경로
 * @param {string} consultationType - 상담 유형
 * @returns {Promise<Object>} - 완성된 상담일지
 */
async function processAudioToCounselingReport(audioFilePath, consultationType) {
  try {
    console.log('[파이프라인] 음성 파일 처리 시작');
    
    // 1단계: 음성을 텍스트로 변환
    const transcript = await transcribeAudio(audioFilePath);
    
    // 2단계: 텍스트를 분석하여 상담일지 생성
    const report = await analyzeCounselingTranscript(transcript, consultationType);
    
    // 원본 텍스트도 함께 반환
    report.원본텍스트 = transcript;
    
    console.log('[파이프라인] 처리 완료');
    return report;
  } catch (error) {
    console.error('[파이프라인] 오류:', error.message);
    throw error;
  }
}

/**
 * API 키 유효성 검사
 * @returns {Promise<boolean>} - API 키 유효 여부
 */
async function validateApiKey() {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-proj-your-key-here') {
      return false;
    }
    
    // 간단한 API 호출로 키 유효성 확인
    await openai.models.list();
    return true;
  } catch (error) {
    console.error('[API 키 검증] 실패:', error.message);
    return false;
  }
}

module.exports = {
  transcribeAudio,
  analyzeCounselingTranscript,
  processAudioToCounselingReport,
  validateApiKey
};
