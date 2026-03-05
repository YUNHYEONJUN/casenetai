/**
 * 전국 39개 지역노인보호전문기관 초기 데이터 등록
 * 2025년 11월 기준
 */

const { getDB } = require('./db');

// 전국 39개 지역노인보호전문기관 목록
const organizations = [
  // 서울 (4개)
  { name: '서울특별시 노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시 동부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시 서부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  { name: '서울특별시 남부노인보호전문기관', region: '서울', type: 'elderly_protection' },
  
  // 부산 (2개)
  { name: '부산광역시 노인보호전문기관', region: '부산', type: 'elderly_protection' },
  { name: '부산광역시 북부노인보호전문기관', region: '부산', type: 'elderly_protection' },
  
  // 대구 (1개)
  { name: '대구광역시 노인보호전문기관', region: '대구', type: 'elderly_protection' },
  
  // 인천 (2개)
  { name: '인천광역시 노인보호전문기관', region: '인천', type: 'elderly_protection' },
  { name: '인천광역시 남부노인보호전문기관', region: '인천', type: 'elderly_protection' },
  
  // 광주 (1개)
  { name: '광주광역시 노인보호전문기관', region: '광주', type: 'elderly_protection' },
  
  // 대전 (1개)
  { name: '대전광역시 노인보호전문기관', region: '대전', type: 'elderly_protection' },
  
  // 울산 (1개)
  { name: '울산광역시 노인보호전문기관', region: '울산', type: 'elderly_protection' },
  
  // 세종 (1개)
  { name: '세종특별자치시 노인보호전문기관', region: '세종', type: 'elderly_protection' },
  
  // 경기 (7개)
  { name: '경기도 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기북부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기동부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기서부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기남부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기중부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  { name: '경기서남부 노인보호전문기관', region: '경기', type: 'elderly_protection' },
  
  // 강원 (2개)
  { name: '강원특별자치도 노인보호전문기관', region: '강원', type: 'elderly_protection' },
  { name: '강원특별자치도 동부노인보호전문기관', region: '강원', type: 'elderly_protection' },
  
  // 충북 (2개)
  { name: '충청북도 노인보호전문기관', region: '충북', type: 'elderly_protection' },
  { name: '충청북도 북부노인보호전문기관', region: '충북', type: 'elderly_protection' },
  
  // 충남 (3개)
  { name: '충청남도 노인보호전문기관', region: '충남', type: 'elderly_protection' },
  { name: '충청남도 서북부노인보호전문기관', region: '충남', type: 'elderly_protection' },
  { name: '충청남도 동부노인보호전문기관', region: '충남', type: 'elderly_protection' },
  
  // 전북 (2개)
  { name: '전북특별자치도 노인보호전문기관', region: '전북', type: 'elderly_protection' },
  { name: '전북특별자치도 동부노인보호전문기관', region: '전북', type: 'elderly_protection' },
  
  // 전남 (2개)
  { name: '전라남도 노인보호전문기관', region: '전남', type: 'elderly_protection' },
  { name: '전라남도 동부노인보호전문기관', region: '전남', type: 'elderly_protection' },
  
  // 경북 (3개)
  { name: '경상북도 노인보호전문기관', region: '경북', type: 'elderly_protection' },
  { name: '경상북도 북부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  { name: '경상북도 남부노인보호전문기관', region: '경북', type: 'elderly_protection' },
  
  // 경남 (4개)
  { name: '경상남도 노인보호전문기관', region: '경남', type: 'elderly_protection' },
  { name: '경상남도 동부노인보호전문기관', region: '경남', type: 'elderly_protection' },
  { name: '경상남도 서부노인보호전문기관', region: '경남', type: 'elderly_protection' },
  { name: '경상남도 중부노인보호전문기관', region: '경남', type: 'elderly_protection' },
  
  // 제주 (1개)
  { name: '제주특별자치도 노인보호전문기관', region: '제주', type: 'elderly_protection' }
];

async function seedOrganizations() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 전국 39개 지역노인보호전문기관 등록');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const db = getDB();
  
  try {
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (const org of organizations) {
      // 중복 체크
      const existing = await db.get(
        'SELECT id FROM organizations WHERE name = ?',
        [org.name]
      );
      
      if (existing) {
        console.log(`⚠️  이미 존재: ${org.name}`);
        skippedCount++;
        continue;
      }
      
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
    console.log(`   - 신규 등록: ${insertedCount}개`);
    console.log(`   - 이미 존재: ${skippedCount}개`);
    console.log(`   - 전체: ${organizations.length}개`);
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
    
    regionStats.forEach(stat => {
      console.log(`   ${stat.region}: ${stat.count}개`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 기관 등록 실패:', error);
    process.exit(1);
  }
}

seedOrganizations();
