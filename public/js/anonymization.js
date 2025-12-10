/**
 * 문서 익명화 프론트엔드
 */

let currentFile = null;
let anonymizedData = null;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    setupFileUpload();
    checkAuth();
});

/**
 * 인증 확인
 */
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('로그인이 필요합니다.');
        window.location.href = '/login.html';
    }
}

/**
 * 파일 업로드 UI 설정
 */
function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 클릭 이벤트
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // 파일 선택 이벤트
    fileInput.addEventListener('change', handleFileSelect);

    // 드래그 앤 드롭
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

/**
 * 파일 선택 핸들러
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

/**
 * 파일 처리
 */
function handleFile(file) {
    // 파일 크기 확인 (10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기는 10MB를 초과할 수 없습니다.');
        return;
    }

    // 파일 형식 확인
    const allowedTypes = ['.docx', '.pdf', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(ext)) {
        alert('지원하지 않는 파일 형식입니다. (DOCX, PDF, TXT만 가능)');
        return;
    }

    currentFile = file;

    // 파일 정보 표시
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').style.display = 'block';
}

/**
 * 파일 크기 포맷
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 문서 익명화 처리
 */
async function processDocument() {
    if (!currentFile) {
        alert('파일을 먼저 선택해주세요.');
        return;
    }

    const formData = new FormData();
    formData.append('document', currentFile);

    // 로딩 표시
    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/anonymize-document', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '익명화 처리 중 오류가 발생했습니다.');
        }

        const data = await response.json();
        anonymizedData = data;

        // 결과 표시
        displayResults(data);

    } catch (error) {
        console.error('익명화 오류:', error);
        alert('오류: ' + error.message);
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

/**
 * 결과 표시
 */
function displayResults(data) {
    // 결과 섹션 표시
    document.getElementById('resultSection').style.display = 'block';

    // 익명화된 텍스트 표시
    document.getElementById('anonymizedText').textContent = data.anonymizedText;

    // 통계 업데이트
    const mappings = data.mappings;
    document.getElementById('statNames').textContent = mappings.names?.length || 0;
    document.getElementById('statFacilities').textContent = mappings.facilities?.length || 0;
    document.getElementById('statPhones').textContent = mappings.phones?.length || 0;
    document.getElementById('statAddresses').textContent = mappings.addresses?.length || 0;

    // 매핑 테이블 생성
    createMappingTable(mappings);

    // 결과 섹션으로 스크롤
    document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 매핑 테이블 생성
 */
function createMappingTable(mappings) {
    const container = document.getElementById('mappingTableContainer');
    let html = '';

    const categories = [
        { key: 'names', label: '이름', icon: 'person', color: 'primary' },
        { key: 'facilities', label: '시설', icon: 'building', color: 'success' },
        { key: 'phones', label: '연락처', icon: 'telephone', color: 'info' },
        { key: 'addresses', label: '주소', icon: 'geo-alt', color: 'warning' },
        { key: 'emails', label: '이메일', icon: 'envelope', color: 'secondary' },
        { key: 'residentIds', label: '주민번호', icon: 'card-text', color: 'danger' }
    ];

    categories.forEach(cat => {
        const items = mappings[cat.key];
        if (items && items.length > 0) {
            html += `
                <div class="mb-4">
                    <h6>
                        <span class="badge bg-${cat.color} badge-category">
                            <i class="bi bi-${cat.icon}"></i> ${cat.label} (${items.length}개)
                        </span>
                    </h6>
                    <table class="table table-sm table-bordered mapping-table">
                        <thead class="table-light">
                            <tr>
                                <th width="50">#</th>
                                <th>원본</th>
                                <th>익명화</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            items.forEach((item, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td><code>${escapeHtml(item.original)}</code></td>
                        <td><strong class="text-${cat.color}">${escapeHtml(item.anonymized)}</strong></td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
    });

    if (html === '') {
        html = '<div class="alert alert-info">익명화된 항목이 없습니다.</div>';
    }

    container.innerHTML = html;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 익명화된 텍스트 복사
 */
function copyAnonymizedText() {
    const text = document.getElementById('anonymizedText').textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('익명화된 텍스트가 클립보드에 복사되었습니다.');
    }).catch(err => {
        console.error('복사 실패:', err);
        alert('복사에 실패했습니다.');
    });
}

/**
 * 익명화된 텍스트 다운로드
 */
function downloadAnonymizedText() {
    if (!anonymizedData) return;

    const text = anonymizedData.anonymizedText;
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `익명화_${currentFile.name.split('.')[0]}_${getDateString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * 매핑 테이블 다운로드 (CSV)
 */
function downloadMappingTable() {
    if (!anonymizedData) return;

    let csv = '\ufeff구분,원본,익명화\n';

    const mappings = anonymizedData.mappings;
    const categories = {
        'names': '이름',
        'facilities': '시설',
        'phones': '연락처',
        'addresses': '주소',
        'emails': '이메일',
        'residentIds': '주민번호'
    };

    Object.keys(categories).forEach(key => {
        const items = mappings[key];
        if (items && items.length > 0) {
            items.forEach(item => {
                csv += `${categories[key]},"${item.original}","${item.anonymized}"\n`;
            });
        }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `매핑테이블_${getDateString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * 날짜 문자열 생성
 */
function getDateString() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}
