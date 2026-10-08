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
  font: 'Pretendard',
  handle: '@moa.story',
  brand: 'MOA | 모아',
  theme: { bg: '#FFF9F0', brown: '#6F6258', pink: '#F5B8B5', green: '#C9D8C0' },
  format: '1080x1350',
  imageProvider: 'gpt',
  deckTheme: 'toon', // 카드뉴스 디자인: toon(인스타툰) / magazine(매거진)
  autoCover: true, // 콘텐츠를 만들면 첫 장 실사 배경을 AI로 자동 생성
  imageModels: { gpt: 'gpt-image-1', gemini: 'gemini-2.5-flash-image' },
};

export function getSettings() {
  const s = read(K.settings, {});
  if (s.handle === '@moa.studio' || s.handle === '@moa') s.handle = '@moa.story'; // 이전 기본값 정리
  return { ...DEFAULT_SETTINGS, ...s, models: { ...DEFAULT_SETTINGS.models, ...(s.models || {}) }, imageModels: { ...DEFAULT_SETTINGS.imageModels, ...(s.imageModels || {}) }, theme: { ...DEFAULT_SETTINGS.theme, ...(s.theme || {}) } };
}
export const saveSettings = (s) => write(K.settings, s);

export const getKeys = () => read(K.keys, {});
export const saveKeys = (k) => write(K.keys, k);
export const availableProviders = () => Object.keys(PROVIDERS).filter((p) => getKeys()[p]);

// ---------- 콘텐츠 ----------
export const STATUSES = { draft: '초안', done: '제작 완료', scheduled: '게시 예정', posted: '게시 완료' };

export const listContents = () => read(K.contents, []);
export const getContent = (id) => listContents().find((c) => c.id === id);
export function saveContent(c) {
  const all = listContents();
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
    const r = indexedDB.open('moa', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('poses')) r.result.createObjectStore('poses');
      if (!r.result.objectStoreNames.contains('bgs')) r.result.createObjectStore('bgs');
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
