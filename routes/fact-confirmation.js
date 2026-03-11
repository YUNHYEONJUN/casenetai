const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel } = require('docx');
const { Packer } = require('docx');
const os = require('os');
const { authenticateToken } = require('../middleware/auth');
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
    // 파일명 보안 검증
    const basename = path.basename(file.originalname);
    if (basename.includes('..') || basename.includes('/') || basename.includes('\\')) {
      return cb(new Error('잘못된 파일명입니다.'));
    }

    const allowedTypes = /wav|mp3|m4a|mp4|ogg|webm/;
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
                          'audio/mp4', 'audio/ogg', 'audio/webm', 'video/webm', 'video/mp4'];
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);

    if (mimetype && extname) {
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
  // Content-Type에 따라 multer 적용 결정 (JSON = 청크 조립 파일 경로)
  if (req.headers['content-type']?.includes('application/json')) {
    next();
  } else {
    upload.single('audio')(req, res, next);
  }
}, async (req, res) => {
  let audioFilePath = null;
  let isChunkedFile = false;

  try {
    // 파일 소스 결정 (우선순위: 청크조립파일 > 직접업로드)
    if (req.body.serverFilePath) {
      const resolvedPath = path.resolve(req.body.serverFilePath);
      const tmpDir = os.tmpdir();
      if (!resolvedPath.startsWith(tmpDir)) {
        return res.status(400).json({ success: false, error: '잘못된 파일 경로입니다.' });
      }
      if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ success: false, error: '업로드된 파일을 찾을 수 없습니다.' });
      }
      audioFilePath = resolvedPath;
      isChunkedFile = true;
    } else if (req.file) {
      audioFilePath = req.file.path;
    } else {
      return res.status(400).json({
        success: false,
        error: '음성 파일이 업로드되지 않았습니다.'
      });
    }

    console.log('🎤 사실확인서 STT 변환 시작:', isChunkedFile ? '청크 조립 파일' : req.file.filename);

    // OpenAI Whisper API 호출
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json'
    });

    console.log('✅ STT 변환 완료:', transcription.text.substring(0, 100) + '...');

    res.json({
      success: true,
      transcript: transcription.text,
      duration: transcription.duration
    });

  } catch (error) {
    console.error('❌ STT 변환 오류:', error);
    res.status(500).json({
      success: false,
      error: 'STT 변환 중 오류가 발생했습니다.',
      details: error.message
    });
  } finally {
    // 임시 파일 정리
    if (audioFilePath) {
      try { fs.unlinkSync(audioFilePath); } catch (e) { /* ignore */ }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/fact-confirmation/generate
// STT 텍스트 → AI 사실확인서 구조화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { transcript, personalInfo } = req.body;

    if (!transcript || !personalInfo) {
      return res.status(400).json({
        success: false,
        error: '필수 정보가 누락되었습니다.'
      });
    }

    console.log('🤖 사실확인서 구조화 시작');

    // GPT-4로 사실확인서 구조화
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
    
    // JSON 추출 (마크다운 코드 블록 제거)
    let jsonText = responseText;
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    const parsedContent = JSON.parse(jsonText);

    // 문서 구조 생성
    const document = {
      title: personalInfo.caseTitle || '사실확인서 (진술서)',
      personalInfo: personalInfo,
      sections: parsedContent.sections
    };

    console.log('✅ 사실확인서 구조화 완료:', document.sections.length, '개 섹션');

    res.json({
      success: true,
      document: document
    });

  } catch (error) {
    console.error('❌ 문서 구조화 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 구조화 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/fact-confirmation/download
// 사실확인서 → Word 파일 생성 및 다운로드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/download', authenticateToken, async (req, res) => {
  try {
    const { document: docData } = req.body;

    if (!docData) {
      return res.status(400).json({
        success: false,
        error: '문서 데이터가 누락되었습니다.'
      });
    }

    console.log('📄 Word 문서 생성 시작');

    // Word 문서 생성
    const doc = createWordDocument(docData);

    // Buffer로 변환
    const buffer = await Packer.toBuffer(doc);

    console.log('✅ Word 문서 생성 완료');

    // 파일 다운로드
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="사실확인서_${docData.personalInfo.subjectName}_${new Date().toISOString().split('T')[0]}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ Word 생성 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Word 문서 생성 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Word 문서 생성 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createWordDocument(docData) {
  const children = [];

  // 제목
  children.push(
    new Paragraph({
      text: docData.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  // 개인정보 테이블
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
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      margins: {
        top: 100,
        bottom: 100,
        left: 100,
        right: 100
      }
    })
  );

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }));

  // 섹션별 내용
  docData.sections.forEach((section, sectionIndex) => {
    // 섹션 제목
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `■ ${section.title}`,
            bold: true,
            size: 28
          })
        ],
        spacing: { before: 300, after: 200 }
      })
    );

    // 문답 항목
    section.items.forEach((item, itemIndex) => {
      // 질문
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `문${itemIndex + 1}. `,
              bold: true,
              color: '1e40af'
            }),
            new TextRun({
              text: item.question
            })
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      // 답변
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `답${itemIndex + 1}. `,
              bold: true
            }),
            new TextRun({
              text: item.answer
            })
          ],
          spacing: { after: 200 }
        })
      );
    });
  });

  // 하단 확인 문구
  children.push(
    new Paragraph({
      text: '',
      spacing: { before: 600 }
    })
  );

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
          margin: {
            top: 1440,    // 1인치 = 1440 twips
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      },
      children: children
    }]
  });
}

// 테이블 셀 생성 헬퍼 함수
function createTableCell(text, isHeader = false, colSpan = 1) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text,
            bold: isHeader,
            size: 22
          })
        ]
      })
    ],
    columnSpan: colSpan,
    shading: isHeader ? {
      fill: 'F3F4F6'
    } : undefined,
    width: {
      size: 25,
      type: WidthType.PERCENTAGE
    },
    margins: {
      top: 100,
      bottom: 100,
      left: 100,
      right: 100
    }
  });
}

module.exports = router;
