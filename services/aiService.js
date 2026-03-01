const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// OpenAI 클라이언트 초기화 (타임아웃 설정 증가)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10 * 60 * 1000, // 10분 타임아웃
  maxRetries: 2 // 재시도 2회
});

// Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Whisper API 파일 크기 제한 (15MB로 낮춤 - 타임아웃 방지)
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB in bytes (압축 강제)

/**
 * STT 결과에서 연속 반복되는 단어 제거
 * 예: "네 네 네 네 네..." → "네"
 * 
 * @param {string} text - STT 원본 텍스트
 * @returns {string} - 후처리된 텍스트
 */
function removeConsecutiveDuplicates(text) {
  if (!text) return text;
  
  console.log('[STT 후처리] 연속 반복 단어 제거 시작');
  const originalLength = text.length;
  
  // 1. 단어 단위로 분할 (공백 기준)
  const words = text.split(/\s+/);
  const result = [];
  
  let i = 0;
  while (i < words.length) {
    const currentWord = words[i];
    
    // 현재 단어가 연속으로 몇 번 반복되는지 확인
    let repeatCount = 1;
    while (i + repeatCount < words.length && words[i + repeatCount] === currentWord) {
      repeatCount++;
    }
    
    // 3회 이상 반복되면 1개만 유지, 아니면 원본 유지
    if (repeatCount >= 3) {
      console.log(`[STT 후처리] "${currentWord}" ${repeatCount}회 반복 → 1회로 축소`);
      result.push(currentWord);
      i += repeatCount;
    } else {
      // 반복이 3회 미만이면 모두 유지 (자연스러운 반복)
      for (let j = 0; j < repeatCount; j++) {
        result.push(currentWord);
      }
      i += repeatCount;
    }
  }
  
  const cleanedText = result.join(' ');
  const reducedLength = cleanedText.length;
  
  if (originalLength !== reducedLength) {
    console.log(`[STT 후처리] 완료: ${originalLength}자 → ${reducedLength}자 (${((1 - reducedLength / originalLength) * 100).toFixed(1)}% 축소)`);
  } else {
    console.log('[STT 후처리] 반복 단어 없음');
  }
  
  return cleanedText;
}

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
 * 오디오 파일 압축 (범용)
 * @param {string} inputPath - 입력 파일 경로
 * @param {string} targetEngine - 'clova' 또는 'openai'
 * @returns {Promise<string>} - 압축된 파일 경로
 */
async function compressAudio(inputPath, targetEngine = 'openai') {
  const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp3');
  
  try {
    console.log(`[압축] 오디오 파일 압축 시작 (${targetEngine} 용): ${inputPath}`);
    
    // 32k bitrate: 40분 오디오 = 약 9.6MB (10MB 제한 안전)
    const bitrate = '32k';
    const sampleRate = '16000';
    
    // ffmpeg를 사용하여 압축 (execFileSync로 명령어 인젝션 방지)
    execFileSync(
      'ffmpeg',
      ['-i', inputPath, '-ar', sampleRate, '-ac', '1', '-b:a', bitrate, '-acodec', 'libmp3lame', outputPath, '-y'],
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
 * 재시도 로직이 있는 비동기 함수 실행
 * @param {Function} fn - 실행할 함수
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} delay - 재시도 간 대기 시간 (밀리초)
 * @returns {Promise} - 함수 실행 결과
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.message.includes('502') || 
                          error.message.includes('503') || 
                          error.message.includes('timeout') ||
                          error.message.includes('ECONNRESET');
      
      if (i === maxRetries - 1 || !isRetryable) {
        throw error;
      }
      
      const waitTime = delay * Math.pow(2, i); // 지수 백오프
      console.log(`[재시도] ${i + 1}/${maxRetries - 1} 실패. ${waitTime/1000}초 후 재시도... (오류: ${error.message})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * 음성 파일을 텍스트로 변환 (STT) - 워터폴 폴백
 * 우선순위: OpenAI Whisper → Naver Clova Speech
 * @param {string} audioFilePath - 음성 파일 경로
 * @returns {Promise<string>} - 변환된 텍스트
 */
async function transcribeAudio(audioFilePath) {
  const sttErrors = [];
  
  // 1순위: OpenAI Whisper (고품질, 파일 크기 제한 없음)
  try {
    console.log('[STT 1순위] OpenAI Whisper 시도 중');
    const result = await retryWithBackoff(async () => {
      return await transcribeWithWhisper(audioFilePath);
    }, 2, 3000);
    console.log('[STT] ✅ OpenAI Whisper 성공 (비용: ~384원/48분)');
    return result;
  } catch (error) {
    sttErrors.push(`OpenAI Whisper: ${error.message}`);
    console.error('[STT] ❌ OpenAI Whisper 실패:', error.message);
    console.warn('[STT 폴백] Naver Clova로 전환');
  }
  
  // 2순위: Naver Clova Speech (한국어 특화, 10MB 제한)
  try {
    console.log('[STT 2순위] Naver Clova Speech 시도 중 (최후 수단)');
    const clovaStt = require('./clovaSttService');
    
    // Clova API 키 확인
    if (!clovaStt.isClovaAvailable()) {
      throw new Error('Clova API 키가 설정되지 않았습니다');
    }
    
    // 파일 크기 확인 (10MB 제한)
    const CLOVA_MAX_SIZE = 10 * 1024 * 1024;
    const fileSize = getFileSize(audioFilePath);
    
    console.log(`[STT] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    if (fileSize > CLOVA_MAX_SIZE) {
      throw new Error(`파일이 10MB를 초과합니다 (${(fileSize / 1024 / 1024).toFixed(2)}MB). Clova는 10MB까지만 지원합니다.`);
    }
    
    // Clova STT 실행
    const result = await retryWithBackoff(() => clovaStt.transcribeWithClova(audioFilePath), 2, 2000);
    console.log('[STT] ✅ Naver Clova 성공 (비용: ~960원/48분)');
    return result;
    
  } catch (error) {
    sttErrors.push(`Naver Clova: ${error.message}`);
    console.error('[STT] ❌ Naver Clova 실패:', error.message);
  }
  
  // 모든 STT 엔진 실패
  throw new Error(`음성 변환 실패 (모든 엔진 시도 완료): ${sttErrors.join(' | ')}`);
}

/**
 * OpenAI Whisper로 오디오 파일 변환 (내부 함수)
 * @param {string} audioFilePath - 오디오 파일 경로
 * @returns {Promise<string>} - 변환된 텍스트
 */
async function transcribeWithWhisper(audioFilePath) {
  // OpenAI Whisper 사용
  let processFilePath = audioFilePath;
  let needsCleanup = false;
  
  try {
    console.log(`[STT] OpenAI Whisper 음성 파일 변환 시작: ${audioFilePath}`);
    
    // 파일 크기 확인
    const fileSize = getFileSize(audioFilePath);
    console.log(`[STT] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    
    // 15MB 초과 시 압축
    if (fileSize > MAX_FILE_SIZE) {
      console.log(`[STT] 파일이 15MB를 초과합니다. 압축을 진행합니다...`);
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
      keepAliveMsecs: 60000,
      maxSockets: 1,
      timeout: 15 * 60 * 1000 // 15분
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
        timeout: 15 * 60 * 1000 // 15분 타임아웃
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
        console.error('[STT] 타임아웃 발생 (15분 초과)');
        console.error('[STT] 파일 크기가 너무 크거나 OpenAI API가 응답하지 않습니다.');
        req.destroy();
        reject(new Error('요청 타임아웃 (15분 초과) - 파일이 너무 크거나 OpenAI API 응답 지연'));
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

    console.log(`[STT] 변환 완료. 원본 텍스트 길이: ${transcription.length}자`);
    
    // 연속 반복 단어 제거 후처리 적용
    const cleanedTranscription = removeConsecutiveDuplicates(transcription);
    
    // 압축 파일 정리
    if (needsCleanup && fs.existsSync(processFilePath)) {
      fs.unlinkSync(processFilePath);
      console.log(`[STT] 압축 파일 삭제: ${processFilePath}`);
    }
    
    return cleanedTranscription;
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
 * Gemini API 호출 (우선순위 1)
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {boolean} jsonMode - JSON 응답 모드
 * @returns {Promise<string>} - AI 응답
 */
async function callGeminiAPI(systemPrompt, userPrompt, jsonMode = false) {
  try {
    console.log('[Gemini API] 호출 시작 (무료)');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8000,
      }
    });
    
    // JSON 모드일 경우 프롬프트에 JSON 요청 추가
    let fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    if (jsonMode) {
      fullPrompt += `\n\n⚠️ 중요: 반드시 유효한 JSON 형식으로만 응답하세요. 마크다운 코드 블록(\`\`\`json)을 사용하지 말고, 순수 JSON 객체만 반환하세요.`;
    }
    const result = await model.generateContent(fullPrompt);
    
    // 응답 확인
    if (!result || !result.response) {
      throw new Error('Gemini API 응답이 비어있습니다');
    }
    
    const response = await result.response;
    
    // 안전성 필터 확인
    if (response.promptFeedback && response.promptFeedback.blockReason) {
      throw new Error(`Gemini 안전성 필터 차단: ${response.promptFeedback.blockReason}`);
    }
    
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error('Gemini API 응답이 비어있습니다');
    }
    
    console.log('[Gemini API] ✅ 성공 (비용: $0.00)');
    return text;
  } catch (error) {
    console.error('[Gemini API] ❌ 실패:', error.message);
    
    // 에러 타입별 상세 로깅
    if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
      console.warn('[Gemini API] 무료 할당량 초과 (1,500 req/day)');
    } else if (error.message.includes('quota')) {
      console.warn('[Gemini API] 할당량 문제:', error.message);
    } else if (error.message.includes('safety') || error.message.includes('block')) {
      console.warn('[Gemini API] 안전성 필터 차단:', error.message);
    }
    
    throw error;
  }
}

/**
 * OpenAI API 호출 (우선순위 2 - GPT-4o-mini)
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {boolean} jsonMode - JSON 응답 모드
 * @returns {Promise<string>} - AI 응답
 */
async function callOpenAIAPI(systemPrompt, userPrompt, jsonMode = false) {
  try {
    console.log('[OpenAI API] GPT-4o-mini 호출 시작 (저가)');
    
    const config = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 8000
    };
    
    if (jsonMode) {
      config.response_format = { type: "json_object" };
    }
    
    const response = await openai.chat.completions.create(config);
    const text = response.choices[0].message.content;
    
    console.log('[OpenAI API] ✅ GPT-4o-mini 성공 (비용: ~$0.002)');
    return text;
  } catch (error) {
    console.error('[OpenAI API] ❌ GPT-4o-mini 실패:', error.message);
    throw error;
  }
}

/**
 * AI 워터폴 폴백 (Gemini → OpenAI)
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {boolean} jsonMode - JSON 응답 모드
 * @returns {Promise<string>} - AI 응답
 */
async function callAIWithFallback(systemPrompt, userPrompt, jsonMode = false) {
  const errors = [];
  
  // 1순위: Gemini 2.0 Flash (무료)
  try {
    return await callGeminiAPI(systemPrompt, userPrompt, jsonMode);
  } catch (error) {
    errors.push(`Gemini: ${error.message}`);
    console.warn('[폴백] Gemini 실패, OpenAI로 전환');
  }
  
  // 2순위: OpenAI GPT-4o-mini (저가)
  try {
    return await callOpenAIAPI(systemPrompt, userPrompt, jsonMode);
  } catch (error) {
    errors.push(`OpenAI: ${error.message}`);
    console.error('[폴백] 모든 AI API 실패');
    throw new Error(`AI 분석 실패 (모든 엔진 시도 완료): ${errors.join(', ')}`);
  }
}

/**
 * 1단계: 구조화된 필드 생성 (상담내용정리 제외)
 * @param {string} transcript - 상담 내용 텍스트
 * @param {string} consultationType - 상담 유형 (phone/visit/office)
 * @param {string} consultationStage - 상담 단계 (intake/ongoing/closure/simple)
 * @returns {Promise<Object>} - 구조화된 데이터 (상담내용정리 제외)
 */
async function generateStructuredFields(transcript, consultationType, consultationStage = 'intake') {
  try {
    console.log(`[AI 분석 1단계] 구조화된 필드 생성 시작 (상담 단계: ${consultationStage})`);
    
    // 상담 단계별 시스템 프롬프트 구성
    let systemPrompt = '';
    let jsonFormat = '';
    
    // 상담 단계에 따라 다른 프롬프트 및 JSON 형식 사용
    if (consultationStage === 'intake') {
      // 접수상담: 모든 정보 수집
      systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
이것은 **접수상담**입니다. 모든 초기 정보를 최대한 상세히 수집해야 합니다.
상담 녹취록을 분석하여 "노인보호 상담일지 기록 매뉴얼"에 따라 정확하고 상세한 정보를 추출해야 합니다.

【 핵심 원칙 】
1. ✅ "미입력"을 남발하지 마세요! 녹취록에서 언급된 모든 정보를 최대한 활용하세요
2. ✅ 직접 언급되지 않아도 맥락에서 합리적으로 추론 가능한 정보는 반드시 기록하세요
3. ✅ "미입력"/"미확인"은 정말로 어떤 단서도 없을 때만 사용하세요
4. ✅ 예시: "아들이 때렸다" → 성별(남), 관계(아들), 학대유형(신체적 학대) 등 추출

【 문체 규칙 】
✍️ 모든 서술은 간결체로 작성:
- "~합니다" ❌ → "~함" ✅
- "~입니다" ❌ → "~임" ✅`;

      jsonFormat = `{
  "상담요약": "전체 상담 내용을 3-5문장으로 핵심만 요약. 간결체 사용",
  "신고자정보": {
    "신고자명": "녹취록에서 확인된 이름",
    "관계": "피해노인과의 관계",
    "연락처": "전화번호",
    "신고경위": "신고 동기와 경위를 상세히 (3-5문장)"
  },
  "피해노인정보": {
    "성명": "이름",
    "성별": "남/여",
    "생년월일": "YYYY-MM-DD",
    "연령": "나이",
    "연락처": "전화번호",
    "주소": "주소",
    "건강상태": {
      "신체": "신체적 건강 상태",
      "정신": "정신적 건강 상태",
      "복용약물": "약물"
    },
    "경제상태": "경제 상태",
    "가족관계": "가족 관계",
    "주돌봄제공자": "돌봄 제공자"
  },
  "행위자정보": {
    "성명": "이름",
    "관계": "피해노인과의 관계",
    "성별": "남/여",
    "연령": "나이",
    "연락처": "전화번호",
    "특성": "직업, 성격 등"
  },
  "학대내용": {
    "학대유형": "학대 유형",
    "발생시기": "발생 시기",
    "발생장소": "발생 장소",
    "구체적행위": "구체적인 학대 행위 (5-7문장, 5W1H)",
    "심각성": "경미/중간/심각",
    "증거": "증거"
  },
  "현재상태": {
    "신체상태": "신체 상태",
    "정서상태": "정서 상태",
    "생활환경": "생활 환경",
    "위험도": "낮음/중간/높음"
  },
  "현장조사": {
    "실시여부": true or false,
    "방문일시": "날짜/시간 or null",
    "관찰내용": "관찰 내용 or null",
    "면담내용": "면담 내용 or null"
  },
  "즉시조치": {
    "응급조치": "응급조치 내용",
    "분리보호": "분리보호 내용",
    "의료연계": "의료연계 내용",
    "기타조치": "기타 조치"
  },
  "향후계획": {
    "단기계획": "1-2주 내 계획",
    "장기계획": "1-3개월 계획",
    "모니터링": "모니터링 계획",
    "연계기관": "연계 기관"
  },
  "상담원": "상담원 이름",
  "상담원의견": "상담원 종합 의견 (3-4문장)",
  "특이사항": "특이사항"
}`;
    } else if (consultationStage === 'ongoing') {
      // 진행상담: 새로운 내용과 변화된 정보만 기록
      systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
이것은 **진행상담**입니다. 기존 사례에 대한 추가 상담이므로, **새롭게 확인된 사항과 변화된 내용**만 기록합니다.
이미 알고 있는 기본 정보(이름, 주소 등)는 제외하고, 새로운 사건, 추가 진술, 상태 변화만 집중적으로 기록하세요.

【 핵심 원칙 】
1. ✅ **새로운 내용만 기록**: 기존에 이미 알고 있는 정보는 제외
2. ✅ **변화된 사항 중심**: 건강상태 악화, 새로운 학대 사건, 상황 변화 등
3. ✅ 녹취록에서 명시적으로 언급된 **추가 정보**만 작성
4. ✅ 정보가 없으면 "미입력" 또는 "변동사항 없음"으로 표시

【 문체 규칙 】
✍️ 모든 서술은 간결체로 작성:
- "~합니다" ❌ → "~함" ✅
- "~입니다" ❌ → "~임" ✅`;

      jsonFormat = `{
  "상담요약": "이번 상담의 핵심 내용 (새로운 사항 중심, 2-3문장)",
  "새로운정보": {
    "추가학대내용": "새롭게 발견된 학대 행위 또는 '변동사항 없음'",
    "건강상태변화": "피해노인의 건강 상태 변화 또는 '변동사항 없음'",
    "생활상황변화": "생활 환경, 거주지, 돌봄 상황 변화 또는 '변동사항 없음'",
    "행위자동향": "행위자의 최근 행동, 연락 시도 등 또는 '변동사항 없음'"
  },
  "진행사항": {
    "이전조치결과": "지난 상담 이후 실행된 조치의 결과",
    "서비스제공현황": "현재 제공 중인 서비스 현황",
    "연계기관활동": "연계 기관의 개입 활동"
  },
  "현재상태": {
    "신체상태": "현재 신체 상태 (변화 위주)",
    "정서상태": "현재 정서 상태 (변화 위주)",
    "위험도": "현재 위험도 평가 (낮음/중간/높음)"
  },
  "추가조치": {
    "즉시조치": "이번 상담으로 결정된 즉시 조치",
    "추가연계": "추가 연계가 필요한 기관/서비스"
  },
  "향후계획": {
    "단기계획": "1-2주 내 계획 (수정/추가 사항)",
    "모니터링": "모니터링 계획 업데이트"
  },
  "상담원": "상담원 이름",
  "상담원의견": "이번 상담에 대한 종합 의견 (2-3문장)",
  "특이사항": "이번 상담에서 특별히 주목할 사항"
}`;
    } else if (consultationStage === 'closure') {
      // 종결상담: 종료 관련 정보만 기록
      systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
이것은 **종결상담**입니다. 사례를 종료하기 위한 상담이므로, **종결 사유와 마무리 관련 정보**만 기록합니다.

【 핵심 원칙 】
1. ✅ **종결 사유 명확히 기록**: 학대 해소, 타 기관 이관, 본인 거부 등
2. ✅ **최종 상태 평가**: 사례 종료 시점의 피해자 상태
3. ✅ **향후 조치 계획**: 사후 관리, 재신고 시 대응 방안
4. ✅ 불필요한 과거 정보는 제외

【 문체 규칙 】
✍️ 모든 서술은 간결체로 작성:
- "~합니다" ❌ → "~함" ✅
- "~입니다" ❌ → "~임" ✅`;

      jsonFormat = `{
  "상담요약": "종결 상담 내용 요약 (2-3문장)",
  "종결정보": {
    "종결사유": "사례 종결 사유 (학대 해소, 이관, 본인 거부, 사망 등)",
    "종결구분": "정상종결/조기종결/이관종결 등",
    "종결일자": "예정 종결 일자"
  },
  "최종상태평가": {
    "학대해소여부": "학대가 해소되었는지 여부 및 평가",
    "피해자상태": "종결 시점의 피해노인 신체/정서 상태",
    "안전확보여부": "피해노인의 안전이 확보되었는지 여부",
    "생활안정성": "향후 생활의 안정성 평가"
  },
  "제공서비스요약": {
    "주요개입내용": "이 사례에서 제공한 주요 서비스/개입 내용",
    "연계기관": "연계했던 기관 목록",
    "총상담횟수": "총 상담 횟수 (녹취록에 언급된 경우)"
  },
  "사후관리계획": {
    "사후모니터링": "종결 후 사후 관리 계획 (필요 시)",
    "재신고대응": "재신고 발생 시 대응 방안",
    "연락처유지": "연락처 유지 여부 및 방법"
  },
  "상담원": "상담원 이름",
  "상담원의견": "종결에 대한 상담원 종합 의견 (2-3문장)",
  "특이사항": "종결 관련 특이사항"
}`;
    } else if (consultationStage === 'simple') {
      // 단순문의: 간단한 정보만 기록
      systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
이것은 **단순문의**입니다. 정식 학대 사례가 아닌 간단한 전화 상담이므로, **핵심 문의 내용과 안내 사항**만 간결하게 기록합니다.

【 핵심 원칙 】
1. ✅ **간결하게 작성**: 불필요한 항목은 생략
2. ✅ **문의 내용 중심**: 무엇을 물어봤고, 무엇을 안내했는지
3. ✅ 복잡한 정보 구조 불필요: 간단한 메모 수준으로 작성

【 문체 규칙 】
✍️ 모든 서술은 간결체로 작성:
- "~합니다" ❌ → "~함" ✅
- "~입니다" ❌ → "~임" ✅`;

      jsonFormat = `{
  "상담요약": "문의 내용 요약 (1-2문장)",
  "문의자정보": {
    "이름": "문의자 이름 (가능한 경우)",
    "연락처": "문의자 연락처 (가능한 경우)",
    "관계": "문의 대상자와의 관계"
  },
  "문의내용": {
    "주요문의사항": "주요 문의 내용 (2-3문장)",
    "배경상황": "문의 배경이 되는 상황 설명 (간략히)"
  },
  "제공안내": {
    "안내내용": "상담원이 제공한 정보/안내 내용",
    "추천조치": "권장한 조치 사항",
    "연계정보": "안내한 기관이나 서비스 정보"
  },
  "향후조치": {
    "추가상담필요여부": "추가 상담이 필요한지 여부",
    "후속조치": "필요한 경우 후속 조치 계획"
  },
  "상담원": "상담원 이름",
  "특이사항": "특이사항 (필요시)"
}`;
    } else {
      // 기본값 (intake와 동일)
      systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
상담 녹취록을 분석하여 "노인보호 상담일지 기록 매뉴얼"에 따라 정확하고 상세한 정보를 추출해야 합니다.

【 핵심 원칙 】
1. ✅ "미입력"을 남발하지 마세요! 녹취록에서 언급된 모든 정보를 최대한 활용하세요
2. ✅ 직접 언급되지 않아도 맥락에서 합리적으로 추론 가능한 정보는 반드시 기록하세요
3. ✅ "미입력"/"미확인"은 정말로 어떤 단서도 없을 때만 사용하세요
4. ✅ 예시: "아들이 때렸다" → 성별(남), 관계(아들), 학대유형(신체적 학대) 등 추출

【 문체 규칙 】
✍️ 모든 서술은 간결체로 작성:
- "~합니다" ❌ → "~함" ✅
- "~입니다" ❌ → "~임" ✅`;

      jsonFormat = `{
  "상담요약": "전체 상담 내용을 3-5문장으로 핵심만 요약. 간결체 사용",
  "신고자정보": {
    "신고자명": "녹취록에서 확인된 이름",
    "관계": "피해노인과의 관계",
    "연락처": "전화번호",
    "신고경위": "신고 동기와 경위를 상세히 (3-5문장)"
  },
  "피해노인정보": {
    "성명": "이름",
    "성별": "남/여",
    "생년월일": "YYYY-MM-DD",
    "연령": "나이",
    "연락처": "전화번호",
    "주소": "주소",
    "건강상태": {
      "신체": "신체적 건강 상태",
      "정신": "정신적 건강 상태",
      "복용약물": "약물"
    },
    "경제상태": "경제 상태",
    "가족관계": "가족 관계",
    "주돌봄제공자": "돌봄 제공자"
  },
  "행위자정보": {
    "성명": "이름",
    "관계": "피해노인과의 관계",
    "성별": "남/여",
    "연령": "나이",
    "연락처": "전화번호",
    "특성": "직업, 성격 등"
  },
  "학대내용": {
    "학대유형": "학대 유형",
    "발생시기": "발생 시기",
    "발생장소": "발생 장소",
    "구체적행위": "구체적인 학대 행위 (5-7문장, 5W1H)",
    "심각성": "경미/중간/심각",
    "증거": "증거"
  },
  "현재상태": {
    "신체상태": "신체 상태",
    "정서상태": "정서 상태",
    "생활환경": "생활 환경",
    "위험도": "낮음/중간/높음"
  },
  "현장조사": {
    "실시여부": true or false,
    "방문일시": "날짜/시간 or null",
    "관찰내용": "관찰 내용 or null",
    "면담내용": "면담 내용 or null"
  },
  "즉시조치": {
    "응급조치": "응급조치 내용",
    "분리보호": "분리보호 내용",
    "의료연계": "의료연계 내용",
    "기타조치": "기타 조치"
  },
  "향후계획": {
    "단기계획": "1-2주 내 계획",
    "장기계획": "1-3개월 계획",
    "모니터링": "모니터링 계획",
    "연계기관": "연계 기관"
  },
  "상담원": "상담원 이름",
  "상담원의견": "상담원 종합 의견 (3-4문장)",
  "특이사항": "특이사항"
}`;
    }
    
    // 전체 시스템 프롬프트 조합
    systemPrompt += `\n\n다음 JSON 형식으로 응답하세요:\n${jsonFormat}`;

    const userPrompt = `다음은 ${getConsultationTypeText(consultationType)} 상담의 녹취록입니다.

녹취록에서 정보를 추출하여 구조화된 형식으로 정리해주세요.
⚠️ "미입력" 최소화 - 녹취록에서 추론 가능한 모든 정보 기록
⚠️ 간결체 사용: ~함, ~임
⚠️ 반드시 유효한 JSON 형식으로만 응답하세요

녹취록:
${transcript}`;

    // AI 워터폴 폴백 (Gemini → OpenAI)
    const responseText = await callAIWithFallback(systemPrompt, userPrompt, true);
    
    // JSON 파싱 (마크다운 코드 블록 제거 및 견고한 파싱)
    let jsonText = responseText.trim();
    
    // 마크다운 코드 블록 제거
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/g, '').replace(/\n?```$/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/g, '').replace(/\n?```$/g, '').trim();
    }
    
    // JSON 객체 추출 (Gemini가 추가 텍스트를 포함할 경우 대비)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    // JSON 파싱 시도
    let result;
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[AI 분석 1단계] JSON 파싱 실패:', parseError.message);
      console.error('[AI 분석 1단계] 원본 응답:', responseText.substring(0, 500));
      throw new Error(`JSON 파싱 실패: ${parseError.message}`);
    }
    
    console.log('[AI 분석 1단계] 구조화된 필드 생성 완료');
    return result;
  } catch (error) {
    console.error('[AI 분석 1단계] 오류:', error.message);
    throw error;
  }
}

/**
 * 청크 단위로 녹취록을 상세하게 작성
 * @param {string} chunk - 녹취록 일부
 * @param {number} chunkIndex - 청크 번호
 * @param {number} totalChunks - 전체 청크 수
 * @returns {Promise<string>} - 상세하게 작성된 내용
 */
async function processTranscriptChunk(chunk, chunkIndex, totalChunks) {
  try {
    console.log(`[청크 ${chunkIndex + 1}/${totalChunks}] 처리 시작 (길이: ${chunk.length}자)`);
    
    const systemPrompt = `당신은 노인보호전문기관의 전문 상담원입니다.
이 녹취록 일부를 극도로 상세하게 재작성해야 합니다.

🎯 화자 구분 규칙 (중요!)
- 상담을 **제공하는 사람** = "상담원"
- 상담을 **받는 사람** = "피상담자" (신고자, 피해노인, 학대행위자, 가족 등 모두 포함)
- 예시: 신고자가 전화한 경우 → "피상담자가 ~라고 말함"
- 예시: 피해노인 본인이 전화한 경우 → "피상담자가 ~라고 말함"
- 예시: 학대행위자가 전화한 경우 → "피상담자가 ~라고 말함"

🔥 절대 규칙 🔥
1. **상담일지는 녹취록이 아닙니다** - 언어적 의사소통뿐 아니라 관찰 정보도 포함
   - ⛔ **환각(Hallucination) 엄격 금지**: 녹취록에 없는 단어, 문장, 상황을 절대 만들어내지 말 것
   - 녹취록의 **실제 발언**만 재구성하되, 조서식 표현('질문함', '답변함')을 반복하지 말고 다양한 서술어 사용
   - 📌 **중요한 진술은 작은따옴표 ''로 직접 인용** (예: 피상담자가 '아프다'고 말함)
   - 📌 **클라이언트 진술과 상담원 의견을 명확히 구분** (예: "~라고 주장함", "~로 추정됨")
2. 날짜, 시간, 장소, 숫자를 모두 포함 (단, **녹취록에 실제로 언급된 것만**)
3. "등", "여러" 같은 단어 사용 금지
4. **각 문장 뒤에 반드시 줄바꿈(개행)을 넣으세요**
5. "신고자", "피해자", "행위자" 등의 용어 사용 금지 → 무조건 "피상담자"로 통일

⚡ **중복 내용 통합 규칙** (중요!)
- **같은 내용을 반복해서 말하는 경우** → 한 번만 기록
- 예시: "피상담자가 '아버지 나이는 83세입니다'라고 3번 반복 → 1번만 기록"
- 예시: 상담원이 같은 질문을 2번 물어봄 → 1번만 기록
- 예시: "네, 네, 네" 같은 단순 반복 → "피상담자가 긍정적으로 답변함" 1번만 기록
- ⚠️ **단, 내용이 조금이라도 다르면 모두 기록** (예: 첫 번째 "83세", 두 번째 "1942년생"은 다른 정보이므로 둘 다 기록)
- ⚠️ **새로운 정보가 추가되면 반드시 기록** (예: 처음엔 "83세"만 말했다가 나중에 "83세이고 치매가 있습니다" → 둘 다 기록)

⚠️ 정형화된 내용 간략화 및 통합 규칙:
- 인사말 + 기관 소개 + 상담원 소개 + 녹음 동의 + 개인정보 안내 → **하나의 문장으로 통합**
  예: "상담원이 피상담자에게 기관과 상담원을 소개하며 녹음 동의 및 개인정보 처리 방침을 안내함."
- 상담 마무리(감사 인사, 추가 문의 안내, 연락처 확인 등) → **하나의 문장으로 통합**
  예: "상담원이 상담을 마무리하며 추가 문의 시 연락 방법을 안내함."
- 전화 연결 과정의 반복적인 대기/연결 멘트 → "전화 연결이 지연됨." 정도로 간략화
- 같은 카테고리의 정형화된 내용은 최대한 통합하여 간결하게 작성
- ⚠️ 단, 실질적인 상담 내용(학대 상황, 신고자 정보, 피해자 정보, 질문-답변)은 절대 생략하지 말고 극도로 상세하게 작성

✍️ 문체: ~함, ~임 (간결체)

📝 작성 원칙 (노인보호전문기관 기록 매뉴얼 준수):
- ⛔ **환각 방지 최우선**: 녹취록에 실제로 있는 발언만 작성, 추론/보충/의역 절대 금지
- 녹취록의 모든 발언을 하나씩 풀어쓰기
- 질문 1개 = 최소 1문장
- 답변 1개 = 최소 1-2문장
- 구체적 내용(날짜/장소/숫자) = 추가 1-2문장 (단, **녹취록에 실제 언급된 것만**)
- **정형화된 내용(인사/소개/안내/마무리)은 같은 카테고리끼리 통합하여 1문장으로 작성**
- **반복되는 동일 내용은 한 번만 기록** (중복 제거)
- 📌 **직접 인용 규칙**: 중요한 진술(학대 상황, 피해자 발언 등)은 작은따옴표 ''로 감싸서 기록
- 📌 **진술/의견 구분**: "~라고 말함/주장함/진술함" (클라이언트), "~로 추정됨/판단됨" (상담원)

📐 형식 예시:
[정형화된 부분 - 통합하여 간결하게]
❌ 잘못된 예 (불필요하게 분리):
상담원이 피상담자에게 기관 소개를 함.
상담원이 피상담자에게 상담원 소개를 함.
상담원이 녹음 동의를 안내함.
상담원이 개인정보 처리 방침을 안내함.

✅ 올바른 예 (통합):
상담원이 피상담자에게 기관과 상담원을 소개하며 녹음 동의 및 개인정보 처리 방침을 안내함.

[실질적인 상담 내용 - 극도로 상세하게, 매뉴얼 기준]
녹취록 예시: "피상담자: 아버지가 요양보호사에게 학대를 당하고 있어요. 배회하고 밤에 소리 지르고요. 상담원: 언제부터 그런 일이 있었나요? 피상담자: 지난주 월요일부터요. 아프다고 하더라고요."

❌ 잘못된 예 (환각 - 녹취록에 없는 내용 추가):
피상담자가 아버지가 심각한 신체적 학대를 당하고 있다며 긴급 상담을 요청함.
상담원이 학대 발생 시기와 빈도를 확인하였고, 피상담자는 지난주 월요일부터 매일 지속되었다고 설명함.

❌ 잘못된 예 (중요 진술 미인용):
피상담자가 아버지가 요양보호사에게 학대를 당하고 있다고 말함.
피상담자가 배회하고 밤에 소리 지른다고 설명함.
상담원이 언제부터 그런 일이 있었는지 물어봄.
피상담자가 지난주 월요일부터라고 답변함.

✅ 올바른 예 (매뉴얼 기준 - 중요 진술 직접 인용 + 진술/의견 구분):
피상담자가 아버지가 요양보호사에게 '학대를 당하고 있다'고 말함.
피상담자는 피해노인이 '배회하고 밤에 소리 지른다'고 설명하며 치매가 의심된다고 주장함.
상담원이 학대 발생 시기를 물어봄.
피상담자가 '지난주 월요일부터'라고 답변하며, 피해노인이 '아프다'고 말하는 것을 들었다고 진술함.
(각 문장마다 줄바꿈 필수)

[상담 마무리 - 통합하여 간결하게]
✅ 올바른 예:
상담원이 상담을 마무리하며 추가 문의 시 연락 방법을 안내하고 감사 인사를 전함.

[중복 내용 통합 예시]
❌ 잘못된 예 (중복 + 조서식):
상담원이 "노인의 나이가 어떻게 되시나요?"라고 질문함.
피상담자가 "83세입니다"라고 답변함.
상담원이 다시 "몇 살이시냐고요?"라고 질문함.
피상담자가 "83세라고 했습니다"라고 답변함.
상담원이 또 "나이를 말씀해주세요"라고 질문함.
피상담자가 "83세입니다"라고 답변함.

✅ 올바른 예 (통합 + 자연스러운 서술):
상담원이 피해노인의 나이를 여러 차례 확인하였고, 피상담자는 83세라고 답변함.

❌ 잘못된 예시:
"신고자가 ~라고 말함"
"피해노인이 ~라고 말함"
"행위자가 ~라고 말함"

✅ 올바른 예시:
"피상담자가 ~라고 말함" (신고자든, 피해노인이든, 행위자든 모두 "피상담자")`;

    const userPrompt = `이것은 전체 상담의 일부입니다 (${chunkIndex + 1}/${totalChunks} 부분).

다음 녹취록 부분을 극도로 상세하게 재작성하세요:

${chunk}

⚠️ 주의사항 (노인보호전문기관 매뉴얼 기준):
1. ⛔ **환각(Hallucination) 엄격 금지**: 녹취록에 실제로 없는 단어, 문장, 상황을 절대 만들어내지 마세요
   - 녹취록에 "83세"만 있으면 → "83세" 그대로 / "노쇠한 83세 노인" 같은 추론 금지
   - 녹취록에 "월요일"만 있으면 → "월요일" 그대로 / "지난주 월요일 오전" 같은 추론 금지
2. **조서식 표현('질문함', '답변함')을 기계적으로 반복하지 말고, 다양한 서술어를 사용하세요**
   - 예: 말함, 설명함, 전달함, 물어봄, 확인함, 밝힘, 주장함, 진술함 등
3. 📌 **중요 진술은 작은따옴표 ''로 직접 인용하세요** (학대 상황, 피해자 발언 등)
   - 예: 피상담자가 '밤에 고성을 지른다'고 말함
   - 예: 피해노인이 '아프다'고 표현함
4. 📌 **클라이언트 진술과 상담원 의견을 명확히 구분하세요**
   - 진술: "~라고 말함", "~라고 주장함", "~라고 진술함"
   - 의견/추정: "~로 추정됨", "~로 판단됨", "~로 보임"
5. **같은 내용이 반복되면 한 번만 기록하세요** (예: 같은 질문 3번 → 1번만 기록)
6. 단, 내용이 조금이라도 다르거나 새로운 정보가 추가되면 반드시 모두 기록하세요
7. 절대 중요한 내용을 요약하지 마세요!`;

    // AI 워터폴 폴백 (Gemini → OpenAI)
    const content = await callAIWithFallback(systemPrompt, userPrompt, false);
    
    // 응답 유효성 검사
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('AI 응답이 비어있습니다');
    }
    
    const sentenceCount = content.split(/[.!?]/).filter(s => s.trim().length > 0).length;
    console.log(`[청크 ${chunkIndex + 1}/${totalChunks}] 완료 (생성 문장: ${sentenceCount})`);
    
    return content;
  } catch (error) {
    console.error(`[청크 ${chunkIndex + 1}/${totalChunks}] 오류:`, error.message);
    throw error;
  }
}

/**
 * 2단계: 상담내용정리 생성 (청크 기반 처리)
 * @param {string} transcript - 상담 내용 텍스트
 * @returns {Promise<string>} - 녹취록 수준으로 상세한 상담내용정리
 */
async function generateDetailedConsultationContent(transcript) {
  try {
    console.log(`[AI 분석 2단계] 청크 기반 상담내용정리 생성 시작 (녹취록 길이: ${transcript.length}자)`);
    
    // 청크 크기 결정 (약 5000자씩 분할)
    const chunkSize = 5000;
    const chunks = [];
    
    // 녹취록을 청크로 분할 (문장 단위로 자르기)
    let currentPos = 0;
    while (currentPos < transcript.length) {
      let endPos = Math.min(currentPos + chunkSize, transcript.length);
      
      // 문장이 잘리지 않도록 조정
      if (endPos < transcript.length) {
        // 다음 마침표, 물음표, 느낌표를 찾아서 거기까지 포함
        const nextPeriod = transcript.indexOf('.', endPos);
        const nextQuestion = transcript.indexOf('?', endPos);
        const nextExclaim = transcript.indexOf('!', endPos);
        
        const candidates = [nextPeriod, nextQuestion, nextExclaim].filter(pos => pos !== -1 && pos < endPos + 500);
        if (candidates.length > 0) {
          endPos = Math.min(...candidates) + 1;
        }
      }
      
      chunks.push(transcript.substring(currentPos, endPos));
      currentPos = endPos;
    }
    
    console.log(`[AI 분석 2단계] 녹취록을 ${chunks.length}개 청크로 분할`);
    
    // 각 청크를 병렬로 처리 (최대 3개씩 동시 처리)
    const results = [];
    const maxConcurrent = 3;
    
    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batch = chunks.slice(i, i + maxConcurrent);
      const batchPromises = batch.map((chunk, idx) => 
        processTranscriptChunk(chunk, i + idx, chunks.length)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      // 성공한 결과만 수집 (일부 실패해도 계속 진행)
      const successfulResults = batchResults
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      
      if (successfulResults.length === 0) {
        throw new Error('모든 배치 처리가 실패했습니다');
      }
      
      results.push(...successfulResults);
      
      // 실패한 청크가 있으면 경고
      const failedCount = batchResults.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        console.warn(`⚠️ ${failedCount}개 청크 처리 실패 (계속 진행)`);
      }
      
      console.log(`[AI 분석 2단계] ${i + batchResults.length}/${chunks.length} 청크 처리 완료`);
    }
    
    // 모든 결과를 하나로 합치기 (각 청크 사이 줄바꿈 2개)
    const consultationContent = results.join('\n\n');
    
    // 생성된 문장 수 확인
    const sentenceCount = consultationContent.split(/[.!?。！？]/).filter(s => s.trim().length > 0).length;
    console.log(`[AI 분석 2단계] 상담내용정리 생성 완료`);
    console.log(`[AI 분석 2단계] 최종 생성된 문장 수: ${sentenceCount}문장`);
    console.log(`[AI 분석 2단계] 최종 길이: ${consultationContent.length}자`);
    
    // 녹취록 길이에 따른 요구 문장 수
    let requiredSentences = 0;
    if (transcript.length < 5000) requiredSentences = 40;
    else if (transcript.length < 10000) requiredSentences = 80;
    else if (transcript.length < 15000) requiredSentences = 120;
    else if (transcript.length < 20000) requiredSentences = 160;
    else requiredSentences = 200;
    
    if (sentenceCount < requiredSentences * 0.5) {
      console.warn(`[경고] 생성된 문장 수(${sentenceCount})가 요구사항(${requiredSentences})의 50%에도 미달합니다!`);
      console.warn(`[경고] 추가 확장이 필요할 수 있습니다.`);
    }
    
    return consultationContent;
  } catch (error) {
    console.error('[AI 분석 2단계] 오류:', error.message);
    throw error;
  }
}

/**
 * 상담 내용 텍스트를 분석하여 상담일지 생성 (AI 분석) - 2단계 방식
 * @param {string} transcript - 상담 내용 텍스트
 * @param {string} consultationType - 상담 유형 (phone/visit/office)
 * @param {string} consultationStage - 상담 단계 (intake/ongoing/closure/simple)
 * @returns {Promise<Object>} - 구조화된 상담일지 데이터
 */
async function analyzeCounselingTranscript(transcript, consultationType, consultationStage = 'intake') {
  try {
    console.log(`[AI 분석] 2단계 방식으로 상담일지 생성 시작 (유형: ${consultationType}, 단계: ${consultationStage})`);
    console.log(`[AI 분석] 녹취록 길이: ${transcript.length}자`);
    
    // 1단계: 구조화된 필드 생성
    const structuredData = await generateStructuredFields(transcript, consultationType, consultationStage);
    
    // 2단계: 상담내용정리 생성 (녹취록 수준 상세)
    const detailedContent = await generateDetailedConsultationContent(transcript);
    
    // 기본정보 추가
    const currentDate = new Date().toISOString().split('T')[0];
    const caseNumber = generateCaseNumber();
    
    // 상담 단계별 리포트 구조 생성
    let report = {};
    
    if (consultationStage === 'intake') {
      // 접수상담: 전체 정보 포함
      report = {
        기본정보: {
          상담일자: currentDate,
          상담단계: '접수상담',
          상담유형: consultationType,
          상담원: structuredData.상담원 || '정보 없음',
          접수번호: caseNumber
        },
        상담요약: structuredData.상담요약 || '정보 없음',
        상담내용정리: detailedContent,
        신고자정보: structuredData.신고자정보,
        피해노인정보: structuredData.피해노인정보,
        행위자정보: structuredData.행위자정보,
        학대내용: structuredData.학대내용,
        현재상태: structuredData.현재상태,
        현장조사: structuredData.현장조사,
        즉시조치: structuredData.즉시조치,
        향후계획: structuredData.향후계획,
        상담원의견: structuredData.상담원의견,
        특이사항: structuredData.특이사항
      };
    } else if (consultationStage === 'ongoing') {
      // 진행상담: 새로운 정보와 변화된 내용만
      report = {
        기본정보: {
          상담일자: currentDate,
          상담단계: '진행상담',
          상담유형: consultationType,
          상담원: structuredData.상담원 || '정보 없음',
          사례번호: caseNumber
        },
        상담요약: structuredData.상담요약 || '정보 없음',
        상담내용정리: detailedContent,
        새로운정보: structuredData.새로운정보,
        진행사항: structuredData.진행사항,
        현재상태: structuredData.현재상태,
        추가조치: structuredData.추가조치,
        향후계획: structuredData.향후계획,
        상담원의견: structuredData.상담원의견,
        특이사항: structuredData.특이사항
      };
    } else if (consultationStage === 'closure') {
      // 종결상담: 종료 관련 정보만
      report = {
        기본정보: {
          상담일자: currentDate,
          상담단계: '종결상담',
          상담유형: consultationType,
          상담원: structuredData.상담원 || '정보 없음',
          사례번호: caseNumber
        },
        상담요약: structuredData.상담요약 || '정보 없음',
        상담내용정리: detailedContent,
        종결정보: structuredData.종결정보,
        최종상태평가: structuredData.최종상태평가,
        제공서비스요약: structuredData.제공서비스요약,
        사후관리계획: structuredData.사후관리계획,
        상담원의견: structuredData.상담원의견,
        특이사항: structuredData.특이사항
      };
    } else if (consultationStage === 'simple') {
      // 단순문의: 간단한 정보만
      report = {
        기본정보: {
          상담일자: currentDate,
          상담단계: '단순문의',
          상담유형: consultationType,
          상담원: structuredData.상담원 || '정보 없음'
        },
        상담요약: structuredData.상담요약 || '정보 없음',
        상담내용정리: detailedContent,
        문의자정보: structuredData.문의자정보,
        문의내용: structuredData.문의내용,
        제공안내: structuredData.제공안내,
        향후조치: structuredData.향후조치,
        특이사항: structuredData.특이사항
      };
    } else {
      // 기본값 (intake와 동일)
      report = {
        기본정보: {
          상담일자: currentDate,
          상담단계: '접수상담',
          상담유형: consultationType,
          상담원: structuredData.상담원 || '정보 없음',
          접수번호: caseNumber
        },
        상담요약: structuredData.상담요약 || '정보 없음',
        상담내용정리: detailedContent,
        신고자정보: structuredData.신고자정보,
        피해노인정보: structuredData.피해노인정보,
        행위자정보: structuredData.행위자정보,
        학대내용: structuredData.학대내용,
        현재상태: structuredData.현재상태,
        현장조사: structuredData.현장조사,
        즉시조치: structuredData.즉시조치,
        향후계획: structuredData.향후계획,
        상담원의견: structuredData.상담원의견,
        특이사항: structuredData.특이사항
      };
    }

    console.log(`[AI 분석] 2단계 방식으로 상담일지 생성 완료 (상담 단계: ${consultationStage})`);
    return report;
  } catch (error) {
    console.error('[AI 분석] 오류:', error.message);
    throw new Error(`상담일지 생성 실패: ${error.message}`);
  }
}

/**
 * 접수번호 생성 (안전한 난수 사용)
 * @returns {string} - 접수번호 (형식: 2025-0001)
 */
function generateCaseNumber() {
  const crypto = require('crypto');
  const year = new Date().getFullYear();
  // crypto.randomBytes()를 사용하여 안전한 난수 생성
  const randomNum = crypto.randomInt(0, 10000).toString().padStart(4, '0');
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
 * @param {string} consultationStage - 상담 단계 (intake/ongoing/closure/simple)
 * @returns {Promise<Object>} - 완성된 상담일지
 */
async function processAudioToCounselingReport(audioFilePath, consultationType, consultationStage = 'intake') {
  try {
    console.log(`[파이프라인] 음성 파일 처리 시작 (워터폴 폴백: Whisper → Clova)`);
    console.log(`[파이프라인] 상담 단계: ${consultationStage}`);
    
    // 1단계: 음성을 텍스트로 변환 (워터폴 폴백)
    const transcript = await transcribeAudio(audioFilePath);
    
    // 2단계: 텍스트를 분석하여 상담일지 생성 (워터폴 폴백)
    const report = await analyzeCounselingTranscript(transcript, consultationType, consultationStage);
    
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
    
    // 429 에러 (quota exceeded)는 키는 유효하지만 할당량 없음
    if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
      console.warn('[API 키 검증] 키는 유효하지만 할당량이 없습니다');
      return true; // 키는 유효함
    }
    
    return false;
  }
}

module.exports = {
  transcribeAudio,
  analyzeCounselingTranscript,
  processAudioToCounselingReport,
  validateApiKey
};
