/**
 * Mock 데이터 생성 유틸리티
 * - 테스트용 상담일지 데이터 생성
 */

/**
 * Mock 상담일지 생성
 * @param {string} consultationType - 상담 유형 (phone/visit/office)
 * @returns {Object} 상담일지 데이터
 */
function generateMockReport(consultationType) {
  const currentDate = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return {
    기본정보: {
      상담일자: currentDate,
      상담유형: consultationType,
      상담원: '(자동입력 필요)',
      접수번호: `${currentYear}-${randomNumber}`
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

module.exports = {
  generateMockReport
};
