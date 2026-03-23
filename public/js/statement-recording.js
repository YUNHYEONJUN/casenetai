// ===== AI 진술서 자동 변환 =====
function checkAuth() {
    if (!document.cookie.includes('is_logged_in=1')) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
    }
    return true;
}

var audioFile = null;
var audioFileName = '';
var currentTranscript = '';
var currentStatementText = '';
var currentDocxBlob = null;
var isProcessing = false;
var consentSignPad = null;
var statementSignPad = null;
var consentSignatureData = null;
var statementSignatureData = null;

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== 오디오 → MP3 변환 (lamejs) =====
function convertToMp3(file) {
    return new Promise(function(resolve, reject) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'mp3' || ext === 'wav') { resolve(file); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(e.target.result).then(function(audioBuffer) {
                var sampleRate = 16000;
                var samples = downsampleBuffer(audioBuffer, sampleRate);
                var mp3enc = new lamejs.Mp3Encoder(1, sampleRate, 64);
                var mp3Data = [];
                var int16 = floatTo16BitPCM(samples);
                for (var i = 0; i < int16.length; i += 1152) {
                    var chunk = int16.subarray(i, i + 1152);
                    var mp3buf = mp3enc.encodeBuffer(chunk);
                    if (mp3buf.length > 0) mp3Data.push(mp3buf);
                }
                var end = mp3enc.flush();
                if (end.length > 0) mp3Data.push(end);
                var blob = new Blob(mp3Data, { type: 'audio/mpeg' });
                var mp3File = new File([blob], file.name.replace(/\.[^.]+$/, '.mp3'), { type: 'audio/mpeg' });
                audioCtx.close();
                resolve(mp3File);
            }).catch(function(err) { audioCtx.close(); reject(err); });
        };
        reader.onerror = function() { reject(new Error('파일 읽기 실패')); };
        reader.readAsArrayBuffer(file);
    });
}
function downsampleBuffer(audioBuffer, targetRate) {
    var channel = audioBuffer.getChannelData(0);
    var ratio = audioBuffer.sampleRate / targetRate;
    var newLength = Math.round(channel.length / ratio);
    var result = new Float32Array(newLength);
    for (var i = 0; i < newLength; i++) {
        result[i] = channel[Math.min(Math.round(i * ratio), channel.length - 1)];
    }
    return result;
}
function floatTo16BitPCM(samples) {
    var buf = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
        var s = Math.max(-1, Math.min(1, samples[i]));
        buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf;
}

// ===== 다크모드 & 글자크기 =====
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark') ? '1' : '0');
}
function changeFontSize() {
    var scales = [1, 1.1, 1.2, 1.3];
    var current = parseFloat(document.documentElement.style.getPropertyValue('--font-scale') || '1');
    var idx = scales.indexOf(current);
    var next = scales[(idx + 1) % scales.length];
    document.documentElement.style.setProperty('--font-scale', next);
    localStorage.setItem('fontScale', next);
}

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('darkMode') === '1') document.body.classList.add('dark');
    var fs = localStorage.getItem('fontScale');
    if (fs) document.documentElement.style.setProperty('--font-scale', fs);

    // 드래그 앤 드롭
    var dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    document.getElementById('audioInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
});

// ===== 파일 처리 =====
function handleFile(file) {
    var validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm', 'audio/mp3', 'audio/x-wav', 'audio/aac'];
    var ext = file.name.split('.').pop().toLowerCase();
    var validExts = ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'flac', 'wma'];
    if (validTypes.indexOf(file.type) < 0 && validExts.indexOf(ext) < 0) {
        alert('지원하지 않는 파일 형식입니다.\n지원: MP3, WAV, M4A, OGG, WebM');
        return;
    }
    if (file.size > 100 * 1024 * 1024) {
        alert('파일 크기가 100MB를 초과합니다.');
        return;
    }

    audioFile = file;
    audioFileName = file.name;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024 / 1024).toFixed(1) + 'MB';
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('convertBtn').classList.remove('hidden');
}

function clearFile() {
    if (isProcessing) return;
    audioFile = null;
    audioFileName = '';
    document.getElementById('audioInput').value = '';
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('convertBtn').classList.add('hidden');
}

// ===== API 호출 =====
function authFetch(url, options) {
    // Use casenetai's AuthUtils if available (supports token refresh)
    if (window.AuthUtils && window.AuthUtils.authenticatedFetch) {
        options = options || {};
        if (!options.timeout) options.timeout = 10 * 60 * 1000; // 10분 (음성 처리용)
        return window.AuthUtils.authenticatedFetch(url, options).then(function(resp) {
            if (!resp) throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
            return resp;
        });
    }
    // fallback: credentials include로 쿠키 전송
    options = options || {};
    options.headers = options.headers || {};
    options.credentials = 'include';
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    return fetch(url, options);
}

// ===== 진술인 정보 수집 =====
function getStatementInfo() {
    return {
        name: (document.getElementById('infoName').value || '').trim(),
        org: (document.getElementById('infoOrg').value || '').trim(),
        position: (document.getElementById('infoPosition').value || '').trim(),
        birthdate: (document.getElementById('infoBirthdate').value || '').trim(),
        contact: (document.getElementById('infoContact').value || '').trim(),
        investigator: (document.getElementById('infoInvestigator').value || '').trim()
    };
}

// ===== 진행 단계 UI =====
function setStep(num, state) {
    var card = document.getElementById('step' + num);
    if (card) card.className = 'step-card step-' + (state === 'processing' ? 'active' : state);
}

function setStage(num, state) {
    var stage = document.getElementById('stage' + num);
    if (!stage) return;
    var icons = stage.querySelectorAll('i');
    // icons: [0]=spinner, [1]=check, [2]=circle
    icons[0].classList.add('hidden');
    icons[1].classList.add('hidden');
    icons[2].classList.add('hidden');

    stage.classList.remove('active', 'done');
    if (state === 'active') {
        stage.classList.add('active');
        icons[0].classList.remove('hidden');
    } else if (state === 'done') {
        stage.classList.add('done');
        icons[1].classList.remove('hidden');
    } else {
        icons[2].classList.remove('hidden');
    }
}

// ===== 메인 변환 플로우 =====
function startConversion() {
    if (!audioFile) { alert('파일을 선택해주세요'); return; }
    if (isProcessing) return;
    isProcessing = true;

    setStep(1, 'done');
    setStep(2, 'done');
    setStep(3, 'active');
    document.getElementById('step3Progress').classList.remove('hidden');
    document.getElementById('convertBtn').classList.add('hidden');
    document.getElementById('step4Content').classList.add('hidden');

    setStage(1, 'active');
    setStage(2, 'pending');
    setStage(3, 'pending');
    setStage(4, 'pending');

    // MP3 변환 후 GPT-4o-audio-preview 직접 생성 시도
    convertToMp3(audioFile).then(function(convertedFile) {
        setStage(1, 'done');
        setStage(2, 'active');
        return sendStatementDirect(convertedFile);
    }).catch(function(err) {
        // 변환 실패 시 기존 Whisper 폴백
        console.warn('직접 생성 실패, Whisper 폴백:', err.message);
        startConversionFallback();
    });
}

function sendStatementDirect(file) {
    var info = getStatementInfo();
    var fd = new FormData();
    fd.append('audio', file);
    fd.append('fileName', file.name);
    fd.append('info', JSON.stringify(info));

    authFetch('/api/statement/generate-direct', {
        method: 'POST',
        body: fd,
        timeout: 10 * 60 * 1000
    }).then(function(response) {
        if (!response.ok) {
            return response.json().then(function(d) {
                if (d.fallback) { startConversionFallback(); return null; }
                throw new Error(d.message || '진술서 생성 실패');
            });
        }

        var contentType = response.headers.get('Content-Type') || '';
        if (contentType.indexOf('text/event-stream') < 0) {
            throw new Error('서버 응답 형식 오류');
        }

        // SSE 스트리밍 결과 표시
        setStage(2, 'active');
        setStep(4, 'active');
        document.getElementById('step4Content').classList.remove('hidden');
        document.getElementById('resultBox').innerHTML = '';
        document.getElementById('resultBox').setAttribute('data-plain', '');
        document.getElementById('streamingIndicator').classList.remove('hidden');

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var fullText = '';
        var buffer = '';

        function readChunk() {
            reader.read().then(function(result) {
                if (result.done) { finishGeneration(fullText); return; }
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.indexOf('data: ') === 0) {
                        try {
                            var parsed = JSON.parse(line.substring(6));
                            if (parsed.error) { finishGeneration(fullText || ''); alert('오류: ' + parsed.error); return; }
                            if (parsed.done) { finishGeneration(fullText); return; }
                            if (parsed.token) {
                                fullText += parsed.token;
                                var charCount = document.getElementById('streamCharCount');
                                if (charCount) charCount.textContent = fullText.length + '자';
                                displayResult(fullText);
                            }
                        } catch(e) {}
                    }
                }
                readChunk();
            }).catch(function() { finishGeneration(fullText || ''); });
        }
        readChunk();
    }).catch(function(err) {
        alert('진술서 생성 오류: ' + (err && err.message ? err.message : '알 수 없는 오류'));
        isProcessing = false;
        resetProgress();
    });
}

// 폴백: 기존 Whisper → 생성 방식
function startConversionFallback() {
    setStage(1, 'active');

    var fd = new FormData();
    fd.append('audio', audioFile);
    fd.append('fileName', audioFileName);

    authFetch('/api/statement/transcribe', {
        method: 'POST',
        body: fd,
        timeout: 10 * 60 * 1000
    }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || '음성 인식 실패'); });
        return r.json();
    }).then(function(data) {
        currentTranscript = data.text || '';
        setStage(1, 'done');
        return generateStatement(currentTranscript);
    }).catch(function(err) {
        alert('오류: ' + err.message);
        isProcessing = false;
        resetProgress();
    });
}

// 직접 입력 모드에서 시작
function startFromTranscript() {
    var transcript = (document.getElementById('directTranscript').value || '').trim();
    if (!transcript) { alert('녹취록 텍스트를 입력해주세요'); return; }
    if (transcript.length < 30) { alert('녹취록 내용이 너무 짧습니다 (최소 30자)'); return; }
    if (isProcessing) return;
    isProcessing = true;

    currentTranscript = transcript;
    audioFileName = '직접입력';

    setStep(1, 'done');
    setStep(2, 'done');
    setStep(3, 'active');
    document.getElementById('step3Progress').classList.remove('hidden');
    document.getElementById('directInputArea').classList.add('hidden');

    setStage(1, 'done');
    setStage(2, 'pending');
    setStage(3, 'pending');
    setStage(4, 'pending');

    generateStatement(currentTranscript);
}

// 재생성
function regenerate() {
    if (!currentTranscript) { alert('녹취록 데이터가 없습니다'); return; }
    if (isProcessing) return;
    isProcessing = true;

    setStep(3, 'active');
    setStep(4, 'pending');
    document.getElementById('step3Progress').classList.remove('hidden');
    document.getElementById('step4Content').classList.add('hidden');

    setStage(1, 'done');
    setStage(2, 'pending');
    setStage(3, 'pending');
    setStage(4, 'pending');

    generateStatement(currentTranscript);
}

function generateStatement(transcript) {
    setStage(2, 'active');

    var info = getStatementInfo();

    authFetch('/api/statement/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
            transcript: transcript,
            name: info.name,
            org: info.org,
            position: info.position,
            birthdate: info.birthdate,
            contact: info.contact,
            investigator: info.investigator
        }),
        timeout: 10 * 60 * 1000
    }).then(function(response) {
        var contentType = response.headers.get('Content-Type') || '';

        if (contentType.indexOf('text/event-stream') >= 0) {
            // SSE 스트리밍
            setStage(2, 'active');
            setStep(4, 'active');
            document.getElementById('step4Content').classList.remove('hidden');
            document.getElementById('resultBox').innerHTML = '';
            document.getElementById('resultBox').setAttribute('data-plain', '');
            document.getElementById('streamingIndicator').classList.remove('hidden');

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var fullText = '';
            var buffer = '';

            function readChunk() {
                reader.read().then(function(result) {
                    if (result.done) {
                        finishGeneration(fullText);
                        return;
                    }
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.indexOf('data: ') === 0) {
                            try {
                                var parsed = JSON.parse(line.substring(6));
                                if (parsed.error) {
                                    finishGeneration(fullText || '');
                                    alert('스트리밍 오류: ' + parsed.error);
                                    return;
                                }
                                if (parsed.done) {
                                    finishGeneration(fullText);
                                    return;
                                }
                                if (parsed.token) {
                                    fullText += parsed.token;
                                    var charCount = document.getElementById('streamCharCount');
                                    if (charCount) charCount.textContent = fullText.length + '자';
                                    displayResult(fullText);
                                }
                            } catch(e) {}
                        }
                    }
                    readChunk();
                }).catch(function(err) {
                    finishGeneration(fullText || '');
                });
            }
            readChunk();
        } else {
            // JSON 폴백
            if (!response.ok) return response.json().then(function(d) { throw new Error(d.message || '진술서 생성 실패'); });
            return response.json().then(function(data) {
                var text = data.result || data.statement_text || '';
                finishGeneration(text);
            });
        }
    }).catch(function(err) {
        alert('진술서 생성 오류: ' + (err.message || '알 수 없는 오류'));
        isProcessing = false;
        resetProgress();
    });
}

function finishGeneration(text) {
    document.getElementById('streamingIndicator').classList.add('hidden');
    document.getElementById('step3Progress').classList.add('hidden');
    currentStatementText = text;
    isProcessing = false;
    if (text) displayResult(text);

    setStage(2, 'done');

    // Stage 3: Word 파일 생성
    setStage(3, 'active');
    try {
        currentDocxBlob = buildDocxBlob(text);
        setStage(3, 'done');
    } catch(e) {
        // docx 라이브러리 미로드 등으로 실패해도 텍스트 결과는 사용 가능
        currentDocxBlob = null;
    }

    // Stage 4: 완료
    setStage(4, 'done');
    setStep(3, 'done');
    setStep(4, 'active');
    document.getElementById('step4Content').classList.remove('hidden');
}

// ===== 편집된 텍스트 가져오기 =====
function getEditedText() {
    var box = document.getElementById('resultBox');
    if (!box) return currentStatementText;
    return box.innerText || box.textContent || currentStatementText;
}

// ===== 결과 표시 =====
function displayResult(text) {
    var html = esc(text)
        .replace(/^(─+)$/gm, '<span class="text-indigo-300">$1</span>')
        .replace(/(진\s*술\s*서)/g, '<strong class="text-lg text-indigo-800">$1</strong>')
        .replace(/^(【.*?】)$/gm, '<strong class="text-indigo-700">$1</strong>')
        .replace(/^(문\s+\d+\..*)/gm, '<strong>$1</strong>')
        .replace(/('.*?')/g, '<span class="text-blue-700 font-semibold">$1</span>');
    document.getElementById('resultBox').innerHTML = html;
    document.getElementById('resultBox').setAttribute('data-plain', text);
}

// ===== 클립보드 복사 =====
function copyResult() {
    var text = getEditedText() || '';
    if (!text) { alert('복사할 내용이 없습니다'); return; }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showCopyFeedback();
        }).catch(function() {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopyFeedback(); } catch(e) { alert('복사에 실패했습니다.'); }
    document.body.removeChild(ta);
}

function showCopyFeedback() {
    var btn = document.getElementById('copyBtn');
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check mr-1"></i>복사 완료!';
    btn.classList.remove('bg-green-600');
    btn.classList.add('bg-green-800');
    setTimeout(function() {
        btn.innerHTML = orig;
        btn.classList.remove('bg-green-800');
        btn.classList.add('bg-green-600');
    }, 2000);
}

// ===== Word(.docx) 생성 =====
function parseStatementText(text) {
    var info = getStatementInfo();
    var questions = [];
    var lines = text.split('\n');

    // 텍스트에서 정보 추출 (사전 입력 없으면)
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (!info.name) {
            var nameMatch = l.match(/^○\s*성\s*명\s*[:：]\s*(.+)/);
            if (nameMatch) info.name = nameMatch[1].trim();
        }
        if (!info.org) {
            var orgMatch = l.match(/^○\s*소\s*속\s*[:：]\s*(.+)/);
            if (orgMatch) info.org = orgMatch[1].trim();
        }
        if (!info.position) {
            var posMatch = l.match(/^○\s*직\s*위\s*[:：]\s*(.+)/);
            if (posMatch) info.position = posMatch[1].trim();
        }
        if (!info.birthdate) {
            var birthMatch = l.match(/^○\s*생\s*년\s*월\s*일\s*[:：]\s*(.+)/);
            if (birthMatch) info.birthdate = birthMatch[1].trim();
        }
        if (!info.contact) {
            var contactMatch = l.match(/^○\s*연\s*락\s*처\s*[:：]\s*(.+)/);
            if (contactMatch) info.contact = contactMatch[1].trim();
        }
        if (!info.investigator) {
            var invMatch = l.match(/^○\s*조\s*사\s*자\s*[:：]\s*(.+)/);
            if (invMatch) info.investigator = invMatch[1].trim();
        }
    }

    // 문답 파싱
    var currentQ = '';
    var currentA = '';
    var inAnswer = false;
    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var qMatch = line.match(/^문\s+(\d+)\.\s*(.*)/);
        var aMatch = line.match(/^답\.\s*(.*)/);

        if (qMatch) {
            if (currentQ && inAnswer) {
                questions.push({ q: currentQ, a: currentA.trim() });
            }
            currentQ = qMatch[2].trim();
            currentA = '';
            inAnswer = false;
        } else if (aMatch) {
            currentA = aMatch[1];
            inAnswer = true;
        } else if (inAnswer) {
            currentA += '\n' + line;
        }
    }
    if (currentQ && inAnswer) {
        questions.push({ q: currentQ, a: currentA.trim() });
    }

    return { info: info, questions: questions };
}

function buildDocxBlob(text, sigData) {
    if (typeof docx === 'undefined') return null;

    var parsed = parseStatementText(text);
    var info = parsed.info;
    var questions = parsed.questions;

    var D = docx;
    var FONT = '맑은 고딕';
    var BODY_SIZE = 20; // 10pt = 20 half-points
    var TITLE_SIZE = 28; // 14pt = 28 half-points
    var SPACING = { line: 276 }; // 1.15배

    var children = [];

    // 제목
    children.push(new D.Paragraph({
        children: [new D.TextRun({ text: '진  술  서', bold: true, size: TITLE_SIZE, font: FONT })],
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 400 }
    }));

    // 진술인 정보 테이블
    var infoRows = [
        ['성    명', info.name || '(녹취 내용 없음)'],
        ['소    속', info.org || '(녹취 내용 없음)'],
        ['직    위', info.position || '(녹취 내용 없음)'],
        ['생년월일', info.birthdate || '(녹취 내용 없음)'],
        ['연 락 처', info.contact || '(녹취 내용 없음)'],
        ['조 사 자', info.investigator || '(녹취 내용 없음)']
    ];

    var tableRows = infoRows.map(function(row) {
        return new D.TableRow({
            children: [
                new D.TableCell({
                    children: [new D.Paragraph({
                        children: [new D.TextRun({ text: row[0], bold: true, size: BODY_SIZE, font: FONT })],
                        spacing: SPACING
                    })],
                    width: { size: 25, type: D.WidthType.PERCENTAGE },
                    shading: { fill: 'E8E8E8' },
                    verticalAlign: D.VerticalAlign.CENTER
                }),
                new D.TableCell({
                    children: [new D.Paragraph({
                        children: [new D.TextRun({ text: row[1], size: BODY_SIZE, font: FONT })],
                        spacing: SPACING
                    })],
                    width: { size: 75, type: D.WidthType.PERCENTAGE },
                    verticalAlign: D.VerticalAlign.CENTER
                })
            ]
        });
    });

    children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: tableRows
    }));

    // 본문 서두
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    var orgName = info.org || '해당 기관';
    children.push(new D.Paragraph({
        children: [new D.TextRun({
            text: '상기 본인은 ' + orgName + '에서 발생한 노인학대 의심 건과 관련하여 다음과 같이 사실을 확인합니다.',
            size: BODY_SIZE, font: FONT
        })],
        spacing: SPACING
    }));

    // 문답 내용 헤더
    children.push(new D.Paragraph({ spacing: { before: 400 } }));
    children.push(new D.Paragraph({
        children: [new D.TextRun({ text: '【 문  답  내  용 】', bold: true, size: BODY_SIZE, font: FONT })],
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 200 }
    }));

    // 문답 항목
    questions.forEach(function(qa, idx) {
        children.push(new D.Paragraph({
            children: [new D.TextRun({ text: '문 ' + (idx + 1) + '. ' + qa.q, bold: true, size: BODY_SIZE, font: FONT })],
            spacing: { before: 200, ...SPACING }
        }));
        children.push(new D.Paragraph({
            children: [new D.TextRun({ text: '답.   ' + qa.a, size: BODY_SIZE, font: FONT })],
            spacing: SPACING
        }));
    });

    // 맺음말
    children.push(new D.Paragraph({ spacing: { before: 400 } }));
    children.push(new D.Paragraph({
        children: [new D.TextRun({ text: '위 진술 내용은 사실과 다름이 없음을 확인합니다.', size: BODY_SIZE, font: FONT })],
        spacing: SPACING
    }));

    // 날짜
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    children.push(new D.Paragraph({
        children: [new D.TextRun({ text: '       20    년    월    일', size: BODY_SIZE, font: FONT })],
        alignment: D.AlignmentType.CENTER,
        spacing: SPACING
    }));

    // 서명란 테이블
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        borders: {
            top: { style: D.BorderStyle.NONE },
            bottom: { style: D.BorderStyle.NONE },
            left: { style: D.BorderStyle.NONE },
            right: { style: D.BorderStyle.NONE },
            insideHorizontal: { style: D.BorderStyle.NONE },
            insideVertical: { style: D.BorderStyle.NONE }
        },
        rows: [
            new D.TableRow({
                children: [
                    new D.TableCell({
                        children: [new D.Paragraph({
                            children: [new D.TextRun({ text: '소    속 : ' + (info.org || ''), size: BODY_SIZE, font: FONT })],
                            alignment: D.AlignmentType.RIGHT,
                            spacing: SPACING
                        })],
                        borders: {
                            top: { style: D.BorderStyle.NONE },
                            bottom: { style: D.BorderStyle.NONE },
                            left: { style: D.BorderStyle.NONE },
                            right: { style: D.BorderStyle.NONE }
                        }
                    })
                ]
            }),
            new D.TableRow({
                children: [
                    new D.TableCell({
                        children: [new D.Paragraph({
                            children: (function() {
                                var runs = [new D.TextRun({ text: '진 술 인 : ' + (info.name || '') + '    ', size: BODY_SIZE, font: FONT })];
                                if (sigData) {
                                    runs.push(new D.ImageRun({ data: sigData, transformation: { width: 100, height: 50 }, type: 'png' }));
                                } else {
                                    runs.push(new D.TextRun({ text: '        (인)', size: BODY_SIZE, font: FONT }));
                                }
                                return runs;
                            })(),
                            alignment: D.AlignmentType.RIGHT,
                            spacing: SPACING
                        })],
                        borders: {
                            top: { style: D.BorderStyle.NONE },
                            bottom: { style: D.BorderStyle.NONE },
                            left: { style: D.BorderStyle.NONE },
                            right: { style: D.BorderStyle.NONE }
                        }
                    })
                ]
            })
        ]
    }));

    var doc = new D.Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1418,
                        bottom: 1418,
                        left: 1701,
                        right: 1701
                    }
                }
            },
            children: children
        }]
    });

    return doc;
}

function downloadDocx() {
    var editedText = getEditedText();
    if (!editedText) { alert('다운로드할 내용이 없습니다'); return; }

    if (typeof docx === 'undefined') {
        alert('Word 문서 생성 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    var btn = document.getElementById('docxBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>생성 중...';
    }

    try {
        var doc = buildDocxBlob(editedText);
        if (!doc) {
            alert('Word 문서 생성에 실패했습니다.');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-word mr-1"></i>Word'; }
            return;
        }

        docx.Packer.toBlob(doc).then(function(blob) {
            var info = getStatementInfo();
            var parsed = parseStatementText(editedText);
            var pi = parsed.info;
            var orgPart = pi.org || '기관';
            var namePart = pi.name || '미상';
            var posPart = pi.position || '직위';
            var fileName = orgPart + '_' + namePart + '_' + posPart + '_진술서.docx';

            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (btn) {
                btn.innerHTML = '<i class="fas fa-check mr-1"></i>다운로드 완료!';
                setTimeout(function() {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-file-word mr-1"></i>Word';
                }, 2000);
            }
        }).catch(function(err) {
            alert('Word 파일 생성 오류: ' + err.message);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-word mr-1"></i>Word'; }
        });
    } catch(e) {
        alert('Word 파일 생성 오류');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-word mr-1"></i>Word'; }
    }
}

// ===== 직접 입력 모드 =====
function toggleDirectInput() {
    var area = document.getElementById('directInputArea');
    if (area.classList.contains('hidden')) {
        area.classList.remove('hidden');
        document.getElementById('directTranscript').focus();
    } else {
        area.classList.add('hidden');
    }
}

// ===== 초기화 =====
function resetProgress() {
    setStep(1, 'active');
    setStep(2, 'active');
    setStep(3, 'pending');
    setStep(4, 'pending');
    document.getElementById('step3Progress').classList.add('hidden');
    document.getElementById('step4Content').classList.add('hidden');
    document.getElementById('streamingIndicator').classList.add('hidden');
    document.getElementById('convertBtn').classList.remove('hidden');
    setStage(1, 'pending');
    setStage(2, 'pending');
    setStage(3, 'pending');
    setStage(4, 'pending');
}

function resetAll() {
    clearFile();
    audioFile = null;
    audioFileName = '';
    currentTranscript = '';
    currentStatementText = '';
    currentDocxBlob = null;
    isProcessing = false;
    consentSignatureData = null;
    statementSignatureData = null;
    document.getElementById('resultBox').innerHTML = '';
    document.getElementById('resultBox').setAttribute('data-plain', '');
    document.getElementById('directTranscript').value = '';
    document.getElementById('directInputArea').classList.add('hidden');
    document.getElementById('infoName').value = '';
    document.getElementById('infoOrg').value = '';
    document.getElementById('infoPosition').value = '';
    document.getElementById('infoBirthdate').value = '';
    document.getElementById('infoContact').value = '';
    document.getElementById('infoInvestigator').value = '';
    // 동의서 초기화
    var c1 = document.getElementById('consent1'); if (c1) c1.checked = false;
    var c2 = document.getElementById('consent2'); if (c2) c2.checked = false;
    var c3 = document.getElementById('consent3'); if (c3) c3.checked = false;
    var csa = document.getElementById('consentSignArea'); if (csa) csa.classList.add('hidden');
    var csd = document.getElementById('consentSignDone'); if (csd) csd.classList.add('hidden');
    if (consentSignPad) consentSignPad.clear();
    if (statementSignPad) statementSignPad.clear();
    resetProgress();
}

// ===== 전자 서명 =====
function initSignaturePad(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    return new SignaturePad(canvas, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#1a1a2e',
        minWidth: 1,
        maxWidth: 3
    });
}

function dataUrlToUint8Array(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var array = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return array;
}

// ===== 동의서 서명 =====
function onConsentCheck() {
    var c1 = document.getElementById('consent1').checked;
    var c2 = document.getElementById('consent2').checked;
    var c3 = document.getElementById('consent3').checked;
    var anyChecked = c1 || c2 || c3;
    var signArea = document.getElementById('consentSignArea');
    var recordingChoice = document.getElementById('recordingChoice');
    if (recordingChoice) recordingChoice.classList.toggle('hidden', !c2);
    if (consentSignatureData) return;
    if (anyChecked) {
        signArea.classList.remove('hidden');
        if (!consentSignPad) {
            setTimeout(function() { consentSignPad = initSignaturePad('consentSignCanvas'); }, 100);
        }
    } else {
        signArea.classList.add('hidden');
    }
}

function clearConsentSign() {
    if (consentSignPad) consentSignPad.clear();
}

function confirmConsentSign() {
    if (!consentSignPad || consentSignPad.isEmpty()) { alert('서명을 해주세요'); return; }
    consentSignatureData = consentSignPad.toDataURL('image/png');
    document.getElementById('consentSignArea').classList.add('hidden');
    document.getElementById('consentSignDone').classList.remove('hidden');
}

function resetConsentSign() {
    consentSignatureData = null;
    document.getElementById('consentSignDone').classList.add('hidden');
    document.getElementById('consentSignArea').classList.remove('hidden');
    if (consentSignPad) consentSignPad.clear();
    else setTimeout(function() { consentSignPad = initSignaturePad('consentSignCanvas'); }, 100);
}

function downloadConsentDocs() {
    if (!consentSignatureData) { alert('서명을 먼저 해주세요'); return; }
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') { alert('PDF 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.'); return; }
    var info = getStatementInfo();
    var sigUrl = consentSignatureData;
    var c1 = document.getElementById('consent1').checked;
    var c2 = document.getElementById('consent2').checked;
    var c3 = document.getElementById('consent3').checked;
    var pdfs = [];
    if (c1) pdfs.push({ name: '권리및의무고지확인서', html: buildRightsConsentPdfHtml(info, sigUrl) });
    if (c2) {
        var radios = document.getElementsByName('recordingConsent');
        var isRefuse = false;
        for (var r = 0; r < radios.length; r++) { if (radios[r].checked && radios[r].value === 'refuse') isRefuse = true; }
        if (isRefuse) {
            pdfs.push({ name: '녹음녹취거부확인서', html: buildRecordingRefusalPdfHtml(info, sigUrl) });
        } else {
            pdfs.push({ name: '녹음녹취동의서', html: buildRecordingConsentPdfHtml(info, sigUrl) });
        }
    }
    if (c3) pdfs.push({ name: '개인정보수집및이용동의서', html: buildPrivacyConsentPdfHtml(info, sigUrl) });
    if (pdfs.length === 0) { alert('동의 항목을 선택해주세요'); return; }
    var downloadNext = function(idx) {
        if (idx >= pdfs.length) return;
        var item = pdfs[idx];
        var fileName = (info.name || '진술인') + '_' + item.name + '.pdf';
        generatePdf(item.html, fileName, function() {
            setTimeout(function() { downloadNext(idx + 1); }, 800);
        });
    };
    downloadNext(0);
}

// ===== 진술서 서명 모달 =====
function openStatementSign() {
    if (!currentStatementText) { alert('진술서가 생성되지 않았습니다'); return; }
    document.getElementById('statementSignModal').classList.remove('hidden');
    setTimeout(function() {
        statementSignPad = initSignaturePad('statementSignCanvas');
    }, 150);
}

function closeStatementSign() {
    document.getElementById('statementSignModal').classList.add('hidden');
}

function clearStatementSign() {
    if (statementSignPad) statementSignPad.clear();
}

function confirmStatementSign() {
    if (!statementSignPad || statementSignPad.isEmpty()) { alert('서명을 해주세요'); return; }
    statementSignatureData = statementSignPad.toDataURL('image/png');
    closeStatementSign();
    downloadStatementPdf(statementSignatureData);
}

// ===== 공통 PDF 생성 함수 =====
function generatePdf(htmlContent, fileName, onDone) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.97);z-index:100000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="text-align:center;color:#4f46e5;font-family:sans-serif"><div style="font-size:28px;margin-bottom:10px"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:15px;font-weight:bold">PDF 생성 중...</div></div>';
    document.body.appendChild(overlay);
    var scrollY = window.scrollY;

    var container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.cssText = 'position:absolute;left:0;top:0;width:794px;padding:40px;box-sizing:border-box;background:white;font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:13px;line-height:1.7;color:#000;z-index:99999';
    document.body.appendChild(container);

    // 이미지 로딩 완료 대기
    var images = container.querySelectorAll('img');
    var imgCount = images.length;
    var imgLoaded = 0;

    function doCapture() {
        setTimeout(function() {
            // html2canvas 독립 라이브러리 직접 사용
            html2canvas(container, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                width: 794,
                windowWidth: 794,
                scrollX: 0,
                scrollY: 0,
                x: 0,
                y: 0
            }).then(function(canvas) {
                // canvas를 페이지별로 잘라서 PDF 생성 (상하좌우 여백 포함)
                var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
                var pageW = pdf.internal.pageSize.getWidth();   // 210mm
                var pageH = pdf.internal.pageSize.getHeight();  // 297mm
                var marginTop = 15;
                var marginBottom = 15;
                var marginLR = 10;
                var usableW = pageW - marginLR * 2;   // 190mm
                var usableH = pageH - marginTop - marginBottom; // 267mm
                var canvasW = canvas.width;
                var canvasH = canvas.height;

                // 캔버스 픽셀 → PDF mm 변환 비율
                var pxPerMm = canvasW / usableW;
                var sliceHeightPx = Math.floor(usableH * pxPerMm); // 한 페이지에 들어갈 캔버스 높이(px)
                var pageCount = Math.ceil(canvasH / sliceHeightPx);

                for (var p = 0; p < pageCount; p++) {
                    if (p > 0) pdf.addPage();
                    var srcY = p * sliceHeightPx;
                    var srcH = Math.min(sliceHeightPx, canvasH - srcY);

                    // 페이지별 캔버스 잘라내기
                    var pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvasW;
                    pageCanvas.height = srcH;
                    var ctx = pageCanvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvasW, srcH);
                    ctx.drawImage(canvas, 0, srcY, canvasW, srcH, 0, 0, canvasW, srcH);

                    var pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
                    var pageImgH = (srcH / pxPerMm);
                    pdf.addImage(pageImgData, 'JPEG', marginLR, marginTop, usableW, pageImgH);
                }

                pdf.save(fileName);
                cleanup();
                if (onDone) onDone(null);
            }).catch(function(err) {
                console.error('html2canvas error:', err);
                cleanup();
                alert('PDF 생성에 실패했습니다: ' + err.message);
                if (onDone) onDone(err);
            });
        }, 500);
    }

    if (imgCount === 0) {
        doCapture();
    } else {
        for (var i = 0; i < images.length; i++) {
            if (images[i].complete) { imgLoaded++; if (imgLoaded >= imgCount) doCapture(); }
            else { images[i].onload = images[i].onerror = function() { imgLoaded++; if (imgLoaded >= imgCount) doCapture(); }; }
        }
    }

    function cleanup() {
        try { document.body.removeChild(container); } catch(e) {}
        try { document.body.removeChild(overlay); } catch(e) {}
        window.scrollTo(0, scrollY);
    }
}

function downloadStatementPdf(sigDataUrl) {
    var text = getEditedText();
    var parsed = parseStatementText(text);
    var info = parsed.info;
    var questions = parsed.questions;
    var btn = document.getElementById('signPdfBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>PDF 준비 중...'; }

    var html = buildStatementPdfHtml(info, questions, sigDataUrl);

    // 진술서는 여러 페이지 → 브라우저 인쇄 엔진 사용 (텍스트 잘림 방지)
    var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<title>진술서_' + esc(info.name || '') + '</title>' +
        '<style>' +
        '@page{size:A4;margin:0}' +
        '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
        '*{margin:0;padding:0;box-sizing:border-box}' +
        'body{font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;font-size:11pt;line-height:1.8;color:#000;background:#fff;padding:15mm}' +
        'table{border-collapse:collapse;width:100%;page-break-inside:avoid}' +
        'td,th{border:1px solid #888;padding:8px 10px;font-size:10pt}' +
        'tr{page-break-inside:avoid}' +
        'p{page-break-inside:avoid}' +
        'h1{page-break-after:avoid}' +
        'img{max-width:200px}' +
        '.qa-block{page-break-inside:avoid}' +
        '.sign-area{page-break-inside:avoid}' +
        '</style></head><body>' + html + '</body></html>';

    var printWin = window.open('', '_blank', 'width=850,height=1100');
    if (!printWin) {
        alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-pen-nib mr-1"></i>서명 후 PDF 다운로드'; }
        return;
    }
    printWin.document.write(fullHtml);
    printWin.document.close();

    printWin.onload = function() {
        setTimeout(function() {
            printWin.focus();
            printWin.print();
        }, 300);
    };

    if (btn) {
        btn.innerHTML = '<i class="fas fa-check mr-1"></i>인쇄 창 열림';
        setTimeout(function() { btn.disabled = false; btn.innerHTML = '<i class="fas fa-pen-nib mr-1"></i>서명 후 PDF 다운로드'; }, 3000);
    }
}

function buildStatementPdfHtml(info, questions, sigDataUrl) {
    var e = function(s) { return esc(s || ''); };
    var s = '<div style="font-family:\'Malgun Gothic\',\'맑은 고딕\',\'Noto Sans KR\',sans-serif;font-size:11pt;line-height:1.8;color:#000">';
    // 제목
    s += '<h1 style="text-align:center;font-size:16pt;font-weight:bold;margin:0 0 25px;letter-spacing:8px">진 술 서</h1>';
    // 정보 테이블
    var rows = [['성    명', info.name],['소    속', info.org],['직    위', info.position],['생년월일', info.birthdate],['연 락 처', info.contact],['조 사 자', info.investigator]];
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:20px">';
    rows.forEach(function(r) {
        s += '<tr style="height:32px"><td style="border:1px solid #888;padding:8px 10px;background:#e8e8e8;font-weight:bold;width:25%;font-size:10pt;text-align:center;vertical-align:middle;line-height:32px">' + e(r[0]) + '</td>';
        s += '<td style="border:1px solid #888;padding:8px 10px;font-size:10pt;vertical-align:middle;line-height:32px">' + e(r[1] || '(녹취 내용 없음)') + '</td></tr>';
    });
    s += '</table>';
    // 서두
    s += '<p style="margin:15px 0;font-size:10.5pt">상기 본인은 ' + e(info.org || '해당 기관') + '에서 발생한 노인학대 의심 건과 관련하여 다음과 같이 사실을 확인합니다.</p>';
    // 문답 헤더
    s += '<p style="text-align:center;font-weight:bold;margin:25px 0 15px;font-size:11pt">【 문  답  내  용 】</p>';
    // 문답
    questions.forEach(function(qa, idx) {
        s += '<div class="qa-block" style="margin:12px 0">';
        s += '<p style="margin:0 0 4px;font-size:10.5pt"><strong>문 ' + (idx + 1) + '. ' + e(qa.q) + '</strong></p>';
        s += '<p style="margin:4px 0 0;font-size:10.5pt">답.   ' + e(qa.a).replace(/\n/g, '<br>') + '</p>';
        s += '</div>';
    });
    // 맺음말 + 날짜 + 서명란을 하나의 블록으로 묶어 분리 방지
    var now = new Date();
    s += '<div class="sign-area" style="margin-top:30px;font-size:10.5pt">';
    s += '<p>위 진술 내용은 사실과 다름이 없음을 확인합니다.</p>';
    s += '<p style="text-align:center;margin:25px 0">' + now.getFullYear() + '년    ' + (now.getMonth()+1) + '월    ' + now.getDate() + '일</p>';
    s += '<div style="text-align:right;margin-top:25px">';
    s += '<div>소    속 : ' + e(info.org) + '</div>';
    s += '<div style="margin-top:8px"><span>진 술 인 : ' + e(info.name) + '  </span>';
    if (sigDataUrl) {
        s += '<img src="' + sigDataUrl + '" style="height:45px;vertical-align:middle;display:inline">';
    }
    s += '</div></div>';
    s += '</div>'; // sign-area 닫기
    s += '</div>'; // 전체 컨테이너 닫기
    return s;
}

// ===== 동의서 문서 생성 (실제 양식 기반) =====
function consentDateLine(D, FONT, SZ) {
    var now = new Date();
    return new D.Paragraph({
        children: [new D.TextRun({ text: now.getFullYear() + '.      .      .', size: SZ, font: FONT })],
        alignment: D.AlignmentType.CENTER,
        spacing: { before: 400, line: 276 }
    });
}

function consentSignLine(D, FONT, SZ, info, sigData, label) {
    var sigLabel = label || '진술인';
    var sigChildren = [new D.TextRun({ text: sigLabel + '            ', size: SZ, font: FONT })];
    if (sigData) {
        sigChildren.push(new D.ImageRun({ data: sigData, transformation: { width: 100, height: 50 }, type: 'png' }));
    } else {
        sigChildren.push(new D.TextRun({ text: '(서명 또는 날인)', size: SZ, font: FONT, color: '999999' }));
    }
    return new D.Paragraph({
        children: sigChildren,
        alignment: D.AlignmentType.CENTER,
        spacing: { before: 300, line: 276 }
    });
}

function consentInfoTable(D, FONT, SZ, info, includeCase) {
    var rows = [
        ['성    명', info.name || ''],
        ['소    속', info.org || ''],
        ['직    위', info.position || ''],
        ['생년월일', info.birthdate || ''],
        ['연 락 처', info.contact || '']
    ];
    if (includeCase) rows.push(['진술사례', '노인학대 의심건']);
    return new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: rows.map(function(r) {
            return new D.TableRow({
                children: [
                    new D.TableCell({
                        children: [new D.Paragraph({ children: [new D.TextRun({ text: '○ ' + r[0], size: SZ, font: FONT })], spacing: { line: 276 } })],
                        width: { size: 25, type: D.WidthType.PERCENTAGE },
                        verticalAlign: D.VerticalAlign.CENTER
                    }),
                    new D.TableCell({
                        children: [new D.Paragraph({ children: [new D.TextRun({ text: r[1], size: SZ, font: FONT })], spacing: { line: 276 } })],
                        width: { size: 75, type: D.WidthType.PERCENTAGE },
                        verticalAlign: D.VerticalAlign.CENTER
                    })
                ]
            });
        })
    });
}

// [서식8] 진술 관련 권리 및 의무고지확인서
function buildRightsConsentDocx(info, sigData) {
    var D = docx; var FONT = '맑은 고딕'; var SZ = 20; var SP = { line: 276 };
    var children = [];
    // 서식 번호
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '[서식8] 진술 관련 권리 및 의무고지확인서', size: 18, font: FONT, underline: {} })], spacing: { after: 200 } }));
    // 제목
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '진술 관련 권리 및 의무고지확인서', bold: true, size: 28, font: FONT, underline: {} })], alignment: D.AlignmentType.CENTER, spacing: { after: 400 } }));
    // 고지 내용 (테이블로 박스)
    var orgName = info.org || '          ';
    children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: [new D.TableRow({
            children: [new D.TableCell({
                children: [
                    new D.Paragraph({ children: [new D.TextRun({ text: '1. 귀하는       ' + orgName + '에서 발생한 ', size: SZ, font: FONT }), new D.TextRun({ text: '노인학대 의심 건', bold: true, size: SZ, font: FONT, underline: {} }), new D.TextRun({ text: '과 관련하여 노인복지법 제39조의7제2항에 따른 조사에 (피해자, 신고인, 관계자, 목격자)로서 진술하기 위해 참석하였습니다.', size: SZ, font: FONT })], spacing: SP }),
                    new D.Paragraph({ children: [new D.TextRun({ text: '2. 귀하는 양심에 따라 기억나는 사실을 자유롭게 진술할 수 있는 권리가 있습니다.', size: SZ, font: FONT })], spacing: SP }),
                    new D.Paragraph({ children: [new D.TextRun({ text: '3. 귀하는 노인복지법 제39조의7제6항에 따라 정당한 사유 없이는 현장조사로 진행되는 질문에 거부해서는 안 됩니다.', size: SZ, font: FONT })], spacing: SP })
                ],
                verticalAlign: D.VerticalAlign.CENTER
            })]
        })]
    }));
    // 문답
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '문  귀하는 위와 같은 권리와 책임 있음을 고지받았습니까?', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '답', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ spacing: { before: 100 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '문  귀하는 어떠한 내용에 대하여 진술할 것인지 고지받았습니까?', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '답', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ spacing: { before: 100 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '문  귀하가 진술을 거부할 경우 어떤 이유 때문인가요?', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '답', size: SZ, font: FONT })], spacing: SP }));
    // 날짜 & 서명
    children.push(consentDateLine(D, FONT, SZ));
    children.push(consentSignLine(D, FONT, SZ, info, sigData));
    return new D.Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1701 } } }, children: children }] });
}

// [서식8-1] 진술의 녹음·녹취 동의서
function buildRecordingConsentDocx(info, sigData) {
    var D = docx; var FONT = '맑은 고딕'; var SZ = 20; var SP = { line: 276 };
    var children = [];
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '[서식8-1] (진술에 동의했을 시) 진술의 녹음·녹취 동의', size: 18, font: FONT, underline: {} })], spacing: { after: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '진술의 녹음·녹취 동의서', bold: true, size: 28, font: FONT, underline: {} })], alignment: D.AlignmentType.CENTER, spacing: { after: 400 } }));
    // 인적사항 테이블
    children.push(consentInfoTable(D, FONT, SZ, info, true));
    // 동의 문구
    var orgName = info.org || '          ';
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: [new D.TableRow({
            children: [new D.TableCell({
                children: [
                    new D.Paragraph({ children: [new D.TextRun({ text: '  위 건에 관하여       ' + orgName + '에서 진행되는', size: SZ, font: FONT })], spacing: SP }),
                    new D.Paragraph({ children: [new D.TextRun({ text: '  조사에 있어서 본인의 진술에 대한 녹음·녹취에 동의합니다.', size: SZ, font: FONT })], spacing: SP })
                ]
            })]
        })]
    }));
    children.push(consentDateLine(D, FONT, SZ));
    children.push(consentSignLine(D, FONT, SZ, info, sigData));
    return new D.Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1701 } } }, children: children }] });
}

// [서식8-2] 진술의 녹음·녹취 거부확인서
function buildRecordingRefusalDocx(info, sigData) {
    var D = docx; var FONT = '맑은 고딕'; var SZ = 20; var SP = { line: 276 };
    var children = [];
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '[서식8-2] (진술은 동의했으나 녹음·녹취 거부 시) 진술의 녹음·녹취 거부확인서', size: 18, font: FONT, underline: {} })], spacing: { after: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '진술의 녹음·녹취 거부확인서', bold: true, size: 28, font: FONT, underline: {} })], alignment: D.AlignmentType.CENTER, spacing: { after: 400 } }));
    // 인적사항 테이블 (진술사례 없음)
    children.push(consentInfoTable(D, FONT, SZ, info, false));
    // 거부 확인 문구
    var orgName = info.org || '          ';
    children.push(new D.Paragraph({ spacing: { before: 300 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '  상기 본인은       ' + orgName + '에서 발생한 노인학대 의심건에 관해', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '  관계인으로 진술함에 있어 아래와 같이 확인합니다.', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '1. 본인은 진술과 관련하여 진술 관련 권리 및 의무에 관해 고지 받았으나 녹음·녹취되기를 원하지 않습니다.', size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ spacing: { before: 100 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '2. 본 녹음·녹취 거부 확인서는 본인 스스로의 의사에 따라 작성한 것임을 확인합니다.', size: SZ, font: FONT })], spacing: SP }));
    children.push(consentDateLine(D, FONT, SZ));
    children.push(consentSignLine(D, FONT, SZ, info, sigData));
    return new D.Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1701 } } }, children: children }] });
}

// 개인정보 수집 및 이용 동의서
function buildPrivacyConsentDocx(info, sigData) {
    var D = docx; var FONT = '맑은 고딕'; var SZ = 20; var SP = { line: 276 }; var SSZ = 18;
    var children = [];
    // 제목
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '개인정보 수집 및 이용 동의서', bold: true, size: 28, font: FONT, underline: {} })], alignment: D.AlignmentType.CENTER, spacing: { after: 300 } }));
    // 동의자 정보
    children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: [new D.TableRow({
            children: [
                new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '□ 동의자 성명 : ' + (info.name || ''), size: SZ, font: FONT })], spacing: SP })], width: { size: 50, type: D.WidthType.PERCENTAGE } }),
                new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '□ 생년월일 : ' + (info.birthdate || ''), size: SZ, font: FONT })], spacing: SP })], width: { size: 50, type: D.WidthType.PERCENTAGE } })
            ]
        })]
    }));
    // 본문
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '본 경기북서부노인보호전문기관은 노인복지법 제39조의5제2항에 의한 업무를 처리함에 있어 원활한 상담, 각종 서비스 등 기본적인 서비스 제공을 위하여 아래와 같은 개인정보를 수집하고 있으며 수집된 개인정보는 개인정보 보호법에 명기된 관련 법률상의 개인정보보호 규정을 준수하며, 관련법령에 의거하여 학대피해노인의 인권보호에 최선을 다하고 있습니다.', size: SSZ, font: FONT })], spacing: SP }));
    // 수집 항목
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '□ 개인정보 수집 항목', bold: true, size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 인적사항 : 성명, 성별, 생년월일, 주소, 연락처, 연령, 동거인, 직업상태, 결혼상태, 교육수준, 생활상태, 건강상태, 일상생활수행정도, 기타 사항 등 노인학대 사례관리에 명기된 항목', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 관련사항 : 노인학대 관련 상담일지, 기타 관련 자료', size: SSZ, font: FONT })], spacing: SP }));
    // 수집 및 이용 목적
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '□ 개인정보 수집 및 이용 목적', bold: true, size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '귀하의 소중한 개인정보를 아래와 같은 목적으로 수집 및 이용합니다.', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 노인복지법 제39조의5에 관한 법령을 수행하기 위한 모든 사항', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 노인학대 발생 여부 판단에 대한 근거', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 노인학대 해결을 위한 논의자료 및 기관에 권고하는 자료', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 노인학대 결과 및 관련 내용을 관할기관(보건복지부·시·도, 중앙노인보호전문기관)에 보고하는 자료', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 국가 노인학대예방사업에 대한 통계', size: SSZ, font: FONT })], spacing: SP }));
    // 보유 및 이용기간
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '□ 개인정보 보유 및 이용기간', bold: true, size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 상기 내용은 개인정보 보호법을 기준으로 합니다.', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 상기 개인정보의 이용목적이 소멸된 경우에도 노인학대 관련 정보의 이용목적이 분명한 경우는 개인정보를 보유할 수 있음을 안내하여 드립니다.', size: SSZ, font: FONT })], spacing: SP }));
    // 서비스 동의
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '□ 서비스 이용 동의', bold: true, size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 본인은 노인보호전문기관의 서비스 이용에 동의합니다. □', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '□ 서비스 연계 동의', bold: true, size: SZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '○ 본인은 위 동의에 따른 본인의 개인정보를 관련 정보통신망 등을 통하여 대상기관에 제공함에 동의합니다. □', size: SSZ, font: FONT })], spacing: SP }));
    // 안내사항
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '※ 상기 내용은 본 기관에서 노인학대 상담 및 서비스 연계 등에 필요한 기본 정보에 해당합니다.', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '※ 상기 내용에 대하여 귀하는 동의를 거부하실 권리가 있습니다. 다만 그러한 경우에 원활한 지원이 어려울 수 있음을 알려드립니다.', size: SSZ, font: FONT })], spacing: SP }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '※ 아울러 본 동의서는 노인학대 관련 사업 진행 및 서비스 연계의 목적 외에는 사용하지 않을 것을 약속드리며 철저히 비밀로 관리하여 타인에게 공개하거나 유출하지 않을 것임을 알려드립니다.', size: SSZ, font: FONT })], spacing: SP }));
    // 최종 동의문
    children.push(new D.Paragraph({ spacing: { before: 200 } }));
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '본인은 위 내용을 확인하였으며, 위와 같이 "개인정보 보호법"에 명기된 관련 법률에 의거하여 개인정보 수집 및 이용에 동의합니다.', size: SZ, font: FONT })], spacing: SP }));
    // 날짜
    var now = new Date();
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '20    년      월      일', size: SZ, font: FONT })], alignment: D.AlignmentType.RIGHT, spacing: { before: 300, line: 276 } }));
    // 서명란 (동의인)
    var sigChildren = [new D.TextRun({ text: '동의인 :            ', size: SZ, font: FONT })];
    if (sigData) {
        sigChildren.push(new D.ImageRun({ data: sigData, transformation: { width: 100, height: 50 }, type: 'png' }));
    } else {
        sigChildren.push(new D.TextRun({ text: '(서명)', size: SZ, font: FONT, color: '999999' }));
    }
    sigChildren.push(new D.TextRun({ text: '        학대피해노인과의 관계 :            ', size: SZ, font: FONT }));
    children.push(new D.Paragraph({ children: sigChildren, spacing: { before: 200, line: 276 } }));
    // 대리인 안내
    children.push(new D.Paragraph({ children: [new D.TextRun({ text: '※ 대리인이 서명할 경우, 사유 기재 _______________', size: SSZ, font: FONT })], spacing: { before: 200, line: 276 } }));
    return new D.Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1701 } } }, children: children }] });
}

// ===== 동의서 PDF HTML 빌더 (실제 양식 기반) =====
function pdfFont() { return "font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif"; }
function pdfDateStr() { var n = new Date(); return n.getFullYear() + '년  ' + (n.getMonth()+1) + '월  ' + n.getDate() + '일'; }
function pdfSignBlock(sigUrl, name, label) {
    var s = '<div style="text-align:center;margin-top:30px;font-size:10.5pt">';
    s += '<span>' + (label || '진술인') + '  ' + esc(name || '') + '  </span>';
    if (sigUrl) s += '<img src="' + sigUrl + '" style="height:45px;vertical-align:middle;display:inline">';
    else s += '<span>(서명 또는 날인)</span>';
    s += '</div>';
    return s;
}
function pdfInfoRow(label, val) {
    return '<tr><td style="border:1px solid #888;padding:6px 10px;width:25%;font-size:10pt">○ ' + esc(label) + '</td><td style="border:1px solid #888;padding:6px 10px;font-size:10pt">' + esc(val || '') + '</td></tr>';
}

// [서식8] 권리 및 의무고지확인서 PDF
function buildRightsConsentPdfHtml(info, sigUrl) {
    var orgName = info.org || '          ';
    var s = '<div style="' + pdfFont() + ';font-size:10.5pt;line-height:1.8;color:#000">';
    s += '<p style="font-size:9pt;text-decoration:underline">[서식8] 진술 관련 권리 및 의무고지확인서</p>';
    s += '<h1 style="text-align:center;font-size:16pt;font-weight:bold;margin:15px 0 25px;text-decoration:underline">진술 관련 권리 및 의무고지확인서</h1>';
    s += '<div style="border:1px solid #888;padding:15px 20px;margin-bottom:25px">';
    s += '<p>1. 귀하는       <u><b>' + esc(orgName) + '에서 발생한 노인학대 의심 건</b></u>과 관련하여 노인복지법 제39조의7제2항에 따른 조사에 (피해자, 신고인, 관계자, 목격자)로서 진술하기 위해 참석하였습니다.</p>';
    s += '<p>2. 귀하는 양심에 따라 기억나는 사실을 자유롭게 진술할 수 있는 권리가 있습니다.</p>';
    s += '<p>3. 귀하는 노인복지법 제39조의7제6항에 따라 정당한 사유 없이는 현장조사로 진행되는 질문에 거부해서는 안 됩니다.</p>';
    s += '</div>';
    s += '<p style="margin:15px 0 5px">문  귀하는 위와 같은 권리와 책임 있음을 고지받았습니까?</p>';
    s += '<p style="margin:5px 0 20px">답  네</p>';
    s += '<p style="margin:15px 0 5px">문  귀하는 어떠한 내용에 대하여 진술할 것인지 고지받았습니까?</p>';
    s += '<p style="margin:5px 0 20px">답  네</p>';
    s += '<p style="text-align:center;margin-top:40px">' + pdfDateStr() + '</p>';
    s += pdfSignBlock(sigUrl, info.name);
    s += '</div>';
    return s;
}

// [서식8-1] 녹음·녹취 동의서 PDF
function buildRecordingConsentPdfHtml(info, sigUrl) {
    var orgName = info.org || '          ';
    var s = '<div style="' + pdfFont() + ';font-size:10.5pt;line-height:1.8;color:#000">';
    s += '<p style="font-size:9pt;text-decoration:underline">[서식8-1] (진술에 동의했을 시) 진술의 녹음·녹취 동의</p>';
    s += '<h1 style="text-align:center;font-size:16pt;font-weight:bold;margin:15px 0 25px;text-decoration:underline">진술의 녹음·녹취 동의서</h1>';
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:20px">';
    s += pdfInfoRow('성    명', info.name);
    s += pdfInfoRow('소    속', info.org);
    s += pdfInfoRow('직    위', info.position);
    s += pdfInfoRow('생년월일', info.birthdate);
    s += pdfInfoRow('연 락 처', info.contact);
    s += pdfInfoRow('진술사례', '노인학대 의심건');
    s += '</table>';
    s += '<div style="border:1px solid #888;padding:20px;margin:20px 0;text-align:center;font-size:10.5pt;line-height:2.2">';
    s += '<p>위 건에 관하여       ' + esc(orgName) + '에서 진행되는</p>';
    s += '<p>조사에 있어서 본인의 진술에 대한 녹음·녹취에 동의합니다.</p>';
    s += '</div>';
    s += '<p style="text-align:center;margin-top:40px">' + pdfDateStr() + '</p>';
    s += pdfSignBlock(sigUrl, info.name);
    s += '</div>';
    return s;
}

// [서식8-2] 녹음·녹취 거부확인서 PDF
function buildRecordingRefusalPdfHtml(info, sigUrl) {
    var orgName = info.org || '          ';
    var s = '<div style="' + pdfFont() + ';font-size:10.5pt;line-height:1.8;color:#000">';
    s += '<p style="font-size:9pt;text-decoration:underline">[서식8-2] (진술은 동의했으나 녹음·녹취 거부 시) 진술의 녹음·녹취 거부확인서</p>';
    s += '<h1 style="text-align:center;font-size:16pt;font-weight:bold;margin:15px 0 25px;text-decoration:underline">진술의 녹음·녹취 거부확인서</h1>';
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:20px">';
    s += pdfInfoRow('성    명', info.name);
    s += pdfInfoRow('소    속', info.org);
    s += pdfInfoRow('직    위', info.position);
    s += pdfInfoRow('생년월일', info.birthdate);
    s += pdfInfoRow('연 락 처', info.contact);
    s += '</table>';
    s += '<p style="margin:20px 0">  상기 본인은       ' + esc(orgName) + '에서 발생한 노인학대 의심건에 관해 관계인으로 진술함에 있어 아래와 같이 확인합니다.</p>';
    s += '<p style="margin:15px 0">1. 본인은 진술과 관련하여 진술 관련 권리 및 의무에 관해 고지 받았으나 녹음·녹취되기를 원하지 않습니다.</p>';
    s += '<p style="margin:15px 0">2. 본 녹음·녹취 거부 확인서는 본인 스스로의 의사에 따라 작성한 것임을 확인합니다.</p>';
    s += '<p style="text-align:center;margin-top:40px">' + pdfDateStr() + '</p>';
    s += pdfSignBlock(sigUrl, info.name);
    s += '</div>';
    return s;
}

// 개인정보 수집 및 이용 동의서 PDF
function buildPrivacyConsentPdfHtml(info, sigUrl) {
    var s = '<div style="' + pdfFont() + ';font-size:10pt;line-height:1.7;color:#000">';
    s += '<h1 style="text-align:center;font-size:15pt;font-weight:bold;margin:0 0 15px;text-decoration:underline">개인정보 수집 및 이용 동의서</h1>';
    s += '<table style="width:100%;border-collapse:collapse;margin-bottom:10px"><tr>';
    s += '<td style="border:1px solid #888;padding:5px 8px;width:50%">□ 동의자 성명 : ' + esc(info.name || '') + '</td>';
    s += '<td style="border:1px solid #888;padding:5px 8px;width:50%">□ 생년월일 : ' + esc(info.birthdate || '') + '</td>';
    s += '</tr></table>';
    s += '<p style="font-size:9.5pt;margin:8px 0">본 경기북서부노인보호전문기관은 노인복지법 제39조의5제2항에 의한 업무를 처리함에 있어 원활한 상담, 각종 서비스 등 기본적인 서비스 제공을 위하여 아래와 같은 개인정보를 수집하고 있으며 수집된 개인정보는 개인정보 보호법에 명기된 관련 법률상의 개인정보보호 규정을 준수하며, 관련법령에 의거하여 학대피해노인의 인권보호에 최선을 다하고 있습니다.</p>';
    s += '<p style="font-weight:bold;margin:10px 0 3px">□ 개인정보 수집 항목</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 인적사항 : 성명, 성별, 생년월일, 주소, 연락처, 연령, 동거인, 직업상태, 결혼상태, 교육수준, 생활상태, 건강상태, 일상생활수행정도, 기타 사항 등 노인학대 사례관리에 명기된 항목</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 관련사항 : 노인학대 관련 상담일지, 기타 관련 자료</p>';
    s += '<p style="font-weight:bold;margin:10px 0 3px">□ 개인정보 수집 및 이용 목적</p>';
    s += '<p style="font-size:9pt;margin:2px 0">귀하의 소중한 개인정보를 아래와 같은 목적으로 수집 및 이용합니다.</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 노인복지법 제39조의5에 관한 법령을 수행하기 위한 모든 사항</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 노인학대 발생 여부 판단에 대한 근거</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 노인학대 해결을 위한 논의자료 및 기관에 권고하는 자료</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 노인학대 결과 및 관련 내용을 관할기관(보건복지부·시·도, 중앙노인보호전문기관)에 보고하는 자료</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 국가 노인학대예방사업에 대한 통계</p>';
    s += '<p style="font-weight:bold;margin:10px 0 3px">□ 개인정보 보유 및 이용기간</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 상기 내용은 개인정보 보호법을 기준으로 합니다.</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 상기 개인정보의 이용목적이 소멸된 경우에도 노인학대 관련 정보의 이용목적이 분명한 경우는 개인정보를 보유할 수 있음을 안내하여 드립니다.</p>';
    s += '<p style="font-weight:bold;margin:10px 0 3px">□ 서비스 이용 동의</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 본인은 노인보호전문기관의 서비스 이용에 동의합니다. □</p>';
    s += '<p style="font-weight:bold;margin:5px 0 3px">□ 서비스 연계 동의</p>';
    s += '<p style="font-size:9pt;margin:2px 0">○ 본인은 위 동의에 따른 본인의 개인정보를 관련 정보통신망 등을 통하여 대상기관에 제공함에 동의합니다. □</p>';
    s += '<p style="font-size:8.5pt;margin:10px 0 2px;color:#333">※ 상기 내용은 본 기관에서 노인학대 상담 및 서비스 연계 등에 필요한 기본 정보에 해당합니다.</p>';
    s += '<p style="font-size:8.5pt;margin:2px 0;color:#333">※ 상기 내용에 대하여 귀하는 동의를 거부하실 권리가 있습니다. 다만 그러한 경우에 원활한 지원이 어려울 수 있음을 알려드립니다.</p>';
    s += '<p style="font-size:8.5pt;margin:2px 0;color:#333">※ 아울러 본 동의서는 노인학대 관련 사업 진행 및 서비스 연계의 목적 외에는 사용하지 않을 것을 약속드리며 철저히 비밀로 관리하여 타인에게 공개하거나 유출하지 않을 것임을 알려드립니다.</p>';
    s += '<p style="margin:12px 0;font-size:10pt">본인은 위 내용을 확인하였으며, 위와 같이 "개인정보 보호법"에 명기된 관련 법률에 의거하여 개인정보 수집 및 이용에 동의합니다.</p>';
    s += '<p style="text-align:right;margin-top:20px">' + pdfDateStr() + '</p>';
    s += '<div style="margin-top:15px;font-size:10pt">';
    s += '<span>동의인 :  ' + esc(info.name || '') + '  </span>';
    if (sigUrl) s += '<img src="' + sigUrl + '" style="height:40px;vertical-align:middle">';
    else s += '(서명)';
    s += '<span>        학대피해노인과의 관계 :            </span>';
    s += '</div>';
    s += '<p style="margin-top:15px;font-size:8.5pt">※ 대리인이 서명할 경우, 사유 기재 _______________</p>';
    s += '</div>';
    return s;
}
