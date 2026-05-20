/* ════════════════════════════════════════════════════════
   QuizAI  –  script.js   (complete rewrite)
   Fixes:
     • Questions now VISIBLE  (button-based options, not radio)
     • Exact-match scoring only
     • Voice auto-reads every question + options
     • Full per-question review with correct/wrong answers
     • Dot nav, progress bar, summary toggle all wired up
════════════════════════════════════════════════════════ */

// ── Global state ──────────────────────────────────────
let quiz        = null;   // quiz object from API
let answers     = {};     // { "1": "Full option text", ... }
let currentIdx  = 0;      // which question we're on
let utterance   = null;   // current SpeechSynthesisUtterance

// ── Pill selectors ─────────────────────────────────────
['numPills', 'diffPills'].forEach(id => {
  document.querySelectorAll(`#${id} .pill`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${id} .pill`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

function getPill(id) {
  return document.querySelector(`#${id} .pill.active`)?.dataset.val;
}

// ── File drag-and-drop ─────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const generateBtn = document.getElementById('generateBtn');

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop',      e => { e.preventDefault(); dropZone.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change',   () => handleFile(fileInput.files[0]));

function handleFile(file) {
  if (!file) return;
  const ok = ['application/pdf','image/png','image/jpeg','image/webp','image/gif'];
  if (!ok.includes(file.type)) { showError('Unsupported file. Use PDF, PNG, JPG or WEBP.'); return; }
  hideError();
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = fmtBytes(file.size);
  document.getElementById('fileIcon').textContent = file.type === 'application/pdf' ? '📄' : '🖼️';
  document.getElementById('filePreview').classList.remove('hidden');
  generateBtn.disabled = false;
}

function clearFile(e) {
  e.stopPropagation();
  fileInput.value = '';
  document.getElementById('filePreview').classList.add('hidden');
  generateBtn.disabled = true;
}

function fmtBytes(n) {
  if (n < 1024)    return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

// ── UI helpers ─────────────────────────────────────────
function show(id)  { document.getElementById(id).classList.remove('hidden'); }
function hide(id)  { document.getElementById(id).classList.add('hidden'); }
function el(id)    { return document.getElementById(id); }

function showError(msg) { el('errorBox').textContent = msg; el('errorBox').classList.remove('hidden'); }
function hideError()    { el('errorBox').classList.add('hidden'); }

function showOverlay(msg) { el('overlayMsg').textContent = msg; el('overlay').classList.remove('hidden'); }
function hideOverlay()    { el('overlay').classList.add('hidden'); }

// ═══════════════════════════════════════════════════════
//  GENERATE QUIZ
// ═══════════════════════════════════════════════════════
async function generateQuiz() {
  const file = fileInput.files[0];
  if (!file) { showError('Please select a file first.'); return; }

  hideError();
  generateBtn.disabled = true;
  el('btnText').classList.add('hidden');
  el('btnSpinner').classList.remove('hidden');
  showOverlay('Analysing your content… this may take up to 30 seconds');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('num_questions', getPill('numPills') || '5');
  fd.append('difficulty',    getPill('diffPills') || 'medium');

  try {
    const res  = await fetch('/api/generate-quiz', { method: 'POST', body: fd });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Quiz generation failed');

    quiz       = data.quiz;
    answers    = {};
    currentIdx = 0;

    setupQuizUI();           // fill static parts of the quiz section
    renderQuestion(0);       // show first question
    show('section-quiz');    // make quiz section visible

  } catch (err) {
    showError('❌ ' + err.message);
    generateBtn.disabled = false;
  } finally {
    hideOverlay();
    el('btnText').classList.remove('hidden');
    el('btnSpinner').classList.add('hidden');
    generateBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
//  SETUP QUIZ UI  (one-time per quiz)
// ═══════════════════════════════════════════════════════
function setupQuizUI() {
  el('topicLabel').textContent = quiz.topic || 'Quiz';

  // summary
  el('summaryText').textContent = quiz.summary || '';
  el('keyPointsList').innerHTML = (quiz.key_points || []).map(p => `<li>${p}</li>`).join('');

  // dot navigator
  el('dotNav').innerHTML = '';
  quiz.questions.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot';
    d.title = `Question ${i+1}`;
    d.onclick = () => renderQuestion(i);
    el('dotNav').appendChild(d);
  });
}

// ═══════════════════════════════════════════════════════
//  RENDER QUESTION  ← the main fix: uses <button> not radio
// ═══════════════════════════════════════════════════════
function renderQuestion(idx) {
  stopSpeech();
  currentIdx = idx;

  const q     = quiz.questions[idx];
  const total = quiz.questions.length;

  // header
  el('progLabel').textContent = `Q ${idx+1} / ${total}`;
  el('progFill').style.width  = ((idx+1)/total*100) + '%';
  el('qNum').textContent      = String(idx+1).padStart(2,'0');
  el('qText').textContent     = q.question;

  // ── Build option BUTTONS (not radio inputs) ──────────
  const letters = ['A','B','C','D','E'];
  el('optsList').innerHTML = '';          // clear previous options

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className  = 'opt-btn';
    btn.innerHTML  = `<span class="opt-letter">${letters[i]}</span><span>${opt}</span>`;

    // restore previously selected answer
    if (answers[String(q.id)] === opt) btn.classList.add('selected');

    btn.addEventListener('click', () => {
      // deselect all, then select this one
      el('optsList').querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      answers[String(q.id)] = opt;   // store EXACT option text
      updateDots();
    });

    el('optsList').appendChild(btn);
  });

  // nav buttons
  el('btnPrev').disabled = (idx === 0);
  const isLast = (idx === total - 1);
  el('btnNext').classList.toggle('hidden', isLast);
  el('btnSubmit').classList.toggle('hidden', !isLast);

  updateDots();

  // auto-speak the question
  speakCurrentQuestion();
}

// ── Dot state ──────────────────────────────────────────
function updateDots() {
  el('dotNav').querySelectorAll('.dot').forEach((d, i) => {
    const qid = String(quiz.questions[i].id);
    d.classList.toggle('answered', !!answers[qid]);
    d.classList.toggle('current',  i === currentIdx);
  });
}

// ── Navigation ─────────────────────────────────────────
function prevQ() { if (currentIdx > 0) renderQuestion(currentIdx - 1); }
function nextQ() { if (currentIdx < quiz.questions.length - 1) renderQuestion(currentIdx + 1); }

function toggleSummary() { el('summaryCard').classList.toggle('hidden'); }

// ═══════════════════════════════════════════════════════
//  VOICE  (Web Speech API)
// ═══════════════════════════════════════════════════════
function speakText(text) {
  if (!('speechSynthesis' in window)) {
    el('voiceStatus').textContent = 'Voice not supported in this browser';
    return;
  }
  stopSpeech();
  utterance       = new SpeechSynthesisUtterance(text);
  utterance.rate  = 0.93;
  utterance.pitch = 1;
  utterance.lang  = 'en-US';

  utterance.onstart = () => {
    el('btnSpeak')?.classList.add('speaking');
    el('btnStop')?.classList.remove('hidden');
    el('voiceStatus').textContent = '🔊 Speaking…';
  };
  utterance.onend = utterance.onerror = () => {
    el('btnSpeak')?.classList.remove('speaking');
    el('btnStop')?.classList.add('hidden');
    el('voiceStatus').textContent = '';
  };

  window.speechSynthesis.speak(utterance);
}

function speakCurrentQuestion() {
  if (!quiz) return;
  const q       = quiz.questions[currentIdx];
  const letters = ['A','B','C','D','E'];
  const optText = q.options.map((o, i) => `${letters[i]}: ${o}`).join('. ');
  speakText(`Question ${currentIdx + 1}. ${q.question}. Options: ${optText}`);
}

function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  el('btnSpeak')?.classList.remove('speaking');
  el('btnStop')?.classList.add('hidden');
  if (el('voiceStatus')) el('voiceStatus').textContent = '';
}

// ═══════════════════════════════════════════════════════
//  SUBMIT QUIZ
// ═══════════════════════════════════════════════════════
async function submitQuiz() {
  stopSpeech();

  const unanswered = quiz.questions.filter(q => !answers[String(q.id)]);
  if (unanswered.length > 0) {
    if (!confirm(`You left ${unanswered.length} question(s) unanswered. Submit anyway?`)) return;
  }

  showOverlay('Reviewing your answers…');

  try {
    const res  = await fetch('/api/review-answers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ quiz, answers })
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Review failed');

    buildReview(data.review);
    hide('section-quiz');
    show('section-review');
    window.scrollTo(0, 0);

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideOverlay();
  }
}

// ═══════════════════════════════════════════════════════
//  BUILD REVIEW SCREEN
// ═══════════════════════════════════════════════════════
function buildReview(review) {
  const { score, total, percentage, analysis } = review;

  // score ring
  el('ringScore').textContent = score;
  el('ringTotal').textContent = total;
  el('pctNum').textContent    = percentage;
  el('pctLabel').textContent  = pctLabel(percentage);

  // animate the SVG ring
  const circ   = 2 * Math.PI * 50;   // r=50 → 314.16
  const offset = circ - (percentage / 100) * circ;
  setTimeout(() => {
    const arc = el('ringArc');
    arc.style.transition        = 'stroke-dashoffset 1s ease';
    arc.style.strokeDashoffset  = offset;
  }, 200);

  // performance badge
  const lvl   = (review.performance_level || '').toLowerCase();
  const badge = el('perfBadge');
  badge.textContent = review.performance_level || 'Good';
  badge.className   = 'perf-badge ' + (
    lvl.includes('excel') ? 'perf-excellent' :
    lvl.includes('good')  ? 'perf-good'      :
    lvl.includes('fair')  ? 'perf-fair'       : 'perf-needs'
  );

  el('feedbackText').textContent = review.overall_feedback || '';

  // lists
  fillList('strengthsList', review.strengths);
  fillList('improveList',   review.areas_to_improve);
  fillList('tipsList',      review.study_tips);

  // ── Per-question breakdown ─────────────────────────────
  el('breakdown').innerHTML = '';
  (analysis || []).forEach((a, i) => {
    const div = document.createElement('div');
    div.className = `qb-item ${a.is_correct ? 'correct' : 'incorrect'}`;

    const wrongAnsHtml = !a.is_correct
      ? `&nbsp;·&nbsp; Correct: <span class="correct-ans">${a.correct_answer}</span>`
      : '';

    div.innerHTML = `
      <div class="qb-top">
        <span class="qb-q">Q${i+1}. ${a.question}</span>
        <span class="qb-tag ${a.is_correct ? 'correct' : 'incorrect'}">${a.is_correct ? '✓ Correct' : '✗ Wrong'}</span>
      </div>
      <div class="qb-ans">
        Your answer:
        <span class="yours ${a.is_correct ? 'right' : 'wrong'}">${a.user_answer || 'Not answered'}</span>
        ${wrongAnsHtml}
      </div>
      ${a.explanation ? `<div class="qb-expl">💡 ${a.explanation}</div>` : ''}
    `;
    el('breakdown').appendChild(div);
  });

  // summary in review
  el('revSummary').textContent = quiz.summary || '';
  el('revKeyChips').innerHTML  = (quiz.key_points || [])
    .map(p => `<span class="key-chip">${p}</span>`).join('');

  // encouragement
  el('encouragement').textContent = review.encouragement || '🎉 Great effort — keep going!';
}

// ── Helpers ────────────────────────────────────────────
function fillList(id, items) {
  el(id).innerHTML = toArr(items).map(s => `<li>${s}</li>`).join('');
}

function toArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.split(/\n|,/).map(s => s.trim()).filter(Boolean);
  return [];
}

function pctLabel(pct) {
  if (pct >= 90) return 'Outstanding!';
  if (pct >= 75) return 'Great job!';
  if (pct >= 60) return 'Good effort!';
  if (pct >= 40) return 'Keep practising!';
  return 'Review the material and try again!';
}

// ── Restart ────────────────────────────────────────────
function restartApp() {
  stopSpeech();
  quiz       = null;
  answers    = {};
  currentIdx = 0;
  fileInput.value = '';
  el('filePreview').classList.add('hidden');
  generateBtn.disabled = true;
  hideError();
  hide('section-quiz');
  hide('section-review');
  window.scrollTo(0, 0);
}