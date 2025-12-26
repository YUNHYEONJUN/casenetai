// 로그인 필수 체크
(function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('로그인이 필요한 서비스입니다.');
        window.location.href = '/login.html';
        return;
    }
})();

// DOM 요소
const consultationTypeSelect = document.getElementById('consultationType');
const consultationStageSelect = document.getElementById('consultationStage');
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
let costEstimate = null;

// 파일 선택 이벤트
audioFileInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        fileNameDisplay.textContent = `선택된 파일: ${file.name} (${formatFileSize(file.size)})`;
        fileNameDisplay.style.color = 'var(--success-color)';
        fileNameDisplay.style.fontWeight = '600';
        console.log('✅ 파일 선택됨:', file.name);
        
        // 비용 분석 시작
        await analyzeCost(file);
        
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
            
            // 비용 분석 시작
            analyzeCost(file);
            
            checkFormValid();
        } else {
            alert('지원하지 않는 파일 형식입니다. MP3, WAV, M4A, OGG, WebM, MP4 파일만 업로드 가능합니다.');
        }
    }
});

// 상담 유형 선택 이벤트
consultationTypeSelect.addEventListener('change', checkFormValid);
consultationStageSelect.addEventListener('change', checkFormValid);

// 폼 유효성 검사
function checkFormValid() {
    const hasType = consultationTypeSelect.value !== '';
    const hasStage = consultationStageSelect.value !== '';
    const hasFile = selectedFile !== null;
    const isValid = hasType && hasStage && hasFile;
    
    uploadBtn.disabled = !isValid;
    
    // 상태 메시지 표시
    const statusMessage = document.getElementById('statusMessage');
    if (!isValid) {
        statusMessage.style.display = 'block';
        if (!hasType && !hasStage && !hasFile) {
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

// 비용 분석 함수
async function analyzeCost(file) {
    const costInfoContainer = document.getElementById('costInfoContainer');
    const analyzingBadge = document.getElementById('analyzingBadge');
    const fileSize = document.getElementById('fileSize');
    const audioDuration = document.getElementById('audioDuration');
    const sttCost = document.getElementById('sttCost');
    const totalCost = document.getElementById('totalCost');
    
    // 비용 컨테이너 표시
    costInfoContainer.style.display = 'block';
    costInfoContainer.classList.add('show');
    analyzingBadge.style.display = 'inline-flex';
    
    // 파일 크기 즉시 표시
    fileSize.textContent = formatFileSize(file.size);
    
    try {
        // FormData 생성
        const formData = new FormData();
        formData.append('audioFile', file);
        
        console.log('💰 비용 분석 시작...');
        
        // 서버에 비용 분석 요청
        const token = localStorage.getItem('token');
        const response = await fetch('/api/analyze-audio', {
            method: 'POST',
            headers: token ? {
                'Authorization': `Bearer ${token}`
            } : {},
            body: formData
        });
        
        // JSON 파싱 전에 응답 상태 확인
        if (!response.ok) {
            let errorMessage = `비용 분석 실패 (${response.status})`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
                errorMessage = await response.text() || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            costEstimate = result;
            
            // 결과 표시
            audioDuration.textContent = result.duration.formatted;
            sttCost.textContent = `약 ${result.costEstimate.stt.whisper.costKRW}원`;
            totalCost.textContent = `${result.costEstimate.total.best}~${result.costEstimate.total.worst}원`;
            
            console.log('💰 비용 분석 완료:', {
                duration: result.duration.formatted,
                cost: `${result.costEstimate.total.best}~${result.costEstimate.total.worst}원`
            });
        } else {
            throw new Error(result.error || '비용 분석 실패');
        }
        
    } catch (error) {
        console.error('❌ 비용 분석 오류:', error);
        
        // 오류 시 대략적인 추정값 표시
        const fileSizeMB = file.size / (1024 * 1024);
        const estimatedMinutes = Math.ceil(fileSizeMB / 5); // 5MB당 약 1분
        const estimatedCost = Math.ceil(estimatedMinutes * 0.006 * 1320); // Whisper 기준
        
        audioDuration.textContent = `약 ${estimatedMinutes}분 (추정)`;
        sttCost.textContent = `약 ${estimatedCost}원 (추정)`;
        totalCost.textContent = `${estimatedCost}~${estimatedCost + 12}원 (추정)`;
        
        console.warn('⚠️ 정확한 분석 실패, 추정값 사용');
    } finally {
        analyzingBadge.style.display = 'none';
    }
}

// 업로드 버튼 클릭
uploadBtn.addEventListener('click', async function() {
    if (!selectedFile || !consultationTypeSelect.value || !consultationStageSelect.value) {
        alert('상담 방식, 상담 단계를 선택하고 파일을 업로드해주세요.');
        return;
    }
    
    // 상담 단계 한글 변환
    const stageText = {
        'intake': '접수상담',
        'ongoing': '진행상담',
        'closure': '종결상담',
        'simple': '단순문의'
    };
    
    // 사용자 확인 - 비용 정보와 함께 확인
    if (costEstimate) {
        const confirmMessage = `처리 정보 확인\n\n` +
            `파일: ${selectedFile.name}\n` +
            `크기: ${formatFileSize(selectedFile.size)}\n` +
            `길이: ${costEstimate.duration.formatted}\n` +
            `상담 단계: ${stageText[consultationStageSelect.value] || consultationStageSelect.value}\n\n` +
            `예상 비용: ${costEstimate.costEstimate.total.best}~${costEstimate.costEstimate.total.worst}원\n\n` +
            `• 음성 인식 (STT): 약 ${costEstimate.costEstimate.stt.whisper.costKRW}원\n` +
            `• AI 분석: 무료 ~ 12원\n\n` +
            `처리를 진행하시겠습니까?`;
        
        if (!confirm(confirmMessage)) {
            console.log('❌ 사용자가 처리를 취소했습니다.');
            return;
        }
    } else {
        // 비용 정보가 없는 경우 기본 확인
        if (!confirm(`파일 "${selectedFile.name}"을 처리하시겠습니까?\n상담 단계: ${stageText[consultationStageSelect.value]}`)) {
            return;
        }
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
        formData.append('consultationStage', consultationStageSelect.value); // 상담 단계 추가
        
        // STT 엔진 - 네이버 클로바로 고정
        formData.append('sttEngine', 'clova');
        
        console.log('🎙️ STT 엔진: 네이버 클로바 (노인 음성 특화)');
        console.log('📋 상담 단계:', consultationStageSelect.value);

        // 파일 크기에 따른 예상 처리 시간 계산
        const fileSizeMB = selectedFile.size / 1024 / 1024;
        const estimatedMinutes = Math.ceil(fileSizeMB / 5); // 5MB당 약 1분
        
        // 진행 상황 업데이트
        progressBar.style.width = '10%';
        progressText.textContent = `파일 업로드 중... (예상 처리 시간: ${estimatedMinutes}분)`;
        
        // 진행 상황 시뮬레이션
        let currentProgress = 10;
        const progressInterval = setInterval(() => {
            if (currentProgress < 90) {
                currentProgress += 5;
                progressBar.style.width = currentProgress + '%';
                
                if (currentProgress < 30) {
                    progressText.textContent = `파일 전송 중... (${currentProgress}%)`;
                } else if (currentProgress < 60) {
                    progressText.textContent = `음성 인식 중... (${currentProgress}%) - 잠시만 기다려주세요`;
                } else {
                    progressText.textContent = `AI 분석 중... (${currentProgress}%) - 거의 완료되었습니다`;
                }
            }
        }, 2000); // 2초마다 5% 증가

        // 파일 업로드 (타임아웃 없음 - 서버가 처리할 때까지 대기)
        const token = localStorage.getItem('token');
        const uploadResponse = await fetch('/api/upload-audio', {
            method: 'POST',
            headers: token ? {
                'Authorization': `Bearer ${token}`
            } : {},
            body: formData
        });

        // JSON 파싱 전에 응답 상태 확인
        if (!uploadResponse.ok) {
            let errorMessage = `서버 오류 (${uploadResponse.status})`;
            try {
                const errorData = await uploadResponse.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
                errorMessage = await uploadResponse.text() || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const result = await uploadResponse.json();
        
        // 진행 상황 interval 정리
        clearInterval(progressInterval);
        
        console.log('서버 응답:', result);
        
        // 서버 응답 확인
        if (!uploadResponse.ok || !result.success) {
            // 오류 발생
            const errorMessage = result.error || result.details || '알 수 없는 오류가 발생했습니다.';
            throw new Error(errorMessage);
        }
        
        // 성공적으로 보고서 생성됨
        if (result.report) {
            currentReport = result.report;
        } else {
            throw new Error('보고서 생성에 실패했습니다.');
        }

        // 진행 상황 완료
        progressBar.style.width = '100%';
        progressText.textContent = '완료!';

        // 실제 비용 정보 표시
        if (result.actualCost) {
            console.log('💰 실제 비용:', {
                처리시간: result.processingTime,
                오디오길이: result.actualCost.duration.formatted,
                STT비용: `${result.actualCost.sttCost}원`,
                AI비용: `${result.actualCost.aiCost}원`,
                총비용: `${result.actualCost.totalCost}원`,
                엔진: result.actualCost.engine
            });
            
            // 비용 정보 업데이트
            const costInfoContainer = document.getElementById('costInfoContainer');
            const totalCost = document.getElementById('totalCost');
            const sttCost = document.getElementById('sttCost');
            
            if (costInfoContainer.style.display !== 'none') {
                totalCost.innerHTML = `${result.actualCost.totalCost}원 <span style="font-size: 0.8em; opacity: 0.8;">(실제)</span>`;
                sttCost.innerHTML = `${result.actualCost.sttCost}원 <span style="font-size: 0.8em; opacity: 0.8;">(${result.actualCost.engine})</span>`;
            }
        }

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
        // 진행 상황 interval 정리
        if (typeof progressInterval !== 'undefined') {
            clearInterval(progressInterval);
        }
        
        console.error('오류 발생:', error);
        
        let errorMessage = '처리 중 오류가 발생했습니다: ' + error.message;
        
        // 네트워크 오류인 경우 (타임아웃 가능성)
        if (error.message === 'Failed to fetch' || error.message.includes('network')) {
            errorMessage = `⏱️ 서버 응답 시간이 초과되었습니다.
            
처리가 여전히 진행 중일 수 있습니다.

💡 해결 방법:
1. 1-2분 후 페이지를 새로고침해보세요
2. 더 짧은 음성 파일을 사용해보세요 (20분 이하 권장)
3. 서버가 처리 중일 수 있으니 잠시 기다려주세요

파일: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
        }
        
        alert(errorMessage);
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
            <h4>■ 1. 기본정보</h4>
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

        <div class="report-section" style="background: #fffbea; border-left: 4px solid #fbbf24; padding: 25px; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="margin-bottom: 15px; color: #d97706; border-bottom: none;">상담 요약</h4>
            <div style="font-size: 1.05em; line-height: 1.8; white-space: pre-wrap; color: #78350f; text-align: justify; word-break: keep-all;">${report.상담요약 || '정보 없음'}</div>
        </div>

        <div class="report-section" style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 25px; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="margin-bottom: 15px; color: #2563eb; border-bottom: none;">상담 내용 정리</h4>
            <div style="font-size: 1.0em; line-height: 1.8; white-space: pre-wrap; color: #1e3a8a; text-align: justify; word-break: keep-all;">${report.상담내용정리 || '정보 없음'}</div>
        </div>

        <div class="report-section">
            <h4>■ 2. 신고자/내담자 정보</h4>
            <div class="report-field">
                <div class="report-field-label">신고자명</div>
                <div class="report-field-value">${report.신고자정보?.신고자명 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">피해노인과의 관계</div>
                <div class="report-field-value">${report.신고자정보?.관계 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${report.신고자정보?.연락처 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">신고 경위</div>
                <div class="report-field-value">${report.신고자정보?.신고경위 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 3. 피해노인(클라이언트) 정보</h4>
            <h5>▶ 인적사항</h5>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${report.피해노인정보?.성명 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">성별</div>
                <div class="report-field-value">${report.피해노인정보?.성별 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">생년월일</div>
                <div class="report-field-value">${report.피해노인정보?.생년월일 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연령</div>
                <div class="report-field-value">${report.피해노인정보?.연령 || '미입력'}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${report.피해노인정보?.연락처 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">주소</div>
                <div class="report-field-value">${report.피해노인정보?.주소 || '미입력'}</div>
            </div>
            
            <h5>▶ 건강상태</h5>
            <div class="report-field">
                <div class="report-field-label">신체적 건강</div>
                <div class="report-field-value">${report.피해노인정보?.건강상태?.신체 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">정신적 건강</div>
                <div class="report-field-value">${report.피해노인정보?.건강상태?.정신 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">복용 약물</div>
                <div class="report-field-value">${report.피해노인정보?.건강상태?.복용약물 || '없음'}</div>
            </div>
            
            <h5>▶ 경제상태</h5>
            <div class="report-field">
                <div class="report-field-label">경제 상황</div>
                <div class="report-field-value">${report.피해노인정보?.경제상태 || '미입력'}</div>
            </div>
            
            <h5>▶ 가족관계</h5>
            <div class="report-field">
                <div class="report-field-label">가족 구성 및 관계</div>
                <div class="report-field-value">${report.피해노인정보?.가족관계 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">주 돌봄 제공자</div>
                <div class="report-field-value">${report.피해노인정보?.주돌봄제공자 || '없음'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 4. 행위자(학대의심자) 정보</h4>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${report.행위자정보?.성명 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">피해노인과의 관계</div>
                <div class="report-field-value">${report.행위자정보?.관계 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">성별</div>
                <div class="report-field-value">${report.행위자정보?.성별 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연령</div>
                <div class="report-field-value">${report.행위자정보?.연령 || '미입력'}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${report.행위자정보?.연락처 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">특성</div>
                <div class="report-field-value">${report.행위자정보?.특성 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 5. 학대 의심 내용</h4>
            <div class="report-field">
                <div class="report-field-label">학대 유형</div>
                <div class="report-field-value">${report.학대내용?.학대유형 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">발생 시기</div>
                <div class="report-field-value">${report.학대내용?.발생시기 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">발생 장소</div>
                <div class="report-field-value">${report.학대내용?.발생장소 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">구체적 행위 (5W1H)</div>
                <div class="report-field-value">${report.학대내용?.구체적행위 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">심각성 정도</div>
                <div class="report-field-value">${report.학대내용?.심각성 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">학대 증거</div>
                <div class="report-field-value">${report.학대내용?.증거 || '없음'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 6. 피해노인의 현재 상태</h4>
            <div class="report-field">
                <div class="report-field-label">신체 상태</div>
                <div class="report-field-value">${report.현재상태?.신체상태 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">정서 상태</div>
                <div class="report-field-value">${report.현재상태?.정서상태 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">생활 환경</div>
                <div class="report-field-value">${report.현재상태?.생활환경 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">위험도</div>
                <div class="report-field-value">${report.현재상태?.위험도 || '미입력'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 7. 현장조사 내용</h4>
            <div class="report-field">
                <div class="report-field-label">실시 여부</div>
                <div class="report-field-value">${report.현장조사?.실시여부 ? '실시함' : '실시 안 함'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">방문 일시</div>
                <div class="report-field-value">${report.현장조사?.방문일시 || '해당없음'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">관찰 내용</div>
                <div class="report-field-value">${report.현장조사?.관찰내용 || '해당없음'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">면담 내용</div>
                <div class="report-field-value">${report.현장조사?.면담내용 || '해당없음'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 8. 즉시 조치사항</h4>
            <div class="report-field">
                <div class="report-field-label">응급 조치</div>
                <div class="report-field-value">${report.즉시조치?.응급조치 || '없음'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">분리 보호</div>
                <div class="report-field-value">${report.즉시조치?.분리보호 || '없음'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">의료 연계</div>
                <div class="report-field-value">${report.즉시조치?.의료연계 || '없음'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">기타 조치</div>
                <div class="report-field-value">${report.즉시조치?.기타조치 || '없음'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 9. 향후 계획</h4>
            <div class="report-field">
                <div class="report-field-label">단기 계획</div>
                <div class="report-field-value">${report.향후계획?.단기계획 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">장기 계획</div>
                <div class="report-field-value">${report.향후계획?.장기계획 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">모니터링 계획</div>
                <div class="report-field-value">${report.향후계획?.모니터링 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연계 기관</div>
                <div class="report-field-value">${report.향후계획?.연계기관 || '없음'}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 10. 상담원 의견 및 특이사항</h4>
            <div class="report-field">
                <div class="report-field-label">상담원 종합 의견</div>
                <div class="report-field-value">${report.상담원의견 || '미입력'}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">특이사항</div>
                <div class="report-field-value">${report.특이사항 || '없음'}</div>
            </div>
        </div>
    `;

    reportContent.innerHTML = html;
    resultContainer.style.display = 'block';
    resultContainer.classList.add('fade-in');

    // 결과로 스크롤
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 수정 모드 상태
let isEditMode = false;

// 수정 버튼
editBtn.addEventListener('click', function() {
    if (!isEditMode) {
        // 수정 모드 진입
        enterEditMode();
    } else {
        // 수정 완료
        exitEditMode();
    }
});

// 수정 모드 진입
function enterEditMode() {
    isEditMode = true;
    editBtn.textContent = '수정 완료';
    editBtn.classList.remove('btn-secondary');
    editBtn.classList.add('btn-primary');
    downloadBtn.textContent = '취소';
    downloadBtn.classList.remove('btn-primary');
    downloadBtn.classList.add('btn-secondary');
    
    // 모든 value 필드를 편집 가능하게 만들기
    const valueFields = reportContent.querySelectorAll('.report-field-value');
    valueFields.forEach(field => {
        const currentText = field.textContent;
        field.contentEditable = true;
        field.style.border = '1px solid var(--primary-color)';
        field.style.padding = '0.5rem';
        field.style.borderRadius = '4px';
        field.style.background = '#f0f7ff';
        field.style.cursor = 'text';
    });
    
    // 상담요약과 상담내용정리도 편집 가능하게
    const summarySection = document.querySelector('.report-section[style*="fffbea"] > div');
    const contentSection = document.querySelector('.report-section[style*="f0f9ff"] > div');
    
    if (summarySection) {
        summarySection.contentEditable = true;
        summarySection.style.border = '1px solid #fbbf24';
        summarySection.style.padding = '1rem';
        summarySection.style.borderRadius = '4px';
        summarySection.style.cursor = 'text';
    }
    
    if (contentSection) {
        contentSection.contentEditable = true;
        contentSection.style.border = '1px solid #3b82f6';
        contentSection.style.padding = '1rem';
        contentSection.style.borderRadius = '4px';
        contentSection.style.cursor = 'text';
    }
}

// 수정 모드 종료
function exitEditMode() {
    isEditMode = false;
    editBtn.textContent = '수정';
    editBtn.classList.remove('btn-primary');
    editBtn.classList.add('btn-secondary');
    downloadBtn.textContent = '다운로드';
    downloadBtn.classList.remove('btn-secondary');
    downloadBtn.classList.add('btn-primary');
    
    // 편집된 내용을 currentReport에 저장
    updateReportFromDOM();
    
    // 편집 모드 해제
    const valueFields = reportContent.querySelectorAll('.report-field-value');
    valueFields.forEach(field => {
        field.contentEditable = false;
        field.style.border = 'none';
        field.style.background = 'transparent';
        field.style.cursor = 'default';
    });
    
    const summarySection = document.querySelector('.report-section[style*="fffbea"] > div');
    const contentSection = document.querySelector('.report-section[style*="f0f9ff"] > div');
    
    if (summarySection) {
        summarySection.contentEditable = false;
        summarySection.style.border = 'none';
        summarySection.style.cursor = 'default';
    }
    
    if (contentSection) {
        contentSection.contentEditable = false;
        contentSection.style.border = 'none';
        contentSection.style.cursor = 'default';
    }
    
    alert('수정 내용이 저장되었습니다. 다운로드 버튼을 눌러 워드 파일로 다운로드하세요.');
}

// DOM에서 편집된 내용을 currentReport에 업데이트
function updateReportFromDOM() {
    // 상담요약 업데이트
    const summarySection = document.querySelector('.report-section[style*="fffbea"] > div');
    if (summarySection) {
        currentReport.상담요약 = summarySection.innerText.trim();
    }
    
    // 상담내용정리 업데이트
    const contentSection = document.querySelector('.report-section[style*="f0f9ff"] > div');
    if (contentSection) {
        currentReport.상담내용정리 = contentSection.innerText.trim();
    }
    
    // 각 필드 업데이트 (간단한 매핑)
    const fields = reportContent.querySelectorAll('.report-field');
    fields.forEach(field => {
        const label = field.querySelector('.report-field-label')?.textContent.trim();
        const value = field.querySelector('.report-field-value')?.innerText.trim();
        
        if (label && value) {
            updateReportField(label, value);
        }
    });
}

// 필드 라벨에 따라 currentReport 업데이트
function updateReportField(label, value) {
    // 기본정보
    if (label === '상담원') currentReport.기본정보.상담원 = value;
    
    // 신고자정보
    if (label === '신고자명') currentReport.신고자정보.신고자명 = value;
    if (label === '피해노인과의 관계') currentReport.신고자정보.관계 = value;
    if (label === '연락처' && !currentReport.피해노인정보) currentReport.신고자정보.연락처 = value;
    if (label === '신고 경위') currentReport.신고자정보.신고경위 = value;
    
    // 피해노인정보
    if (label === '성명') currentReport.피해노인정보.성명 = value;
    if (label === '성별') currentReport.피해노인정보.성별 = value;
    if (label === '생년월일') currentReport.피해노인정보.생년월일 = value;
    if (label === '연령') currentReport.피해노인정보.연령 = value.replace('세', '');
    if (label === '주소') currentReport.피해노인정보.주소 = value;
    
    // 행위자정보
    if (label === '특성') currentReport.행위자정보.특성 = value;
    
    // 학대내용
    if (label === '학대 유형') currentReport.학대내용.학대유형 = value;
    if (label === '발생 시기') currentReport.학대내용.발생시기 = value;
    if (label === '발생 장소') currentReport.학대내용.발생장소 = value;
    if (label === '구체적 행위 (5W1H)') currentReport.학대내용.구체적행위 = value;
    if (label === '심각성 정도') currentReport.학대내용.심각성 = value;
    if (label === '학대 증거') currentReport.학대내용.증거 = value;
    
    // 현재상태
    if (label === '신체 상태') currentReport.현재상태.신체상태 = value;
    if (label === '정서 상태') currentReport.현재상태.정서상태 = value;
    if (label === '생활 환경') currentReport.현재상태.생활환경 = value;
    if (label === '위험도') currentReport.현재상태.위험도 = value;
    
    // 향후계획
    if (label === '단기 계획') currentReport.향후계획.단기계획 = value;
    if (label === '장기 계획') currentReport.향후계획.장기계획 = value;
    if (label === '모니터링 계획') currentReport.향후계획.모니터링 = value;
    if (label === '연계 기관') currentReport.향후계획.연계기관 = value;
    
    // 상담원의견 및 특이사항
    if (label === '상담원 종합 의견') currentReport.상담원의견 = value;
    if (label === '특이사항') currentReport.특이사항 = value;
}

// 다운로드 버튼 - TXT 파일로 다운로드
downloadBtn.addEventListener('click', function() {
    // 편집 모드일 때는 취소
    if (isEditMode) {
        // 편집 취소 - 원래 데이터로 다시 표시
        if (confirm('수정 내용을 취소하시겠습니까?')) {
            exitEditMode();
            displayReport(currentReport); // 원래 데이터로 다시 표시
        }
        return;
    }
    
    if (!currentReport) {
        alert('다운로드할 상담일지가 없습니다.');
        return;
    }

    try {
        // TXT 형식으로 변환
        const txtContent = convertReportToTxt(currentReport);
        
        // Blob 생성 (UTF-8 with BOM for Windows compatibility)
        const blob = new Blob(['\ufeff' + txtContent], { type: 'text/plain;charset=utf-8' });
        
        // 다운로드 링크 생성
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `상담일지_${currentReport.기본정보.접수번호}_${currentReport.기본정보.상담일자}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('✅ TXT 파일 다운로드 완료');
        
    } catch (error) {
        console.error('다운로드 오류:', error);
        alert('TXT 파일 다운로드 중 오류가 발생했습니다: ' + error.message);
    }
});

// 상담일지를 TXT 형식으로 변환하는 함수
function convertReportToTxt(report) {
    const consultationTypeText = {
        'phone': '전화상담',
        'visit': '방문상담',
        'office': '내방상담'
    };
    
    let txt = '';
    
    // 헤더
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    txt += '노인보호전문기관 상담일지\n';
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 1. 기본정보
    txt += '■ 1. 기본정보\n\n';
    txt += `상담일자: ${report.기본정보.상담일자}\n`;
    txt += `상담유형: ${consultationTypeText[report.기본정보.상담유형] || report.기본정보.상담유형}\n`;
    txt += `접수번호: ${report.기본정보.접수번호}\n`;
    txt += `상담원: ${report.기본정보.상담원 || '미입력'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 2. 상담 요약
    txt += '■ 2. 상담 요약\n\n';
    txt += `${report.상담요약 || '정보 없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 3. 상담 내용 정리
    txt += '■ 3. 상담 내용 정리 (시간순 서술)\n\n';
    txt += `${report.상담내용정리 || '정보 없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 4. 신고자/내담자 정보
    txt += '■ 4. 신고자/내담자 정보\n\n';
    txt += `신고자명: ${report.신고자정보?.신고자명 || '미입력'}\n`;
    txt += `관계: ${report.신고자정보?.관계 || '미입력'}\n`;
    txt += `연락처: ${report.신고자정보?.연락처 || '미입력'}\n`;
    txt += `신고 경위: ${report.신고자정보?.신고경위 || '미입력'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 5. 피해노인(클라이언트) 정보
    txt += '■ 5. 피해노인(클라이언트) 정보\n\n';
    txt += '▶ 인적사항\n';
    txt += `성명: ${report.피해노인정보?.성명 || '미입력'}\n`;
    txt += `성별: ${report.피해노인정보?.성별 || '미입력'}\n`;
    txt += `생년월일: ${report.피해노인정보?.생년월일 || '미입력'}\n`;
    txt += `연령: ${report.피해노인정보?.연령 || '미입력'}세\n`;
    txt += `연락처: ${report.피해노인정보?.연락처 || '미입력'}\n`;
    txt += `주소: ${report.피해노인정보?.주소 || '미입력'}\n\n`;
    
    txt += '▶ 건강상태\n';
    txt += `신체적 건강: ${report.피해노인정보?.건강상태?.신체 || '미입력'}\n`;
    txt += `정신적 건강: ${report.피해노인정보?.건강상태?.정신 || '미입력'}\n`;
    txt += `복용 약물: ${report.피해노인정보?.건강상태?.복용약물 || '없음'}\n\n`;
    
    txt += '▶ 경제상태\n';
    txt += `${report.피해노인정보?.경제상태 || '미입력'}\n\n`;
    
    txt += '▶ 가족관계\n';
    txt += `${report.피해노인정보?.가족관계 || '미입력'}\n`;
    txt += `주 돌봄 제공자: ${report.피해노인정보?.주돌봄제공자 || '없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 6. 행위자(학대의심자) 정보
    txt += '■ 6. 행위자(학대의심자) 정보\n\n';
    txt += `성명: ${report.행위자정보?.성명 || '미입력'}\n`;
    txt += `관계: ${report.행위자정보?.관계 || '미입력'}\n`;
    txt += `성별: ${report.행위자정보?.성별 || '미입력'}\n`;
    txt += `연령: ${report.행위자정보?.연령 || '미입력'}세\n`;
    txt += `연락처: ${report.행위자정보?.연락처 || '미입력'}\n`;
    txt += `특성: ${report.행위자정보?.특성 || '미입력'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 7. 학대 의심 내용
    txt += '■ 7. 학대 의심 내용\n\n';
    txt += `학대 유형: ${report.학대내용?.학대유형 || '미입력'}\n`;
    txt += `발생 시기: ${report.학대내용?.발생시기 || '미입력'}\n`;
    txt += `발생 장소: ${report.학대내용?.발생장소 || '미입력'}\n`;
    txt += `구체적 행위: ${report.학대내용?.구체적행위 || '미입력'}\n`;
    txt += `심각성: ${report.학대내용?.심각성 || '미입력'}\n`;
    txt += `증거: ${report.학대내용?.증거 || '없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 8. 피해노인의 현재 상태
    txt += '■ 8. 피해노인의 현재 상태\n\n';
    txt += `신체 상태: ${report.현재상태?.신체상태 || '미입력'}\n`;
    txt += `정서 상태: ${report.현재상태?.정서상태 || '미입력'}\n`;
    txt += `생활 환경: ${report.현재상태?.생활환경 || '미입력'}\n`;
    txt += `위험도: ${report.현재상태?.위험도 || '미입력'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 9. 현장조사 내용
    txt += '■ 9. 현장조사 내용\n\n';
    txt += `실시 여부: ${report.현장조사?.실시여부 ? '실시함' : '실시 안 함'}\n`;
    txt += `방문 일시: ${report.현장조사?.방문일시 || '해당없음'}\n`;
    txt += `관찰 내용: ${report.현장조사?.관찰내용 || '해당없음'}\n`;
    txt += `면담 내용: ${report.현장조사?.면담내용 || '해당없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 10. 즉시 조치사항
    txt += '■ 10. 즉시 조치사항\n\n';
    txt += `응급 조치: ${report.즉시조치?.응급조치 || '없음'}\n`;
    txt += `분리 보호: ${report.즉시조치?.분리보호 || '없음'}\n`;
    txt += `의료 연계: ${report.즉시조치?.의료연계 || '없음'}\n`;
    txt += `기타 조치: ${report.즉시조치?.기타조치 || '없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 11. 향후 계획
    txt += '■ 11. 향후 계획\n\n';
    txt += `단기 계획: ${report.향후계획?.단기계획 || '미입력'}\n`;
    txt += `장기 계획: ${report.향후계획?.장기계획 || '미입력'}\n`;
    txt += `모니터링: ${report.향후계획?.모니터링 || '미입력'}\n`;
    txt += `연계 기관: ${report.향후계획?.연계기관 || '없음'}\n\n`;
    
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // 12. 상담원 의견 및 특이사항
    txt += '■ 12. 상담원 의견 및 특이사항\n\n';
    txt += `상담원 종합 의견: ${report.상담원의견 || '미입력'}\n`;
    txt += `특이사항: ${report.특이사항 || '없음'}\n\n`;
    
    // 푸터
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    txt += `생성일시: ${new Date().toLocaleString('ko-KR')}\n`;
    txt += '시스템: CaseNetAI by WellPartners\n';
    txt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    
    return txt;
}

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
