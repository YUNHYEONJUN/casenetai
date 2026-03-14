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
  apiKey: process.env.OPENAI_API_KEY
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

    const allowedExtensions = /wav|mp3|m4a|ogg|webm/;
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
                          'audio/mp4', 'audio/ogg', 'audio/webm', 'video/webm'];
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (wav, mp3, m4a, ogg, webm만 가능)'));
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/transcribe
// 음성 파일 → STT 변환 (로그인 필수)
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

    logger.info('STT 변환 시작', { type: isChunkedFile ? 'chunked' : 'direct' });

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

    logger.info('STT 변환 완료', { length: transcription.text.length });

    success(res, {
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
// POST /api/statement/parse
// STT 텍스트 → AI 문답 분리 (로그인 필수)
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
// 진술서 저장
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
// 진술서 수정
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
// 진술서 조회
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
// 진술서 삭제
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
