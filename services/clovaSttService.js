const fs = require('fs');
const FormData = require('form-data');
const https = require('https');

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
 * 네이버 클로바 스피치 API를 사용한 음성 인식
 * 사투리 및 노인 음성 인식에 특화
 * 
 * @param {string} audioFilePath - 음성 파일 경로
 * @returns {Promise<string>} - 변환된 텍스트
 */
async function transcribeWithClova(audioFilePath) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`[Clova STT] 음성 파일 변환 시작: ${audioFilePath}`);
      
      const clientId = process.env.CLOVA_CLIENT_ID;
      const clientSecret = process.env.CLOVA_CLIENT_SECRET;
      
      // API 키 확인
      if (!clientId || !clientSecret || 
          clientId === 'your-clova-client-id-here' || 
          clientSecret === 'your-clova-client-secret-here') {
        console.warn('[Clova STT] API 키가 설정되지 않았습니다.');
        reject(new Error('클로바 API 키가 설정되지 않았습니다. .env 파일에서 CLOVA_CLIENT_ID와 CLOVA_CLIENT_SECRET을 설정해주세요.'));
        return;
      }
      
      const fileStream = fs.createReadStream(audioFilePath);
      const fileStats = fs.statSync(audioFilePath);
      
      console.log(`[Clova STT] 파일 크기: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB`);
      
      const options = {
        hostname: 'naveropenapi.apigw.ntruss.com',
        port: 443,
        path: '/recog/v1/stt?lang=Kor',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileStats.size,
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret
        }
      };
      
      const req = https.request(options, (res) => {
        console.log(`[Clova STT] 응답 상태: ${res.statusCode}`);
        
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const result = JSON.parse(data);
              
              if (result.text) {
                console.log(`[Clova STT] 변환 완료. 원본 텍스트 길이: ${result.text.length}자`);
                
                // 연속 반복 단어 제거 후처리 적용
                const cleanedText = removeConsecutiveDuplicates(result.text);
                
                resolve(cleanedText);
              } else {
                console.error('[Clova STT] 응답에 텍스트가 없습니다:', result);
                reject(new Error('음성 인식 결과가 없습니다.'));
              }
            } else {
              console.error('[Clova STT] API 오류:', data);
              reject(new Error(`클로바 API 오류 (${res.statusCode}): ${data}`));
            }
          } catch (error) {
            console.error('[Clova STT] 응답 파싱 오류:', error);
            reject(new Error(`응답 파싱 실패: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('[Clova STT] 요청 오류:', error);
        reject(new Error(`클로바 API 요청 실패: ${error.message}`));
      });
      
      req.on('timeout', () => {
        console.error('[Clova STT] 타임아웃 발생');
        req.destroy();
        reject(new Error('요청 타임아웃'));
      });
      
      // 타임아웃 설정 (10분)
      req.setTimeout(10 * 60 * 1000);
      
      console.log('[Clova STT] 파일 전송 시작...');
      fileStream.pipe(req);
      
    } catch (error) {
      console.error('[Clova STT] 오류:', error);
      reject(error);
    }
  });
}

/**
 * 클로바 API 키 유효성 확인
 * @returns {boolean} - API 키 설정 여부
 */
function isClovaAvailable() {
  const clientId = process.env.CLOVA_CLIENT_ID;
  const clientSecret = process.env.CLOVA_CLIENT_SECRET;
  
  return clientId && 
         clientSecret && 
         clientId !== 'your-clova-client-id-here' && 
         clientSecret !== 'your-clova-client-secret-here';
}

module.exports = {
  transcribeWithClova,
  isClovaAvailable
};
