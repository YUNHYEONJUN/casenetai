/**
 * 상담일지 API (북서부인트라넷 포팅)
 * - 음성 → 텍스트 변환 (Whisper STT)
 * - 녹취록 → 상담일지 요약 (SSE 스트리밍)
 * - 오디오 → 상담일지 직접 생성 (GPT-4o-audio-preview)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../lib/logger');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10 * 60 * 1000
});

// Multer 설정 (음성 파일 업로드)
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, 'counsel-' + Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|wav|m4a|ogg|webm|aac|flac|wma)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헬퍼 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Whisper 환각(hallucination) 제거 — 반복 텍스트 정리
 */
function cleanWhisperText(text) {
  if (!text) return '';
  // 1) 같은 단어/구절이 5회 이상 연속 반복되는 패턴 제거
  let cleaned = text.replace(/(\S+(?:\s+\S+){0,3}?)(\s+\1){4,}/gi, '$1');
  // 2) 같은 문장이 3회 이상 반복되는 패턴 제거
  cleaned = cleaned.replace(/(.{4,80}?)\1{2,}/g, '$1');
  // 3) 비한국어 문자 블록 제거 (일본어/중국어 환각)
  cleaned = cleaned.replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]{10,}/g, '');
  // 4) 연속 공백 정리
  cleaned = cleaned.replace(/\s{3,}/g, ' ').trim();
  return cleaned;
}

/**
 * GPT 화자분리 — Whisper 결과를 [상담원]/[피상담자]로 분리
 */
async function diarizeSpeakers(rawText) {
  const prompt = `아래는 노인보호전문기관 상담 녹취록입니다. 상담원과 피상담자(상담을 받는 사람)의 발화를 구분하여 다시 작성하세요.

규칙:
1. 각 발화 앞에 [상담원] 또는 [피상담자]를 붙이세요
2. 상담원이 여러 명이면 [상담원1], [상담원2] 등으로 구분
3. 피상담자가 여러 명이면 [피상담자1], [피상담자2] 등으로 구분
4. 맥락으로 판단: 질문/안내/소개하는 쪽이 상담원, 답변/설명하는 쪽이 피상담자
5. 원문 내용을 절대 수정/요약/삭제하지 마세요. 화자 라벨만 추가
6. 각 발화마다 줄바꿈
7. 녹취록에서 피상담자의 이름과 직책이 언급되면(상담원이 "OOO 선생님"으로 부르거나, 자기소개 등), 맨 마지막 줄에 다음 형식으로 정리:
   [참고정보] 피상담자: OOO (직책), 상담원: OOO (직책)

녹취록:
${rawText}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: '당신은 녹취록 화자분리 전문가입니다. 원문을 수정하지 않고 화자 라벨만 정확히 추가합니다.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 8192,
      temperature: 0.15
    });
    return response.choices[0]?.message?.content || rawText;
  } catch (err) {
    logger.error('화자분리 실패', { error: err.message });
    return rawText;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상담일지 시스템 프롬프트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COUNSEL_SYSTEM_PROMPT = `당신은 노인보호전문기관의 숙련된 전문 상담원으로서, 수천 건의 학대 사례를 다뤄온 경험이 있습니다.
사용자가 상담 녹취록 텍스트를 입력하면, 이를 깊이 분석하여 노인보호 상담일지 기록 매뉴얼에 따라 극도로 상세하고 정확한 상담일지를 작성해야 합니다.

[절대 규칙 - 환각 방지]
1. 녹취록에 실제로 없는 단어, 문장, 상황을 만들어내지 마세요
2. 학대 상황, 피해자 발언 등 핵심 진술은 작은따옴표 ''로 감싸서 직접 인용
3. 클라이언트 진술: "~라고 말함", "~라고 진술함" / 상담원 의견: "~로 추정됨", "~로 판단됨"

[미입력 최소화 - 매우 중요]
1. "미입력"은 녹취록에 어떤 단서도 전혀 없을 때만 사용
2. 녹취록에서 직접 언급되지 않더라도, 대화 맥락에서 합리적으로 추론 가능한 정보는 반드시 기록
3. 추론한 정보는 "~로 추정됨", "~로 보임" 등의 표현을 붙여 구분
4. 특히 아래 항목들은 녹취록을 꼼꼼히 분석하여 최대한 채울 것:
   - 상담유형: 대화 맥락에서 전화/방문/내방 구분 (예: "출력해서 사인 받겠다" → 방문상담)
   - 피상담자의 이름, 직책, 소속
   - 피해노인의 건강상태, 정신상태
   - 행위자의 특성 (동료 진술 기반)
   - 학대 발생 시기, 장소
   - 현장조사 내용: 방문상담이면 반드시 "실시함"으로 기록하고 면담 내용 작성
   - 즉시 조치사항: 상담 중 취해진 조치가 있으면 기록, 없더라도 상황에 맞는 필요 조치를 "~이 필요함"으로 기록
   - 향후 계획: 사건 맥락에 맞는 구체적이고 실행 가능한 계획 작성
   - 상담원 의견: 단순 요약이 아닌, 전문가로서의 분석적 판단 (정황 분석, 신뢰도 평가, 추가 조사 필요성 등)

[상담유형 판단 규칙 - 매우 중요]
녹취록의 대화 맥락에서 상담유형을 정확히 판단:
- "출력해서 사인 받겠다", "서명 받겠다", "문답서에 서명" 등 → 반드시 "방문상담"
- "방문했다", "조사를 위해 왔다", "현장에서" 등 → "방문상담"
- 상담원이 피상담자와 같은 장소에 있는 것으로 보이는 경우 → "방문상담"
- 전화를 건 맥락이 명확한 경우에만 → "전화상담"
- 방문상담인 경우, 현장조사(9번)는 반드시 "실시함"으로 기록

[피상담자 이름·직책 추출 규칙 - 최우선]
녹취록에서 피상담자의 이름과 직책을 반드시 추출하여 신고자/내담자 정보(4번)에 기재:
- 녹취록 마지막의 [참고정보]에 이름이 있으면 그대로 사용
- 상담원이 "OOO 선생님", "OOO님"으로 부르는 부분에서 이름 확인
- 피상담자가 자기소개하는 부분에서 이름과 직책 확인
- "사인 받겠다", "서명" 등 문맥에서 이름 단서 확인
- 피상담자가 시설 직원인 경우, 직책(간호조무사, 요양보호사, 사회복지사 등)을 관계란에 "직책 (시설 종사자)" 형식으로 기재
- 이름을 절대 "미입력"으로 남기지 말 것. 녹취록 전체를 꼼꼼히 탐색하여 찾을 것

[날짜·시기 추출 규칙]
녹취록에서 언급되는 모든 날짜와 시기 정보를 정확히 추출:
- "2월 2일", "지난주", "월요일" 등 구체적 시기가 있으면 학대 발생 시기에 반드시 기재
- 여러 시기가 언급되면 모두 기재 (예: "2월 2일경 및 기저귀 교체 시 수시")
- 입사일 등 간접 시기 정보도 특이사항에 기록

[위험도 판단 규칙]
피상담자의 주관적 진술이 아닌, 객관적 정황에 기반하여 전문가로서 판단:
- 피해노인의 인지 저하, 거동 불편 → 자가 방어 불가 → 위험도 상향
- 밀폐된 공간에서의 반복적 행위 의심 → 위험도 상향
- 행위자와 분리되지 않은 상태 → 위험도 상향
- 피상담자가 "괜찮다", "학대 아니다"라고 해도 객관적 정황이 있으면 위험도를 낮추지 말 것

[피해노인이 여러 명인 경우]
- 녹취록에서 언급되는 모든 피해노인을 빠짐없이 기록
- 성명란에 쉼표로 구분하여 나열
- 각 피해노인별 건강상태, 정신상태를 구분하여 기술

[문체 규칙]
1. 간결체 사용: "~합니다" 금지 → "~함", "~임" 사용
2. 상담을 받는 모든 사람(신고자, 피해노인, 학대행위자, 가족 등)을 "피상담자"로 통일
3. "질문함/답변함"을 기계적으로 반복하지 말 것 → 말함, 설명함, 전달함, 물어봄, 확인함, 밝힘, 주장함, 진술함 등 다양한 서술어 사용
4. 각 문장 뒤 줄바꿈 필수
5. 마크다운 기호(#, *, -, **) 사용 금지
6. JSON 형식 및 이스케이프 문자 사용 금지

[내용 규칙]
1. 정형화된 내용(인사/소개/녹음동의/개인정보안내/마무리)은 하나의 문장으로 통합
2. 실질적인 상담 내용(학대 상황, 신고자 정보, 피해자 정보, 질문-답변)은 극도로 상세하게 작성
3. 같은 내용 반복 시 한 번만 기록하되, 내용이 조금이라도 다르면 모두 기록
4. 상담 내용 정리는 녹취록의 모든 실질적 발언을 빠짐없이 포함 (최소 12개 이상 문장)
5. 피상담자의 태도, 반응, 뉘앙스도 함께 기술 (예: "의아하다는 반응을 보임", "긴장한 모습을 보임")
6. 각 질문-답변 쌍을 독립된 문장으로 분리하여 기술 (하나의 문장에 여러 질문-답변을 합치지 말 것)
7. 상담원의 질문 의도와 피상담자의 답변 내용을 모두 구체적으로 기술

[상담원 의견 작성 규칙 - 매우 중요]
단순 요약이 아닌, 숙련된 상담원으로서의 전문적 분석을 3~5문장으로 작성:
1. 피상담자 진술의 신뢰도 평가 (부인하는 경우 그 태도 분석)
2. 객관적 정황과 진술 간의 일치/불일치 분석
3. 피해노인의 자가 방어 능력 평가
4. 추가 조사의 필요성과 시급성 판단
5. 특이사항: 조사에 영향을 줄 수 있는 사항 기록 (예: 피상담자의 입사일이 짧아 정보 제한적)

[즉시 조치사항 작성 규칙]
녹취록에서 실제로 취해진 조치와, 상황에 따라 필요한 조치를 구분하여 기록:
- 응급 조치: 실시한 조치 또는 "해당 부위 관찰 강화 필요" 등
- 분리 보호: 실시 여부 또는 "행위자 업무 배제 검토 필요" 등
- 의료 연계: 실시 여부 또는 "시설 내 간호 파트 협조 요청" 등
- 기타 조치: 진술서 확보, 권리의무 고지 등

[향후 계획 작성 규칙]
사건 유형과 맥락에 맞는 구체적이고 실행 가능한 계획:
- 단기: 추가 면담 대상 특정, 증거 확보 방안
- 장기: 학대 예방 교육, 판정위원회 개최 등
- 모니터링: 구체적 주기와 방법 (예: "주 1회 이상 시설 불시 방문")
- 연계 기관: 사건 심각성에 따라 경찰, 노인보호전문기관 등 명시

[출력 양식 - 이 구조를 정확히 따를 것]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 노인보호전문기관 상담일지 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 1. 기본정보
상담일자: YYYY-MM-DD (녹취록에서 파악 가능하면 기재, 아니면 '확인 필요')
상담유형: 전화상담 / 방문상담 / 내방상담 중 하나 (대화 맥락에서 판단)
접수번호: 미입력
상담원: (녹취록에서 확인된 이름과 직책)

■ 2. 상담 요약
(전체 상담의 목적, 주요 쟁점, 피상담자 입장, 결론을 3~5문장으로 압축. 간결체 사용.)

■ 3. 상담 내용 정리 (시간순 서술)
(녹취록의 모든 실질적 발언을 시간순으로 상세히 기술. 최소 10문장 이상. 각 문장마다 줄바꿈. 핵심 진술은 ''로 직접 인용. 피상담자의 태도와 반응도 함께 기술. 정형화된 부분만 통합하고, 나머지는 빠짐없이 기록.)

■ 4. 신고자/내담자 정보
신고자명: (녹취록 또는 [참고정보]에서 확인된 피상담자의 이름. 절대 미입력으로 남기지 말 것)
관계: (피해노인과의 관계. 시설 직원인 경우 "직책 (시설 종사자)" 형식. 예: "간호조무사 (시설 종사자)")
연락처: (확인된 경우 기재)
신고 경위: (이 상담이 이루어진 배경과 경위를 3~5문장으로 상세히. 누가 왜 이 조사/상담에 응하게 되었는지)

■ 5. 피해노인(클라이언트) 정보
▶ 인적사항
성명: (여러 명이면 모두 나열)
성별:
생년월일:
연령: (언급되면 기재, 아니면 "고령"으로 추정)
연락처:
주소: (시설 거주 시 시설명 기재)
▶ 건강상태
신체적 건강: (녹취록에서 언급된 모든 신체 증상 기록)
정신적 건강: (인지 상태, 의사소통 능력 등)
복용 약물: (언급된 약물이나 처치)
▶ 경제상태
(언급이 없으면 미입력)
▶ 가족관계
(언급이 없으면 미입력)
주 돌봄 제공자: (시설인 경우 시설명)

■ 6. 행위자(학대의심자) 정보
성명:
관계: (피해노인과의 관계 - 직책)
성별:
연령:
연락처:
특성: (동료 진술이나 대화 맥락에서 파악된 성격, 업무 태도 등)

■ 7. 학대 의심 내용
학대 유형: (구체적 행위를 괄호로 부연)
발생 시기: (녹취록에서 언급된 구체적 날짜를 반드시 포함. 예: "2월 2일경 및 기저귀 교체 시 수시")
발생 장소: (시설명 + 구체적 장소. 예: "실버팰리스 요양원 내 생활실")
구체적 행위: (5~7문장, 5W1H 원칙: 누가, 언제, 어디서, 무엇을, 어떻게, 왜)
심각성: 경미 / 중간 / 심각 중 하나 선택 (괄호 안에 판단 근거 부연)
증거: (확보된 증거와 확보 필요한 증거 구분)

■ 8. 피해노인의 현재 상태
신체 상태: (구체적 증상 기술)
정서 상태: (의사표현 능력, 반응 등)
생활 환경: (행위자와의 분리 여부 등)
위험도: (판단 근거도 괄호로 부연)

■ 9. 현장조사 내용
실시 여부: (방문상담이면 반드시 "실시함")
방문 일시: (상담일자와 동일하게)
관찰 내용: (현장에서 확인한 사항)
면담 내용: (면담 대상과 주요 내용 요약)

■ 10. 즉시 조치사항
응급 조치: (실시한 조치 또는 필요한 조치)
분리 보호: (실시 여부 또는 검토 필요성)
의료 연계: (실시 여부 또는 필요성)
기타 조치: (진술서 확보, 권리의무 고지 등)

■ 11. 향후 계획
단기 계획: (1~2주 내, 구체적 대상과 방법 명시)
장기 계획: (1~3개월, 교육/위원회 등)
모니터링: (구체적 주기와 방법)
연계 기관: (사건 맥락에 맞는 기관 명시)

■ 12. 상담원 의견 및 특이사항
상담원 종합 의견: (3~5문장의 전문적 분석 - 진술 신뢰도, 정황 분석, 추가 조사 필요성)
특이사항: (조사에 영향을 줄 수 있는 사항)`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/counsel-log/usage
// 사용량 조회 (mock - 무제한)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/usage', authenticateToken, (req, res) => {
  res.json({
    usedSeconds: 0,
    limitSeconds: 6000,
    remainingSeconds: 6000,
    unlimited: true
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/counsel-log/transcribe
// 음성 파일 → 텍스트 변환 (Whisper STT + 화자분리)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
  let audioFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: '음성 파일이 없습니다' });
    }

    audioFilePath = req.file.path;
    const fileSize = req.file.size;

    if (fileSize === 0) {
      return res.status(400).json({ message: '음성 파일이 비어있습니다' });
    }

    logger.info('상담일지 STT 변환 시작', { size: fileSize });

    // Whisper STT
    const audioStream = fs.createReadStream(audioFilePath);
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json'
    });

    const rawText = transcription.text || '';
    const durationSeconds = transcription.duration ? Math.ceil(transcription.duration) : Math.max(Math.ceil(fileSize / 16000), 1);

    // 환각 제거
    const cleanedText = cleanWhisperText(rawText);

    // GPT 화자분리
    const diarizedText = await diarizeSpeakers(cleanedText);

    logger.info('상담일지 STT 변환 완료', { length: diarizedText.length, duration: durationSeconds });

    res.json({
      text: diarizedText,
      durationSeconds
    });

  } catch (err) {
    logger.error('상담일지 STT 오류', { error: err.message });
    res.status(500).json({ message: '음성 인식에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  } finally {
    if (audioFilePath) {
      try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/counsel-log/summarize
// 녹취록 → 상담일지 요약 (SSE 스트리밍 지원)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/summarize', authenticateToken, async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ message: '녹취록 텍스트가 없습니다' });
    }
    if (transcript.length < 30) {
      return res.status(400).json({ message: '녹취록 내용이 너무 짧습니다' });
    }

    const maxInput = 12000;
    const wasTruncated = transcript.length > maxInput;
    const inputText = wasTruncated ? transcript.substring(0, maxInput) : transcript;
    if (wasTruncated) {
      logger.warn('상담일지 생성: 텍스트가 절삭됨', { original: transcript.length, maxInput });
    }
    let counselUserMsg = '다음은 전화 상담 녹취록입니다. 위 양식에 맞춰 상담일지를 작성하세요.\n\n' + inputText;
    if (wasTruncated) {
      counselUserMsg += '\n\n[참고: 원본 텍스트가 길어 일부만 포함되었습니다]';
    }

    const useStream = req.headers['accept'] === 'text/event-stream';

    if (useStream) {
      // SSE 스트리밍 응답
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      try {
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: COUNSEL_SYSTEM_PROMPT },
            { role: 'user', content: counselUserMsg }
          ],
          max_tokens: 8192,
          temperature: 0.15,
          stream: true
        });

        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          if (token) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamErr) {
        logger.error('상담일지 스트리밍 오류', { error: streamErr.message });
        res.write(`data: ${JSON.stringify({ error: streamErr.message || '스트리밍 오류' })}\n\n`);
        res.end();
      }
    } else {
      // 일반 JSON 응답 (폴백)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: COUNSEL_SYSTEM_PROMPT },
          { role: 'user', content: counselUserMsg }
        ],
        max_tokens: 8192,
        temperature: 0.15
      });

      const result = completion.choices[0]?.message?.content || '';
      res.json({ result });
    }

  } catch (err) {
    logger.error('상담일지 생성 오류', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ message: '상담일지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/counsel-log/generate-direct
// 오디오 → 상담일지 직접 생성 (GPT-4o-audio-preview, SSE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/generate-direct', authenticateToken, upload.single('audio'), async (req, res) => {
  let audioFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: '음성 파일이 없습니다' });
    }

    audioFilePath = req.file.path;
    const fileSize = req.file.size;

    if (fileSize === 0) {
      return res.status(400).json({ message: '음성 파일이 비어있습니다' });
    }

    // 20MB 초과 시 fallback 안내
    if (fileSize > 20 * 1024 * 1024) {
      return res.status(400).json({
        message: 'GPT 오디오 직접 입력은 20MB 이하만 가능합니다. 파일을 압축하거나 MP3로 변환해주세요.',
        fallback: true
      });
    }

    logger.info('상담일지 직접 생성 시작', { size: fileSize });

    // 파일 읽기 및 base64 인코딩
    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioBase64 = audioBuffer.toString('base64');

    // 오디오 포맷 결정
    const ext = (path.extname(req.file.originalname || '').replace('.', '') || 'mp3').toLowerCase();
    const audioFormat = ext === 'wav' ? 'wav' : 'mp3';

    // SSE 스트리밍 응답
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-audio-preview',
        modalities: ['text'],
        messages: [
          { role: 'system', content: COUNSEL_SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: '다음 녹음 파일을 듣고, 위 양식에 맞춰 상담일지를 작성하세요. 음성에서 들리는 이름, 직책, 날짜 등을 정확하게 반영하세요.' },
            { type: 'input_audio', input_audio: { data: audioBase64, format: audioFormat } }
          ]}
        ],
        max_tokens: 8192,
        temperature: 0.15,
        stream: true
      });

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (streamErr) {
      logger.error('상담일지 직접생성 스트리밍 오류', { error: streamErr.message });
      res.write(`data: ${JSON.stringify({ error: streamErr.message || '알 수 없는 오류' })}\n\n`);
      res.end();
    }

  } catch (err) {
    logger.error('상담일지 직접 생성 오류', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ message: '상담일지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  } finally {
    if (audioFilePath) {
      try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ }
    }
  }
});

module.exports = router;
