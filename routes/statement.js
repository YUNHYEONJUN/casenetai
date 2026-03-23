/**
 * 진술서 API (북서부인트라넷 포팅 + 기존 CRUD)
 * - 음성 → 텍스트 변환 (Whisper STT)
 * - 오디오 → 진술서 직접 생성 (GPT-4o-audio-preview)
 * - 텍스트 → 진술서 생성 (SSE 스트리밍)
 * - 진술서 CRUD (기존 유지)
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validate, paginationQuery } = require('../middleware/validate');
const { success, created, paginated } = require('../lib/response');
const { ValidationError, NotFoundError, ForbiddenError } = require('../lib/errors');
const { logger } = require('../lib/logger');
const { getDB } = require('../database/db-postgres');
const OpenAI = require('openai');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10 * 60 * 1000
});

// Multer 설정 (음성 파일 업로드) - Vercel 서버리스 호환 (/tmp 사용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeExtname = path.extname(path.basename(file.originalname));
    cb(null, `statement-${uniqueSuffix}${safeExtname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const basename = path.basename(file.originalname);
    if (basename.includes('..') || basename.includes('/') || basename.includes('\\')) {
      return cb(new Error('잘못된 파일명입니다.'));
    }

    const allowedExtensions = /\.(wav|mp3|m4a|ogg|webm|aac|flac|wma)$/i;
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
                          'audio/mp4', 'audio/ogg', 'audio/webm', 'video/webm', 'audio/aac',
                          'audio/flac', 'audio/x-flac', 'audio/x-ms-wma'];
    const extname = allowedExtensions.test(file.originalname.toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);

    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (wav, mp3, m4a, ogg, webm, aac, flac, wma만 가능)'));
    }
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
// 진술서 시스템 프롬프트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STATEMENT_SYSTEM_PROMPT = `당신은 경기북서부노인보호전문기관의 현장조사 담당 상담원입니다.
주어진 녹취록(전사 텍스트)을 분석하여 아래 양식에 맞는 진술서(사실확인서)를 작성하세요.

[핵심 원칙 - 절대 준수]
1. 녹취록에 실제로 발화된 내용만 기록할 것
2. 녹취록에 없는 내용을 추론하거나 지어내는 행위(환각)를 절대 금지
3. 불명확하거나 전사 내용에 없는 항목은 반드시 "(녹취 내용 없음)" 또는 "(불명확)"으로 표기
4. 진술인이 말하지 않은 직위, 소속, 날짜, 연락처 등 개인정보를 임의로 기입 금지

[문체 규칙]
- 문답은 반드시 격식체("~습니다", "~했습니다", "~입니다") 또는 서술체("~다", "~했다")로 작성할 것
- 질문(문): "~했습니까?", "~입니까?" 등 격식체 의문형
- 답변(답): "~했습니다", "~입니다" 등 격식체 서술형
- 작은따옴표('') 인용 사용 금지. 진술 내용은 따옴표 없이 자연스럽게 서술할 것
- 상담원(조사관) 질문은 간결하게 요약 정리할 것
- 답변은 진술인이 실제로 말한 내용을 격식체로 정리하여 기록할 것

[금지 사항]
- 작은따옴표(''), 큰따옴표("") 인용 표시 사용 금지
- 마크다운 기호(#, **, -, \` 등) 사용 금지
- JSON 기호 사용 금지
- 이스케이프 문자(\\n, \\t 등) 사용 금지
- 간결체(~함, ~임) 사용 금지. 반드시 격식체(~습니다, ~했습니다) 사용

[개인정보 처리]
- 녹취록에서 확인된 정보만 기재
- 녹취록에서 확인되지 않은 개인정보는 "(녹취 내용 없음)"으로 표기
- 단, 사전 입력된 진술인 정보가 제공된 경우 그 값을 우선 사용할 것

[출력 양식 - 이 구조를 정확히 따를 것]

                    진  술  서

○ 성    명 : [진술인 성명]
○ 소    속 : [소속 기관명]
○ 직    위 : [직위]
○ 생년월일 : [생년월일 또는 (녹취 내용 없음)]
○ 연  락  처 : [연락처 또는 (녹취 내용 없음)]
○ 조  사  자 : [조사자명]

상기 본인은 [소속 기관명]에서 발생한 노인학대 의심 건과 관련하여 다음과 같이 사실을 확인합니다.

【 문  답  내  용 】

문 1. 진술인의 소속과 담당 업무는 무엇입니까?
답.   저는 OOO 요양원에서 근무하고 있으며, O층을 담당하고 있습니다.

문 2. 해당 어르신의 멍을 언제 발견했습니까?
답.   입사 후 어르신의 가려움증 약을 발라드리던 중 멍을 발견했습니다. 어르신께서는 침대에 부딪혀 생긴 것이라고 말씀하셨습니다.

(이하 동일 구조 반복 - 녹취록에 있는 문답 수만큼 자동 생성)

위 진술 내용은 사실과 다름이 없음을 확인합니다.

       20    년    월    일

소    속 : [소속 기관명]
진 술 인 : [성명]            (인)`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/transcribe
// 음성 파일 → STT 변환 (Whisper + 화자분리)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/transcribe', authenticateToken, (req, res, next) => {
  if (req.headers['content-type']?.includes('application/json')) {
    next();
  } else {
    upload.single('audio')(req, res, next);
  }
}, async (req, res, next) => {
  let audioFilePath = null;
  let isChunkedFile = false;

  try {
    if (req.body.serverFilePath) {
      const resolvedPath = path.resolve(req.body.serverFilePath);
      const tmpDir = path.resolve(os.tmpdir());
      const relative = path.relative(tmpDir, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new ValidationError('잘못된 파일 경로입니다.');
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new ValidationError('업로드된 파일을 찾을 수 없습니다.');
      }
      audioFilePath = resolvedPath;
      isChunkedFile = true;
    } else if (req.file) {
      audioFilePath = req.file.path;
    } else {
      throw new ValidationError('음성 파일이 업로드되지 않았습니다.');
    }

    logger.info('진술서 STT 변환 시작', { type: isChunkedFile ? 'chunked' : 'direct' });

    const audioStream = fs.createReadStream(audioFilePath);
    audioStream.on('error', (streamErr) => {
      logger.error('오디오 스트림 오류', { error: streamErr.message });
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });

    // 환각 제거
    const cleanedText = cleanWhisperText(transcription.text || '');

    // GPT 화자분리
    const diarizedText = await diarizeSpeakers(cleanedText);

    logger.info('진술서 STT 변환 완료', { length: diarizedText.length });

    success(res, {
      text: diarizedText,
      transcript: transcription.text,
      duration: transcription.duration,
      words: transcription.words || []
    });

  } catch (err) {
    next(err);
  } finally {
    if (audioFilePath) {
      try { fs.unlinkSync(audioFilePath); } catch (e) { /* ignore */ }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/generate-direct
// 오디오 → 진술서 직접 생성 (GPT-4o-audio-preview, SSE)
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
        message: 'GPT 오디오 직접 입력은 20MB 이하만 가능합니다.',
        fallback: true
      });
    }

    logger.info('진술서 직접 생성 시작', { size: fileSize });

    // 파일 읽기 및 base64 인코딩
    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioBase64 = audioBuffer.toString('base64');

    // 오디오 포맷 결정
    const ext = (path.extname(req.file.originalname || '').replace('.', '') || 'mp3').toLowerCase();
    const audioFormat = ext === 'wav' ? 'wav' : 'mp3';

    // 사전 입력 정보 파싱
    let userTextPrefix = '';
    if (req.body.info) {
      try {
        const info = typeof req.body.info === 'string' ? JSON.parse(req.body.info) : req.body.info;
        if (info.name || info.org || info.position || info.birthdate || info.contact || info.investigator) {
          userTextPrefix = '사전 입력된 진술인 정보:\n';
          if (info.name) userTextPrefix += `- 성명: ${info.name}\n`;
          if (info.org) userTextPrefix += `- 소속: ${info.org}\n`;
          if (info.position) userTextPrefix += `- 직위: ${info.position}\n`;
          if (info.birthdate) userTextPrefix += `- 생년월일: ${info.birthdate}\n`;
          if (info.contact) userTextPrefix += `- 연락처: ${info.contact}\n`;
          if (info.investigator) userTextPrefix += `- 조사자: ${info.investigator}\n`;
          userTextPrefix += '\n';
        }
      } catch (_) { /* ignore parse error */ }
    }

    const userText = userTextPrefix + '다음 녹음 파일을 듣고, 위 양식에 맞춰 진술서를 작성하세요. 음성에서 들리는 이름, 직책, 날짜, 소속 등을 정확하게 반영하세요.';

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
          { role: 'system', content: STATEMENT_SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: userText },
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
      logger.error('진술서 직접생성 스트리밍 오류', { error: streamErr.message });
      res.write(`data: ${JSON.stringify({ error: streamErr.message || '알 수 없는 오류' })}\n\n`);
      res.end();
    }

  } catch (err) {
    logger.error('진술서 직접 생성 오류', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ message: '진술서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  } finally {
    if (audioFilePath) {
      try { fs.unlinkSync(audioFilePath); } catch (_) { /* ignore */ }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/generate
// 텍스트 → 진술서 생성 (SSE 스트리밍 지원)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { transcript, name, org, position, birthdate, contact, investigator } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 30) {
      return res.status(400).json({ message: '녹취록 텍스트가 너무 짧습니다 (최소 30자)' });
    }

    // 유저 메시지 구성
    let userMsg = '';
    if (name || org || position || birthdate || contact || investigator) {
      userMsg += '사전 입력된 진술인 정보:\n';
      if (name) userMsg += `- 성명: ${name}\n`;
      if (org) userMsg += `- 소속: ${org}\n`;
      if (position) userMsg += `- 직위: ${position}\n`;
      if (birthdate) userMsg += `- 생년월일: ${birthdate}\n`;
      if (contact) userMsg += `- 연락처: ${contact}\n`;
      if (investigator) userMsg += `- 조사자: ${investigator}\n`;
      userMsg += '\n';
    }

    const maxInput = 12000;
    const wasTruncated = transcript.length > maxInput;
    const trimmedTranscript = wasTruncated ? transcript.substring(0, maxInput) : transcript;
    if (wasTruncated) {
      logger.warn('진술서 생성: 텍스트가 절삭됨', { original: transcript.length, maxInput });
    }
    userMsg += '아래 전사 텍스트를 분석하여 진술서를 작성해 주세요.\n\n' + trimmedTranscript;
    if (wasTruncated) {
      userMsg += '\n\n[참고: 원본 텍스트가 길어 일부만 포함되었습니다]';
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
            { role: 'system', content: STATEMENT_SYSTEM_PROMPT },
            { role: 'user', content: userMsg }
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
        logger.error('진술서 생성 스트리밍 오류', { error: streamErr.message });
        res.write(`data: ${JSON.stringify({ error: streamErr.message || '스트리밍 오류' })}\n\n`);
        res.end();
      }
    } else {
      // 일반 JSON 응답 (폴백)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: STATEMENT_SYSTEM_PROMPT },
          { role: 'user', content: userMsg }
        ],
        max_tokens: 8192,
        temperature: 0.15
      });

      const result = completion.choices[0]?.message?.content || '';
      res.json({ result });
    }

  } catch (err) {
    logger.error('진술서 생성 오류', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ message: '진술서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/parse
// STT 텍스트 → AI 문답 분리 (기존 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const parseSchema = z.object({
  body: z.object({
    transcript: z.string().min(1, '변환된 텍스트가 필요합니다.'),
  }),
});

router.post('/parse', authenticateToken, validate(parseSchema), async (req, res, next) => {
  try {
    const { transcript } = req.body;

    logger.info('AI 문답 분리 시작');

    const prompt = `다음은 노인학대 조사 현장에서 녹취된 대화입니다.
노인보호전문기관 직원(조사자)과 시설 종사자(피조사자) 간의 질문과 답변을 **경찰/검찰 조서 형식**으로 정리해주세요.

[녹취록]
${transcript}

[출력 형식]
JSON 배열로 출력하되, 각 항목은 다음 구조를 따릅니다:
{
  "question": "조사자의 질문을 조서체로 변환",
  "answer": "피조사자의 답변을 서술형 조서체로 변환"
}

[조서 작성 규칙 - 매우 중요!]

**문(問) 작성 방식:**
- 구어체 질문을 격식 있는 명령형/의문형으로 변환
- "~하시오", "~에 대하여 진술하시오", "~에 대하여 설명하시오" 형식 사용
- 예시:
  구어체: "성함이 어떻게 되시나요?"
  조서체: "피조사자의 성명과 인적사항에 대하여 진술하시오."

**답(答) 작성 방식:**
- 1인칭 시점의 서술형으로 작성 ("본인은~", "저는~")
- 완전한 문장으로 구성
- 추임새 제거, 문법 정리
- 구체적이고 명확하게 서술
- 예시:
  구어체: "홍길동입니다."
  조서체: "본인의 성명은 홍길동이며, 생년월일은 1985년 3월 15일입니다. 현재 ○○요양원에서 요양보호사로 근무하고 있습니다."

**추가 지침:**
1. 구어체 대화를 완전히 조서체로 변환하세요
2. "네", "예", "음", "아" 등 추임새는 완전히 제거
3. 짧은 답변도 완전한 문장으로 확장
4. 날짜, 시간, 장소 등 구체적 정보는 정확히 유지
5. 법적 문서의 격식을 갖추세요
6. 구어체 표현을 문어체로 변환하세요

출력은 JSON 배열만 반환하세요 (다른 설명 없이).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: '당신은 법률 전문가이자 노인보호전문기관의 조사 전문가입니다. 구어체 대화를 경찰/검찰 조서와 같은 격식 있는 서술형 문답으로 변환하는 전문가입니다. 모든 답변은 "본인은~", "저는~"과 같은 1인칭 서술형으로 작성하며, 질문은 "~하시오", "~에 대하여 진술하시오" 형식으로 작성합니다.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3000
    });

    const responseText = completion.choices[0].message.content.trim();

    let qaList;
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, responseText];
      qaList = JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      logger.error('JSON 파싱 오류', { error: parseError.message });
      throw new ValidationError('AI 응답을 파싱할 수 없습니다.');
    }

    logger.info('AI 문답 분리 완료', { count: qaList.length });

    success(res, {
      qaList,
      totalQuestions: qaList.length
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/save
// 진술서 저장 (기존 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const saveSchema = z.object({
  body: z.object({
    investigationDate: z.string().min(1, '조사일시는 필수 항목입니다'),
    investigationLocation: z.string().optional(),
    investigationAgency: z.string().optional(),
    subjectName: z.string().min(1, '피조사자 성명은 필수 항목입니다'),
    subjectBirthDate: z.string().optional(),
    subjectOrganization: z.string().optional(),
    subjectPosition: z.string().optional(),
    subjectContact: z.string().optional(),
    audioUrl: z.string().optional(),
    transcript: z.string().optional(),
    statementContent: z.any().optional(),
    status: z.enum(['draft', 'completed', 'archived']).default('draft'),
  }),
});

router.post('/save', authenticateToken, validate(saveSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const {
      investigationDate, investigationLocation, investigationAgency,
      subjectName, subjectBirthDate, subjectOrganization,
      subjectPosition, subjectContact,
      audioUrl, transcript, statementContent, status
    } = req.body;

    const userId = req.user.userId;
    const organizationId = req.user.organizationId;

    logger.info('진술서 저장 시작', { subjectName });

    const result = await db.query(
      `INSERT INTO statements (
        user_id, organization_id,
        investigation_date, investigation_location, investigation_agency,
        subject_name, subject_birth_date, subject_organization,
        subject_position, subject_contact,
        audio_url, transcript, statement_content, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        userId, organizationId,
        investigationDate, investigationLocation, investigationAgency,
        subjectName, subjectBirthDate, subjectOrganization,
        subjectPosition, subjectContact,
        audioUrl, transcript, JSON.stringify(statementContent), status
      ]
    );

    logger.info('진술서 저장 완료', { id: result[0].id });

    created(res, { statement: result[0] });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/statement/:id
// 진술서 수정 (기존 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const updateSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    investigationDate: z.string().optional(),
    investigationLocation: z.string().optional(),
    investigationAgency: z.string().optional(),
    subjectName: z.string().optional(),
    subjectBirthDate: z.string().optional(),
    subjectOrganization: z.string().optional(),
    subjectPosition: z.string().optional(),
    subjectContact: z.string().optional(),
    transcript: z.string().optional(),
    statementContent: z.any().optional(),
    status: z.enum(['draft', 'completed', 'archived']).optional(),
  }),
});

router.put('/:id', authenticateToken, validate(updateSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const statementId = req.params.id;
    const userId = req.user.userId;

    const checkResult = await db.query(
      'SELECT * FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    if (checkResult.length === 0) {
      throw new ForbiddenError('수정 권한이 없거나 존재하지 않는 진술서입니다.');
    }

    // 부분 업데이트: 전달된 필드만 갱신 (undefined 필드는 기존 값 유지)
    const fieldMap = {
      investigationDate: 'investigation_date',
      investigationLocation: 'investigation_location',
      investigationAgency: 'investigation_agency',
      subjectName: 'subject_name',
      subjectBirthDate: 'subject_birth_date',
      subjectOrganization: 'subject_organization',
      subjectPosition: 'subject_position',
      subjectContact: 'subject_contact',
      transcript: 'transcript',
      statementContent: 'statement_content',
      status: 'status',
    };

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (req.body[jsKey] !== undefined) {
        const val = jsKey === 'statementContent' ? JSON.stringify(req.body[jsKey]) : req.body[jsKey];
        setClauses.push(`${dbCol} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      throw new ValidationError('수정할 항목이 없습니다.');
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(statementId, userId);

    const result = await db.query(
      `UPDATE statements SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *`,
      values
    );

    logger.info('진술서 수정 완료', { id: statementId });

    success(res, { statement: result[0] });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/statement/list
// 진술서 목록 조회 (/:id 보다 먼저 정의해야 함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const listSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});

router.get('/list', authenticateToken, validate(listSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const userId = req.user.userId;
    const { status, page, limit, search } = req.query;

    let query = `
      SELECT s.*, u.name as creator_name
      FROM statements s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        s.subject_name ILIKE $${paramIndex} OR
        s.subject_organization ILIKE $${paramIndex} OR
        s.investigation_agency ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY s.investigation_date DESC, s.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await db.query(query, params);

    // 전체 개수 조회
    let countQuery = `SELECT COUNT(*) as count FROM statements WHERE user_id = $1`;
    const countParams = [userId];
    let countParamIndex = 2;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (
        subject_name ILIKE $${countParamIndex} OR
        subject_organization ILIKE $${countParamIndex} OR
        investigation_agency ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult[0].count);

    paginated(res, {
      items: result,
      total,
      page,
      limit,
    });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/statement/:id
// 진술서 조회 (기존 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const idParamSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

router.get('/:id', authenticateToken, validate(idParamSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const statementId = req.params.id;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT s.*, u.name as creator_name
       FROM statements s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [statementId, userId]
    );

    if (result.length === 0) {
      throw new NotFoundError('진술서');
    }

    success(res, { statement: result[0] });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/statement/:id
// 진술서 삭제 (기존 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete('/:id', authenticateToken, validate(idParamSchema), async (req, res, next) => {
  const db = getDB();

  try {
    const statementId = req.params.id;
    const userId = req.user.userId;

    const checkResult = await db.query(
      'SELECT * FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    if (checkResult.length === 0) {
      throw new ForbiddenError('삭제 권한이 없거나 존재하지 않는 진술서입니다.');
    }

    logger.info('진술서 삭제', { id: statementId });

    await db.query(
      'DELETE FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    success(res, { message: '진술서가 삭제되었습니다.' });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
