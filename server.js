require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const aiService = require('./services/aiService');

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

// API 키 유효성 검사 미들웨어
let apiKeyValid = false;
let apiKeyChecked = false;

async function checkApiKey() {
  if (!apiKeyChecked) {
    apiKeyValid = await aiService.validateApiKey();
    apiKeyChecked = true;
    if (!apiKeyValid) {
      console.warn('⚠️  경고: OpenAI API 키가 설정되지 않았거나 유효하지 않습니다.');
      console.warn('⚠️  .env 파일에 OPENAI_API_KEY를 설정해주세요.');
      console.warn('⚠️  Mock 모드로 실행됩니다.');
    } else {
      console.log('✅ OpenAI API 키 인증 성공');
    }
  }
  return apiKeyValid;
}

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API 상태 확인
app.get('/api/status', async (req, res) => {
  const isValid = await checkApiKey();
  res.json({
    status: 'running',
    apiKeyConfigured: isValid,
    mode: isValid ? 'production' : 'mock'
  });
});

// 음성 파일 업로드 및 처리 API (통합 버전)
app.post('/api/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const { consultationType } = req.body;
    const audioFilePath = req.file.path;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 파일 업로드 완료:', req.file.filename);
    console.log('📋 상담 유형:', consultationType);
    console.log('📂 파일 경로:', audioFilePath);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // API 키 확인
    const isApiKeyValid = await checkApiKey();

    let report;

    if (isApiKeyValid) {
      // 실제 API 사용 모드
      console.log('🤖 AI 모드: 실제 STT 및 AI 분석 수행');
      
      try {
        // 음성 파일 처리 (STT + AI 분석)
        report = await aiService.processAudioToCounselingReport(audioFilePath, consultationType);
        
        console.log('✅ 상담일지 생성 완료');
        
        res.json({
          success: true,
          mode: 'ai',
          report: report,
          message: '상담일지가 성공적으로 생성되었습니다.'
        });
      } catch (error) {
        console.error('❌ AI 처리 오류:', error.message);
        
        // AI 처리 실패 시 Mock 모드로 대체
        console.log('⚠️  Mock 모드로 전환하여 응답합니다.');
        report = generateMockReport(consultationType);
        
        res.json({
          success: true,
          mode: 'mock',
          report: report,
          warning: `AI 처리 중 오류가 발생하여 기본 양식을 제공합니다: ${error.message}`,
          message: '기본 상담일지 양식이 생성되었습니다. AI 분석은 실패했습니다.'
        });
      }
    } else {
      // Mock 모드
      console.log('📝 Mock 모드: 기본 양식 제공');
      report = generateMockReport(consultationType);
      
      res.json({
        success: true,
        mode: 'mock',
        report: report,
        warning: 'OpenAI API 키가 설정되지 않아 기본 양식을 제공합니다.',
        message: '기본 상담일지 양식이 생성되었습니다. 실제 AI 분석을 사용하려면 API 키를 설정해주세요.'
      });
    }

    // 처리 완료 후 파일 삭제 (선택사항)
    // setTimeout(() => {
    //   fs.unlink(audioFilePath, (err) => {
    //     if (err) console.error('파일 삭제 오류:', err);
    //   });
    // }, 60000); // 1분 후 삭제

  } catch (error) {
    console.error('❌ 업로드 오류:', error);
    res.status(500).json({ 
      error: '파일 업로드 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// Mock 상담일지 생성 함수
function generateMockReport(consultationType) {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return {
    기본정보: {
      상담일자: currentDate,
      상담유형: consultationType,
      상담원: '(자동입력 필요)',
      접수번호: `2025-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
    },
    피해노인정보: {
      성명: '(자동입력 필요)',
      성별: '(자동입력 필요)',
      연령: '(자동입력 필요)',
      연락처: '(자동입력 필요)',
      주소: '(자동입력 필요)'
    },
    행위자정보: {
      성명: '(자동입력 필요)',
      관계: '(자동입력 필요)',
      연령: '(자동입력 필요)',
      연락처: '(자동입력 필요)'
    },
    상담내용: {
      신고경위: '(자동입력 필요)',
      학대유형: '(자동입력 필요)',
      학대내용: '(자동입력 필요)',
      피해노인상태: '(자동입력 필요)',
      현장상황: '(자동입력 필요)'
    },
    조치사항: {
      즉시조치내용: '(자동입력 필요)',
      연계기관: '(자동입력 필요)',
      향후계획: '(자동입력 필요)'
    },
    특이사항: '(자동입력 필요)'
  };
}

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n┌─────────────────────────────────────────────┐');
  console.log('│   🏥 CaseNetAI - 노인보호 업무자동화 시스템    │');
  console.log('└─────────────────────────────────────────────┘\n');
  console.log(`🌐 서버 주소: http://localhost:${PORT}`);
  console.log(`🚀 환경: ${process.env.NODE_ENV || 'development'}`);
  
  // API 키 확인
  await checkApiKey();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ 서버가 정상적으로 시작되었습니다.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
