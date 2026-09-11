/* ============================================================
   HSK Flashcard — app.js
   Vanilla JS, no build step. All data lives in localStorage
   layered on top of the read-only HSK_DATA from data.js.
   ============================================================ */

(function(){
"use strict";

/* ---------------- storage helpers ---------------- */
const LS = {
  overrides: 'hsk_overrides_v1',   // {id: {field: value}}
  custom:    'hsk_custom_v1',      // [ {id, lv, w, p, pos, posVi, m, en, ex, exVi, syn, ant} ]
  progress:  'hsk_progress_v1',    // {id: {status, correct, wrong, last}}
  settings:  'hsk_settings_v1',
};

function loadJSON(key, fallback){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){ console.error('storage failed', e); return false; }
}

let overrides = loadJSON(LS.overrides, {});
let customWords = loadJSON(LS.custom, []);
let progress = loadJSON(LS.progress, {});
let settings = loadJSON(LS.settings, { front:'hanzi' });

/* ---------------- merged dataset ---------------- */
let MERGED = [];
let BY_ID = new Map();

function rebuildMerged(){
  MERGED = HSK_DATA.map(w => overrides[w.id] ? Object.assign({}, w, overrides[w.id]) : w);
  MERGED = MERGED.concat(customWords);
  BY_ID = new Map(MERGED.map(w => [w.id, w]));
}
rebuildMerged();

function getProgress(id){ return progress[id] || { status:'new', correct:0, wrong:0, last:0 }; }
function setProgress(id, status, correctDelta, wrongDelta){
  const p = getProgress(id);
  p.status = status;
  p.correct = (p.correct||0) + (correctDelta||0);
  p.wrong = (p.wrong||0) + (wrongDelta||0);
  p.last = Date.now();
  progress[id] = p;
  saveJSON(LS.progress, progress);
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.hidden = true; }, 2200);
}

/* ---------------- speech ---------------- */
function speak(text){
  if(!('speechSynthesis' in window)) return;
  try{
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }catch(e){ /* ignore */ }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const views = Array.from(document.querySelectorAll('.view'));
const navBtns = Array.from(document.querySelectorAll('.nav-btn'));

function showView(name){
  views.forEach(v => v.classList.toggle('visible', v.dataset.view === name));
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo({top:0});
  if(name === 'add') renderMineList();
}
navBtns.forEach(b => b.addEventListener('click', ()=> showView(b.dataset.nav)));
showView('list');

/* ============================================================
   LIST VIEW
   ============================================================ */
const searchInput = document.getElementById('searchInput');
const levelChips = document.getElementById('levelChips');
const posFilter = document.getElementById('posFilter');
const statusFilter = document.getElementById('statusFilter');
const wordListEl = document.getElementById('wordList');
const resultCountEl = document.getElementById('resultCount');
const pagerEl = document.getElementById('pager');

let listState = { level:'all', query:'', pos:'', status:'', page:1 };
const PAGE_SIZE = 50;

// populate POS filter options
(function initPosFilter(){
  const set = new Set();
  HSK_DATA.forEach(w => { if(w.posVi) w.posVi.split(', ').forEach(p=>set.add(p)); });
  [...set].sort().forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p.charAt(0).toUpperCase()+p.slice(1);
    posFilter.appendChild(opt);
  });
})();

levelChips.addEventListener('click', e=>{
  const btn = e.target.closest('.chip'); if(!btn) return;
  Array.from(levelChips.querySelectorAll('.chip')).forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  listState.level = btn.dataset.level;
  listState.page = 1;
  renderList();
});
searchInput.addEventListener('input', ()=>{ listState.query = searchInput.value.trim().toLowerCase(); listState.page=1; renderList(); });
posFilter.addEventListener('change', ()=>{ listState.pos = posFilter.value; listState.page=1; renderList(); });
statusFilter.addEventListener('change', ()=>{ listState.status = statusFilter.value; listState.page=1; renderList(); });

function filteredWords(){
  return MERGED.filter(w=>{
    if(listState.level !== 'all'){
      if(listState.level === 'custom'){ if(w.lv !== 'custom') return false; }
      else if(String(w.lv) !== listState.level) return false;
    }
    if(listState.pos && !(w.posVi||'').includes(listState.pos)) return false;
    if(listState.status){
      const st = getProgress(w.id).status;
      if(st !== listState.status) return false;
    }
    if(listState.query){
      const q = listState.query;
      const hay = (w.w+' '+w.p+' '+w.m+' '+(w.en||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderList(){
  const all = filteredWords();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  if(listState.page > totalPages) listState.page = totalPages;
  const start = (listState.page-1)*PAGE_SIZE;
  const pageItems = all.slice(start, start+PAGE_SIZE);

  resultCountEl.textContent = total === 0 ? 'Không tìm thấy từ nào' : `${total} từ`;
  wordListEl.innerHTML = '';
  if(pageItems.length===0){
    wordListEl.innerHTML = `<li class="empty-hint">Không có từ nào khớp bộ lọc hiện tại.</li>`;
  }
  pageItems.forEach(w=>{
    const li = document.createElement('li');
    const st = getProgress(w.id).status;
    li.innerHTML = `
      <div class="word-row">
        <button class="word-row-main" data-id="${w.id}">
          <span class="w-status ${st}"></span>
          <span class="w-hanzi zh">${escapeHTML(w.w)}</span>
          <span class="w-mid">
            <div class="w-pinyin">${escapeHTML(w.p)}</div>
            <div class="w-meaning">${escapeHTML(w.m || w.en || 'Chưa có nghĩa')}</div>
          </span>
          <span class="w-badge">${w.lv==='custom' ? 'Tôi' : 'H'+w.lv}</span>
        </button>
        <button class="icon-btn small edit-word-btn" data-edit-id="${w.id}" title="Sửa / thêm ghi chú, câu ví dụ">✎</button>
      </div>`;
    wordListEl.appendChild(li);
  });

  pagerEl.innerHTML = '';
  if(totalPages > 1){
    const prev = document.createElement('button');
    prev.textContent = '‹ Trước'; prev.disabled = listState.page<=1;
    prev.onclick = ()=>{ listState.page--; renderList(); window.scrollTo({top:0}); };
    const label = document.createElement('span');
    label.textContent = `Trang ${listState.page}/${totalPages}`;
    const next = document.createElement('button');
    next.textContent = 'Sau ›'; next.disabled = listState.page>=totalPages;
    next.onclick = ()=>{ listState.page++; renderList(); window.scrollTo({top:0}); };
    pagerEl.append(prev,label,next);
  }
}
wordListEl.addEventListener('click', e=>{
  const editBtn = e.target.closest('.edit-word-btn');
  if(editBtn){
    showView('add');
    document.querySelector('.add-tab[data-addtab="form"]').click();
    loadWordIntoForm(editBtn.dataset.editId);
    window.scrollTo({top:0});
    return;
  }
  const btn = e.target.closest('.word-row-main'); if(!btn) return;
  openDetail(btn.dataset.id);
});
renderList();

document.getElementById('shuffleFromListBtn').addEventListener('click', ()=>{
  const items = filteredWords();
  if(items.length===0){ toast('Không có từ nào để học'); return; }
  showView('flash');
  startDeck(items.map(w=>w.id), true);
});

function escapeHTML(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================================================
   DETAIL MODAL
   ============================================================ */
const detailModal = document.getElementById('detailModal');
const detailContent = document.getElementById('detailContent');
let detailWordId = null;

function openDetail(id){
  const w = BY_ID.get(id); if(!w) return;
  detailWordId = id;
  detailContent.innerHTML = `
    <div class="detail-hanzi zh">${escapeHTML(w.w)} <button class="speak-btn" style="position:static;display:inline-block;" id="detailSpeak">🔊</button></div>
    <div class="detail-pinyin">${escapeHTML(w.p)}</div>
    <div class="detail-pos">${escapeHTML(w.posVi||'')} · HSK${w.lv==='custom'?' (của tôi)':w.lv}</div>
    <div class="detail-meaning">${escapeHTML(w.m || w.en || 'Chưa có nghĩa — hãy sửa để thêm.')}</div>
    ${w.ex ? `<div class="detail-section"><h4>Câu ví dụ</h4><div class="cb-example"><span class="zh">${escapeHTML(w.ex)}</span>${w.exVi?escapeHTML(w.exVi):''}</div></div>` : ''}
    ${w.syn ? `<div class="detail-section"><h4>Từ đồng nghĩa</h4><p>${escapeHTML(w.syn)}</p></div>` : ''}
    ${w.ant ? `<div class="detail-section"><h4>Từ trái nghĩa</h4><p>${escapeHTML(w.ant)}</p></div>` : ''}
    ${w.note ? `<div class="detail-section"><h4>Ghi chú / Lưu ý</h4><p>${escapeHTML(w.note)}</p></div>` : ''}
  `;
  detailModal.hidden = false;
  document.getElementById('detailSpeak').addEventListener('click', ()=>speak(w.w));
}
document.getElementById('closeDetailBtn').addEventListener('click', ()=> detailModal.hidden = true);
detailModal.addEventListener('click', e=>{ if(e.target===detailModal) detailModal.hidden = true; });
document.getElementById('editFromDetailBtn').addEventListener('click', ()=>{
  detailModal.hidden = true;
  showView('add');
  document.querySelector('.add-tab[data-addtab="form"]').click();
  loadWordIntoForm(detailWordId);
});
document.getElementById('studyFromDetailBtn').addEventListener('click', ()=>{
  detailModal.hidden = true;
  showView('flash');
  startDeck([detailWordId], false);
});

/* ============================================================
   FLASHCARD DECK
   ============================================================ */
const deckConfig = document.getElementById('deckConfig');
const deckPlayer = document.getElementById('deckPlayer');
const deckSummary = document.getElementById('deckSummary');
const flashLevelChips = document.getElementById('flashLevelChips');
const frontSideSeg = document.getElementById('frontSideSeg');
const deckScopeSeg = document.getElementById('deckScopeSeg');
const shuffleToggle = document.getElementById('shuffleToggle');
const deckCountEl = document.getElementById('deckCount');

let flashState = { level:'all', front:'hanzi', scope:'all' };

flashLevelChips.addEventListener('click', e=>{
  const b = e.target.closest('.chip'); if(!b) return;
  Array.from(flashLevelChips.querySelectorAll('.chip')).forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); flashState.level = b.dataset.level; updateDeckCount();
});
frontSideSeg.addEventListener('click', e=>{
  const b = e.target.closest('.seg-btn'); if(!b) return;
  Array.from(frontSideSeg.querySelectorAll('.seg-btn')).forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); flashState.front = b.dataset.front;
});
deckScopeSeg.addEventListener('click', e=>{
  const b = e.target.closest('.seg-btn'); if(!b) return;
  Array.from(deckScopeSeg.querySelectorAll('.seg-btn')).forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); flashState.scope = b.dataset.scope; updateDeckCount();
});

function scopedWords(){
  return MERGED.filter(w=>{
    if(flashState.level!=='all'){
      if(flashState.level==='custom'){ if(w.lv!=='custom') return false; }
      else if(String(w.lv)!==flashState.level) return false;
    }
    if(flashState.scope==='due' && getProgress(w.id).status!=='learning') return false;
    if(flashState.scope==='new' && getProgress(w.id).status!=='new') return false;
    return true;
  });
}
function updateDeckCount(){ deckCountEl.textContent = scopedWords().length; }
updateDeckCount();

document.getElementById('startFlashBtn').addEventListener('click', ()=>{
  const ids = scopedWords().map(w=>w.id);
  if(ids.length===0){ toast('Không có thẻ nào phù hợp'); return; }
  startDeck(ids, shuffleToggle.checked);
});

let deck = [], deckIdx = 0, deckKnown = 0, deckUnknown = 0, deckWrongIds = [];
const flashcardEl = document.getElementById('flashcard');

function startDeck(ids, shuffle){
  deck = ids.slice();
  if(shuffle) shuffleArr(deck);
  deckIdx = 0; deckKnown = 0; deckUnknown = 0; deckWrongIds = [];
  deckConfig.hidden = true; deckSummary.hidden = true; deckPlayer.hidden = false;
  renderCard();
}
function shuffleArr(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function renderCard(){
  flashcardEl.classList.remove('flipped');
  const total = deck.length;
  document.getElementById('deckProgressLabel').textContent = `${deckIdx+1} / ${total}`;
  document.getElementById('deckProgressFill').style.width = ((deckIdx)/total*100)+'%';

  const id = deck[deckIdx];
  const w = BY_ID.get(id);
  document.getElementById('cardLevelBadge').textContent = w.lv==='custom' ? 'Của tôi' : 'HSK'+w.lv;

  const frontMain = document.getElementById('cardFrontMain');
  frontMain.classList.remove('small');
  if(flashState.front==='hanzi'){ frontMain.textContent = w.w; frontMain.classList.add('zh'); }
  else if(flashState.front==='pinyin'){ frontMain.textContent = w.p; frontMain.classList.add('small'); frontMain.classList.remove('zh'); }
  else { frontMain.textContent = w.m || w.en || '(chưa có nghĩa)'; frontMain.classList.add('small'); frontMain.classList.remove('zh'); }

  document.getElementById('cbHanzi').textContent = w.w;
  document.getElementById('cbHanzi').classList.add('zh');
  document.getElementById('cbPinyin').textContent = w.p;
  document.getElementById('cbPos').textContent = w.posVi || '';
  document.getElementById('cbMeaning').textContent = w.m || w.en || 'Chưa có nghĩa';
  const exEl = document.getElementById('cbExample');
  exEl.innerHTML = w.ex ? `<span class="zh">${escapeHTML(w.ex)}</span>${escapeHTML(w.exVi||'')}` : '';
  exEl.style.display = w.ex ? '' : 'none';
  const saEl = document.getElementById('cbSynAnt');
  saEl.innerHTML = '';
  if(w.syn) saEl.innerHTML += `<div><b>Đồng nghĩa:</b> ${escapeHTML(w.syn)}</div>`;
  if(w.ant) saEl.innerHTML += `<div><b>Trái nghĩa:</b> ${escapeHTML(w.ant)}</div>`;
}
flashcardEl.addEventListener('click', ()=> flashcardEl.classList.toggle('flipped'));
document.getElementById('speakBtn').addEventListener('click', e=>{ e.stopPropagation(); speak(BY_ID.get(deck[deckIdx]).w); });

function nextCard(known){
  const id = deck[deckIdx];
  if(known){ deckKnown++; setProgress(id, 'known', 1, 0); }
  else{ deckUnknown++; deckWrongIds.push(id); setProgress(id, 'learning', 0, 1); }
  if(deckIdx < deck.length-1){ deckIdx++; renderCard(); }
  else finishDeck();
}
document.getElementById('markYesBtn').addEventListener('click', ()=>nextCard(true));
document.getElementById('markNoBtn').addEventListener('click', ()=>nextCard(false));

function finishDeck(){
  document.getElementById('deckProgressFill').style.width='100%';
  deckPlayer.hidden = true; deckSummary.hidden = false;
  document.getElementById('sumKnown').textContent = deckKnown;
  document.getElementById('sumUnknown').textContent = deckUnknown;
}
document.getElementById('reviewAgainBtn').addEventListener('click', ()=>{
  if(deckWrongIds.length===0){ toast('Không còn thẻ cần ôn lại 🎉'); return; }
  startDeck(deckWrongIds, true);
});
document.getElementById('backToConfigBtn').addEventListener('click', ()=>{
  deckSummary.hidden = true; deckConfig.hidden = false; updateDeckCount();
});
document.getElementById('exitDeckBtn').addEventListener('click', ()=>{
  deckPlayer.hidden = true; deckConfig.hidden = false; updateDeckCount();
});

// keyboard shortcuts for flashcards
document.addEventListener('keydown', e=>{
  if(deckPlayer.hidden) return;
  if(e.code==='Space'){ e.preventDefault(); flashcardEl.classList.toggle('flipped'); }
  else if(e.key==='1'){ nextCard(false); }
  else if(e.key==='2'){ nextCard(true); }
});

// basic swipe support
(function(){
  let sx=0, sy=0, dragging=false;
  flashcardEl.addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; dragging=true; }, {passive:true});
  flashcardEl.addEventListener('touchend', e=>{
    if(!dragging) return; dragging=false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if(Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)*1.5){
      dx > 0 ? nextCard(true) : nextCard(false);
    }
  }, {passive:true});
})();

/* ============================================================
   PRACTICE HUB
   ============================================================ */
const practiceMenu = document.getElementById('practiceMenu');
const practiceSession = document.getElementById('practiceSession');
const practiceBody = document.getElementById('practiceBody');
const practiceTitle = document.getElementById('practiceTitle');
const practiceScore = document.getElementById('practiceScore');

let curPractice = { mode:null, score:0, total:0 };

practiceMenu.addEventListener('click', e=>{
  const t = e.target.closest('.practice-tile'); if(!t) return;
  startPractice(t.dataset.mode);
});
document.getElementById('exitPracticeBtn').addEventListener('click', ()=>{
  practiceSession.hidden = true; practiceMenu.hidden = false;
});

function startPractice(mode){
  curPractice = { mode, score:0, total:0 };
  practiceMenu.hidden = true; practiceSession.hidden = false;
  const titles = { quiz:'Trắc nghiệm từ vựng', listen:'Nghe – đoán từ', write:'Luyện viết chữ Hán', sentence:'Luyện đặt câu' };
  practiceTitle.textContent = titles[mode];
  updatePracticeScore();
  if(mode==='quiz') nextQuizQuestion();
  else if(mode==='listen') nextListenQuestion();
  else if(mode==='write') nextWriteWord();
  else if(mode==='sentence') nextSentenceItem();
}
function updatePracticeScore(){ practiceScore.textContent = curPractice.total ? `${curPractice.score}/${curPractice.total}` : ''; }

function pickPracticePool(){
  // prefer words with meanings for quiz/listen so options are meaningful
  const pool = MERGED.filter(w => w.m || w.en);
  return pool.length ? pool : MERGED;
}
function randomFrom(arr, n, excludeIds){
  const copy = arr.filter(w=> !excludeIds || !excludeIds.has(w.id));
  shuffleArr(copy);
  return copy.slice(0, n);
}

/* ---- Quiz: word -> pick correct meaning ---- */
function nextQuizQuestion(){
  const pool = pickPracticePool();
  if(pool.length < 4){ practiceBody.innerHTML = '<p class="empty-hint">Cần thêm từ có nghĩa để làm trắc nghiệm.</p>'; return; }
  const correct = pool[Math.floor(Math.random()*pool.length)];
  const distractors = randomFrom(pool, 3, new Set([correct.id]));
  const options = shuffleArr([correct, ...distractors]);
  practiceBody.innerHTML = `
    <div class="quiz-hanzi zh">${escapeHTML(correct.w)}</div>
    <p class="muted" style="text-align:center;">${escapeHTML(correct.p)} · chọn nghĩa đúng</p>
    <div class="quiz-options" id="quizOpts"></div>
  `;
  const optsEl = document.getElementById('quizOpts');
  options.forEach(o=>{
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = o.m || o.en;
    btn.onclick = ()=>{
      Array.from(optsEl.querySelectorAll('.quiz-opt')).forEach(b=>b.disabled=true);
      const isCorrect = o.id===correct.id;
      btn.classList.add(isCorrect?'correct':'wrong');
      if(!isCorrect){
        [...optsEl.children].find((b,i)=>options[i].id===correct.id).classList.add('correct');
      }
      curPractice.total++; if(isCorrect) curPractice.score++;
      updatePracticeScore();
      setProgress(correct.id, isCorrect?'known':'learning', isCorrect?1:0, isCorrect?0:1);
      const wrap = document.createElement('div');
      wrap.className = 'quiz-next-wrap';
      const next = document.createElement('button');
      next.className = 'primary-btn'; next.textContent = 'Câu tiếp theo';
      next.onclick = nextQuizQuestion;
      wrap.appendChild(next);
      practiceBody.appendChild(wrap);
    };
    optsEl.appendChild(btn);
  });
}

/* ---- Listen: hear audio -> pick correct hanzi ---- */
function nextListenQuestion(){
  const pool = pickPracticePool();
  if(pool.length < 4){ practiceBody.innerHTML = '<p class="empty-hint">Cần thêm từ để luyện nghe.</p>'; return; }
  const correct = pool[Math.floor(Math.random()*pool.length)];
  const distractors = randomFrom(pool, 3, new Set([correct.id]));
  const options = shuffleArr([correct, ...distractors]);
  practiceBody.innerHTML = `
    <p class="muted" style="text-align:center;">Nghe và chọn chữ Hán đúng</p>
    <button class="listen-btn-big" id="listenPlayBtn">🔊</button>
    <div class="quiz-options" id="listenOpts"></div>
  `;
  document.getElementById('listenPlayBtn').onclick = ()=>speak(correct.w);
  speak(correct.w);
  const optsEl = document.getElementById('listenOpts');
  options.forEach(o=>{
    const btn = document.createElement('button');
    btn.className = 'quiz-opt zh';
    btn.style.fontSize = '1.3rem';
    btn.textContent = o.w;
    btn.onclick = ()=>{
      Array.from(optsEl.querySelectorAll('.quiz-opt')).forEach(b=>b.disabled=true);
      const isCorrect = o.id===correct.id;
      btn.classList.add(isCorrect?'correct':'wrong');
      if(!isCorrect){
        [...optsEl.children].find((b,i)=>options[i].id===correct.id).classList.add('correct');
      }
      curPractice.total++; if(isCorrect) curPractice.score++;
      updatePracticeScore();
      setProgress(correct.id, isCorrect?'known':'learning', isCorrect?1:0, isCorrect?0:1);
      const wrap = document.createElement('div');
      wrap.className='quiz-next-wrap';
      const next = document.createElement('button');
      next.className='primary-btn'; next.textContent='Câu tiếp theo';
      next.onclick = nextListenQuestion;
      wrap.appendChild(next);
      practiceBody.appendChild(wrap);
    };
    optsEl.appendChild(btn);
  });
}

/* ---- Write: recall + freehand practice on canvas ---- */
let writeCurrentWord = null;
function nextWriteWord(){
  const pool = MERGED;
  writeCurrentWord = pool[Math.floor(Math.random()*pool.length)];
  const w = writeCurrentWord;
  practiceBody.innerHTML = `
    <div class="write-info">
      <div class="wi-pinyin">${escapeHTML(w.p)}</div>
      <div class="wi-meaning">${escapeHTML(w.m || w.en || '')}</div>
    </div>
    <div class="write-grid-wrap"><canvas id="writeCanvas" width="260" height="260"></canvas></div>
    <div class="write-tools">
      <button id="clearCanvasBtn">Xóa</button>
      <button id="revealBtn">Xem đáp án</button>
    </div>
    <div id="writeRevealBox"></div>
  `;
  setupCanvas();
  document.getElementById('clearCanvasBtn').onclick = clearCanvas;
  document.getElementById('revealBtn').onclick = ()=>{
    document.getElementById('writeRevealBox').innerHTML = `
      <div class="write-reveal">
        <div class="rev-hanzi zh">${escapeHTML(w.w)}</div>
        <p class="muted">${w.w.length} ký tự</p>
      </div>
      <div class="self-check">
        <button class="know-btn no" id="wRight0">✕ Tôi viết sai</button>
        <button class="know-btn yes" id="wRight1">✓ Tôi viết đúng</button>
      </div>`;
    document.getElementById('wRight0').onclick = ()=>{ curPractice.total++; updatePracticeScore(); setProgress(w.id,'learning',0,1); nextWriteWord(); };
    document.getElementById('wRight1').onclick = ()=>{ curPractice.total++; curPractice.score++; updatePracticeScore(); setProgress(w.id,'known',1,0); nextWriteWord(); };
  };
}
let canvasCtx, drawing=false;
function setupCanvas(){
  const c = document.getElementById('writeCanvas');
  canvasCtx = c.getContext('2d');
  drawGrid();
  const pos = ev=>{
    const r = c.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return { x: t.clientX-r.left, y: t.clientY-r.top };
  };
  const start = ev=>{ drawing=true; const p=pos(ev); canvasCtx.beginPath(); canvasCtx.moveTo(p.x,p.y); ev.preventDefault(); };
  const move = ev=>{ if(!drawing) return; const p=pos(ev); canvasCtx.lineTo(p.x,p.y); canvasCtx.strokeStyle='#26221B'; canvasCtx.lineWidth=5; canvasCtx.lineCap='round'; canvasCtx.lineJoin='round'; canvasCtx.stroke(); ev.preventDefault(); };
  const end = ()=>{ drawing=false; };
  c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  c.addEventListener('touchstart', start, {passive:false}); c.addEventListener('touchmove', move, {passive:false}); c.addEventListener('touchend', end);
}
function drawGrid(){
  const c = document.getElementById('writeCanvas');
  canvasCtx.clearRect(0,0,c.width,c.height);
  canvasCtx.strokeStyle = '#DCD2B8'; canvasCtx.lineWidth = 1;
  canvasCtx.strokeRect(1,1,c.width-2,c.height-2);
  canvasCtx.setLineDash([4,4]);
  canvasCtx.beginPath(); canvasCtx.moveTo(c.width/2,0); canvasCtx.lineTo(c.width/2,c.height); canvasCtx.stroke();
  canvasCtx.beginPath(); canvasCtx.moveTo(0,c.height/2); canvasCtx.lineTo(c.width,c.height/2); canvasCtx.stroke();
  canvasCtx.setLineDash([]);
}
function clearCanvas(){ drawGrid(); }

/* ---- Sentence practice: scramble example, or free self-write ---- */
function nextSentenceItem(){
  const withExample = MERGED.filter(w=>w.ex && w.ex.length>1);
  const useScramble = withExample.length>0 && Math.random() < 0.7;
  if(useScramble) renderScramble(withExample[Math.floor(Math.random()*withExample.length)]);
  else renderFreeSentence();
}
function renderScramble(w){
  const chars = Array.from(w.ex);
  const shuffled = shuffleArr(chars.map((c,i)=>({c,i})));
  practiceBody.innerHTML = `
    <p class="muted" style="text-align:center;">Sắp xếp lại câu ví dụ cho từ <strong class="zh">${escapeHTML(w.w)}</strong> (${escapeHTML(w.m||w.en||'')})</p>
    <div class="scramble-target" id="scrambleTarget"></div>
    <div class="scramble-pool" id="scramblePool"></div>
    <div id="scrambleResult"></div>
  `;
  const target = document.getElementById('scrambleTarget');
  const pool = document.getElementById('scramblePool');
  const placed = [];
  function renderPool(){
    pool.innerHTML='';
    shuffled.forEach(item=>{
      if(placed.includes(item.i)) return;
      const chip = document.createElement('button');
      chip.className='scramble-chip zh'; chip.textContent=item.c;
      chip.onclick = ()=>{ placed.push(item.i); renderPool(); renderTarget(); };
      pool.appendChild(chip);
    });
  }
  function renderTarget(){
    target.innerHTML='';
    placed.forEach(i=>{
      const chip = document.createElement('button');
      chip.className='scramble-chip placed zh'; chip.textContent=chars[i];
      chip.onclick = ()=>{ placed.splice(placed.indexOf(i),1); renderPool(); renderTarget(); };
      target.appendChild(chip);
    });
    if(placed.length===chars.length){
      const correct = placed.every((v,idx)=>v===idx);
      curPractice.total++; if(correct) curPractice.score++;
      updatePracticeScore();
      document.getElementById('scrambleResult').innerHTML = `
        <div class="sentence-reveal">
          ${correct? '✅ Chính xác!' : '❌ Chưa đúng thứ tự.'}<br>
          <span class="zh">${escapeHTML(w.ex)}</span><br>${escapeHTML(w.exVi||'')}
        </div>
        <button class="primary-btn" id="sentNextBtn" style="margin-top:12px;">Câu tiếp theo</button>`;
      document.getElementById('sentNextBtn').onclick = nextSentenceItem;
    }
  }
  renderPool(); renderTarget();
}
function renderFreeSentence(){
  const w = MERGED[Math.floor(Math.random()*MERGED.length)];
  practiceBody.innerHTML = `
    <p class="muted" style="text-align:center;">Tự đặt một câu với từ <strong class="zh">${escapeHTML(w.w)}</strong> (${escapeHTML(w.p)} · ${escapeHTML(w.m||w.en||'')})</p>
    <div class="sentence-own">
      <textarea id="ownSentence" placeholder="Viết câu tiếng Trung của bạn ở đây…"></textarea>
    </div>
    <button class="primary-btn" id="ownCheckBtn">Xong, xem gợi ý</button>
    <div id="ownResult"></div>
  `;
  document.getElementById('ownCheckBtn').onclick = ()=>{
    curPractice.total++; curPractice.score++; updatePracticeScore();
    setProgress(w.id,'known',1,0);
    document.getElementById('ownResult').innerHTML = `
      <div class="sentence-reveal">
        ${w.ex ? `Ví dụ tham khảo:<br><span class="zh">${escapeHTML(w.ex)}</span><br>${escapeHTML(w.exVi||'')}` : 'Từ này chưa có câu ví dụ mẫu — bạn có thể thêm một câu ở mục "Thêm từ".'}
      </div>
      <button class="primary-btn" id="sentNextBtn2" style="margin-top:12px;">Từ tiếp theo</button>`;
    document.getElementById('sentNextBtn2').onclick = nextSentenceItem;
  };
}

/* ============================================================
   ADD / EDIT FORM
   ============================================================ */
const addTabs = Array.from(document.querySelectorAll('.add-tab'));
const wordForm = document.getElementById('wordForm');
const minePanel = document.getElementById('minePanel');
const bulkPanel = document.getElementById('bulkPanel');

addTabs.forEach(t=>t.addEventListener('click', ()=>{
  addTabs.forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  const tab = t.dataset.addtab;
  wordForm.hidden = tab!=='form';
  minePanel.hidden = tab!=='mine';
  bulkPanel.hidden = tab!=='bulk';
  if(tab==='mine') renderMineList();
}));

const fWord=document.getElementById('fWord'), fPinyin=document.getElementById('fPinyin'),
      fLevel=document.getElementById('fLevel'), fPos=document.getElementById('fPos'),
      fMeaning=document.getElementById('fMeaning'), fExample=document.getElementById('fExample'),
      fExampleVi=document.getElementById('fExampleVi'), fSyn=document.getElementById('fSyn'),
      fAnt=document.getElementById('fAnt'), fNote=document.getElementById('fNote'),
      editIdInput=document.getElementById('editId'),
      formEditNote=document.getElementById('formEditNote'), cancelEditBtn=document.getElementById('cancelEditBtn'),
      dupCheckMsg=document.getElementById('dupCheckMsg');

/* ---- duplicate check: a word is only valid to ADD when its Chữ Hán
   doesn't already match another entry (built-in HSK or custom). ---- */
function findDuplicate(word, ignoreId){
  if(!word) return null;
  return MERGED.find(w => w.w === word && w.id !== ignoreId) || null;
}
function checkDuplicateWord(){
  const val = fWord.value.trim();
  if(!val){ dupCheckMsg.hidden = true; return true; }
  const dup = findDuplicate(val, editIdInput.value);
  if(dup){
    dupCheckMsg.hidden = false;
    dupCheckMsg.className = 'dup-check bad';
    const where = dup.lv==='custom' ? 'từ của tôi' : ('HSK'+dup.lv);
    dupCheckMsg.textContent = `⚠ Từ "${val}" đã có trong danh sách (${where}${dup.m ? ' — '+dup.m : ''}). Không thể thêm trùng.`;
    return false;
  }
  dupCheckMsg.hidden = false;
  dupCheckMsg.className = 'dup-check ok';
  dupCheckMsg.textContent = `✓ Từ mới, chưa có trong danh sách — điền tiếp nghĩa, cấp độ, pinyin bên dưới.`;
  return true;
}
fWord.addEventListener('input', checkDuplicateWord);

function resetForm(){
  wordForm.reset(); editIdInput.value=''; formEditNote.hidden=true; cancelEditBtn.hidden=true; fLevel.value='5';
  dupCheckMsg.hidden = true;
}
function loadWordIntoForm(id){
  const w = BY_ID.get(id); if(!w) return;
  editIdInput.value = id;
  fWord.value = w.w; fPinyin.value = w.p; fLevel.value = String(w.lv);
  fPos.value = w.posVi || ''; fMeaning.value = w.m || ''; fExample.value = w.ex || '';
  fExampleVi.value = w.exVi || ''; fSyn.value = w.syn || ''; fAnt.value = w.ant || '';
  fNote.value = w.note || '';
  dupCheckMsg.hidden = true;
  formEditNote.hidden = false;
  formEditNote.textContent = id.startsWith('h') ? 'Đang sửa từ có sẵn trong bộ HSK — chỉnh sửa sẽ được lưu riêng trên trình duyệt này.' : 'Đang sửa từ do bạn tự thêm.';
  cancelEditBtn.hidden = false;
}
cancelEditBtn.addEventListener('click', resetForm);

wordForm.addEventListener('submit', e=>{
  e.preventDefault();
  const data = {
    w: fWord.value.trim(), p: fPinyin.value.trim(), lv: fLevel.value==='custom' ? 'custom' : Number(fLevel.value),
    pos:'', posVi: fPos.value.trim(), m: fMeaning.value.trim(), en:'',
    ex: fExample.value.trim(), exVi: fExampleVi.value.trim(), syn: fSyn.value.trim(), ant: fAnt.value.trim(),
    note: fNote.value.trim(),
  };
  if(!data.w || !data.p || !data.m){ toast('Vui lòng điền Chữ Hán, Pinyin và Nghĩa'); return; }
  if(!checkDuplicateWord()){ toast('Từ này đã tồn tại — không thể thêm trùng.'); fWord.focus(); return; }

  const editId = editIdInput.value;
  if(editId && editId.startsWith('h')){
    overrides[editId] = data;
    saveJSON(LS.overrides, overrides);
    toast('Đã lưu chỉnh sửa');
  } else if(editId && editId.startsWith('c')){
    const idx = customWords.findIndex(x=>x.id===editId);
    if(idx>=0){ customWords[idx] = Object.assign({id:editId}, data); saveJSON(LS.custom, customWords); toast('Đã cập nhật từ'); }
  } else {
    const id = 'c'+Date.now()+Math.floor(Math.random()*1000);
    customWords.push(Object.assign({id}, data));
    saveJSON(LS.custom, customWords);
    toast('Đã thêm từ mới');
  }
  rebuildMerged();
  resetForm();
  renderList(); updateDeckCount(); renderMineList();
});

function renderMineList(){
  const mineListEl = document.getElementById('mineList');
  const emptyHint = document.getElementById('mineEmptyHint');
  const editedBase = Object.keys(overrides).map(id=>BY_ID.get(id)).filter(Boolean);
  const items = [...customWords, ...editedBase];
  document.getElementById('mineCount').textContent = items.length;
  mineListEl.innerHTML='';
  emptyHint.hidden = items.length>0;
  items.forEach(w=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="word-row">
        <span class="w-hanzi zh">${escapeHTML(w.w)}</span>
        <span class="w-mid">
          <div class="w-pinyin">${escapeHTML(w.p)}</div>
          <div class="w-meaning">${escapeHTML(w.m||'')}</div>
        </span>
        <button class="icon-btn small" data-edit="${w.id}" title="Sửa">✎</button>
        ${w.id.startsWith('c') ? `<button class="icon-btn small" data-del="${w.id}" title="Xóa">🗑</button>` : ''}
      </div>`;
    mineListEl.appendChild(li);
  });
}
document.getElementById('mineList').addEventListener('click', e=>{
  const editBtn = e.target.closest('[data-edit]');
  const delBtn = e.target.closest('[data-del]');
  if(editBtn){
    document.querySelector('.add-tab[data-addtab="form"]').click();
    loadWordIntoForm(editBtn.dataset.edit);
  } else if(delBtn){
    if(!confirm('Xóa từ này?')) return;
    customWords = customWords.filter(w=>w.id!==delBtn.dataset.del);
    saveJSON(LS.custom, customWords);
    rebuildMerged(); renderMineList(); renderList(); updateDeckCount();
    toast('Đã xóa');
  }
});

/* ============================================================
   BULK IMPORT / EXPORT
   ============================================================ */
function toCSV(rows){
  const header = ['id','word','pinyin','level','pos','meaning','example','exampleVi','synonyms','antonyms'];
  const esc = v => { v = (v==null?'':String(v)); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const lines = [header.join(',')];
  rows.forEach(r=> lines.push(header.map(h=>esc(r[h])).join(',')));
  return lines.join('\n');
}
function parseCSV(text){
  const rows = [];
  let i=0, field='', row=[], inQuotes=false;
  function pushField(){ row.push(field); field=''; }
  function pushRow(){ pushField(); rows.push(row); row=[]; }
  while(i < text.length){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1]==='"'){ field+='"'; i+=2; continue; } inQuotes=false; i++; continue; }
      field += c; i++; continue;
    } else {
      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === ','){ pushField(); i++; continue; }
      if(c === '\n'){ pushRow(); i++; continue; }
      if(c === '\r'){ i++; continue; }
      field += c; i++; continue;
    }
  }
  if(field.length || row.length) pushRow();
  if(!rows.length) return [];
  const header = rows[0].map(h=>h.trim());
  return rows.slice(1).filter(r=>r.some(c=>c.trim()!=='')).map(r=>{
    const obj={};
    header.forEach((h,idx)=> obj[h]=r[idx]!==undefined?r[idx]:'');
    return obj;
  });
}

document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
  const payload = { overrides, customWords, progress, exportedAt: new Date().toISOString() };
  downloadFile('hsk-du-lieu-cua-toi.json', JSON.stringify(payload, null, 2), 'application/json');
});
document.getElementById('exportCsvBtn').addEventListener('click', ()=>{
  const editedBase = Object.entries(overrides).map(([id,v])=>Object.assign({id}, BY_ID.get(id)||{}, v));
  const rows = [...customWords, ...editedBase].map(w=>({
    id: w.id.startsWith('c') ? '' : w.id, word:w.w, pinyin:w.p, level:w.lv, pos:w.posVi,
    meaning:w.m, example:w.ex, exampleVi:w.exVi, synonyms:w.syn, antonyms:w.ant, note:w.note||'',
  }));
  downloadFile('hsk-du-lieu-cua-toi.csv', toCSV(rows), 'text/csv');
});
function downloadFile(name, content, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('bulkFilePickBtn').addEventListener('click', ()=> document.getElementById('bulkFile').click());
document.getElementById('bulkFile').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ document.getElementById('bulkInput').value = reader.result; };
  reader.readAsText(file, 'UTF-8');
});

document.getElementById('bulkImportBtn').addEventListener('click', ()=>{
  const raw = document.getElementById('bulkInput').value.trim();
  const resultEl = document.getElementById('bulkResult');
  if(!raw){ resultEl.textContent = 'Chưa có dữ liệu để nhập.'; return; }
  let rows = [];
  try{
    if(raw.startsWith('{') || raw.startsWith('[')){
      const parsed = JSON.parse(raw);
      if(parsed.overrides || parsed.customWords){
        overrides = Object.assign({}, overrides, parsed.overrides||{});
        const existingIds = new Set(customWords.map(w=>w.id));
        (parsed.customWords||[]).forEach(w=>{ if(!existingIds.has(w.id)) customWords.push(w); });
        if(parsed.progress) progress = Object.assign({}, progress, parsed.progress);
        saveJSON(LS.overrides, overrides); saveJSON(LS.custom, customWords); saveJSON(LS.progress, progress);
        rebuildMerged(); renderList(); updateDeckCount(); renderMineList();
        resultEl.textContent = 'Đã nhập dữ liệu JSON sao lưu thành công.';
        return;
      }
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      rows = parseCSV(raw);
    }
  }catch(err){ resultEl.textContent = 'Không đọc được dữ liệu: '+err.message; return; }

  let updated=0, added=0, skippedDup=0;
  const seenWords = new Set(MERGED.map(w=>w.w));
  rows.forEach(r=>{
    const id = (r.id||'').trim();
    const data = {
      w: (r.word||r.w||'').trim(), p:(r.pinyin||r.p||'').trim(),
      lv: (r.level||r.lv||'5')==='custom' ? 'custom' : Number(r.level||r.lv||5),
      pos:'', posVi:(r.pos||r.posVi||'').trim(), m:(r.meaning||r.m||'').trim(), en:'',
      ex:(r.example||r.ex||'').trim(), exVi:(r.exampleVi||r.exVi||'').trim(),
      syn:(r.synonyms||r.syn||'').trim(), ant:(r.antonyms||r.ant||'').trim(),
      note:(r.note||'').trim(),
    };
    if(!data.w && !data.m) return;
    if(id && BY_ID.has(id)){
      // merge: only overwrite non-empty provided fields
      const base = BY_ID.get(id);
      const merged = {};
      Object.keys(data).forEach(k=>{ merged[k] = data[k] ? data[k] : base[k]; });
      overrides[id] = merged;
      updated++;
    } else {
      // new word: skip if it duplicates a Chữ Hán already in the list (built-in or just-added in this batch)
      if(data.w && seenWords.has(data.w)){ skippedDup++; return; }
      const newId = 'c'+Date.now()+Math.floor(Math.random()*10000)+added;
      customWords.push(Object.assign({id:newId}, data));
      if(data.w) seenWords.add(data.w);
      added++;
    }
  });
  saveJSON(LS.overrides, overrides); saveJSON(LS.custom, customWords);
  rebuildMerged(); renderList(); updateDeckCount(); renderMineList();
  resultEl.textContent = `Xong! Đã cập nhật ${updated} từ có sẵn, thêm ${added} từ mới`+(skippedDup ? `, bỏ qua ${skippedDup} từ bị trùng.` : '.');
  document.getElementById('bulkInput').value = '';
});

document.getElementById('resetAllBtn').addEventListener('click', ()=>{
  if(!confirm('Xóa toàn bộ dữ liệu (từ tự thêm, chỉnh sửa, tiến độ học) trên trình duyệt này?')) return;
  localStorage.removeItem(LS.overrides); localStorage.removeItem(LS.custom); localStorage.removeItem(LS.progress);
  overrides={}; customWords=[]; progress={};
  rebuildMerged(); renderList(); updateDeckCount(); renderMineList();
  toast('Đã xóa toàn bộ dữ liệu');
});

/* ============================================================
   STATS MODAL
   ============================================================ */
const statsModal = document.getElementById('statsModal');
document.getElementById('statsBtn').addEventListener('click', ()=>{ renderStats(); statsModal.hidden=false; });
document.getElementById('closeStatsBtn').addEventListener('click', ()=> statsModal.hidden=true);
statsModal.addEventListener('click', e=>{ if(e.target===statsModal) statsModal.hidden=true; });

function renderStats(){
  const total = MERGED.length;
  let known=0, learning=0;
  Object.values(progress).forEach(p=>{ if(p.status==='known') known++; else if(p.status==='learning') learning++; });
  const byLevel = {1:0,2:0,3:0,4:0,5:0};
  const byLevelKnown = {1:0,2:0,3:0,4:0,5:0};
  MERGED.forEach(w=>{ if(byLevel[w.lv]!==undefined){ byLevel[w.lv]++; if(getProgress(w.id).status==='known') byLevelKnown[w.lv]++; } });

  const grid = document.getElementById('statsGrid');
  grid.innerHTML = `
    <div class="stat-card"><strong>${total}</strong><span>Tổng số từ</span></div>
    <div class="stat-card"><strong>${known}</strong><span>Đã thuộc</span></div>
    <div class="stat-card"><strong>${learning}</strong><span>Đang học</span></div>
    <div class="stat-card"><strong>${customWords.length}</strong><span>Từ tự thêm</span></div>
    <div class="stat-card wide">
      <span style="font-size:.78rem;color:var(--ink-soft);font-weight:600;">Tiến độ theo cấp độ</span>
      ${[1,2,3,4,5].map(lv=>{
        const pct = byLevel[lv] ? Math.round(byLevelKnown[lv]/byLevel[lv]*100) : 0;
        return `<div class="stat-bar-row"><span class="lvl">HSK${lv}</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div><span class="cnt">${byLevelKnown[lv]}/${byLevel[lv]}</span></div>`;
      }).join('')}
    </div>
  `;
}

})();
