// ===== 상담일지 자동작성 (v2) =====
var audioFile = null;
var audioFileName = '';
var currentTranscript = '';
var currentDurationSeconds = 0;
var isProcessing = false;

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== 오디오 → MP3 변환 (lamejs) =====
function convertToMp3(file) {
    return new Promise(function(resolve, reject) {
        var ext = file.name.split('.').pop().toLowerCase();
        // mp3/wav는 변환 불필요
        if (ext === 'mp3' || ext === 'wav') {
            resolve(file);
            return;
        }

        updateProgressText('transcribeProgressText', '오디오 파일을 변환 중...');

        var reader = new FileReader();
        reader.onload = function(e) {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(e.target.result).then(function(audioBuffer) {
                // 모노 16kHz로 다운샘플링
                var sampleRate = 16000;
                var channels = 1;
                var samples = downsampleBuffer(audioBuffer, sampleRate);

                // lamejs로 MP3 인코딩
                var mp3enc = new lamejs.Mp3Encoder(channels, sampleRate, 64);
                var mp3Data = [];
                var blockSize = 1152;
                var int16 = floatTo16BitPCM(samples);

                for (var i = 0; i < int16.length; i += blockSize) {
                    var chunk = int16.subarray(i, i + blockSize);
                    var mp3buf = mp3enc.encodeBuffer(chunk);
                    if (mp3buf.length > 0) mp3Data.push(mp3buf);
                }
                var end = mp3enc.flush();
                if (end.length > 0) mp3Data.push(end);

                var blob = new Blob(mp3Data, { type: 'audio/mpeg' });
                var newName = file.name.replace(/\.[^.]+$/, '.mp3');
                var mp3File = new File([blob], newName, { type: 'audio/mpeg' });
                audioCtx.close();
                resolve(mp3File);
            }).catch(function(err) {
                audioCtx.close();
                reject(new Error('오디오 디코딩 실패: ' + err.message));
            });
        };
        reader.onerror = function() { reject(new Error('파일 읽기 실패')); };
        reader.readAsArrayBuffer(file);
    });
}

function downsampleBuffer(audioBuffer, targetRate) {
    var channel = audioBuffer.getChannelData(0);
    var srcRate = audioBuffer.sampleRate;
    if (srcRate === targetRate) return channel;
    var ratio = srcRate / targetRate;
    var newLength = Math.round(channel.length / ratio);
    var result = new Float32Array(newLength);
    for (var i = 0; i < newLength; i++) {
        var idx = Math.round(i * ratio);
        result[i] = channel[Math.min(idx, channel.length - 1)];
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

    loadUsage();

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

// ===== 사용량 표시 =====
function loadUsage() {
    authFetch('/api/counsel-log/usage').then(function(r) { return r.json(); }).then(function(data) {
        if (data.unlimited) {
            var el = document.getElementById('usageRemaining');
            if (el) el.textContent = '무제한 (관리자)';
            var bar = document.getElementById('usageProgress');
            if (bar) { bar.style.width = '0%'; bar.style.background = '#16a34a'; }
        } else if (data.limitSeconds) {
            updateUsageUI(data.remainingSeconds, data.limitSeconds);
        }
    }).catch(function() {});
}

function updateUsageUI(remainingSeconds, limitSeconds) {
    var remainMin = Math.floor(remainingSeconds / 60);
    var limitMin = Math.floor(limitSeconds / 60);
    var usedPercent = Math.round(((limitSeconds - remainingSeconds) / limitSeconds) * 100);
    var el = document.getElementById('usageRemaining');
    if (el) el.textContent = remainMin + '분 / ' + limitMin + '분';
    var bar = document.getElementById('usageProgress');
    if (bar) {
        bar.style.width = usedPercent + '%';
        if (usedPercent >= 90) bar.style.background = '#ef4444';
        else if (usedPercent >= 70) bar.style.background = '#f59e0b';
        else bar.style.background = '';
    }
}

// ===== 파일 처리 (FormData 방식 — base64 변환 불필요) =====
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
    document.getElementById('transcribeBtn').classList.remove('hidden');
}

function clearFile() {
    if (isProcessing) return;
    audioFile = null;
    audioFileName = '';
    document.getElementById('audioInput').value = '';
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('transcribeBtn').classList.add('hidden');
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

// ===== STEP 1: 오디오 → 상담일지 직접 생성 (GPT-4o-audio-preview) =====
function startTranscribe() {
    if (!audioFile) { alert('파일을 선택해주세요'); return; }
    if (isProcessing) return;
    isProcessing = true;

    setStep(1, 'processing');
    document.getElementById('transcribeBtn').classList.add('hidden');
    document.getElementById('transcribeProgress').classList.remove('hidden');
    updateProgressText('transcribeProgressText', '오디오 파일 준비 중...');

    // 모든 포맷을 MP3로 변환 후 전송
    convertToMp3(audioFile).then(function(convertedFile) {
        updateProgressText('transcribeProgressText', 'AI가 녹음을 직접 듣고 상담일지를 작성 중...');
        sendToGenerateDirect(convertedFile);
    }).catch(function(err) {
        // 변환 실패 시 Whisper 폴백
        console.warn('MP3 변환 실패, Whisper 폴백:', err.message);
        startTranscribeFallback();
    });
}

function sendToGenerateDirect(file) {
    var fd = new FormData();
    fd.append('audio', file);
    fd.append('fileName', file.name);

    // GPT-4o-audio-preview 직접 생성 시도
    authFetch('/api/counsel-log/generate-direct', {
        method: 'POST',
        body: fd,
        timeout: 10 * 60 * 1000
    }).then(function(response) {
        if (!response.ok) {
            return response.json().then(function(d) {
                // 20MB 초과 등으로 폴백 필요
                if (d.fallback) {
                    startTranscribeFallback();
                    return null;
                }
                throw new Error(d.message || '상담일지 생성 실패');
            });
        }

        var contentType = response.headers.get('Content-Type') || '';
        if (contentType.indexOf('text/event-stream') < 0) {
            throw new Error('서버 응답 형식 오류');
        }

        // SSE 스트리밍 — 바로 결과 표시
        document.getElementById('transcribeProgress').classList.add('hidden');
        setStep(1, 'done');
        setStep(2, 'done');
        setStep(3, 'active');
        document.getElementById('step3Content').classList.remove('hidden');
        document.getElementById('resultBox').innerHTML = '';
        document.getElementById('resultBox').setAttribute('data-plain', '');
        document.getElementById('streamingIndicator').classList.remove('hidden');

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var fullText = '';
        var buffer = '';

        function readChunk() {
            reader.read().then(function(result) {
                if (result.done) { finishStreaming(fullText); return; }
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.indexOf('data: ') === 0) {
                        try {
                            var parsed = JSON.parse(line.substring(6));
                            if (parsed.error) { finishStreaming(fullText || ''); alert('오류: ' + parsed.error); return; }
                            if (parsed.done) { finishStreaming(fullText); return; }
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
            }).catch(function() { finishStreaming(fullText || ''); });
        }
        readChunk();
    }).catch(function(err) {
        document.getElementById('transcribeProgress').classList.add('hidden');
        document.getElementById('transcribeBtn').classList.remove('hidden');
        alert('상담일지 생성 오류: ' + (err && err.message ? err.message : '알 수 없는 오류'));
        isProcessing = false;
        setStep(1, 'active');
    });
}

// 폴백: 기존 Whisper → 요약 방식
function startTranscribeFallback() {
    updateProgressText('transcribeProgressText', '파일이 커서 기존 방식으로 처리 중...');

    var fd = new FormData();
    fd.append('audio', audioFile);
    fd.append('fileName', audioFileName);

    authFetch('/api/counsel-log/transcribe', {
        method: 'POST',
        body: fd,
        timeout: 10 * 60 * 1000
    }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || '음성 인식 실패'); });
        return r.json();
    }).then(function(data) {
        document.getElementById('transcribeProgress').classList.add('hidden');
        document.getElementById('transcriptText').value = data.text || '';
        currentTranscript = data.text || '';
        currentDurationSeconds = data.durationSeconds || 0;
        setStep(1, 'done');
        setStep(2, 'done');
        if (data.remainingSeconds !== undefined && data.limitSeconds) {
            updateUsageUI(data.remainingSeconds, data.limitSeconds);
        }
        isProcessing = false;
        startSummarize();
    }).catch(function(err) {
        document.getElementById('transcribeProgress').classList.add('hidden');
        document.getElementById('transcribeBtn').classList.remove('hidden');
        alert('음성 인식 오류: ' + err.message);
        isProcessing = false;
        setStep(1, 'active');
    });
}

function updateProgressText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ===== STEP 2: 상담일지 생성 (SSE 스트리밍) =====
function startSummarize() {
    var transcript = document.getElementById('transcriptText').value.trim();
    if (!transcript) { alert('녹취록 텍스트가 없습니다'); return; }
    if (transcript.length < 30) { alert('녹취록 내용이 너무 짧습니다 (최소 30자)'); return; }
    if (isProcessing) return;
    isProcessing = true;

    currentTranscript = transcript;
    setStep(2, 'processing');
    // step2Visual 프로그레스 표시
    var step2vp = document.getElementById('step2VisualProgress');
    if (step2vp) step2vp.classList.remove('hidden');
    updateProgressText('summarizeProgressText', 'AI가 상담일지를 작성 중...');

    // SSE 스트리밍 시도
    authFetch('/api/counsel-log/summarize', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ transcript: transcript }),
        timeout: 10 * 60 * 1000
    }).then(function(response) {
        var contentType = response.headers.get('Content-Type') || '';

        if (contentType.indexOf('text/event-stream') >= 0) {
            // SSE 스트리밍
            var step2vp2 = document.getElementById('step2VisualProgress');
            if (step2vp2) step2vp2.classList.add('hidden');
            setStep(2, 'done');
            setStep(3, 'active');
            document.getElementById('step3Content').classList.remove('hidden');
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
                        finishStreaming(fullText);
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
                                    finishStreaming(fullText || '');
                                    alert('스트리밍 오류: ' + parsed.error);
                                    return;
                                }
                                if (parsed.done) {
                                    finishStreaming(fullText);
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
                    finishStreaming(fullText || '');
                });
            }
            readChunk();
        } else {
            // 일반 JSON 응답 (폴백)
            if (!response.ok) return response.json().then(function(d) { throw new Error(d.message || '요약 생성 실패'); });
            return response.json().then(function(data) {
                var step2vp3 = document.getElementById('step2VisualProgress');
                if (step2vp3) step2vp3.classList.add('hidden');
                displayResult(data.result);
                isProcessing = false;
                setStep(2, 'done');
                setStep(3, 'active');
                document.getElementById('step3Content').classList.remove('hidden');
            });
        }
    }).catch(function(err) {
        var step2vp4 = document.getElementById('step2VisualProgress');
        if (step2vp4) step2vp4.classList.add('hidden');
        document.getElementById('streamingIndicator').classList.add('hidden');
        alert('상담일지 생성 오류: ' + err.message);
        isProcessing = false;
        setStep(1, 'active');
        setStep(2, 'pending');
    });
}

function finishStreaming(text) {
    document.getElementById('streamingIndicator').classList.add('hidden');
    isProcessing = false;
    if (text) displayResult(text);
}

// ===== 결과 표시 =====
function displayResult(text) {
    var html = esc(text)
        .replace(/^(━+)$/gm, '<span class="text-rose-400">$1</span>')
        .replace(/^(■\s*.+)$/gm, '<strong class="text-rose-700">$1</strong>')
        .replace(/^(노인보호전문기관 상담일지)$/gm, '<strong class="text-lg text-rose-800">$1</strong>')
        .replace(/('.*?')/g, '<span class="text-blue-700 font-semibold">$1</span>');
    document.getElementById('resultBox').innerHTML = html;
    document.getElementById('resultBox').setAttribute('data-plain', text);
}

// ===== 클립보드 복사 =====
function copyResult() {
    var text = document.getElementById('resultBox').getAttribute('data-plain') || '';
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
    try { document.execCommand('copy'); showCopyFeedback(); } catch(e) { alert('복사에 실패했습니다. 텍스트를 직접 선택하여 복사해주세요.'); }
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

// ===== 다운로드 (PC에 텍스트 파일로 저장) =====
function saveResult() {
    var summary = document.getElementById('resultBox').getAttribute('data-plain') || '';
    if (!summary) { alert('다운로드할 내용이 없습니다'); return; }

    var now = new Date();
    var dateStr = now.getFullYear() +
        ('0' + (now.getMonth() + 1)).slice(-2) +
        ('0' + now.getDate()).slice(-2) + '_' +
        ('0' + now.getHours()).slice(-2) +
        ('0' + now.getMinutes()).slice(-2);
    var fileName = '상담일지_' + dateStr + '.txt';

    var blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    var btn = document.getElementById('saveBtn');
    if (btn) {
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check mr-1"></i>다운로드 완료!';
        btn.disabled = true;
        setTimeout(function() { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    }
}


// ===== 단계 UI 관리 =====
function setStep(num, state) {
    var card = document.getElementById('step' + num);
    if (card) card.className = 'step-card step-' + (state === 'processing' ? 'active' : state);
    // step2Visual 동기화
    if (num === 2) {
        var visual = document.getElementById('step2Visual');
        if (visual) visual.className = 'step-card step-' + (state === 'processing' ? 'active' : state);
        var vNum = document.getElementById('step2VisualNum');
        if (vNum) {
            if (state === 'active' || state === 'processing') { vNum.style.background = '#e11d48'; vNum.style.color = 'white'; }
            else if (state === 'done') { vNum.style.background = '#16a34a'; vNum.style.color = 'white'; }
            else { vNum.style.background = '#e5e7eb'; vNum.style.color = '#9ca3af'; }
        }
    }
}

// ===== 직접 입력 모드 =====
function toggleDirectInput() {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('directInputArea').classList.remove('hidden');
    document.getElementById('directInputToggle').classList.add('hidden');
    document.getElementById('directTranscriptText').value = '';
    document.getElementById('directTranscriptText').focus();
}

function cancelDirectInput() {
    document.getElementById('step1').style.display = '';
    document.getElementById('directInputArea').classList.add('hidden');
    document.getElementById('directInputToggle').classList.remove('hidden');
}

function startDirectSummarize() {
    var text = document.getElementById('directTranscriptText').value.trim();
    if (!text) { alert('녹취록 텍스트를 입력해주세요'); return; }
    if (text.length < 30) { alert('녹취록 내용이 너무 짧습니다 (최소 30자)'); return; }
    // 숨겨진 transcriptText에 복사 후 startSummarize 호출
    document.getElementById('transcriptText').value = text;
    document.getElementById('directInputArea').classList.add('hidden');
    document.getElementById('directInputToggle').classList.add('hidden');
    setStep(1, 'done');
    startSummarize();
}

// ===== 초기화 =====
function clearTranscript() {
    document.getElementById('transcriptText').value = '';
}

function resetAll() {
    clearFile();
    audioFile = null;
    currentTranscript = '';
    currentDurationSeconds = 0;
    audioFileName = '';
    isProcessing = false;
    document.getElementById('transcriptText').value = '';
    document.getElementById('step3Content').classList.add('hidden');
    document.getElementById('transcribeProgress').classList.add('hidden');
    var step2vp5 = document.getElementById('step2VisualProgress');
    if (step2vp5) step2vp5.classList.add('hidden');
    document.getElementById('streamingIndicator').classList.add('hidden');
    document.getElementById('resultBox').innerHTML = '';
    document.getElementById('resultBox').setAttribute('data-plain', '');
    // 직접 입력 영역 초기화
    document.getElementById('step1').style.display = '';
    document.getElementById('directInputArea').classList.add('hidden');
    document.getElementById('directInputToggle').classList.remove('hidden');
    setStep(1, 'active');
    setStep(2, 'pending');
    setStep(3, 'pending');
}
