const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Multer 설정 (음성 파일 업로드)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB 제한
  fileFilter: function (req, file, cb) {
    const allowedTypes = /mp3|wav|m4a|ogg|webm|mp4/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('음성 파일만 업로드 가능합니다 (mp3, wav, m4a, ogg, webm, mp4)'));
    }
  }
});

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 음성 파일 업로드 API
app.post('/api/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const { consultationType } = req.body;

    console.log('파일 업로드 완료:', req.file.filename);
    console.log('상담 유형:', consultationType);

    // 여기서 STT 및 AI 처리를 수행
    // 현재는 mock 데이터 반환
    const mockResult = {
      success: true,
      filename: req.file.filename,
      consultationType: consultationType,
      message: '음성 파일이 성공적으로 업로드되었습니다. 처리 중입니다...'
    };

    res.json(mockResult);
  } catch (error) {
    console.error('업로드 오류:', error);
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// 상담일지 생성 API (AI 처리)
app.post('/api/generate-report', async (req, res) => {
  try {
    const { filename, consultationType } = req.body;

    // 실제로는 여기서 STT API 호출 및 AI 처리
    // 현재는 mock 데이터 반환
    const mockReport = generateMockReport(consultationType);

    res.json({
      success: true,
      report: mockReport
    });
  } catch (error) {
    console.error('보고서 생성 오류:', error);
    res.status(500).json({ error: '상담일지 생성 중 오류가 발생했습니다.' });
  }
});

// Mock 상담일지 생성 함수
function generateMockReport(consultationType) {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return {
    기본정보: {
      상담일자: currentDate,
      상담유형: consultationType,
      상담원: '',
      접수번호: `2025-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
    },
    피해노인정보: {
      성명: '',
      성별: '',
      연령: '',
      연락처: '',
      주소: ''
    },
    행위자정보: {
      성명: '',
      관계: '',
      연령: '',
      연락처: ''
    },
    상담내용: {
      신고경위: '',
      학대유형: '',
      학대내용: '',
      피해노인상태: '',
      현장상황: ''
    },
    조치사항: {
      즉시조치내용: '',
      연계기관: '',
      향후계획: ''
    },
    특이사항: ''
  };
}

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`CaseNetAI 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT}`);
});
