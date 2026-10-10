import {
  PROVIDERS, CATEGORIES, POSES, LAYOUTS, DEFAULT_POSE, SYSTEM_PROMPT, CONTENT_SCHEMA, JUDGE_CRITERIA,
  buildContentPrompt, buildJudgePrompt, callModel, extractJson, normalizeContent, templateContent, heuristicScore,
  introContent, generateImage, buildImagePrompt, buildCoverPrompt, IMAGE_PROVIDERS, TOPIC_KEYS, PRACTICAL_KINDS, personaSystem, renameCharacter, introContentHappy, withArticleLink, articleInfo, RECIPES, templateRecipe, buildVisitPrompt, templateVisit,
  finalizeGuide, reviewGuide, templateGuide, sourceKind, SOURCE_KIND_LABEL, isOfficialSource, isStale, GUIDE_DISCLAIMER,
} from './ai.js';
import { AGE_BANDS, GROUPS, ageLabel, groupLabel, loadTopics, addTopic, removeTopic, markTopicDone, weeklyPick } from './parenting.js';
import {
  getSettings, saveSettings, getKeys, saveKeys, availableProviders, STATUSES,
  listContents, getContent, saveContent, deleteContent, importContents, newId, putPose, deletePose, getAllPoses,
  putBg, deleteBg, getBgsFor, saveShort, listProfiles, getActiveProfile, setActiveProfile, saveProfile, deleteProfile, CHARACTERS, charOf, charNameOf, poseKey, mineOnly, profileOfItem,
} from './store.js';
import { renderCard, canvasToBlob, loadImage, autoLayout, FORMATS, DEFAULT_FORMAT, DECK_THEMES, deckTheme, deckThemeLabel, TOON_FONTS, TOON_FONT_LABELS, BUBBLE_FONTS, BUBBLE_FONT_LABELS } from './render.js';

import { createShortsViews, FONTS as SHORTS_FONTS, buildSlideProject } from './shorts.js';

// 계정별 브랜드: 주제·이름·이모지·슬로건 (해피해피는 육아·아기·생활용품·생활템만)
const BR = () => {
  const s = getSettings();
  const prof = getActiveProfile();
  const topics = (s.topics || TOPIC_KEYS()).filter((k) => CATEGORIES[k]);
  return { name: s.charName, emoji: charOf(prof).emoji || '✨', slogan: s.slogan || `요즘 뭐가 뜨는지, ${s.charName}가 알려줄게.`, topics, baseTag: s.baseTag || s.charName, audience: s.audience || '', focus: s.focus || '', fit: `${prof.id === 'moa' ? 'MOA' : s.charName} 적합도`, happy: !!s.focus };
};
const TOPICS = () => BR().topics.map((k) => [k, CATEGORIES[k]]);
const catLabel = (k) => { const v = CATEGORIES[k]; return v ? `${v.emoji} ${v.scope ? v.name : v.label}` : k; };
// 카테고리 선택지는 현재 계정 주제만 (지금 값이 다른 주제면 그것도 보이게)
const catOptions = (cur) => [...new Set([...BR().topics, ...(cur && CATEGORIES[cur] ? [cur] : [])])].map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(catLabel(k))}</option>`).join('');
// 뉴스·트렌드를 현재 계정 주제로 거른다
const HAPPY_TREND_RE = /육아|아기|아이|유아|출산|임신|어린이|키즈|엄마|아빠|부모|이유식|기저귀|분유|유모차|살림|생활용품|주방|청소|세제|수납|다이소|생활템|꿀템|육아템|나들이|가볼만한|키즈카페|테마파크|놀이공원|동물원|체험|가족여행/;
function scopeNews(data) {
  const b = BR();
  const items = (data.items || []).filter((n) => b.topics.includes(n.category));
  const trends = b.happy ? (data.trends || []).filter((t) => HAPPY_TREND_RE.test(`${t.keyword} ${(t.news || []).map((n) => n.title).join(' ')}`)) : (data.trends || []);
  return { ...data, items, trends };
}

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
const catSelect = (cur, attrs) => `<select class="cat-select" ${attrs} aria-label="주제 변경">${catOptions(cur)}</select>`;
const findNews = (id) => NEWS?.items.find((n) => n.id === id);

// 렌더 환경: 현재 계정의 캐릭터(기본 이미지 + 포즈)와 설정
let ENV = null;
async function renderEnv(force = false) {
  const prof = getActiveProfile();
  if (ENV && !force && ENV.profileId === prof.id) { ENV.settings = getSettings(); applyCharToggle(ENV); return ENV; }
  const ch = charOf(prof);
  const stored = await getAllPoses();
  const blobImg = async (b) => { try { return await loadImage(URL.createObjectURL(b)); } catch { return null; } };
  let base = ch.base ? await loadImage(ch.base).catch(() => null) : null;
  if (stored[poseKey(prof.id, 'base')]) base = (await blobImg(stored[poseKey(prof.id, 'base')])) || base;
  const poses = {};
  // 내장 포즈 세트(해피해피 등)
  if (ch.poses) {
    await Promise.all(Object.keys(POSES).map(async (k) => { const im = await loadImage(`${ch.poses}${k}.${ch.ext || 'png'}`).catch(() => null); if (im) poses[k] = im; }));
  }
  // 사용자가 올린 포즈가 우선
  for (const k of Object.keys(POSES)) {
    const b = stored[poseKey(prof.id, k)];
    if (b) { const im = await blobImg(b); if (im) poses[k] = im; }
  }
  ENV = { profileId: prof.id, charImg: base, charPoses: poses, charName: charNameOf(prof), settings: getSettings() };
  applyCharToggle(ENV);
  return ENV;
}
// 카드뉴스에 캐릭터를 넣지 않는 계정이면 렌더러에 캐릭터를 넘기지 않는다
function applyCharToggle(env) {
  const on = env.settings.showChar !== false;
  env.moa = on ? env.charImg : null;
  env.poses = on ? env.charPoses : {};
}
const charSrc = () => { const p = getActiveProfile(); return charOf(p).base || 'assets/moa/moa.png'; };
// 다른 계정의 콘텐츠를 열면 그 계정으로 전환한다
function ensureProfileFor(item) {
  const pid = profileOfItem(item);
  if (pid === getActiveProfile().id || !listProfiles().some((p) => p.id === pid)) return false;
  setActiveProfile(pid); drawProfileSwitch();
  toast(`${listProfiles().find((p) => p.id === pid).name} 계정으로 전환했어요.`);
  return true;
}
// 사이드바 계정 전환
function drawProfileSwitch() {
  const prof = getActiveProfile();
  const box = $('#profile-switch');
  if (!box) return;
  box.innerHTML = `<img src="${esc(charOf(prof).base || 'assets/moa/moa.png')}" alt="" width="34" height="38" id="ps-img">
    <select id="ps-sel" aria-label="계정 전환">${listProfiles().map((p) => `<option value="${esc(p.id)}" ${p.id === prof.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="__new">+ 새 계정 추가</option></select>`;
  $('#ps-sel').addEventListener('change', (e) => {
    if (e.target.value === '__new') { location.hash = '#/settings/new'; drawProfileSwitch(); return; }
    setActiveProfile(e.target.value); ENV = null; drawProfileSwitch();
    toast(`${getActiveProfile().name} 계정으로 바꿨어요.`);
    route();
  });
  const custom = prof.char === 'custom';
  if (custom) getAllPoses().then((st) => { const b = st[poseKey(prof.id, 'base')]; if (b) $('#ps-img').src = URL.createObjectURL(b); });
  document.documentElement.style.setProperty('--accent-profile', prof.toonAccent || '#F0506E');
  // 사이드바 로고·슬로건·파비콘도 계정에 맞춘다 (해피해피 계정에는 모아가 나오지 않게)
  const b = BR();
  const logo = $('.brand img');
  if (logo) { logo.src = charOf(prof).base || 'assets/moa/moa.png'; }
  const bt = $('.brand span');
  if (bt) bt.innerHTML = `<b>${esc(prof.id === 'moa' ? 'MOA' : b.name)}</b> Content Studio`;
  const foot = $('.side-foot');
  if (foot) foot.textContent = b.slogan;
  const fav = document.querySelector('link[rel="icon"]');
  if (fav && charOf(prof).base) fav.href = charOf(prof).base;
  document.title = `${prof.id === 'moa' ? 'MOA' : b.name} Content Studio`;
  const navCare = $('#nav-care');
  if (navCare) navCare.hidden = !b.happy;
  const intro = $('#nav a[data-route="intro"]');
  if (intro) intro.textContent = `${b.emoji} 첫 게시물 만들기`;
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

// 영상 파일에서 장면 하나(앞쪽 30% 지점)를 사진으로 뽑는다
async function videoFrameBlob(file, at = 0.3) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.src = URL.createObjectURL(file);
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('영상을 열 수 없어요.')); });
  await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(Math.max(0.5, (v.duration || 2) * at), Math.max(0, (v.duration || 1) - 0.1)); });
  const w = Math.min(1080, v.videoWidth || 1080);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = Math.round(w * ((v.videoHeight || 1920) / (v.videoWidth || 1080)));
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(v.src);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
}
const fileToPhoto = async (f) => (f.type.startsWith('video/') ? videoFrameBlob(f) : shrinkToBlob(URL.createObjectURL(f)));

// 📍 다녀왔어요 카드뉴스: 내 사진(또는 영상 장면) + 메모 → 사진 카드뉴스 (카드뉴스 메뉴·숏폼 메뉴 공용)
async function createVisit(v, photos, { provider = 'template', showChar } = {}) {
  const s = getSettings();
  const pics = photos.filter(Boolean).slice(0, 8);
  const box = modal(`<div data-busy><h2 style="margin-top:0">${BR().emoji} ${esc(BR().name)}가 사진 보는 중…</h2><p class="small muted">사진 ${pics.length}장으로 "다녀왔어요" 카드뉴스를 만들고 있어요.${provider === 'template' ? '' : ' 보통 20초~1분 걸려요.'}</p></div>`);
  try {
    let body;
    if (provider !== 'template') {
      const images = [];
      for (const b of pics) images.push(await imageForAI(b));
      const text = await callModel(provider, {
        apiKey: getKeys()[provider], model: s.models[provider], browser: true, schema: CONTENT_SCHEMA, images,
        system: personaSystem(SYSTEM_PROMPT, { charName: s.charName, charDesc: s.charDesc || charOf(getActiveProfile()).desc, brand: s.brand, focus: s.focus }),
        prompt: buildVisitPrompt(v, { handle: s.handle, photos: pics.length }),
      });
      body = normalizeContent(extractJson(text), { recipe: 'visit', category: 'OUTING', title: v.place });
      body.category = (s.topics || TOPIC_KEYS()).includes('OUTING') ? 'OUTING' : (s.topics || TOPIC_KEYS())[0];
    } else {
      body = templateVisit(v, { handle: s.handle, photos: pics.length });
      if (!(s.topics || TOPIC_KEYS()).includes('OUTING')) body.category = (s.topics || TOPIC_KEYS())[0];
    }
    body = renameCharacter(body, s.charName, charOf(getActiveProfile()).emoji);
    const c = {
      id: newId(), createdAt: new Date().toISOString(), status: 'draft', model: provider,
      modelName: provider === 'template' ? '템플릿' : s.models[provider], format: s.format || DEFAULT_FORMAT, theme: 'soft',
      news: { title: v.place || body.title, category: body.category, source: '직접 방문', sources: [] },
      ...body, recipe: 'visit', ...(showChar === undefined ? {} : { showChar }),
    };
    saveContent(c);
    // 사진 카드에 사진을 순서대로, 장소 카드에는 첫 사진을 넣는다
    let k = 0;
    for (let i = 0; i < c.cards.length; i++) {
      const lay = c.cards[i].layout;
      if (lay === 'photo' && pics[k]) await putBg(`${c.id}:${i}`, pics[k++]);
      else if (lay === 'place' && pics[0]) await putBg(`${c.id}:${i}`, pics[0]);
    }
    closeModal();
    void box;
    toast('"다녀왔어요" 카드뉴스를 만들었어요!');
    location.hash = `#/editor/${c.id}`;
    return c;
  } catch (e) {
    closeModal(); toast(`만들기 실패: ${e.message}`, true);
    return null;
  }
}

function setDraftNews(n) { sessionStorage.setItem('moa.draftNews', JSON.stringify(n)); }
function getDraftNews() { try { return JSON.parse(sessionStorage.getItem('moa.draftNews')) || null; } catch { return null; } }

// ---------- 라우터 ----------
let SHORTS = null;
const shortsRoute = (arg) => {
  if (!SHORTS) SHORTS = createShortsViews({ $, $$, esc, toast, modal, closeModal, download, view, renderEnv, safeName, ensureProfileFor, charSrc, createVisit, loadBgs });
  return arg ? SHORTS.editorView(arg) : SHORTS.listView();
};
const routes = { care: careView, dashboard, shorts: shortsRoute, intro: () => createIntro(), topics: topicsView, news: newsView, trends: trendsView, create: createView, editor: editorView, contents: contentsView, settings: settingsView };
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
    <div class="scores"><span><b style="color:var(--brown)">${esc(BR().fit)}</b></span><div class="meter"><i style="width:${n.moaScore}%"></i></div><b style="color:var(--brown)">${n.moaScore}</b>
      <span>화제성</span><div class="meter"><i style="width:${n.buzzScore}%;background:var(--green)"></i></div><span>${n.buzzScore}</span></div>
    ${n.reason ? `<div class="small">${BR().emoji} ${esc(n.reason)}</div>` : ''}
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
  const data = scopeNews(await loadNews());
  const contents = mineOnly(listContents());
  const cnt = (s) => contents.filter((c) => c.status === s).length;
  const top = pickTop(data.items, 3);
  const keys = availableProviders();
  const b = BR();
  view.innerHTML = `
  <section class="hero">
    <div>
      <h1>${esc(b.slogan)}</h1>
      <p class="sub" style="margin-bottom:16px">${b.happy ? '육아·아기용품·생활용품·생활템 소식을 고르면' : '오늘의 뉴스를 고르면'} AI가 카드뉴스·캡션·해시태그까지 한 번에 만들어요.</p>
      <div class="row">
        <button class="btn primary big" id="oneclick">${b.emoji} 오늘의 콘텐츠 만들기</button>
        <a class="btn big" href="#/news">오늘의 뉴스 보기</a>
        <button class="btn big pink" id="intro">${b.emoji} 첫 게시물 (${esc(b.name)} 소개)</button>
      </div>
    </div>
    <img src="${esc(charSrc())}" alt="캐릭터" class="bounce">
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
  return `<div class="panel empty"><img src="${esc(charSrc())}" alt=""><p>아직 수집된 뉴스가 없어요.<br>${esc((data.errors || []).join(' / '))}</p>
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
  const data = scopeNews(await loadNews());
  view.innerHTML = `
  <h1>📰 오늘의 뉴스</h1>
  <p class="sub">${BR().happy ? `육아·아기용품·생활용품·생활템 뉴스만 모아, ${esc(BR().fit)}(최근성·화제성·부모 관심·생활 연관·설명 용이·카드뉴스 적합)로 정렬했어요.` : '최근 24시간 뉴스를 같은 사건끼리 묶고, MOA 적합도(최근성·화제성·SNS 확산·2040 여성 관심·생활 연관·설명 용이·카드뉴스 적합)로 정렬했어요.'}</p>
  <div class="row" style="margin-bottom:16px">
    <select id="f-cat"><option value="">전체 카테고리</option>${TOPICS().map(([k]) => `<option value="${k}">${esc(catLabel(k))}</option>`).join('')}</select>
    <select id="f-sort"><option value="moa">${esc(BR().fit)}순</option><option value="new">최신순</option><option value="buzz">화제성순</option></select>
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
  const data = scopeNews(await loadNews());
  const key = BR().topics.includes(cat) ? cat : BR().topics[0];
  const c = CATEGORIES[key];
  const items = data.items.filter((n) => n.category === key).sort((a, b) => b.moaScore - a.moaScore);
  const mine = mineOnly(listContents()).filter((x) => x.category === key);
  view.innerHTML = `
  <h1>🧺 주제별 콘텐츠</h1>
  <p class="sub">${esc(BR().name)} 계정의 주제별로 오늘의 뉴스를 모아 보고, 주제에 맞는 톤으로 카드뉴스를 만들어요.</p>
  <div class="tabs">${TOPICS().map(([k, v]) => `<a href="#/topics/${k}" class="${k === key ? 'on' : ''}" style="--c:${v.color}">${v.emoji} ${esc(v.name)} <span>${data.items.filter((n) => n.category === k).length}</span></a>`).join('')}</div>
  <section class="panel topic-head" style="--c:${c.color}">
    <div class="row"><span class="topic-emoji big">${c.emoji}</span><div><h2 style="margin:0">${esc(c.label)}</h2><div class="muted">${esc(c.desc)}</div></div></div>
    <p class="small" style="margin:12px 0 6px"><b>${esc(BR().name)} 작성 원칙</b> · ${esc(c.guide)}</p>
    <p class="small muted" style="margin:0">기본 해시태그: ${[BR().baseTag, ...c.tags].map((t) => `#${esc(t)}`).join(' ')}</p>
    <div class="row" style="margin-top:14px">
      ${recipeSelect('t-recipe', CATEGORIES[key]?.recipe && BR().happy ? CATEGORIES[key].recipe : 'auto')}
      <button class="btn primary" id="t-one" ${items.length ? '' : 'disabled'}>${BR().emoji} 이 주제 1위 뉴스로 만들기</button>
      <button class="btn" id="t-three" ${items.length ? '' : 'disabled'}>📦 이 주제 TOP 3 한 번에 만들기</button>
      <a class="btn" href="#/create" id="t-manual">✏️ 이 주제로 직접 입력</a>
    </div>
  </section>
  ${mine.length ? `<h2>내 ${esc(c.name)} 콘텐츠 (${mine.length})</h2><div class="row">${mine.slice(0, 8).map((x) => `<a class="chip" href="#/editor/${x.id}">${esc(x.title.slice(0, 28))} · ${esc(STATUSES[x.status])}</a>`).join('')}</div>` : ''}
  <h2>${esc(c.name)} 뉴스 ${items.length}건</h2>
  ${items.length ? `<div class="grid">${items.map(newsCard).join('')}</div>` : `<div class="panel empty"><img src="${esc(charSrc())}" alt=""><p>오늘 이 주제로 수집된 뉴스가 없어요. 다음 수집(3시간마다)을 기다리거나 직접 입력해 주세요.</p></div>`}`;
  bindMake(view);
  const provider = () => { const s = getSettings(); return getKeys()[s.provider] ? s.provider : (availableProviders()[0] || 'template'); };
  $('#t-one').addEventListener('click', async () => {
    const out = await runGenerate(items.slice(0, 1), provider(), { webSearch: getSettings().webSearch, recipe: $('#t-recipe').value });
    if (out[0]) location.hash = `#/editor/${out[0].id}`;
  });
  $('#t-three').addEventListener('click', () => runGenerate(items.slice(0, 3), provider(), { webSearch: getSettings().webSearch, recipe: $('#t-recipe').value }, { status: 'done', zip: true }));
  $('#t-manual').addEventListener('click', () => setDraftNews({ category: key, title: '', summary: '', url: '', source: '', sources: [] }));
}

// ---------- 트렌드 ----------
async function trendsView() {
  const data = scopeNews(await loadNews());
  const trends = data.trends || [];
  view.innerHTML = `
  <h1>🔥 트렌드</h1>
  ${BR().happy ? `<p class="sub">요즘 부모들이 많이 보는 육아·아기용품·생활템 화제(여러 언론이 함께 다룬 순)와, 실시간 검색어 중 육아·생활 관련 키워드예요.</p>
  <h2>👶 육아·생활템 화제</h2>
  ${data.items.length ? `<div class="grid">${[...data.items].sort((a, b) => b.buzzScore - a.buzzScore || b.moaScore - a.moaScore).slice(0, 12).map(newsCard).join('')}</div>` : emptyNews(data)}
  <h2>🔎 실시간 검색어 중 육아·생활 관련</h2>
  ${trends.length ? '' : '<p class="small muted">지금은 육아·생활 관련 실시간 검색어가 없어요.</p>'}` : '<p class="sub">Google 트렌드 한국 실시간 인기 검색어와 관련 기사예요.</p>'}
  ${trends.length ? `<div class="grid">${trends.map((t, i) => `
    <article class="panel news">
      <div class="row"><span class="chip pink">#${i + 1}</span><span class="spacer"></span><span class="small muted">${esc(t.traffic || '')} 검색</span></div>
      <h3>${esc(t.keyword)}</h3>
      ${(t.news || []).map((n) => `<a class="small" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">· ${esc(n.title)} <span class="muted">${esc(n.name)}</span></a>`).join('')}
      <div class="foot"><button class="btn primary sm" data-trend="${i}">이 키워드로 카드뉴스 만들기</button></div>
    </article>`).join('')}</div>` : BR().happy ? '' : emptyNews(data)}`;
  bindMake(view);
  $$('[data-trend]').forEach((b) => b.addEventListener('click', () => {
    const t = trends[+b.dataset.trend];
    const first = t.news?.[0];
    setDraftNews({
      id: `t${Date.now()}`, category: BR().happy ? 'ITEM' : 'TREND', title: first ? `${t.keyword}: ${first.title}` : t.keyword,
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
  const n = getDraftNews() || { category: BR().topics[0] || 'NEWS', title: '', summary: '', url: '', source: '', sources: [] };
  view.innerHTML = `
  <h1>✏️ 콘텐츠 만들기</h1>
  <p class="sub">뉴스를 확인하고 AI 모델을 고른 뒤 “자동으로 만들어줘”를 누르세요. 카드 원고·${esc(BR().name)} 포즈·캡션·해시태그가 한 번에 만들어져요.${BR().happy ? ' 해피해피 계정은 육아·아기·생활용품·생활템 관점으로 원고를 써요.' : ''}</p>
  <section class="panel visit-box">
    <h3>📍 다녀왔어요 — 내 사진·영상으로 카드뉴스</h3>
    <p class="small muted" style="margin:0 0 10px">직접 다녀온 곳의 사진·영상을 올리고 대충 메모하면, 사진을 화면 가득 쓴 "다녀왔어요" 카드뉴스를 만들어요. 첫 사진이 표지가 되고, 영상은 장면 하나를 사진으로 뽑아 써요. 숏폼으로 올릴 땐 🎬 숏폼 만들기에서 "📍 다녀왔어요" 컨셉을 고르세요.</p>
    <div class="two">
      <div class="field"><label for="v-title">썸네일 제목</label><textarea id="v-title" rows="2">아기랑 여기
다녀왔어요!</textarea></div>
      <div class="field"><label for="v-place">장소 이름</label><input type="text" id="v-place" placeholder="예: 키즈랜드 판교점"></div>
    </div>
    <div class="two">
      <div class="field"><label for="v-area">위치</label><input type="text" id="v-area" placeholder="예: 경기 성남 판교"></div>
      <div class="field"><label for="v-hours">운영 시간</label><input type="text" id="v-hours" placeholder="예: 10:00~20:00 (월 휴무)"></div>
      <div class="field"><label for="v-fee">요금</label><input type="text" id="v-fee" placeholder="예: 아이 2시간 18,000원"></div>
      <div class="field"><label for="v-age">추천 나이</label><input type="text" id="v-age" placeholder="예: 12개월~5세"></div>
    </div>
    <div class="field"><label for="v-extra">편의시설 (선택)</label><input type="text" id="v-extra" placeholder="예: 주차 2시간 무료 · 수유실 · 유모차 대여"></div>
    <div class="field"><label for="v-memo">메모 (대충 적어도 돼요)</label><textarea id="v-memo" rows="4" placeholder="예) 평일 오전이라 한산했음. 볼풀이 엄청 큼. 수유실 깨끗함. 2층 카페에서 커피 마시면서 볼 수 있음. 주차는 지하 2시간 무료."></textarea></div>
    <div class="row">
      <label class="btn">🖼️ 사진·영상 선택 (최대 8개)<input type="file" id="v-files" accept="image/*,video/*" multiple hidden></label>
      <label class="small"><input type="checkbox" id="v-char" ${getSettings().showChar !== false ? 'checked' : ''}> ${esc(BR().name)} 캐릭터 넣기</label>
      <span class="small muted" id="v-count"></span>
    </div>
    <div class="visit-thumbs" id="v-thumbs"></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="v-ai">✨ AI로 다녀왔어요 카드 만들기</button><button class="btn" id="v-tpl">📄 AI 없이 만들기</button></div>
  </section>
  <section class="panel url-box">
    <h3>🔗 뉴스 기사 URL로 바로 만들기</h3>
    <p class="small muted" style="margin:0 0 10px">기사 주소를 붙여넣으면 AI가 기사를 직접 읽고 카드뉴스를 만들어요. (Claude·Gemini·GPT 키 필요, 주제는 AI가 판단)</p>
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
  <div class="row" style="margin:14px 0"><span class="small muted">또는 아래에 뉴스 정보를 직접 채워서 만들기</span><span class="spacer"></span><button class="btn sm pink" id="c-intro">${BR().emoji} 첫 게시물 (${esc(BR().name)} 소개) 만들기</button></div>
  <div class="editor" style="grid-template-columns:minmax(0,1fr) 360px">
    <section class="panel">
      <h3>뉴스 정보</h3>
      <div class="two">
        <div class="field"><label for="n-cat">카테고리</label><select id="n-cat">${catOptions(n.category)}</select></div>
        <div class="field"><label for="n-src">대표 출처</label><input type="text" id="n-src" value="${esc(n.source)}" placeholder="예: 연합뉴스"></div>
      </div>
      <div class="field"><label for="n-title">제목</label><input type="text" id="n-title" value="${esc(n.title)}" placeholder="뉴스 제목"></div>
      <div class="field"><label for="n-url">원문 링크</label><input type="url" id="n-url" value="${esc(n.url)}" placeholder="https://"></div>
      <div class="field"><label for="n-sum">요약 / 메모</label><textarea id="n-sum" rows="2">${esc(n.summary)}</textarea></div>
      ${n.sources?.length ? `<div class="field"><label>같은 사건의 다른 보도 (${n.sources.length})</label><div class="small">${n.sources.slice(0, 8).map((x) => `<div>· <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a> <span class="muted">${esc(x.name)}</span></div>`).join('')}</div></div>` : ''}
      <div class="field"><label for="n-body">기사 본문 붙여넣기 (권장)</label>
        <textarea id="n-body" rows="8" placeholder="원문 기사 본문을 붙여넣으면 AI가 더 정확하게 씁니다. 비워두면 제목·관련 보도만 참고하거나, 웹 검색을 켜서 사실을 확인해요."></textarea></div>
      <div class="field"><label for="n-extra">추가 요청 (선택)</label><input type="text" id="n-extra" placeholder="${BR().happy ? '예: 돌 전 아기 기준으로, 가성비 위주로, 서울·경기 장소로' : '예: 직장인 관점으로, 숫자 위주로'}"></div>
      <div class="field"><label for="n-recipe">카드뉴스 형식</label>${recipeSelect('n-recipe')}</div>
    </section>
    <section class="panel">
      <h3>AI 모델</h3>
      <div class="seg" id="prov">${Object.entries(PROVIDERS).map(([k, p]) => `<button type="button" data-p="${k}" class="${k === s.provider ? 'on' : ''}">${p.label}${keys[k] ? '' : ' ·키 없음'}</button>`).join('')}</div>
      <p class="small muted" id="prov-model"></p>
      <label class="row small" style="margin:10px 0 4px"><input type="checkbox" id="readarticle" ${s.readArticle !== false ? 'checked' : ''}> 기사 원문을 AI가 직접 읽고 분석 (권장 · 링크가 있을 때)</label>
      <label class="row small" style="margin:4px 0 10px"><input type="checkbox" id="websearch" ${s.webSearch ? 'checked' : ''}> 웹 검색으로 사실 확인 (더 정확, 더 느림)</label>
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
  // 📍 다녀왔어요
  const vPhotos = [];
  const drawV = () => {
    $('#v-thumbs').innerHTML = vPhotos.map((b, i) => `<figure><img src="${URL.createObjectURL(b)}" alt="사진 ${i + 1}"><figcaption>${i ? i + 1 : '표지'}</figcaption><button type="button" class="btn sm" data-v-rm="${i}" aria-label="삭제">✕</button></figure>`).join('');
    $('#v-count').textContent = vPhotos.length ? `${vPhotos.length}개 선택됨` : '';
    $$('[data-v-rm]').forEach((b) => b.addEventListener('click', () => { vPhotos.splice(+b.dataset.vRm, 1); drawV(); }));
  };
  $('#v-files').addEventListener('change', async (e) => {
    for (const f of [...e.target.files]) {
      if (vPhotos.length >= 8) break;
      try { vPhotos.push(await fileToPhoto(f)); } catch { toast(`${f.name}을(를) 읽지 못했어요.`, true); }
    }
    e.target.value = ''; drawV();
  });
  const visitInput = () => ({ title: $('#v-title').value, place: $('#v-place').value.trim(), area: $('#v-area').value.trim(), hours: $('#v-hours').value.trim(), fee: $('#v-fee').value.trim(), age: $('#v-age').value.trim(), extra: $('#v-extra').value.trim(), memo: $('#v-memo').value.trim() });
  const runVisit = (mode) => {
    if (!vPhotos.length) { toast('사진이나 영상을 한 개 이상 올려 주세요.', true); return; }
    const p = keys[provider] ? provider : availableProviders()[0];
    if (mode === 'ai' && !p) { toast('AI 키가 없어요. 설정에서 넣거나 "AI 없이 만들기"를 써 주세요.', true); return; }
    createVisit(visitInput(), vPhotos, { provider: mode === 'ai' ? p : 'template', showChar: $('#v-char').checked });
  };
  $('#v-ai').addEventListener('click', () => runVisit('ai'));
  $('#v-tpl').addEventListener('click', () => runVisit('tpl'));
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
    const c = await runGenerate([nn], p, { images: shots, extra: $('#n-extra').value.trim(), recipe: $('#n-recipe').value });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#u-url').addEventListener('paste', () => setTimeout(() => $('#u-url').value && $('#u-go').focus(), 0));
  $('#u-go').addEventListener('click', async () => {
    const url = $('#u-url').value.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) { toast('기사 주소(https://…)를 붙여넣어 주세요.', true); return; }
    const p = keys[provider] ? provider : availableProviders()[0];
    if (!p) { toast('URL로 만들려면 설정에서 AI API 키를 하나 이상 넣어 주세요.', true); return; }
    const nn = { id: `u${Date.now()}`, category: '', title: '', url, source: '', sources: [{ name: '', title: '', url }], summary: '' };
    const c = await runGenerate([nn], p, { fromUrl: true, extra: $('#n-extra').value.trim(), recipe: $('#n-recipe').value });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#go').addEventListener('click', async () => {
    const nn = guard(); if (!nn) return;
    if (!keys[provider]) { toast(`${PROVIDERS[provider].label} API 키가 없어요. 설정에서 넣거나 템플릿으로 만들어 주세요.`, true); return; }
    const c = await runGenerate([nn], provider, { webSearch: $('#websearch').checked, readArticle: $('#readarticle').checked, extra: $('#n-extra').value.trim(), recipe: $('#n-recipe').value });
    if (c[0]) location.hash = `#/editor/${c[0].id}`;
  });
  $('#tpl').addEventListener('click', async () => {
    const nn = guard(); if (!nn) return;
    const c = await runGenerate([nn], 'template', { recipe: $('#n-recipe').value });
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
  // 기사 링크가 있으면 AI가 원문을 직접 읽고 분석하게 한다 (설정에서 끌 수 있음)
  if (provider !== 'template' && s.readArticle !== false && news.url && !opts.images?.length && opts.readArticle !== false) opts = { ...opts, fromUrl: true };
  // 카드뉴스 형식: 직접 고른 형식, 아니면 해피해피는 주제별 기본 형식(나들이→장소, 생활템→추천템…)
  const recipe = opts.recipe && opts.recipe !== 'auto' ? opts.recipe : (s.focus ? (CATEGORIES[news.category]?.recipe || 'news') : 'news');
  news = { ...news, recipe };
  if (provider === 'template') {
    body = news.guide ? templateGuide(news, { handle: s.handle }) : recipe !== 'news' ? templateRecipe(news, recipe, { handle: s.handle }) : templateContent(news, { handle: s.handle });
  } else {
    const text = await callModel(provider, {
      apiKey: getKeys()[provider], model: s.models[provider], system: personaSystem(SYSTEM_PROMPT, { charName: s.charName, charDesc: s.charDesc || charOf(getActiveProfile()).desc, brand: s.brand, focus: s.focus }),
      prompt: buildContentPrompt(news, { ...opts, handle: s.handle }), images: opts.images, schema: CONTENT_SCHEMA, webSearch: !!opts.webSearch, fetchUrl: !!opts.fromUrl, browser: true,
    });
    body = normalizeContent(extractJson(text), news);
  }
  body = renameCharacter(body, s.charName, charOf(getActiveProfile()).emoji);
  // 주제는 사용자가 고른 값(자동 분류 또는 직접 변경)을 따른다. URL로 만들 때는 AI 판단을 쓴다
  if (CATEGORIES[news.category]) body.category = news.category;
  // 계정 주제 밖이면 계정 첫 주제로 (해피해피는 육아·아기·생활용품·생활템만)
  const topics = (s.topics || TOPIC_KEYS());
  if (!topics.includes(body.category)) body.category = topics[0];
  // 예전 계정 표기(@moa)가 남아 있으면 현재 계정으로 바꾼다
  if (s.handle) body.caption = (body.caption || '').replace(/@moa(?![\w.])/g, s.handle);
  if (s.focus) body.caption = (body.caption || '').replace('매일 쉬운 뉴스 받기', '육아·살림 꿀정보 받기');
  // 원문 기사(언론사·제목·날짜·링크)를 캡션 끝에 (육아 정보 주제는 기사가 아니라 공식 자료가 근거라 따로 처리)
  if (news.guide) finalizeGuide(body, news.guide);
  else {
    body.caption = withArticleLink(body.caption, { ...news, title: news.title || body.title }, body.sources || []);
    if (s.focus && body.category === 'PARENTING' && !String(body.caption).includes('아기마다 달라요')) body.caption += `\n\n※ ${GUIDE_DISCLAIMER}`;
  }
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
  const box = modal(`<div data-busy><h2 style="margin-top:0">${BR().emoji} ${esc(BR().name)}가 만드는 중…</h2>
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
    try { await downloadZip(out, `${safeName(getSettings().brand || 'MOA')}_${today()}.zip`); } catch (err) { toast(err.message, true); }
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
    format: s.format || DEFAULT_FORMAT, news: { title: `${s.charName} 소개` }, ...(getActiveProfile().char === 'happy' ? introContentHappy() : renameCharacter(introContent(), s.charName, charOf(getActiveProfile()).emoji)),
  };
  if (s.handle) c.caption = (c.caption || '').replace(/@moa(\.story)?(?![\w.])/g, s.handle);
  saveContent(c);
  toast(`첫 게시물(${s.charName} 소개)을 만들었어요.`);
  location.replace(`#/editor/${c.id}`); // 뒤로 가기로 다시 만들어지지 않게
}

// ---------- 원클릭 ----------
async function oneClick() {
  const data = scopeNews(await loadNews());
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
const LAYOUT_LABEL = { auto: '자동', big: '큰 제목', text: '설명형', list: '리스트', number: '큰 숫자', compare: '좌우 비교', keyword: '키워드 강조', cta: 'CTA', product: '추천템 카드', place: '장소 카드' };
// 카드뉴스 형식 선택 (자동 = 주제에 맞게)
const recipeSelect = (id, cur = 'auto') => `<select id="${id}" title="카드뉴스 형식"><option value="auto" ${cur === 'auto' ? 'selected' : ''}>✨ 형식: 주제에 맞게 자동</option>${Object.entries(RECIPES).filter(([, v]) => !v.own).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
// 장 순서가 바뀌면 장별 배경 이미지도 같은 장을 따라가게 옮긴다 (order[새 위치] = 예전 위치)
async function remapBgs(cid, order) {
  const old = await getBgsFor(cid);
  for (const k of Object.keys(old)) await deleteBg(k);
  for (let ni = 0; ni < order.length; ni++) { const b = old[`${cid}:${order[ni]}`]; if (b) await putBg(`${cid}:${ni}`, b); }
}
let EDITOR_START = 0;

async function editorView(id) {
  const c = getContent(id);
  if (!c) { view.innerHTML = '<div class="empty">콘텐츠를 찾을 수 없어요. <a href="#/contents">내 콘텐츠</a></div>'; return; }
  ensureProfileFor(c);
  const env = await renderEnv();
  env.bgs = await loadBgs(c.id);
  c.format = c.format || DEFAULT_FORMAT;
  let cur = Math.min(EDITOR_START, c.cards.length - 1);
  EDITOR_START = 0;
  view.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <input type="text" id="e-title" value="${esc(c.title)}" style="max-width:520px;font-weight:800;font-size:18px">
    <select id="e-status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="small" for="e-cat" style="font-weight:700;color:var(--brown)">주제</label>
    <select id="e-cat">${catOptions(c.category)}</select>
    <label class="small" for="e-theme" style="font-weight:700;color:var(--brown)">디자인</label>
    <select id="e-theme">${Object.keys(DECK_THEMES).map((k) => `<option value="${k}" ${k === deckTheme(c, env.settings) ? 'selected' : ''}>${esc(deckThemeLabel(k, BR().name).split(' (')[0])}</option>`).join('')}</select>
    <label class="small" for="e-char" style="font-weight:700;color:var(--brown)">캐릭터</label>
    <select id="e-char"><option value="" ${c.showChar === undefined ? 'selected' : ''}>계정 설정 따름</option><option value="on" ${c.showChar === true ? 'selected' : ''}>넣기</option><option value="off" ${c.showChar === false ? 'selected' : ''}>빼기</option></select>
    <label class="small" for="e-format" style="font-weight:700;color:var(--brown)">크기</label>
    <select id="e-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === c.format ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <span class="chip">${esc(PROVIDERS[c.model]?.label || '템플릿')} · ${esc(c.modelName || '')}</span>
    <span class="spacer"></span>
    <button class="btn" id="e-png">⬇️ 이 카드 PNG</button>
    <button class="btn" id="e-short" title="이 카드뉴스를 9:16 영상(숏폼)으로 만들어요">🎬 AI 숏폼 만들기</button>
    <button class="btn primary" id="e-zip">📦 전체 ZIP</button>
  </div>
  ${c.factNotes?.length ? `<div class="notice"><b>확인이 필요한 내용</b><ul style="margin:6px 0 0;padding-left:18px">${c.factNotes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
  <div class="editor">
    <div class="thumbs" id="thumbs">${c.cards.map((k, i) => `<button data-i="${i}" aria-label="${i + 1}번 카드"><canvas></canvas><span>${String(i + 1).padStart(2, '0')}</span></button>`).join('')}</div>
    <div class="stage"><canvas id="stage" width="1080" height="1080"></canvas>
      <div class="row"><button class="btn sm" id="prev">◀ 이전</button><span class="small muted" id="pageinfo"></span><button class="btn sm" id="next">다음 ▶</button></div>
    </div>
    <aside class="panel edit-panel" id="panel"></aside>
  </div>
  ${guidePanelHtml(c)}
  <section class="panel" style="margin-top:22px">
    <div class="row"><h3 style="margin:0">📝 인스타그램 캡션</h3><span class="spacer"></span><button class="btn sm" id="cap-copy">캡션 + 해시태그 복사</button></div>
    <div class="field" style="margin-top:10px"><textarea id="cap" rows="9">${esc(c.caption)}</textarea></div>
    <div class="field"><label for="tags">해시태그 (띄어쓰기로 구분, ${c.hashtags.length}개)</label><input type="text" id="tags" value="${esc(c.hashtags.map((h) => `#${h}`).join(' '))}"></div>
    ${(() => { const ai = articleInfo(c.news || {}, c.sources || []); return ai.anyLink ? `<div class="link-box">
      <div class="row" style="flex-wrap:nowrap"><b class="small">🔗 원문 기사 링크</b><input type="text" id="art-link" value="${esc(ai.anyLink)}" readonly style="flex:1"><button class="btn sm" id="art-copy">링크 복사</button><a class="btn sm" href="${esc(ai.anyLink)}" target="_blank" rel="noopener noreferrer">열기</a>${c.caption?.includes('📰 원문 기사') ? '' : '<button class="btn sm" id="art-add">캡션에 원문 기사 넣기</button>'}</div>
      <div class="small muted">인스타그램 캡션 속 링크는 눌리지 않아요. 이 링크를 <b>프로필 편집 → 링크</b>나 <b>스토리 링크 스티커</b>에 붙여 넣고, 캡션에는 "원문 링크는 프로필에"처럼 안내해 주세요.${ai.link ? '' : ' (언론사 주소를 찾지 못해 구글 뉴스 연결 주소예요 — 캡션에는 언론사·제목만 넣었어요.)'}</div>
    </div>` : ''; })()}
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
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">${String(cur + 1).padStart(2, '0')} · ${esc(k.type)}</h3>
        <div class="row slide-tools"><button class="btn sm" id="sl-up" ${cur ? '' : 'disabled'} title="앞으로">◀</button><button class="btn sm" id="sl-down" ${cur < c.cards.length - 1 ? '' : 'disabled'} title="뒤로">▶</button><button class="btn sm" id="sl-dup" title="이 장 복제">⧉ 복제</button><button class="btn sm danger" id="sl-del" ${c.cards.length > 2 ? '' : 'disabled'}>🗑 이 장 삭제</button></div></div>
      <div class="two">
        <div class="field"><label>레이아웃</label><select data-k="layout">${LAYOUTS.map((l) => `<option value="${l}" ${l === k.layout ? 'selected' : ''}>${LAYOUT_LABEL[l]}${l === 'auto' ? ` (${LAYOUT_LABEL[lay]})` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(BR().name)} 포즈</label><select data-k="pose">${Object.entries(POSES).map(([p, l]) => `<option value="${p}" ${p === k.pose ? 'selected' : ''}>${l}${p === DEFAULT_POSE[k.type] ? ' (추천)' : ''}</option>`).join('')}</select></div>
      </div>
      ${k.type === 'LIFE/CHECK' || k.type === 'SO WHAT' ? `<div class="field"><label>정보 유형 (리스트는 "라벨: 내용" 형식이면 라벨이 강조돼요)</label><select data-k="kind">${Object.entries(PRACTICAL_KINDS).map(([kk, v]) => `<option value="${kk}" ${kk === (k.kind || 'none') ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>제목</label><textarea data-k="title" rows="2">${esc(k.title)}</textarea></div>
      <div class="field"><label>본문</label><textarea data-k="body" rows="3">${esc(k.body)}</textarea></div>
      <div class="field"><label>강조 문구 (제목·본문 안의 단어)</label><input type="text" data-k="highlight" value="${esc(k.highlight)}"></div>
      <div class="field"><label>리스트 (한 줄에 하나, 3~5개)</label><textarea data-k="items" rows="4">${esc((k.items || []).join('\n'))}</textarea></div>
      ${['product', 'place'].includes(lay) || k.specs?.length ? `<div class="field"><label>${lay === 'place' ? '장소 정보' : '추천템 정보'} (한 줄에 "항목: 내용", 최대 4줄)</label><textarea id="k-specs" rows="4" placeholder="${lay === 'place' ? '위치: 경기 용인\n운영: 10:00~18:00\n요금: 아이 1만 원\n추천 나이: 12개월 이상' : '가격대: 1만 원대\n추천 대상: 6개월 이상\n포인트: 한 손으로 접혀요'}">${esc((k.specs || []).map((x) => `${x.k}: ${x.v}`).join('\n'))}</textarea></div>
      <div class="field"><label>그림 이모지 (사진이 없을 때 표시 · 아래 "배경 이미지"로 실제 사진을 넣을 수 있어요)</label><input type="text" data-k="emoji" value="${esc(k.emoji || '')}" maxlength="4" style="max-width:120px"></div>` : ''}
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
      <div class="field"><label>${esc(BR().name)}의 한마디 (말풍선)</label><input type="text" data-k="moaSays" value="${esc(k.moaSays)}" maxlength="24"></div>
      <h3 style="margin-top:16px">디자인</h3>
      <div class="two">
        <div class="field"><label>${esc(BR().name)} 위치</label><select data-s="moaPos">${Object.entries(POS_LABEL).map(([p, l]) => `<option value="${p}" ${p === (st.moaPos || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>좌우 반전</label><select data-s="moaFlip"><option value="">아니요</option><option value="1" ${st.moaFlip ? 'selected' : ''}>네</option></select></div>
      </div>
      <div class="field"><label>${esc(BR().name)} 크기 <span class="muted" id="v-ms">${Math.round((st.moaScale || 1) * 100)}%</span></label><input type="range" min="0.5" max="1.5" step="0.05" data-s="moaScale" value="${st.moaScale || 1}"></div>
      <div class="field"><label>글자 크기 <span class="muted" id="v-fs">${Math.round((st.fontScale || 1) * 100)}%</span></label><input type="range" min="0.7" max="1.3" step="0.05" data-s="fontScale" value="${st.fontScale || 1}"></div>
      <div class="row">
        <label class="small">배경 <input type="color" data-s="bg" value="${st.bg || env.settings.theme.bg}"></label>
        <label class="small">강조색 <input type="color" data-s="accent" value="${st.accent || env.settings.theme.pink}"></label>
        <label class="small">글자색 <input type="color" data-s="textColor" value="${st.textColor || env.settings.theme.brown}"></label>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm" id="style-all">이 디자인을 모든 장에 적용</button>
        <button class="btn sm" id="style-reset">디자인 초기화</button>
      </div>
      <h3 style="margin-top:18px">${lay === 'photo' ? '📷 사진 (이 장에 꽉 차게 들어가요)' : '배경 이미지'}</h3>
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
    $('#k-specs')?.addEventListener('input', (e) => {
      k.specs = e.target.value.split('\n').map((ln) => { const i = ln.indexOf(':'); return i > 0 ? { k: ln.slice(0, i).trim(), v: ln.slice(i + 1).trim() } : null; }).filter((x) => x && x.k && x.v).slice(0, 5);
      persist(); redraw();
    });
    // 장 순서 바꾸기·복제·삭제 (장별 배경 이미지도 같이 옮김)
    const reorder = async (order, focus, cards) => {
      c.cards = cards || order.map((i) => c.cards[i]);
      clearTimeout(saveTimer); saveContent(c); // 바로 저장해야 다시 열 때 바뀐 순서가 보인다
      await remapBgs(c.id, order);
      EDITOR_START = focus;
      editorView(c.id);
    };
    const idx = c.cards.map((_, i) => i);
    $('#sl-up').addEventListener('click', () => { const o = [...idx]; [o[cur - 1], o[cur]] = [o[cur], o[cur - 1]]; reorder(o, cur - 1); });
    $('#sl-down').addEventListener('click', () => { const o = [...idx]; [o[cur + 1], o[cur]] = [o[cur], o[cur + 1]]; reorder(o, cur + 1); });
    $('#sl-dup').addEventListener('click', () => {
      const o = [...idx.slice(0, cur + 1), cur, ...idx.slice(cur + 1)];
      reorder(o, cur + 1, o.map((i, n) => (n === cur + 1 ? JSON.parse(JSON.stringify(c.cards[i])) : c.cards[i])));
    });
    $('#sl-del').addEventListener('click', () => {
      if (!confirm(`${cur + 1}번째 장을 삭제할까요?`)) return;
      reorder(idx.filter((i) => i !== cur), Math.max(0, cur - 1));
    });
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
      persist(); await drawAll(); toast('모든 장에 적용했어요.');
    });
    $('#style-reset').addEventListener('click', () => { k.style = {}; persist(); fillPanel(); redraw(); });
  }

  $$('#thumbs button').forEach((b) => b.addEventListener('click', () => select(+b.dataset.i)));
  $('#prev').addEventListener('click', () => select(cur - 1));
  $('#next').addEventListener('click', () => select(cur + 1));
  $('#e-title').addEventListener('input', (e) => { c.title = e.target.value; persist(); });
  $('#e-status').addEventListener('change', (e) => {
    if (c.guide && ['scheduled', 'posted'].includes(e.target.value) && !reviewGuide(c).ready && !confirm('육아 정보 점검이 끝나지 않았어요(출처·표현·검수 체크). 그래도 이 상태로 바꿀까요?')) { e.target.value = c.status; return; }
    c.status = e.target.value; persist(); toast(`상태: ${STATUSES[c.status]}`);
  });
  $('#e-short').addEventListener('click', () => { clearTimeout(saveTimer); saveContent(c); createSlideShort(c); });
  ['age', 'nums', 'src'].forEach((k) => $(`#rv-${k}`)?.addEventListener('change', (e) => {
    c.review = { ...(c.review || {}), [{ age: 'age', nums: 'nums', src: 'sources' }[k]]: e.target.checked };
    persist();
    const rv = reviewGuide(c); const chip = $('#guide-chip');
    chip.textContent = rv.ready ? '✅ 발행 준비 완료' : '⚠️ 발행 전 점검 필요'; chip.classList.toggle('warn', !rv.ready);
  }));
  $('#guide-redo')?.addEventListener('click', () => {
    const t = loadTopics(getActiveProfile().id).find((x) => x.id === c.guide.topicId) || { id: '', title: c.guide.title, question: '', age: '', group: '' };
    makeCare(t, { format: c.guide.format || 'info_qa' });
  });
  $('#e-theme').addEventListener('change', async (e) => {
    c.theme = e.target.value; persist(); await drawAll(); await select(cur);
    if (c.theme === 'magazine' && !env.bgs[`${c.id}:0`]) toast('매거진 첫 장은 1장 편집 패널의 "AI 실사 커버 만들기"로 사진 배경을 넣을 수 있어요.');
  });
  $('#e-char').addEventListener('change', async (e) => { const v = e.target.value; if (v === 'on') c.showChar = true; else if (v === 'off') c.showChar = false; else delete c.showChar; persist(); await drawAll(); await select(cur); });
  $('#e-format').addEventListener('change', async (e) => { c.format = e.target.value; persist(); await drawAll(); await select(cur); });
  $('#e-cat').addEventListener('change', async (e) => { c.category = e.target.value; persist(); await drawAll(); await select(cur); });
  $('#cap').addEventListener('input', (e) => { c.caption = e.target.value; persist(); });
  $('#tags').addEventListener('input', (e) => { c.hashtags = e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#+/, '')).filter(Boolean); persist(); });
  $('#art-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#art-link').value); toast('원문 기사 링크를 복사했어요.'); } catch { $('#art-link').select(); toast('복사 권한이 없어요. 선택된 링크를 직접 복사해 주세요.', true); } });
  $('#art-add')?.addEventListener('click', () => { c.caption = withArticleLink(c.caption, c.news || {}, c.sources || []); $('#cap').value = c.caption; persist(); $('#art-add').remove(); toast('캡션 끝에 원문 기사를 넣었어요.'); });
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
  <p class="sub">이 브라우저에 저장된 <b>${esc(getActiveProfile().name)}</b> 계정의 카드뉴스예요. 다른 기기로 옮기려면 백업 파일을 내보내 가져오세요.</p>
  <div class="row" style="margin-bottom:14px">
    <input type="search" id="q" placeholder="제목 검색" style="max-width:220px">
    <select id="fc"><option value="">전체 카테고리</option>${BR().topics.map((k) => `<option value="${k}">${esc(catLabel(k))}</option>`).join('')}</select>
    <select id="fm"><option value="">전체 모델</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="template">템플릿</option></select>
    <select id="fs"><option value="">전체 상태</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <input type="date" id="fd" style="max-width:170px" title="생성일">
    <label class="small"><input type="checkbox" id="fall"> 모든 계정 보기</label>
    <span class="spacer"></span>
    <button class="btn sm" id="exp">백업 내보내기</button>
    <label class="btn sm">백업 가져오기<input type="file" id="imp" accept="application/json" hidden></label>
  </div>
  <div id="tbl"></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const [fc, fm, fs, fd] = ['#fc', '#fm', '#fs', '#fd'].map((s) => $(s).value);
    const rows = ($('#fall')?.checked ? listContents() : mineOnly(listContents())).filter((c) => (!q || c.title.toLowerCase().includes(q)) && (!fc || c.category === fc) && (!fm || c.model === fm) && (!fs || c.status === fs)
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
      : `<div class="panel empty"><img src="${esc(charSrc())}" alt=""><p>아직 만든 콘텐츠가 없어요.</p><a class="btn primary" href="#/news">뉴스 고르러 가기</a></div>`;
    $$('[data-cc]').forEach((s) => s.addEventListener('change', () => { const c = getContent(s.dataset.cc); c.category = s.value; saveContent(c); toast(`주제: ${CATEGORIES[c.category].label}`); }));
    $$('[data-st]').forEach((s) => s.addEventListener('change', () => { const c = getContent(s.dataset.st); c.status = s.value; saveContent(c); toast(`상태: ${STATUSES[c.status]}`); }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('이 콘텐츠를 삭제할까요?')) { deleteContent(b.dataset.del); draw(); } }));
    $$('[data-zip]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; const c = getContent(b.dataset.zip);
      try { await downloadZip([c], `${safeName(c.title)}.zip`); } catch (e) { toast(e.message, true); }
      b.disabled = false;
    }));
  };
  ['#q', '#fc', '#fm', '#fs', '#fd', '#fall'].forEach((s) => $(s).addEventListener('input', draw));
  $('#exp').addEventListener('click', () => download(new Blob([JSON.stringify(listContents(), null, 1)], { type: 'application/json' }), `moa_backup_${today()}.json`));
  $('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = importContents(JSON.parse(await f.text())); toast(`${n}개를 가져왔어요.`); draw(); } catch { toast('백업 파일을 읽지 못했어요.', true); }
  });
  draw();
}


// ---------- 👶 오늘의 육아정보 (해피해피) ----------
const careFormats = () => Object.entries(RECIPES).filter(([, v]) => v.info);
const careFmtSelect = (id, cur) => `<select id="${id}" class="care-fmt" title="카드뉴스 형식">${careFormats().map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
let CARE_TAB = 'guide';
let CARE_AGE = '';

function createSlideShort(c) {
  const p = buildSlideProject(c, getSettings());
  saveShort(p);
  location.hash = `#/shorts/${p.id}`;
}

// 주제(또는 기사) → 카드뉴스 → (선택) AI 숏폼
async function makeCare(topic, { format, withShort = false } = {}) {
  const s = getSettings();
  const keys = getKeys();
  const provider = keys[s.provider] ? s.provider : (availableProviders()[0] || 'template');
  if (provider === 'template' && !confirm('AI 키가 없어요. 공식 자료를 찾아 쓰는 일은 AI가 해야 해서, 지금은 구조만 있는 빈 틀로 만들어요. 내용은 직접 채워야 해요. 계속할까요?')) return null;
  const prof = getActiveProfile();
  const news = {
    id: `g${Date.now()}`, category: 'PARENTING', title: topic.title, summary: topic.question || '', url: '', source: '', sources: [],
    guide: { topicId: topic.id, title: topic.title, age: ageLabel(topic.age), group: groupLabel(topic.group), format },
  };
  const out = await runGenerate([news], provider, { webSearch: true, recipe: format });
  if (!out[0]) return null;
  if (topic.id) markTopicDone(prof.id, topic.id, out[0].id, out[0].checkedAt || new Date().toISOString());
  if (withShort) createSlideShort(out[0]); else location.hash = `#/editor/${out[0].id}`;
  return out[0];
}

async function careView() {
  const b = BR();
  if (!b.happy) { location.replace('#/dashboard'); return; }
  const prof = getActiveProfile();
  const data = scopeNews(await loadNews());
  const keys = getKeys();
  const hasAI = availableProviders().length > 0;
  view.innerHTML = `
  <h1>👶 오늘의 육아정보</h1>
  <p class="sub">공식 자료를 근거로 육아 정보를 카드뉴스와 AI 숏폼으로 만들어요. 인스타·유튜브·네이버 캡션까지 한 번에 나와요.</p>
  <div class="notice small">모든 육아 정보 콘텐츠에는 <b>출처·확인일·면책 문구</b>가 자동으로 들어가고, 발행 전에 출처·표현·검수 점검을 거쳐요. 이 앱은 의학적 조언을 하지 않으며, 아기 건강 문제는 소아청소년과 상담이 우선이에요.${hasAI ? '' : ' <b>AI 키가 없으면 내용 없는 빈 틀만 만들어져요</b>(설정에서 키를 넣어 주세요).'}</div>
  <div class="seg" id="care-tabs" style="margin:14px 0">
    <button data-tab="news" class="${CARE_TAB === 'news' ? 'on' : ''}">📰 오늘의 소식</button>
    <button data-tab="guide" class="${CARE_TAB === 'guide' ? 'on' : ''}">📚 월령별 가이드</button>
    <button data-tab="mine" class="${CARE_TAB === 'mine' ? 'on' : ''}">🗂️ 내 주제함</button>
  </div>
  <div id="care-ages" class="seg" style="margin-bottom:14px;flex-wrap:wrap"></div>
  <div id="care-body"></div>`;

  const topicCard = (t) => {
    const done = t.status === 'done';
    const stale = done && isStale(t.checkedAt);
    return `<article class="panel care-topic" data-topic="${esc(t.id)}">
      <div class="row small"><span class="chip">${esc(ageLabel(t.age))}</span><span class="chip">${esc(groupLabel(t.group))}</span>${done ? `<span class="chip" style="background:#e5f4e3">✅ 제작함</span>` : ''}${stale ? '<span class="chip warn">🔄 재확인 필요</span>' : ''}</div>
      <h3 style="margin:8px 0 4px">${esc(t.title)}</h3>
      <p class="small muted" style="margin:0 0 10px">${esc(t.question || '')}</p>
      <div class="row">${careFmtSelect(`fmt-${t.id}`, t.format)}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary sm" data-cn="${esc(t.id)}">📰 카드뉴스</button><button class="btn sm" data-cs="${esc(t.id)}">🎬 카드뉴스 + AI 숏폼</button>${done && t.contentIds?.[0] && getContent(t.contentIds[0]) ? `<a class="btn sm" href="#/editor/${esc(t.contentIds[0])}">최근 결과 열기</a>` : ''}</div>
    </article>`;
  };
  const bind = () => {
    const find = (id) => loadTopics(prof.id).find((t) => t.id === id);
    $$('[data-cn],[data-cs]', $('#care-body')).forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.cn || btn.dataset.cs;
      const t = find(id); if (!t) return;
      makeCare(t, { format: $(`#fmt-${id}`).value, withShort: !!btn.dataset.cs });
    }));
    $$('[data-news-cn],[data-news-cs]', $('#care-body')).forEach((btn) => btn.addEventListener('click', async () => {
      const n = findNews(btn.dataset.newsCn || btn.dataset.newsCs);
      if (!n) return;
      const s = getSettings();
      const provider = keys[s.provider] ? s.provider : (availableProviders()[0] || 'template');
      const out = await runGenerate([n], provider, { webSearch: s.webSearch, recipe: 'guide' });
      if (!out[0]) return;
      if (btn.dataset.newsCs) createSlideShort(out[0]); else location.hash = `#/editor/${out[0].id}`;
    }));
  };
  const draw = () => {
    $$('#care-tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === CARE_TAB));
    const ages = $('#care-ages');
    ages.style.display = CARE_TAB === 'guide' ? '' : 'none';
    ages.innerHTML = `<button data-age="" class="${CARE_AGE === '' ? 'on' : ''}">전체</button>${AGE_BANDS.map((a) => `<button data-age="${a.k}" class="${CARE_AGE === a.k ? 'on' : ''}">${esc(a.label)}</button>`).join('')}`;
    $$('#care-ages button').forEach((x) => x.addEventListener('click', () => { CARE_AGE = x.dataset.age; draw(); }));
    const body = $('#care-body');
    const topics = loadTopics(prof.id);
    if (CARE_TAB === 'news') {
      const now = Date.now();
      const items = data.items.filter((n) => ['PARENTING', 'BABY'].includes(n.category))
        .map((n) => ({ n, official: (n.outlets || []).some((o) => isOfficialSource({ name: o })), hours: (now - new Date(n.publishedAt).getTime()) / 36e5 }))
        .sort((a, c) => (c.official - a.official) || (c.n.moaScore - a.n.moaScore));
      body.innerHTML = `<p class="small muted">최근 24시간 육아·아기 뉴스를 모았어요. 🏛️ 공식은 정부·공공기관 발표가 포함된 기사예요. 의학·영양 정보는 기사만 믿지 말고 공식 자료를 확인하세요.</p>` + (items.length ? `<div class="grid">${items.slice(0, 24).map(({ n, official, hours }) => `
        <article class="panel news"><div class="row small">${official ? '<span class="chip" style="background:#e5f0fb">🏛️ 공식</span>' : ''}${hours < 24 ? '<span class="chip pink">NEW</span>' : hours < 168 ? '<span class="chip">이번 주</span>' : ''}<span class="spacer"></span><span class="small muted">${esc(fmtDate(n.publishedAt))}</span></div>
          <h3><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></h3>
          <div class="small muted">출처: ${esc((n.outlets || [n.source]).filter(Boolean).slice(0, 3).join(', '))}</div>
          <div class="foot row"><button class="btn primary sm" data-news-cn="${esc(n.id)}">📰 카드뉴스</button><button class="btn sm" data-news-cs="${esc(n.id)}">🎬 + AI 숏폼</button></div></article>`).join('')}</div>` : emptyNews(data));
    } else if (CARE_TAB === 'guide') {
      const week = CARE_AGE ? [] : weeklyPick(topics, new Date(), 3);
      const list = topics.filter((t) => !CARE_AGE || t.age === CARE_AGE);
      body.innerHTML = `${week.length ? `<h2 style="margin-top:0">⭐ 이번 주 추천</h2><div class="grid">${week.map(topicCard).join('')}</div>` : ''}
        <h2>${CARE_AGE ? esc(ageLabel(CARE_AGE)) : '전체 주제'} (${list.length})</h2>
        ${list.length ? `<div class="grid">${list.map(topicCard).join('')}</div>` : '<div class="panel empty"><p>이 월령 주제가 아직 없어요. "내 주제함"에서 추가해 보세요.</p></div>'}`;
    } else {
      const made = mineOnly(listContents()).filter((c) => c.guide).sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)));
      body.innerHTML = `<section class="panel"><h3>➕ 주제 추가</h3>
          <div class="two"><div class="field"><label for="ct-title">주제(제목)</label><input type="text" id="ct-title" placeholder="예: 아기 낮잠, 하루에 몇 번 자나요?"></div>
          <div class="field"><label for="ct-q">궁금한 점 (선택)</label><input type="text" id="ct-q" placeholder="AI가 이 질문에 답하는 방향으로 찾아요"></div></div>
          <div class="row"><select id="ct-age">${AGE_BANDS.map((a) => `<option value="${a.k}" ${a.k === '4-6' ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
          <select id="ct-group">${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>${careFmtSelect('ct-fmt', 'info_qa')}
          <button class="btn primary" id="ct-add">추가</button></div></section>
        <h2>만든 육아 정보 (${made.length})</h2>
        ${made.length ? `<div class="table-wrap"><table><tr><th>제목</th><th>월령·분야</th><th>확인일</th><th>점검</th><th></th></tr>${made.map((c) => {
          const rv = reviewGuide(c);
          return `<tr><td><a href="#/editor/${esc(c.id)}"><b>${esc(c.title)}</b></a></td><td class="small">${esc(c.guide.age || '')} · ${esc(c.guide.group || '')}</td>
            <td class="small">${esc(new Date(c.checkedAt).toLocaleDateString('ko-KR'))}${isStale(c.checkedAt) ? ' <span class="chip warn">재확인</span>' : ''}</td>
            <td class="small">${rv.ready ? '✅ 발행 준비' : `⚠️ 점검 필요 (${rv.warnings.length + (rv.done ? 0 : 1)})`}</td>
            <td><a class="btn sm" href="#/editor/${esc(c.id)}">열기</a></td></tr>`;
        }).join('')}</table></div>` : '<div class="panel empty"><p>아직 만든 육아 정보가 없어요.</p></div>'}
        <h2>내 주제 목록</h2>
        <div class="table-wrap"><table><tr><th>주제</th><th>월령</th><th>상태</th><th></th></tr>${topics.map((t) => `<tr><td>${esc(t.title)}</td><td class="small">${esc(ageLabel(t.age))}</td><td class="small">${t.status === 'done' ? '✅ 제작함' : '대기'}</td><td><button class="btn sm danger" data-rm-topic="${esc(t.id)}">삭제</button></td></tr>`).join('')}</table></div>`;
      $('#ct-add').addEventListener('click', () => {
        const title = $('#ct-title').value.trim();
        if (!title) { toast('주제를 입력해 주세요.', true); return; }
        addTopic(prof.id, { title, question: $('#ct-q').value.trim(), age: $('#ct-age').value, group: $('#ct-group').value, format: $('#ct-fmt').value });
        toast('주제를 추가했어요.'); draw();
      });
      $$('[data-rm-topic]').forEach((x) => x.addEventListener('click', () => { if (confirm('이 주제를 삭제할까요? (만든 콘텐츠는 남아요)')) { removeTopic(prof.id, x.dataset.rmTopic); draw(); } }));
    }
    bind();
  };
  $$('#care-tabs button').forEach((x) => x.addEventListener('click', () => { CARE_TAB = x.dataset.tab; draw(); }));
  draw();
}

// 육아 정보 점검 패널 (편집기): 출처·표현·검수 체크
function guidePanelHtml(c) {
  if (!c.guide) return '';
  const rv = reviewGuide(c);
  const r = c.review || {};
  return `<section class="panel guide-panel" id="guide-panel" style="margin-top:22px">
    <div class="row"><h3 style="margin:0">👶 육아 정보 점검</h3><span class="spacer"></span>
      <span class="chip ${rv.ready ? '' : 'warn'}" id="guide-chip">${rv.ready ? '✅ 발행 준비 완료' : '⚠️ 발행 전 점검 필요'}</span></div>
    <div class="row small" style="margin:8px 0"><span class="chip">${esc(c.guide.age || '월령 미정')}</span><span class="chip">${esc(c.guide.group || '')}</span>
      <span>확인일 ${esc(new Date(c.checkedAt).toLocaleDateString('ko-KR'))}</span>${isStale(c.checkedAt) ? '<span class="chip warn">🔄 재확인 필요</span>' : ''}</div>
    <div class="small"><b>근거 출처</b>${(c.sources || []).length ? `<ul class="plain">${c.sources.map((x) => `<li>${esc(SOURCE_KIND_LABEL[sourceKind(x)])} · ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name || x.url)}</a>` : esc(x.name)}</li>`).join('')}</ul>` : ' <span class="muted">없음</span>'}</div>
    ${rv.warnings.length ? `<div class="notice small"><b>확인할 점</b><ul style="margin:6px 0 0;padding-left:18px">${rv.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="small" style="margin-top:8px"><b>검수 체크</b> (직접 확인하고 체크해야 "발행 준비"가 돼요)
      <label class="check-line"><input type="checkbox" id="rv-age" ${r.age ? 'checked' : ''}><span>월령·기간 표현을 출처와 대조했어요</span></label>
      <label class="check-line"><input type="checkbox" id="rv-nums" ${r.nums ? 'checked' : ''}><span>숫자(양·횟수·일정)를 출처와 대조했어요</span></label>
      <label class="check-line"><input type="checkbox" id="rv-src" ${r.sources ? 'checked' : ''}><span>출처 링크를 열어 내용을 확인했어요</span></label></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="guide-redo">🔄 최신 자료로 다시 만들기</button></div>
  </section>`;
}

// ---------- 설정 ----------
async function settingsView(arg) {
  if (arg === 'new') {
    const base = getActiveProfile();
    const id = newId();
    saveProfile({ id, name: '새 계정', char: 'custom', charName: '새 캐릭터', handle: '@', brand: '새 계정', tagPrefix: 'MY', showChar: true, showCharShorts: true, showCharVideo: false, theme: base.theme, toonAccent: base.toonAccent, deckTheme: base.deckTheme });
    setActiveProfile(id); ENV = null; drawProfileSwitch();
    location.replace('#/settings');
    return;
  }
  const s = getSettings();
  const prof = getActiveProfile();
  const keys = getKeys();
  const data = await loadNews();
  const env = await renderEnv(true);
  const storedPoses = await getAllPoses();
  view.innerHTML = `
  <h1>⚙️ 설정</h1>
  <p class="sub">계정(캐릭터)마다 인스타 계정·캐릭터·디자인을 따로 정할 수 있어요. AI 키와 모델은 모든 계정이 함께 써요.</p>
  <section class="panel">
    <h3>👤 계정 · 캐릭터</h3>
    <div class="profile-cards">
      ${listProfiles().map((p) => `<button type="button" class="profile-card ${p.id === prof.id ? 'on' : ''}" data-prof="${esc(p.id)}"><img src="${esc(charOf(p).base || 'assets/moa/moa.png')}" alt=""><span><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.handle || '')}</span></span></button>`).join('')}
      <a class="profile-card" href="#/settings/new" style="justify-content:center;text-decoration:none"><b>+ 새 계정 추가</b></a>
    </div>
    <p class="small muted" style="margin-top:0">지금 편집 중: <b>${esc(prof.name)}</b> — 아래 항목과 "브랜드 & 디자인", "포즈 이미지"는 이 계정에만 적용돼요.</p>
    <div class="two">
      <div class="field"><label for="pf-name">계정 이름 (사이드바 표시)</label><input type="text" id="pf-name" value="${esc(prof.name)}"></div>
      <div class="field"><label for="handle">인스타그램 아이디 (카드 하단·캡션·숏폼 썸네일에 표시)</label><input type="text" id="handle" value="${esc(s.handle)}" placeholder="@my.account"></div>
    </div>
    <div class="two">
      <div class="field"><label for="pf-char">캐릭터</label><select id="pf-char">${Object.entries(CHARACTERS).map(([k, v]) => `<option value="${k}" ${k === prof.char ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-charname">캐릭터 이름 (AI 원고·말풍선에 쓰여요)</label><input type="text" id="pf-charname" value="${esc(charNameOf(prof))}"></div>
    </div>
    <div class="row" id="pf-custom" style="margin-bottom:12px;${prof.char === 'custom' ? '' : 'display:none'}"><b class="small">캐릭터 기본 이미지 (배경이 투명한 PNG 권장)</b><span class="btn sm" style="position:relative">이미지 올리기<input type="file" accept="image/png,image/webp,image/jpeg" id="pf-base" style="position:absolute;inset:0;opacity:0;cursor:pointer"></span><span class="small muted">${env.charImg ? '등록됨' : '아직 없어요'}</span></div>
    <div class="two">
      <div class="field"><label for="pf-desc">캐릭터 소개 (AI가 말투·성격을 참고)</label><input type="text" id="pf-desc" value="${esc(prof.charDesc || charOf(prof).desc)}"></div>
      <div class="field"><label for="brand">브랜드 표기</label><input type="text" id="brand" value="${esc(s.brand)}"></div>
    </div>
    <div class="field"><label for="pf-tag">카드 상단 태그 (예: MOA NEWS → HAPPY NEWS)</label><input type="text" id="pf-tag" value="${esc(prof.tagPrefix || 'MOA')}" style="max-width:200px"></div>
    <div class="field"><label>캐릭터 등장</label>
      <label class="small check-line"><input type="checkbox" id="pf-showchar" ${prof.showChar !== false ? 'checked' : ''}><span>카드뉴스에 캐릭터 넣기</span></label>
      <label class="small check-line"><input type="checkbox" id="pf-showshorts" ${prof.showCharShorts !== false ? 'checked' : ''}><span>숏폼 썸네일에 캐릭터 넣기</span></label>
      <label class="small check-line"><input type="checkbox" id="pf-showvideo" ${prof.showCharVideo ? 'checked' : ''}><span>숏폼 영상 안에도 캐릭터 넣기 (오른쪽 아래, 숏폼마다 바꿀 수 있어요)</span></label>
    </div>
    <div class="row"><button class="btn danger sm" id="pf-del" ${listProfiles().length < 2 ? 'disabled' : ''}>이 계정 삭제</button><span class="small muted">계정을 지워도 만든 콘텐츠는 남아요("모든 계정 보기"에서 확인).</span></div>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>AI 모델 & API 키</h3>
    <div class="notice small">이 사이트는 서버 없이 GitHub Pages에서 동작해서, API 키는 <b>이 브라우저(localStorage)에만</b> 저장되고 OpenAI·Google·Anthropic 서버로 직접 전송돼요. 공용 PC에서는 사용 후 키를 지워 주세요. 각 회사 콘솔에서 사용 한도(예산)를 걸어 두는 것을 권장해요.</div>
    <div class="field"><label>기본 모델</label><div class="seg" id="defprov">${Object.entries(PROVIDERS).map(([k, p]) => `<button type="button" data-p="${k}" class="${k === s.provider ? 'on' : ''}">${p.label}</button>`).join('')}</div></div>
    ${Object.entries(PROVIDERS).map(([k, p]) => `
      <div class="two" style="align-items:end">
        <div class="field"><label for="key-${k}">${p.label} API 키</label><input type="password" id="key-${k}" value="${esc(keys[k] || '')}" placeholder="${{ claude: 'sk-ant-…', gpt: 'sk-…', gemini: 'AIza…' }[k]}" autocomplete="off"></div>
        <div class="field"><label for="model-${k}">${p.label} 모델 이름</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="model-${k}" value="${esc(s.models[k])}"><button class="btn sm" data-test="${k}">연결 테스트</button></div></div>
      </div>`).join('')}
    <label class="row small"><input type="checkbox" id="readart" ${s.readArticle !== false ? 'checked' : ''}> 뉴스로 만들 때 AI가 기사 원문을 직접 읽고 분석 (권장, 조금 더 느림)</label>
    <label class="row small"><input type="checkbox" id="ws" ${s.webSearch ? 'checked' : ''}> 기본으로 웹 검색 사실 확인 사용</label>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>브랜드 & 디자인 <span class="small muted">· ${esc(prof.name)}</span></h3>
    <div class="two">
      <div class="field"><label for="format">기본 카드 크기</label><select id="format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === (s.format || DEFAULT_FORMAT) ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label for="imgprov">배경 이미지 생성</label><select id="imgprov">${Object.entries(IMAGE_PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === s.imageProvider ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    </div>
    <div class="two">${Object.entries(IMAGE_PROVIDERS).map(([k, v]) => `<div class="field"><label for="img-${k}">${v.label} 모델 이름</label><input type="text" id="img-${k}" value="${esc(s.imageModels?.[k] || v.defaultModel)}"></div>`).join('')}</div>
    <div class="field"><label for="font">폰트</label><select id="font"><option value="Pretendard" ${s.font === 'Pretendard' ? 'selected' : ''}>Pretendard</option><option value="SUIT" ${s.font === 'SUIT' ? 'selected' : ''}>SUIT</option><option value="Gmarket" ${s.font === 'Gmarket' ? 'selected' : ''}>G마켓 산스 (매거진 느낌)</option></select></div>
    <div class="two">
      <div class="field"><label for="toonbg">인스타툰 배경</label><select id="toonbg"><option value="white" ${(s.toonBg || 'white') === 'white' ? 'selected' : ''}>흰색</option><option value="pastel" ${s.toonBg === 'pastel' ? 'selected' : ''}>파스텔 (장마다 다른 색)</option></select></div>
      <div class="field"><label for="toonfont">카드뉴스 제목 글씨체</label><select id="toonfont">${Object.keys(TOON_FONTS).map((k) => `<option value="${k}" ${k === (s.toonFont || 'Pretendard') ? 'selected' : ''}>${esc(TOON_FONT_LABELS[k])}</option>`).join('')}</select></div>
    </div>
    <div class="two">
      <div class="field"><label for="toonbubble">말풍선·본문 글씨체</label><select id="toonbubble">${Object.keys(BUBBLE_FONTS).map((k) => `<option value="${k}" ${k === (s.toonBubble || 'Gowun') ? 'selected' : ''}>${esc(BUBBLE_FONT_LABELS[k])}</option>`).join('')}</select></div>
      <div class="field"><label for="shortsfont">숏폼 기본 글씨체 (새 숏폼에 적용)</label><select id="shortsfont">${Object.entries(SHORTS_FONTS).map(([k, v]) => `<option value="${k}" ${k === (s.shortsFont || 'pblack') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
    </div>
    <div class="font-preview" id="font-preview"></div>
    <label class="small">인스타툰 강조색 <input type="color" id="toonaccent" value="${s.toonAccent || '#F0506E'}"></label>
    <div class="field"><label for="decktheme">카드뉴스 디자인 (모든 장)</label><select id="decktheme">${Object.keys(DECK_THEMES).map((k) => `<option value="${k}" ${k === (s.deckTheme || 'toon') ? 'selected' : ''}>${esc(deckThemeLabel(k, charNameOf(prof)))}</option>`).join('')}</select></div>
    <label class="row small" style="margin-bottom:10px"><input type="checkbox" id="autocover" ${s.autoCover ? 'checked' : ''}> 매거진 디자인일 때 첫 장 실사 사진 배경을 AI로 자동 생성 (GPT·Gemini 키 필요, 이미지 1장 생성 비용 발생)</label>
    <div class="row">${Object.entries({ bg: '배경', brown: '브라운', pink: '핑크', green: '그린' }).map(([k, l]) => `<label class="small">${l} <input type="color" data-theme="${k}" value="${s.theme[k]}"></label>`).join('')}
      <button class="btn sm" id="theme-reset">기본 색으로</button></div>
  </section>
  <section class="panel" style="margin-top:16px">
    <h3>${esc(charNameOf(prof))} 포즈 이미지</h3>
    <p class="small muted">${charOf(prof).poses ? '포즈별 일러스트가 기본으로 들어 있어요.' : '기본 이미지 한 장에 포즈별 기울기·효과(!, ?, 체크, 하트 등)를 더해 표현해요.'} 포즈별 일러스트(배경이 투명한 PNG)를 올리면 그 이미지가 우선 사용돼요.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))" id="poses">
      ${Object.entries(POSES).map(([p, l]) => `<div class="panel" style="padding:10px;text-align:center">
        <canvas data-pv="${p}" width="1080" height="1080" style="width:100%;border-radius:10px"></canvas>
        <div class="small" style="font-weight:700;margin:6px 0">${l}${storedPoses[poseKey(prof.id, p)] ? ' · 사용자 이미지' : ''}</div>
        <div class="row" style="justify-content:center"><label class="btn sm">올리기<input type="file" accept="image/png,image/webp,image/jpeg" data-up="${p}" hidden></label>${storedPoses[poseKey(prof.id, p)] ? `<button class="btn sm danger" data-rm="${p}">삭제</button>` : ''}</div>
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
    const ns = { ...s, provider: prov, webSearch: $('#ws').checked, readArticle: $('#readart').checked, brand: $('#brand').value.trim() || 'MOA | 모아', handle: $('#handle').value.trim(), font: $('#font').value, models: {}, theme: { ...s.theme } };
    Object.keys(PROVIDERS).forEach((k) => { ns.models[k] = $(`#model-${k}`).value.trim() || PROVIDERS[k].defaultModel; });
    ns.format = $('#format').value;
    ns.autoCover = $('#autocover').checked;
    ns.deckTheme = $('#decktheme').value;
    ns.toonBg = $('#toonbg').value;
    ns.toonFont = $('#toonfont').value;
    ns.toonBubble = $('#toonbubble').value;
    ns.shortsFont = $('#shortsfont').value;
    ns.toonAccent = $('#toonaccent').value;
    ns.imageProvider = $('#imgprov').value;
    ns.name = $('#pf-name').value.trim() || prof.name;
    ns.char = $('#pf-char').value;
    ns.charName = $('#pf-charname').value.trim() || CHARACTERS[ns.char].name || '캐릭터';
    ns.charDesc = $('#pf-desc').value.trim();
    ns.tagPrefix = ($('#pf-tag').value.trim() || 'MOA').toUpperCase().slice(0, 12);
    ns.showChar = $('#pf-showchar').checked;
    ns.showCharShorts = $('#pf-showshorts').checked;
    ns.showCharVideo = $('#pf-showvideo').checked;
    ns.imageModels = Object.fromEntries(Object.entries(IMAGE_PROVIDERS).map(([k, v]) => [k, $(`#img-${k}`).value.trim() || v.defaultModel]));
    $$('[data-theme]').forEach((i) => { ns.theme[i.dataset.theme] = i.value; });
    const nk = {};
    Object.keys(PROVIDERS).forEach((k) => { const v = $(`#key-${k}`).value.trim(); if (v) nk[k] = v; });
    return { ns, nk };
  };
  $('#save').addEventListener('click', async () => { const { ns, nk } = collect(); saveSettings(ns); saveKeys(nk); await renderEnv(true); drawProfileSwitch(); toast(`${ns.name} 계정 설정을 저장했어요.`); settingsView(); });
  $$('[data-prof]').forEach((b) => b.addEventListener('click', () => { setActiveProfile(b.dataset.prof); ENV = null; drawProfileSwitch(); settingsView(); }));
  const fontPreview = () => {
    const t = TOON_FONTS[$('#toonfont').value];
    const b = BUBBLE_FONTS[$('#toonbubble').value];
    const sf = SHORTS_FONTS[$('#shortsfont').value];
    $('#font-preview').innerHTML = `<div style="font-family:${esc(t)};font-weight:700;font-size:30px">카드 제목 미리보기 1,290원</div><div style="font-family:${esc(b)};font-size:20px">말풍선은 이렇게 보여요. 같이 알아볼까?</div><div class="fp-shorts" style="font-family:${esc(sf.css)};font-weight:${sf.weight}">숏폼 자막 미리보기</div>`;
  };
  ['#toonfont', '#toonbubble', '#shortsfont'].forEach((sel) => $(sel).addEventListener('change', fontPreview));
  fontPreview();
  $('#pf-char').addEventListener('change', (e) => {
    $('#pf-custom').style.display = e.target.value === 'custom' ? '' : 'none';
    const ch = CHARACTERS[e.target.value];
    if (ch.name) $('#pf-charname').value = ch.name;
    $('#pf-desc').value = ch.desc;
  });
  $('#pf-base').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast('4MB 이하 이미지를 올려 주세요.', true); return; }
    await putPose(poseKey(prof.id, 'base'), f); prof.char = 'custom'; saveProfile(prof); await renderEnv(true); drawProfileSwitch(); toast('캐릭터 이미지를 저장했어요.'); settingsView();
  });
  $('#pf-del').addEventListener('click', () => {
    if (!confirm(`${prof.name} 계정을 삭제할까요? (만든 콘텐츠는 남아요)`)) return;
    deleteProfile(prof.id); ENV = null; drawProfileSwitch(); settingsView();
  });
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
    await putPose(poseKey(prof.id, inp.dataset.up), f); await renderEnv(true); toast('포즈 이미지를 저장했어요.'); settingsView();
  }));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => { await deletePose(poseKey(prof.id, b.dataset.rm)); await renderEnv(true); settingsView(); }));

  async function drawPreviews() {
    for (const cv of $$('[data-pv]')) {
      const pose = cv.dataset.pv;
      const demo = { category: 'NEWS', sources: [], cards: [{ type: 'WHAT', title: '', body: '', highlight: '', items: [], number: '', numberLabel: '', compare: {}, layout: 'big', pose, moaSays: '', style: { bare: true, moaPos: 'bc', moaScale: 1.9 } }] };
      await renderCard(cv, demo, 0, { ...ENV, moa: ENV.charImg, poses: ENV.charPoses });
    }
  }
  drawPreviews();
}

drawProfileSwitch();
route();
