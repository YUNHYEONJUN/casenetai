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
            spacing: { after: 400 }
          }),
          new Paragraph({
            text: 'Provided by WellPartners (웰파트너스)',
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
          new Paragraph({ text: report.상담요약 || '정보 없음', spacing: { after: 300, line: 360 } }),
          
          // 상담 내용 정리
          new Paragraph({
            text: '📝 상담 내용 정리 (시간순 서술)',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({ text: report.상담내용정리 || '정보 없음', spacing: { after: 300, line: 360 } }),
          
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
