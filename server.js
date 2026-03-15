require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requestLogger } = require('./lib/logger');
const { errorHandler } = require('./lib/response');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 환경 변수 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('FATAL: 필수 환경 변수가 설정되지 않았습니다:', missingEnvVars.join(', '));
  process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('경고: JWT_SECRET이 너무 짧습니다 (최소 32자 권장)');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 보안 미들웨어
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://js.tosspayments.com'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.openai.com',
          'https://*.supabase.co',
          'https://*.public.blob.vercel-storage.com',
          'https://blob.vercel-storage.com',
          'https://vercel.com',
          'https://*.tosspayments.com',
        ],
        frameSrc: ['https://js.tosspayments.com'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    permissionsPolicy: {
      features: {
        camera: [],
        geolocation: [],
        microphone: ["'self'"],
      },
    },
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate Limiting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.' } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/status' || req.path === '/api/health' || req.path === '/api/anonymization/health',
});

const anonymizationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '익명화 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://casenetai.kr',
      'https://www.casenetai.kr',
      'https://casenetai.com',
      'https://www.casenetai.com',
      process.env.ALLOWED_ORIGIN,
    ].filter(Boolean);

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'production') {
      callback(new Error('CORS 정책에 의해 차단되었습니다.'));
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 604800, // 7일
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기본 미들웨어
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 요청 로깅 (Winston)
app.use(requestLogger);

// Passport 초기화
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());

// 요청 타임아웃 (2분 기본, AI/STT 경로는 5분)
app.use((req, res, next) => {
  const isLongRunning = req.path.includes('/transcribe') || req.path.includes('/analyze-audio') || req.path.includes('/parse') || req.path.includes('/generate');
  const timeout = isLongRunning ? 300000 : 120000; // 5분 / 2분
  req.setTimeout(timeout);
  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ success: false, error: { code: 'REQUEST_TIMEOUT', message: '요청 시간이 초과되었습니다.' } });
    }
  });
  next();
});

// 전역 Rate Limiter
app.use('/api/', apiLimiter);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 라우트 마운팅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 인증
app.use('/api/auth', require('./routes/auth'));

// 핵심 기능
app.use('/api', require('./routes/audio')); // /api/upload-audio, /api/analyze-audio, /api/status 등
app.use('/api', require('./routes/upload')); // /api/upload-blob, /api/blob-upload, /api/upload-chunk 등
app.use('/api', require('./routes/document')); // /api/download-word

// 진술서 · 사실확인서
app.use('/api/statement', require('./routes/statement'));
app.use('/api/fact-confirmation', require('./routes/fact-confirmation'));

// 익명화 (rate limiter 적용)
const anonymizeRouter = require('./routes/anonymize');
app.post('/api/anonymize-text-compare', anonymizationLimiter, (req, res, next) => {
  // anonymize 라우터의 text-compare로 전달
  req.url = '/text-compare';
  anonymizeRouter(req, res, next);
});
app.use('/api/anonymization', anonymizeRouter); // /api/anonymization/health
app.use('/api/anonymize-document', (req, res, next) => {
  req.url = '/document';
  anonymizeRouter(req, res, next);
});

// 결제 · 크레딧 (결제 전용 레이트 리밋 적용)
app.use('/api/payment/prepare', paymentLimiter);
app.use('/api/payment/confirm', paymentLimiter);
app.use('/api/payment', require('./routes/payment'));

// 관리
app.use('/api/admin', require('./routes/admin'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/analytics', require('./routes/analytics'));

// 3단계 권한 시스템
app.use('/api/system-admin', require('./routes/system-admin'));
app.use('/api/org-admin', require('./routes/org-admin'));
app.use('/api/join-requests', require('./routes/join-requests'));
app.use('/api/system-admin-dashboard', require('./routes/system-admin-dashboard'));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 관리자 설정 (인라인 - 소규모이므로 분리 불필요)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// setup-admin: 브루트포스 방지 레이트 리밋 (5회/15분)
const setupAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
});

// POST만 허용 (GET으로 마스터 비번 전송 방지)
app.post('/api/setup-admin', setupAdminLimiter, async (req, res) => {
  const crypto = require('crypto');
  const key = req.body.key;
  const MASTER_PASSWORD = process.env.MASTER_PASSWORD;
  if (!MASTER_PASSWORD) return res.status(500).json({ error: '서버 설정 오류가 발생했습니다.' });
  const keyBuf = Buffer.from(String(key || ''));
  const correctBuf = Buffer.from(String(MASTER_PASSWORD));
  if (keyBuf.length !== correctBuf.length || !crypto.timingSafeEqual(keyBuf, correctBuf)) {
    return res.status(403).json({ error: '인증에 실패했습니다.' });
  }

  // body에 추가 데이터가 없으면 검증만 (admin-setup.html 첫 단계)
  if (!req.body.email) {
    return res.json({ success: true, message: '마스터 비밀번호 확인 완료' });
  }

  try {
    const { getDB } = require('./database/db-postgres');
    const db = getDB();
    const setupAdmin = require('./scripts/setup-admin');
    const result = await setupAdmin(db);
    res.json({ success: true, message: '관리자 계정 설정 완료' });
  } catch (error) {
    require('./lib/logger').logger.error('setup-admin 오류', { error: error.message });
    res.status(500).json({ error: '관리자 계정 설정 중 오류가 발생했습니다.' });
  }
});

// 서버 시작 시 필수 DB 스키마 보정 (oauth_provider에 'local' 허용)
(async () => {
  try {
    const { getDB } = require('./database/db-postgres');
    const db = getDB();
    await db.run("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_oauth_provider_check");
    await db.run("ALTER TABLE users ADD CONSTRAINT users_oauth_provider_check CHECK (oauth_provider IN ('kakao', 'naver', 'google', 'local'))");
    require('./lib/logger').logger.info('DB 스키마 보정 완료 (oauth_provider local 허용)');
  } catch (e) {
    // 이미 적용되어 있거나 DB 연결 전이면 무시 (서버 시작 차단 방지)
    if (!e.message.includes('already exists')) {
      console.warn('DB 스키마 보정 실패 (비치명적):', e.message);
    }
  }
})();

// 헬스체크 엔드포인트 (모니터링용)
app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', timestamp: new Date().toISOString() };
  try {
    const { getDB } = require('./database/db-postgres');
    const db = getDB();
    const result = await db.get('SELECT 1 as check');
    health.database = result ? 'connected' : 'error';
  } catch (e) {
    health.status = 'degraded';
    health.database = 'disconnected';
  }
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// 프론트엔드 에러 로그 수신
app.post('/api/error-log', (req, res) => {
  const { errors } = req.body;
  if (Array.isArray(errors)) {
    errors.slice(0, 20).forEach((err) => {
      const type = String(err.type || '').substring(0, 50);
      const message = String(err.message || '').substring(0, 500);
      const url = String(err.url || '').substring(0, 200);
      require('./lib/logger').logger.warn('Client Error', { type, message, url, time: err.time });
    });
  }
  res.json({ success: true });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전역 에러 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.use(errorHandler);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 서버 시작
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (require.main === module) {
  const { logger } = require('./lib/logger');

  const server = app.listen(PORT, '0.0.0.0', async () => {
    logger.info(`CaseNetAI 서버 시작`, { port: PORT, env: process.env.NODE_ENV || 'development' });

    // API 키 확인
    const { checkApiKey } = require('./routes/audio');
    await checkApiKey();

    // 만료 세션 자동 정리 시작
    const { startSessionCleanup } = require('./lib/sessionCleanup');
    startSessionCleanup();
  });

  // Graceful Shutdown
  function gracefulShutdown(signal) {
    logger.info(`${signal} 수신 - 서버 종료 시작`);
    const { stopSessionCleanup } = require('./lib/sessionCleanup');
    stopSessionCleanup();
    server.close(async () => {
      try {
        const { getDB } = require('./database/db-postgres');
        await getDB().close();
        logger.info('DB 연결 풀 종료 완료');
      } catch (e) {
        logger.error('DB 종료 오류', { error: e.message });
      }
      logger.info('모든 연결 종료 완료');
      process.exit(0);
    });

    // 강제 종료 타임아웃 (10초)
    setTimeout(() => {
      logger.error('강제 종료 (타임아웃)');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', { reason: String(reason) });
  });
}

module.exports = app;
