/**
 * 전국 39개 지역노인보호전문기관 정확한 명단
 * 2025년 11월 기준 (중앙노인보호전문기관 제외)
 */

const { getDB } = require('./db');

// 전국 39개 지역노인보호전문기관 정확한 목록
const organizations = [
  // 서울 (4개)
  { name: '서울특별시남부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시북부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시서부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시동부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  
  // 부산 (3개)
  { name: '부산광역시중부노인보호전문기관', region: '부산', type: 'elderly_protection' },
  { name: '부산광역시서부노인보호전문기관', region: '부산', type: 'elderly_protection' },
  { name: '부산광역시동부노인보호전문기관', region: '부산', type: 'elderly_protection' },
  
  // 대구 (2개)
  { name: '대구남부노인보호전문기관', region: '대구', type: 'elderly_protection' },
  { name: '대구북부노인보호전문기관', region: '대구', type: 'elderly_protection' },
  
  // 인천 (2개)
  { name: '인천광역시노인보호전문기관', region: '인천', type: 'elderly_protection' },
  { name: '인천서부노인보호전문기관', region: '인천', type: 'elderly_protection' },
  
  // 광주 (1개)
  { name: '광주광역시노인보호전문기관', region: '광주', type: 'elderly_protection' },
  
  // 대전 (1개)
  { name: '대전광역시노인보호전문기관', region: '대전', type: 'elderly_protection' },
  
  // 울산 (1개)
  { name: '울산광역시노인보호전문기관', region: '울산', type: 'elderly_protection' },
  
  // 경기 (6개)
  { name: '경기남부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기동부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기북부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기서부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기북서부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기북동부노인보호전문기관', region: '경기', type: 'elderly_protection' },
  
  // 강원 (3개)
  { name: '강원특별자치도노인보호전문기관', region: '강원', type: 'elderly_protection' },
  { name: '강원특별자치도동부노인보호전문기관', region: '강원', type: 'elderly_protection' },
  { name: '강원특별자치도남부노인보호전문기관', region: '강원', type: 'elderly_protection' },
  
  // 충북 (2개)
  { name: '충청북도노인보호전문기관', region: '충북', type: 'elderly_protection' },
  { name: '충청북도북부노인보호전문기관', region: '충북', type: 'elderly_protection' },
  
  // 충남 (2개)
  { name: '충청남도노인보호전문기관', region: '충남', type: 'elderly_protection' },
  { name: '충청남도남부노인보호전문기관', region: '충남', type: 'elderly_protection' },
  
  // 전북 (2개)
  { name: '전북특별자치도노인보호전문기관', region: '전북', type: 'elderly_protection' },
  { name: '전북특별자치도서부노인보호전문기관', region: '전북', type: 'elderly_protection' },
  
  // 전남 (2개)
  { name: '전라남도동부노인보호전문기관', region: '전남', type: 'elderly_protection' },
  { name: '전라남도서부노인보호전문기관', region: '전남', type: 'elderly_protection' },
  
  // 경북 (4개)
  { name: '경상북도동부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  { name: '경상북도북부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  { name: '경상북도서부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  { name: '경상북도남부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  
  // 경남 (2개)
  { name: '경상남도노인보호전문기관', region: '경남', type: 'elderly_protection' },
  { name: '경상남도서부권지역노인보호전문기관', region: '경남', type: 'elderly_protection' },
  
  // 제주 (2개)
  { name: '제주특별자치도제주시노인보호전문기관', region: '제주', type: 'elderly_protection' },
  { name: '제주특별자치도서귀포시노인보호전문기관', region: '제주', type: 'elderly_protection' }
];

async function seedOrganizations() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 전국 39개 지역노인보호전문기관 등록 (정확한 명단)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const db = getDB();
  
  try {
    // 먼저 기존 데이터 모두 삭제
    console.log('🗑️  기존 데이터 삭제 중...');
    await db.run('DELETE FROM organization_usage_quotas');
    await db.run('DELETE FROM organizations WHERE organization_type = "elderly_protection"');
    console.log('✅ 기존 데이터 삭제 완료\n');
    
    let insertedCount = 0;
    
    for (const org of organizations) {
      // 기관 등록
      const result = await db.run(
        `INSERT INTO organizations 
         (name, organization_type, region, plan_type, subscription_status, is_sponsored)
         VALUES (?, ?, ?, 'free', 'active', 0)`,
        [org.name, org.type, org.region]
      );
      
      const organizationId = result.lastID;
      
      // 현재 월 할당량 초기화 (10시간)
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      
      await db.run(
        `INSERT INTO organization_usage_quotas 
         (organization_id, year, month, quota_hours, used_hours, remaining_hours)
         VALUES (?, ?, ?, 10.0, 0.0, 10.0)`,
        [organizationId, year, month]
      );
      
      console.log(`✅ 등록: ${org.name} (ID: ${organizationId})`);
      insertedCount++;
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 기관 등록 완료');
    console.log(`   - 총 등록: ${insertedCount}개`);
    console.log(`   - 목표: ${organizations.length}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 지역별 통계
    console.log('📊 지역별 기관 수:');
    const regionStats = await db.query(
      `SELECT region, COUNT(*) as count 
       FROM organizations 
       WHERE organization_type = 'elderly_protection'
       GROUP BY region 
       ORDER BY count DESC`
    );
    
    let totalCount = 0;
    regionStats.forEach(stat => {
      console.log(`   ${stat.region}: ${stat.count}개`);
      totalCount += stat.count;
    });
    
    console.log(`\n   📍 전체: ${totalCount}개`);
    
    if (totalCount === 39) {
      console.log('   ✅ 39개 기관 등록 완료!');
    } else {
      console.log(`   ⚠️  목표 39개 중 ${totalCount}개 등록됨`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 전체 목록 출력
    console.log('📋 등록된 전체 기관 목록:');
    const allOrgs = await db.query(
      `SELECT id, name, region 
       FROM organizations 
       WHERE organization_type = 'elderly_protection'
       ORDER BY region, id`
    );
    
    let currentRegion = '';
    allOrgs.forEach((org, index) => {
      if (org.region !== currentRegion) {
        currentRegion = org.region;
        console.log(`\n   [${org.region}]`);
      }
      console.log(`   ${index + 1}. ${org.name}`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 기관 등록 실패:', error);
    process.exit(1);
  }
}

seedOrganizations();
