/**
 * 문서 다운로드 API
 * - 상담일지 워드 파일 생성 및 다운로드
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../lib/logger');

// 텍스트를 줄바꿈 기준으로 여러 Paragraph로 변환
function createParagraphsFromText(text, spacing = {}) {
  const { Paragraph } = require('docx');
  if (!text) return [new Paragraph({ text: '정보 없음', spacing })];
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line, index) =>
    new Paragraph({
      text: line.trim(),
      spacing: index === lines.length - 1 ? spacing : { after: 120 },
    })
  );
}

router.post('/download-word', authenticateToken, express.json(), async (req, res) => {
  try {
    const { Document, Paragraph, HeadingLevel, AlignmentType, Packer } = require('docx');
    const report = req.body.report;

    if (!report) {
      return res.status(400).json({ error: '상담일지 데이터가 없습니다.' });
    }

    const consultationTypeText = { phone: '전화상담', visit: '방문상담', office: '내방상담' };

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: '노인보호전문기관 상담일지', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 600 } }),

            new Paragraph({ text: '■ 1. 기본정보', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `상담일자: ${report.기본정보?.상담일자 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `상담유형: ${consultationTypeText[report.기본정보?.상담유형] || report.기본정보?.상담유형 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `접수번호: ${report.기본정보?.접수번호 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `상담원: ${report.기본정보?.상담원 || '미입력'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '📋 상담 요약', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            ...createParagraphsFromText(report.상담요약 || '정보 없음', { after: 300 }),

            new Paragraph({ text: '📝 상담 내용 정리 (시간순 서술)', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            ...createParagraphsFromText(report.상담내용정리 || '정보 없음', { after: 300 }),

            new Paragraph({ text: '■ 2. 신고자/내담자 정보', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `신고자명: ${report.신고자정보?.신고자명 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `피해노인과의 관계: ${report.신고자정보?.관계 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `연락처: ${report.신고자정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `신고 경위: ${report.신고자정보?.신고경위 || '미입력'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 3. 피해노인(클라이언트) 정보', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
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

            new Paragraph({ text: '■ 4. 행위자(학대의심자) 정보', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `성명: ${report.행위자정보?.성명 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `피해노인과의 관계: ${report.행위자정보?.관계 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `성별: ${report.행위자정보?.성별 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `연령: ${report.행위자정보?.연령 || '미입력'}세`, spacing: { after: 100 } }),
            new Paragraph({ text: `연락처: ${report.행위자정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `특성: ${report.행위자정보?.특성 || '미입력'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 5. 학대 의심 내용', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `학대 유형: ${report.학대내용?.학대유형 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `발생 시기: ${report.학대내용?.발생시기 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `발생 장소: ${report.학대내용?.발생장소 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `구체적 행위 (5W1H): ${report.학대내용?.구체적행위 || '미입력'}`, spacing: { after: 100, line: 360 } }),
            new Paragraph({ text: `심각성 정도: ${report.학대내용?.심각성 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `학대 증거: ${report.학대내용?.증거 || '없음'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 6. 피해노인의 현재 상태', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `신체 상태: ${report.현재상태?.신체상태 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `정서 상태: ${report.현재상태?.정서상태 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `생활 환경: ${report.현재상태?.생활환경 || '미입력'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `위험도: ${report.현재상태?.위험도 || '미입력'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 7. 현장조사 내용', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `실시 여부: ${report.현장조사?.실시여부 ? '실시함' : '실시 안 함'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `방문 일시: ${report.현장조사?.방문일시 || '해당없음'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `관찰 내용: ${report.현장조사?.관찰내용 || '해당없음'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `면담 내용: ${report.현장조사?.면담내용 || '해당없음'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 8. 즉시 조치사항', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `응급 조치: ${report.즉시조치?.응급조치 || '없음'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `분리 보호: ${report.즉시조치?.분리보호 || '없음'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `의료 연계: ${report.즉시조치?.의료연계 || '없음'}`, spacing: { after: 100 } }),
            new Paragraph({ text: `기타 조치: ${report.즉시조치?.기타조치 || '없음'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 9. 향후 계획', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `단기 계획: ${report.향후계획?.단기계획 || '미입력'}`, spacing: { after: 100, line: 360 } }),
            new Paragraph({ text: `장기 계획: ${report.향후계획?.장기계획 || '미입력'}`, spacing: { after: 100, line: 360 } }),
            new Paragraph({ text: `모니터링 계획: ${report.향후계획?.모니터링 || '미입력'}`, spacing: { after: 100, line: 360 } }),
            new Paragraph({ text: `연계 기관: ${report.향후계획?.연계기관 || '없음'}`, spacing: { after: 300 } }),

            new Paragraph({ text: '■ 10. 상담원 의견 및 특이사항', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
            new Paragraph({ text: `상담원 종합 의견: ${report.상담원의견 || '미입력'}`, spacing: { after: 100, line: 360 } }),
            new Paragraph({ text: `특이사항: ${report.특이사항 || '없음'}`, spacing: { after: 400, line: 360 } }),

            new Paragraph({ text: '', spacing: { before: 600 } }),
            new Paragraph({ text: `생성일시: ${new Date().toLocaleString('ko-KR')}`, alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
            new Paragraph({ text: '시스템: CaseNetAI by WellPartners', alignment: AlignmentType.CENTER }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `상담일지_${report.기본정보?.접수번호 || '미정'}_${report.기본정보?.상담일자 || new Date().toISOString().slice(0, 10)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error) {
    logger.error('워드 파일 생성 오류', { error: error.message });
    res.status(500).json({ error: '워드 파일 생성 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
