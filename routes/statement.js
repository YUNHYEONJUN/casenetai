const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { getDB } = require('../database/db-postgres');
const OpenAI = require('openai');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Multer 설정 (음성 파일 업로드)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/statements');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `statement-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /wav|mp3|m4a|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (wav, mp3, m4a, ogg, webm만 가능)'));
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/transcribe
// 음성 파일 → STT 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: '음성 파일이 업로드되지 않았습니다.' 
      });
    }

    console.log('🎤 STT 변환 시작:', req.file.filename);

    // OpenAI Whisper API 호출
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });

    console.log('✅ STT 변환 완료:', transcription.text.substring(0, 100) + '...');

    res.json({
      success: true,
      transcript: transcription.text,
      duration: transcription.duration,
      words: transcription.words || [],
      audioUrl: `/uploads/statements/${req.file.filename}`
    });

  } catch (error) {
    console.error('❌ STT 변환 오류:', error);
    res.status(500).json({
      success: false,
      error: 'STT 변환 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/parse
// STT 텍스트 → AI 문답 분리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/parse', authenticateToken, async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: '변환된 텍스트가 필요합니다.'
      });
    }

    console.log('🤖 AI 문답 분리 시작...');

    const prompt = `다음은 노인학대 조사 현장에서 녹취된 대화입니다.
노인보호전문기관 직원(조사자)과 시설 종사자(피조사자) 간의 질문과 답변을 분리하여 JSON 형식으로 정리해주세요.

[녹취록]
${transcript}

[출력 형식]
JSON 배열로 출력하되, 각 항목은 다음 구조를 따릅니다:
{
  "question": "조사자의 질문",
  "answer": "피조사자의 답변"
}

주의사항:
1. 질문과 답변을 명확히 구분하세요
2. 불필요한 추임새(음, 아, 저기 등)는 제거하세요
3. 문법을 자연스럽게 다듬어주세요
4. 중요한 내용은 누락하지 마세요
5. 진술서 형식으로 정리해주세요

출력은 JSON 배열만 반환하세요 (다른 설명 없이).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: '당신은 노인보호전문기관의 진술서 작성을 돕는 전문 AI입니다. 녹취록을 정확하게 문답 형식으로 정리합니다.'
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
    
    // JSON 파싱
    let qaList;
    try {
      // JSON 코드 블록 제거 (```json ... ```)
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, responseText];
      qaList = JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      console.error('❌ JSON 파싱 오류:', parseError);
      return res.status(500).json({
        success: false,
        error: 'AI 응답을 파싱할 수 없습니다.',
        rawResponse: responseText
      });
    }

    console.log(`✅ AI 문답 분리 완료: ${qaList.length}개 항목`);

    res.json({
      success: true,
      qaList: qaList,
      totalQuestions: qaList.length
    });

  } catch (error) {
    console.error('❌ AI 문답 분리 오류:', error);
    res.status(500).json({
      success: false,
      error: 'AI 문답 분리 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/statement/save
// 진술서 저장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/save', authenticateToken, async (req, res) => {
  const db = await getDB();
  
  try {
    const {
      investigationDate,
      investigationLocation,
      investigationAgency,
      subjectName,
      subjectBirthDate,
      subjectOrganization,
      subjectPosition,
      subjectContact,
      audioUrl,
      transcript,
      statementContent,
      status = 'draft'
    } = req.body;

    const userId = req.user.userId;
    const organizationId = req.user.organizationId;

    // 필수 필드 검증
    if (!investigationDate || !subjectName) {
      return res.status(400).json({
        success: false,
        error: '조사일시와 피조사자 성명은 필수 항목입니다.'
      });
    }

    console.log('💾 진술서 저장 시작:', subjectName);

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

    const savedStatement = result.rows[0];

    console.log('✅ 진술서 저장 완료: ID', savedStatement.id);

    res.json({
      success: true,
      statement: savedStatement
    });

  } catch (error) {
    console.error('❌ 진술서 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: '진술서 저장 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/statement/:id
// 진술서 수정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put('/:id', authenticateToken, async (req, res) => {
  const db = await getDB();
  
  try {
    const statementId = req.params.id;
    const userId = req.user.userId;
    
    const {
      investigationDate,
      investigationLocation,
      investigationAgency,
      subjectName,
      subjectBirthDate,
      subjectOrganization,
      subjectPosition,
      subjectContact,
      transcript,
      statementContent,
      status
    } = req.body;

    // 권한 확인 (본인이 작성한 진술서만 수정 가능)
    const checkResult = await db.query(
      'SELECT * FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: '수정 권한이 없거나 존재하지 않는 진술서입니다.'
      });
    }

    console.log('✏️ 진술서 수정 시작: ID', statementId);

    const result = await db.query(
      `UPDATE statements SET
        investigation_date = $1,
        investigation_location = $2,
        investigation_agency = $3,
        subject_name = $4,
        subject_birth_date = $5,
        subject_organization = $6,
        subject_position = $7,
        subject_contact = $8,
        transcript = $9,
        statement_content = $10,
        status = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 AND user_id = $13
      RETURNING *`,
      [
        investigationDate,
        investigationLocation,
        investigationAgency,
        subjectName,
        subjectBirthDate,
        subjectOrganization,
        subjectPosition,
        subjectContact,
        transcript,
        JSON.stringify(statementContent),
        status,
        statementId,
        userId
      ]
    );

    console.log('✅ 진술서 수정 완료: ID', statementId);

    res.json({
      success: true,
      statement: result.rows[0]
    });

  } catch (error) {
    console.error('❌ 진술서 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '진술서 수정 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/statement/:id
// 진술서 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get('/:id', authenticateToken, async (req, res) => {
  const db = await getDB();
  
  try {
    const statementId = req.params.id;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT s.*, u.username as creator_name
       FROM statements s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [statementId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '진술서를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      statement: result.rows[0]
    });

  } catch (error) {
    console.error('❌ 진술서 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '진술서 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/statement/list
// 진술서 목록 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get('/list', authenticateToken, async (req, res) => {
  const db = await getDB();
  
  try {
    const userId = req.user.userId;
    const { status, page = 1, limit = 20, search } = req.query;

    let query = `
      SELECT s.*, u.username as creator_name
      FROM statements s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    // 상태 필터
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // 검색
    if (search) {
      query += ` AND (
        s.subject_name ILIKE $${paramIndex} OR
        s.subject_organization ILIKE $${paramIndex} OR
        s.investigation_agency ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // 정렬 및 페이징
    query += ` ORDER BY s.investigation_date DESC, s.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await db.query(query, params);

    // 전체 개수 조회
    let countQuery = `SELECT COUNT(*) FROM statements WHERE user_id = $1`;
    const countParams = [userId];
    
    if (status) {
      countQuery += ` AND status = $2`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      statements: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('❌ 진술서 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '진술서 목록 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/statement/:id
// 진술서 삭제
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete('/:id', authenticateToken, async (req, res) => {
  const db = await getDB();
  
  try {
    const statementId = req.params.id;
    const userId = req.user.userId;

    // 권한 확인
    const checkResult = await db.query(
      'SELECT * FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: '삭제 권한이 없거나 존재하지 않는 진술서입니다.'
      });
    }

    console.log('🗑️ 진술서 삭제: ID', statementId);

    await db.query(
      'DELETE FROM statements WHERE id = $1 AND user_id = $2',
      [statementId, userId]
    );

    console.log('✅ 진술서 삭제 완료');

    res.json({
      success: true,
      message: '진술서가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('❌ 진술서 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '진술서 삭제 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

module.exports = router;
