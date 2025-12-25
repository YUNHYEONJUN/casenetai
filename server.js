require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const aiService = require('./services/aiService');
const creditService = require('./services/creditService');
const { optionalAuth } = require('./middleware/auth');

// 환경 변수 검증
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ 필수 환경 변수가 설정되지 않았습니다:', missingEnvVars.join(', '));
  console.error('   .env 파일을 확인해주세요.');
  process.exit(1);
}

// JWT_SECRET 강도 검증
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  경고: JWT_SECRET이 너무 짧습니다 (최소 32자 권장)');
}

const app = express();
const PORT = process.env.PORT || 3000;

// 보안 헤더 설정 (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://*.supabase.co"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate Limiting (DDoS 방어)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 일반 API Rate Limiter (15분당 100회)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100회 요청
  message: {
    success: false,
    error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 헬스 체크 엔드포인트는 rate limit 제외
    return req.path === '/api/status' || req.path === '/api/anonymization/health';
  }
});

// 로그인 Rate Limiter (15분당 5회 - 무차별 대입 공격 방어)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.'
  },
  skipSuccessfulRequests: true, // 성공한 요청은 카운트하지 않음
});

// 익명화 API Rate Limiter (1분당 10회 - 과도한 사용 방지)
const anonymizationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: '익명화 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
  },
});

// Middleware
// CORS 설정 - 보안 강화
const corsOptions = {
  origin: function (origin, callback) {
    // 허용할 도메인 목록
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://casenetai.com',
      'https://www.casenetai.com',
      process.env.ALLOWED_ORIGIN // 환경 변수로 추가 도메인 설정 가능
    ].filter(Boolean);
    
    // origin이 undefined인 경우 (같은 도메인, Vercel serverless) 또는 허용 목록에 있는 경우 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('⚠️  CORS 차단:', origin);
      // 프로덕션 환경에서만 엄격하게 체크
      if (process.env.NODE_ENV === 'production') {
        callback(new Error('CORS 정책에 의해 차단되었습니다.'));
      } else {
        callback(null, true);
      }
    }
  },
  credentials: true, // 쿠키 등 인증 정보 허용
  optionsSuccessStatus: 200,
  maxAge: 86400 // Preflight 캐시 24시간
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // JSON 페이로드 크기 제한
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// 전역 Rate Limiter 적용
app.use('/api/', apiLimiter);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 인증 & 결제 & 관리자 & 피드백 & 분석 & 3단계 권한 라우터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const authRouter = require('./routes/auth');
const paymentRouter = require('./routes/payment');
const adminRouter = require('./routes/admin');
const feedbackRouter = require('./routes/feedback');
const analyticsRouter = require('./routes/analytics');

// 3단계 권한 시스템 라우터
const systemAdminRouter = require('./routes/system-admin');
const orgAdminRouter = require('./routes/org-admin');
const joinRequestsRouter = require('./routes/join-requests');
const systemAdminDashboardRouter = require('./routes/system-admin-dashboard');

// 진술서 라우터
const statementRouter = require('./routes/statement');

app.use('/api/auth', authRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/analytics', analyticsRouter);

// 3단계 권한 시스템 API
app.use('/api/system-admin', systemAdminRouter);
app.use('/api/org-admin', orgAdminRouter);
app.use('/api/join-requests', joinRequestsRouter);
app.use('/api/system-admin-dashboard', systemAdminDashboardRouter);

// 진술서 API
app.use('/api/statement', statementRouter);

// Multer 설정 (음성 파일 업로드)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 경로 탐색 공격 방지: basename으로 파일명만 추출
    const safeExtname = path.extname(path.basename(file.originalname));
    cb(null, file.fieldname + '-' + uniqueSuffix + safeExtname);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB 제한
    files: 1 // 파일 개수 제한
  },
  fileFilter: function (req, file, cb) {
    // 파일명 보안 검증
    const basename = path.basename(file.originalname);
    if (basename.includes('..') || basename.includes('/') || basename.includes('\\\\')) {
      return cb(new Error('잘못된 파일명입니다.'));
    }
    
    const allowedTypes = /mp3|wav|m4a|ogg|webm|mp4/;
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 
                          'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm'];
    
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);
    
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

// 진술서 작성 페이지
app.get('/statement-recording.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'statement-recording.html'));
});

// 상담일지 페이지
app.get('/elderly-protection.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'elderly-protection.html'));
});

// 익명화 페이지
app.get('/anonymization.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'anonymization.html'));
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

// 오디오 파일 분석 및 비용 견적 API
app.post('/api/analyze-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const audioFilePath = req.file.path;
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
    
    // ffprobe로 오디오 길이 측정
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);
    
    try {
      // Command Injection 방지: 파일 경로 검증
      const safePath = audioFilePath.replace(/[;&|`$()]/g, '');
      if (safePath !== audioFilePath) {
        throw new Error('Invalid file path detected');
      }
      
      const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${safePath}"`
      );
      
      const durationSeconds = parseFloat(stdout.trim());
      const durationMinutes = Math.ceil(durationSeconds / 60);
      
      // 비용 계산
      const exchangeRate = 1320; // 1 USD = 1320 KRW
      const whisperPricePerMinute = 0.006; // $0.006/분
      const clovaPricePerMinute = 0.02; // 약 $0.02/분 (추정)
      
      const whisperCostUSD = durationMinutes * whisperPricePerMinute;
      const whisperCostKRW = Math.ceil(whisperCostUSD * exchangeRate);
      
      const clovaCostUSD = durationMinutes * clovaPricePerMinute;
      const clovaCostKRW = Math.ceil(clovaCostUSD * exchangeRate);
      
      // AI 분석 비용 (Gemini 무료 or GPT-4o-mini 약 12원)
      const aiAnalysisCostBest = 0; // Gemini 무료
      const aiAnalysisCostWorst = 12; // GPT-4o-mini
      
      // 총 비용
      const totalCostBest = whisperCostKRW + aiAnalysisCostBest;
      const totalCostWorst = whisperCostKRW + aiAnalysisCostWorst;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 비용 견적 분석 완료');
      console.log('📁 파일:', req.file.filename);
      console.log('📏 크기:', fileSizeMB, 'MB');
      console.log('⏱️  길이:', Math.floor(durationSeconds / 60), '분', Math.floor(durationSeconds % 60), '초');
      console.log('💰 예상 비용:', totalCostBest, '~', totalCostWorst, '원');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      res.json({
        success: true,
        fileInfo: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          sizeMB: parseFloat(fileSizeMB),
          path: audioFilePath
        },
        duration: {
          seconds: Math.floor(durationSeconds),
          minutes: durationMinutes,
          formatted: `${Math.floor(durationSeconds / 60)}분 ${Math.floor(durationSeconds % 60)}초`
        },
        costEstimate: {
          stt: {
            whisper: {
              pricePerMinute: whisperPricePerMinute,
              costUSD: whisperCostUSD.toFixed(4),
              costKRW: whisperCostKRW,
              engine: 'OpenAI Whisper (1순위)'
            },
            clova: {
              pricePerMinute: clovaPricePerMinute,
              costUSD: clovaCostUSD.toFixed(4),
              costKRW: clovaCostKRW,
              engine: '네이버 Clova (2순위 폴백)'
            }
          },
          aiAnalysis: {
            best: {
              cost: aiAnalysisCostBest,
              engine: 'Google Gemini 2.0 Flash (무료)'
            },
            worst: {
              cost: aiAnalysisCostWorst,
              engine: 'OpenAI GPT-4o-mini (폴백)'
            }
          },
          total: {
            best: totalCostBest,
            worst: totalCostWorst,
            average: Math.ceil((totalCostBest + totalCostWorst) / 2)
          }
        },
        message: `이 녹음 파일은 ${durationMinutes}분 분량으로 약 ${totalCostBest}~${totalCostWorst}원의 요금이 예상됩니다.`
      });
      
    } catch (error) {
      console.error('❌ 오디오 분석 오류:', error);
      
      // ffprobe 실패 시 파일 크기로 대략적인 길이 추정
      const estimatedMinutes = Math.ceil(fileSizeMB / 0.5); // 대략 0.5MB/분 가정
      const estimatedCost = Math.ceil(estimatedMinutes * 0.006 * 1320);
      
      res.json({
        success: true,
        fileInfo: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          sizeMB: parseFloat(fileSizeMB),
          path: audioFilePath
        },
        duration: {
          minutes: estimatedMinutes,
          formatted: `약 ${estimatedMinutes}분 (추정)`,
          note: '정확한 길이를 측정할 수 없어 파일 크기로 추정했습니다.'
        },
        costEstimate: {
          total: {
            best: estimatedCost,
            worst: estimatedCost + 12,
            average: estimatedCost + 6
          }
        },
        message: `이 녹음 파일은 약 ${estimatedMinutes}분 분량으로 약 ${estimatedCost}~${estimatedCost + 12}원의 요금이 예상됩니다.`
      });
    }
    
  } catch (error) {
    console.error('❌ 파일 분석 오류:', error);
    
    // 업로드된 파일 삭제
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('파일 삭제 실패:', e);
      }
    }
    
    res.status(500).json({
      success: false,
      error: '파일 분석 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 음성 파일 업로드 및 처리 API (통합 버전)
app.post('/api/upload-audio', optionalAuth, upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const { consultationType, consultationStage, sttEngine } = req.body;
    const audioFilePath = req.file.path;
    const selectedEngine = sttEngine || 'openai'; // 기본값: openai

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 파일 업로드 완료:', req.file.filename);
    console.log('📋 상담 유형:', consultationType);
    console.log('📋 상담 단계:', consultationStage || '미지정');
    console.log('🎙️  STT 엔진:', selectedEngine === 'clova' ? '네이버 클로바' : 'OpenAI Whisper');
    console.log('📂 파일 경로:', audioFilePath);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // API 키 확인
    const isApiKeyValid = await checkApiKey();

    let report;

    if (isApiKeyValid) {
      // 실제 API 사용 모드
      console.log('🤖 AI 모드: 실제 STT 및 AI 분석 수행');
      
      try {
        // 비용 추적 시작
        const startTime = Date.now();
        
        // 오디오 길이 측정 (실제 비용 계산용)
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execPromise = promisify(exec);
        
        let actualCost = null;
        try {
          // Command Injection 방지: 파일 경로 검증
          const safePath = audioFilePath.replace(/[;&|`$()]/g, '');
          if (safePath !== audioFilePath) {
            throw new Error('Invalid file path detected');
          }
          
          const { stdout } = await execPromise(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${safePath}"`
          );
          const durationSeconds = parseFloat(stdout.trim());
          const durationMinutes = Math.ceil(durationSeconds / 60);
          
          // 비용 계산
          const exchangeRate = 1320;
          const whisperPricePerMinute = 0.006;
          const whisperCostKRW = Math.ceil(durationMinutes * whisperPricePerMinute * exchangeRate);
          
          actualCost = {
            duration: {
              seconds: Math.floor(durationSeconds),
              minutes: durationMinutes,
              formatted: `${Math.floor(durationSeconds / 60)}분 ${Math.floor(durationSeconds % 60)}초`
            },
            sttCost: whisperCostKRW,
            aiCost: 0, // Gemini는 무료, GPT-4o-mini는 약 12원
            totalCost: whisperCostKRW,
            engine: 'OpenAI Whisper'
          };
        } catch (err) {
          console.warn('⚠️ 오디오 길이 측정 실패, 비용 계산 불가:', err.message);
        }
        
        // 음성 파일 처리 (STT + AI 분석) - 워터폴 폴백 자동 적용
        report = await aiService.processAudioToCounselingReport(audioFilePath, consultationType, consultationStage);
        
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log('✅ 상담일지 생성 완료');
        console.log(`⏱️ 처리 시간: ${processingTime}초`);
        if (actualCost) {
          console.log(`💰 실제 비용: ${actualCost.totalCost}원 (${actualCost.engine})`);
        }
        
        // 크레딧 차감 (로그인한 사용자인 경우)
        let creditResult = null;
        if (req.user && actualCost) {
          try {
            creditResult = await creditService.deduct(
              req.user.userId,
              actualCost.totalCost,
              actualCost.duration.seconds / 60,
              consultationType,
              selectedEngine === 'clova' ? 'clova' : 'whisper',
              'gemini' // 또는 GPT 사용 시 'gpt'
            );
            console.log(`💳 크레딧 차감: ${creditResult.charged}원, 잔액: ${creditResult.balance || 'N/A'}원`);
          } catch (creditError) {
            console.error('❌ 크레딧 차감 실패:', creditError.message);
            // 크레딧 차감 실패해도 결과는 반환 (이미 처리 완료)
          }
        }
        
        res.json({
          success: true,
          mode: 'ai',
          report: report,
          processingTime: `${processingTime}초`,
          actualCost: actualCost,
          creditInfo: creditResult,
          message: '상담일지가 성공적으로 생성되었습니다.'
        });
      } catch (error) {
        console.error('❌ AI 처리 오류:', error.message);
        
        // 오류 메시지를 사용자에게 명확하게 전달
        let userMessage = '음성 파일 처리 중 오류가 발생했습니다.';
        
        if (error.message.includes('502') || error.message.includes('503')) {
          userMessage = 'OpenAI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
        } else if (error.message.includes('timeout')) {
          userMessage = '처리 시간이 너무 오래 걸립니다. 더 짧은 음성 파일을 사용해주세요.';
        } else if (error.message.includes('401')) {
          userMessage = 'API 키가 유효하지 않습니다. 관리자에게 문의하세요.';
        } else if (error.message.includes('429')) {
          userMessage = 'API 사용량 한도를 초과했습니다. 관리자에게 문의하세요.';
        }
        
        res.status(500).json({
          success: false,
          error: userMessage,
          details: error.message,
          message: '처리 실패. 다시 시도해주세요.'
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
      error: '파일 업로드 중 오류가 발생했습니다.'
      // details 제거: 보안상 내부 오류 정보 노출 방지
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 문서 익명화 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const anonymizationService = require('./services/anonymizationService');
const documentParser = require('./services/documentParser');

// 문서 익명화용 Multer 설정
const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 경로 탐색 공격 방지: basename으로 파일명만 추출
    const safeExtname = path.extname(path.basename(file.originalname));
    cb(null, 'doc-' + uniqueSuffix + safeExtname);
  }
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB 제한
    files: 1 // 파일 개수 제한
  },
  fileFilter: function (req, file, cb) {
    // 파일명 보안 검증
    const basename = path.basename(file.originalname);
    if (basename.includes('..') || basename.includes('/') || basename.includes('\\\\')) {
      return cb(new Error('잘못된 파일명입니다.'));
    }
    
    const allowedTypes = /docx|pdf|txt/;
    const allowedMimes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/pdf', 'text/plain'];
    
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.includes(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('문서 파일만 업로드 가능합니다 (DOCX, PDF, TXT)'));
    }
  }
});

// 문서 익명화 API (사용 시간 추적 통합 + 하이브리드 AI 지원)
const usageTrackingService = require('./services/usageTrackingService');
const HybridAnonymizationService = require('./services/hybridAnonymizationService');
const { authenticateToken } = require('./middleware/auth');

// 하이브리드 익명화 서비스 초기화
const hybridService = new HybridAnonymizationService({
  openaiApiKey: process.env.OPENAI_API_KEY,
  clovaClientId: process.env.CLOVA_CLIENT_ID,
  clovaClientSecret: process.env.CLOVA_CLIENT_SECRET,
  defaultMethod: 'hybrid',
  minConfidence: 0.7
});

// 텍스트 직접 비교 API (로그인 불필요, 테스트용)
app.post('/api/anonymize-text-compare', express.json(), async (req, res) => {
  try {
    const { text, method = 'compare' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '텍스트가 비어있습니다.' 
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 텍스트 익명화 비교 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 텍스트 길이:', text.length, '자');
    console.log('🔍 비교 방식:', method);

    // 하이브리드 서비스로 비교
    const result = await hybridService.anonymize(text, { method });

    if (!result.success) {
      throw new Error(result.error || '익명화 실패');
    }

    console.log('✅ 비교 완료');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.json({
      success: true,
      method: result.method,
      originalText: text,
      anonymizedText: result.anonymized_text,
      mappings: result.mappings,
      stats: result.stats,
      performance: {
        processingTimeMs: result.processing_time_ms || 0,
        breakdown: result.breakdown || null
      },
      cost: result.cost_estimate || { usd: 0, krw: 0 },
      results: result.results || null,
      comparison: result.comparison || null,
      recommendation: result.recommendation || null
    });

  } catch (error) {
    console.error('❌ 텍스트 비교 오류:', error);
    res.status(500).json({
      success: false,
      error: '텍스트 비교 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 하이브리드 서비스 상태 확인 API
app.get('/api/anonymization/health', async (req, res) => {
  try {
    const health = await hybridService.healthCheck();
    res.json({
      success: true,
      ...health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/anonymize-document', authenticateToken, documentUpload.single('document'), async (req, res) => {
  let filePath = null;
  let logId = null;
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    // 사용자 정보 조회 (기관 ID 포함)
    const authService = require('./services/authService');
    const userInfo = await authService.getUserInfo(req.user.userId);
    
    if (!userInfo.success || !userInfo.user.organization) {
      return res.status(400).json({ 
        error: '기관 정보를 찾을 수 없습니다. 노인보호전문기관 소속 사용자만 이용 가능합니다.' 
      });
    }

    const organizationId = userInfo.user.organization.id;
    const fileSizeKB = Math.round(req.file.size / 1024);
    const fileType = path.extname(req.file.originalname).replace('.', '').toLowerCase();

    filePath = req.file.path;
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 문서 익명화 시작');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 사용자:', userInfo.user.name, `(${userInfo.user.email})`);
    console.log('🏢 기관:', userInfo.user.organization.name, `(ID: ${organizationId})`);
    console.log('📄 파일명:', req.file.originalname);
    console.log('📦 파일 크기:', (req.file.size / 1024).toFixed(2), 'KB');
    console.log('📝 파일 형식:', fileType.toUpperCase());

    // 0. 사용 시간 추적 시작 및 할당량 확인
    console.log('\n[0/4] 할당량 확인 중...');
    try {
      const trackingStart = await usageTrackingService.startAnonymization(
        req.user.userId,
        organizationId,
        req.file.originalname,
        fileType,
        fileSizeKB
      );
      
      logId = trackingStart.logId;
      console.log('✅ 할당량 확인 완료');
      console.log(`   - 남은 시간: ${trackingStart.remainingHours.toFixed(2)}시간`);
      
    } catch (quotaError) {
      console.error('❌ 할당량 초과:', quotaError.message);
      return res.status(429).json({
        success: false,
        error: quotaError.message,
        errorCode: 'QUOTA_EXCEEDED'
      });
    }

    // 1. 문서 파싱
    console.log('\n[1/4] 문서 파싱 중...');
    const parseResult = await documentParser.parse(filePath);
    const originalText = parseResult.text;
    console.log('✅ 파싱 완료:', originalText.length, '자');

    // 2. 익명화 처리 (하이브리드 방식 지원)
    console.log('\n[2/4] 개인정보 탐지 및 익명화 중...');
    
    // 익명화 방식 선택 (기본값: hybrid)
    // method: 'rule' (기존), 'ai' (GPT-4o-mini), 'clova' (네이버 CLOVA), 'hybrid' (통합), 'compare' (비교)
    const anonymizationMethod = req.body.method || 'hybrid';
    console.log(`   익명화 방식: ${anonymizationMethod}`);
    
    let anonymizationResult;
    
    try {
      // 하이브리드 서비스 사용
      anonymizationResult = await hybridService.anonymize(originalText, {
        method: anonymizationMethod,
        minConfidence: 0.7
      });
      
      if (!anonymizationResult.success) {
        throw new Error(anonymizationResult.error || '익명화 실패');
      }
      
    } catch (aiError) {
      console.warn('⚠️ AI 익명화 실패, 룰 기반으로 폴백:', aiError.message);
      
      // 폴백: 기존 룰 기반 방식
      anonymizationService.reset();
      const fallbackResult = anonymizationService.anonymize(originalText);
      anonymizationResult = {
        success: true,
        method: 'rule_fallback',
        anonymized_text: fallbackResult.anonymizedText,
        mappings: fallbackResult.mappings || [],
        stats: {
          names: fallbackResult.mappings?.names?.length || 0,
          facilities: fallbackResult.mappings?.facilities?.length || 0,
          phones: fallbackResult.mappings?.phones?.length || 0,
          addresses: fallbackResult.mappings?.addresses?.length || 0,
          emails: fallbackResult.mappings?.emails?.length || 0,
          residentIds: fallbackResult.mappings?.residentIds?.length || 0
        },
        processing_time_ms: 0,
        cost_estimate: { usd: 0, krw: 0 }
      };
    }
    
    const anonymizedText = anonymizationResult.anonymized_text;
    const mappings = anonymizationResult.mappings;
    const stats = anonymizationResult.stats || {};
    
    // 통계 출력
    console.log('✅ 익명화 완료:');
    console.log(`   - 방식: ${anonymizationResult.method}`);
    console.log(`   - 처리 시간: ${anonymizationResult.processing_time_ms || 0}ms`);
    console.log('   - 이름:', stats.names || 0, '개');
    console.log('   - 시설:', stats.facilities || 0, '개');
    console.log('   - 연락처:', stats.contacts || (stats.phones || 0), '개');
    console.log('   - 주소:', stats.addresses || 0, '개');
    console.log('   - 이메일:', stats.emails || 0, '개');
    console.log('   - 주민번호:', stats.identifiers || (stats.residentIds || 0), '개');
    
    if (anonymizationResult.cost_estimate) {
      console.log(`   - API 비용: $${anonymizationResult.cost_estimate.usd} (약 ${anonymizationResult.cost_estimate.krw}원)`);
    }

    // 3. 사용 시간 기록
    const processingTimeSeconds = (Date.now() - startTime) / 1000;
    console.log('\n[3/4] 사용 시간 기록 중...');
    
    const usageResult = await usageTrackingService.completeAnonymization(
      logId,
      processingTimeSeconds,
      stats
    );
    
    console.log('✅ 사용 시간 기록 완료');
    console.log(`   - 처리 시간: ${processingTimeSeconds.toFixed(2)}초 (${usageResult.processingMinutes.toFixed(4)}분)`);
    console.log(`   - 남은 시간: ${usageResult.remainingHours.toFixed(2)}시간`);
    console.log(`   - 사용한 시간: ${usageResult.usedHours.toFixed(2)}시간`);

    // 4. 결과 반환
    console.log('\n[4/4] 결과 전송 중...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.json({
      success: true,
      method: anonymizationResult.method,
      originalText,
      anonymizedText,
      mappings,
      stats,
      metadata: parseResult.metadata,
      performance: {
        processingTimeMs: anonymizationResult.processing_time_ms || 0,
        breakdown: anonymizationResult.breakdown || null,
        sources: anonymizationResult.sources || null
      },
      cost: anonymizationResult.cost_estimate || { usd: 0, krw: 0 },
      usage: {
        processingTimeSeconds: processingTimeSeconds,
        processingMinutes: usageResult.processingMinutes,
        remainingHours: usageResult.remainingHours,
        usedHours: usageResult.usedHours,
        quotaHours: 10.0
      },
      comparison: anonymizationResult.comparison || null, // compare 모드일 때만
      recommendation: anonymizationResult.recommendation || null
    });

  } catch (error) {
    console.error('❌ 문서 익명화 오류:', error);
    
    // 실패 기록
    if (logId) {
      try {
        await usageTrackingService.failAnonymization(logId, error.message);
      } catch (trackError) {
        console.error('❌ 실패 기록 중 오류:', trackError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: '문서 익명화 중 오류가 발생했습니다.',
      details: error.message
    });
  } finally {
    // 업로드된 파일 삭제
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('파일 삭제 실패:', e);
      }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 텍스트를 줄바꿈 기준으로 여러 Paragraph로 변환하는 헬퍼 함수
function createParagraphsFromText(text, spacing = {}) {
  const { Paragraph } = require('docx');
  
  if (!text) return [new Paragraph({ text: '정보 없음', spacing })];
  
  // 줄바꿈(\n)으로 분리
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  return lines.map((line, index) => new Paragraph({
    text: line.trim(),
    spacing: index === lines.length - 1 ? spacing : { after: 120 } // 마지막 줄만 원래 spacing 적용
  }));
}

// 워드 파일 다운로드 API
app.post('/api/download-word', express.json(), async (req, res) => {
  try {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
    const report = req.body.report;
    
    if (!report) {
      return res.status(400).json({ error: '상담일지 데이터가 없습니다.' });
    }
    
    const consultationTypeText = {
      'phone': '전화상담',
      'visit': '방문상담',
      'office': '내방상담'
    };
    
    // 워드 문서 생성
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // 제목
          new Paragraph({
            text: '노인보호전문기관 상담일지',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 }
          }),
          
          // 1. 기본정보
          new Paragraph({
            text: '■ 1. 기본정보',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `상담일자: ${report.기본정보.상담일자}`, spacing: { after: 100 } }),
          new Paragraph({ text: `상담유형: ${consultationTypeText[report.기본정보.상담유형] || report.기본정보.상담유형}`, spacing: { after: 100 } }),
          new Paragraph({ text: `접수번호: ${report.기본정보.접수번호}`, spacing: { after: 100 } }),
          new Paragraph({ text: `상담원: ${report.기본정보.상담원 || '미입력'}`, spacing: { after: 300 } }),
          
          // 상담 요약
          new Paragraph({
            text: '📋 상담 요약',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          ...createParagraphsFromText(report.상담요약 || '정보 없음', { after: 300 }),
          
          // 상담 내용 정리
          new Paragraph({
            text: '📝 상담 내용 정리 (시간순 서술)',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          ...createParagraphsFromText(report.상담내용정리 || '정보 없음', { after: 300 }),
          
          // 2. 신고자 정보
          new Paragraph({
            text: '■ 2. 신고자/내담자 정보',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `신고자명: ${report.신고자정보?.신고자명 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `피해노인과의 관계: ${report.신고자정보?.관계 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `연락처: ${report.신고자정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `신고 경위: ${report.신고자정보?.신고경위 || '미입력'}`, spacing: { after: 300 } }),
          
          // 3. 피해노인 정보
          new Paragraph({
            text: '■ 3. 피해노인(클라이언트) 정보',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: '▶ 인적사항', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
          new Paragraph({ text: `성명: ${report.피해노인정보?.성명 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `성별: ${report.피해노인정보?.성별 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `생년월일: ${report.피해노인정보?.생년월일 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `연령: ${report.피해노인정보?.연령 || '미입력'}세`, spacing: { after: 100 } }),
          new Paragraph({ text: `연락처: ${report.피해노인정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `주소: ${report.피해노인정보?.주소 || '미입력'}`, spacing: { after: 200 } }),
          
          new Paragraph({ text: '▶ 건강상태', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
          new Paragraph({ text: `신체적 건강: ${report.피해노인정보?.건강상태?.신체 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `정신적 건강: ${report.피해노인정보?.건강상태?.정신 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `복용 약물: ${report.피해노인정보?.건강상태?.복용약물 || '없음'}`, spacing: { after: 200 } }),
          
          new Paragraph({ text: '▶ 경제상태', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
          new Paragraph({ text: report.피해노인정보?.경제상태 || '미입력', spacing: { after: 200 } }),
          
          new Paragraph({ text: '▶ 가족관계', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
          new Paragraph({ text: report.피해노인정보?.가족관계 || '미입력', spacing: { after: 100 } }),
          new Paragraph({ text: `주 돌봄 제공자: ${report.피해노인정보?.주돌봄제공자 || '없음'}`, spacing: { after: 300 } }),
          
          // 4. 행위자 정보
          new Paragraph({
            text: '■ 4. 행위자(학대의심자) 정보',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `성명: ${report.행위자정보?.성명 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `피해노인과의 관계: ${report.행위자정보?.관계 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `성별: ${report.행위자정보?.성별 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `연령: ${report.행위자정보?.연령 || '미입력'}세`, spacing: { after: 100 } }),
          new Paragraph({ text: `연락처: ${report.행위자정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `특성: ${report.행위자정보?.특성 || '미입력'}`, spacing: { after: 300 } }),
          
          // 5. 학대 의심 내용
          new Paragraph({
            text: '■ 5. 학대 의심 내용',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `학대 유형: ${report.학대내용?.학대유형 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `발생 시기: ${report.학대내용?.발생시기 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `발생 장소: ${report.학대내용?.발생장소 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `구체적 행위 (5W1H): ${report.학대내용?.구체적행위 || '미입력'}`, spacing: { after: 100, line: 360 } }),
          new Paragraph({ text: `심각성 정도: ${report.학대내용?.심각성 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `학대 증거: ${report.학대내용?.증거 || '없음'}`, spacing: { after: 300 } }),
          
          // 6. 피해노인의 현재 상태
          new Paragraph({
            text: '■ 6. 피해노인의 현재 상태',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `신체 상태: ${report.현재상태?.신체상태 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `정서 상태: ${report.현재상태?.정서상태 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `생활 환경: ${report.현재상태?.생활환경 || '미입력'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `위험도: ${report.현재상태?.위험도 || '미입력'}`, spacing: { after: 300 } }),
          
          // 7. 현장조사 내용
          new Paragraph({
            text: '■ 7. 현장조사 내용',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `실시 여부: ${report.현장조사?.실시여부 ? '실시함' : '실시 안 함'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `방문 일시: ${report.현장조사?.방문일시 || '해당없음'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `관찰 내용: ${report.현장조사?.관찰내용 || '해당없음'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `면담 내용: ${report.현장조사?.면담내용 || '해당없음'}`, spacing: { after: 300 } }),
          
          // 8. 즉시 조치사항
          new Paragraph({
            text: '■ 8. 즉시 조치사항',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `응급 조치: ${report.즉시조치?.응급조치 || '없음'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `분리 보호: ${report.즉시조치?.분리보호 || '없음'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `의료 연계: ${report.즉시조치?.의료연계 || '없음'}`, spacing: { after: 100 } }),
          new Paragraph({ text: `기타 조치: ${report.즉시조치?.기타조치 || '없음'}`, spacing: { after: 300 } }),
          
          // 9. 향후 계획
          new Paragraph({
            text: '■ 9. 향후 계획',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `단기 계획: ${report.향후계획?.단기계획 || '미입력'}`, spacing: { after: 100, line: 360 } }),
          new Paragraph({ text: `장기 계획: ${report.향후계획?.장기계획 || '미입력'}`, spacing: { after: 100, line: 360 } }),
          new Paragraph({ text: `모니터링 계획: ${report.향후계획?.모니터링 || '미입력'}`, spacing: { after: 100, line: 360 } }),
          new Paragraph({ text: `연계 기관: ${report.향후계획?.연계기관 || '없음'}`, spacing: { after: 300 } }),
          
          // 10. 상담원 의견 및 특이사항
          new Paragraph({
            text: '■ 10. 상담원 의견 및 특이사항',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: `상담원 종합 의견: ${report.상담원의견 || '미입력'}`, spacing: { after: 100, line: 360 } }),
          new Paragraph({ text: `특이사항: ${report.특이사항 || '없음'}`, spacing: { after: 400, line: 360 } }),
          
          // 하단 정보
          new Paragraph({ text: '', spacing: { before: 600 } }),
          new Paragraph({
            text: `생성일시: ${new Date().toLocaleString('ko-KR')}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: '시스템: CaseNetAI by WellPartners',
            alignment: AlignmentType.CENTER
          })
        ]
      }]
    });
    
    // 워드 파일을 버퍼로 생성
    const { Packer } = require('docx');
    const buffer = await Packer.toBuffer(doc);
    
    // 파일 다운로드
    const filename = `상담일지_${report.기본정보.접수번호}_${report.기본정보.상담일자}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
    
  } catch (error) {
    console.error('워드 파일 생성 오류:', error);
    res.status(500).json({ error: '워드 파일 생성 중 오류가 발생했습니다.' });
  }
});

// 서버 시작 (로컬 개발환경에서만 실행)
if (require.main === module) {
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
}

// Vercel Serverless Function을 위한 export
module.exports = app;
