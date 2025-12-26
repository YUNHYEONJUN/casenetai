/**
 * 경기도 노인복지시설 정보 조회
 * 공공데이터 포털 API 연동
 */

let currentData = [];

/**
 * 로그아웃
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * 시설 검색
 */
async function searchFacilities() {
    const facilityType = document.getElementById('facilityType').value;
    const searchKeyword = document.getElementById('searchKeyword').value.trim();
    
    const loading = document.getElementById('loading');
    const facilitiesGrid = document.getElementById('facilitiesGrid');
    const noResults = document.getElementById('noResults');
    const statsBar = document.getElementById('statsBar');
    
    // UI 초기화
    loading.classList.add('active');
    facilitiesGrid.innerHTML = '';
    noResults.classList.remove('active');
    statsBar.style.display = 'none';
    
    try {
        const token = localStorage.getItem('token');
        
        // API 호출
        const response = await fetch('/api/welfare-facilities/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                facilityType,
                searchKeyword
            })
        });
        
        if (!response.ok) {
            throw new Error('데이터를 불러올 수 없습니다');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || '데이터 조회 실패');
        }
        
        currentData = data.facilities || [];
        
        // 결과 표시
        displayFacilities(currentData);
        
    } catch (error) {
        console.error('검색 오류:', error);
        alert('검색 중 오류가 발생했습니다: ' + error.message);
        noResults.classList.add('active');
    } finally {
        loading.classList.remove('active');
    }
}

/**
 * 시설 목록 표시
 */
function displayFacilities(facilities) {
    const facilitiesGrid = document.getElementById('facilitiesGrid');
    const noResults = document.getElementById('noResults');
    const statsBar = document.getElementById('statsBar');
    const resultCount = document.getElementById('resultCount');
    const lastUpdate = document.getElementById('lastUpdate');
    
    if (!facilities || facilities.length === 0) {
        noResults.classList.add('active');
        statsBar.style.display = 'none';
        return;
    }
    
    // 통계 표시
    resultCount.textContent = facilities.length;
    lastUpdate.textContent = `최종 업데이트: ${new Date().toLocaleString('ko-KR')}`;
    statsBar.style.display = 'flex';
    
    // 카드 생성
    facilitiesGrid.innerHTML = facilities.map(facility => `
        <div class="facility-card">
            <div class="facility-badge">${getFacilityTypeName(facility.type)}</div>
            <div class="facility-name">${facility.name || '시설명 없음'}</div>
            <div class="facility-info">
                ${facility.address ? `
                    <div class="info-row">
                        <span class="info-label">📍 주소</span>
                        <span class="info-value">${facility.address}</span>
                    </div>
                ` : ''}
                ${facility.phone ? `
                    <div class="info-row">
                        <span class="info-label">📞 전화</span>
                        <span class="info-value">${facility.phone}</span>
                    </div>
                ` : ''}
                ${facility.capacity ? `
                    <div class="info-row">
                        <span class="info-label">👥 정원</span>
                        <span class="info-value">${facility.capacity}명</span>
                    </div>
                ` : ''}
                ${facility.representative ? `
                    <div class="info-row">
                        <span class="info-label">👤 대표자</span>
                        <span class="info-value">${facility.representative}</span>
                    </div>
                ` : ''}
                ${facility.website ? `
                    <div class="info-row">
                        <span class="info-label">🌐 홈페이지</span>
                        <span class="info-value">
                            <a href="${facility.website}" target="_blank" style="color: #3b82f6; text-decoration: none;">
                                바로가기 →
                            </a>
                        </span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * 시설 유형 한글명 반환
 */
function getFacilityTypeName(type) {
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
    
    return typeNames[type] || '기타';
}

/**
 * 엔터키로 검색
 */
document.getElementById('searchKeyword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchFacilities();
    }
});

// 페이지 로드 시 전체 검색
window.addEventListener('DOMContentLoaded', function() {
    console.log('✅ 노인복지시설 정보 페이지 로드 완료');
    // searchFacilities(); // 자동 검색은 선택사항
});
