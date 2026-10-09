// 🎬 숏폼 만들기 — 영상 업로드 → AI 자막·썸네일·캡션 → 캡컷 편집용 묶음 / 자막 입힌 완성 영상
import { PROVIDERS, callModel, extractJson } from './ai.js';
import { getSettings, getKeys, availableProviders, putVideo, getVideo, listShorts, getShort, saveShort, deleteShort, newId } from './store.js';

export const W = 1080;
export const H = 1920;
// 세 플랫폼 모두 9:16 세로 1080×1920이 표준이라 영상 파일은 하나로 같이 쓴다.
// 다른 점은 길이 제한과 화면 위에 버튼·설명이 덮이는 영역(safe: 화면 비율)이다.
export const PLATFORMS = {
  reels: { label: '인스타 릴스', w: 1080, h: 1920, max: 180, safe: { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 }, note: '9:16 · 1080×1920 · 최대 3분 · 위 14%·아래 35%가 계정명·캡션에 가려요' },
  shorts: { label: '유튜브 쇼츠', w: 1080, h: 1920, max: 180, safe: { top: 0.08, bottom: 0.22, left: 0.04, right: 0.14 }, note: '9:16 · 1080×1920 · 3분 이하 · 아래 제목·채널, 오른쪽 버튼에 가려요' },
  clip: { label: '네이버 클립', w: 1080, h: 1920, max: 0, safe: { top: 0.08, bottom: 0.25, left: 0.04, right: 0.14 }, note: '9:16 · 1080×1920 · 1분 안팎 권장(최대 길이 공식 수치 미확인)' },
};
// 세 플랫폼 공통으로 안 가려지는 영역
export const SAFE_ALL = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.14 };
export const SUB_STYLES = {
  capcut: '🎬 캡컷 기본 (흰 글씨 + 두꺼운 검은 테두리, 핵심어 노랑)',
  toon: '🐑 인스타툰 (둥근 글씨 + 검은 테두리, 핵심어 핑크)',
  magazine: '📰 매거진 (반투명 띠 + 굵은 고딕)',
  simple: '✨ 심플 (흰 글씨 + 그림자)',
};
// 캡컷에서 많이 쓰는 굵은 고딕 계열 (모두 웹폰트로 불러옴)
export const FONTS = {
  pretendard: { label: '프리텐다드 ExtraBold (캡컷 기본 글씨 느낌)', css: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif', weight: 800 },
  blackhan: { label: '검은고딕 (Black Han Sans)', css: '"Black Han Sans", "Pretendard Variable", sans-serif', weight: 400 },
  dohyeon: { label: '도현체', css: '"Do Hyeon", "Pretendard Variable", sans-serif', weight: 400 },
  jua: { label: '주아체 (둥근 글씨)', css: '"Jua", "Pretendard Variable", sans-serif', weight: 400 },
};
const TITLE_FONT = '"Jua", "Pretendard Variable", sans-serif';
const BODY_FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
const PINK = '#F0506E';
const YELLOW = '#FFE14D';
const fontOf = (p) => FONTS[p?.font] || (p?.style === 'toon' ? FONTS.jua : FONTS.pretendard);
const fontStr = (f, size) => `${f.weight} ${size}px ${f.css}`;
export const showTitle = (p) => p?.topTitle !== false;
export const titleText = (p) => String(p?.thumb?.title || p?.hook || p?.title || '').trim();

// ---------- 시간 ----------
export const clipLen = (c) => Math.max(0.1, (c.out ?? c.duration) - (c.in ?? 0));
export const totalLen = (p) => (p.clips || []).reduce((a, c) => a + clipLen(c), 0);
const fmt = (sec) => {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function toSrt(subs) {
  return subs.filter((s) => s.text?.trim()).sort((a, b) => a.start - b.start)
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text.trim()}\n`).join('\n');
}

// 자막을 전체 길이에 고르게 나눈다 (글자 수 비례, 최소 1.2초)
export function distribute(texts, total) {
  const lens = texts.map((t) => Math.max(4, t.replace(/\s/g, '').length));
  const sum = lens.reduce((a, b) => a + b, 0);
  let t = 0;
  return texts.map((text, i) => {
    const d = Math.max(1.2, (lens[i] / sum) * total);
    const start = Math.min(t, Math.max(0, total - 1.2));
    t += d;
    return { start: +start.toFixed(2), end: +Math.min(total, t).toFixed(2), text, hl: '' };
  });
}

// ---------- AI ----------
const SHORTS_SYSTEM = `너는 인스타 릴스·유튜브 쇼츠·네이버 클립 숏폼 PD이자 자막 작가다.
사용자가 대충 적은 설명과 영상 장면을 보고, 자막·썸네일 문구·플랫폼별 캡션을 만든다.

[자막 규칙]
- 한 자막은 한 줄 14자 안팎, 최대 2줄(줄바꿈 \\n). 0.5초 안에 읽히게 짧고 쉽게.
- 첫 자막(0~2초)은 훅: 스크롤을 멈추게 하는 궁금증 한 문장. 결론을 바로 주지 않는다.
- 자막은 영상 흐름(클립 순서)과 맞춘다. 사용자가 넣어 달라고 한 내용은 빠짐없이 반영하되 다듬는다.
- 자막 하나는 1.2~3초, 겹치지 않게 시간순. 전체 길이를 넘지 않는다.
- 과장·허위 금지. 사용자가 말하지 않은 사실(가격, 날짜 등)을 지어내지 않는다.
- hl은 자막 안에 실제로 있는 핵심 단어(없으면 "").
- 사용자가 메모처럼 대충 적어도(예: "크림 두꺼움", "웨이팅 20분") 말하듯 자연스러운 문장으로 다듬는다(예: "크림이 진짜 두꺼워요", "웨이팅은 20분 정도").
- 말투·분위기 요청(예: "귀엽고 발랄하게")은 자막에 그대로 넣지 말고 문체에 반영한다.
- 메모 한 줄을 자막 하나로 끝내지 말고, 장면을 보고 설명·리액션·정리 자막을 더해 영상 길이를 채운다(대략 2~3초에 자막 하나).
- 마지막 자막은 저장·팔로우를 부르는 한 마디.

[상단 제목 = 썸네일 제목]
- thumbnail.title은 영상 처음부터 끝까지 화면 맨 위에 고정으로 떠 있고, 썸네일에도 같은 문구가 쓰인다.
- 2줄 이내, 한 줄 12자 안팎(줄바꿈 \\n). 무슨 영상인지 한눈에 알 수 있게 + 궁금하게.
- 자막은 화면 가운데에 나오므로 제목과 같은 말을 반복하지 않는다.

[클립 구간]
- 목표 길이가 있으면 각 클립의 in/out(초)을 정해 전체 길이를 맞춘다. 장면이 가장 잘 보이는 구간을 고른다. 원본 길이를 넘지 않는다.

[캡션]
- instagram: 훅 첫 문장 → 내용 2~3줄 → 저장·공유 유도 → 팔로우 문구. 해시태그 5~15개(# 없이 배열).
- youtube: 제목 40자 이내(끝에 #Shorts), 설명 2~3줄, 태그 5~10개.
- naver: 제목 30자 이내(검색되는 키워드 포함), 소개 2줄, 태그 5~10개.

출력은 JSON 하나만.`;

function shortsPrompt(p, handle) {
  const lines = [];
  lines.push(`영상 설명(사용자 메모): ${p.desc || '(없음)'}`);
  lines.push(`목표 길이: ${p.target ? `${p.target}초` : '원본 길이 그대로'}`);
  lines.push(`플랫폼: ${Object.entries(p.platforms || {}).filter(([, v]) => v).map(([k]) => PLATFORMS[k].label).join(', ')}`);
  lines.push('클립(순서대로):');
  p.clips.forEach((c, i) => lines.push(`  ${i}. ${c.name} — 원본 ${c.duration.toFixed(1)}초, 현재 구간 ${(c.in || 0).toFixed(1)}~${(c.out ?? c.duration).toFixed(1)}초`));
  lines.push(`첨부 이미지는 각 클립의 대표 장면이다(순서 동일).`);
  lines.push(`캡션 팔로우 문구: "🐑 ${handle} 팔로우하고 매일 쉬운 소식 받기"`);
  lines.push('');
  lines.push(`JSON 형식: {"title":"프로젝트 제목","hook":"훅 문장","clips":[{"index":0,"in":0,"out":5}],"subtitles":[{"start":0,"end":2,"text":"자막","hl":"핵심어"}],"thumbnail":{"title":"썸네일 제목(2~3줄, 줄바꿈 \\n)","highlight":"강조어","clip":0,"time":1.5},"captions":{"instagram":{"text":"","hashtags":[]},"youtube":{"title":"","description":"","tags":[]},"naver":{"title":"","description":"","tags":[]}},"notes":["확인이 필요한 점"]}`);
  lines.push('subtitles의 start/end는 클립 구간을 이어 붙인 전체 영상 기준 초다.');
  return lines.join('\n');
}

export function applyPlan(p, plan) {
  // 클립 구간
  for (const c of plan.clips || []) {
    const clip = p.clips[c.index];
    if (!clip) continue;
    const i = Math.max(0, Math.min(clip.duration - 0.3, Number(c.in) || 0));
    const o = Math.max(i + 0.3, Math.min(clip.duration, Number(c.out) || clip.duration));
    clip.in = +i.toFixed(2); clip.out = +o.toFixed(2);
  }
  const total = totalLen(p);
  p.subtitles = (plan.subtitles || []).map((s) => ({
    start: Math.max(0, Math.min(total, Number(s.start) || 0)),
    end: Math.max(0, Math.min(total, Number(s.end) || 0)),
    text: String(s.text || '').trim().slice(0, 60),
    hl: String(s.hl || '').trim().slice(0, 12),
  })).filter((s) => s.text && s.end > s.start).sort((a, b) => a.start - b.start);
  p.hook = String(plan.hook || p.subtitles[0]?.text || '').slice(0, 60);
  if (plan.title) p.title = String(plan.title).slice(0, 60);
  const th = plan.thumbnail || {};
  p.thumb = {
    title: String(th.title || p.hook || p.title || '').slice(0, 60),
    highlight: String(th.highlight || '').slice(0, 12),
    clip: Math.max(0, Math.min(p.clips.length - 1, Number(th.clip) || 0)),
    time: Math.max(0, Number(th.time) || 1),
  };
  const cap = plan.captions || {};
  const tags = (a) => (Array.isArray(a) ? a : []).map((x) => String(x).replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 15);
  p.captions = {
    instagram: { text: String(cap.instagram?.text || ''), hashtags: tags(cap.instagram?.hashtags) },
    youtube: { title: String(cap.youtube?.title || '').slice(0, 100), description: String(cap.youtube?.description || ''), tags: tags(cap.youtube?.tags) },
    naver: { title: String(cap.naver?.title || '').slice(0, 60), description: String(cap.naver?.description || ''), tags: tags(cap.naver?.tags) },
  };
  p.notes = (plan.notes || []).map(String).filter(Boolean).slice(0, 5);
  return p;
}

// ---------- AI 없이 만들기 (규칙 기반 다듬기) ----------
const TONE_RE = /(느낌|톤|분위기|말투|스타일|컨셉|콘셉트)(으로|로)?(\s*(해|써|만들어)\s*(줘|주세요)?)?\s*[.!~]*$|^(?!.*가게[.!~]*$)[가-힣\s,]{0,14}게\s*(해\s*줘|써\s*줘|만들어\s*줘|부탁해요?)?[.!~]*$/;
const KIND = [
  { re: /리뷰|후기|다녀|가봤|먹어|마셔|써봤|사봤|내돈내산|방문|맛집|카페/, suffix: '솔직 후기', end: '저장해두고 꼭 가보세요!' },
  { re: /방법|꿀팁|팁|하는\s?법|노하우|정리|순서/, suffix: '꿀팁 정리', end: '저장해두고 따라 해보세요!' },
  { re: /브이로그|일상|하루|vlog/i, suffix: '하루 기록', end: '오늘 하루도 수고했어요!' },
  { re: /언박싱|개봉|신상|구매|하울/, suffix: '언박싱', end: '궁금한 건 댓글로 물어보세요!' },
  { re: /여행|투어|코스|숙소/, suffix: '여행 코스', end: '저장해두고 여행 갈 때 보기!' },
];
const TAIL_RE = /\s*(리뷰|후기|소개|방문기|브이로그|정리|꿀팁|영상|언박싱)(\s*영상)?\s*$/;
// 메모체 끝말을 말하는 말투로: 들어감→들어가요, 있음→있어요, 6,500원임→6,500원이에요
export function speakify(t) {
  let s = String(t).trim().replace(/[.。]+$/, '');
  const rules = [
    [/있음$/, '있어요'], [/없음$/, '없어요'], [/좋음$/, '좋아요'], [/많음$/, '많아요'], [/같음$/, '같아요'], [/맛있음$/, '맛있어요'],
    [/했음$/, '했어요'], [/였음$/, '였어요'], [/됨$/, '돼요'], [/함$/, '해요'], [/감$/, '가요'], [/옴$/, '와요'], [/봄$/, '봐요'], [/줌$/, '줘요'], [/큼$/, '커요'], [/짐$/, '져요'],
    [/([가-힣])임$/, '$1이에요'], [/([가-힣])음$/, '$1어요'],
  ];
  for (const [re, to] of rules) if (re.test(s)) { s = s.replace(re, to); break; }
  return s.replace(/이이에요$/, '이에요').replace(/(\d)이에요$/, '$1이에요');
}
// 긴 문장은 연결어(고·는데·서·지만·쉼표)에서 끊는다
function splitClauses(sentence, max = 16) {
  if (sentence.replace(/\s/g, '').length <= max) return [sentence];
  const parts = sentence.split(/(?<=[가-힣]고|는데|어서|아서|해서|지만|면서|[,，])\s+/).map((x) => x.replace(/[,，]$/, '').trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part.replace(/\s/g, '').length <= 24) { out.push(part); continue; }
    const words = part.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if ((cur + w).replace(/\s/g, '').length > 14 && cur) { out.push(cur.trim()); cur = w; } else cur = `${cur} ${w}`;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}
// 한 자막이 길면 가운데 단어에서 두 줄로
function twoLines(t) {
  if (t.replace(/\s/g, '').length <= 13 || t.includes('\n')) return t;
  const words = t.split(' ');
  if (words.length < 2) return t;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}
function pickHl(t) {
  const num = t.match(/\d[\d,.]*\s?(만원|천원|원|분|시간|초|개|%|km|kg|층|번|위|살|cm)?/);
  if (num) return num[0].trim();
  const em = t.match(/(?:엄청|진짜|완전|정말|너무|제일|가장|무조건|대박)\s+([가-힣A-Za-z]{1,6})/);
  return em ? em[1] : '';
}
const JOSA_RE = /(으로|에서|까지|부터|이랑|하고|에게|이|가|은|는|을|를|에|의|도|로|와|과|랑)$/;
const STOP = new Set(['진짜', '엄청', '완전', '정말', '너무', '그리고', '근데', '그래서', '이거', '저거', '여기', '오늘', '느낌', '분위기', '발랄', '귀엽', '정도', '하나', '이번']);
function keywords(text) {
  const out = [];
  for (const raw of String(text).split(/[\s.,!?~·]+/)) {
    let w = raw.replace(/[^가-힣A-Za-z0-9]/g, '');
    if (/\d/.test(w) && !/[가-힣A-Za-z]{2,}/.test(w)) continue;
    w = w.replace(JOSA_RE, '');
    if (w.length < 2 || w.length > 10 || STOP.has(w)) continue;
    if (/(요|다|음|함|됨|감|게|고|서|임|해|져|어|아|긴|된|던)$/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export function templatePlan(p, handle) {
  const raw = String(p.desc || '').split(/(?<=[.!?。…~])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const tone = raw.filter((x) => TONE_RE.test(x));
  const facts = raw.filter((x) => !TONE_RE.test(x));
  const cute = /귀엽|발랄|신나|유쾌|밝게|텐션/.test(tone.join(' ') + p.desc);
  const first = facts[0] || '오늘의 영상';
  const kind = KIND.find((k) => k.re.test(p.desc || '')) || { suffix: '', end: '도움 됐다면 저장해 두세요!' };
  // 주제: 첫 문장 앞부분에서 "리뷰/후기" 같은 꼬리를 뗀다
  let topic = splitClauses(first.replace(/[.!?~]+$/, ''), 30)[0].replace(TAIL_RE, '').trim() || first;
  if (topic.length > 18) topic = topic.split(/\s+/).reduceRight((acc, w) => ((`${w} ${acc}`).trim().length <= 16 ? `${w} ${acc}`.trim() : acc), '') || topic.slice(0, 16);
  const shortTopic = topic.split(/\s+/).reduceRight((acc, w) => ((`${w} ${acc}`).trim().length <= 9 ? `${w} ${acc}`.trim() : acc), '') || topic.slice(0, 9);
  const title = kind.suffix ? `${topic}\n${kind.suffix}` : twoLines(topic);
  const hook = kind.suffix ? `${shortTopic}, 어땠냐면요` : `${shortTopic} 알고 있었어?`;

  // 본문: 첫 문장이 주제뿐이면 빼고, 나머지는 절 단위로 나눠 말투를 다듬는다
  const bodySrc = TAIL_RE.test(first.replace(/[.!?~]+$/, '')) && facts.length > 1 ? facts.slice(1) : facts;
  const body = [];
  for (const sen of bodySrc) for (const c of splitClauses(sen.replace(/[.!?~]+$/, ''))) body.push(speakify(c));
  const points = body.filter((x) => x.length > 1).slice(0, 14);
  const bang = (t) => (cute && !/[!?~]$/.test(t) && /요$/.test(t) ? `${t}!` : t);
  const texts = [hook, ...points.map(bang), kind.end, '팔로우하고 다음 영상도 보기'];
  const total = totalLen(p) || texts.length * 2.5;
  const subs = distribute(texts.map(twoLines), total).map((sb) => ({ ...sb, hl: pickHl(sb.text.replace('\n', ' ')) }));
  const kw = keywords(`${topic} ${facts.join(' ')}`).slice(0, 8);
  const bullet = points.slice(0, 5).map((x) => `✔️ ${x}`).join('\n');
  const oneLine = title.replace(/\n/g, ' ');
  return {
    title: oneLine,
    hook,
    subtitles: subs,
    thumbnail: { title, highlight: kind.suffix || kw[0] || '', clip: 0, time: 1 },
    captions: {
      instagram: { text: `${oneLine} 👀\n\n${bullet}\n\n📌 저장해 두고 다시 보기\n💬 같이 볼 친구 태그하기\n🐑 ${handle} 팔로우하고 매일 쉬운 소식 받기`, hashtags: [...kw, '릴스', '숏폼', '모아'].slice(0, 15) },
      youtube: { title: `${oneLine} #Shorts`.slice(0, 100), description: `${points.slice(0, 3).join(' · ')}\n\n${handle} 구독하고 더 보기`, tags: [...kw, 'Shorts', '쇼츠'].slice(0, 10) },
      naver: { title: oneLine.slice(0, 30), description: points.slice(0, 2).join(' · '), tags: [...kw, '클립'].slice(0, 10) },
    },
    notes: ['AI 없이 규칙으로 만든 초안이에요. 메모를 말투로 바꾸고 훅·정리·팔로우 자막을 붙였지만, 장면을 보고 새 문장을 쓰지는 못해요. 설정에 GPT·Gemini·Claude 중 아무 키 하나만 넣어도 "✨ AI로 만들기"가 영상을 보고 다듬어 줘요.'],
  };
}

async function framesForAI(p, vids) {
  const out = [];
  for (let i = 0; i < p.clips.length && i < 8; i++) {
    const c = p.clips[i];
    const cv = await frameAt(vids[i], ((c.in || 0) + (c.out ?? c.duration)) / 2, 512);
    out.push({ mime: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.8).split(',')[1] });
  }
  return out;
}

export async function aiPlan(p, provider, vids) {
  const s = getSettings();
  const text = await callModel(provider, {
    apiKey: getKeys()[provider], model: s.models[provider], system: SHORTS_SYSTEM,
    prompt: shortsPrompt(p, s.handle), images: await framesForAI(p, vids), maxTokens: 8000, browser: true,
  });
  return extractJson(text);
}

// ---------- 영상 ----------
function loadVideoEl(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.src = URL.createObjectURL(blob);
    v.onloadedmetadata = () => res(v);
    v.onerror = () => rej(new Error('영상을 열 수 없어요. (MP4·MOV·WEBM 권장)'));
  });
}
const seek = (v, t) => new Promise((res) => {
  const target = Math.max(0, Math.min(t, (v.duration || t) - 0.05));
  if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) { res(); return; }
  const done = () => { v.removeEventListener('seeked', done); res(); };
  v.addEventListener('seeked', done);
  v.currentTime = target;
});
export async function frameAt(v, t, width = 540) {
  await seek(v, t);
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = Math.round(width * (v.videoHeight / v.videoWidth || 16 / 9));
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  return cv;
}

// 9:16 화면에 영상 배치: cover(꽉 채우기) 또는 blur(흐린 배경 + 원본 비율)
function drawVideo(ctx, v, fit) {
  const vw = v.videoWidth || 1080;
  const vh = v.videoHeight || 1920;
  if (fit === 'blur' && vw / vh > 0.6) {
    const sc = Math.max(W / vw, H / vh);
    ctx.save(); ctx.filter = 'blur(28px) brightness(0.7)';
    ctx.drawImage(v, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc);
    ctx.restore();
    const s2 = Math.min(W / vw, H / vh);
    ctx.drawImage(v, (W - vw * s2) / 2, (H - vh * s2) / 2, vw * s2, vh * s2);
  } else {
    const sc = Math.max(W / vw, H / vh);
    ctx.drawImage(v, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc);
  }
}

function wrapText(ctx, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const ch of para.split(/(\s+)/)) {
      const next = cur + ch;
      if (ctx.measureText(next.trim()).width > maxW && cur.trim()) { out.push(cur.trim()); cur = ch.trimStart(); } else cur = next;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.slice(0, maxLines);
}

// 한 줄 그리기 (핵심어는 강조색)
function richLine(ctx, line, hl, cx, y, { fill, accent, stroke, strokeW }) {
  const w = ctx.measureText(line).width;
  let x = cx - w / 2;
  const parts = hl && line.includes(hl) ? line.split(hl).flatMap((seg, i, arr) => (i < arr.length - 1 ? [[seg, false], [hl, true]] : [[seg, false]])) : [[line, false]];
  for (const [seg, on] of parts) {
    if (!seg) continue;
    if (stroke) { ctx.lineWidth = strokeW; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(seg, x, y); }
    ctx.fillStyle = on ? accent : fill;
    ctx.fillText(seg, x, y);
    x += ctx.measureText(seg).width;
  }
}

// 캡컷식 외곽선 글씨: 두꺼운 검은 테두리를 먼저 칠하고 흰 글씨를 얹는다
function outlinedLines(ctx, lines, hl, cx, yCenter, size, f, { fill = '#FFFFFF', accent = YELLOW, stroke = '#000000', ratio = 0.24, lh = 1.22 } = {}) {
  ctx.font = fontStr(f, size);
  const step = size * lh;
  const y0 = yCenter - ((lines.length - 1) * step) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.05;
  lines.forEach((l, i) => { ctx.lineWidth = size * ratio; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.textAlign = 'center'; ctx.strokeText(l, cx, y0 + i * step); });
  ctx.restore();
  lines.forEach((l, i) => richLine(ctx, l, hl, cx, y0 + i * step, { fill, accent }));
  return { top: y0 - step / 2, bottom: y0 + (lines.length - 0.5) * step };
}
// 글자 크기를 줄여 가며 maxW·maxLines 안에 맞춘다
function fitLines(ctx, text, f, size, minSize, maxW, maxLines) {
  let lines;
  for (;; size -= 4) {
    ctx.font = fontStr(f, size);
    lines = wrapText(ctx, text, maxW, 99);
    if ((lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) || size <= minSize) break;
  }
  return { lines: lines.slice(0, maxLines), size };
}

// 상단 고정 제목 (= 썸네일 제목). 세 플랫폼 공통 안전 영역(위 14%) 바로 아래부터
export function drawTitle(ctx, p) {
  const text = titleText(p);
  if (!text) return;
  const f = fontOf(p);
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const { lines, size } = fitLines(ctx, text, f, 100, 60, W * (1 - SAFE_ALL.left - SAFE_ALL.left) - 20, 3);
  const top = H * SAFE_ALL.top + 16;
  const step = size * 1.2;
  outlinedLines(ctx, lines, p.thumb?.highlight, W / 2, top + step / 2 + ((lines.length - 1) * step) / 2, size, f, { accent: YELLOW });
  ctx.restore();
}

// 대본 자막: 기본은 화면 정가운데 흰 글씨 + 검은 테두리
export function drawSubtitle(ctx, sub, p, isHook) {
  if (!sub?.text) return;
  const style = p.style || 'capcut';
  const f = fontOf(p);
  const top = showTitle(p);
  const bigHook = isHook && !top; // 상단 제목을 끄면 첫 자막을 위쪽에 크게
  const cy = bigHook ? H * 0.22 : (p.subPos === 'lower' ? H * 0.6 : H * 0.5);
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (style === 'magazine') {
    const size = bigHook ? 84 : 66;
    ctx.font = `800 ${size}px ${BODY_FONT}`;
    const lines = wrapText(ctx, sub.text, 900, 2);
    const lh = size * 1.3;
    const bh = lines.length * lh + 44;
    const y0 = cy - bh / 2;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 80;
    ctx.fillStyle = 'rgba(15,15,15,0.62)';
    ctx.beginPath(); ctx.roundRect((W - bw) / 2, y0, bw, bh, 22); ctx.fill();
    lines.forEach((l, i) => richLine(ctx, l, sub.hl, W / 2, y0 + 22 + lh * (i + 0.5), { fill: '#FFFFFF', accent: YELLOW }));
  } else if (style === 'simple') {
    const size = bigHook ? 88 : 70;
    ctx.font = fontStr(f, size);
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3;
    const lines = wrapText(ctx, sub.text, 920, 2);
    const lh = size * 1.25;
    const y0 = cy - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => richLine(ctx, l, sub.hl, W / 2, y0 + lh * i, { fill: '#FFFFFF', accent: YELLOW }));
  } else if (style === 'toon' && bigHook) {
    // 인스타툰 훅: 흰 말풍선 박스
    const size = 104;
    ctx.font = `700 ${size}px ${TITLE_FONT}`;
    const lines = wrapText(ctx, sub.text, 880, 2);
    const lh = size * 1.2;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 90;
    const bh = lines.length * lh + 60;
    const y0 = H * 0.15;
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#141414'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.roundRect((W - bw) / 2, y0, bw, bh, 40); ctx.fill(); ctx.stroke();
    lines.forEach((l, i) => richLine(ctx, l, sub.hl, W / 2, y0 + 30 + lh * (i + 0.5), { fill: '#141414', accent: PINK }));
  } else {
    // 캡컷 기본 / 인스타툰: 흰 글씨 + 두꺼운 검은 테두리
    const { lines, size } = fitLines(ctx, sub.text, f, bigHook ? 100 : 88, 56, W * 0.86, 2);
    outlinedLines(ctx, lines, sub.hl, W / 2, cy, size, f, { accent: style === 'toon' ? PINK : YELLOW });
  }
  ctx.restore();
}

// 플랫폼별 가림 영역 (key: reels | shorts | clip | all)
export function drawSafeZone(ctx, key = 'all') {
  const z = key === 'all' ? SAFE_ALL : PLATFORMS[key]?.safe || SAFE_ALL;
  ctx.save();
  ctx.fillStyle = 'rgba(240,80,110,0.22)';
  ctx.fillRect(0, 0, W, H * z.top);
  ctx.fillRect(0, H * (1 - z.bottom), W, H * z.bottom);
  ctx.fillRect(0, H * z.top, W * z.left, H * (1 - z.top - z.bottom));
  ctx.fillRect(W * (1 - z.right), H * z.top, W * z.right, H * (1 - z.top - z.bottom));
  ctx.strokeStyle = 'rgba(240,80,110,0.95)'; ctx.lineWidth = 4; ctx.setLineDash([18, 12]);
  ctx.strokeRect(W * z.left, H * z.top, W * (1 - z.left - z.right), H * (1 - z.top - z.bottom));
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.font = `800 34px ${BODY_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${key === 'all' ? '세 플랫폼 공통' : PLATFORMS[key].label} — 분홍 영역은 버튼·설명에 가려져요`, 30, H * (1 - z.bottom) + 56);
  ctx.restore();
}

const activeSub = (p, t) => (p.subtitles || []).find((s) => t >= s.start && t < s.end);
const isHookSub = (p, s) => s && p.subtitles?.[0] === s && s.start < 2.5;

// 한 프레임 그리기 (미리보기·녹화·오버레이 공용)
export function drawOverlay(ctx, p, t, { title = true, subtitles = true } = {}) {
  if (title && showTitle(p)) drawTitle(ctx, p);
  if (subtitles) { const s = activeSub(p, t); drawSubtitle(ctx, s, p, isHookSub(p, s)); }
}

// ---------- 재생기 (미리보기·녹화 공용) ----------
let sharedAC = null;
export class Sequencer {
  constructor(p, vids, canvas) {
    this.p = p; this.vids = vids; this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.stopFlag = false; this.audio = null;
  }
  ensureAudio() {
    // 영상 요소 하나에는 오디오 소스를 한 번만 만들 수 있어 요소에 보관해 재사용한다
    if (!sharedAC) sharedAC = new (window.AudioContext || window.webkitAudioContext)();
    const ac = sharedAC;
    if (!this.audio) {
      const dest = ac.createMediaStreamDestination();
      const speaker = ac.createGain();
      speaker.connect(ac.destination);
      this.audio = { ac, dest, speaker, linked: new Set() };
    }
    for (const v of this.vids) {
      if (this.audio.linked.has(v)) continue;
      if (!v._moaSrc) v._moaSrc = ac.createMediaElementSource(v);
      v._moaSrc.connect(this.audio.dest); v._moaSrc.connect(this.audio.speaker);
      this.audio.linked.add(v);
    }
    return this.audio;
  }
  drawAt(v, t, { subtitles = true, title = true, safe = false } = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (v) drawVideo(ctx, v, this.p.fit);
    drawOverlay(ctx, this.p, t, { title, subtitles });
    if (safe) drawSafeZone(ctx, safe === true ? 'all' : safe);
  }
  stop() { this.stopFlag = true; this.vids.forEach((v) => v.pause()); }
  async play({ subtitles = true, title = true, safe = false, onTime, speakers = true } = {}) {
    this.stopFlag = false;
    const { ac, speaker } = this.ensureAudio();
    if (ac.state === 'suspended') await ac.resume();
    speaker.gain.value = speakers ? 1 : 0;
    let offset = 0;
    for (let i = 0; i < this.p.clips.length && !this.stopFlag; i++) {
      const c = this.p.clips[i];
      const v = this.vids[i];
      const a = c.in || 0;
      const b = c.out ?? c.duration;
      await seek(v, a);
      this.drawAt(v, offset, { subtitles, title, safe });
      await v.play().catch(() => {});
      await new Promise((resolve) => {
        const tick = () => {
          if (this.stopFlag || v.ended || v.currentTime >= b - 0.02) { v.pause(); resolve(); return; }
          const t = offset + (v.currentTime - a);
          this.drawAt(v, t, { subtitles, title, safe });
          onTime?.(t);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      offset += b - a;
    }
    onTime?.(offset);
  }
  async record({ subtitles = true, title = true, onProgress } = {}) {
    const { dest } = this.ensureAudio();
    // H.264 MP4를 가장 먼저 시도한다(릴스·쇼츠·클립 업로드 호환). 안 되면 WEBM, 마지막으로 사파리용 일반 MP4
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mime = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요. PC용 크롬을 사용해 주세요.');
    const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });
    const total = totalLen(this.p);
    this.drawAt(this.vids[0], 0, { subtitles, title });
    rec.start(500);
    await this.play({ subtitles, title, speakers: false, onTime: (t) => onProgress?.(Math.min(1, t / total)) });
    await new Promise((r) => setTimeout(r, 250));
    rec.stop();
    await stopped;
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext };
  }
}

// ---------- 글꼴·오버레이 ----------
export async function loadFonts(p, sample = '가나다') {
  const f = fontOf(p);
  try { await Promise.all([document.fonts.load(fontStr(f, 80), sample || '가'), document.fonts.load(`800 66px ${BODY_FONT}`, '가')]); } catch { /* 대체 폰트 */ }
}
// 캡컷 오버레이용: 투명 배경에 상단 제목만 (위치 그대로 1080×1920)
export function renderTitleOverlay(canvas, p) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  drawTitle(ctx, p);
  return canvas;
}

// ---------- 썸네일 ----------
export async function renderThumb(canvas, p, vids, env) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const th = p.thumb || {};
  const ci = Math.min(th.clip || 0, vids.length - 1);
  const v = vids[ci];
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  if (v) { await seek(v, Math.min(th.time ?? 1, (v.duration || 1) - 0.1)); drawVideo(ctx, v, 'cover'); }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.45, 'rgba(0,0,0,0.15)'); g.addColorStop(0.75, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 상단 고정 제목과 같은 문구·글씨체로 크게
  const title = titleText(p);
  const f = fontOf(p);
  await loadFonts(p, title);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const { lines, size } = fitLines(ctx, title, f, 150, 72, 940, 3);
  outlinedLines(ctx, lines, th.highlight, W / 2, H * 0.3, size, f, { accent: YELLOW, lh: 1.15 });
  // 모아 + 계정
  if (env?.moa) {
    const mh = 420;
    const mw = mh * (env.moa.naturalWidth / env.moa.naturalHeight);
    ctx.drawImage(env.moa, W - mw - 30, H - mh - 60, mw, mh);
  }
  ctx.font = `700 34px ${BODY_FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'left';
  ctx.fillText(getSettings().handle, 50, H - 90);
  return canvas;
}

// ---------- 캡션 텍스트 ----------
export function captionText(p, key) {
  const c = p.captions?.[key];
  if (!c) return '';
  const tag = (a) => (a || []).map((t) => `#${t}`).join(' ');
  if (key === 'instagram') return `${c.text}\n\n${tag(c.hashtags)}`.trim();
  return `${c.title}\n\n${c.description}\n\n${tag(c.tags)}`.trim();
}

export function titleSrt(p) {
  const t = titleText(p).replace(/\n+/g, '\n');
  return t ? toSrt([{ start: 0, end: totalLen(p), text: t }]) : '';
}

export function guideText(p, { cutHasTitle = false } = {}) {
  const f = fontOf(p);
  const lines = ['MOA 숏폼 — 캡컷 편집 안내', '', `제목: ${p.title}`, `전체 길이: ${totalLen(p).toFixed(1)}초`, ''];
  lines.push('[영상 크기] 인스타 릴스·유튜브 쇼츠·네이버 클립 모두 9:16 세로 1080×1920 하나로 올리면 됩니다.');
  Object.values(PLATFORMS).forEach((pf) => lines.push(`  - ${pf.label}: ${pf.note}`));
  lines.push('');
  lines.push('[이 묶음에 든 것]');
  lines.push(`  cut_*.mp4/webm      클립을 순서·구간대로 이어 붙인 9:16 영상${cutHasTitle ? ' (상단 제목 포함, 대본 자막 없음)' : ' (자막 없음)'}`);
  lines.push('  subtitles.srt       대본 자막 (시간 맞춰짐)');
  lines.push('  title.srt           상단 제목 (0초~끝까지 한 줄)');
  lines.push('  title_overlay.png   상단 제목을 위치까지 그대로 그린 투명 PNG (1080×1920)');
  lines.push('  thumbnail.png       릴스 커버 / 쇼츠·클립 썸네일');
  lines.push('  captions.txt        플랫폼별 제목·설명·해시태그');
  lines.push('');
  lines.push('[캡컷 배치 순서 · PC/웹]');
  lines.push('  1) 새 프로젝트 → cut 영상 불러오기 → 비율 9:16');
  if (!cutHasTitle) {
    lines.push('  2) 상단 제목: title_overlay.png를 "오버레이(PIP)"로 올리고 길이를 영상 끝까지 늘리기');
    lines.push('     → 1080×1920 투명 PNG라 크기·위치를 건드리지 않아도 미리보기와 같은 자리에 붙습니다');
    lines.push('     (글자를 캡컷에서 직접 고치고 싶으면 대신 텍스트 → 자막 가져오기 → title.srt)');
  } else {
    lines.push('  2) 상단 제목은 cut 영상에 이미 들어 있어요');
  }
  lines.push('  3) 텍스트(캡션) → 자막 가져오기(로컬 자막) → subtitles.srt → 시간이 자동으로 맞습니다');
  lines.push('  4) 자막 하나를 골라 아래처럼 바꾸고 "모든 자막에 적용"');
  lines.push(`     · 글꼴: ${f.label.replace(/\s*\(.*\)$/, '')} 계열 굵은 고딕 (캡컷 글꼴 목록에 없으면 비슷한 굵은 고딕)`);
  lines.push('     · 색: 흰색 / 테두리(획): 검정, 두께 크게 / 그림자 약하게');
  lines.push(`     · 위치: ${p.subPos === 'lower' ? '화면 세로 60% 지점' : '화면 정가운데 (세로 위치 0)'} · 크기: 가로 폭의 80% 안쪽`);
  lines.push('');
  lines.push('[캡컷 자동 배치가 안 되는 이유]');
  lines.push('  캡컷은 외부에서 프로젝트를 만들어 넣는 공식 기능(API)을 제공하지 않습니다.');
  lines.push('  그래서 시간은 SRT로, 제목 위치는 투명 PNG로 맞춰 손이 가장 덜 가게 묶었어요.');
  lines.push('  디자인까지 똑같이 박힌 영상이 필요하면 MOA의 "자막 입힌 완성 영상"을 쓰면 됩니다.');
  lines.push('');
  lines.push('[원본 클립으로 직접 자를 때 — 순서·구간]');
  p.clips.forEach((c, i) => lines.push(`  ${String(i + 1).padStart(2, '0')}. ${c.name}  →  ${fmt(c.in || 0)} ~ ${fmt(c.out ?? c.duration)} (${clipLen(c).toFixed(1)}초)`));
  lines.push('');
  lines.push('※ 자막 파일 가져오기는 캡컷 PC·웹에서만 됩니다(모바일 앱은 미지원). 파일은 UTF-8로 저장되어 있어요.');
  lines.push('※ 음악은 저작권 문제가 없도록 각 플랫폼의 음원 라이브러리를 사용하세요.');
  return lines.join('\n');
}

// =====================================================================
// 화면
// =====================================================================
export function createShortsViews(ui) {
  const { $, $$, esc, toast, modal, closeModal, download, view, renderEnv, safeName } = ui;

  async function readMeta(file) {
    const v = await loadVideoEl(file);
    const meta = { duration: v.duration || 0, w: v.videoWidth, h: v.videoHeight };
    URL.revokeObjectURL(v.src);
    if (!Number.isFinite(meta.duration) || meta.duration <= 0) throw new Error(`${file.name}: 길이를 읽을 수 없어요.`);
    return meta;
  }
  async function addFiles(p, files) {
    const box = modal('<div data-busy><h2 style="margin-top:0">🎬 영상 불러오는 중…</h2><p class="small muted" id="vl"></p></div>');
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('video/')) continue;
      $('#vl', box).textContent = `${f.name} (${(f.size / 1048576).toFixed(1)}MB)`;
      try {
        const meta = await readMeta(f);
        const key = `${p.id}:${newId()}`;
        await putVideo(key, f);
        p.clips.push({ key, name: f.name, duration: meta.duration, w: meta.w, h: meta.h, in: 0, out: +meta.duration.toFixed(2) });
        n++;
      } catch (e) { toast(e.message, true); }
    }
    closeModal();
    if (n) saveShort(p);
    return n;
  }

  async function listView() {
    const items = listShorts();
    view.innerHTML = `
    <h1>🎬 숏폼 만들기</h1>
    <p class="sub">영상 파일을 올리고 어떤 영상인지 간단히 적으면, AI가 자막·썸네일·플랫폼별 캡션을 만들어요. 캡컷 편집용 묶음 또는 자막을 입힌 완성 영상으로 내려받을 수 있어요.</p>
    <section class="panel url-box">
      <h3>새 숏폼 시작하기</h3>
      <p class="small muted" style="margin:0 0 10px">영상 여러 개 선택 가능 (MP4·MOV·WEBM). 영상은 이 브라우저 안에만 저장되고 서버로 올라가지 않아요.</p>
      <label class="btn primary big">🎞️ 영상 파일 선택<input type="file" id="sh-files" accept="video/*" multiple hidden></label>
    </section>
    <h2>내 숏폼 (${items.length})</h2>
    ${items.length ? `<div class="table-wrap"><table><tr><th>제목</th><th>클립</th><th>길이</th><th>수정</th><th></th></tr>
      ${items.map((p) => `<tr><td><a href="#/shorts/${p.id}"><b>${esc(p.title || '제목 없음')}</b></a></td><td>${p.clips.length}개</td><td>${totalLen(p).toFixed(1)}초</td>
      <td class="small">${esc(new Date(p.updatedAt || p.createdAt).toLocaleString('ko-KR'))}</td>
      <td><div class="row"><a class="btn sm" href="#/shorts/${p.id}">열기</a><button class="btn sm danger" data-del="${p.id}">삭제</button></div></td></tr>`).join('')}
    </table></div>` : '<div class="panel empty"><img src="assets/moa/moa.png" alt=""><p>아직 만든 숏폼이 없어요.</p></div>'}`;
    $('#sh-files').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      const s = getSettings();
      const p = { id: newId(), title: files[0].name.replace(/\.[^.]+$/, ''), createdAt: new Date().toISOString(), clips: [], desc: '', target: 0, platforms: { reels: true, shorts: true, clip: true }, style: 'capcut', font: 'pretendard', topTitle: true, subPos: 'middle', fit: 'cover', subtitles: [], captions: null, thumb: null, notes: [] };
      saveShort(p);
      const n = await addFiles(p, files);
      if (n) location.hash = `#/shorts/${p.id}`; else { await deleteShort(p.id); listView(); }
    });
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (confirm('이 숏폼과 영상 파일을 삭제할까요?')) { await deleteShort(b.dataset.del); listView(); } }));
  }

  async function editorView(id) {
    const p = getShort(id);
    if (!p) { view.innerHTML = '<div class="empty">숏폼을 찾을 수 없어요. <a href="#/shorts">목록으로</a></div>'; return; }
    const env = await renderEnv();
    const s = getSettings();
    const keys = getKeys();
    // 영상 요소 준비
    const vids = [];
    for (const c of p.clips) {
      const blob = await getVideo(c.key);
      if (!blob) { toast(`${c.name} 파일을 찾을 수 없어요. 다시 올려 주세요.`, true); continue; }
      vids.push(await loadVideoEl(blob));
    }
    if (vids.length !== p.clips.length) p.clips = p.clips.filter((_, i) => i < vids.length);
    let seq = null;
    const persist = () => { try { saveShort(p); } catch (e) { toast(e.message, true); } };

    view.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn sm" href="#/shorts">◀ 목록</a>
      <input type="text" id="sh-title" value="${esc(p.title)}" style="max-width:520px;font-weight:800;font-size:18px">
      <span class="chip" id="sh-len"></span>
    </div>
    ${p.notes?.length ? `<div class="notice"><b>확인할 점</b><ul style="margin:6px 0 0;padding-left:18px">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <div class="shorts-grid">
      <div>
        <section class="panel">
          <div class="row"><h3 style="margin:0">① 클립 (순서대로 이어 붙여요)</h3><span class="spacer"></span><label class="btn sm">+ 영상 추가<input type="file" id="sh-more" accept="video/*" multiple hidden></label></div>
          <div id="sh-clips" class="clip-list"></div>
        </section>
        <section class="panel" style="margin-top:14px">
          <h3>② 어떤 영상인가요?</h3>
          <div class="field"><label for="sh-desc">영상 설명 · 자막에 넣고 싶은 내용 (대충 적어도 AI가 다듬어요)</label>
            <textarea id="sh-desc" rows="5" placeholder="예) 성수동 새로 생긴 카페 딸기라떼 리뷰. 크림이 엄청 두껍고 딸기가 통째로 들어감. 가격 6,500원. 웨이팅 20분. 귀엽고 발랄하게.">${esc(p.desc)}</textarea></div>
          <div class="two">
            <div class="field"><label for="sh-target">목표 길이</label><select id="sh-target">${[[0, '원본 그대로'], [15, '15초'], [30, '30초'], [60, '60초'], [90, '90초']].map(([v, l]) => `<option value="${v}" ${+p.target === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="sh-style">자막 스타일</label><select id="sh-style">${Object.entries(SUB_STYLES).map(([k, v]) => `<option value="${k}" ${p.style === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label for="sh-font">글씨체</label><select id="sh-font">${Object.entries(FONTS).map(([k, v]) => `<option value="${k}" ${fontOf(p) === v ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
            <div class="field"><label for="sh-pos">대본 자막 위치</label><select id="sh-pos"><option value="middle" ${p.subPos !== 'lower' ? 'selected' : ''}>화면 정가운데</option><option value="lower" ${p.subPos === 'lower' ? 'selected' : ''}>가운데보다 약간 아래</option></select></div>
            <div class="field"><label for="sh-fit">가로 영상 배치</label><select id="sh-fit"><option value="cover" ${p.fit !== 'blur' ? 'selected' : ''}>꽉 채우기 (가장자리 잘림)</option><option value="blur" ${p.fit === 'blur' ? 'selected' : ''}>흐린 배경 + 원본 비율</option></select></div>
            <div class="field"><label>플랫폼</label><div class="row small">${Object.entries(PLATFORMS).map(([k, v]) => `<label><input type="checkbox" data-pf="${k}" ${p.platforms?.[k] ? 'checked' : ''}> ${v.label}</label>`).join('')}</div></div>
          </div>
          <label class="small check-line"><input type="checkbox" id="sh-toptitle" ${showTitle(p) ? 'checked' : ''}><span>맨 위에 썸네일 제목을 처음부터 끝까지 고정으로 보여 주기</span></label>
          <div class="pf-sizes small">${Object.values(PLATFORMS).map((v) => `<div><b>${v.label}</b> ${esc(v.note)}</div>`).join('')}<div class="muted">→ 세 플랫폼 모두 1080×1920 영상 하나로 올리면 돼요. 글자는 미리보기의 "가림 영역"으로 확인하세요.</div></div>
          <div class="row">
            <select id="sh-prov">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === (keys[s.provider] ? s.provider : availableProviders()[0]) ? 'selected' : ''}>${v.label}${keys[k] ? '' : ' (키 없음)'}</option>`).join('')}</select>
            <button class="btn primary" id="sh-ai">✨ AI로 자막·썸네일·캡션 만들기</button>
            <button class="btn" id="sh-tpl">📄 AI 없이 만들기</button>
          </div>
        </section>
        <section class="panel" style="margin-top:14px">
          <div class="row"><h3 style="margin:0">③ 자막</h3><span class="spacer"></span><button class="btn sm" id="sub-even">길이에 맞게 자동 배분</button><button class="btn sm" id="sub-add">+ 자막 추가</button></div>
          <p class="small muted" style="margin:6px 0 10px">시간은 이어 붙인 전체 영상 기준(초)이에요. 대본 자막은 화면 가운데에 흰 글씨 + 검은 테두리로 나와요. 맨 위 고정 제목은 ④ 썸네일 제목과 같아요. Enter로 줄을 바꾸면 두 줄 자막이 돼요.</p>
          <div id="sh-subs"></div>
        </section>
      </div>
      <div class="shorts-side">
        <section class="panel">
          <h3>미리보기</h3>
          <canvas id="sh-stage" width="${W}" height="${H}"></canvas>
          <div class="row" style="justify-content:center;margin-top:8px">
            <button class="btn sm primary" id="pv-play">▶ 재생</button><button class="btn sm" id="pv-stop">■ 정지</button>
            <select id="pv-safe" class="small" title="가림 영역 표시"><option value="">가림 영역 끄기</option><option value="all">가림 영역: 3개 공통</option>${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}">가림 영역: ${v.label}</option>`).join('')}</select>
            <span class="small muted" id="pv-time">0:00.0</span>
          </div>
        </section>
        <section class="panel" style="margin-top:14px">
          <h3>④ 썸네일</h3>
          <canvas id="sh-thumb" width="${W}" height="${H}" style="width:100%;max-width:220px;display:block;margin:0 auto 10px;border-radius:12px"></canvas>
          <div class="field"><label>썸네일 제목 = 영상 맨 위 고정 제목 (줄바꿈 가능)</label><textarea id="th-title" rows="2"></textarea></div>
          <div class="two">
            <div class="field"><label>강조어</label><input type="text" id="th-hl"></div>
            <div class="field"><label>장면 (클립·초)</label><div class="row" style="flex-wrap:nowrap"><select id="th-clip"></select><input type="number" id="th-time" step="0.1" min="0" style="width:90px"></div></div>
          </div>
          <button class="btn sm" id="th-dl">⬇️ 썸네일 PNG</button>
        </section>
        <section class="panel" style="margin-top:14px">
          <h3>⑤ 캡션</h3>
          <div class="seg" id="cap-tabs"><button data-cap="instagram" class="on">인스타</button><button data-cap="youtube">유튜브</button><button data-cap="naver">네이버 클립</button></div>
          <div id="cap-body" style="margin-top:10px"></div>
        </section>
        <section class="panel" style="margin-top:14px">
          <h3>⑥ 내보내기</h3>
          <label class="small check-line"><input type="checkbox" id="ex-cut" checked><span>캡컷 묶음에 "컷 편집 영상" 포함 (영상 길이만큼 녹화 시간이 걸려요)</span></label>
          <label class="small check-line"><input type="checkbox" id="ex-cut-title"><span>컷 편집 영상에 상단 제목까지 넣기 (대본 자막만 캡컷에서 SRT로)</span></label>
          <div class="row" style="flex-direction:column;align-items:stretch">
            <button class="btn primary" id="ex-capcut">📦 캡컷 편집용 묶음 ZIP</button>
            <button class="btn" id="ex-final">🎬 자막 입힌 완성 영상 만들기</button>
          </div>
          <p class="small muted" style="margin-top:8px">완성 영상은 브라우저에서 실시간으로 녹화해 만들어요(1분 영상 ≈ 1분). PC용 크롬에서는 MP4, 그 외 브라우저는 WEBM으로 저장될 수 있어요.</p>
          <div class="meter" id="ex-bar" style="margin-top:8px;display:none"><i style="width:0%"></i></div>
        </section>
      </div>
    </div>`;

    const stage = $('#sh-stage');
    const stageCtx = stage.getContext('2d');
    const updateLen = () => {
      const total = totalLen(p);
      const over = Object.entries(PLATFORMS).filter(([k, v]) => p.platforms?.[k] && v.max && total > v.max).map(([, v]) => v.label);
      $('#sh-len').textContent = `${p.clips.length}개 클립 · ${total.toFixed(1)}초 · 9:16 1080×1920${over.length ? ` · ⚠️ ${over.join('·')} 3분 초과` : ''}`;
      $('#sh-len').classList.toggle('warn', over.length > 0);
    };
    const firstSubT = () => (p.subtitles?.[1]?.start ?? p.subtitles?.[0]?.start ?? 0) + 0.05;
    const previewAt = async (t) => {
      let acc = 0;
      for (let i = 0; i < p.clips.length; i++) {
        const L = clipLen(p.clips[i]);
        if (t < acc + L || i === p.clips.length - 1) {
          await seek(vids[i], (p.clips[i].in || 0) + Math.max(0, t - acc));
          stageCtx.fillStyle = '#000'; stageCtx.fillRect(0, 0, W, H);
          drawVideo(stageCtx, vids[i], p.fit);
          drawOverlay(stageCtx, p, t);
          if ($('#pv-safe').value) drawSafeZone(stageCtx, $('#pv-safe').value);
          $('#pv-time').textContent = fmt(t);
          return;
        }
        acc += L;
      }
    };

    // ---------- 클립 ----------
    async function drawClips() {
      $('#sh-clips').innerHTML = p.clips.map((c, i) => `
        <div class="clip-row">
          <canvas data-thumb="${i}" width="90" height="160"></canvas>
          <div class="clip-info">
            <b class="small">${String(i + 1).padStart(2, '0')}. ${esc(c.name)}</b>
            <div class="small muted">원본 ${c.duration.toFixed(1)}초 · ${c.w}×${c.h}</div>
            <div class="row small" style="flex-wrap:nowrap">시작 <input type="number" step="0.1" min="0" data-in="${i}" value="${(c.in || 0).toFixed(1)}" style="width:76px"> 끝 <input type="number" step="0.1" min="0" data-out="${i}" value="${(c.out ?? c.duration).toFixed(1)}" style="width:76px"> <span class="muted">= ${clipLen(c).toFixed(1)}초</span></div>
          </div>
          <div class="clip-btns"><button class="btn sm" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="btn sm" data-down="${i}" ${i < p.clips.length - 1 ? '' : 'disabled'}>▼</button><button class="btn sm danger" data-rm="${i}">✕</button></div>
        </div>`).join('') || '<p class="muted small">클립이 없어요. 영상을 추가해 주세요.</p>';
      for (const cv of $$('[data-thumb]')) {
        const i = +cv.dataset.thumb;
        const f = await frameAt(vids[i], (p.clips[i].in || 0) + 0.3, 180);
        const ctx = cv.getContext('2d');
        const sc = Math.max(90 / f.width, 160 / f.height);
        ctx.drawImage(f, (90 - f.width * sc) / 2, (160 - f.height * sc) / 2, f.width * sc, f.height * sc);
      }
      const swap = (a, b) => { [p.clips[a], p.clips[b]] = [p.clips[b], p.clips[a]]; [vids[a], vids[b]] = [vids[b], vids[a]]; persist(); refreshAll(); };
      $$('[data-up]').forEach((b) => b.addEventListener('click', () => swap(+b.dataset.up, +b.dataset.up - 1)));
      $$('[data-down]').forEach((b) => b.addEventListener('click', () => swap(+b.dataset.down, +b.dataset.down + 1)));
      $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.rm; p.clips.splice(i, 1); vids.splice(i, 1); persist(); refreshAll(); }));
      const onTrim = (el, key) => el.addEventListener('change', () => {
        const i = +el.dataset[key];
        const c = p.clips[i];
        let val = Math.max(0, Math.min(c.duration, Number(el.value) || 0));
        if (key === 'in') c.in = Math.min(val, (c.out ?? c.duration) - 0.3);
        else c.out = Math.max(val, (c.in || 0) + 0.3);
        persist(); refreshAll();
      });
      $$('[data-in]').forEach((el) => onTrim(el, 'in'));
      $$('[data-out]').forEach((el) => onTrim(el, 'out'));
    }

    // ---------- 자막 ----------
    function drawSubs() {
      const subs = p.subtitles || [];
      $('#sh-subs').innerHTML = subs.length ? subs.map((sb, i) => `
        <div class="sub-row">
          <input type="number" step="0.1" min="0" data-s="${i}" data-f="start" value="${sb.start.toFixed(1)}" title="시작(초)">
          <input type="number" step="0.1" min="0" data-s="${i}" data-f="end" value="${sb.end.toFixed(1)}" title="끝(초)">
          <textarea rows="1" data-s="${i}" data-f="text" placeholder="자막">${esc(sb.text)}</textarea>
          <input type="text" data-s="${i}" data-f="hl" value="${esc(sb.hl || '')}" placeholder="강조어">
          <button class="btn sm" data-go="${i}" title="이 자막으로 이동">▶</button>
          <button class="btn sm danger" data-sdel="${i}">✕</button>
        </div>`).join('') : '<p class="muted small">아직 자막이 없어요. ②에서 AI로 만들거나 직접 추가하세요.</p>';
      $$('[data-s]').forEach((el) => el.addEventListener('input', () => {
        const sb = p.subtitles[+el.dataset.s];
        const f = el.dataset.f;
        sb[f] = f === 'start' || f === 'end' ? Math.max(0, Number(el.value) || 0) : el.value;
        persist(); previewAt(sb.start + 0.05);
      }));
      $$('[data-go]').forEach((b) => b.addEventListener('click', () => previewAt(p.subtitles[+b.dataset.go].start + 0.05)));
      $$('[data-sdel]').forEach((b) => b.addEventListener('click', () => { p.subtitles.splice(+b.dataset.sdel, 1); persist(); drawSubs(); }));
    }

    // ---------- 썸네일 ----------
    const thumbCv = $('#sh-thumb');
    function fillThumbFields() {
      p.thumb = p.thumb || { title: p.hook || p.title, highlight: '', clip: 0, time: 1 };
      $('#th-title').value = p.thumb.title || '';
      $('#th-hl').value = p.thumb.highlight || '';
      $('#th-clip').innerHTML = p.clips.map((c, i) => `<option value="${i}" ${i === p.thumb.clip ? 'selected' : ''}>${i + 1}. ${esc(c.name.slice(0, 14))}</option>`).join('');
      $('#th-time').value = (p.thumb.time ?? 1).toFixed(1);
    }
    let thumbTimer;
    const drawThumb = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(() => renderThumb(thumbCv, p, vids, env).then(() => previewAt(0)), 120); };
    ['th-title', 'th-hl', 'th-time'].forEach((idd) => $(`#${idd}`).addEventListener('input', () => {
      p.thumb.title = $('#th-title').value; p.thumb.highlight = $('#th-hl').value; p.thumb.time = Number($('#th-time').value) || 0;
      persist(); drawThumb();
    }));
    $('#th-clip').addEventListener('change', (e) => { p.thumb.clip = +e.target.value; persist(); drawThumb(); });
    $('#th-dl').addEventListener('click', async () => { await renderThumb(thumbCv, p, vids, env); thumbCv.toBlob((b) => download(b, `${safeName(p.title)}_thumbnail.png`), 'image/png'); });

    // ---------- 캡션 ----------
    let capKey = 'instagram';
    function drawCaption() {
      const c = p.captions?.[capKey];
      if (!c) { $('#cap-body').innerHTML = '<p class="muted small">②에서 만들면 플랫폼별 캡션이 채워져요.</p>'; return; }
      if (capKey === 'instagram') {
        $('#cap-body').innerHTML = `<div class="field"><label>캡션</label><textarea id="cp-text" rows="7">${esc(c.text)}</textarea></div>
          <div class="field"><label>해시태그</label><input type="text" id="cp-tags" value="${esc(c.hashtags.map((t) => `#${t}`).join(' '))}"></div>`;
      } else {
        $('#cap-body').innerHTML = `<div class="field"><label>제목</label><input type="text" id="cp-title" value="${esc(c.title)}"></div>
          <div class="field"><label>설명</label><textarea id="cp-desc" rows="4">${esc(c.description)}</textarea></div>
          <div class="field"><label>태그</label><input type="text" id="cp-tags" value="${esc(c.tags.map((t) => `#${t}`).join(' '))}"></div>`;
      }
      $('#cap-body').insertAdjacentHTML('beforeend', '<button class="btn sm" id="cp-copy">복사하기</button>');
      const tagsOf = (v) => v.split(/[\s,]+/).map((t) => t.replace(/^#+/, '')).filter(Boolean);
      $('#cp-text')?.addEventListener('input', (e) => { c.text = e.target.value; persist(); });
      $('#cp-title')?.addEventListener('input', (e) => { c.title = e.target.value; persist(); });
      $('#cp-desc')?.addEventListener('input', (e) => { c.description = e.target.value; persist(); });
      $('#cp-tags').addEventListener('input', (e) => { if (capKey === 'instagram') c.hashtags = tagsOf(e.target.value); else c.tags = tagsOf(e.target.value); persist(); });
      $('#cp-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(captionText(p, capKey)); toast('복사했어요.'); } catch { toast('복사 권한이 없어요. 직접 선택해 복사해 주세요.', true); } });
    }
    $$('#cap-tabs button').forEach((b) => b.addEventListener('click', () => { capKey = b.dataset.cap; $$('#cap-tabs button').forEach((x) => x.classList.toggle('on', x === b)); drawCaption(); }));

    async function refreshAll() { updateLen(); await drawClips(); drawSubs(); fillThumbFields(); drawCaption(); drawThumb(); }

    // ---------- 입력 ----------
    $('#sh-title').addEventListener('input', (e) => { p.title = e.target.value; persist(); });
    $('#sh-desc').addEventListener('input', (e) => { p.desc = e.target.value; persist(); });
    $('#sh-target').addEventListener('change', (e) => { p.target = +e.target.value; persist(); });
    $('#sh-style').addEventListener('change', (e) => { p.style = e.target.value; persist(); previewAt(0); });
    $('#sh-font').addEventListener('change', async (e) => { p.font = e.target.value; persist(); await loadFonts(p, titleText(p)); drawThumb(); });
    $('#sh-pos').addEventListener('change', (e) => { p.subPos = e.target.value; persist(); previewAt(firstSubT()); });
    $('#sh-toptitle').addEventListener('change', (e) => { p.topTitle = e.target.checked; persist(); previewAt(0); });
    $('#sh-fit').addEventListener('change', (e) => { p.fit = e.target.value; persist(); previewAt(0); });
    $$('[data-pf]').forEach((el) => el.addEventListener('change', () => { p.platforms[el.dataset.pf] = el.checked; persist(); updateLen(); }));
    $('#sh-more').addEventListener('change', async (e) => {
      const before = p.clips.length;
      await addFiles(p, [...e.target.files]);
      for (let i = before; i < p.clips.length; i++) vids.push(await loadVideoEl(await getVideo(p.clips[i].key)));
      seq = null; refreshAll();
    });
    $('#sub-add').addEventListener('click', () => {
      const last = p.subtitles?.[p.subtitles.length - 1];
      const st = last ? last.end : 0;
      p.subtitles = [...(p.subtitles || []), { start: +st.toFixed(1), end: +Math.min(totalLen(p), st + 2).toFixed(1), text: '', hl: '' }];
      persist(); drawSubs();
    });
    $('#sub-even').addEventListener('click', () => {
      if (!p.subtitles?.length) return;
      const texts = p.subtitles.map((x) => x.text);
      const hls = p.subtitles.map((x) => x.hl);
      p.subtitles = distribute(texts, totalLen(p)).map((x, i) => ({ ...x, hl: hls[i] }));
      persist(); drawSubs(); toast('전체 길이에 맞게 나눴어요.');
    });

    const runPlan = async (mode) => {
      if (!p.clips.length) { toast('클립을 먼저 올려 주세요.', true); return; }
      if (!p.desc.trim()) { toast('어떤 영상인지 간단히 적어 주세요.', true); return; }
      const prov = $('#sh-prov').value;
      if (mode === 'ai' && !getKeys()[prov]) { toast(`${PROVIDERS[prov].label} API 키가 없어요. 설정에서 넣거나 "AI 없이 만들기"를 써 주세요.`, true); return; }
      const box = modal('<div data-busy><h2 style="margin-top:0">🐑 모아가 영상 보는 중…</h2><p class="small muted">장면을 보고 자막·썸네일·캡션을 만들고 있어요. 보통 20초~1분 걸려요.</p></div>');
      try {
        const plan = mode === 'ai' ? await aiPlan(p, prov, vids) : templatePlan(p, getSettings().handle);
        applyPlan(p, plan);
        if (!p.subtitles.length) applyPlan(p, { ...templatePlan(p, getSettings().handle), clips: [] });
        p.model = mode === 'ai' ? prov : 'template';
        persist();
        closeModal();
        editorView(id);
        toast('자막·썸네일·캡션을 만들었어요!');
      } catch (e) {
        void box; closeModal(); toast(`만들기 실패: ${e.message}`, true);
      }
    };
    $('#sh-ai').addEventListener('click', () => runPlan('ai'));
    $('#sh-tpl').addEventListener('click', () => runPlan('tpl'));

    // ---------- 미리보기 재생 ----------
    const getSeq = () => { if (!seq) seq = new Sequencer(p, vids, stage); return seq; };
    $('#pv-play').addEventListener('click', async () => {
      const sq = getSeq();
      sq.stop(); await new Promise((r) => setTimeout(r, 50));
      sq.play({ safe: $('#pv-safe').value || false, onTime: (t) => { $('#pv-time').textContent = fmt(t); } });
    });
    $('#pv-stop').addEventListener('click', () => seq?.stop());
    $('#pv-safe').addEventListener('change', () => previewAt(firstSubT()));

    // ---------- 내보내기 ----------
    const bar = $('#ex-bar');
    const setBar = (r) => { bar.style.display = 'block'; bar.firstElementChild.style.width = `${Math.round(r * 100)}%`; };
    async function recordCut(subtitles, title = subtitles) {
      const sq = getSeq();
      sq.stop(); await new Promise((r) => setTimeout(r, 80));
      await loadFonts(p, titleText(p));
      return sq.record({ subtitles, title, onProgress: setBar });
    }
    const lockButtons = (on) => ['#ex-capcut', '#ex-final', '#pv-play'].forEach((sel) => { $(sel).disabled = on; });
    $('#ex-final').addEventListener('click', async () => {
      lockButtons(true);
      try {
        toast('녹화를 시작했어요. 끝날 때까지 이 탭을 그대로 두세요.');
        const { blob, ext } = await recordCut(true);
        download(blob, `${safeName(p.title)}_moa.${ext}`);
        toast(ext === 'mp4' ? '완성 영상(MP4)을 내려받았어요.' : '완성 영상을 WEBM으로 저장했어요. 업로드 전 MP4 변환이 필요할 수 있어요.');
      } catch (e) { toast(e.message, true); }
      lockButtons(false); setTimeout(() => { bar.style.display = 'none'; }, 1500);
    });
    $('#ex-capcut').addEventListener('click', async () => {
      if (!window.JSZip) { toast('ZIP 라이브러리를 불러오지 못했어요. 새로고침해 주세요.', true); return; }
      lockButtons(true);
      try {
        const zip = new window.JSZip();
        const cutHasTitle = $('#ex-cut').checked && $('#ex-cut-title').checked;
        zip.file('subtitles.srt', `\uFEFF${toSrt(p.subtitles || [])}`);
        if (titleText(p)) {
          zip.file('title.srt', `\uFEFF${titleSrt(p)}`);
          const ov = renderTitleOverlay(document.createElement('canvas'), p);
          zip.file('title_overlay.png', await new Promise((r) => ov.toBlob(r, 'image/png')));
        }
        zip.file('captions.txt', ['[인스타 릴스]', captionText(p, 'instagram'), '', '[유튜브 쇼츠]', captionText(p, 'youtube'), '', '[네이버 클립]', captionText(p, 'naver')].join('\n'));
        zip.file('guide.txt', guideText(p, { cutHasTitle }));
        await renderThumb(thumbCv, p, vids, env);
        zip.file('thumbnail.png', await new Promise((r) => thumbCv.toBlob(r, 'image/png')));
        const folder = zip.folder('clips');
        for (let i = 0; i < p.clips.length; i++) {
          const blob = await getVideo(p.clips[i].key);
          if (blob) folder.file(`${String(i + 1).padStart(2, '0')}_${p.clips[i].name.replace(/[\\/:*?"<>|]/g, '_')}`, blob);
        }
        if ($('#ex-cut').checked && p.clips.length) {
          toast('컷 편집 영상을 녹화하는 중이에요. 이 탭을 그대로 두세요.');
          const { blob, ext } = await recordCut(false, cutHasTitle);
          zip.file(`${cutHasTitle ? 'cut_with_title' : 'cut_no_subtitles'}.${ext}`, blob);
        }
        download(await zip.generateAsync({ type: 'blob' }), `${safeName(p.title)}_capcut.zip`);
        toast('캡컷 편집용 묶음을 내려받았어요. guide.txt를 먼저 열어 보세요.');
      } catch (e) { toast(e.message, true); }
      lockButtons(false); setTimeout(() => { bar.style.display = 'none'; }, 1500);
    });

    await loadFonts(p, titleText(p));
    await refreshAll();
    await previewAt(0);
  }

  return { listView, editorView };
}
