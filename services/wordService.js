/**
 * Word 문서 생성 서비스
 * - 상담일지를 Word(.docx) 문서로 변환
 */

const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

/**
 * 텍스트를 여러 Paragraph로 변환 (줄바꿈 처리)
 */
function createParagraphsFromText(text, spacing = {}) {
  if (!text) return [new Paragraph({ text: '정보 없음', spacing })];
  
  // 줄바꿈(\n)으로 분리
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  return lines.map((line, index) => new Paragraph({
    text: line.trim(),
    spacing: index === lines.length - 1 ? spacing : { after: 120 }
  }));
}

/**
 * 상담일지를 Word 문서로 생성
 */
function createCounselingReportDocument(report) {
  if (!report) {
    throw new Error('상담일지 데이터가 없습니다');
  }
  
  const consultationTypeText = {
    'phone': '전화상담',
    'visit': '방문상담',
    'office': '내방상담'
  };
  
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
        new Paragraph({ text: `상담일자: ${report.기본정보?.상담일자 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `상담유형: ${consultationTypeText[report.기본정보?.상담유형] || report.기본정보?.상담유형 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `접수번호: ${report.기본정보?.접수번호 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `상담원: ${report.기본정보?.상담원 || '미입력'}`, spacing: { after: 300 } }),
        
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
        new Paragraph({ text: `수급 여부: ${report.피해노인정보?.경제상태?.수급여부 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `소득원: ${report.피해노인정보?.경제상태?.소득원 || '미입력'}`, spacing: { after: 300 } }),
        
        // 4. 행위자 정보
        new Paragraph({
          text: '■ 4. 행위자 정보',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({ text: `성명: ${report.행위자정보?.성명 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `피해노인과의 관계: ${report.행위자정보?.관계 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `성별: ${report.행위자정보?.성별 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `연령: ${report.행위자정보?.연령 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `연락처: ${report.행위자정보?.연락처 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `직업: ${report.행위자정보?.직업 || '미입력'}`, spacing: { after: 300 } }),
        
        // 5. 학대 정보
        new Paragraph({
          text: '■ 5. 학대 정보',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({ text: `학대 유형: ${report.학대정보?.학대유형 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `발생 일시: ${report.학대정보?.발생일시 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `발생 장소: ${report.학대정보?.발생장소 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `빈도: ${report.학대정보?.빈도 || '미입력'}`, spacing: { after: 100 } }),
        new Paragraph({ text: `심각도: ${report.학대정보?.심각도 || '미입력'}`, spacing: { after: 200 } }),
        
        new Paragraph({ text: '▶ 학대 내용', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
        ...createParagraphsFromText(report.학대정보?.학대내용 || '미입력', { after: 300 }),
        
        // 6. 상담 및 조치 사항
        new Paragraph({
          text: '■ 6. 상담 및 조치 사항',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({ text: '▶ 상담 내용', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
        ...createParagraphsFromText(report.상담조치사항?.상담내용 || '미입력', { after: 200 }),
        
        new Paragraph({ text: '▶ 제공 서비스', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
        ...createParagraphsFromText(report.상담조치사항?.제공서비스 || '미입력', { after: 200 }),
        
        new Paragraph({ text: '▶ 향후 계획', heading: HeadingLevel.HEADING_3, spacing: { after: 100 } }),
        ...createParagraphsFromText(report.상담조치사항?.향후계획 || '미입력', { after: 300 }),
        
        // 7. 상담원 의견 및 평가
        new Paragraph({
          text: '■ 7. 상담원 의견 및 평가',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        ...createParagraphsFromText(report.상담원의견 || '미입력', { after: 300 }),
        
        // 8. 특이사항
        new Paragraph({
          text: '■ 8. 특이사항',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }),
        ...createParagraphsFromText(report.특이사항 || '없음', { after: 300 }),
      ]
    }]
  });
  
  return doc;
}

module.exports = {
  createCounselingReportDocument,
  createParagraphsFromText
};
