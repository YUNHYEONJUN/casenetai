/**
 * 사실확인서 자동 생성 - 프론트엔드 로직
 */

let selectedFile = null;
let transcribedText = '';
let parsedDocument = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 초기화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', function() {
    // 파일 업로드 이벤트
    const dropZone = document.getElementById('dropZone');
    const audioFile = document.getElementById('audioFile');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    // 드래그 앤 드롭
    dropZone.addEventListener('click', () => audioFile.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            audioFile.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    // 파일 선택
    audioFile.addEventListener('change', handleFileSelect);

    // 버튼 이벤트
    transcribeBtn.addEventListener('click', transcribeAudio);
    generateBtn.addEventListener('click', generateDocument);
    downloadBtn.addEventListener('click', downloadWord);

    // 초기 날짜 설정 (오늘)
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    document.getElementById('investigationDate').value = localDateTime;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 파일 선택 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleFileSelect() {
    const audioFile = document.getElementById('audioFile');
    const file = audioFile.files[0];

    if (!file) return;

    // 파일 크기 체크 (50MB)
    if (file.size > 50 * 1024 * 1024) {
        alert('파일 크기는 50MB 이하여야 합니다.');
        audioFile.value = '';
        return;
    }

    // 파일 형식 체크
    const allowedTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'video/mp4'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ['mp3', 'wav', 'm4a', 'mp4'];

    if (!allowedExtensions.includes(fileExtension)) {
        alert('지원하지 않는 파일 형식입니다.\n지원 형식: M4A, MP3, WAV, MP4');
        audioFile.value = '';
        return;
    }

    selectedFile = file;

    // 파일 정보 표시
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').classList.add('show');

    // 변환 버튼 활성화
    document.getElementById('transcribeBtn').disabled = false;

    console.log('✅ 파일 선택 완료:', file.name);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 음성 → 텍스트 변환 (STT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function transcribeAudio() {
    if (!selectedFile) {
        alert('파일을 먼저 선택해주세요.');
        return;
    }

    showProgress('음성 파일을 텍스트로 변환 중...', '잠시만 기다려주세요 (1-2분 소요)');

    try {
        const formData = new FormData();
        formData.append('audio', selectedFile);

        const token = localStorage.getItem('token');
        const response = await fetch('/api/fact-confirmation/transcribe', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('텍스트 변환에 실패했습니다.');
        }

        const result = await response.json();
        transcribedText = result.transcript;

        console.log('✅ STT 변환 완료:', transcribedText.substring(0, 100) + '...');

        hideProgress();
        
        // Step 2로 이동
        updateStep(2);
        showSection('infoSection');

        alert('✅ 텍스트 변환이 완료되었습니다!\n이제 개인정보를 입력해주세요.');

    } catch (error) {
        console.error('❌ STT 오류:', error);
        hideProgress();
        alert('텍스트 변환 중 오류가 발생했습니다: ' + error.message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사실확인서 생성 (AI 구조화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateDocument() {
    // 필수 필드 검증
    const requiredFields = [
        'subjectName',
        'birthDate',
        'investigationDate',
        'caseTitle'
    ];

    for (const fieldId of requiredFields) {
        const field = document.getElementById(fieldId);
        if (!field.value.trim()) {
            alert('필수 항목을 모두 입력해주세요.');
            field.focus();
            return;
        }
    }

    showProgress('AI가 사실확인서를 생성 중...', '내용을 구조화하고 있습니다 (30초-1분 소요)');

    try {
        // 개인정보 수집
        const personalInfo = {
            subjectName: document.getElementById('subjectName').value,
            birthDate: document.getElementById('birthDate').value,
            organization: document.getElementById('organization').value,
            position: document.getElementById('position').value,
            contact: document.getElementById('contact').value,
            investigationDate: document.getElementById('investigationDate').value,
            caseTitle: document.getElementById('caseTitle').value,
            notes: document.getElementById('notes').value
        };

        const token = localStorage.getItem('token');
        const response = await fetch('/api/fact-confirmation/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                transcript: transcribedText,
                personalInfo: personalInfo
            })
        });

        if (!response.ok) {
            throw new Error('문서 생성에 실패했습니다.');
        }

        const result = await response.json();
        parsedDocument = result.document;

        console.log('✅ 문서 생성 완료');

        hideProgress();

        // Step 3로 이동
        updateStep(3);
        showSection('previewSection');
        renderPreview(parsedDocument);

        alert('✅ 사실확인서가 생성되었습니다!\n내용을 확인하고 수정하세요.');

    } catch (error) {
        console.error('❌ 문서 생성 오류:', error);
        hideProgress();
        alert('문서 생성 중 오류가 발생했습니다: ' + error.message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 미리보기 렌더링
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderPreview(document) {
    const previewEl = document.getElementById('previewDocument');

    let html = '';

    // 제목
    html += `<div class="doc-title" contenteditable="true">${document.title}</div>`;

    // 개인정보 테이블
    html += `
        <table class="doc-table">
            <tr>
                <th>성명</th>
                <td contenteditable="true">${document.personalInfo.subjectName}</td>
                <th>생년월일</th>
                <td contenteditable="true">${document.personalInfo.birthDate}</td>
            </tr>
            <tr>
                <th>소속기관</th>
                <td contenteditable="true">${document.personalInfo.organization || '-'}</td>
                <th>직위</th>
                <td contenteditable="true">${document.personalInfo.position || '-'}</td>
            </tr>
            <tr>
                <th>연락처</th>
                <td contenteditable="true">${document.personalInfo.contact || '-'}</td>
                <th>조사일시</th>
                <td contenteditable="true">${formatDateTime(document.personalInfo.investigationDate)}</td>
            </tr>
            ${document.personalInfo.notes ? `
            <tr>
                <th>기타사항</th>
                <td colspan="3" contenteditable="true">${document.personalInfo.notes}</td>
            </tr>
            ` : ''}
        </table>
    `;

    // 섹션별 내용
    document.sections.forEach((section, sectionIndex) => {
        html += `
            <div class="doc-section">
                <div class="doc-section-title" contenteditable="true">
                    ■ ${section.title}
                </div>
        `;

        section.items.forEach((item, itemIndex) => {
            html += `
                <div class="qa-item">
                    <div class="qa-question" contenteditable="true">
                        문${itemIndex + 1}. ${item.question}
                    </div>
                    <div class="qa-answer" contenteditable="true">
                        답${itemIndex + 1}. ${item.answer}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    });

    // 하단 확인 문구
    html += `
        <div class="doc-footer">
            <p style="font-weight: 600; font-size: 1.1rem;">
                위 진술은 사실과 다름이 없음을 확인합니다.
            </p>
            <div class="signature-line">
                <p>${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p style="margin-top: 30px;">진술자: ${document.personalInfo.subjectName} (서명 또는 인)</p>
                <p>조사자: __________________ (서명 또는 인)</p>
            </div>
        </div>
    `;

    previewEl.innerHTML = html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Word 파일 다운로드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function downloadWord() {
    showProgress('Word 문서를 생성 중...', '파일을 다운로드 준비하고 있습니다');

    try {
        // 편집된 내용 수집
        const editedDocument = collectEditedContent();

        const token = localStorage.getItem('token');
        const response = await fetch('/api/fact-confirmation/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                document: editedDocument
            })
        });

        if (!response.ok) {
            throw new Error('Word 파일 생성에 실패했습니다.');
        }

        // Blob으로 파일 다운로드
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 파일명 생성
        const fileName = `사실확인서_${editedDocument.personalInfo.subjectName}_${formatDate(new Date())}.docx`;
        a.download = fileName;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        hideProgress();

        // Step 4 완료
        updateStep(4);

        alert(`✅ Word 파일이 다운로드되었습니다!\n\n파일명: ${fileName}`);

        console.log('✅ Word 다운로드 완료:', fileName);

    } catch (error) {
        console.error('❌ Word 다운로드 오류:', error);
        hideProgress();
        alert('Word 파일 다운로드 중 오류가 발생했습니다: ' + error.message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 편집된 내용 수집
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function collectEditedContent() {
    const previewEl = document.getElementById('previewDocument');
    
    // 제목
    const title = previewEl.querySelector('.doc-title').textContent;

    // 개인정보 테이블
    const tableRows = previewEl.querySelectorAll('.doc-table tr');
    const personalInfo = {
        subjectName: tableRows[0].cells[1].textContent,
        birthDate: tableRows[0].cells[3].textContent,
        organization: tableRows[1].cells[1].textContent,
        position: tableRows[1].cells[3].textContent,
        contact: tableRows[2].cells[1].textContent,
        investigationDate: tableRows[2].cells[3].textContent,
        notes: tableRows[3] ? tableRows[3].cells[1].textContent : ''
    };

    // 섹션별 내용
    const sections = [];
    const sectionEls = previewEl.querySelectorAll('.doc-section');
    
    sectionEls.forEach(sectionEl => {
        const sectionTitle = sectionEl.querySelector('.doc-section-title').textContent.replace('■ ', '').trim();
        const items = [];

        const qaItems = sectionEl.querySelectorAll('.qa-item');
        qaItems.forEach(qaItem => {
            const question = qaItem.querySelector('.qa-question').textContent.replace(/^문\d+\.\s*/, '').trim();
            const answer = qaItem.querySelector('.qa-answer').textContent.replace(/^답\d+\.\s*/, '').trim();
            
            items.push({ question, answer });
        });

        sections.push({ title: sectionTitle, items });
    });

    return {
        title,
        personalInfo,
        sections
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI 헬퍼 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showSection(sectionId) {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('infoSection').style.display = 'none';
    document.getElementById('previewSection').classList.remove('show');

    if (sectionId === 'uploadSection') {
        document.getElementById('uploadSection').style.display = 'block';
        updateStep(1);
    } else if (sectionId === 'infoSection') {
        document.getElementById('infoSection').style.display = 'block';
        updateStep(2);
    } else if (sectionId === 'previewSection') {
        document.getElementById('previewSection').classList.add('show');
        updateStep(3);
    }
}

function updateStep(stepNumber) {
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step${i}`);
        step.classList.remove('active', 'completed');
        
        if (i < stepNumber) {
            step.classList.add('completed');
        } else if (i === stepNumber) {
            step.classList.add('active');
        }
    }
}

function showProgress(text, detail = '') {
    document.getElementById('progressText').textContent = text;
    document.getElementById('progressDetail').textContent = detail;
    document.getElementById('progressOverlay').classList.add('show');
}

function hideProgress() {
    document.getElementById('progressOverlay').classList.remove('show');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDateTime(datetimeString) {
    const date = new Date(datetimeString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// 로그아웃
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// 네비게이션 토글
document.getElementById('navToggle')?.addEventListener('click', function() {
    document.getElementById('navMenu').classList.toggle('active');
});
