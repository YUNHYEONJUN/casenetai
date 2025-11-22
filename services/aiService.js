const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * 음성 파일을 텍스트로 변환 (STT)
 * @param {string} audioFilePath - 음성 파일 경로
 * @returns {Promise<string>} - 변환된 텍스트
 */
async function transcribeAudio(audioFilePath) {
  try {
    console.log(`[STT] 음성 파일 변환 시작: ${audioFilePath}`);
    
    const audioFile = fs.createReadStream(audioFilePath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ko', // 한국어 설정
      response_format: 'text'
    });

    console.log(`[STT] 변환 완료. 텍스트 길이: ${transcription.length}자`);
    return transcription;
  } catch (error) {
    console.error('[STT] 오류:', error.message);
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
상담 녹취록을 분석하여 표준화된 상담일지를 작성하는 것이 당신의 역할입니다.

**노인보호전문기관 상담일지 작성 지침:**

1. **기본정보**
   - 상담원 이름을 찾아 기록
   - 상담 유형은 이미 지정됨

2. **피해노인 정보**
   - 성명, 성별, 연령, 연락처, 주소 등을 정확히 추출
   - 정보가 없으면 "정보 없음"으로 표시

3. **행위자 정보**
   - 학대 행위자의 성명, 피해노인과의 관계, 연령, 연락처
   - 관계는 가능한 구체적으로 (예: 아들, 며느리, 요양보호사 등)

4. **상담내용**
   - 신고경위: 누가, 왜 신고했는지
   - 학대유형: 신체적 학대, 정서적 학대, 성적 학대, 경제적 학대, 방임, 유기, 자기방임 중 해당 항목
   - 학대내용: 구체적인 학대 상황을 상세히 기록
   - 피해노인 상태: 신체적, 정신적 상태
   - 현장상황: 현재 상황 설명

5. **조치사항**
   - 즉시조치 내용: 상담 시 취한 즉각적인 조치
   - 연계기관: 경찰, 병원, 복지관 등 연계한 기관
   - 향후계획: 앞으로의 계획 및 후속조치

6. **특이사항**
   - 기타 중요한 사항이나 특이한 점

**주의사항:**
- 대화에서 직접 언급되지 않은 내용은 추측하지 마세요
- 명확하지 않은 정보는 "확인 필요" 또는 "정보 없음"으로 표시
- 학대 의심 사례는 객관적으로 기록하되, 단정적 표현은 피하세요
- 개인정보는 정확히 기록하되, 민감한 정보는 신중히 다루세요

다음 JSON 형식으로만 응답하세요:
{
  "피해노인정보": {
    "성명": "string",
    "성별": "남/여",
    "연령": "number",
    "연락처": "string",
    "주소": "string"
  },
  "행위자정보": {
    "성명": "string",
    "관계": "string",
    "연령": "number",
    "연락처": "string"
  },
  "상담내용": {
    "신고경위": "string",
    "학대유형": "string",
    "학대내용": "string",
    "피해노인상태": "string",
    "현장상황": "string"
  },
  "조치사항": {
    "즉시조치내용": "string",
    "연계기관": "string",
    "향후계획": "string"
  },
  "상담원": "string",
  "특이사항": "string"
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
      피해노인정보: analysisResult.피해노인정보,
      행위자정보: analysisResult.행위자정보,
      상담내용: analysisResult.상담내용,
      조치사항: analysisResult.조치사항,
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
