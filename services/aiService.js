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

【 핵심 원칙 】
1. 녹취록에서 언급된 모든 정보를 최대한 활용하세요
2. 직접 언급되지 않아도 맥락에서 합리적으로 추론 가능한 정보는 기록하세요
3. "미입력"은 정말 알 수 없는 경우에만 사용하세요
4. 상담 내용을 풍부하게 기록하여 실질적으로 유용한 상담일지를 작성하세요
5. 녹취록에서 나온 대화 내용, 감정, 상황 묘사를 적극 활용하세요

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【 노인보호전문기관 상담일지 작성 지침 】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 0. 상담 요약 (필수 - 가장 먼저 작성)
   - 이 상담의 핵심 내용을 3-5문장으로 요약
   - 주요 문제, 신고 이유, 피해 정도, 즉각적 조치사항 포함
   - 상담일지 전체를 읽지 않아도 사건의 전모를 파악할 수 있도록 작성

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

1. 📝 적극적인 정보 기록
   - 녹취록에서 언급된 내용은 모두 기록하세요
   - 직접 언급되지 않아도 대화 맥락에서 추론 가능한 정보는 "대화 내용으로 유추" 표시와 함께 기록
   - "미입력"은 정말 정보가 없을 때만 사용하세요
   - 예: 대화에서 "아들이"라고 했다면 → 성별: 남, 관계: 아들(친자)

2. 📋 구체적이고 상세한 기록
   - 녹취록의 대화 내용을 있는 그대로 상세히 기록
   - 5W1H 원칙 준수: 언제, 어디서, 누가, 무엇을, 어떻게, 왜
   - 숫자, 시간, 장소 등은 정확히 기록
   - 신고자나 피해자의 말투, 감정 상태도 기록

3. 🎯 맥락 활용
   - 상담 전체 흐름을 파악하여 정보 간 연결
   - 앞뒤 대화에서 동일 인물/상황에 대한 추가 정보 통합
   - 일관성 있게 정보 정리

4. ⚖️ 객관적 사실과 추론 구분
   - 직접 언급된 사실: 그대로 기록
   - 합리적 추론: "(대화 내용으로 추정)" 표시
   - 불확실한 내용: 정확히 표현 ("~라고 함", "~라고 주장")

5. 🔍 정확한 용어 사용
   - 노인보호 업무 표준 용어 사용
   - 학대유형은 정확한 분류 기준 적용
   - 시간순 서술: 과거-현재-미래 구분 명확히

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

다음 JSON 형식으로 상세히 응답하세요:
{
  "상담요약": "전체 상담 내용을 3-5문장으로 핵심만 요약 (필수)",
  "신고자정보": {
    "신고자명": "녹취록에서 확인된 이름 or 미확인",
    "관계": "피해노인과의 관계 (대화에서 추론 가능하면 기록)",
    "연락처": "전화번호 or 미확인",
    "신고경위": "신고 동기와 경위를 상세히 기록 (최소 2-3문장)"
  },
  "피해노인정보": {
    "성명": "녹취록에서 확인된 이름 (별명, 호칭도 가능) or 미확인",
    "성별": "남/여 (대화에서 추론 가능하면 기록)",
    "생년월일": "YYYY-MM-DD or 연령으로 추정 or 미확인",
    "연령": "구체적 나이 or 대략적 연령대 (예: 70대 후반) or 미확인",
    "연락처": "전화번호 or 미확인",
    "주소": "상세 주소 or 대략적 지역 (시/구 정도라도 기록)",
    "건강상태": {
      "신체": "언급된 질병, 장애, 거동 상태 등 모두 기록 (없으면 '특이사항 없음')",
      "정신": "치매, 인지능력, 의사소통 능력 등 기록 (없으면 '특이사항 없음')",
      "복용약물": "언급된 약물 or 없음"
    },
    "경제상태": "수입원, 경제적 어려움, 재산 상태 등 언급된 내용 모두 기록",
    "가족관계": "가족 구성, 관계, 거주 형태 등 상세히 기록",
    "주돌봄제공자": "누가 돌보는지 or 독거 여부 기록"
  },
  "행위자정보": {
    "성명": "이름 or 호칭 (예: 아들, 며느리) or 미확인",
    "관계": "구체적 관계 (예: 장남, 차남, 시설 요양보호사 등)",
    "성별": "남/여 (관계에서 추론 가능하면 기록)",
    "연령": "구체적 나이 or 연령대 or 미확인",
    "연락처": "전화번호 or 미확인",
    "특성": "직업, 경제상태, 음주/약물, 정신질환, 성격 등 언급된 모든 특성 상세히 기록"
  },
  "학대내용": {
    "학대유형": "구체적 유형 명시 (복수 가능: 신체적+정서적 학대 등)",
    "발생시기": "언제부터, 얼마나 자주, 지속 기간 등 상세히",
    "발생장소": "구체적 장소 or 상황",
    "구체적행위": "5W1H로 매우 상세히 기록 (최소 3-5문장, 녹취록의 대화 내용 활용)",
    "심각성": "경미/중간/심각 (근거와 함께)",
    "증거": "언급된 증거 or 증거 가능성 or 없음"
  },
  "현재상태": {
    "신체상태": "외상, 영양, 위생 등 현재 상태 상세히",
    "정서상태": "감정, 심리 상태, 두려움, 불안 등 상세히",
    "생활환경": "거주 형태, 환경 위생, 안전 상태 등",
    "위험도": "낮음/중간/높음 (평가 근거 포함)"
  },
  "현장조사": {
    "실시여부": true or false,
    "방문일시": "날짜/시간 or null",
    "관찰내용": "현장에서 관찰한 내용 상세히 or null",
    "면담내용": "피해자/행위자/목격자 면담 내용 상세히 or null"
  },
  "즉시조치": {
    "응급조치": "취한 응급조치 상세히 or 없음",
    "분리보호": "분리보호 조치 내용 or 없음",
    "의료연계": "의료기관 연계 내용 or 없음",
    "기타조치": "기타 조치사항 or 없음"
  },
  "향후계획": {
    "단기계획": "1-2주 내 계획 구체적으로",
    "장기계획": "1-3개월 계획 구체적으로",
    "모니터링": "주기, 방법, 담당자 등 구체적으로",
    "연계기관": "필요한 연계기관 (법률, 의료, 복지 등) or 없음"
  },
  "상담원": "상담원 이름 or 미확인",
  "상담원의견": "상담원의 종합 의견과 사례 분석 (최소 3-4문장)",
  "특이사항": "기타 중요한 특이사항 or 없음"
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
          content: `다음은 ${getConsultationTypeText(consultationType)} 상담의 녹취록입니다. 

【중요】 
- 녹취록을 꼼꼼히 읽고 언급된 모든 정보를 빠짐없이 추출하세요
- 각 항목을 최대한 상세하게 작성하세요 (특히 학대내용, 구체적행위, 상담원의견)
- "미입력"은 정말 정보가 없을 때만 사용하세요
- 대화 내용에서 합리적으로 추론 가능한 정보는 모두 기록하세요
- 상담 요약은 반드시 작성하세요

녹취록:
${transcript}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // 일관성을 위해 낮은 temperature
      max_tokens: 4000 // 충분한 응답 길이 확보
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
      상담요약: analysisResult.상담요약 || '정보 없음',
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
