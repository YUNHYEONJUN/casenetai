// XSS 방지 헬퍼 (security-utils.js의 escapeHtml 단축)
const e = (val) => typeof val === 'string' ? escapeHtml(val) : (val ?? '');

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
const pdfBtn = document.getElementById('pdfBtn');

let selectedFile = null;
let currentReport = null;
let costEstimate = null;

// --- #10 브라우저 녹음 ---
let browserMediaRecorder = null;
let browserAudioChunks = [];
let recTimerInterval = null;
let recStartTime = null;

const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recTimer = document.getElementById('recTimer');
const recStatus = document.getElementById('recStatus');

if (startRecordingBtn) {
    startRecordingBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            browserAudioChunks = [];
            browserMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            browserMediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) browserAudioChunks.push(ev.data); };
            browserMediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(browserAudioChunks, { type: 'audio/webm' });
                const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
                selectedFile = file;
                fileNameDisplay.textContent = `녹음 완료: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
                fileNameDisplay.style.color = 'var(--success-color)';
                fileNameDisplay.style.fontWeight = '600';
                recStatus.textContent = '녹음이 완료되었습니다. 상담일지 생성 버튼을 눌러주세요.';
                recStatus.style.color = '#16a34a';
                checkFormValid();
            };
            browserMediaRecorder.start(1000);
            startRecordingBtn.style.display = 'none';
            stopRecordingBtn.style.display = 'inline-block';
            recTimer.style.display = 'inline';
            recStatus.textContent = '녹음 중...';
            recStatus.style.color = '#ef4444';
            recStartTime = Date.now();
            recTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
                const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const sec = String(elapsed % 60).padStart(2, '0');
                recTimer.textContent = `${min}:${sec}`;
            }, 1000);
        } catch (err) {
            alert('마이크 접근이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
            console.error('Microphone error:', err);
        }
    });
}

if (stopRecordingBtn) {
    stopRecordingBtn.addEventListener('click', () => {
        if (browserMediaRecorder && browserMediaRecorder.state === 'recording') {
            browserMediaRecorder.stop();
        }
        clearInterval(recTimerInterval);
        startRecordingBtn.style.display = 'inline-block';
        stopRecordingBtn.style.display = 'none';
    });
}

// --- Auto-save / Draft ---
const DRAFT_KEY = 'casenetai_draft';

function saveDraft() {
    if (!currentReport) return;
    try {
        const draft = {
            report: currentReport,
            consultationType: consultationTypeSelect.value || '',
            consultationStage: consultationStageSelect.value || '',
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        showDraftBanner('auto-saved');
    } catch (err) {
        console.warn('Draft save failed:', err);
    }
}

function loadDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        console.warn('Draft load failed:', err);
        return null;
    }
}

function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    hideDraftBanner();
}

function showDraftBanner(mode) {
    let banner = document.getElementById('draftBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'draftBanner';
        banner.style.cssText = 'padding:10px 16px;border-radius:6px;font-size:0.9em;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
        resultContainer.parentNode.insertBefore(banner, resultContainer);
    }
    if (mode === 'auto-saved') {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        banner.style.background = '#ecfdf5';
        banner.style.border = '1px solid #6ee7b7';
        banner.style.color = '#065f46';
        banner.innerHTML = '<span>임시 저장됨 (' + e(timeStr) + ')</span>'
            + '<button id="clearDraftBtn" style="background:none;border:1px solid #065f46;color:#065f46;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.85em;">임시 저장 삭제</button>';
        document.getElementById('clearDraftBtn').addEventListener('click', function() {
            if (confirm('임시 저장된 상담일지를 삭제하시겠습니까?')) {
                clearDraft();
            }
        });
    } else if (mode === 'restore-prompt') {
        banner.style.background = '#fffbeb';
        banner.style.border = '1px solid #fbbf24';
        banner.style.color = '#78350f';
        banner.innerHTML = '<span>이전에 작성 중이던 상담일지가 있습니다.</span>'
            + '<span>'
            + '<button id="restoreDraftBtn" style="background:#f59e0b;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.85em;margin-right:6px;">불러오기</button>'
            + '<button id="discardDraftBtn" style="background:none;border:1px solid #78350f;color:#78350f;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.85em;">삭제</button>'
            + '</span>';
        document.getElementById('restoreDraftBtn').addEventListener('click', function() {
            const draft = loadDraft();
            if (draft && draft.report) {
                currentReport = draft.report;
                if (draft.consultationType) consultationTypeSelect.value = draft.consultationType;
                if (draft.consultationStage) consultationStageSelect.value = draft.consultationStage;
                displayReport(currentReport);
            }
        });
        document.getElementById('discardDraftBtn').addEventListener('click', function() {
            clearDraft();
        });
    }
    banner.style.display = 'flex';
}

function hideDraftBanner() {
    const banner = document.getElementById('draftBanner');
    if (banner) banner.style.display = 'none';
}

// 파일 선택 이벤트
audioFileInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        fileNameDisplay.textContent = `선택된 파일: ${file.name} (${formatFileSize(file.size)})`;
        fileNameDisplay.style.color = 'var(--success-color)';
        fileNameDisplay.style.fontWeight = '600';
        
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

// 비용 분석 함수 (클라이언트에서 파일 크기 기반 추정)
function analyzeCost(file) {
    const costInfoContainer = document.getElementById('costInfoContainer');
    const analyzingBadge = document.getElementById('analyzingBadge');
    const fileSize = document.getElementById('fileSize');
    const audioDuration = document.getElementById('audioDuration');
    const sttCost = document.getElementById('sttCost');
    const totalCost = document.getElementById('totalCost');

    // 비용 컨테이너 표시
    costInfoContainer.style.display = 'block';
    costInfoContainer.classList.add('show');

    // 파일 크기 즉시 표시
    fileSize.textContent = formatFileSize(file.size);

    // 파일 크기 기반 추정 (서버에 업로드하지 않음 - Vercel 4.5MB 제한)
    const fileSizeMB = file.size / (1024 * 1024);
    // MP3: ~1MB/분, WAV: ~10MB/분, M4A: ~0.5MB/분
    const ext = file.name.split('.').pop().toLowerCase();
    const mbPerMinute = { wav: 10, mp3: 1, m4a: 0.5, ogg: 0.7, webm: 0.8, mp4: 1 };
    const rate = mbPerMinute[ext] || 1;
    const estimatedMinutes = Math.max(1, Math.ceil(fileSizeMB / rate));
    const estimatedCost = Math.ceil(estimatedMinutes * 0.006 * 1320); // Whisper 기준

    costEstimate = {
        duration: {
            minutes: estimatedMinutes,
            formatted: `약 ${estimatedMinutes}분 (추정)`
        },
        costEstimate: {
            stt: { whisper: { costKRW: estimatedCost } },
            total: { best: estimatedCost, worst: estimatedCost + 12 }
        }
    };

    audioDuration.textContent = costEstimate.duration.formatted;
    sttCost.textContent = `약 ${estimatedCost}원 (추정)`;
    totalCost.textContent = `${estimatedCost}~${estimatedCost + 12}원 (추정)`;

}

// 대용량 파일 청크 업로드 (Vercel 4.5MB 제한 우회)
async function uploadLargeFile(file, onProgress) {
    const authToken = localStorage.getItem('token');
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB per chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Date.now() + '-' + Math.random().toString(36).slice(2);

    if (onProgress) onProgress(5, '파일 분할 업로드 시작...');

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(i));
        formData.append('totalChunks', String(totalChunks));
        formData.append('fileName', file.name);

        const res = await fetch('/api/upload-chunk', {
            method: 'POST',
            headers: {
                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
            },
            body: formData
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '파일 청크 업로드 실패');
        }

        const pct = 5 + Math.round(((i + 1) / totalChunks) * 75);
        if (onProgress) onProgress(pct, `파일 업로드 중... (${i + 1}/${totalChunks})`);
    }

    // 청크 조립 완료 - 서버에서 파일 경로 반환
    const completeRes = await fetch('/api/upload-chunk-complete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ uploadId, fileName: file.name })
    });

    if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        throw new Error(err.error || '파일 조립 실패');
    }

    const result = await completeRes.json();
    if (onProgress) onProgress(85, '서버 처리 시작...');
    return result.filePath;
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

        // 진행 상황 업데이트
        progressBar.style.width = '5%';
        progressText.textContent = '파일 업로드 준비 중...';

        const DIRECT_UPLOAD_LIMIT = 3.5 * 1024 * 1024; // 3.5MB (Vercel 4.5MB 한도 여유분)
        const token = localStorage.getItem('token');
        let serverFilePath = null;

        // Step 1: 파일 업로드 (소형: 직접 / 대형: 청크 분할)
        if (selectedFile.size > DIRECT_UPLOAD_LIMIT) {
            // 대용량: 청크 분할 업로드
            serverFilePath = await uploadLargeFile(selectedFile, (pct, msg) => {
                progressBar.style.width = pct + '%';
                progressText.textContent = msg;
            });
        }

        // Step 2: SSE 스트리밍으로 서버에 처리 요청
        progressBar.style.width = '20%';
        progressText.textContent = 'AI 처리 시작...';

        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload-audio-stream');
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            let sseBuffer = '';
            let finalResult = null;

            xhr.onreadystatechange = () => {
                if (xhr.readyState >= 3 && xhr.responseText) {
                    const newData = xhr.responseText.substring(sseBuffer.length);
                    sseBuffer = xhr.responseText;

                    // SSE 이벤트 파싱
                    const lines = newData.split('\n');
                    let currentEvent = null;
                    let currentData = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.substring(7);
                        } else if (line.startsWith('data: ')) {
                            currentData = line.substring(6);
                            if (currentEvent && currentData) {
                                try {
                                    const parsed = JSON.parse(currentData);
                                    if (currentEvent === 'progress') {
                                        progressBar.style.width = parsed.percent + '%';
                                        progressText.textContent = parsed.message;
                                    } else if (currentEvent === 'complete') {
                                        finalResult = parsed;
                                    } else if (currentEvent === 'error') {
                                        reject(new Error(parsed.message));
                                    }
                                } catch (parseErr) {
                                    console.warn('SSE parse error:', parseErr);
                                }
                                currentEvent = null;
                                currentData = '';
                            }
                        }
                    }
                }

                if (xhr.readyState === 4) {
                    if (finalResult) {
                        resolve(finalResult);
                    } else {
                        reject(new Error('서버 응답이 완료되지 않았습니다.'));
                    }
                }
            };

            xhr.onerror = () => reject(new Error('네트워크 오류가 발생했습니다.'));

            if (serverFilePath) {
                // 대용량: 이미 서버에 파일 있음, JSON으로 경로 전달
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({
                    serverFilePath: serverFilePath,
                    consultationType: consultationTypeSelect.value,
                    consultationStage: consultationStageSelect.value,
                    sttEngine: 'clova'
                }));
            } else {
                // 소형: FormData로 파일 직접 전송 (Blob 불필요)
                const formData = new FormData();
                formData.append('audioFile', selectedFile);
                formData.append('consultationType', consultationTypeSelect.value);
                formData.append('consultationStage', consultationStageSelect.value);
                formData.append('sttEngine', 'clova');
                xhr.send(formData);
            }
        });


        // 서버 응답 확인
        if (!result.success) {
            throw new Error(result.error || result.message || '알 수 없는 오류가 발생했습니다.');
        }

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
                처리시간: result.processingTime,
                오디오길이: result.actualCost.duration.formatted,
                STT비용: `${result.actualCost.sttCost}원`,
                AI비용: `${result.actualCost.aiCost}원`,
                총비용: `${result.actualCost.totalCost}원`,
                엔진: result.actualCost.engine
            });

            const costInfoContainer = document.getElementById('costInfoContainer');
            const totalCost = document.getElementById('totalCost');
            const sttCost = document.getElementById('sttCost');

            if (costInfoContainer && costInfoContainer.style.display !== 'none') {
                if (totalCost) totalCost.innerHTML = `${e(String(result.actualCost.totalCost))}원 <span style="font-size: 0.8em; opacity: 0.8;">(실제)</span>`;
                if (sttCost) sttCost.innerHTML = `${e(String(result.actualCost.sttCost))}원 <span style="font-size: 0.8em; opacity: 0.8;">(${e(result.actualCost.engine)})</span>`;
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

        uploadBtn.disabled = false;
        uploadBtn.textContent = '상담일지 생성하기';

    } catch (error) {

        console.error('Error:', error);

        let errorMessage = error.message;
        if (error.message === 'Failed to fetch' || error.message.includes('network')) {
            errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.';
        }

        alert('처리 중 오류가 발생했습니다: ' + errorMessage);
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

    let html = `
        <div class="report-section">
            <h4>■ 1. 기본정보</h4>
            <div class="report-field">
                <div class="report-field-label">상담일자</div>
                <div class="report-field-value">${e(report.기본정보?.상담일자 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">상담유형</div>
                <div class="report-field-value">${e(consultationTypeText[report.기본정보?.상담유형] || report.기본정보?.상담유형 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">접수번호</div>
                <div class="report-field-value">${e(report.기본정보?.접수번호 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">상담원</div>
                <div class="report-field-value">${e(report.기본정보?.상담원 || '미입력')}</div>
            </div>
        </div>

        <div class="report-section" style="background: #fffbea; border-left: 4px solid #fbbf24; padding: 25px; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="margin-bottom: 15px; color: #d97706; border-bottom: none;">상담 요약</h4>
            <div style="font-size: 1.05em; line-height: 1.8; white-space: pre-wrap; color: #78350f; text-align: justify; word-break: keep-all;">${e(report.상담요약 || '정보 없음')}</div>
        </div>

        <div class="report-section" style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 25px; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="margin-bottom: 15px; color: #2563eb; border-bottom: none;">상담 내용 정리</h4>
            <div style="font-size: 1.0em; line-height: 1.8; white-space: pre-wrap; color: #1e3a8a; text-align: justify; word-break: keep-all;">${e(report.상담내용정리 || '정보 없음')}</div>
        </div>

        <div class="report-section">
            <h4>■ 2. 신고자/내담자 정보</h4>
            <div class="report-field">
                <div class="report-field-label">신고자명</div>
                <div class="report-field-value">${e(report.신고자정보?.신고자명 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">피해노인과의 관계</div>
                <div class="report-field-value">${e(report.신고자정보?.관계 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${e(report.신고자정보?.연락처 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">신고 경위</div>
                <div class="report-field-value">${e(report.신고자정보?.신고경위 || '미입력')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 3. 피해노인(클라이언트) 정보</h4>
            <h5>▶ 인적사항</h5>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${e(report.피해노인정보?.성명 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">성별</div>
                <div class="report-field-value">${e(report.피해노인정보?.성별 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">생년월일</div>
                <div class="report-field-value">${e(report.피해노인정보?.생년월일 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연령</div>
                <div class="report-field-value">${e(report.피해노인정보?.연령 || '미입력')}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${e(report.피해노인정보?.연락처 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">주소</div>
                <div class="report-field-value">${e(report.피해노인정보?.주소 || '미입력')}</div>
            </div>

            <h5>▶ 건강상태</h5>
            <div class="report-field">
                <div class="report-field-label">신체적 건강</div>
                <div class="report-field-value">${e(report.피해노인정보?.건강상태?.신체 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">정신적 건강</div>
                <div class="report-field-value">${e(report.피해노인정보?.건강상태?.정신 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">복용 약물</div>
                <div class="report-field-value">${e(report.피해노인정보?.건강상태?.복용약물 || '없음')}</div>
            </div>

            <h5>▶ 경제상태</h5>
            <div class="report-field">
                <div class="report-field-label">경제 상황</div>
                <div class="report-field-value">${e(report.피해노인정보?.경제상태 || '미입력')}</div>
            </div>

            <h5>▶ 가족관계</h5>
            <div class="report-field">
                <div class="report-field-label">가족 구성 및 관계</div>
                <div class="report-field-value">${e(report.피해노인정보?.가족관계 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">주 돌봄 제공자</div>
                <div class="report-field-value">${e(report.피해노인정보?.주돌봄제공자 || '없음')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 4. 행위자(학대의심자) 정보</h4>
            <div class="report-field">
                <div class="report-field-label">성명</div>
                <div class="report-field-value">${e(report.행위자정보?.성명 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">피해노인과의 관계</div>
                <div class="report-field-value">${e(report.행위자정보?.관계 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">성별</div>
                <div class="report-field-value">${e(report.행위자정보?.성별 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연령</div>
                <div class="report-field-value">${e(report.행위자정보?.연령 || '미입력')}세</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연락처</div>
                <div class="report-field-value">${e(report.행위자정보?.연락처 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">특성</div>
                <div class="report-field-value">${e(report.행위자정보?.특성 || '미입력')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 5. 학대 의심 내용</h4>
            <div class="report-field">
                <div class="report-field-label">학대 유형</div>
                <div class="report-field-value">${e(report.학대내용?.학대유형 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">발생 시기</div>
                <div class="report-field-value">${e(report.학대내용?.발생시기 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">발생 장소</div>
                <div class="report-field-value">${e(report.학대내용?.발생장소 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">구체적 행위 (5W1H)</div>
                <div class="report-field-value">${e(report.학대내용?.구체적행위 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">심각성 정도</div>
                <div class="report-field-value">${e(report.학대내용?.심각성 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">학대 증거</div>
                <div class="report-field-value">${e(report.학대내용?.증거 || '없음')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 6. 피해노인의 현재 상태</h4>
            <div class="report-field">
                <div class="report-field-label">신체 상태</div>
                <div class="report-field-value">${e(report.현재상태?.신체상태 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">정서 상태</div>
                <div class="report-field-value">${e(report.현재상태?.정서상태 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">생활 환경</div>
                <div class="report-field-value">${e(report.현재상태?.생활환경 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">위험도</div>
                <div class="report-field-value">${e(report.현재상태?.위험도 || '미입력')}</div>
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
                <div class="report-field-value">${e(report.현장조사?.방문일시 || '해당없음')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">관찰 내용</div>
                <div class="report-field-value">${e(report.현장조사?.관찰내용 || '해당없음')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">면담 내용</div>
                <div class="report-field-value">${e(report.현장조사?.면담내용 || '해당없음')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 8. 즉시 조치사항</h4>
            <div class="report-field">
                <div class="report-field-label">응급 조치</div>
                <div class="report-field-value">${e(report.즉시조치?.응급조치 || '없음')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">분리 보호</div>
                <div class="report-field-value">${e(report.즉시조치?.분리보호 || '없음')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">의료 연계</div>
                <div class="report-field-value">${e(report.즉시조치?.의료연계 || '없음')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">기타 조치</div>
                <div class="report-field-value">${e(report.즉시조치?.기타조치 || '없음')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 9. 향후 계획</h4>
            <div class="report-field">
                <div class="report-field-label">단기 계획</div>
                <div class="report-field-value">${e(report.향후계획?.단기계획 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">장기 계획</div>
                <div class="report-field-value">${e(report.향후계획?.장기계획 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">모니터링 계획</div>
                <div class="report-field-value">${e(report.향후계획?.모니터링 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">연계 기관</div>
                <div class="report-field-value">${e(report.향후계획?.연계기관 || '없음')}</div>
            </div>
        </div>

        <div class="report-section">
            <h4>■ 10. 상담원 의견 및 특이사항</h4>
            <div class="report-field">
                <div class="report-field-label">상담원 종합 의견</div>
                <div class="report-field-value">${e(report.상담원의견 || '미입력')}</div>
            </div>
            <div class="report-field">
                <div class="report-field-label">특이사항</div>
                <div class="report-field-value">${e(report.특이사항 || '없음')}</div>
            </div>
        </div>
    `;

    // 피드백 UI 추가
    html += `
        <div class="report-section" style="background:#f0fdf4;border-left:4px solid #22c55e;padding:20px;border-radius:8px;margin-top:2rem;">
            <h4 style="margin-bottom:12px;color:#166534;">AI 결과 평가</h4>
            <p style="font-size:0.9em;color:#15803d;margin-bottom:12px;">생성된 상담일지의 품질을 평가해주세요.</p>
            <div id="feedbackBtns" style="display:flex;gap:8px;flex-wrap:wrap;">
                <button onclick="submitFeedback(5)" class="btn btn-secondary" style="padding:6px 16px;">매우 좋음</button>
                <button onclick="submitFeedback(4)" class="btn btn-secondary" style="padding:6px 16px;">좋음</button>
                <button onclick="submitFeedback(3)" class="btn btn-secondary" style="padding:6px 16px;">보통</button>
                <button onclick="submitFeedback(2)" class="btn btn-secondary" style="padding:6px 16px;">부족</button>
                <button onclick="submitFeedback(1)" class="btn btn-secondary" style="padding:6px 16px;">매우 부족</button>
            </div>
            <div id="feedbackComment" style="display:none;margin-top:12px;">
                <textarea id="feedbackText" rows="2" placeholder="구체적인 피드백 (선택)" style="width:100%;padding:8px;border:1px solid #86efac;border-radius:6px;font-size:0.9em;resize:vertical;"></textarea>
                <button onclick="sendFeedbackComment()" class="btn btn-primary" style="margin-top:8px;padding:6px 16px;font-size:0.9em;">피드백 전송</button>
            </div>
            <div id="feedbackDone" style="display:none;color:#166534;font-weight:600;">감사합니다! 피드백이 반영됩니다.</div>
        </div>
    `;

    reportContent.innerHTML = html;
    resultContainer.style.display = 'block';
    resultContainer.classList.add('fade-in');

    // 결과로 스크롤
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Auto-save draft
    saveDraft();
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

let reportBackup = null;

// 수정 모드 진입
function enterEditMode() {
    reportBackup = JSON.parse(JSON.stringify(currentReport));
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

    // Auto-save after edit
    saveDraft();

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
    if (!currentReport) return;

    // 안전 접근 헬퍼 (하위 객체가 없으면 생성)
    const ensure = (obj, key) => {
        if (!obj[key]) obj[key] = {};
        return obj[key];
    };

    // 기본정보
    if (label === '상담원') ensure(currentReport, '기본정보').상담원 = value;

    // 신고자정보
    if (label === '신고자명') ensure(currentReport, '신고자정보').신고자명 = value;
    if (label === '피해노인과의 관계') ensure(currentReport, '신고자정보').관계 = value;
    if (label === '신고 경위') ensure(currentReport, '신고자정보').신고경위 = value;

    // 피해노인정보
    if (label === '성명') ensure(currentReport, '피해노인정보').성명 = value;
    if (label === '성별') ensure(currentReport, '피해노인정보').성별 = value;
    if (label === '생년월일') ensure(currentReport, '피해노인정보').생년월일 = value;
    if (label === '연령') ensure(currentReport, '피해노인정보').연령 = value.replace('세', '');
    if (label === '주소') ensure(currentReport, '피해노인정보').주소 = value;
    if (label === '연락처') {
        // 피해노인정보가 이미 있으면 거기에, 아니면 신고자정보에
        if (currentReport.피해노인정보) {
            currentReport.피해노인정보.연락처 = value;
        } else {
            ensure(currentReport, '신고자정보').연락처 = value;
        }
    }

    // 행위자정보
    if (label === '특성') ensure(currentReport, '행위자정보').특성 = value;

    // 학대내용
    if (label === '학대 유형') ensure(currentReport, '학대내용').학대유형 = value;
    if (label === '발생 시기') ensure(currentReport, '학대내용').발생시기 = value;
    if (label === '발생 장소') ensure(currentReport, '학대내용').발생장소 = value;
    if (label === '구체적 행위 (5W1H)') ensure(currentReport, '학대내용').구체적행위 = value;
    if (label === '심각성 정도') ensure(currentReport, '학대내용').심각성 = value;
    if (label === '학대 증거') ensure(currentReport, '학대내용').증거 = value;

    // 현재상태
    if (label === '신체 상태') ensure(currentReport, '현재상태').신체상태 = value;
    if (label === '정서 상태') ensure(currentReport, '현재상태').정서상태 = value;
    if (label === '생활 환경') ensure(currentReport, '현재상태').생활환경 = value;
    if (label === '위험도') ensure(currentReport, '현재상태').위험도 = value;

    // 향후계획
    if (label === '단기 계획') ensure(currentReport, '향후계획').단기계획 = value;
    if (label === '장기 계획') ensure(currentReport, '향후계획').장기계획 = value;
    if (label === '모니터링 계획') ensure(currentReport, '향후계획').모니터링 = value;
    if (label === '연계 기관') ensure(currentReport, '향후계획').연계기관 = value;

    // 상담원의견 및 특이사항
    if (label === '상담원 종합 의견') currentReport.상담원의견 = value;
    if (label === '특이사항') currentReport.특이사항 = value;
}

// 다운로드 버튼 - TXT 파일로 다운로드
downloadBtn.addEventListener('click', function() {
    // 편집 모드일 때는 취소
    if (isEditMode) {
        // 편집 취소 - 백업 데이터로 복원
        if (confirm('수정 내용을 취소하시겠습니까?')) {
            if (reportBackup) {
                currentReport = reportBackup;
                reportBackup = null;
            }
            isEditMode = false;
            editBtn.textContent = '수정';
            editBtn.classList.remove('btn-primary');
            editBtn.classList.add('btn-secondary');
            downloadBtn.textContent = '다운로드';
            downloadBtn.classList.remove('btn-secondary');
            downloadBtn.classList.add('btn-primary');
            displayReport(currentReport);
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
        a.download = `상담일지_${currentReport.기본정보?.접수번호 || '미정'}_${currentReport.기본정보?.상담일자 || new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        
    } catch (error) {
        console.error('다운로드 오류:', error);
        alert('TXT 파일 다운로드 중 오류가 발생했습니다: ' + error.message);
    }
});

// PDF 다운로드 버튼 - window.print() 사용
pdfBtn.addEventListener('click', function() {
    if (!currentReport) {
        alert('먼저 상담일지를 생성해주세요.');
        return;
    }
    window.print();
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
    txt += `상담일자: ${report.기본정보?.상담일자 || '미입력'}\n`;
    txt += `상담유형: ${consultationTypeText[report.기본정보?.상담유형] || report.기본정보?.상담유형 || '미입력'}\n`;
    txt += `접수번호: ${report.기본정보?.접수번호 || '미입력'}\n`;
    txt += `상담원: ${report.기본정보?.상담원 || '미입력'}\n\n`;
    
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

// --- #8 AI 피드백 ---
let currentFeedbackRating = null;

function submitFeedback(rating) {
    currentFeedbackRating = rating;
    document.getElementById('feedbackBtns').querySelectorAll('button').forEach((btn, i) => {
        btn.style.opacity = (5 - i) === rating ? '1' : '0.4';
        btn.style.fontWeight = (5 - i) === rating ? '700' : '400';
    });
    if (rating <= 3) {
        document.getElementById('feedbackComment').style.display = 'block';
    } else {
        sendFeedbackComment();
    }
}

function sendFeedbackComment() {
    const comment = document.getElementById('feedbackText')?.value || '';
    const token = localStorage.getItem('token');
    // 서버로 비동기 전송 (실패해도 무시)
    fetch('/api/feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
            rating: currentFeedbackRating,
            comment: comment,
            reportType: 'consultation',
            timestamp: new Date().toISOString()
        })
    }).catch(() => {});
    // UI 업데이트
    document.getElementById('feedbackBtns').style.display = 'none';
    document.getElementById('feedbackComment').style.display = 'none';
    document.getElementById('feedbackDone').style.display = 'block';
}

// --- #2 템플릿 저장/불러오기 ---
const TEMPLATES_KEY = 'casenetai_templates';

function getTemplates() {
    try {
        return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
    } catch { return []; }
}

function saveAsTemplate() {
    if (!currentReport) { alert('저장할 상담일지가 없습니다.'); return; }
    const name = prompt('템플릿 이름을 입력하세요:', `상담일지_${currentReport.기본정보?.상담일자 || ''}`);
    if (!name) return;
    const templates = getTemplates();
    templates.push({
        id: Date.now(),
        name: name,
        report: currentReport,
        consultationType: consultationTypeSelect.value,
        consultationStage: consultationStageSelect.value,
        savedAt: new Date().toISOString()
    });
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    alert('템플릿이 저장되었습니다.');
    updateTemplateSelect();
}

function loadTemplate(id) {
    const templates = getTemplates();
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;
    currentReport = tmpl.report;
    if (tmpl.consultationType) consultationTypeSelect.value = tmpl.consultationType;
    if (tmpl.consultationStage) consultationStageSelect.value = tmpl.consultationStage;
    displayReport(currentReport);
}

function deleteTemplate(id) {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    const templates = getTemplates().filter(t => t.id !== id);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    updateTemplateSelect();
}

function updateTemplateSelect() {
    const sel = document.getElementById('templateSelect');
    if (!sel) return;
    const templates = getTemplates();
    sel.innerHTML = '<option value="">저장된 템플릿 불러오기</option>';
    templates.forEach(t => {
        const date = new Date(t.savedAt).toLocaleDateString('ko-KR');
        sel.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)} (${date})</option>`;
    });
}

// --- #5 기능 간 데이터 연계 ---
function sendToStatement() {
    if (!currentReport) { alert('상담일지가 없습니다.'); return; }
    sessionStorage.setItem('casenetai_shared_data', JSON.stringify({
        source: 'consultation',
        transcript: currentReport.원본텍스트 || currentReport.상담내용정리 || '',
        report: currentReport
    }));
    window.location.href = '/statement-recording.html?from=consultation';
}

function sendToFactConfirmation() {
    if (!currentReport) { alert('상담일지가 없습니다.'); return; }
    sessionStorage.setItem('casenetai_shared_data', JSON.stringify({
        source: 'consultation',
        transcript: currentReport.원본텍스트 || currentReport.상담내용정리 || '',
        report: currentReport
    }));
    window.location.href = '/fact-confirmation.html?from=consultation';
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
    checkFormValid();

    // Check for saved draft
    const draft = loadDraft();
    if (draft && draft.report) {
        showDraftBanner('restore-prompt');
    }

    // 템플릿 목록 초기화
    updateTemplateSelect();

    // 대시보드에서 템플릿 열기 요청 확인
    const loadId = sessionStorage.getItem('load_template_id');
    if (loadId) {
        sessionStorage.removeItem('load_template_id');
        loadTemplate(Number(loadId));
    }

    // 다른 기능에서 전달된 데이터 확인 (cross-feature)
    const sharedRaw = sessionStorage.getItem('casenetai_shared_data');
    if (sharedRaw) {
        try {
            const shared = JSON.parse(sharedRaw);
            if (shared.source === 'statement' || shared.source === 'fact-confirmation') {
                if (shared.transcript && confirm('다른 기능에서 전달된 텍스트 데이터가 있습니다. 불러오시겠습니까?')) {
                    // transcript를 활용할 수 있도록 세션에 유지
                }
            }
        } catch (err) { /* ignore */ }
        sessionStorage.removeItem('casenetai_shared_data');
    }
});
