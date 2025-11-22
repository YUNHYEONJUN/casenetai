// DOM 요소
const consultationTypeSelect = document.getElementById('consultationType');
const audioFileInput = document.getElementById('audioFile');
const fileNameDisplay = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const reportContent = document.getElementById('reportContent');
const editBtn = document.getElementById('editBtn');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFile = null;
let currentReport = null;

// 파일 선택 이벤트
audioFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        fileNameDisplay.textContent = `선택된 파일: ${file.name} (${formatFileSize(file.size)})`;
        fileNameDisplay.style.color = 'var(--success-color)';
        fileNameDisplay.style.fontWeight = '600';
        console.log('✅ 파일 선택됨:', file.name);
        checkFormValid();
    }
});

// 드래그 앤 드롭 지원
const fileLabel = document.querySelector('.file-label');

fileLabel.addEventListener('dragover', function(e) {
    e.preventDefault();
    fileLabel.style.borderColor = 'var(--primary-color)';
    fileLabel.style.background = '#f0f7ff';
});

fileLabel.addEventListener('dragleave', function(e) {
    e.preventDefault();
    fileLabel.style.borderColor = 'var(--border-color)';
    fileLabel.style.background = 'var(--white)';
});

fileLabel.addEventListener('drop', function(e) {
    e.preventDefault();
    fileLabel.style.borderColor = 'var(--border-color)';
    fileLabel.style.background = 'var(--white)';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        // 파일 타입 및 확장자 체크
        const allowedExtensions = /\.(mp3|wav|m4a|ogg|webm|mp4)$/i;
        const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm', 'video/mp4', 'audio/m4a'];
        
        const hasValidExtension = allowedExtensions.test(file.name);
        const hasValidType = allowedTypes.some(type => file.type === type || file.type.includes(type.split('/')[1]));
        
        if (hasValidExtension || hasValidType) {
            // input 요소에 파일 설정
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            audioFileInput.files = dataTransfer.files;
            
            selectedFile = file;
            fileNameDisplay.textContent = `선택된 파일: ${file.name} (${formatFileSize(file.size)})`;
            fileNameDisplay.style.color = 'var(--success-color)';
            checkFormValid();
        } else {
            alert('지원하지 않는 파일 형식입니다. MP3, WAV, M4A, OGG, WebM, MP4 파일만 업로드 가능합니다.');
        }
    }
});

// 상담 유형 선택 이벤트
consultationTypeSelect.addEventListener('change', checkFormValid);

// 폼 유효성 검사
function checkFormValid() {
    const hasType = consultationTypeSelect.value !== '';
    const hasFile = selectedFile !== null;
    const isValid = hasType && hasFile;
    
    uploadBtn.disabled = !isValid;
    
    // 상태 메시지 표시
    const statusMessage = document.getElementById('statusMessage');
    if (!isValid) {
        statusMessage.style.display = 'block';
        if (!hasType && !hasFile) {
            statusMessage.innerHTML = '<strong>⚠️ 버튼을 활성화하려면:</strong><br>1️⃣ 상담 유형을 선택하세요<br>2️⃣ 음성 파일을 업로드하세요';
        } else if (!hasType) {
            statusMessage.innerHTML = '<strong>⚠️ 상담 유형을 선택해주세요</strong>';
            statusMessage.style.background = '#fff3cd';
        } else if (!hasFile) {
            statusMessage.innerHTML = '<strong>⚠️ 음성 파일을 업로드해주세요</strong>';
            statusMessage.style.background = '#fff3cd';
        }
    } else {
        statusMessage.style.display = 'none';
    }
    
    // 디버깅 로그
    console.log('📋 폼 검증:', {
        상담유형: consultationTypeSelect.value || '미선택',
        파일: selectedFile ? selectedFile.name : '미선택',
        버튼활성화: isValid
    });
    
    // 버튼 상태 시각적 피드백
    if (isValid) {
        uploadBtn.style.opacity = '1';
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.style.background = 'var(--primary-color)';
        uploadBtn.textContent = '✅ 상담일지 생성하기';
    } else {
        uploadBtn.style.opacity = '0.6';
        uploadBtn.style.cursor = 'not-allowed';
        uploadBtn.style.background = 'var(--secondary-color)';
        uploadBtn.textContent = '상담일지 생성하기';
    }
}

// 파일 크기 포맷팅
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 업로드 버튼 클릭
uploadBtn.addEventListener('click', async function() {
    if (!selectedFile || !consultationTypeSelect.value) {
        alert('상담 유형을 선택하고 파일을 업로드해주세요.');
        return;
    }

    // UI 업데이트
    uploadBtn.disabled = true;
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';

    try {
        // FormData 생성
        const formData = new FormData();
        formData.append('audioFile', selectedFile);
        formData.append('consultationType', consultationTypeSelect.value);

        // 진행 상황 업데이트
        progressBar.style.width = '30%';
        progressText.textContent = '파일 업로드 중...';

        // 파일 업로드
        const uploadResponse = await fetch('/api/upload-audio', {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            throw new Error('파일 업로드에 실패했습니다.');
        }

        const result = await uploadResponse.json();
        
        console.log('서버 응답:', result);
        
        // 서버가 이미 모든 처리를 완료함
        if (result.success && result.report) {
            currentReport = result.report;
        } else if (result.warning) {
            // Mock 모드인 경우
            console.warn('Mock 모드:', result.warning);
            currentReport = result.report;
        } else {
            throw new Error(result.error || '알 수 없는 오류가 발생했습니다.');
        }

        // 진행 상황 완료
        progressBar.style.width = '100%';
        progressText.textContent = '완료!';

        // 잠시 대기 후 결과 표시
        await new Promise(resolve => setTimeout(resolve, 500));

        // 결과 표시
        displayReport(currentReport);
        
        // UI 초기화
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        }, 1000);

    } catch (error) {
        console.error('오류 발생:', error);
        alert('처리 중 오류가 발생했습니다: ' + error.message);
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '다시 시도하기';
    }
});

// 긴 요청을 위한 타임아웃 설정 없음 (서버가 처리할 때까지 대기)

// 상담일지 표시
function displayReport(report) {
    const consultationTypeText = {
        'phone': '전화상담',
        'visit': '방문상담',
        'office': '내방상담'
    };

    const html = `
        <div class="report-section">
            <h4>1. 기본정보</h4>
            <div class="report-field">
                <div class="report-field-label">상담일자</div>
                <div class="report-field-value">${report.기본정보.상담일자}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">상담유형</div>
                <div class="report-field-value">${consultationTypeText[report.기본정보.상담유형] || report.기본정보.상담유형}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">접수번호</div>
                <div class="report-field-value">${report.기본정보.접수번호}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">상담원</div>
                <div class="report-field-value">${report.기본정보.상담원 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>2. 피해노인 정보</h4>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${report.피해노인정보.성명 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">성별/연령</div>
                <div class="report-field-value">${report.피해노인정보.성별 || '미입력'} / ${report.피해노인정보.연령 || '미입력'}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${report.피해노인정보.연락처 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">주소</div>
                <div class="report-field-value">${report.피해노인정보.주소 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>3. 행위자 정보</h4>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${report.행위자정보.성명 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">관계</div>
                <div class="report-field-value">${report.행위자정보.관계 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연령</div>
                <div class="report-field-value">${report.행위자정보.연령 || '미입력'}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${report.행위자정보.연락처 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>4. 상담내용</h4>
            <div class="report-field">
                <div class="report-field-label">신고경위</div>
                <div class="report-field-value">${report.상담내용.신고경위 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">학대유형</div>
                <div class="report-field-value">${report.상담내용.학대유형 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">학대내용</div>
                <div class="report-field-value">${report.상담내용.학대내용 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">피해노인 상태</div>
                <div class="report-field-value">${report.상담내용.피해노인상태 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">현장상황</div>
                <div class="report-field-value">${report.상담내용.현장상황 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>5. 조치사항</h4>
            <div class="report-field">
                <div class="report-field-label">즉시조치 내용</div>
                <div class="report-field-value">${report.조치사항.즉시조치내용 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연계기관</div>
                <div class="report-field-value">${report.조치사항.연계기관 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">향후계획</div>
                <div class="report-field-value">${report.조치사항.향후계획 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>6. 특이사항</h4>
            <div class="report-field">
                <div class="report-field-label">특이사항</div>
                <div class="report-field-value">${report.특이사항 || '미입력'}</div>
            </div>
        </div>
    `;

    reportContent.innerHTML = html;
    resultContainer.style.display = 'block';
    resultContainer.classList.add('fade-in');

    // 결과로 스크롤
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 수정 버튼
editBtn.addEventListener('click', function() {
    alert('수정 기능은 곧 제공될 예정입니다.');
    // TODO: 수정 모드 구현
});

// 다운로드 버튼
downloadBtn.addEventListener('click', function() {
    if (!currentReport) {
        alert('다운로드할 상담일지가 없습니다.');
        return;
    }

    // 간단한 텍스트 형식으로 다운로드
    const consultationTypeText = {
        'phone': '전화상담',
        'visit': '방문상담',
        'office': '내방상담'
    };

    const text = `
노인보호전문기관 상담일지
========================================

[1. 기본정보]
상담일자: ${currentReport.기본정보.상담일자}
상담유형: ${consultationTypeText[currentReport.기본정보.상담유형] || currentReport.기본정보.상담유형}
접수번호: ${currentReport.기본정보.접수번호}
상담원: ${currentReport.기본정보.상담원 || '미입력'}

[2. 피해노인 정보]
성명: ${currentReport.피해노인정보.성명 || '미입력'}
성별: ${currentReport.피해노인정보.성별 || '미입력'}
연령: ${currentReport.피해노인정보.연령 || '미입력'}세
연락처: ${currentReport.피해노인정보.연락처 || '미입력'}
주소: ${currentReport.피해노인정보.주소 || '미입력'}

[3. 행위자 정보]
성명: ${currentReport.행위자정보.성명 || '미입력'}
관계: ${currentReport.행위자정보.관계 || '미입력'}
연령: ${currentReport.행위자정보.연령 || '미입력'}세
연락처: ${currentReport.행위자정보.연락처 || '미입력'}

[4. 상담내용]
신고경위: ${currentReport.상담내용.신고경위 || '미입력'}
학대유형: ${currentReport.상담내용.학대유형 || '미입력'}
학대내용: ${currentReport.상담내용.학대내용 || '미입력'}
피해노인 상태: ${currentReport.상담내용.피해노인상태 || '미입력'}
현장상황: ${currentReport.상담내용.현장상황 || '미입력'}

[5. 조치사항]
즉시조치 내용: ${currentReport.조치사항.즉시조치내용 || '미입력'}
연계기관: ${currentReport.조치사항.연계기관 || '미입력'}
향후계획: ${currentReport.조치사항.향후계획 || '미입력'}

[6. 특이사항]
${currentReport.특이사항 || '미입력'}

========================================
생성일시: ${new Date().toLocaleString('ko-KR')}
시스템: CaseNetAI by WellPartners
    `.trim();

    // 파일 다운로드
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `상담일지_${currentReport.기본정보.접수번호}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// 스무스 스크롤
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// 페이지 로드 시 초기 상태 체크
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 페이지 로드 완료');
    checkFormValid();
});
