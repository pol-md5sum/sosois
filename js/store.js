// 브라우저 저장소: 설정·API 키·콘텐츠는 localStorage, 포즈 이미지는 IndexedDB.
import { PROVIDERS } from './ai.js';

const K = { settings: 'moa.settings', keys: 'moa.keys', contents: 'moa.contents' };

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.error(e); return false; }
};

export const DEFAULT_SETTINGS = {
  provider: 'claude',
  models: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.defaultModel])),
  webSearch: false,
  readArticle: true, // 뉴스로 만들 때 AI가 기사 원문을 직접 읽고 분석
  font: 'Pretendard',
  handle: '@moa.story',
  brand: 'MOA | 모아',
  theme: { bg: '#FFF9F0', brown: '#6F6258', pink: '#F5B8B5', green: '#C9D8C0' },
  format: '1080x1350',
  imageProvider: 'gpt',
  deckTheme: 'toon',
  toonBg: 'white', // 인스타툰 배경: white(흰색) / pastel(장마다 파스텔)
  toonAccent: '#F0506E', // 인스타툰 강조색
  toonFont: 'Pretendard', // 인스타툰 제목 폰트 // 카드뉴스 디자인: toon(인스타툰) / magazine(매거진)
  autoCover: true, // 콘텐츠를 만들면 첫 장 실사 배경을 AI로 자동 생성
  imageModels: { gpt: 'gpt-image-1', gemini: 'gemini-2.5-flash-image' },
};

// ---------- 계정(캐릭터) ----------
// 계정마다 캐릭터·인스타 계정·브랜드·카드 디자인을 따로 가진다. AI 키·모델 같은 공통 설정은 함께 쓴다.
export const PROFILE_KEYS = ['name', 'char', 'charName', 'charDesc', 'tagPrefix', 'handle', 'brand', 'theme', 'font', 'format', 'deckTheme', 'toonBg', 'toonAccent', 'toonFont', 'toonBubble', 'shortsFont', 'autoCover', 'showChar', 'showCharShorts', 'showCharVideo', 'topics', 'focus', 'slogan', 'audience', 'baseTag'];
export const CHARACTERS = {
  moa: { label: '🐑 모아 (양)', emoji: '🐑', name: '모아', desc: '귀엽고 복슬복슬한 양 캐릭터', base: 'assets/moa/moa.png', poses: null },
  happy: { label: '🧸 해피해피 (곰)', emoji: '🧸', name: '해피해피', desc: '노란 체크 턱받이를 한 복슬복슬한 아기 곰 캐릭터', base: 'assets/happy/happy.webp', poses: 'assets/happy/', ext: 'webp' },
  custom: { label: '🖼️ 직접 올린 캐릭터', emoji: '✨', name: '', desc: '귀여운 캐릭터', base: null, poses: null },
};
const PROFILES_KEY = 'moa.profiles';
const ACTIVE_KEY = 'moa.activeProfile';
const PROFILE_DEFAULTS = { char: 'moa', showChar: true, showCharShorts: true, showCharVideo: false, tagPrefix: 'MOA' };
const HAPPY_FOCUS = `이 계정은 육아·아기·유아용품·생활용품·생활템만 다룬다. 독자는 영유아를 키우는 엄마·아빠다.
- 뉴스·트렌드를 고를 때도 이 주제와 이어지는 부분(부모에게 생기는 변화, 아이에게 미치는 영향, 살림·소비 팁)만 다룬다.
- 육아 정책·지원금은 대상·금액·기간·신청처를 정확히, 아이 건강·발달은 단정하지 말고 소아청소년과 상담을 권한다.
- 제품은 광고처럼 쓰지 않는다. 가격·구매처는 확인된 사실만, 근거 없는 "1위·최고" 표현 금지. 안전·리콜 정보는 꼭 챙긴다.
- 아기랑 가볼 만한 곳(키즈카페·테마파크·체험·가족 여행)도 다룬다. 장소 정보는 확인된 것만 쓰고 방문 전 확인을 권한다.
- 말투는 다정하고 공감하는 반말. category는 PARENTING(육아)·BABY(아기·유아용품)·LIVING(생활용품)·ITEM(생활템)·OUTING(아기랑 나들이) 중 하나.`;
export const DEFAULT_PROFILES = [
  { id: 'moa', name: 'MOA 모아', char: 'moa', charName: '모아', handle: '@moa.story', brand: 'MOA | 모아', tagPrefix: 'MOA', toonFont: 'Pretendard', toonBubble: 'Gowun', shortsFont: 'pblack', slogan: '요즘 뭐가 뜨는지, 모아가 알려줄게.', audience: '20~40대 여성', baseTag: '모아뉴스' },
  { id: 'happy', name: '해피해피', char: 'happy', charName: '해피해피', handle: '@happyhappy', brand: '해피해피', tagPrefix: 'HAPPY', toonAccent: '#F59E0B', toonFont: 'Ssurround', toonBubble: 'Gowun', shortsFont: 'ssurround', theme: { bg: '#FFF8E7', brown: '#7A5A3A', pink: '#F8C9A0', green: '#F3DFA2' },
    topics: ['PARENTING', 'BABY', 'LIVING', 'ITEM', 'OUTING'], deckTheme: 'soft', focus: HAPPY_FOCUS, slogan: '육아·아기·생활템, 해피해피가 쉽게 골라줄게.', audience: '영유아를 키우는 엄마·아빠', baseTag: '해피해피' },
];
const DEFAULT_BY_ID = Object.fromEntries(DEFAULT_PROFILES.map((p) => [p.id, p]));
// 글꼴 개편(촌스러운 기본 글꼴 → 요즘 인스타·유튜브 글꼴) 전에 저장된 계정은 한 번만 새 기본값으로 바꾼다
const OLD_TOON_FONTS = ['Jua', undefined, ''];
export function listProfiles() {
  let list = read(PROFILES_KEY, null);
  if (!Array.isArray(list) || !list.length) {
    // 처음: 기존 설정(계정·디자인)을 모아 계정으로 옮기고 해피해피 계정을 추가한다
    const old = read(K.settings, {});
    const moa = { ...DEFAULT_PROFILES[0] };
    for (const k of PROFILE_KEYS) if (old[k] !== undefined && k !== 'name') moa[k] = old[k];
    if (moa.handle === '@moa.studio' || moa.handle === '@moa') moa.handle = '@moa.story';
    list = [moa, { ...DEFAULT_PROFILES[1] }];
    write(PROFILES_KEY, list);
  }
  let changed = false;
  const out = list.map((p) => {
    const d = DEFAULT_BY_ID[p.id] || {};
    const m = { ...PROFILE_DEFAULTS, ...d, ...p };
    // 기본 계정에 새로 생긴 항목(주제·말투 등)은 기본값을 쓴다
    for (const k of ['topics', 'focus', 'slogan', 'audience', 'baseTag']) if (p[k] === undefined && d[k] !== undefined) m[k] = d[k];
    // v3: 해피해피에 "아기랑 나들이" 주제와 새 카드 디자인 기본값
    if (!p.happyV3 && p.id === 'happy') {
      if (Array.isArray(p.topics) && !p.topics.includes('OUTING')) p.topics = [...p.topics, 'OUTING'];
      if (!p.deckTheme || p.deckTheme === 'toon') p.deckTheme = 'soft';
      p.happyV3 = true; changed = true;
      Object.assign(m, { topics: p.topics || m.topics, deckTheme: p.deckTheme });
    }
    if (!p.fontsV2) {
      if (OLD_TOON_FONTS.includes(p.toonFont)) m.toonFont = d.toonFont || 'Pretendard';
      m.toonBubble = m.toonBubble || 'Gowun';
      m.shortsFont = m.shortsFont || d.shortsFont || 'pblack';
      m.fontsV2 = true;
      Object.assign(p, { toonFont: m.toonFont, toonBubble: m.toonBubble, shortsFont: m.shortsFont, fontsV2: true });
      changed = true;
    }
    return m;
  });
  if (changed) write(PROFILES_KEY, list);
  return out;
}
export function getActiveProfile() {
  const list = listProfiles();
  const id = read(ACTIVE_KEY, 'moa');
  return list.find((p) => p.id === id) || list[0];
}
export const setActiveProfile = (id) => write(ACTIVE_KEY, id);
export function saveProfile(p) {
  const list = listProfiles();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  write(PROFILES_KEY, list);
  return p;
}
export function deleteProfile(id) {
  const list = listProfiles().filter((p) => p.id !== id);
  if (!list.length) return false;
  write(PROFILES_KEY, list);
  if (read(ACTIVE_KEY, 'moa') === id) setActiveProfile(list[0].id);
  return true;
}
export const charOf = (p) => CHARACTERS[p?.char] || CHARACTERS.moa;
export const charNameOf = (p) => p?.charName || charOf(p).name || p?.name || '캐릭터';
// 업로드한 포즈 이미지 저장 키: 모아 계정은 예전 키 그대로, 다른 계정은 "계정ID:포즈"
export const poseKey = (profileId, pose) => (profileId === 'moa' ? pose : `${profileId}:${pose}`);

export function getSettings() {
  const s = read(K.settings, {});
  const prof = getActiveProfile();
  const own = Object.fromEntries(PROFILE_KEYS.filter((k) => prof[k] !== undefined).map((k) => [k, prof[k]]));
  const m = { ...DEFAULT_SETTINGS, ...s, ...own, profileId: prof.id, profileName: prof.name, charName: charNameOf(prof) };
  if (m.handle === '@moa.studio' || m.handle === '@moa') m.handle = '@moa.story'; // 이전 기본값 정리
  return { ...m, models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) }, imageModels: { ...DEFAULT_SETTINGS.imageModels, ...(s.imageModels || {}) }, theme: { ...DEFAULT_SETTINGS.theme, ...(own.theme || s.theme || {}) } };
}
// 계정 항목은 현재 계정에, 나머지는 공통 설정에 저장한다
export function saveSettings(ns) {
  const prof = getActiveProfile();
  const common = {};
  for (const [k, v] of Object.entries(ns)) {
    if (['profileId', 'profileName'].includes(k)) continue;
    if (PROFILE_KEYS.includes(k)) prof[k] = v; else common[k] = v;
  }
  saveProfile(prof);
  return write(K.settings, common);
}

export const getKeys = () => read(K.keys, {});
export const saveKeys = (k) => write(K.keys, k);
export const availableProviders = () => Object.keys(PROVIDERS).filter((p) => getKeys()[p]);

// ---------- 콘텐츠 ----------
export const STATUSES = { draft: '초안', done: '제작 완료', scheduled: '게시 예정', posted: '게시 완료' };

export const listContents = () => read(K.contents, []);
export const profileOfItem = (x) => x?.profileId || 'moa';
export const mineOnly = (arr) => { const id = getActiveProfile().id; return arr.filter((x) => profileOfItem(x) === id); };
export const getContent = (id) => listContents().find((c) => c.id === id);
export function saveContent(c) {
  const all = listContents();
  if (!c.profileId) c.profileId = getActiveProfile().id;
  c.updatedAt = new Date().toISOString();
  const i = all.findIndex((x) => x.id === c.id);
  if (i >= 0) all[i] = c; else all.unshift(c);
  if (!write(K.contents, all)) throw new Error('브라우저 저장 공간이 부족합니다. 오래된 콘텐츠를 정리하거나 백업 후 삭제해 주세요.');
  return c;
}
export function deleteContent(id) {
  write(K.contents, listContents().filter((c) => c.id !== id));
}
export function importContents(arr) {
  const all = listContents();
  let n = 0;
  for (const c of arr) {
    if (!c?.id || !Array.isArray(c.cards)) continue;
    const i = all.findIndex((x) => x.id === c.id);
    if (i >= 0) all[i] = c; else all.push(c);
    n++;
  }
  write(K.contents, all);
  return n;
}
export const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- 포즈 이미지 (IndexedDB) ----------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('moa', 3);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('poses')) r.result.createObjectStore('poses');
      if (!r.result.objectStoreNames.contains('bgs')) r.result.createObjectStore('bgs');
      if (!r.result.objectStoreNames.contains('videos')) r.result.createObjectStore('videos');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn, store = 'poses') {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error);
  });
}
export const putPose = (pose, blob) => tx('readwrite', (s) => s.put(blob, pose));
export const deletePose = (pose) => tx('readwrite', (s) => s.delete(pose));
export async function getAllPoses() {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const out = {};
      const req = d.transaction('poses').objectStore('poses').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out[c.key] = c.value; c.continue(); } else res(out);
      };
      req.onerror = () => rej(req.error);
    });
  } catch {
    return {};
  }
}

// ---------- 카드 배경 이미지 (IndexedDB, 키: 콘텐츠ID:카드번호) ----------
export const putBg = (key, blob) => tx('readwrite', (s) => s.put(blob, key), 'bgs');
export const deleteBg = (key) => tx('readwrite', (s) => s.delete(key), 'bgs');
export async function getBgsFor(contentId) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const out = {};
      const req = d.transaction('bgs').objectStore('bgs').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { res(out); return; }
        if (String(c.key).startsWith(`${contentId}:`)) out[c.key] = c.value;
        c.continue();
      };
      req.onerror = () => rej(req.error);
    });
  } catch {
    return {};
  }
}

// ---------- 숏폼 영상 (IndexedDB에 원본 파일, localStorage에 프로젝트 정보) ----------
export const putVideo = (key, blob) => tx('readwrite', (s) => s.put(blob, key), 'videos');
export const deleteVideo = (key) => tx('readwrite', (s) => s.delete(key), 'videos');
export async function getVideo(key) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const req = d.transaction('videos').objectStore('videos').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

const SHORTS_KEY = 'moa.shorts';
export const listShorts = () => read(SHORTS_KEY, []);
export const getShort = (id) => listShorts().find((p) => p.id === id);
export function saveShort(p) {
  const all = listShorts();
  if (!p.profileId) p.profileId = getActiveProfile().id;
  p.updatedAt = new Date().toISOString();
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p; else all.unshift(p);
  if (!write(SHORTS_KEY, all)) throw new Error('브라우저 저장 공간이 부족합니다.');
  return p;
}
export async function deleteShort(id) {
  const p = getShort(id);
  for (const c of p?.clips || []) await deleteVideo(c.key).catch(() => {});
  write(SHORTS_KEY, listShorts().filter((x) => x.id !== id));
}
