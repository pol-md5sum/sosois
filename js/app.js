import {
  PROVIDERS, CATEGORIES, POSES, LAYOUTS, DEFAULT_POSE, SYSTEM_PROMPT, CONTENT_SCHEMA, JUDGE_CRITERIA,
  buildContentPrompt, buildJudgePrompt, callModel, extractJson, normalizeContent, templateContent, heuristicScore,
  introContent, generateImage, buildImagePrompt, buildCoverPrompt, IMAGE_PROVIDERS, TOPIC_KEYS,
} from './ai.js';
import {
  getSettings, saveSettings, getKeys, saveKeys, availableProviders, STATUSES,
  listContents, getContent, saveContent, deleteContent, importContents, newId, putPose, deletePose, getAllPoses,
  putBg, deleteBg, getBgsFor,
} from './store.js';
import { renderCard, canvasToBlob, loadImage, autoLayout, FORMATS, DEFAULT_FORMAT, DECK_THEMES, deckTheme } from './render.js';

const TOPICS = () => TOPIC_KEYS().map((k) => [k, CATEGORIES[k]]);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const safeName = (s) => String(s || 'moa').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);

// ---------- 공통 UI ----------
let toastTimer;
function toast(msg, err = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show${err ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, err ? 5000 : 2600);
}
function modal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal').hidden = false;
  return $('#modal-box');
}
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#modal-box [data-busy]')) closeModal(); });

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ---------- 데이터 ----------
let NEWS = null;
async function loadNews() {
  if (NEWS) return NEWS;
  try {
    const res = await fetch(`data/news.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    NEWS = await res.json();
    const ov = getCatOverrides();
    NEWS.items.forEach((n) => { n.autoCategory = n.category; if (ov[newsKey(n)]) n.category = ov[newsKey(n)]; });
  } catch {
    NEWS = { generatedAt: null, items: [], trends: [], errors: ['뉴스 데이터를 아직 만들지 않았습니다.'] };
  }
  return NEWS;
}
// 사용자가 바꾼 뉴스 주제 (다음 수집 때도 유지되도록 기사 링크 기준으로 저장)
const newsKey = (n) => n.url || n.title;
function getCatOverrides() { try { return JSON.parse(localStorage.getItem('moa.catOverride')) || {}; } catch { return {}; } }
function setCatOverride(n, cat) {
  const ov = getCatOverrides();
  if (cat === n.autoCategory) delete ov[newsKey(n)]; else ov[newsKey(n)] = cat;
  try { localStorage.setItem('moa.catOverride', JSON.stringify(ov)); } catch { /* 저장 공간 부족 시 이번 화면에서만 반영 */ }
  n.category = cat;
}
const catSelect = (cur, attrs) => `<select class="cat-select" ${attrs} aria-label="주제 변경">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v.emoji} ${esc(v.label)}</option>`).join('')}</select>`;
const findNews = (id) => NEWS?.items.find((n) => n.id === id);

let ENV = null;
async function renderEnv(force = false) {
  if (ENV && !force) { ENV.settings = getSettings(); return ENV; }
  const moa = await loadImage('assets/moa/moa.png').catch(() => null);
  const poses = {};
  const stored = await getAllPoses();
  for (const [k, blob] of Object.entries(stored)) {
    try { poses[k] = await loadImage(URL.createObjectURL(blob)); } catch { /* 무시 */ }
  }
  ENV = { moa, poses, settings: getSettings() };
  return ENV;
}

// 카드 배경 이미지 (콘텐츠별)
async function loadBgs(contentId) {
  const out = {};
  const stored = await getBgsFor(contentId);
  for (const [k, blob] of Object.entries(stored)) {
    try { out[k] = await loadImage(URL.createObjectURL(blob)); } catch { /* 무시 */ }
  }
  return out;
}
// 생성·업로드한 이미지를 1080px 폭 JPEG로 줄여 저장 용량을 아낀다
async function shrinkToBlob(src) {
  const img = await loadImage(src);
  const w = Math.min(1080, img.naturalWidth);
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
}

// AI에 보낼 캡처 이미지: 긴 변 1600px 이하 JPEG로 줄인다
async function imageForAI(file) {
  const img = await loadImage(URL.createObjectURL(file));
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return { mime: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

function setDraftNews(n) { sessionStorage.setItem('moa.draftNews', JSON.stringify(n)); }
function getDraftNews() { try { return JSON.parse(sessionStorage.getItem('moa.draftNews')) || null; } catch { return null; } }

// ---------- 라우터 ----------
const routes = { dashboard, topics: topicsView, news: newsView, trends: trendsView, create: createView, editor: editorView, contents: contentsView, settings: settingsView };
async function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const r = routes[name] ? name : 'dashboard';
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === (r === 'editor' ? 'contents' : r)));
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    await routes[r](arg ? decodeURIComponent(arg) : undefined);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="notice">화면을 여는 중 오류가 발생했습니다: ${esc(e.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- 뉴스 카드 ----------
const catChip = (c) => { const k = CATEGORIES[c] || CATEGORIES.NEWS; return `<span class="chip" style="background:${k.color}26">${k.emoji} ${esc(k.label)}</span>`; };
const SCORE_LABEL = { recency: '최근성', buzz: '화제성', sns: 'SNS 확산', target: '2040 여성 관심', life: '생활 연관', ease: '설명 용이', card: '카드뉴스 적합' };

function newsCard(n) {
  const scores = n.scores ? Object.entries(SCORE_LABEL).map(([k, l]) => `<span>${l}</span><div class="meter"><i style="width:${n.scores[k] || 0}%"></i></div><span>${n.scores[k] || 0}</span>`).join('') : '';
  return `<article class="panel news">
    <div class="row" style="flex-wrap:nowrap">${catSelect(n.category, `data-recat="${esc(n.id)}" style="--c:${(CATEGORIES[n.category] || CATEGORIES.NEWS).color}"`)}${n.autoCategory && n.autoCategory !== n.category ? '<span class="small muted">직접 변경</span>' : ''}<span class="spacer"></span><span class="small muted">${esc(fmtDate(n.publishedAt))}</span></div>
    <h3><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></h3>
    ${n.summary ? `<p class="small muted" style="margin:0">${esc(n.summary)}</p>` : ''}
    <div class="small muted">출처: ${esc((n.outlets || [n.source]).filter(Boolean).slice(0, 4).join(', '))}${n.outlets?.length > 4 ? ` 외 ${n.outlets.length - 4}곳` : ''}</div>
    <div class="scores"><span><b style="color:var(--brown)">MOA 적합도</b></span><div class="meter"><i style="width:${n.moaScore}%"></i></div><b style="color:var(--brown)">${n.moaScore}</b>
      <span>화제성</span><div class="meter"><i style="width:${n.buzzScore}%;background:var(--green)"></i></div><span>${n.buzzScore}</span></div>
    ${n.reason ? `<div class="small">🐑 ${esc(n.reason)}</div>` : ''}
    <details class="small"><summary class="muted">세부 점수</summary><div class="scores" style="margin-top:6px">${scores}</div></details>
    <div class="foot"><button class="btn primary sm" data-make="${esc(n.id)}">이 뉴스로 카드뉴스 만들기</button></div>
  </article>`;
}
function bindMake(root) {
  $$('[data-recat]', root).forEach((sel) => sel.addEventListener('change', () => {
    const n = findNews(sel.dataset.recat);
    if (!n) return;
    setCatOverride(n, sel.value);
    toast(`주제를 ${CATEGORIES[sel.value].label}(으)로 바꿨어요.`);
    route();
  }));
  $$('[data-make]', root).forEach((b) => b.addEventListener('click', () => {
    const n = findNews(b.dataset.make);
    if (!n) return;
    setDraftNews(n);
    location.hash = '#/create';
  }));
}

// ---------- 대시보드 ----------
async function dashboard() {
  const data = await loadNews();
  const contents = listContents();
  const cnt = (s) => contents.filter((c) => c.status === s).length;
  const top = pickTop(data.items, 3);
  const keys = availableProviders();
  view.innerHTML = `
  <section class="hero">
    <div>
      <h1>요즘 뭐가 뜨는지, 모아가 알려줄게.</h1>
      <p class="sub" style="margin-bottom:16px">오늘의 뉴스를 고르면 AI가 7장 카드뉴스·캡션·해시태그까지 한 번에 만들어요.</p>
      <div class="row">
        <button class="btn primary big" id="oneclick">🐑 오늘의 콘텐츠 만들기</button>
        <a class="btn big" href="#/news">오늘의 뉴스 보기</a>
        <button class="btn big pink" id="intro">🐑 첫 게시물 (모아 소개)</button>
      </div>
    </div>
    <img src="assets/moa/moa.png" alt="모아 캐릭터" class="bounce">
  </section>
  <div class="stats">
    <div class="stat"><b>${data.items.length}</b><span class="small muted">오늘 수집한 뉴스</span></div>
    <div class="stat"><b>${contents.length}</b><span class="small muted">내 콘텐츠</span></div>
    <div class="stat"><b>${cnt('scheduled')}</b><span class="small muted">게시 예정</span></div>
    <div class="stat"><b>${cnt('posted')}</b><span class="small muted">게시 완료</span></div>
  </div>
  ${keys.length ? '' : '<div class="notice">AI API 키가 아직 없어서 <b>템플릿 모드</b>로 만들어져요. <a href="#/settings">설정</a>에서 GPT·Gemini·Claude 중 하나의 키를 넣으면 기사 내용을 분석한 원고가 생성됩니다.</div>'}
  <h2>주제별 오늘의 픽</h2>
  <div class="topic-grid">${TOPICS().map(([k, c]) => {
    const best = pickTop(data.items.filter((n) => n.category === k), 1)[0];
    const mine = contents.filter((x) => x.category === k).length;
    return `<a class="topic" href="#/topics/${k}" style="--c:${c.color}">
      <div class="row"><span class="topic-emoji">${c.emoji}</span><b>${esc(c.name)}</b><span class="spacer"></span><span class="small muted">${data.items.filter((n) => n.category === k).length}건</span></div>
      <div class="small muted">${esc(c.desc)}</div>
      <div class="topic-pick">${best ? esc(best.title) : '<span class="muted">오늘 수집된 뉴스 없음</span>'}</div>
      <div class="small muted">내 콘텐츠 ${mine}개</div></a>`;
  }).join('')}</div>
  <h2>오늘의 추천 뉴스 TOP 3</h2>
  ${top.length ? `<div class="grid">${top.map(newsCard).join('')}</div>` : emptyNews(data)}
  ${data.trends?.length ? `<h2>지금 뜨는 검색어</h2><div class="row">${data.trends.slice(0, 10).map((t) => `<a class="chip pink" href="#/trends">🔥 ${esc(t.keyword)}</a>`).join('')}</div>` : ''}
  <p class="small muted" style="margin-top:28px">뉴스 업데이트: ${data.generatedAt ? esc(new Date(data.generatedAt).toLocaleString('ko-KR')) : '없음'}${data.curatedBy ? ` · AI 선별: ${esc(PROVIDERS[data.curatedBy]?.label || data.curatedBy)}` : ' · 규칙 기반 선별'}</p>`;
  bindMake(view);
  $('#oneclick').addEventListener('click', oneClick);
  $('#intro').addEventListener('click', createIntro);
}

function emptyNews(data) {
  return `<div class="panel empty"><img src="assets/moa/moa.png" alt=""><p>아직 수집된 뉴스가 없어요.<br>${esc((data.errors || []).join(' / '))}</p>
    <p class="small">뉴스는 GitHub Actions가 3시간마다 자동으로 모아요. 지금 바로 만들려면 <a href="#/create">직접 입력</a>해 주세요.</p></div>`;
}

// 카테고리가 겹치지 않게 상위 n개
function pickTop(items, n) {
  const sorted = [...(items || [])].sort((a, b) => b.moaScore - a.moaScore);
  const out = [];
  const used = new Set();
  for (const it of sorted) { if (out.length >= n) break; if (!used.has(it.category)) { out.push(it); used.add(it.category); } }
  for (const it of sorted) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
  return out;
}

// ---------- 오늘의 뉴스 ----------
async function newsView() {
  const data = await loadNews();
  view.innerHTML = `
  <h1>📰 오늘의 뉴스</h1>
  <p class="sub">최근 24시간 뉴스를 같은 사건끼리 묶고, MOA 적합도(최근성·화제성·SNS 확산·2040 여성 관심·생활 연관·설명 용이·카드뉴스 적합)로 정렬했어요.</p>
  <div class="row" style="margin-bottom:16px">
    <select id="f-cat"><option value="">전체 카테고리</option>${TOPICS().map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}</select>
    <select id="f-sort"><option value="moa">MOA 적합도순</option><option value="new">최신순</option><option value="buzz">화제성순</option></select>
    <input type="search" id="f-q" placeholder="뉴스 검색" style="max-width:260px">
    <span class="spacer"></span>
    <a class="btn" href="#/create" id="manual">✏️ 직접 입력해서 만들기</a>
  </div>
  <div id="list"></div>
  <p class="small muted">업데이트: ${data.generatedAt ? esc(new Date(data.generatedAt).toLocaleString('ko-KR')) : '없음'} · 출처: Google 뉴스 RSS</p>`;
  $('#manual').addEventListener('click', () => sessionStorage.removeItem('moa.draftNews'));
  const draw = () => {
    const cat = $('#f-cat').value;
    const q = $('#f-q').value.trim().toLowerCase();
    const sort = $('#f-sort').value;
    let items = data.items.filter((n) => (!cat || n.category === cat) && (!q || `${n.title} ${n.summary}`.toLowerCase().includes(q)));
    items = items.sort((a, b) => (sort === 'new' ? new Date(b.publishedAt) - new Date(a.publishedAt) : sort === 'buzz' ? b.buzzScore - a.buzzScore : b.moaScore - a.moaScore));
    $('#list').innerHTML = items.length ? `<div class="grid">${items.slice(0, 60).map(newsCard).join('')}</div>` : (data.items.length ? '<div class="empty">조건에 맞는 뉴스가 없어요.</div>' : emptyNews(data));
    bindMake($('#list'));
  };
  ['f-cat', 'f-sort'].forEach((id) => $(`#${id}`).addEventListener('change', draw));
  $('#f-q').addEventListener('input', draw);
  draw();
}

// ---------- 주제별 콘텐츠 ----------
async function topicsView(cat) {
  const data = await loadNews();
  const key = CATEGORIES[cat] && !CATEGORIES[cat].hidden ? cat : 'NEWS';
  const c = CATEGORIES[key];
  const items = data.items.filter((n) => n.category === key).sort((a, b) => b.moaScore - a.moaScore);
  const mine = listContents().filter((x) => x.category === key);
  view.innerHTML = `
  <h1>🧺 주제별 콘텐츠</h1>
  <p class="sub">기획안의 MOA 카테고리별로 오늘의 뉴스를 모아 보고, 주제에 맞는 톤으로 카드뉴스를 만들어요.</p>
  <div class="tabs">${TOPICS().map(([k, v]) => `<a href="#/topics/${k}" class="${k === key ? 'on' : ''}" style="--c:${v.color}">${v.emoji} ${esc(v.name)} <span>${data.items.filter((n) => n.category === k).length}</span></a>`).join('')}</div>
  <section class="panel topic-head" style="--c:${c.color}">
    <div class="row"><span class="topic-emoji big">${c.emoji}</span><div><h2 style="margin:0">${esc(c.label)}</h2><div class="muted">${esc(c.desc)}</div></div></div>
    <p class="small" style="margin:12px 0 6px"><b>모아 작성 원칙</b> · ${esc(c.guide)}</p>
    <p class="small muted" style="margin:0">기본 해시태그: ${['모아뉴스', ...c.tags].map((t) => `#${esc(t)}`).join(' ')}</p>
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="t-one" ${items.length ? '' : 'disabled'}>🐑 이 주제 1위 뉴스로 만들기</button>
      <button class="btn" id="t-three" ${items.length ? '' : 'disabled'}>📦 이 주제 TOP 3 한 번에 만들기</button>
      <a class="btn" href="#/create" id="t-manual">✏️ 이 주제로 직접 입력</a>
    </div>
  </section>
  ${mine.length ? `<h2>내 ${esc(c.name)} 콘텐츠 (${mine.length})</h2><div class="row">${mine.slice(0, 8).map((x) => `<a class="chip" href="#/editor/${x.id}">${esc(x.title.slice(0, 28))} · ${esc(STATUSES[x.status])}</a>`).join('')}</div>` : ''}
  <h2>${esc(c.name)} 뉴스 ${items.length}건</h2>
  ${items.length ? `<div class="grid">${items.map(newsCard).join('')}</div>` : `<div class="panel empty"><img src="assets/moa/moa.png" alt=""><p>오늘 이 주제로 수집된 뉴스가 없어요. 다음 수집(3시간마다)을 기다리거나 직접 입력해 주세요.</p></div>`}`;
  bindMake(view);
  const provider = () => { const s = getSettings(); return getKeys()[s.provider] ? s.provider : (availableProviders()[0] || 'template'); };
  $('#t-one').addEventListener('click', async () => {
    const out = await runGenerate(items.slice(0, 1), provider(), { webSearch: getSettings().webSearch });
    if (out[0]) location.hash = `#/editor/${out[0].id}`;
  });
  $('#t-three').addEventListener('click', () => runGenerate(items.slice(0, 3), provider(), { webSearch: getSettings().webSearch }, { status: 'done', zip: true }));
  $('#t-manual').addEventListener('click', () => setDraftNews({ category: key, title: '', summary: '', url: '', source: '', sources: [] }));
}

// ---------- 트렌드 ----------
async function trendsView() {
  const data = await loadNews();
  const trends = data.trends || [];
  view.innerHTML = `
  <h1>🔥 트렌드</h1>
  <p class="sub">Google 트렌드 한국 실시간 인기 검색어와 관련 기사예요.</p>
  ${trends.length ? `<div class="grid">${trends.map((t, i) => `
    <article class="panel news">
      <div class="row"><span class="chip pink">#${i + 1}</span><span class="spacer"></span><span class="small muted">${esc(t.traffic || '')} 검색</span></div>
      <h3>${esc(t.keyword)}</h3>
      ${(t.news || []).map((n) => `<a class="small" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">· ${esc(n.title)} <span class="muted">${esc(n.name)}</span></a>`).join('')}
      <div class="foot"><button class="btn primary sm" data-trend="${i}">이 키워드로 카드뉴스 만들기</button></div>
    </article>`).join('')}</div>` : emptyNews(data)}`;
  $$('[data-trend]').forEach((b) => b.addEventListener('click', () => {
    const t = trends[+b.dataset.trend];
    const first = t.news?.[0];
    setDraftNews({
      id: `t${Date.now()}`, category: 'TREND', title: first ? `${t.keyword}: ${first.title}` : t.keyword,
      summary: `실시간 인기 검색어 '${t.keyword}' (${t.traffic || ''} 검색)`, url: first?.url || '', source: first?.name || 'Google 트렌드',
      publishedAt: t.publishedAt, sources: (t.news || []).map((n) => ({ name: n.name, title: n.title, url: n.url })),
    });
    location.hash = '#/create';
  }));
}

// ---------- 콘텐츠 만들기 ----------
async function createView() {
  const s = getSettings();
  const keys = getKeys();
  const n = getDraftNews() || { category: 'NEWS', title: '', summary: '', url: '', source: '', sources: [] };
  view.innerHTML = `
  <h1>✏️ 콘텐츠 만들기</h1>
  <p class="sub">뉴스를 확인하고 AI 모델을 고른 뒤 “자동으로 만들어줘”를 누르세요. 7장 원고·모아 포즈·캡션·해시태그가 한 번에 만들어져요.</p>
  <section class="panel url-box">
    <h3>🔗 뉴스 기사 URL로 바로 만들기</h3>
    <p class="small muted" style="margin:0 0 10px">기사 주소를 붙여넣으면 AI가 기사를 직접 읽고 7장 카드뉴스를 만들어요. (Claude·Gemini·GPT 키 필요, 주제는 AI가 판단)</p>
    <div class="row" style="flex-wrap:nowrap">
      <input type="url" id="u-url" placeholder="https://n.news.naver.com/... 또는 언론사 기사 주소" style="flex:1">
      <button class="btn primary" id="u-go">이 기사로 만들기</button>
    </div>
    <h3 style="margin-top:18px">📸 기사 캡처 이미지로 만들기</h3>
    <p class="small muted" style="margin:0 0 10px">기사 화면을 캡처해서 올리면(여러 장 가능) AI가 이미지 속 글을 읽고 만들어요. 앱에서 기사를 열 수 없거나 유료 기사일 때 편해요. 붙여넣기(Ctrl+V)도 돼요.</p>
    <div class="row">
      <label class="btn">🖼️ 이미지 첨부<input type="file" id="u-img" accept="image/*" multiple hidden></label>
      <button class="btn primary" id="u-img-go" disabled>캡처 이미지로 만들기</button>
      <span class="small muted" id="u-img-count"></span>
    </div>
    <div class="shots" id="u-shots"></div>
  </section>
  <div class="row" style="margin:14px 0"><span class="small muted">또는 아래에 뉴스 정보를 직접 채워서 만들기</span><span class="spacer"></span><button class="btn sm pink" id="c-intro">🐑 첫 게시물 (모아 소개) 만들기</button></div>
  <div class="editor" style="grid-template-columns:minmax(0,1fr) 360px">
    <section class="panel">
      <h3>뉴스 정보</h3>
      <div class="two">
        <div class="field"><label for="n-cat">카테고리</label><select id="n-cat">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === n.category ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></div>
        <div class="field"><label for="n-src">대표 출처</label><input type="text" id="n-src" value="${esc(n.source)}" placeholder="예: 연합뉴스"></div>
      </div>
      <div class="field"><label for="n-title">제목</label><input type="text" id="n-title" value="${esc(n.title)}" placeholder="뉴스 제목"></div>
      <div class="field"><label for="n-url">원문 링크</label><input type="url" id="n-url" value="${esc(n.url)}" placeholder="https://"></div>
      <div class="field"><label for="n-sum">요약 / 메모</label><textarea id="n-sum" rows="2">${esc(n.summary)}</textarea></div>
      ${n.sources?.length ? `<div class="field"><label>같은 사건의 다른 보도 (${n.sources.length})</label><div class="small">${n.sources.slice(0, 8).map((x) => `<div>· <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a> <span class="muted">${esc(x.name)}</span></div>`).join('')}</div></div>` : ''}
      <div class="field"><label for="n-body">기사 본문 붙여넣기 (권장)</label>
        <textarea id="n-body" rows="8" placeholder="원문 기사 본문을 붙여넣으면 AI가 더 정확하게 씁니다. 비워두면 제목·관련 보도만 참고하거나, 웹 검색을 켜서 사실을 확인해요."></textarea></div>
      <div class="field"><label for="n-extra">추가 요청 (선택)</label><input type="text" id="n-extra" placeholder="예: 직장인 관점으로, 숫자 위주로"></div>
    </section>
    <section class="panel">
      <h3>AI 모델</h3>
      <div class="seg" id="prov">${Object.entries(PROVIDERS).map(([k, p]) => `<button type="button" data-p="${k}" class="${k === s.provider ? 'on' : ''}">${p.label}${keys[k] ? '' : ' ·키 없음'}</button>`).join('')}</div>
      <p class="small muted" id="prov-model"></p>
      <label class="row small" style="margin:10px 0"><input type="checkbox" id="websearch" ${s.webSearch ? 'checked' : ''}> 웹 검색으로 사실 확인 (더 정확, 더 느림)</label>
      <div class="row" style="flex-direction:column;align-items:stretch">
        <button class="btn primary big" id="go">✨ 자동으로 만들어줘</button>
        <button class="btn" id="cmp">⚖️ GPT · Gemini · Claude 비교하기</button>
        <button class="btn" id="tpl">📄 AI 없이 템플릿으로 만들기</button>
      </div>
      <p class="small muted" style="margin-top:14px">API 키는 이 브라우저에만 저장되고 각 AI 회사 서버로만 전송돼요. <a href="#/settings">설정</a></p>
    </section>
  </div>`;
  let provider = s.provider;
  const showModel = () => { $('#prov-model').textContent = `모델: ${s.models[provider]}${keys[provider] ? '' : ' — 설정에서 API 키를 넣어 주세요'}`; };
  showModel();
  $$('#prov button').forEach((b) => b.addEventListener('click', () => {
    provider = b.dataset.p;
    $$('#prov button').forEach((x) => x.classList.toggle('on', x === b));
    showModel();
  }));
  const readNews = () => ({
    ...n,
    id: n.id || `m${Date.now()}`,
    category: $('#n-cat').value,
    title: $('#n-title').value.trim(),
    url: $('#n-url').value.trim(),
    source: $('#n-src').value.trim(),
    summary: $('#n-sum').value.trim(),
    articleText: $('#n-body').value.trim(),
  });
  const guard = () => {
    const nn = readNews();
    if (!nn.title) { toast('뉴스 제목을 입력해 주세요.', true); return null; }
    return nn;
  };
  $('#c-intro').addEventListener('click', createIntro);
  // 기사 캡처 이미지 첨부
  const shots = [];
  const drawShots = () => {
    $('#u-shots').innerHTML = shots.map((sh, i) => `<figure><img src="data:${sh.mime};base64,${sh.data}" alt="첨부 ${i + 1}"><button type="button" class="btn sm" data-rm-shot="${i}" aria-label="삭제">✕</button></figure>`).join('');
    $('#u-img-go').disabled = !shots.length;
    $('#u-img-count').textContent = shots.length ? `${shots.length}장 첨부됨 (최대 8장)` : '';
    $$('[data-rm-shot]').forEach((b) => b.addEventListener('click', () => { shots.splice(+b.dataset.rmShot, 1); drawShots(); }));
  };
  const addFiles = async (files) => {
    for (const f of files) {
      if (!f.type.startsWith('image/') || shots.length >= 8) continue;
      try { shots.push(await imageForAI(f)); } catch { toast('이미지를 읽지 못했어요.', true); }
    }
    drawShots();
  };
  $('#u-img').addEventListener('change', (e) => addFiles([...e.target.files]));
  const onPaste = (e) => {
    if (!document.body.contains($('#u-shots'))) { document.removeEventListener('paste', onPaste); return; }
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  };
  document.addEventListener('paste', onPaste);
  $('#u-img-go').addEventListener('click', async () => {
    const p = keys[provider] ? provider : availableProviders()[0];
    if (!p) { toast('이미지로 만들려면 설정에서 AI API 키를 하나 이상 넣어 주세요.', true); return; }
    const nn = { id: `i${Date.now()}`, category: '', title: '', url: $('#u-url').value.trim(), source: '', sources: [], summary: '' };
    const c = await runGenerate([nn], p, { images: shots, extra: $('#n-extra').value.trim() });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#u-url').addEventListener('paste', () => setTimeout(() => $('#u-url').value && $('#u-go').focus(), 0));
  $('#u-go').addEventListener('click', async () => {
    const url = $('#u-url').value.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) { toast('기사 주소(https://…)를 붙여넣어 주세요.', true); return; }
    const p = keys[provider] ? provider : availableProviders()[0];
    if (!p) { toast('URL로 만들려면 설정에서 AI API 키를 하나 이상 넣어 주세요.', true); return; }
    const nn = { id: `u${Date.now()}`, category: '', title: '', url, source: '', sources: [{ name: '', title: '', url }], summary: '' };
    const c = await runGenerate([nn], p, { fromUrl: true, extra: $('#n-extra').value.trim() });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#go').addEventListener('click', async () => {
    const nn = guard(); if (!nn) return;
    if (!keys[provider]) { toast(`${PROVIDERS[provider].label} API 키가 없어요. 설정에서 넣거나 템플릿으로 만들어 주세요.`, true); return; }
    const c = await runGenerate([nn], provider, { webSearch: $('#websearch').checked, extra: $('#n-extra').value.trim() });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#tpl').addEventListener('click', async () => {
    const nn = guard(); if (!nn) return;
    const c = await runGenerate([nn], 'template', {});
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#cmp').addEventListener('click', () => {
    const nn = guard(); if (!nn) return;
    runCompare(nn, { webSearch: $('#websearch').checked, extra: $('#n-extra').value.trim() });
  });
}

async function generateContent(news, provider, opts = {}) {
  const s = getSettings();
  let body;
  if (provider === 'template') {
    body = templateContent(news, { handle: s.handle });
  } else {
    const text = await callModel(provider, {
      apiKey: getKeys()[provider], model: s.models[provider], system: SYSTEM_PROMPT,
      prompt: buildContentPrompt(news, { ...opts, handle: s.handle }), images: opts.images, schema: CONTENT_SCHEMA, webSearch: !!opts.webSearch, fetchUrl: !!opts.fromUrl, browser: true,
    });
    body = normalizeContent(extractJson(text), news);
  }
  // 주제는 사용자가 고른 값(자동 분류 또는 직접 변경)을 따른다. URL로 만들 때는 AI 판단을 쓴다
  if (CATEGORIES[news.category]) body.category = news.category;
  // 예전 계정 표기(@moa)가 남아 있으면 현재 계정으로 바꾼다
  if (s.handle) body.caption = (body.caption || '').replace(/@moa(?![\w.])/g, s.handle);
  if (opts.fromUrl || opts.images?.length) {
    news.title = news.title || body.title;
    news.category = body.category;
    news.source = news.source || body.sources?.[0]?.name || '';
  }
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    status: 'draft',
    model: provider,
    modelName: provider === 'template' ? '템플릿' : s.models[provider],
    format: s.format || DEFAULT_FORMAT,
    theme: s.deckTheme || 'toon',
    news: { id: news.id, title: news.title, url: news.url, source: news.source, publishedAt: news.publishedAt, category: news.category, sources: (news.sources || []).slice(0, 8) },
    ...body,
  };
}

async function runGenerate(newsList, provider, opts, { status = 'draft', zip = false } = {}) {
  const label = provider === 'template' ? '템플릿' : PROVIDERS[provider].label;
  const box = modal(`<div data-busy><h2 style="margin-top:0">🐑 모아가 만드는 중…</h2>
    <p class="small muted">${esc(label)}${opts.webSearch ? ' · 웹 검색 사용' : ''} — 한 건에 보통 20초~1분 걸려요.</p>
    <ul class="progress" id="prog">${newsList.map((n, i) => `<li id="p${i}">${esc((n.title || n.url || '').slice(0, 50))}</li>`).join('')}</ul>
    <div id="pfoot"></div></div>`);
  const out = [];
  for (let i = 0; i < newsList.length; i++) {
    const li = $(`#p${i}`, box);
    li.className = 'run';
    try {
      const c = await generateContent(newsList[i], provider, opts);
      c.status = status;
      saveContent(c);
      out.push(c);
      li.className = 'done';
      const coverErr = await autoCover(c);
      if (coverErr) li.insertAdjacentHTML('beforeend', `<div class="small muted">첫 장 AI 배경: ${esc(coverErr)}</div>`);
    } catch (e) {
      console.error(e);
      li.className = 'fail';
      li.insertAdjacentHTML('beforeend', `<div class="small" style="color:var(--danger)">${esc(e.message)}</div>`);
    }
  }
  $('[data-busy]', box)?.removeAttribute('data-busy');
  if (out.length === newsList.length && !zip) { closeModal(); toast('카드뉴스가 만들어졌어요!'); return out; }
  const foot = $('#pfoot', box);
  foot.innerHTML = `<div class="row" style="margin-top:12px">
    ${zip && out.length ? '<button class="btn primary" id="pzip">📦 전체 PNG ZIP 다운로드</button>' : ''}
    ${out.map((c, i) => `<a class="btn sm" href="#/editor/${c.id}" data-close>결과 ${i + 1} 열기</a>`).join('')}
    <button class="btn" id="pclose">닫기</button></div>`;
  $('#pclose', box).addEventListener('click', closeModal);
  $$('[data-close]', box).forEach((a) => a.addEventListener('click', closeModal));
  $('#pzip', box)?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'PNG 만드는 중…';
    try { await downloadZip(out, `MOA_${today()}.zip`); } catch (err) { toast(err.message, true); }
    e.target.disabled = false; e.target.textContent = '📦 전체 PNG ZIP 다운로드';
  });
  return out;
}

// 첫 장 실사 배경 자동 생성 (설정에서 끌 수 있음). 실패해도 콘텐츠는 그대로 둔다
function imageProviderFor(s) {
  const keys = getKeys();
  if (keys[s.imageProvider] && IMAGE_PROVIDERS[s.imageProvider]) return s.imageProvider;
  return Object.keys(IMAGE_PROVIDERS).find((p) => keys[p]) || null;
}
async function makeCover(c, p) {
  const s = getSettings();
  const aspect = c.format === '1080x1440' ? '3:4' : c.format === '1080x1080' ? '1:1' : '4:5';
  const url = await generateImage(p, { apiKey: getKeys()[p], model: s.imageModels?.[p], prompt: buildCoverPrompt(c), aspect });
  await putBg(`${c.id}:0`, await shrinkToBlob(url));
}
async function autoCover(c) {
  const s = getSettings();
  if (!s.autoCover || deckTheme(c, s) !== 'magazine') return '';
  const p = imageProviderFor(s);
  if (!p) return 'GPT·Gemini 키가 없어 주제 일러스트로 대신했어요';
  try { await makeCover(c, p); return ''; } catch (e) { return `생성 실패 (${e.message})`; }
}

// ---------- 첫 게시물 ----------
function createIntro() {
  const s = getSettings();
  const c = {
    id: newId(), createdAt: new Date().toISOString(), status: 'draft', model: 'template', modelName: '첫 게시물 프리셋',
    format: s.format || DEFAULT_FORMAT, news: { title: '모아 소개' }, ...introContent(),
  };
  saveContent(c);
  toast('첫 게시물(모아 소개)을 만들었어요.');
  location.hash = `#/editor/${c.id}`;
}

// ---------- 원클릭 ----------
async function oneClick() {
  const data = await loadNews();
  const top = pickTop(data.items, 3);
  if (!top.length) { toast('수집된 뉴스가 없어요. 직접 입력해서 만들어 주세요.', true); location.hash = '#/create'; return; }
  const s = getSettings();
  const keys = getKeys();
  const provider = keys[s.provider] ? s.provider : (availableProviders()[0] || 'template');
  await runGenerate(top, provider, { webSearch: s.webSearch }, { status: 'done', zip: true });
}

// ---------- 모델 비교 ----------
async function runCompare(news, opts) {
  const provs = availableProviders();
  if (provs.length < 2) { toast('비교하려면 API 키가 2개 이상 필요해요. 설정에서 추가해 주세요.', true); return; }
  const box = modal(`<div data-busy><h2 style="margin-top:0">⚖️ 모델 비교 중…</h2>
    <ul class="progress">${provs.map((p) => `<li id="c-${p}" class="run">${PROVIDERS[p].label}</li>`).join('')}<li id="c-judge">채점</li></ul></div>`);
  const results = await Promise.all(provs.map(async (p) => {
    try {
      const content = await generateContent(news, p, opts);
      $(`#c-${p}`, box).className = 'done';
      return { provider: p, content };
    } catch (e) {
      const li = $(`#c-${p}`, box); li.className = 'fail';
      li.insertAdjacentHTML('beforeend', `<div class="small" style="color:var(--danger)">${esc(e.message)}</div>`);
      return null;
    }
  }));
  const ok = results.filter(Boolean);
  if (!ok.length) { $('[data-busy]', box).removeAttribute('data-busy'); return; }
  const judgeLi = $('#c-judge', box); judgeLi.className = 'run';
  let judge = null;
  let judgeBy = '규칙 기반';
  try {
    const jp = provs.includes('claude') ? 'claude' : provs[0];
    const s = getSettings();
    const text = await callModel(jp, {
      apiKey: getKeys()[jp], model: s.models[jp], system: '너는 공정한 SNS 콘텐츠 평가자다. JSON만 출력한다.',
      prompt: buildJudgePrompt(news, ok), maxTokens: 4000, browser: true,
    });
    judge = extractJson(text);
    judgeBy = `${PROVIDERS[jp].label} 채점`;
  } catch (e) { console.warn(e); }
  judgeLi.className = 'done';
  const scored = ok.map((r) => {
    const sc = judge?.scores?.[r.provider] || heuristicScore(r.content);
    const total = Object.keys(JUDGE_CRITERIA).reduce((a, k) => a + (Number(sc[k]) || 0), 0);
    return { ...r, sc, total };
  }).sort((a, b) => b.total - a.total);
  const best = judge?.recommended && scored.some((x) => x.provider === judge.recommended) ? judge.recommended : scored[0].provider;
  modal(`<h2 style="margin-top:0">⚖️ 비교 결과 <span class="small muted">(${esc(judgeBy)})</span></h2>
    ${judge?.reason ? `<div class="notice green">추천: <b>${esc(PROVIDERS[best].label)}</b> — ${esc(judge.reason)}</div>` : ''}
    <div class="table-wrap"><table><tr><th>기준</th>${scored.map((r) => `<th>${PROVIDERS[r.provider].label}${r.provider === best ? ' ⭐' : ''}</th>`).join('')}</tr>
      ${Object.entries(JUDGE_CRITERIA).map(([k, l]) => `<tr><td>${l}</td>${scored.map((r) => `<td>${esc(r.sc[k] ?? '-')}</td>`).join('')}</tr>`).join('')}
      <tr><th>합계 (60)</th>${scored.map((r) => `<th>${r.total}</th>`).join('')}</tr></table></div>
    <div class="compare" style="margin-top:14px">${scored.map((r) => `<div class="panel ${r.provider === best ? 'best' : ''}">
      <h3>${PROVIDERS[r.provider].label}</h3>
      <ol class="small" style="padding-left:18px;margin:0 0 10px">${r.content.cards.map((c) => `<li><b>${esc(c.title)}</b></li>`).join('')}</ol>
      ${r.sc.comment ? `<p class="small muted">${esc(r.sc.comment)}</p>` : ''}
      <button class="btn primary sm" data-use="${r.provider}">이 원고 사용</button></div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn" id="cmp-close">닫기</button></div>`);
  $('#cmp-close').addEventListener('click', closeModal);
  $$('[data-use]').forEach((b) => b.addEventListener('click', () => {
    const r = scored.find((x) => x.provider === b.dataset.use);
    r.content.compare = scored.map((x) => ({ provider: x.provider, total: x.total, scores: x.sc }));
    saveContent(r.content);
    closeModal();
    location.hash = `#/editor/${r.content.id}`;
  }));
}

// ---------- 카드 편집기 ----------
const POS_LABEL = { '': '자동', br: '오른쪽 아래', bl: '왼쪽 아래', bc: '가운데 아래', tr: '오른쪽 위', tl: '왼쪽 위', none: '숨기기' };
const LAYOUT_LABEL = { auto: '자동', big: '큰 제목', text: '설명형', list: '리스트', number: '큰 숫자', compare: '좌우 비교', keyword: '키워드 강조', cta: 'CTA' };

async function editorView(id) {
  const c = getContent(id);
  if (!c) { view.innerHTML = '<div class="empty">콘텐츠를 찾을 수 없어요. <a href="#/contents">내 콘텐츠</a></div>'; return; }
  const env = await renderEnv();
  env.bgs = await loadBgs(c.id);
  c.format = c.format || DEFAULT_FORMAT;
  let cur = 0;
  view.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <input type="text" id="e-title" value="${esc(c.title)}" style="max-width:520px;font-weight:800;font-size:18px">
    <select id="e-status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="small" for="e-cat" style="font-weight:700;color:var(--brown)">주제</label>
    <select id="e-cat">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === c.category ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select>
    <label class="small" for="e-theme" style="font-weight:700;color:var(--brown)">디자인</label>
    <select id="e-theme">${Object.entries(DECK_THEMES).map(([k, v]) => `<option value="${k}" ${k === deckTheme(c, env.settings) ? 'selected' : ''}>${v.split(' (')[0]}</option>`).join('')}</select>
    <label class="small" for="e-format" style="font-weight:700;color:var(--brown)">크기</label>
    <select id="e-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === c.format ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <span class="chip">${esc(PROVIDERS[c.model]?.label || '템플릿')} · ${esc(c.modelName || '')}</span>
    <span class="spacer"></span>
    <button class="btn" id="e-png">⬇️ 이 카드 PNG</button>
    <button class="btn primary" id="e-zip">📦 7장 ZIP</button>
  </div>
  ${c.factNotes?.length ? `<div class="notice"><b>확인이 필요한 내용</b><ul style="margin:6px 0 0;padding-left:18px">${c.factNotes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
  <div class="editor">
    <div class="thumbs" id="thumbs">${c.cards.map((k, i) => `<button data-i="${i}" aria-label="${i + 1}번 카드"><canvas></canvas><span>${String(i + 1).padStart(2, '0')}</span></button>`).join('')}</div>
    <div class="stage"><canvas id="stage" width="1080" height="1080"></canvas>
      <div class="row"><button class="btn sm" id="prev">◀ 이전</button><span class="small muted" id="pageinfo"></span><button class="btn sm" id="next">다음 ▶</button></div>
    </div>
    <aside class="panel edit-panel" id="panel"></aside>
  </div>
  <section class="panel" style="margin-top:22px">
    <div class="row"><h3 style="margin:0">📝 인스타그램 캡션</h3><span class="spacer"></span><button class="btn sm" id="cap-copy">캡션 + 해시태그 복사</button></div>
    <div class="field" style="margin-top:10px"><textarea id="cap" rows="9">${esc(c.caption)}</textarea></div>
    <div class="field"><label for="tags">해시태그 (띄어쓰기로 구분, ${c.hashtags.length}개)</label><input type="text" id="tags" value="${esc(c.hashtags.map((h) => `#${h}`).join(' '))}"></div>
    <div class="small muted">원본 기사: ${c.news?.url ? `<a href="${esc(c.news.url)}" target="_blank" rel="noopener noreferrer">${esc(c.news.title)}</a>` : esc(c.news?.title || '-')}
      · 출처: ${c.sources.map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name || s.url)}</a>` : esc(s.name))).join(', ') || '-'}
      · 생성: ${esc(new Date(c.createdAt).toLocaleString('ko-KR'))}</div>
  </section>`;

  const stage = $('#stage');
  const thumbs = $$('#thumbs canvas');
  let saveTimer; let drawTimer;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { saveContent(c); } catch (e) { toast(e.message, true); } }, 300); };
  const drawCurrent = async () => {
    await renderCard(stage, c, cur, env);
    const t = thumbs[cur];
    await renderCard(t, c, cur, env);
  };
  const redraw = () => { clearTimeout(drawTimer); drawTimer = setTimeout(drawCurrent, 90); };
  const drawAll = async () => { for (let i = 0; i < c.cards.length; i++) await renderCard(thumbs[i], c, i, env); };

  const select = async (i) => {
    cur = (i + c.cards.length) % c.cards.length;
    $$('#thumbs button').forEach((b, k) => b.classList.toggle('on', k === cur));
    $('#pageinfo').textContent = `${cur + 1} / ${c.cards.length} · ${c.cards[cur].type}`;
    fillPanel();
    await renderCard(stage, c, cur, env);
  };

  function fillPanel() {
    const k = c.cards[cur];
    k.style = k.style || {};
    const st = k.style;
    const lay = autoLayout(k);
    $('#panel').innerHTML = `
      <h3>${String(cur + 1).padStart(2, '0')} · ${esc(k.type)}</h3>
      <div class="two">
        <div class="field"><label>레이아웃</label><select data-k="layout">${LAYOUTS.map((l) => `<option value="${l}" ${l === k.layout ? 'selected' : ''}>${LAYOUT_LABEL[l]}${l === 'auto' ? ` (${LAYOUT_LABEL[lay]})` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>모아 포즈</label><select data-k="pose">${Object.entries(POSES).map(([p, l]) => `<option value="${p}" ${p === k.pose ? 'selected' : ''}>${l}${p === DEFAULT_POSE[k.type] ? ' (추천)' : ''}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>제목</label><textarea data-k="title" rows="2">${esc(k.title)}</textarea></div>
      <div class="field"><label>본문</label><textarea data-k="body" rows="3">${esc(k.body)}</textarea></div>
      <div class="field"><label>강조 문구 (제목·본문 안의 단어)</label><input type="text" data-k="highlight" value="${esc(k.highlight)}"></div>
      <div class="field"><label>리스트 (한 줄에 하나, 3~5개)</label><textarea data-k="items" rows="4">${esc((k.items || []).join('\n'))}</textarea></div>
      <div class="two">
        <div class="field"><label>큰 숫자</label><input type="text" data-k="number" value="${esc(k.number)}" placeholder="예: 3.5%"></div>
        <div class="field"><label>숫자 설명</label><input type="text" data-k="numberLabel" value="${esc(k.numberLabel)}"></div>
      </div>
      <details ${k.compare?.left ? 'open' : ''}><summary class="small" style="font-weight:700;color:var(--brown);margin-bottom:8px">좌우 비교</summary>
        <div class="two">
          <div class="field"><label>왼쪽 제목</label><input type="text" data-c="leftTitle" value="${esc(k.compare?.leftTitle)}"></div>
          <div class="field"><label>오른쪽 제목</label><input type="text" data-c="rightTitle" value="${esc(k.compare?.rightTitle)}"></div>
          <div class="field"><label>왼쪽 내용</label><textarea data-c="left" rows="2">${esc(k.compare?.left)}</textarea></div>
          <div class="field"><label>오른쪽 내용</label><textarea data-c="right" rows="2">${esc(k.compare?.right)}</textarea></div>
        </div></details>
      <div class="field"><label>모아의 한마디 (말풍선)</label><input type="text" data-k="moaSays" value="${esc(k.moaSays)}" maxlength="24"></div>
      <h3 style="margin-top:16px">디자인</h3>
      <div class="two">
        <div class="field"><label>모아 위치</label><select data-s="moaPos">${Object.entries(POS_LABEL).map(([p, l]) => `<option value="${p}" ${p === (st.moaPos || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>좌우 반전</label><select data-s="moaFlip"><option value="">아니요</option><option value="1" ${st.moaFlip ? 'selected' : ''}>네</option></select></div>
      </div>
      <div class="field"><label>모아 크기 <span class="muted" id="v-ms">${Math.round((st.moaScale || 1) * 100)}%</span></label><input type="range" min="0.5" max="1.5" step="0.05" data-s="moaScale" value="${st.moaScale || 1}"></div>
      <div class="field"><label>글자 크기 <span class="muted" id="v-fs">${Math.round((st.fontScale || 1) * 100)}%</span></label><input type="range" min="0.7" max="1.3" step="0.05" data-s="fontScale" value="${st.fontScale || 1}"></div>
      <div class="row">
        <label class="small">배경 <input type="color" data-s="bg" value="${st.bg || env.settings.theme.bg}"></label>
        <label class="small">강조색 <input type="color" data-s="accent" value="${st.accent || env.settings.theme.pink}"></label>
        <label class="small">글자색 <input type="color" data-s="textColor" value="${st.textColor || env.settings.theme.brown}"></label>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm" id="style-all">이 디자인을 7장 모두에 적용</button>
        <button class="btn sm" id="style-reset">디자인 초기화</button>
      </div>
      <h3 style="margin-top:18px">배경 이미지</h3>
      <p class="small muted" style="margin:0 0 8px">${cur === 0 ? '첫 장은 뉴스 주제에 어울리는 배경을 깔면 눈에 잘 띄어요. 제목이 잘 보이도록 위쪽은 자동으로 흐리게 처리돼요.' : '이 장에도 배경 이미지를 넣을 수 있어요.'}</p>
      <div class="row">
        <select id="bg-prov">${Object.entries(IMAGE_PROVIDERS).map(([p, v]) => `<option value="${p}" ${p === env.settings.imageProvider ? 'selected' : ''}>${v.label}${getKeys()[p] ? '' : ' (키 없음)'}</option>`).join('')}</select>
        <button class="btn sm primary" id="bg-ai">🎨 ${cur === 0 ? 'AI 실사 커버 만들기' : 'AI 배경 만들기'}</button>
        <label class="btn sm">🖼️ 이미지 올리기<input type="file" id="bg-up" accept="image/*" hidden></label>
        ${env.bgs[`${c.id}:${cur}`] ? '<button class="btn sm danger" id="bg-rm">배경 지우기</button>' : ''}
      </div>`;
    const bgKey = `${c.id}:${cur}`;
    const setBg = async (blob) => {
      await putBg(bgKey, blob);
      env.bgs = await loadBgs(c.id);
      fillPanel(); await drawCurrent();
    };
    $('#bg-up').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { await setBg(await shrinkToBlob(URL.createObjectURL(f))); toast('배경을 넣었어요.'); } catch { toast('이미지를 읽지 못했어요.', true); }
    });
    $('#bg-rm')?.addEventListener('click', async () => { await deleteBg(bgKey); env.bgs = await loadBgs(c.id); fillPanel(); await drawCurrent(); });
    $('#bg-ai').addEventListener('click', async (e) => {
      const p = $('#bg-prov').value;
      const apiKey = getKeys()[p];
      if (!apiKey) { toast(`${IMAGE_PROVIDERS[p].label}는 ${PROVIDERS[p].label} API 키가 필요해요. 설정에서 넣어 주세요.`, true); return; }
      const btn = e.target; btn.disabled = true; btn.textContent = '그리는 중… (20~60초)';
      try {
        const aspect = c.format === '1080x1440' ? '3:4' : c.format === '1080x1080' ? '1:1' : '4:5';
        const url = await generateImage(p, { apiKey, model: env.settings.imageModels?.[p], prompt: cur === 0 ? buildCoverPrompt(c) : buildImagePrompt(c), aspect });
        await setBg(await shrinkToBlob(url));
        toast('AI 배경을 넣었어요.');
      } catch (err) { toast(`배경 생성 실패: ${err.message}`, true); btn.disabled = false; btn.textContent = '🎨 AI 배경 만들기'; }
    });
    $$('[data-k]', $('#panel')).forEach((el) => el.addEventListener('input', () => {
      const key = el.dataset.k;
      k[key] = key === 'items' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value;
      persist(); redraw();
    }));
    $$('[data-c]', $('#panel')).forEach((el) => el.addEventListener('input', () => {
      k.compare = { ...(k.compare || {}), [el.dataset.c]: el.value }; persist(); redraw();
    }));
    $$('[data-s]', $('#panel')).forEach((el) => el.addEventListener('input', () => {
      const key = el.dataset.s;
      let v = el.value;
      if (['moaScale', 'fontScale'].includes(key)) { v = Number(v); $(key === 'moaScale' ? '#v-ms' : '#v-fs').textContent = `${Math.round(v * 100)}%`; }
      if (key === 'moaFlip') v = !!v;
      if (v === '' || v === false) delete st[key]; else st[key] = v;
      persist(); redraw();
    }));
    $('#style-all').addEventListener('click', async () => {
      c.cards.forEach((x, i) => { if (i !== cur) x.style = { ...(x.style || {}), bg: st.bg, accent: st.accent, textColor: st.textColor, fontScale: st.fontScale }; Object.keys(x.style).forEach((kk) => x.style[kk] === undefined && delete x.style[kk]); });
      persist(); await drawAll(); toast('7장 모두에 적용했어요.');
    });
    $('#style-reset').addEventListener('click', () => { k.style = {}; persist(); fillPanel(); redraw(); });
  }

  $$('#thumbs button').forEach((b) => b.addEventListener('click', () => select(+b.dataset.i)));
  $('#prev').addEventListener('click', () => select(cur - 1));
  $('#next').addEventListener('click', () => select(cur + 1));
  $('#e-title').addEventListener('input', (e) => { c.title = e.target.value; persist(); });
  $('#e-status').addEventListener('change', (e) => { c.status = e.target.value; persist(); toast(`상태: ${STATUSES[c.status]}`); });
  $('#e-theme').addEventListener('change', async (e) => {
    c.theme = e.target.value; persist(); await drawAll(); await select(cur);
    if (c.theme === 'magazine' && !env.bgs[`${c.id}:0`]) toast('매거진 첫 장은 1장 편집 패널의 "AI 실사 커버 만들기"로 사진 배경을 넣을 수 있어요.');
  });
  $('#e-format').addEventListener('change', async (e) => { c.format = e.target.value; persist(); await drawAll(); await select(cur); });
  $('#e-cat').addEventListener('change', async (e) => { c.category = e.target.value; persist(); await drawAll(); await select(cur); });
  $('#cap').addEventListener('input', (e) => { c.caption = e.target.value; persist(); });
  $('#tags').addEventListener('input', (e) => { c.hashtags = e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#+/, '')).filter(Boolean); persist(); });
  $('#cap-copy').addEventListener('click', async () => {
    const text = `${c.caption}\n\n${c.hashtags.map((h) => `#${h}`).join(' ')}`;
    try { await navigator.clipboard.writeText(text); toast('캡션을 복사했어요.'); } catch { toast('복사 권한이 없어요. 직접 선택해서 복사해 주세요.', true); }
  });
  $('#e-png').addEventListener('click', async () => {
    const cv = document.createElement('canvas');
    await renderCard(cv, c, cur, env);
    download(await canvasToBlob(cv), `${safeName(c.title)}_${String(cur + 1).padStart(2, '0')}.png`);
  });
  $('#e-zip').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { saveContent(c); await downloadZip([c], `${safeName(c.title)}.zip`); } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  });
  document.addEventListener('keydown', function onKey(ev) {
    if (!document.body.contains(stage)) { document.removeEventListener('keydown', onKey); return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (ev.key === 'ArrowLeft') select(cur - 1);
    if (ev.key === 'ArrowRight') select(cur + 1);
  });

  await select(0);
  drawAll();
}

const CARD_FILE = ['01_hook', '02_what', '03_why', '04_so-what', '05_moa-pick', '06_life-check', '07_cta'];
function captionText(c) {
  return `${c.caption}\n\n${c.hashtags.map((h) => `#${h}`).join(' ')}\n\n---\n원본 기사: ${c.news?.title || ''} ${c.news?.url || ''}\n출처: ${c.sources.map((s) => `${s.name} ${s.url}`).join(' / ')}\nAI 모델: ${c.modelName || c.model}\n`;
}
async function downloadZip(contents, name) {
  if (!window.JSZip) throw new Error('ZIP 라이브러리를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
  const env = await renderEnv();
  const zip = new window.JSZip();
  const cv = document.createElement('canvas');
  for (const c of contents) {
    env.bgs = await loadBgs(c.id);
    const dir = contents.length > 1 ? zip.folder(safeName(c.title)) : zip;
    for (let i = 0; i < c.cards.length; i++) {
      await renderCard(cv, c, i, env);
      dir.file(`${CARD_FILE[i] || `card_${i + 1}`}.png`, await canvasToBlob(cv));
    }
    dir.file('caption.txt', captionText(c));
  }
  download(await zip.generateAsync({ type: 'blob' }), name);
  toast('ZIP 파일을 내려받았어요.');
}

// ---------- 내 콘텐츠 ----------
async function contentsView() {
  view.innerHTML = `
  <h1>🗂️ 내 콘텐츠</h1>
  <p class="sub">이 브라우저에 저장된 카드뉴스예요. 다른 기기로 옮기려면 백업 파일을 내보내 가져오세요.</p>
  <div class="row" style="margin-bottom:14px">
    <input type="search" id="q" placeholder="제목 검색" style="max-width:220px">
    <select id="fc"><option value="">전체 카테고리</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}</select>
    <select id="fm"><option value="">전체 모델</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="template">템플릿</option></select>
    <select id="fs"><option value="">전체 상태</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <input type="date" id="fd" style="max-width:170px" title="생성일">
    <span class="spacer"></span>
    <button class="btn sm" id="exp">백업 내보내기</button>
    <label class="btn sm">백업 가져오기<input type="file" id="imp" accept="application/json" hidden></label>
  </div>
  <div id="tbl"></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const [fc, fm, fs, fd] = ['#fc', '#fm', '#fs', '#fd'].map((s) => $(s).value);
    const rows = listContents().filter((c) => (!q || c.title.toLowerCase().includes(q)) && (!fc || c.category === fc) && (!fm || c.model === fm) && (!fs || c.status === fs)
      && (!fd || new Date(c.createdAt).toLocaleDateString('sv-SE') === fd));
    $('#tbl').innerHTML = rows.length ? `<div class="table-wrap"><table>
      <tr><th>제목</th><th>카테고리</th><th>AI 모델</th><th>상태</th><th>생성일</th><th></th></tr>
      ${rows.map((c) => `<tr>
        <td><a href="#/editor/${c.id}"><b>${esc(c.title)}</b></a><div class="small muted">${esc(c.news?.source || '')}</div></td>
        <td>${catSelect(c.category, `data-cc="${c.id}"`)}</td>
        <td class="small">${esc(PROVIDERS[c.model]?.label || '템플릿')}<div class="muted">${esc(c.modelName || '')}</div></td>
        <td><select data-st="${c.id}">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="small">${esc(new Date(c.createdAt).toLocaleString('ko-KR'))}</td>
        <td><div class="row"><a class="btn sm" href="#/editor/${c.id}">열기</a><button class="btn sm" data-zip="${c.id}">ZIP</button><button class="btn sm danger" data-del="${c.id}">삭제</button></div></td>
      </tr>`).join('')}</table></div>`
      : '<div class="panel empty"><img src="assets/moa/moa.png" alt=""><p>아직 만든 콘텐츠가 없어요.</p><a class="btn primary" href="#/news">뉴스 고르러 가기</a></div>';
    $$('[data-cc]').forEach((s) => s.addEventListener('change', () => { const c = getContent(s.dataset.cc); c.category = s.value; saveContent(c); toast(`주제: ${CATEGORIES[c.category].label}`); }));
    $$('[data-st]').forEach((s) => s.addEventListener('change', () => { const c = getContent(s.dataset.st); c.status = s.value; saveContent(c); toast(`상태: ${STATUSES[c.status]}`); }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('이 콘텐츠를 삭제할까요?')) { deleteContent(b.dataset.del); draw(); } }));
    $$('[data-zip]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; const c = getContent(b.dataset.zip);
      try { await downloadZip([c], `${safeName(c.title)}.zip`); } catch (e) { toast(e.message, true); }
      b.disabled = false;
    }));
  };
  ['#q', '#fc', '#fm', '#fs', '#fd'].forEach((s) => $(s).addEventListener('input', draw));
  $('#exp').addEventListener('click', () => download(new Blob([JSON.stringify(listContents(), null, 1)], { type: 'application/json' }), `moa_backup_${today()}.json`));
  $('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = importContents(JSON.parse(await f.text())); toast(`${n}개를 가져왔어요.`); draw(); } catch { toast('백업 파일을 읽지 못했어요.', true); }
  });
  draw();
}

// ---------- 설정 ----------
async function settingsView() {
  const s = getSettings();
  const keys = getKeys();
  const data = await loadNews();
  const env = await renderEnv();
  view.innerHTML = `
  <h1>⚙️ 설정</h1>
  <p class="sub">AI 모델, 브랜드, 디자인, 모아 포즈 이미지를 설정해요.</p>
  <section class="panel">
    <h3>AI 모델 & API 키</h3>
    <div class="notice small">이 사이트는 서버 없이 GitHub Pages에서 동작해서, API 키는 <b>이 브라우저(localStorage)에만</b> 저장되고 OpenAI·Google·Anthropic 서버로 직접 전송돼요. 공용 PC에서는 사용 후 키를 지워 주세요. 각 회사 콘솔에서 사용 한도(예산)를 걸어 두는 것을 권장해요.</div>
    <div class="field"><label>기본 모델</label><div class="seg" id="defprov">${Object.entries(PROVIDERS).map(([k, p]) => `<button type="button" data-p="${k}" class="${k === s.provider ? 'on' : ''}">${p.label}</button>`).join('')}</div></div>
    ${Object.entries(PROVIDERS).map(([k, p]) => `
      <div class="two" style="align-items:end">
        <div class="field"><label for="key-${k}">${p.label} API 키</label><input type="password" id="key-${k}" value="${esc(keys[k] || '')}" placeholder="${{ claude: 'sk-ant-…', gpt: 'sk-…', gemini: 'AIza…' }[k]}" autocomplete="off"></div>
        <div class="field"><label for="model-${k}">${p.label} 모델 이름</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="model-${k}" value="${esc(s.models[k])}"><button class="btn sm" data-test="${k}">연결 테스트</button></div></div>
      </div>`).join('')}
    <label class="row small"><input type="checkbox" id="ws" ${s.webSearch ? 'checked' : ''}> 기본으로 웹 검색 사실 확인 사용</label>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>브랜드 & 디자인</h3>
    <div class="two">
      <div class="field"><label for="brand">브랜드 표기</label><input type="text" id="brand" value="${esc(s.brand)}"></div>
      <div class="field"><label for="handle">인스타그램 계정</label><input type="text" id="handle" value="${esc(s.handle)}"></div>
    </div>
    <div class="two">
      <div class="field"><label for="format">기본 카드 크기</label><select id="format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === (s.format || DEFAULT_FORMAT) ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label for="imgprov">배경 이미지 생성</label><select id="imgprov">${Object.entries(IMAGE_PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === s.imageProvider ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    </div>
    <div class="two">${Object.entries(IMAGE_PROVIDERS).map(([k, v]) => `<div class="field"><label for="img-${k}">${v.label} 모델 이름</label><input type="text" id="img-${k}" value="${esc(s.imageModels?.[k] || v.defaultModel)}"></div>`).join('')}</div>
    <div class="field"><label for="font">폰트</label><select id="font"><option value="Pretendard" ${s.font === 'Pretendard' ? 'selected' : ''}>Pretendard</option><option value="SUIT" ${s.font === 'SUIT' ? 'selected' : ''}>SUIT</option><option value="Gmarket" ${s.font === 'Gmarket' ? 'selected' : ''}>G마켓 산스 (매거진 느낌)</option></select></div>
    <div class="field"><label for="decktheme">카드뉴스 디자인 (7장 전체)</label><select id="decktheme">${Object.entries(DECK_THEMES).map(([k, v]) => `<option value="${k}" ${k === (s.deckTheme || 'toon') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <label class="row small" style="margin-bottom:10px"><input type="checkbox" id="autocover" ${s.autoCover ? 'checked' : ''}> 매거진 디자인일 때 첫 장 실사 사진 배경을 AI로 자동 생성 (GPT·Gemini 키 필요, 이미지 1장 생성 비용 발생)</label>
    <div class="row">${Object.entries({ bg: '배경', brown: '브라운', pink: '핑크', green: '그린' }).map(([k, l]) => `<label class="small">${l} <input type="color" data-theme="${k}" value="${s.theme[k]}"></label>`).join('')}
      <button class="btn sm" id="theme-reset">기본 색으로</button></div>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>모아 포즈 이미지</h3>
    <p class="small muted">기본은 첨부한 모아 이미지 한 장에 포즈별 기울기·효과(!, ?, 체크, 하트 등)를 더해 표현해요. 포즈별 일러스트(배경이 투명한 PNG)가 있으면 올려 주세요. 올린 이미지가 우선 사용돼요.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))" id="poses">
      ${Object.entries(POSES).map(([p, l]) => `<div class="panel" style="padding:10px;text-align:center">
        <canvas data-pv="${p}" width="1080" height="1080" style="width:100%;border-radius:10px"></canvas>
        <div class="small" style="font-weight:700;margin:6px 0">${l}${env.poses[p] ? ' · 사용자 이미지' : ''}</div>
        <div class="row" style="justify-content:center"><label class="btn sm">올리기<input type="file" accept="image/png,image/webp,image/jpeg" data-up="${p}" hidden></label>${env.poses[p] ? `<button class="btn sm danger" data-rm="${p}">삭제</button>` : ''}</div>
      </div>`).join('')}
    </div>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>뉴스 데이터</h3>
    <p class="small">마지막 수집: ${data.generatedAt ? esc(new Date(data.generatedAt).toLocaleString('ko-KR')) : '없음'} · ${data.items.length}건 · 선별: ${data.curatedBy ? esc(PROVIDERS[data.curatedBy]?.label) : '규칙 기반'}</p>
    ${data.errors?.length ? `<p class="small muted">수집 경고: ${esc(data.errors.join(' / '))}</p>` : ''}
    <p class="small muted">GitHub Actions가 3시간마다 Google 뉴스·트렌드 RSS를 수집해 사이트에 반영해요. 저장소 Settings → Secrets에 <span class="kbd">ANTHROPIC_API_KEY</span> / <span class="kbd">OPENAI_API_KEY</span> / <span class="kbd">GEMINI_API_KEY</span> 중 하나를 넣으면 AI가 MOA 적합도를 다시 평가해요.</p>
  </section>
  <div class="row" style="margin-top:16px"><button class="btn primary big" id="save">저장</button><button class="btn danger" id="clear-keys">API 키 모두 지우기</button></div>`;

  let prov = s.provider;
  $$('#defprov button').forEach((b) => b.addEventListener('click', () => { prov = b.dataset.p; $$('#defprov button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const collect = () => {
    const ns = { ...s, provider: prov, webSearch: $('#ws').checked, brand: $('#brand').value.trim() || 'MOA | 모아', handle: $('#handle').value.trim(), font: $('#font').value, models: {}, theme: { ...s.theme } };
    Object.keys(PROVIDERS).forEach((k) => { ns.models[k] = $(`#model-${k}`).value.trim() || PROVIDERS[k].defaultModel; });
    ns.format = $('#format').value;
    ns.autoCover = $('#autocover').checked;
    ns.deckTheme = $('#decktheme').value;
    ns.imageProvider = $('#imgprov').value;
    ns.imageModels = Object.fromEntries(Object.entries(IMAGE_PROVIDERS).map(([k, v]) => [k, $(`#img-${k}`).value.trim() || v.defaultModel]));
    $$('[data-theme]').forEach((i) => { ns.theme[i.dataset.theme] = i.value; });
    const nk = {};
    Object.keys(PROVIDERS).forEach((k) => { const v = $(`#key-${k}`).value.trim(); if (v) nk[k] = v; });
    return { ns, nk };
  };
  $('#save').addEventListener('click', () => { const { ns, nk } = collect(); saveSettings(ns); saveKeys(nk); ENV.settings = ns; toast('저장했어요.'); drawPreviews(); });
  $('#clear-keys').addEventListener('click', () => { if (!confirm('저장된 API 키를 모두 지울까요?')) return; saveKeys({}); Object.keys(PROVIDERS).forEach((k) => { $(`#key-${k}`).value = ''; }); toast('API 키를 지웠어요.'); });
  $('#theme-reset').addEventListener('click', () => { const d = { bg: '#FFF9F0', brown: '#6F6258', pink: '#F5B8B5', green: '#C9D8C0' }; $$('[data-theme]').forEach((i) => { i.value = d[i.dataset.theme]; }); });
  $$('[data-test]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.test;
    const apiKey = $(`#key-${k}`).value.trim();
    if (!apiKey) { toast('API 키를 먼저 입력해 주세요.', true); return; }
    b.disabled = true; b.textContent = '확인 중…';
    try {
      const text = await callModel(k, { apiKey, model: $(`#model-${k}`).value.trim(), system: 'JSON만 출력한다.', prompt: '{"ok":true} 를 그대로 출력해.', maxTokens: 2000, browser: true });
      extractJson(text);
      toast(`${PROVIDERS[k].label} 연결 성공!`);
    } catch (e) { toast(`${PROVIDERS[k].label} 연결 실패: ${e.message}`, true); }
    b.disabled = false; b.textContent = '연결 테스트';
  }));
  $$('[data-up]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast('4MB 이하 이미지를 올려 주세요.', true); return; }
    await putPose(inp.dataset.up, f); await renderEnv(true); toast('포즈 이미지를 저장했어요.'); settingsView();
  }));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => { await deletePose(b.dataset.rm); await renderEnv(true); settingsView(); }));

  async function drawPreviews() {
    for (const cv of $$('[data-pv]')) {
      const pose = cv.dataset.pv;
      const demo = { category: 'NEWS', sources: [], cards: [{ type: 'WHAT', title: '', body: '', highlight: '', items: [], number: '', numberLabel: '', compare: {}, layout: 'big', pose, moaSays: '', style: { bare: true, moaPos: 'bc', moaScale: 1.9 } }] };
      await renderCard(cv, demo, 0, ENV);
    }
  }
  drawPreviews();
}

route();
