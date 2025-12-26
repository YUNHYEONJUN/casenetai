const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/welfare-facilities/search
// 경기도 노인복지시설 정보 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post('/search', authenticateToken, async (req, res) => {
  try {
    const { facilityType, searchKeyword } = req.body;
    
    console.log('🔍 노인복지시설 검색:', { facilityType, searchKeyword });
    
    // 공공데이터 포털 API 호출
    // 실제 API 키는 환경변수에서 가져와야 합니다
    const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
    
    if (!apiKey) {
      console.warn('⚠️  PUBLIC_DATA_API_KEY가 설정되지 않았습니다. 테스트 데이터를 반환합니다.');
      
      // 테스트 데이터 (실제 API 연동 전까지 사용)
      const testData = generateTestData(facilityType, searchKeyword);
      
      return res.json({
        success: true,
        facilities: testData,
        totalCount: testData.length,
        message: '테스트 데이터입니다. 실제 API 연동을 위해 PUBLIC_DATA_API_KEY를 설정하세요.'
      });
    }
    
    // 실제 공공데이터 포털 API 호출
    const facilities = await fetchFromPublicDataPortal(apiKey, facilityType, searchKeyword);
    
    res.json({
      success: true,
      facilities: facilities,
      totalCount: facilities.length
    });
    
  } catch (error) {
    console.error('❌ 시설 검색 오류:', error);
    res.status(500).json({
      success: false,
      error: '시설 정보를 불러오는 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

/**
 * 공공데이터 포털 API 호출
 * 실제 API 엔드포인트와 파라미터는 데이터셋에 따라 다릅니다
 */
async function fetchFromPublicDataPortal(apiKey, facilityType, searchKeyword) {
  try {
    // 경기도 오픈API 엔드포인트 (예시)
    // 실제 URL은 공공데이터 포털에서 확인 필요
    const baseUrl = 'https://openapi.gg.go.kr';
    
    // 시설 유형별 엔드포인트 매핑
    const endpoints = {
      'welfare_center': '/OldmanWelfareFacility',  // 노인복지관
      'nursing_home': '/OldmanNursingHome',         // 노인요양시설
      'leisure': '/OldmanLeisureFacility',          // 노인여가복지시설
      'medical': '/OldmanMedicalFacility',          // 노인의료복지시설
      'home_care': '/OldmanHomeCare',                // 재가노인복지시설
      'job_support': '/OldmanJobSupport',            // 노인일자리지원기관
      'group_home': '/OldmanGroupHome',              // 노인요양공동생활가정
      'residential': '/OldmanResidential',           // 노인주거복지시설
      'care_service': '/OldmanCareService',          // 노인돌봄서비스수행기관
      'elderly_home': '/ElderlyHome',                // 양로시설
      'silver_bank': '/SilverBank'                   // 실버인력뱅크
    };
    
    const endpoint = endpoints[facilityType] || endpoints['welfare_center'];
    
    // API 호출
    const response = await axios.get(`${baseUrl}${endpoint}`, {
      params: {
        KEY: apiKey,
        Type: 'json',
        pIndex: 1,
        pSize: 1000,
        ...(searchKeyword && { SIGUN_NM: searchKeyword })
      },
      timeout: 10000
    });
    
    // 응답 데이터 파싱 (실제 API 구조에 맞게 수정 필요)
    const items = response.data?.[endpoint]?.[1]?.row || [];
    
    // 데이터 정규화
    return items.map(item => ({
      name: item.FACLT_NM || item.ENTRPS_NM,
      type: facilityType,
      address: item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR,
      phone: item.TELNO,
      capacity: item.FCLTY_SCALE || item.ENTRPS_CNT,
      representative: item.RPRSNTV_NM,
      website: item.HMPG_URL
    }));
    
  } catch (error) {
    console.error('공공데이터 포털 API 오류:', error.message);
    throw new Error('공공데이터 조회 실패');
  }
}

/**
 * 테스트 데이터 생성
 * 실제 API 연동 전까지 사용
 */
function generateTestData(facilityType, searchKeyword) {
  const cities = ['수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '남양주시', '안양시', '평택시', '시흥시'];
  const typeNames = {
    'welfare_center': '노인복지관',
    'nursing_home': '노인요양시설',
    'leisure': '노인여가복지시설',
    'medical': '노인의료복지시설',
    'home_care': '재가노인복지시설',
    'job_support': '노인일자리지원기관',
    'group_home': '노인요양공동생활가정',
    'residential': '노인주거복지시설',
    'care_service': '노인돌봄서비스수행기관',
    'elderly_home': '양로시설',
    'silver_bank': '실버인력뱅크'
  };
  
  const testFacilities = [];
  const selectedType = facilityType || 'welfare_center';
  const typeName = typeNames[selectedType] || '노인복지관';
  
  // 10개의 테스트 데이터 생성
  for (let i = 1; i <= 10; i++) {
    const city = cities[Math.floor(Math.random() * cities.length)];
    
    // 검색어 필터링
    if (searchKeyword && !city.includes(searchKeyword)) {
      continue;
    }
    
    testFacilities.push({
      name: `${city} ${typeName} ${i}호점`,
      type: selectedType,
      address: `경기도 ${city} ${['장안구', '권선구', '팔달구', '영통구'][Math.floor(Math.random() * 4)]} 테스트로 ${i * 10}번길 ${i}`,
      phone: `031-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
      capacity: Math.floor(Math.random() * 100 + 20),
      representative: `홍길동 ${i}`,
      website: `https://example-${i}.com`
    });
  }
  
  return testFacilities;
}

module.exports = router;
