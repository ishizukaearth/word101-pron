const WORD_FILES = [
  "JH101_001.txt",
  "JH101_101.txt",
  "JH101_201.txt",
  "JH101_301.txt",
  "JH101_401.txt",
  "JH101_501.txt",
  "JH101_601.txt",
  "JH101_701.txt",
  "JH101_801.txt",
  "JH101_901.txt",
  "JH101_1001.txt",
  "JH101_1101.txt",
  "JH101_1201.txt",
  "JH101_1301.txt",
];

const STORAGE_KEY = "jh101-last-word-file";
const X1_STORAGE_KEY = "jh101-rms-threshold-x1-v2";
const X2_STORAGE_KEY = "jh101-silence-seconds-x2";
const X3_STORAGE_KEY = "jh101-preroll-ms-x3";

const state = {
  words: [],
  wordFileName: "",
  index: -1,
  view: "practice",
  micStream: null,
  mediaRecorder: null,
  recordingChunks: [],
  recordedBlob: null,
  rawRecordedBlob: null,
  rawRecordedWavBlob: null,
  recordedUrl: null,
  rawRecordedUrl: null,
  rawRecordedWavUrl: null,
  modelBlob: null,
  rawModelBlob: null,
  rawModelWavBlob: null,
  modelUrl: null,
  rawModelUrl: null,
  rawModelWavUrl: null,
  modelDurationMs: 0,
  modelAnalysis: null,
  userAnalysis: null,
  modelTrim: null,
  userTrim: null,
  attempts: new Map(),
  diagnostics: [],
  audioContext: null,
  vad: null,
  isRecording: false,
  lastAnalysisStage: "",
  recordingStartedAt: 0,
  x1Threshold: readStoredNumber(X1_STORAGE_KEY, 0.001),
  x2SilenceSeconds: readStoredNumber(X2_STORAGE_KEY, 0.2),
  x3PrerollMs: readStoredNumber(X3_STORAGE_KEY, 0),
  lastMetrics: null,
};

const els = {
  practiceView: document.querySelector("#practiceView"),
  reviewView: document.querySelector("#reviewView"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  wordNumber: document.querySelector("#wordNumber"),
  wordText: document.querySelector("#wordText"),
  meaningText: document.querySelector("#meaningText"),
  aeChip: document.querySelector("#aeChip"),
  thChip: document.querySelector("#thChip"),
  rChip: document.querySelector("#rChip"),
  x1Value: document.querySelector("#x1Value"),
  x2Value: document.querySelector("#x2Value"),
  x3Value: document.querySelector("#x3Value"),
  x1DownButton: document.querySelector("#x1DownButton"),
  x1UpButton: document.querySelector("#x1UpButton"),
  x2DownButton: document.querySelector("#x2DownButton"),
  x2UpButton: document.querySelector("#x2UpButton"),
  x3DownButton: document.querySelector("#x3DownButton"),
  x3UpButton: document.querySelector("#x3UpButton"),
  nextWordButton: document.querySelector("#nextWordButton"),
  reviewButton: document.querySelector("#reviewButton"),
  exportDataButton: document.querySelector("#exportDataButton"),
  exportDiagnosticsButton: document.querySelector("#exportDiagnosticsButton"),
  reviewList: document.querySelector("#reviewList"),
  speakButton: document.querySelector("#speakButton"),
  recordButton: document.querySelector("#recordButton"),
  playMineButton: document.querySelector("#playMineButton"),
  modelCanvas: document.querySelector("#modelCanvas"),
  userCanvas: document.querySelector("#userCanvas"),
  modelSpectrumCanvas: document.querySelector("#modelSpectrumCanvas"),
  spectrumCanvas: document.querySelector("#spectrumCanvas"),
  recordingStatus: document.querySelector("#recordingStatus"),
  modelDurationText: document.querySelector("#modelDurationText"),
  userDurationText: document.querySelector("#userDurationText"),
  modelTrimText: document.querySelector("#modelTrimText"),
  userTrimText: document.querySelector("#userTrimText"),
  modelRawPlayer: document.querySelector("#modelRawPlayer"),
  userRawPlayer: document.querySelector("#userRawPlayer"),
  analysisLatency: document.querySelector("#analysisLatency"),
  overallScore: document.querySelector("#overallScore"),
  vowelScore: document.querySelector("#vowelScore"),
  focusScore: document.querySelector("#focusScore"),
  vowelFeature: document.querySelector("#vowelFeature"),
  rFeature: document.querySelector("#rFeature"),
  thFeature: document.querySelector("#thFeature"),
  modelVowelFeature: document.querySelector("#modelVowelFeature"),
  modelRFeature: document.querySelector("#modelRFeature"),
  modelThFeature: document.querySelector("#modelThFeature"),
  modelFormants: document.querySelector("#modelFormants"),
  formantMatch: document.querySelector("#formantMatch"),
  fileInput: document.querySelector("#fileInput"),
  wordListDetails: document.querySelector("#wordListDetails"),
  hostedWordSelect: document.querySelector("#hostedWordSelect"),
  loadHostedButton: document.querySelector("#loadHostedButton"),
  wordPaste: document.querySelector("#wordPaste"),
  loadPasteButton: document.querySelector("#loadPasteButton"),
};

setupWordFileOptions();
render();
bootstrap();

els.nextWordButton.addEventListener("click", nextPractice);
els.reviewButton.addEventListener("click", showReview);
els.exportDataButton.addEventListener("click", exportSoundData);
els.exportDiagnosticsButton.addEventListener("click", exportDiagnostics);
els.x1DownButton.addEventListener("click", () => adjustX1(-0.001));
els.x1UpButton.addEventListener("click", () => adjustX1(0.001));
els.x2DownButton.addEventListener("click", () => adjustX2(-0.05));
els.x2UpButton.addEventListener("click", () => adjustX2(0.05));
els.x3DownButton.addEventListener("click", () => adjustX3(-50));
els.x3UpButton.addEventListener("click", () => adjustX3(50));
els.speakButton.addEventListener("click", playModelAudio);
els.recordButton.addEventListener("click", retryRecording);
els.playMineButton.addEventListener("click", playRecording);
els.fileInput.addEventListener("change", loadSelectedFile);
els.loadHostedButton.addEventListener("click", loadHostedWords);
els.loadPasteButton.addEventListener("click", loadPastedWords);

async function bootstrap() {
  await requestMicrophoneAccess();
  const lastFile = localStorage.getItem(STORAGE_KEY);
  if (lastFile && WORD_FILES.includes(lastFile)) {
    els.hostedWordSelect.value = lastFile;
    await loadHostedWords();
  } else {
    setStatus("単語データを選択してください");
    els.wordListDetails.open = true;
  }
}

function setupWordFileOptions() {
  els.hostedWordSelect.innerHTML = WORD_FILES
    .map((file) => `<option value="${file}">${file}</option>`)
    .join("");
}

function parseWordText(text) {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const lineItems = normalizedText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseWordLine)
    .filter((item) => item.displaySpelling);

  if (lineItems.length > 1) return lineItems;

  const tokens = normalizedText
    .split("#")
    .map((field) => field.trim());
  if (tokens.at(-1) === "") tokens.pop();
  if (tokens.length >= 12 && tokens.length % 6 === 0) {
    const chunked = [];
    for (let index = 0; index < tokens.length; index += 6) {
      chunked.push(parseWordFields(tokens.slice(index, index + 6), chunked.length));
    }
    return chunked.filter((item) => item.displaySpelling);
  }

  return lineItems;
}

function parseWordLine(line, lineIndex) {
  const fields = line.split("#");
  if (fields.at(-1) === "") fields.pop();
  return parseWordFields(fields, lineIndex);
}

function parseWordFields(fields, lineIndex) {
  let id;
  let displaySpelling;
  let spokenSpelling;
  let displayMeaning;
  let spokenMeaning;
  let phonetic;

  if (fields.length >= 6) {
    [id, displaySpelling, spokenSpelling, displayMeaning, spokenMeaning, phonetic] = fields;
  } else {
    [id, displaySpelling, displayMeaning] = fields;
    spokenSpelling = displaySpelling;
    spokenMeaning = displayMeaning;
    phonetic = "0";
  }

  id = (id || String(lineIndex + 1)).trim();
  displaySpelling = (displaySpelling || "").trim();
  spokenSpelling = (spokenSpelling || displaySpelling).trim();
  displayMeaning = (displayMeaning || "").trim();
  spokenMeaning = (spokenMeaning || displayMeaning).trim();
  phonetic = (phonetic || "0").trim();
  return {
    id,
    displaySpelling,
    spokenSpelling,
    displayMeaning,
    spokenMeaning,
    phonetic,
  };
}

function render() {
  const word = currentWord();
  const currentNumber = state.index < 0 ? 0 : state.index + 1;
  els.progressText.textContent = `${currentNumber} / ${state.words.length}${state.wordFileName ? ` ${state.wordFileName}` : ""}`;
  els.progressBar.max = Math.max(1, state.words.length);
  els.progressBar.value = currentNumber;
  els.wordNumber.textContent = word?.id || "---";
  els.wordText.textContent = word ? word.displaySpelling : "";
  els.meaningText.textContent = word
    ? (word.displayMeaning || "意味なし")
    : state.words.length
      ? "▶で最初の単語を開始"
      : "単語リストを選択してください";
  els.nextWordButton.disabled = state.isRecording || !state.words.length || state.index === state.words.length - 1;
  els.reviewButton.disabled = state.isRecording || !state.attempts.size;
  els.exportDiagnosticsButton.disabled = !state.diagnostics.length;
  els.speakButton.disabled = state.isRecording || state.index < 0;
  els.recordButton.disabled = state.index < 0;
  els.playMineButton.disabled = state.isRecording || !state.recordedUrl;
  updateNextButtonLight();

  const focus = word ? getFocusSounds(word) : { ae: false, th: false, r: false };
  setChip(els.aeChip, focus.ae);
  setChip(els.thChip, focus.th);
  setChip(els.rChip, focus.r);
  renderSettings();

  if (!word) {
    clearCanvas(els.modelCanvas, "▶で開始します");
    clearCanvas(els.modelSpectrumCanvas, "モデル音声のスペクトログラム");
  } else if (!state.modelAnalysis) {
    clearCanvas(els.modelCanvas, "モデル音声を録音して表示します");
    clearCanvas(els.modelSpectrumCanvas, "モデル音声のスペクトログラム");
  }

  if (!state.recordedUrl) {
    clearCanvas(els.userCanvas, "録音するとここに波形が表示されます");
    clearCanvas(els.spectrumCanvas, "録音後にスペクトログラムを表示します");
    resetScores();
  }
}

function updateNextButtonLight() {
  const canMoveNext = !state.isRecording
    && Boolean(state.recordedUrl)
    && state.index >= 0
    && state.index < state.words.length - 1;
  els.nextWordButton.classList.toggle("recording", state.isRecording);
  els.nextWordButton.classList.toggle("next-ready", canMoveNext);
}

function currentWord() {
  return state.index >= 0 ? state.words[state.index] : null;
}

function setChip(element, active) {
  element.classList.toggle("active", active);
}

function nextPractice() {
  if (state.isRecording) return;
  if (state.index >= state.words.length - 1) return;
  state.index += 1;
  clearCurrentAudio({ revokeSaved: false });
  render();
  speakCurrentWord({ recordAfter: true });
}

function retryRecording() {
  if (state.index < 0) return;
  startRecording({ autoStop: true, source: "manual" });
}

function adjustX1(delta) {
  state.x1Threshold = clamp(Number((state.x1Threshold + delta).toFixed(3)), 0.001, 0.2);
  localStorage.setItem(X1_STORAGE_KEY, String(state.x1Threshold));
  renderSettings();
}

function adjustX2(delta) {
  state.x2SilenceSeconds = clamp(Number((state.x2SilenceSeconds + delta).toFixed(2)), 0.05, 2);
  localStorage.setItem(X2_STORAGE_KEY, String(state.x2SilenceSeconds));
  renderSettings();
}

function adjustX3(delta) {
  state.x3PrerollMs = clamp(state.x3PrerollMs + delta, 0, 500);
  localStorage.setItem(X3_STORAGE_KEY, String(state.x3PrerollMs));
  renderSettings();
}

function renderSettings() {
  els.x1Value.textContent = state.x1Threshold.toFixed(3);
  els.x2Value.textContent = `${state.x2SilenceSeconds.toFixed(2)}秒`;
  els.x3Value.textContent = `${state.x3PrerollMs} ms`;
}

function playModelAudio() {
  if (state.modelUrl) {
    const audio = new Audio(state.modelUrl);
    audio.volume = 1;
    audio.play();
    return;
  }
  speakCurrentWord({ recordAfter: false });
}

async function speakCurrentWord({ recordAfter }) {
  const current = currentWord();
  if (!current || !("speechSynthesis" in window)) {
    setStatus("このブラウザは読み上げに対応していません");
    return;
  }

  const modelCapturePromise = recordAfter
    ? startModelCapture().catch((error) => {
      setStatus(`モデル録音なしで再生します: ${error.message}`);
      return null;
    })
    : Promise.resolve(null);
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(current.spokenSpelling);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  utterance.pitch = 1;
  utterance.onstart = () => setStatus("モデル音声を再生中");
  utterance.onend = async () => {
    const modelCapture = await modelCapturePromise;
    if (modelCapture) {
      const rawModelBlob = await stopModelCapture(modelCapture);
      await analyzeRecording(rawModelBlob, "model");
    }
    if (recordAfter) {
      setStatus("0.1秒後に録音を開始します");
      window.setTimeout(() => startRecording({ autoStop: true, source: "model" }), 100);
    } else {
      setStatus("聞き比べできます");
    }
  };
  window.setTimeout(() => window.speechSynthesis.speak(utterance), recordAfter ? 200 : 0);
}

async function startModelCapture() {
  const stream = await ensureMicrophoneStream();
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start(100);
  return { recorder, chunks };
}

function stopModelCapture(capture) {
  return new Promise((resolve) => {
    capture.recorder.addEventListener("stop", () => {
      const type = capture.chunks[0]?.type || "audio/webm";
      resolve(new Blob(capture.chunks, { type }));
    }, { once: true });
    window.setTimeout(() => {
      if (capture.recorder.state === "recording") capture.recorder.stop();
    }, 80);
  });
}

async function startRecording({ autoStop, source }) {
  if (state.mediaRecorder?.state === "recording") {
    stopRecording();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("このブラウザは録音に対応していません");
    return;
  }

  try {
    clearUserAudio();
    const audioContext = getAudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    const stream = await ensureMicrophoneStream();
    const mimeType = pickMimeType();
    state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.recordingChunks = [];
    state.recordingStartedAt = performance.now();
    state.isRecording = true;

    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) state.recordingChunks.push(event.data);
    });

    state.mediaRecorder.addEventListener("stop", async () => {
      stopVad();
      const type = state.recordingChunks[0]?.type || "audio/webm";
      const rawBlob = new Blob(state.recordingChunks, { type });
      els.recordButton.textContent = "もう一度録音";
      els.recordButton.classList.remove("recording");
      els.playMineButton.classList.remove("recording");
      setStatus("録音完了");
      try {
        await analyzeRecording(rawBlob, "user");
        saveAttempt();
        setStatus("▶で次の単語を開始");
      } catch (error) {
        console.error(error);
        await recordAnalysisFailure(error, rawBlob, {
          type,
          chunkCount: state.recordingChunks.length,
          chunkSizes: state.recordingChunks.map((chunk) => chunk.size),
          elapsedMs: Math.round(performance.now() - state.recordingStartedAt),
        });
        clearUserAudio();
        setStatus("録音データを解析できませんでした。もう一度録音してください");
      } finally {
        state.isRecording = false;
        releaseMicrophoneStream();
        els.recordButton.textContent = "もう一度録音";
        els.recordButton.classList.remove("recording");
        els.playMineButton.classList.remove("recording");
        els.nextWordButton.disabled = !state.words.length || state.index === state.words.length - 1;
        els.speakButton.disabled = state.index < 0;
        els.reviewButton.disabled = !state.attempts.size;
        els.exportDiagnosticsButton.disabled = !state.diagnostics.length;
        els.playMineButton.disabled = !state.recordedUrl;
        updateNextButtonLight();
      }
    }, { once: true });

    state.mediaRecorder.start(100);
    els.recordButton.textContent = "録音停止";
    els.recordButton.classList.add("recording");
    els.nextWordButton.disabled = true;
    els.nextWordButton.classList.add("recording");
    els.nextWordButton.classList.remove("next-ready");
    els.speakButton.disabled = true;
    els.reviewButton.disabled = true;
    els.playMineButton.disabled = true;
    els.playMineButton.classList.add("recording");
    setStatus(source === "model" ? "復唱してください" : "録音中");
    if (autoStop) startVad(stream);
  } catch (error) {
    state.isRecording = false;
    els.recordButton.textContent = "もう一度録音";
    els.recordButton.classList.remove("recording");
    els.playMineButton.classList.remove("recording");
    setStatus("マイクの使用が許可されませんでした");
  }
}

async function requestMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("このブラウザは録音に対応していません");
    return;
  }
  try {
    await ensureMicrophoneStream();
    releaseMicrophoneStream();
    setStatus("マイク準備完了");
  } catch (error) {
    setStatus("マイク許可待ち");
  }
}

async function ensureMicrophoneStream() {
  if (state.micStream?.active) return state.micStream;
  state.micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  return state.micStream;
}

function releaseMicrophoneStream() {
  if (!state.micStream) return;
  state.micStream.getTracks().forEach((track) => track.stop());
  state.micStream = null;
}

function stopRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
}

function startVad(stream) {
  stopVad();
  const audioContext = getAudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const data = new Float32Array(analyser.fftSize);
  const threshold = state.x1Threshold;
  const silenceAfterSpeechMs = state.x2SilenceSeconds * 1000;
  const maxRecordingMs = 6000;
  const minSpeechMs = 120;
  let hasSpeech = false;
  let speechStartedAt = 0;
  let silentSince = 0;

  const tick = () => {
    if (state.mediaRecorder?.state !== "recording") return;
    analyser.getFloatTimeDomainData(data);
    const rms = getRms(data);
    const now = performance.now();
    const elapsed = now - state.recordingStartedAt;
    const isSpeech = rms >= threshold;

    if (isSpeech) {
      if (!hasSpeech) {
        hasSpeech = true;
        speechStartedAt = now;
        setStatus("発声を検出しました");
      }
      silentSince = 0;
    } else if (hasSpeech && !silentSince) {
      silentSince = now;
    }

    const speechLongEnough = hasSpeech && now - speechStartedAt >= minSpeechMs;
    const stopAfterTail = silentSince && now - silentSince >= silenceAfterSpeechMs * 2;

    if ((speechLongEnough && stopAfterTail) || elapsed >= maxRecordingMs) {
      stopRecording();
      return;
    }
    state.vad.frameId = requestAnimationFrame(tick);
  };

  state.vad = { frameId: requestAnimationFrame(tick), source, analyser };
}

function stopVad() {
  if (!state.vad) return;
  cancelAnimationFrame(state.vad.frameId);
  state.vad.source.disconnect();
  state.vad.analyser.disconnect();
  state.vad = null;
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported(type));
}

function playRecording() {
  if (!state.recordedUrl) return;
  const audio = new Audio(state.recordedUrl);
  audio.volume = 1;
  audio.play();
}

async function analyzeRecording(rawBlob, target) {
  const analysisStartedAt = performance.now();
  state.lastAnalysisStage = "blob.arrayBuffer";
  const buffer = await rawBlob.arrayBuffer();
  const audioContext = getAudioContext();
  state.lastAnalysisStage = "decodeAudioData";
  const rawAudioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
  state.lastAnalysisStage = target === "user" ? "trimUserSpeechBuffer" : "trimModelSpeechBuffer";
  const trimmed = target === "user" ? trimUserSpeechBuffer(rawAudioBuffer) : trimModelSpeechBuffer(rawAudioBuffer);
  const audioBuffer = trimmed.audioBuffer;
  state.lastAnalysisStage = "encode raw wav";
  const rawWavBlob = encodeWav(rawAudioBuffer);
  const samples = audioBuffer.getChannelData(0);
  state.lastAnalysisStage = "create rms envelope";
  const rmsEnvelope = createRmsEnvelope(samples, 160);
  const rmsEnvelope10ms = createRmsEnvelopeByWindow(samples, audioBuffer.sampleRate, 10);
  const envelope = normalize(rmsEnvelope);
  state.lastAnalysisStage = "analyze spectrum";
  const spectral = analyzeSpectrum(samples, audioBuffer.sampleRate);
  const analysis = { spectral, envelope, rmsEnvelope, rmsEnvelope10ms };

  if (target === "model") {
    state.lastAnalysisStage = "render model analysis";
    revokeUrl(state.modelUrl);
    revokeUrl(state.rawModelUrl);
    revokeUrl(state.rawModelWavUrl);
    state.rawModelBlob = rawBlob;
    state.rawModelUrl = URL.createObjectURL(rawBlob);
    state.rawModelWavBlob = rawWavBlob;
    state.rawModelWavUrl = URL.createObjectURL(rawWavBlob);
    state.modelTrim = trimmed;
    state.modelAnalysis = analysis;
    state.modelBlob = encodeWav(audioBuffer);
    state.modelUrl = URL.createObjectURL(state.modelBlob);
    state.modelDurationMs = Math.round(audioBuffer.duration * 1000);
    drawEnvelope(els.modelCanvas, envelope, "#157f7f");
    drawSpectrogram(els.modelSpectrumCanvas, spectral);
    els.modelDurationText.textContent = `${state.modelDurationMs} ms`;
    els.modelTrimText.textContent = formatTrimText(trimmed);
    els.modelRawPlayer.src = state.rawModelWavUrl;
  } else {
    state.lastAnalysisStage = "render user analysis";
    revokeUrl(state.rawRecordedUrl);
    revokeUrl(state.rawRecordedWavUrl);
    state.rawRecordedBlob = rawBlob;
    state.rawRecordedUrl = URL.createObjectURL(rawBlob);
    state.rawRecordedWavBlob = rawWavBlob;
    state.rawRecordedWavUrl = URL.createObjectURL(rawWavBlob);
    state.userTrim = trimmed;
    state.userAnalysis = analysis;
    state.recordedBlob = encodeWav(audioBuffer);
    revokeUrl(state.recordedUrl);
    state.recordedUrl = URL.createObjectURL(state.recordedBlob);
    els.playMineButton.disabled = false;
    drawEnvelope(els.userCanvas, envelope, "#bd5a2a");
    drawSpectrogram(els.spectrumCanvas, spectral);
    els.userDurationText.textContent = `${Math.round(audioBuffer.duration * 1000)} ms`;
    els.userTrimText.textContent = formatTrimText(trimmed);
    els.userRawPlayer.src = state.rawRecordedWavUrl;
    renderScores(performance.now() - analysisStartedAt);
  }
  state.lastAnalysisStage = "";
}

function formatTrimText(trimmed) {
  return `全体 ${trimmed.rawDurationMs} ms / 発話区間 ${trimmed.startMs}-${trimmed.endMs}`;
}

function renderScores(elapsedMs) {
  const vowelScore = getFormantMatchScore();
  const focusScore = getBandSimilarityScore();
  const overall = Math.round(vowelScore * 0.7 + focusScore * 0.3);
  els.overallScore.textContent = Number.isFinite(overall) ? overall : "--";
  els.vowelScore.textContent = Number.isFinite(vowelScore) ? Math.round(vowelScore) : "--";
  els.focusScore.textContent = Number.isFinite(focusScore) ? Math.round(focusScore) : "--";
  els.analysisLatency.textContent = `解析 ${Math.round(elapsedMs)}ms`;
  els.modelVowelFeature.textContent = Math.round(state.modelAnalysis.spectral.vowel * 100);
  els.modelRFeature.textContent = Math.round(state.modelAnalysis.spectral.rBand * 100);
  els.modelThFeature.textContent = Math.round(state.modelAnalysis.spectral.thBand * 100);
  els.modelFormants.textContent = getFormantText(state.modelAnalysis);
  els.vowelFeature.textContent = Math.round(state.userAnalysis.spectral.vowel * 100);
  els.rFeature.textContent = Math.round(state.userAnalysis.spectral.rBand * 100);
  els.thFeature.textContent = Math.round(state.userAnalysis.spectral.thBand * 100);
  els.formantMatch.textContent = getFormantMatchText();
  setStatus("録音評価完了");
}

function getFormantMatchScore() {
  if (!state.modelAnalysis || !state.userAnalysis) return NaN;
  const model = state.modelAnalysis.spectral.formants;
  const user = state.userAnalysis.spectral.formants;
  const f1Diff = Math.abs(model.f1 - user.f1);
  const f2Diff = Math.abs(model.f2 - user.f2);
  return clamp(100 - (f1Diff / 8 + f2Diff / 18), 0, 100);
}

function getBandSimilarityScore() {
  if (!state.modelAnalysis || !state.userAnalysis) return NaN;
  const model = state.modelAnalysis.spectral;
  const user = state.userAnalysis.spectral;
  const diff = Math.abs(model.vowel - user.vowel)
    + Math.abs(model.rBand - user.rBand)
    + Math.abs(model.thBand - user.thBand);
  return clamp(100 - diff * 120, 0, 100);
}

function getFormantMatchText() {
  if (!state.modelAnalysis || !state.userAnalysis) return "--";
  const score = getFormantMatchScore();
  return `${Math.round(score)} (${getFormantText(state.userAnalysis)})`;
}

function getFormantText(analysis) {
  if (!analysis?.spectral?.formants) return "--";
  const formants = analysis.spectral.formants;
  return `${formants.f1}/${formants.f2}`;
}

function saveAttempt() {
  if (state.index < 0 || !state.recordedUrl) return;
  const vowelScore = getFormantMatchScore();
  const focusScore = getBandSimilarityScore();
  const overall = Math.round(vowelScore * 0.7 + focusScore * 0.3);
  state.attempts.set(state.index, {
    overall,
    vowelScore: Math.round(vowelScore),
    focusScore: Math.round(focusScore),
    recordedUrl: state.recordedUrl,
    modelUrl: state.modelUrl,
    rawModelUrl: state.rawModelUrl,
    rawModelBlob: state.rawModelBlob,
    rawModelWavUrl: state.rawModelWavUrl,
    rawModelWavBlob: state.rawModelWavBlob,
    modelAnalysis: state.modelAnalysis,
    userAnalysis: state.userAnalysis,
    rawRecordedUrl: state.rawRecordedUrl,
    rawRecordedBlob: state.rawRecordedBlob,
    rawRecordedWavUrl: state.rawRecordedWavUrl,
    rawRecordedWavBlob: state.rawRecordedWavBlob,
    modelTrim: state.modelTrim,
    userTrim: state.userTrim,
    modelDurationMs: state.modelDurationMs,
    modelDurationText: els.modelDurationText.textContent,
    userDurationText: els.userDurationText.textContent,
    modelTrimText: els.modelTrimText.textContent,
    userTrimText: els.userTrimText.textContent,
  });
  render();
}

function showReview() {
  state.view = "review";
  els.practiceView.hidden = true;
  els.reviewView.hidden = false;
  renderReviewList();
}

function showPractice() {
  state.view = "practice";
  els.reviewView.hidden = true;
  els.practiceView.hidden = false;
}

function renderReviewList() {
  const rows = [...state.attempts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, attempt]) => {
      const word = state.words[index];
      return `<div class="review-row">
        <button class="review-word-button" type="button" data-index="${index}">${escapeHtml(word.id)}</button>
        <span>${escapeHtml(word.displaySpelling)}</span>
        <strong>${attempt.overall}</strong>
      </div>`;
    })
    .join("");
  els.reviewList.innerHTML = rows || `<p class="empty-review">まだ実施済みの単語がありません。</p>`;
  els.reviewList.querySelectorAll(".review-word-button").forEach((button) => {
    button.addEventListener("click", () => jumpToReviewedWord(Number(button.dataset.index)));
  });
}

function jumpToReviewedWord(index) {
  state.index = index;
  restoreAttempt(index);
  showPractice();
  render();
  setStatus("録音済みデータを読み込みました");
}

async function exportSoundData() {
  const records = [];
  for (const [index, attempt] of [...state.attempts.entries()].sort((a, b) => a[0] - b[0])) {
    const word = state.words[index];
    records.push({
      index,
      id: word.id,
      displaySpelling: word.displaySpelling,
      spokenSpelling: word.spokenSpelling,
      displayMeaning: word.displayMeaning,
      phonetic: word.phonetic,
      scores: {
        overall: attempt.overall,
        vowelScore: attempt.vowelScore,
        focusScore: attempt.focusScore,
      },
      settings: {
        x1Threshold: state.x1Threshold,
        x2SilenceSeconds: state.x2SilenceSeconds,
        x3PrerollMs: state.x3PrerollMs,
      },
      model: {
        rawAudio: await blobToDataUrl(attempt.rawModelWavBlob || attempt.rawModelBlob),
        trimmedAudio: await blobToDataUrl(await urlToBlob(attempt.modelUrl)),
        trim: attempt.modelTrim,
        durationText: attempt.modelDurationText,
        waveformPng: drawRmsEnvelopeToDataUrl(attempt.modelAnalysis.rmsEnvelope10ms, "#157f7f"),
        spectrumPng: drawSpectrogramToDataUrl(attempt.modelAnalysis.spectral),
      },
      user: {
        rawAudio: await blobToDataUrl(attempt.rawRecordedWavBlob || attempt.rawRecordedBlob),
        trimmedAudio: await blobToDataUrl(await urlToBlob(attempt.recordedUrl)),
        trim: attempt.userTrim,
        durationText: attempt.userDurationText,
        waveformPng: drawRmsEnvelopeToDataUrl(attempt.userAnalysis.rmsEnvelope10ms, "#bd5a2a"),
        spectrumPng: drawSpectrogramToDataUrl(attempt.userAnalysis.spectral),
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    wordFileName: state.wordFileName,
    records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `soundData-${state.wordFileName || "session"}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("データを書き出しました");
}

async function recordAnalysisFailure(error, rawBlob, recorderInfo) {
  const word = currentWord();
  const diagnostic = {
    exportedFor: "Au1-analysis-failure",
    failedAt: new Date().toISOString(),
    wordIndex: state.index,
    wordId: word?.id || "",
    displaySpelling: word?.displaySpelling || "",
    spokenSpelling: word?.spokenSpelling || "",
    wordFileName: state.wordFileName,
    analysisStage: state.lastAnalysisStage || "unknown",
    errorName: error?.name || "",
    errorMessage: error?.message || String(error),
    errorStack: error?.stack || "",
    recorder: {
      mimeType: recorderInfo.type,
      blobType: rawBlob.type,
      blobSize: rawBlob.size,
      chunkCount: recorderInfo.chunkCount,
      chunkSizes: recorderInfo.chunkSizes,
      elapsedMs: recorderInfo.elapsedMs,
    },
    settings: {
      x1Threshold: state.x1Threshold,
      x2SilenceSeconds: state.x2SilenceSeconds,
      x3PrerollMs: state.x3PrerollMs,
    },
    browser: {
      userAgent: navigator.userAgent,
      mediaRecorderTypes: getSupportedMimeTypes(),
    },
    rawAudio: await blobToDataUrl(rawBlob),
  };
  state.diagnostics.push(diagnostic);
  els.exportDiagnosticsButton.disabled = false;
}

function exportDiagnostics() {
  if (!state.diagnostics.length) {
    setStatus("解析エラー記録はありません");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    count: state.diagnostics.length,
    diagnostics: state.diagnostics,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `analysis-failures-${state.wordFileName || "session"}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("解析エラー記録を書き出しました");
}

function getSupportedMimeTypes() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"]
    .filter((type) => window.MediaRecorder?.isTypeSupported(type));
}

function restoreAttempt(index) {
  const attempt = state.attempts.get(index);
  clearCurrentAudio({ revokeSaved: false });
  state.recordedUrl = attempt.recordedUrl;
  state.modelUrl = attempt.modelUrl;
  state.rawRecordedUrl = attempt.rawRecordedUrl;
  state.rawModelUrl = attempt.rawModelUrl;
  state.rawRecordedBlob = attempt.rawRecordedBlob;
  state.rawModelBlob = attempt.rawModelBlob;
  state.rawRecordedWavUrl = attempt.rawRecordedWavUrl;
  state.rawModelWavUrl = attempt.rawModelWavUrl;
  state.rawRecordedWavBlob = attempt.rawRecordedWavBlob;
  state.rawModelWavBlob = attempt.rawModelWavBlob;
  state.modelTrim = attempt.modelTrim;
  state.userTrim = attempt.userTrim;
  state.modelDurationMs = attempt.modelDurationMs || 0;
  state.modelAnalysis = attempt.modelAnalysis;
  state.userAnalysis = attempt.userAnalysis;
  els.modelDurationText.textContent = attempt.modelDurationText || "-- ms";
  els.userDurationText.textContent = attempt.userDurationText || "-- ms";
  els.modelTrimText.textContent = attempt.modelTrimText || "発話区間 ----";
  els.userTrimText.textContent = attempt.userTrimText || "発話区間 ----";
  els.modelRawPlayer.src = state.rawModelWavUrl || state.rawModelUrl || "";
  els.userRawPlayer.src = state.rawRecordedWavUrl || state.rawRecordedUrl || "";
  els.playMineButton.disabled = false;
  drawEnvelope(els.modelCanvas, attempt.modelAnalysis.envelope, "#157f7f");
  drawEnvelope(els.userCanvas, attempt.userAnalysis.envelope, "#bd5a2a");
  drawSpectrogram(els.modelSpectrumCanvas, attempt.modelAnalysis.spectral);
  drawSpectrogram(els.spectrumCanvas, attempt.userAnalysis.spectral);
  renderScores(0);
}

function getAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
  }
  return state.audioContext;
}

function createEnvelope(samples, bucketCount) {
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const envelope = [];
  for (let i = 0; i < bucketCount; i += 1) {
    let sum = 0;
    const start = i * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    for (let j = start; j < end; j += 1) sum += Math.abs(samples[j]);
    envelope.push(sum / Math.max(1, end - start));
  }
  return normalize(envelope);
}

function createRmsEnvelope(samples, bucketCount) {
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const envelope = [];
  for (let i = 0; i < bucketCount; i += 1) {
    let sumSquares = 0;
    const start = i * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    for (let j = start; j < end; j += 1) sumSquares += samples[j] * samples[j];
    envelope.push(Math.sqrt(sumSquares / Math.max(1, end - start)));
  }
  return envelope;
}

function createRmsEnvelopeByWindow(samples, sampleRate, windowMs) {
  const bucketSize = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const envelope = [];
  for (let start = 0; start < samples.length; start += bucketSize) {
    let sumSquares = 0;
    const end = Math.min(samples.length, start + bucketSize);
    for (let j = start; j < end; j += 1) sumSquares += samples[j] * samples[j];
    envelope.push(Math.sqrt(sumSquares / Math.max(1, end - start)));
  }
  return envelope;
}

function trimUserSpeechBuffer(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const source = audioBuffer.getChannelData(0);
  const windowSize = Math.max(1, Math.round(sampleRate * 0.02));
  const threshold = state.x1Threshold;
  let speechStart = 0;

  for (let index = 0; index < source.length; index += windowSize) {
    const end = Math.min(source.length, index + windowSize);
    if (getRms(source.subarray(index, end)) >= threshold) {
      speechStart = Math.max(0, index - Math.round((state.x3PrerollMs / 1000) * sampleRate));
      break;
    }
  }

  const speechEnd = Math.max(speechStart + 1, source.length - Math.round(state.x2SilenceSeconds * sampleRate));
  const trimmed = getAudioContext().createBuffer(1, Math.max(1, speechEnd - speechStart), sampleRate);
  trimmed.copyToChannel(source.slice(speechStart, speechEnd), 0);
  return {
    audioBuffer: trimmed,
    startMs: Math.round((speechStart / sampleRate) * 1000),
    endMs: Math.round((speechEnd / sampleRate) * 1000),
    rawDurationMs: Math.round(audioBuffer.duration * 1000),
  };
}

function trimModelSpeechBuffer(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const source = audioBuffer.getChannelData(0);
  const windowSize = Math.max(1, Math.round(sampleRate * 0.02));
  const noiseWindowSamples = Math.min(source.length, Math.round(sampleRate * 0.18));
  const noiseRms = getRms(source.subarray(0, noiseWindowSamples));
  const delayCutSamples = Math.min(source.length, Math.round(sampleRate * 0.2));
  const earlyProbeStart = Math.min(source.length, Math.round(sampleRate * 0.03));
  const earlyProbeEnd = Math.min(source.length, Math.round(sampleRate * 0.18));
  const earlyRms = getRms(source.subarray(earlyProbeStart, earlyProbeEnd));
  const hasEarlySpeech = earlyRms >= 0.01;
  const threshold = hasEarlySpeech ? Math.max(0.006, earlyRms * 0.35) : Math.max(0.018, noiseRms * 4);
  const leadingCutSamples = hasEarlySpeech ? 0 : delayCutSamples;
  let speechStart = leadingCutSamples;
  let speechEnd = source.length;

  for (let index = leadingCutSamples; index < source.length; index += windowSize) {
    const end = Math.min(source.length, index + windowSize);
    if (getRms(source.subarray(index, end)) >= threshold) {
      speechStart = Math.max(leadingCutSamples, index - Math.round(0.03 * sampleRate));
      break;
    }
  }

  for (let index = source.length - windowSize; index >= speechStart; index -= windowSize) {
    const end = Math.min(source.length, index + windowSize);
    if (getRms(source.subarray(index, end)) >= threshold) {
      speechEnd = Math.min(source.length, end + Math.round(0.02 * sampleRate));
      break;
    }
  }

  speechEnd = Math.max(speechStart + 1, speechEnd);
  const trimmed = getAudioContext().createBuffer(1, Math.max(1, speechEnd - speechStart), sampleRate);
  trimmed.copyToChannel(source.slice(speechStart, speechEnd), 0);
  return {
    audioBuffer: trimmed,
    startMs: Math.round((speechStart / sampleRate) * 1000),
    endMs: Math.round((speechEnd / sampleRate) * 1000),
    rawDurationMs: Math.round(audioBuffer.duration * 1000),
  };
}

function normalize(values) {
  const max = Math.max(...values, 0.001);
  return values.map((value) => value / max);
}

function getFocusSounds(word) {
  const phonetic = word.phonetic || "";
  return {
    ae: /æ|\/ae\/|ae/i.test(phonetic),
    th: /θ|ð|\/th\/|th/i.test(phonetic),
    r: /r|ɹ/i.test(phonetic),
  };
}

function drawEnvelope(canvas, envelope, color) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height);
  const center = height / 2;
  const step = width / Math.max(1, envelope.length - 1);

  context.beginPath();
  envelope.forEach((value, index) => {
    const x = index * step;
    const y = center - value * center * 0.82;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = envelope.length - 1; index >= 0; index -= 1) {
    const x = index * step;
    const y = center + envelope[index] * center * 0.82;
    context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = color;
  context.globalAlpha = 0.22;
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function drawGrid(context, width, height) {
  context.fillStyle = "#fbfcfd";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#e6ebef";
  context.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function analyzeSpectrum(samples, sampleRate) {
  const fftSize = 1024;
  const hopSize = 256;
  const maxFrequency = Math.min(8000, sampleRate / 2);
  const maxBin = Math.floor((maxFrequency / sampleRate) * fftSize);
  const window = createHannWindow(fftSize);
  const frames = [];

  for (let start = 0; start + fftSize <= samples.length; start += hopSize) {
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i += 1) real[i] = samples[start + i] * window[i];
    fft(real, imag);
    const magnitudes = new Float32Array(maxBin);
    for (let bin = 1; bin < maxBin; bin += 1) magnitudes[bin] = Math.hypot(real[bin], imag[bin]);
    frames.push(magnitudes);
  }

  const safeFrames = frames.length ? frames : [new Float32Array(maxBin)];
  return {
    frames: safeFrames,
    sampleRate,
    fftSize,
    maxFrequency,
    vowel: bandEnergy(safeFrames, sampleRate, fftSize, 500, 2500),
    rBand: bandEnergy(safeFrames, sampleRate, fftSize, 1200, 3000),
    thBand: bandEnergy(safeFrames, sampleRate, fftSize, 4000, 8000),
    formants: estimateFormants(safeFrames, sampleRate, fftSize),
  };
}

function createHannWindow(size) {
  return Array.from({ length: size }, (_, index) => 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1))));
}

function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wlenReal = Math.cos(angle);
    const wlenImag = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < length / 2; j += 1) {
        const oddReal = real[i + j + length / 2] * wReal - imag[i + j + length / 2] * wImag;
        const oddImag = real[i + j + length / 2] * wImag + imag[i + j + length / 2] * wReal;
        const evenReal = real[i + j];
        const evenImag = imag[i + j];
        real[i + j] = evenReal + oddReal;
        imag[i + j] = evenImag + oddImag;
        real[i + j + length / 2] = evenReal - oddReal;
        imag[i + j + length / 2] = evenImag - oddImag;
        const nextReal = wReal * wlenReal - wImag * wlenImag;
        wImag = wReal * wlenImag + wImag * wlenReal;
        wReal = nextReal;
      }
    }
  }
}

function bandEnergy(frames, sampleRate, fftSize, lowHz, highHz) {
  const lowBin = Math.max(1, Math.floor((lowHz / sampleRate) * fftSize));
  const highBin = Math.min(frames[0].length - 1, Math.ceil((highHz / sampleRate) * fftSize));
  let band = 0;
  let total = 0;
  for (const frame of frames) {
    for (let bin = 1; bin < frame.length; bin += 1) {
      const value = frame[bin] * frame[bin];
      total += value;
      if (bin >= lowBin && bin <= highBin) band += value;
    }
  }
  return total ? band / total : 0;
}

function estimateFormants(frames, sampleRate, fftSize) {
  const average = new Float32Array(frames[0].length);
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 1) average[i] += frame[i];
  }
  for (let i = 0; i < average.length; i += 1) average[i] /= frames.length;
  smoothArrayInPlace(average, 5);
  return {
    f1: findPeakFrequency(average, sampleRate, fftSize, 250, 1000),
    f2: findPeakFrequency(average, sampleRate, fftSize, 900, 2800),
  };
}

function smoothArrayInPlace(values, radius) {
  const copy = values.slice();
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j += 1) {
      sum += copy[j];
      count += 1;
    }
    values[i] = sum / count;
  }
}

function findPeakFrequency(values, sampleRate, fftSize, lowHz, highHz) {
  const lowBin = Math.max(1, Math.floor((lowHz / sampleRate) * fftSize));
  const highBin = Math.min(values.length - 1, Math.ceil((highHz / sampleRate) * fftSize));
  let bestBin = lowBin;
  let bestValue = -Infinity;
  for (let bin = lowBin; bin <= highBin; bin += 1) {
    if (values[bin] > bestValue) {
      bestValue = values[bin];
      bestBin = bin;
    }
  }
  return Math.round((bestBin * sampleRate) / fftSize);
}

function drawSpectrogram(canvas, spectral) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  const image = context.createImageData(width, height);
  const frames = spectral.frames;
  const maxMagnitude = Math.max(...frames.map((frame) => Math.max(...frame)), 0.0001);
  for (let x = 0; x < width; x += 1) {
    const frame = frames[Math.floor((x / width) * frames.length)];
    for (let y = 0; y < height; y += 1) {
      const bin = Math.floor(((height - 1 - y) / height) * frame.length);
      const value = Math.log1p(frame[bin] * 40) / Math.log1p(maxMagnitude * 40);
      const offset = (y * width + x) * 4;
      image.data[offset] = Math.round(15 + value * 220);
      image.data[offset + 1] = Math.round(32 + value * 135);
      image.data[offset + 2] = Math.round(38 + value * 70);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function drawEnvelopeToDataUrl(envelope, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 180;
  drawEnvelope(canvas, envelope, color);
  return canvas.toDataURL("image/png");
}

function drawRmsEnvelopeToDataUrl(envelope, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 180;
  drawRmsEnvelope(canvas, envelope, color);
  return canvas.toDataURL("image/png");
}

function drawRmsEnvelope(canvas, envelope, color) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  const maxRms = Math.max(0.05, Math.ceil(Math.max(...envelope, 0.001) * 100) / 100);
  context.fillStyle = "#fbfcfd";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#e6ebef";
  context.fillStyle = "#66727c";
  context.font = "16px system-ui, sans-serif";
  context.textAlign = "left";
  for (let mark = 0; mark <= maxRms + 0.0001; mark += 0.01) {
    const yTop = height / 2 - (mark / maxRms) * (height / 2) * 0.82;
    const yBottom = height / 2 + (mark / maxRms) * (height / 2) * 0.82;
    context.beginPath();
    context.moveTo(44, yTop);
    context.lineTo(width, yTop);
    context.moveTo(44, yBottom);
    context.lineTo(width, yBottom);
    context.stroke();
    if (mark > 0) context.fillText(mark.toFixed(2), 4, yTop + 5);
  }
  context.strokeStyle = "#cfd7dc";
  context.beginPath();
  context.moveTo(44, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  const center = height / 2;
  const plotWidth = width - 44;
  const step = plotWidth / Math.max(1, envelope.length - 1);
  context.beginPath();
  envelope.forEach((value, index) => {
    const x = 44 + index * step;
    const y = center - (value / maxRms) * center * 0.82;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = envelope.length - 1; index >= 0; index -= 1) {
    const x = 44 + index * step;
    const y = center + (envelope[index] / maxRms) * center * 0.82;
    context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = color;
  context.globalAlpha = 0.22;
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function drawSpectrogramToDataUrl(spectral) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;
  drawSpectrogram(canvas, spectral);
  return canvas.toDataURL("image/png");
}

function clearCanvas(canvas, text) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  drawGrid(context, width, height);
  context.fillStyle = "#66727c";
  context.font = "24px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(text, width / 2, height / 2 + 8);
}

function clearCurrentAudio({ revokeSaved = true } = {}) {
  stopVad();
  clearUserAudio(revokeSaved);
  if (revokeSaved) revokeUrl(state.modelUrl);
  if (revokeSaved) revokeUrl(state.rawModelUrl);
  if (revokeSaved) revokeUrl(state.rawModelWavUrl);
  state.modelBlob = null;
  state.rawModelBlob = null;
  state.rawModelWavBlob = null;
  state.modelUrl = null;
  state.rawModelUrl = null;
  state.rawModelWavUrl = null;
  state.modelDurationMs = 0;
  state.modelAnalysis = null;
  state.modelTrim = null;
  els.modelRawPlayer.removeAttribute("src");
  els.modelRawPlayer.load();
}

function clearUserAudio(revokeSaved = true) {
  if (revokeSaved) revokeUrl(state.recordedUrl);
  if (revokeSaved) revokeUrl(state.rawRecordedUrl);
  if (revokeSaved) revokeUrl(state.rawRecordedWavUrl);
  state.recordedBlob = null;
  state.rawRecordedBlob = null;
  state.rawRecordedWavBlob = null;
  state.recordedUrl = null;
  state.rawRecordedUrl = null;
  state.rawRecordedWavUrl = null;
  state.userAnalysis = null;
  state.userTrim = null;
  state.recordingChunks = [];
  els.playMineButton.disabled = true;
  els.playMineButton.classList.remove("recording");
  els.userDurationText.textContent = "-- ms";
  els.userTrimText.textContent = "発話区間 ----";
  els.userRawPlayer.removeAttribute("src");
  els.userRawPlayer.load();
  if (!state.modelUrl) els.modelDurationText.textContent = "-- ms";
  if (!state.modelUrl) els.modelTrimText.textContent = "発話区間 ----";
}

function revokeUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

function blobToDataUrl(blob) {
  if (!blob) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function urlToBlob(url) {
  if (!url) return null;
  const response = await fetch(url);
  return response.blob();
}

function setStatus(text) {
  els.recordingStatus.textContent = text;
}

async function loadSelectedFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = decodeWordFileBuffer(await file.arrayBuffer());
    loadWordsFromText(text, file.name);
  } catch (error) {
    setStatus(`端末内ファイルを読み込めませんでした: ${error.message}`);
  }
}

async function loadHostedWords() {
  const fileName = els.hostedWordSelect.value;
  try {
    setStatus(`${fileName} を読み込み中`);
    const response = await fetchWordFile(fileName);
    const text = decodeWordFileBuffer(await response.arrayBuffer());
    loadWordsFromText(text, fileName);
    localStorage.setItem(STORAGE_KEY, fileName);
  } catch (error) {
    setStatus(`${fileName} を読み込めませんでした: ${error.message}`);
    els.wordListDetails.open = true;
  }
}

async function fetchWordFile(fileName) {
  const candidates = [`words/${fileName}`, fileName];
  const failures = [];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) return response;
      failures.push(`${path}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
    }
  }
  throw new Error(failures.join(" / "));
}

function decodeWordFileBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

function loadPastedWords() {
  loadWordsFromText(els.wordPaste.value, "貼り付け");
}

function loadWordsFromText(text, fileName) {
  const parsed = parseWordText(text);
  if (!parsed.length) {
    setStatus("単語リストを読み込めませんでした");
    return;
  }
  state.words = parsed;
  state.wordFileName = fileName || "";
  state.index = -1;
  state.attempts.clear();
  clearCurrentAudio();
  setStatus(`${parsed.length}語を読み込みました。▶で開始`);
  showPractice();
  els.wordListDetails.open = false;
  render();
}

function resetScores() {
  els.overallScore.textContent = "--";
  els.vowelScore.textContent = "--";
  els.focusScore.textContent = "--";
  els.modelVowelFeature.textContent = "--";
  els.modelRFeature.textContent = "--";
  els.modelThFeature.textContent = "--";
  els.modelFormants.textContent = "--";
  els.vowelFeature.textContent = "--";
  els.rFeature.textContent = "--";
  els.thFeature.textContent = "--";
  els.formantMatch.textContent = "--";
  els.analysisLatency.textContent = "未解析";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getRms(samples) {
  if (!samples.length) return 0;
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / samples.length);
}


function encodeWav(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = 44;
  for (const sample of samples) {
    const clipped = clamp(sample, -1, 1);
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function readStoredNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
