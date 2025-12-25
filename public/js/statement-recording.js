/**
 * 진술서 작성 시스템
 * 실시간 녹음 → STT → AI 문답 분리 → 진술서 생성
 */

// 전역 변수
let mediaRecorder;
let audioChunks = [];
let recordingStartTime;
let recordingInterval;
let transcribedText = '';
let qaList = [];
let selectedFile = null;
let currentMode = 'recording'; // 'recording' or 'upload'

// DOM 요소
const recordingModeBtn = document.getElementById('recordingModeBtn');
const uploadModeBtn = document.getElementById('uploadModeBtn');
const recordingSection = document.getElementById('recordingSection');
const uploadSection = document.getElementById('uploadSection');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
const audioFileInput = document.getElementById('audioFileInput');
const uploadBox = document.getElementById('uploadBox');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const uploadAndConvertBtn = document.getElementById('uploadAndConvertBtn');
const transcriptionText = document.getElementById('transcriptionText');
const generateStatementBtn = document.getElementById('generateStatementBtn');
const loading = document.getElementById('loading');
const statementForm = document.getElementById('statementForm');
const qaContainer = document.getElementById('qaContainer');
const addQaBtn = document.getElementById('addQaBtn');
const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const alert = document.getElementById('alert');

// 인증 확인
checkAuth();

// 이벤트 리스너 - 모드 전환
recordingModeBtn.addEventListener('click', switchToRecordingMode);
uploadModeBtn.addEventListener('click', switchToUploadMode);

// 이벤트 리스너 - 실시간 녹음
startRecordBtn.addEventListener('click', startRecording);
stopRecordBtn.addEventListener('click', stopRecording);

// 이벤트 리스너 - 파일 업로드
audioFileInput.addEventListener('change', handleFileSelect);
removeFileBtn.addEventListener('click', removeSelectedFile);
uploadAndConvertBtn.addEventListener('click', uploadAndConvert);

// 드래그 앤 드롭
uploadBox.addEventListener('dragover', handleDragOver);
uploadBox.addEventListener('dragleave', handleDragLeave);
uploadBox.addEventListener('drop', handleDrop);
uploadBox.addEventListener('click', () => audioFileInput.click());

// 이벤트 리스너 - 공통
generateStatementBtn.addEventListener('click', generateStatement);
addQaBtn.addEventListener('click', addNewQaPair);
copyToClipboardBtn.addEventListener('click', copyToClipboard);
saveDraftBtn.addEventListener('click', saveDraft);
exportPdfBtn.addEventListener('click', exportToPdf);

/**
 * 인증 확인
 */
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
}

/**
 * 실시간 녹음 모드로 전환
 */
function switchToRecordingMode() {
    currentMode = 'recording';
    recordingModeBtn.classList.add('active');
    uploadModeBtn.classList.remove('active');
    recordingSection.style.display = 'block';
    uploadSection.style.display = 'none';
}

/**
 * 파일 업로드 모드로 전환
 */
function switchToUploadMode() {
    currentMode = 'upload';
    uploadModeBtn.classList.add('active');
    recordingModeBtn.classList.remove('active');
    uploadSection.style.display = 'block';
    recordingSection.style.display = 'none';
}

/**
 * 파일 선택 처리
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processSelectedFile(file);
    }
}

/**
 * 드래그 오버
 */
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadBox.classList.add('drag-over');
}

/**
 * 드래그 떠남
 */
function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadBox.classList.remove('drag-over');
}

/**
 * 드롭 처리
 */
function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    uploadBox.classList.remove('drag-over');
    
    const file = event.dataTransfer.files[0];
    if (file) {
        // 오디오 파일인지 확인
        if (file.type.startsWith('audio/')) {
            processSelectedFile(file);
        } else {
            showAlert('오디오 파일만 업로드 가능합니다.');
        }
    }
}

/**
 * 선택된 파일 처리
 */
function processSelectedFile(file) {
    // 파일 크기 확인 (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
        showAlert('파일 크기는 100MB 이하여야 합니다.');
        return;
    }
    
    selectedFile = file;
    
    // 파일 정보 표시
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    // UI 업데이트
    uploadBox.style.display = 'none';
    selectedFileInfo.style.display = 'flex';
    uploadAndConvertBtn.style.display = 'block';
}

/**
 * 선택된 파일 제거
 */
function removeSelectedFile() {
    selectedFile = null;
    audioFileInput.value = '';
    
    // UI 복원
    uploadBox.style.display = 'block';
    selectedFileInfo.style.display = 'none';
    uploadAndConvertBtn.style.display = 'none';
}

/**
 * 파일 크기 포맷
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 파일 업로드 및 변환
 */
async function uploadAndConvert() {
    if (!selectedFile) {
        showAlert('파일을 선택해주세요.');
        return;
    }
    
    try {
        loading.classList.add('active');
        showAlert('음성 파일을 업로드하고 변환하는 중입니다...', 'success');
        
        // FormData 생성
        const formData = new FormData();
        formData.append('audio', selectedFile);
        
        const token = localStorage.getItem('token');
        
        // STT 변환 API 호출
        const response = await fetch('/api/statement/transcribe', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'STT 변환 실패');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'STT 변환 실패');
        }
        
        // 변환된 텍스트 저장 및 표시
        transcribedText = data.transcript;
        transcriptionText.textContent = transcribedText;
        
        // 진술서 생성 버튼 활성화
        generateStatementBtn.disabled = false;
        
        showAlert('음성이 텍스트로 변환되었습니다! 이제 "AI 진술서 생성" 버튼을 클릭하세요.', 'success');
        
        // 파일 업로드 섹션 숨기기
        uploadSection.style.display = 'none';
        
    } catch (error) {
        console.error('업로드 및 변환 오류:', error);
        showAlert('업로드 및 변환 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loading.classList.remove('active');
    }
}

/**
 * 로그아웃
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * 알림 표시
 */
function showAlert(message, type = 'error') {
    alert.textContent = message;
    alert.className = `alert ${type} active`;
    setTimeout(() => {
        alert.classList.remove('active');
    }, 5000);
}

/**
 * 녹음 시작
 */
async function startRecording() {
    try {
        // 마이크 권한 요청
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // MediaRecorder 설정
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };
        
        // 녹음 시작
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // UI 업데이트
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = false;
        recordingIndicator.classList.add('active');
        transcriptionText.textContent = '녹음 중...';
        
        // 타이머 시작
        recordingInterval = setInterval(updateRecordingTime, 1000);
        
        showAlert('녹음이 시작되었습니다.', 'success');
    } catch (error) {
        console.error('녹음 시작 실패:', error);
        showAlert('마이크 접근 권한이 필요합니다.');
    }
}

/**
 * 녹음 중지
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        // UI 업데이트
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
        recordingIndicator.classList.remove('active');
        
        // 타이머 중지
        clearInterval(recordingInterval);
        
        showAlert('녹음이 완료되었습니다. 변환 중...', 'success');
    }
}

/**
 * 녹음 시간 업데이트
 */
function updateRecordingTime() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    recordingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 음성 → 텍스트 변환 (STT)
 */
async function transcribeAudio(audioBlob) {
    try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('STT 변환 실패');
        }
        
        const data = await response.json();
        transcribedText = data.text;
        
        // 변환된 텍스트 표시
        transcriptionText.textContent = transcribedText;
        generateStatementBtn.style.display = 'block';
        
        showAlert('음성 변환이 완료되었습니다!', 'success');
    } catch (error) {
        console.error('STT 변환 오류:', error);
        showAlert('음성 변환에 실패했습니다: ' + error.message);
        transcriptionText.textContent = '변환 실패. 다시 시도해주세요.';
    }
}

/**
 * 진술서 생성 (AI 문답 분리)
 */
async function generateStatement() {
    try {
        loading.classList.add('active');
        generateStatementBtn.disabled = true;
        
        const token = localStorage.getItem('token');
        
        const response = await fetch('/api/generate-statement', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                transcription: transcribedText
            })
        });
        
        if (!response.ok) {
            throw new Error('진술서 생성 실패');
        }
        
        const data = await response.json();
        qaList = data.qaList || [];
        
        // 기본 정보 설정
        const now = new Date();
        document.getElementById('investigationDate').value = 
            `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분`;
        
        // 문답 표시
        renderQaList();
        
        // 진술서 양식 표시
        statementForm.style.display = 'block';
        statementForm.scrollIntoView({ behavior: 'smooth' });
        
        loading.classList.add('active');
        showAlert('진술서가 생성되었습니다!', 'success');
    } catch (error) {
        console.error('진술서 생성 오류:', error);
        showAlert('진술서 생성에 실패했습니다: ' + error.message);
    } finally {
        loading.classList.remove('active');
        generateStatementBtn.disabled = false;
    }
}

/**
 * 문답 목록 렌더링
 */
function renderQaList() {
    qaContainer.innerHTML = '';
    
    qaList.forEach((qa, index) => {
        const qaDiv = document.createElement('div');
        qaDiv.className = 'qa-pair';
        qaDiv.dataset.index = index;
        
        qaDiv.innerHTML = `
            <div class="qa-label">
                <span>❓</span>
                <strong>문:</strong>
            </div>
            <div class="qa-content" contenteditable="true" data-type="question">${qa.question}</div>
            
            <div class="qa-label" style="margin-top: 15px;">
                <span>💬</span>
                <strong>답:</strong>
            </div>
            <div class="qa-content" contenteditable="true" data-type="answer">${qa.answer}</div>
            
            <div class="qa-actions">
                <button class="qa-btn delete" onclick="deleteQa(${index})">삭제</button>
            </div>
        `;
        
        qaContainer.appendChild(qaDiv);
    });
}

/**
 * 새 문답 추가
 */
function addNewQaPair() {
    qaList.push({
        question: '질문을 입력하세요...',
        answer: '답변을 입력하세요...'
    });
    renderQaList();
}

/**
 * 문답 삭제
 */
function deleteQa(index) {
    if (confirm('이 문답을 삭제하시겠습니까?')) {
        qaList.splice(index, 1);
        renderQaList();
    }
}

/**
 * 클립보드에 복사
 */
async function copyToClipboard() {
    try {
        // 현재 편집된 내용 수집
        const qaElements = document.querySelectorAll('.qa-pair');
        qaElements.forEach((qaEl, index) => {
            const questionEl = qaEl.querySelector('[data-type="question"]');
            const answerEl = qaEl.querySelector('[data-type="answer"]');
            
            if (qaList[index]) {
                qaList[index].question = questionEl.textContent;
                qaList[index].answer = answerEl.textContent;
            }
        });
        
        // 텍스트 생성
        const textContent = generateTextFormat();
        
        // 클립보드에 복사
        await navigator.clipboard.writeText(textContent);
        
        showAlert('클립보드에 복사되었습니다! 원하는 곳에 붙여넣기(Ctrl+V)하세요.', 'success');
    } catch (error) {
        console.error('클립보드 복사 오류:', error);
        
        // 클립보드 API가 작동하지 않을 경우 대체 방법
        try {
            const textContent = generateTextFormat();
            const textarea = document.createElement('textarea');
            textarea.value = textContent;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showAlert('클립보드에 복사되었습니다!', 'success');
        } catch (fallbackError) {
            showAlert('클립보드 복사에 실패했습니다: ' + error.message);
        }
    }
}

/**
 * 임시 저장
 */
async function saveDraft() {
    try {
        // 현재 편집된 내용 수집
        const qaElements = document.querySelectorAll('.qa-pair');
        qaElements.forEach((qaEl, index) => {
            const questionEl = qaEl.querySelector('[data-type="question"]');
            const answerEl = qaEl.querySelector('[data-type="answer"]');
            
            if (qaList[index]) {
                qaList[index].question = questionEl.textContent;
                qaList[index].answer = answerEl.textContent;
            }
        });
        
        const statementData = {
            investigationDate: document.getElementById('investigationDate').value,
            investigationLocation: document.getElementById('investigationLocation').value,
            investigationOrg: document.getElementById('investigationOrg').value,
            investigator: document.getElementById('investigator').value,
            subjectName: document.getElementById('subjectName').value,
            subjectBirth: document.getElementById('subjectBirth').value,
            subjectOrg: document.getElementById('subjectOrg').value,
            subjectPosition: document.getElementById('subjectPosition').value,
            subjectContact: document.getElementById('subjectContact').value,
            qaList: qaList
        };
        
        const token = localStorage.getItem('token');
        
        const response = await fetch('/api/save-statement', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(statementData)
        });
        
        if (!response.ok) {
            throw new Error('저장 실패');
        }
        
        showAlert('진술서가 임시 저장되었습니다.', 'success');
    } catch (error) {
        console.error('저장 오류:', error);
        showAlert('저장에 실패했습니다: ' + error.message);
    }
}

/**
 * 텍스트 파일로 내보내기
 */
async function exportToPdf() {
    try {
        // 현재 편집된 내용 수집
        const qaElements = document.querySelectorAll('.qa-pair');
        qaElements.forEach((qaEl, index) => {
            const questionEl = qaEl.querySelector('[data-type="question"]');
            const answerEl = qaEl.querySelector('[data-type="answer"]');
            
            if (qaList[index]) {
                qaList[index].question = questionEl.textContent;
                qaList[index].answer = answerEl.textContent;
            }
        });
        
        // 텍스트 파일 생성 및 다운로드
        const textContent = generateTextFormat();
        downloadTextFile(textContent);
        
        showAlert('진술서가 텍스트 파일로 저장되었습니다!', 'success');
    } catch (error) {
        console.error('내보내기 오류:', error);
        showAlert('내보내기에 실패했습니다: ' + error.message);
    }
}

/**
 * 텍스트 형식으로 진술서 생성
 */
function generateTextFormat() {
    const investigationDate = document.getElementById('investigationDate').value || '미입력';
    const investigationLocation = document.getElementById('investigationLocation').value || '미입력';
    const investigationOrg = document.getElementById('investigationOrg').value || '미입력';
    const investigator = document.getElementById('investigator').value || '미입력';
    
    const subjectName = document.getElementById('subjectName').value || '미입력';
    const subjectBirth = document.getElementById('subjectBirth').value || '미입력';
    const subjectOrg = document.getElementById('subjectOrg').value || '미입력';
    const subjectPosition = document.getElementById('subjectPosition').value || '미입력';
    const subjectContact = document.getElementById('subjectContact').value || '미입력';
    
    let text = '';
    
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '                노인학대 조사 진술서\n';
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    text += '【 조사 정보 】\n';
    text += `조사일시: ${investigationDate}\n`;
    text += `조사장소: ${investigationLocation}\n`;
    text += `조사기관: ${investigationOrg}\n`;
    text += `조 사 자: ${investigator}\n\n`;
    
    text += '【 피조사자 정보 】\n';
    text += `성    명: ${subjectName}\n`;
    text += `생년월일: ${subjectBirth}\n`;
    text += `소속기관: ${subjectOrg}\n`;
    text += `직    위: ${subjectPosition}\n`;
    text += `연 락 처: ${subjectContact}\n\n`;
    
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '                  진술 내용\n';
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    qaList.forEach((qa, index) => {
        text += `문${index + 1}. ${qa.question}\n`;
        text += `답${index + 1}. ${qa.answer}\n\n`;
    });
    
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    text += '위 내용은 사실과 다름없음을 확인합니다.\n\n';
    text += `작성일자: ${new Date().toLocaleDateString('ko-KR')}\n\n`;
    text += '진술자 성명:                   (서명 또는 인)\n\n';
    text += '조사자 성명:                   (서명 또는 인)\n\n';
    
    return text;
}

/**
 * 텍스트 파일 다운로드
 */
function downloadTextFile(content) {
    const subjectName = document.getElementById('subjectName').value || '진술서';
    const date = new Date().toISOString().split('T')[0];
    const filename = `${subjectName}_진술서_${date}.txt`;
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    yPos += 20;
    doc.text('위 진술이 사실과 다름없음을 확인합니다.', 20, yPos);
    yPos += 15;
    doc.text('진술자: _________________ (서명)', 20, yPos);
    yPos += 10;
    doc.text('조사자: _________________ (서명)', 20, yPos);
    
    // 파일명
    const filename = `진술서_${document.getElementById('subjectName').value || 'unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    doc.save(filename);
}
