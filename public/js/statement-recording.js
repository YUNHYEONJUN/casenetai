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

// DOM 요소
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
const transcriptionText = document.getElementById('transcriptionText');
const generateStatementBtn = document.getElementById('generateStatementBtn');
const loading = document.getElementById('loading');
const statementForm = document.getElementById('statementForm');
const qaContainer = document.getElementById('qaContainer');
const addQaBtn = document.getElementById('addQaBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const alert = document.getElementById('alert');

// 인증 확인
checkAuth();

// 이벤트 리스너
startRecordBtn.addEventListener('click', startRecording);
stopRecordBtn.addEventListener('click', stopRecording);
generateStatementBtn.addEventListener('click', generateStatement);
addQaBtn.addEventListener('click', addNewQaPair);
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
 * PDF 출력
 */
async function exportToPdf() {
    try {
        // jsPDF 라이브러리 로드 확인
        if (typeof jspdf === 'undefined') {
            showAlert('PDF 라이브러리를 로드하는 중입니다...');
            await loadJsPDF();
        }
        
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
        
        // PDF 생성
        generatePDF();
        
        showAlert('PDF가 생성되었습니다!', 'success');
    } catch (error) {
        console.error('PDF 생성 오류:', error);
        showAlert('PDF 생성에 실패했습니다: ' + error.message);
    }
}

/**
 * jsPDF 라이브러리 동적 로드
 */
function loadJsPDF() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * PDF 생성 (간단한 버전 - 나중에 한글 폰트 추가 필요)
 */
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    
    // 제목
    doc.setFontSize(18);
    doc.text('노인학대 조사 진술서', 105, yPos, { align: 'center' });
    yPos += 15;
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`조사일시: ${document.getElementById('investigationDate').value}`, 20, yPos);
    yPos += 8;
    doc.text(`조사장소: ${document.getElementById('investigationLocation').value}`, 20, yPos);
    yPos += 8;
    doc.text(`조사기관: ${document.getElementById('investigationOrg').value}`, 20, yPos);
    yPos += 15;
    
    // 피조사자 정보
    doc.text(`성명: ${document.getElementById('subjectName').value}`, 20, yPos);
    yPos += 8;
    doc.text(`소속: ${document.getElementById('subjectOrg').value}`, 20, yPos);
    yPos += 8;
    doc.text(`직위: ${document.getElementById('subjectPosition').value}`, 20, yPos);
    yPos += 15;
    
    // 진술 내용
    doc.setFontSize(14);
    doc.text('진술 내용', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    qaList.forEach((qa, index) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.text(`Q${index + 1}: ${qa.question}`, 20, yPos);
        yPos += 6;
        doc.text(`A${index + 1}: ${qa.answer}`, 20, yPos);
        yPos += 10;
    });
    
    // 서명란
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }
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
