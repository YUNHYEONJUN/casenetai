const express = require('express');
const router = express.Router();
const { z } = require('zod');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel } = require('docx');
const { Packer } = require('docx');
const os = require('os');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { success } = require('../lib/response');
const { ValidationError } = require('../lib/errors');
const { logger } = require('../lib/logger');
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
    cb(null, `fact-${uniqueSuffix}${safeExtname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const basename = path.basename(file.originalname);
    if (basename.includes('..') || basename.includes('/') || basename.includes('\\')) {
      return cb(new Error('잘못된 파일명입니다.'));
    }

    const allowedTypes = /wav|mp3|m4a|mp4|ogg|webm/;
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
                          'audio/mp4', 'audio/ogg', 'audio/webm', 'video/webm', 'video/mp4'];
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);

    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (wav, mp3, m4a, mp4, ogg, webm만 가능)'));
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/fact-confirmation/transcribe
// 음성 파일 → STT 변환
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

    logger.info('사실확인서 STT 변환 시작', { type: isChunkedFile ? 'chunked' : 'direct' });

    const audioStream = fs.createReadStream(audioFilePath);
    audioStream.on('error', (streamErr) => {
      logger.error('오디오 스트림 오류', { error: streamErr.message });
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json'
    });

    logger.info('STT 변환 완료', { length: transcription.text.length });

    success(res, {
      transcript: transcription.text,
      duration: transcription.duration
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
// POST /api/fact-confirmation/generate
// STT 텍스트 → AI 사실확인서 구조화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const generateSchema = z.object({
  body: z.object({
    transcript: z.string().min(1, '녹취록 텍스트가 필요합니다'),
    personalInfo: z.object({
      caseTitle: z.string().optional(),
      subjectName: z.string().optional(),
      birthDate: z.string().optional(),
      organization: z.string().optional(),
      position: z.string().optional(),
      contact: z.string().optional(),
      investigationDate: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
});

router.post('/generate', authenticateToken, validate(generateSchema), async (req, res, next) => {
  try {
    const { transcript, personalInfo } = req.body;

    logger.info('사실확인서 구조화 시작');

    const prompt = `
당신은 노인보호전문기관의 전문 상담원입니다.
아래 녹취록을 읽고, 표준화된 "사실확인서(진술서)" 형식으로 구조화해주세요.

[녹취록]
${transcript}

[출력 형식]
JSON 형태로 아래와 같이 구조화하세요:

{
  "sections": [
    {
      "title": "섹션 제목 (예: 사건 개요)",
      "items": [
        {
          "question": "구체적인 질문 내용",
          "answer": "답변 내용 (조서체로 작성: ~했다, ~라고 말했다)"
        }
      ]
    }
  ]
}

[주의사항]
1. 섹션은 논리적으로 분류하세요 (예: 사건 개요, 상황 설명, 관련 인물, 피해 내용, 목격 사항, 의견 등)
2. 각 섹션당 2-5개의 문답 쌍을 생성하세요
3. 질문은 명확하고 구체적으로 작성하세요
4. 답변은 조서체(~했다, ~이다, ~라고 말했다)로 작성하세요
5. 개인정보(성명, 연락처 등)는 제외하세요 (이미 상단에 표시됨)
6. 시간 순서대로 정리하세요
7. 최소 3개 섹션, 최대 7개 섹션으로 구성하세요
8. JSON 형식만 출력하세요 (추가 설명 없이)
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: '당신은 법률 문서 작성 전문가입니다.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 3000
    });

    const responseText = completion.choices[0].message.content.trim();

    let jsonText = responseText;
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error('JSON 파싱 오류', { error: parseError.message });
      throw new ValidationError('AI 응답을 파싱할 수 없습니다.');
    }

    const document = {
      title: personalInfo.caseTitle || '사실확인서 (진술서)',
      personalInfo,
      sections: parsedContent.sections
    };

    logger.info('사실확인서 구조화 완료', { sections: document.sections.length });

    success(res, { document });

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/fact-confirmation/download
// 사실확인서 → Word 파일 생성 및 다운로드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const downloadSchema = z.object({
  body: z.object({
    document: z.object({
      title: z.string().optional(),
      personalInfo: z.object({
        subjectName: z.string().optional().default(''),
        birthDate: z.string().optional(),
        organization: z.string().optional(),
        position: z.string().optional(),
        contact: z.string().optional(),
        investigationDate: z.string().optional(),
        notes: z.string().optional(),
      }),
      sections: z.array(z.object({
        title: z.string(),
        items: z.array(z.object({
          question: z.string(),
          answer: z.string(),
        })),
      })),
    }),
  }),
});

router.post('/download', authenticateToken, validate(downloadSchema), async (req, res, next) => {
  try {
    const { document: docData } = req.body;

    logger.info('Word 문서 생성 시작');

    const doc = createWordDocument(docData);
    const buffer = await Packer.toBuffer(doc);

    logger.info('Word 문서 생성 완료');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const safeName = (docData.personalInfo.subjectName || '').replace(/[\r\n"\\]/g, '').substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`사실확인서_${safeName}_${dateStr}.docx`)}`);
    res.send(buffer);

  } catch (err) {
    next(err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Word 문서 생성 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createWordDocument(docData) {
  const children = [];

  children.push(
    new Paragraph({
      text: docData.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  const tableRows = [
    new TableRow({
      children: [
        createTableCell('성명', true),
        createTableCell(docData.personalInfo.subjectName),
        createTableCell('생년월일', true),
        createTableCell(docData.personalInfo.birthDate)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('소속기관', true),
        createTableCell(docData.personalInfo.organization || '-'),
        createTableCell('직위', true),
        createTableCell(docData.personalInfo.position || '-')
      ]
    }),
    new TableRow({
      children: [
        createTableCell('연락처', true),
        createTableCell(docData.personalInfo.contact || '-'),
        createTableCell('조사일시', true),
        createTableCell(docData.personalInfo.investigationDate)
      ]
    })
  ];

  if (docData.personalInfo.notes) {
    tableRows.push(
      new TableRow({
        children: [
          createTableCell('기타사항', true),
          createTableCell(docData.personalInfo.notes, false, 3)
        ]
      })
    );
  }

  children.push(
    new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 100, bottom: 100, left: 100, right: 100 }
    })
  );

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }));

  docData.sections.forEach((section) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `■ ${section.title}`, bold: true, size: 28 })
        ],
        spacing: { before: 300, after: 200 }
      })
    );

    section.items.forEach((item, itemIndex) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `문${itemIndex + 1}. `, bold: true, color: '1e40af' }),
            new TextRun({ text: item.question })
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `답${itemIndex + 1}. `, bold: true }),
            new TextRun({ text: item.answer })
          ],
          spacing: { after: 200 }
        })
      );
    });
  });

  children.push(new Paragraph({ text: '', spacing: { before: 600 } }));
  children.push(
    new Paragraph({
      text: '위 진술은 사실과 다름이 없음을 확인합니다.',
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      bold: true
    })
  );
  children.push(
    new Paragraph({
      text: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
      alignment: AlignmentType.RIGHT,
      spacing: { after: 600 }
    })
  );
  children.push(
    new Paragraph({
      text: `진술자: ${docData.personalInfo.subjectName} (서명 또는 인)`,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 }
    })
  );
  children.push(
    new Paragraph({
      text: '조사자: __________________ (서명 또는 인)',
      alignment: AlignmentType.RIGHT
    })
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });
}

function createTableCell(text, isHeader = false, colSpan = 1) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: text, bold: isHeader, size: 22 })
        ]
      })
    ],
    columnSpan: colSpan,
    shading: isHeader ? { fill: 'F3F4F6' } : undefined,
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 100, right: 100 }
  });
}

module.exports = router;
