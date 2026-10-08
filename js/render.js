// 1080×1080 카드뉴스 캔버스 렌더러
import { CATEGORIES, DEFAULT_POSE } from './ai.js';

export const SIZE = 1080; // 가로 폭
// 인스타그램 세로형 비율 (기본 4:5)
export const FORMATS = {
  '1080x1350': { w: 1080, h: 1350, label: '4:5 · 1080×1350 (추천)' },
  '1080x1440': { w: 1080, h: 1440, label: '3:4 · 1080×1440' },
  '1080x1080': { w: 1080, h: 1080, label: '1:1 · 1080×1080' },
};
export const DEFAULT_FORMAT = '1080x1350';
let H = 1080; // 현재 그리는 카드의 세로 길이 (renderCard에서 설정)
export const cardHeight = (content, settings) => (FORMATS[content?.format] || FORMATS[settings?.format] || FORMATS[DEFAULT_FORMAT]).h;
const PAD = 80;

const FONT_STACK = {
  Pretendard: '"Pretendard Variable", Pretendard, "SUIT Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  SUIT: '"SUIT Variable", SUIT, "Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  Gmarket: '"GmarketSans", "Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
};

// ---------- 레이아웃 자동 선택 (기획안 14항) ----------
export function autoLayout(card) {
  if (card.layout && card.layout !== 'auto') return card.layout;
  if (card.type === 'CTA') return 'cta';
  const c = card.compare || {};
  if (c.left && c.right) return 'compare';
  if ((card.items || []).length >= 3) return 'list';
  if (card.type === "MOA'S PICK" || card.type === 'LIFE/CHECK') return (card.items || []).length ? 'list' : 'text';
  if (card.number) return 'number';
  if (card.type === 'HOOK') return 'big';
  const len = (card.title || '').length + (card.body || '').length;
  if (len <= 26) return 'big';
  if (card.highlight && card.highlight.length <= 8 && (card.body || '').length <= 70) return 'keyword';
  return 'text';
}

const MOA_DEFAULT = {
  big: { pos: 'br', size: 1.1 }, text: { pos: 'br', size: 0.95 }, list: { pos: 'br', size: 0.7 },
  number: { pos: 'br', size: 0.9 }, compare: { pos: 'br', size: 0.7 }, keyword: { pos: 'br', size: 0.95 },
  cta: { pos: 'bc', size: 0.68 },
};

// ---------- 폰트 ----------
export async function ensureFonts(family, texts) {
  if (!document.fonts?.load) return;
  const fam = family === 'SUIT' ? '"SUIT Variable"' : family === 'Gmarket' ? '"GmarketSans"' : '"Pretendard Variable"';
  const sample = [...new Set(texts.join('').replace(/\s/g, ''))].join('') || '가';
  try {
    await Promise.all([400, 600, 800, 900].map((w) => document.fonts.load(`${w} 40px ${fam}`, sample)));
    if (fam !== '"Pretendard Variable"') await document.fonts.load('800 40px "Pretendard Variable"', sample);
  } catch { /* 폰트를 못 불러오면 시스템 폰트로 그린다 */ }
}

// ---------- 텍스트 유틸 ----------
function marks(text, hl) {
  const flags = new Array(text.length).fill(false);
  if (hl) {
    let i = text.indexOf(hl);
    while (i >= 0) { for (let k = 0; k < hl.length; k++) flags[i + k] = true; i = text.indexOf(hl, i + hl.length); }
  }
  return flags;
}

// 단어 단위 줄바꿈 (긴 단어는 글자 단위로 자름). 반환: [{start, end}] 인덱스 범위
function wrap(ctx, text, widthAt) {
  const lines = [];
  const paras = text.split('\n');
  let offset = 0;
  for (const p of paras) {
    const words = p.match(/\S+\s*/g) || [''];
    let line = '';
    let lineStart = offset;
    let pos = offset;
    for (const w of words) {
      const maxW = widthAt(lines.length);
      if (ctx.measureText((line + w).trimEnd()).width <= maxW) { line += w; pos += w.length; continue; }
      if (line) { lines.push({ start: lineStart, end: lineStart + line.trimEnd().length }); lineStart = pos; line = ''; }
      if (ctx.measureText(w.trimEnd()).width <= widthAt(lines.length)) { line = w; pos += w.length; continue; }
      for (const ch of w) {
        if (ctx.measureText(line + ch).width > widthAt(lines.length) && line) {
          lines.push({ start: lineStart, end: lineStart + line.length }); lineStart += line.length; line = '';
        }
        line += ch;
      }
      pos += w.length;
    }
    lines.push({ start: lineStart, end: lineStart + line.trimEnd().length });
    offset += p.length + 1;
  }
  return lines;
}

// 크기를 줄여가며 maxLines 안에 맞춘다
function fit(ctx, text, { family, weight, max, min, maxLines, widthAt }) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, (i) => widthAt(i, size));
    // 따옴표·물음표 한 글자만 다음 줄로 넘어가는 경우는 글자를 더 줄인다
    const orphan = lines.length > 1 && lines.some((l) => l.end - l.start <= 1 && /^[^가-힣A-Za-z0-9]$/.test(text.slice(l.start, l.end)));
    if (lines.length <= maxLines && !orphan) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return { size: min, lines: wrap(ctx, text, (i) => widthAt(i, min)).slice(0, maxLines) };
}

function drawLines(ctx, text, lines, { x, y, size, lh, color, hl, hlColor, hlText, align = 'left', widthAt }) {
  const flags = marks(text, hl);
  ctx.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => {
    const s = text.slice(ln.start, ln.end);
    const base = y + size + i * size * lh;
    const w = ctx.measureText(s).width;
    let cx = x;
    if (align === 'center') cx = x + (widthAt(i) - w) / 2;
    // 형광펜 마커
    for (let k = 0; k < s.length; k++) {
      if (!flags[ln.start + k]) continue;
      let j = k;
      while (j < s.length && flags[ln.start + j]) j++;
      const x0 = cx + ctx.measureText(s.slice(0, k)).width;
      const x1 = cx + ctx.measureText(s.slice(0, j)).width;
      ctx.fillStyle = hlColor;
      roundRect(ctx, x0 - 6, base - size * 0.42, x1 - x0 + 12, size * 0.5, size * 0.12);
      ctx.fill();
      k = j - 1;
    }
    // 글자
    let k = 0;
    while (k < s.length) {
      const on = flags[ln.start + k];
      let j = k;
      while (j < s.length && flags[ln.start + j] === on) j++;
      ctx.fillStyle = on && hlText ? hlText : color;
      ctx.fillText(s.slice(k, j), cx + ctx.measureText(s.slice(0, k)).width, base);
      k = j;
    }
  });
  return y + lines.length * size * lh;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.95, cx, cy - s * 0.45);
  ctx.bezierCurveTo(cx + s * 0.45, cy - s * 0.95, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
  ctx.closePath();
}

function sparkle(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.quadraticCurveTo(cx, cy, cx + s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + s);
  ctx.quadraticCurveTo(cx, cy, cx - s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - s);
  ctx.closePath();
}

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// ---------- 포즈 ----------
const POSE_FX = {
  default: { rot: 0, dy: 0 }, surprised: { rot: 0, dy: -14, sc: 1.03 }, curious: { rot: -7, dy: 0 },
  thinking: { rot: 5, dy: 0 }, idea: { rot: -2, dy: -6 }, laugh: { rot: -4, dy: -4 }, excited: { rot: 4, dy: -22 },
  shock: { rot: -9, dy: -8 }, sleepy: { rot: 9, dy: 10 }, check: { rot: 0, dy: 0 }, explain: { rot: -3, dy: 0 },
  wave: { rot: -6, dy: -6 }, heart: { rot: 3, dy: 0 }, ok: { rot: 0, dy: -4 },
};

function drawPoseMark(ctx, pose, box, t, family) {
  const s = box.h / 400;
  const hx = box.x + box.w * 0.86;
  const hy = box.y + box.h * 0.06;
  const badge = (fill, txt, size = 54) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(hx, hy, 42 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${size * s}px ${family}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, hx, hy + 3 * s);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  };
  ctx.save();
  switch (pose) {
    case 'surprised': badge(t.pink, '!'); break;
    case 'shock': {
      badge('#E8837E', '!!', 46);
      ctx.strokeStyle = t.brown; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      [[-1, -0.5], [-1.2, 0.1], [-0.9, 0.7]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(box.x + box.w * 0.08 + dx * 30 * s, box.y + box.h * (0.25 + dy * 0.08));
        ctx.lineTo(box.x + box.w * 0.08 + dx * 60 * s, box.y + box.h * (0.25 + dy * 0.1)); ctx.stroke();
      });
      break;
    }
    case 'curious': badge(t.brown, '?'); break;
    case 'ok': badge('#8FB58A', 'OK', 34); break;
    case 'explain': badge(t.brown, 'i', 50); break;
    case 'laugh': {
      ctx.fillStyle = t.brown; ctx.font = `800 ${46 * s}px ${family}`;
      ctx.fillText('ㅋㅋ', hx - 40 * s, hy + 10 * s); break;
    }
    case 'sleepy': {
      ctx.fillStyle = t.brown;
      ctx.font = `800 ${50 * s}px ${family}`; ctx.fillText('Z', hx - 10 * s, hy + 14 * s);
      ctx.font = `800 ${34 * s}px ${family}`; ctx.fillText('z', hx + 30 * s, hy - 20 * s);
      break;
    }
    case 'thinking': {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = t.brown; ctx.lineWidth = 3 * s;
      [[0, 0, 40], [-46, 44, 13], [-66, 70, 8]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(hx + dx * s, hy + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle = t.brown;
      [-14, 0, 14].forEach((dx) => { ctx.beginPath(); ctx.arc(hx + dx * s, hy, 4.5 * s, 0, Math.PI * 2); ctx.fill(); });
      break;
    }
    case 'idea': {
      ctx.fillStyle = '#FFE08A';
      ctx.beginPath(); ctx.arc(hx, hy - 4 * s, 32 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.brown; roundRect(ctx, hx - 14 * s, hy + 26 * s, 28 * s, 16 * s, 4 * s); ctx.fill();
      ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
      for (let a = -150; a <= -30; a += 30) {
        const r = (a * Math.PI) / 180;
        ctx.beginPath(); ctx.moveTo(hx + Math.cos(r) * 44 * s, hy + Math.sin(r) * 44 * s);
        ctx.lineTo(hx + Math.cos(r) * 60 * s, hy + Math.sin(r) * 60 * s); ctx.stroke();
      }
      break;
    }
    case 'excited': {
      ctx.fillStyle = '#FFD36E';
      sparkle(ctx, hx, hy, 30 * s); ctx.fill();
      ctx.fillStyle = t.pink;
      sparkle(ctx, box.x + box.w * 0.08, box.y + box.h * 0.12, 22 * s); ctx.fill();
      sparkle(ctx, hx + 30 * s, hy + 60 * s, 14 * s); ctx.fill();
      break;
    }
    case 'heart': {
      ctx.fillStyle = '#F29C9C';
      heartPath(ctx, hx, hy, 46 * s); ctx.fill();
      heartPath(ctx, box.x + box.w * 0.1, box.y + box.h * 0.1, 30 * s); ctx.fill();
      break;
    }
    case 'check': {
      ctx.fillStyle = '#8FB58A';
      ctx.beginPath(); ctx.arc(hx, hy, 40 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 9 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(hx - 17 * s, hy + 1 * s); ctx.lineTo(hx - 4 * s, hy + 14 * s); ctx.lineTo(hx + 19 * s, hy - 12 * s); ctx.stroke();
      break;
    }
    case 'wave': {
      ctx.strokeStyle = t.brown; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      const wx = box.x + box.w * 0.9;
      const wy = box.y + box.h * 0.45;
      [24, 44].forEach((r) => { ctx.beginPath(); ctx.arc(wx, wy, r * s, -Math.PI * 0.45, Math.PI * 0.05); ctx.stroke(); });
      break;
    }
    default: break;
  }
  ctx.restore();
}

function moaBox(img, pos, size) {
  const h = 420 * size;
  const ratio = img ? img.naturalWidth / img.naturalHeight : 0.86;
  const w = h * ratio;
  const m = 46;
  const x = pos.endsWith('l') ? m : pos === 'bc' || pos === 'tc' ? (SIZE - w) / 2 : SIZE - m - w;
  const y = pos.startsWith('t') ? 150 : H - 34 - h;
  return { x, y, w, h };
}

function drawMoa(ctx, env, card, box, t, family) {
  const custom = env.poses?.[card.pose];
  const img = custom || env.moa;
  if (!img) return;
  // 바닥 그림자
  ctx.save();
  ctx.fillStyle = 'rgba(111,98,88,0.10)';
  ctx.beginPath();
  ctx.ellipse(box.x + box.w / 2, box.y + box.h - 6, box.w * 0.36, box.h * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const fx = custom ? { rot: 0, dy: 0 } : (POSE_FX[card.pose] || POSE_FX.default);
  ctx.save();
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h;
  ctx.translate(cx, cy + (fx.dy || 0));
  ctx.rotate(((fx.rot || 0) * Math.PI) / 180);
  const sc = fx.sc || 1;
  ctx.scale(card.style?.moaFlip ? -sc : sc, sc);
  const iw = custom ? box.h * (custom.naturalWidth / custom.naturalHeight) : box.w;
  ctx.drawImage(img, -iw / 2, -box.h, iw, box.h);
  ctx.restore();
  if (!custom) drawPoseMark(ctx, card.pose, box, t, family);
}

function drawBubble(ctx, text, box, t, family, pos) {
  if (!text) return null;
  ctx.font = `700 34px ${family}`;
  const w = Math.min(ctx.measureText(text).width + 52, 420);
  const h = 70;
  let x = box.x + box.w * 0.5 - w - 4;
  if (x < 30) x = Math.min(box.x + box.w * 0.55, SIZE - w - 30);
  let y = box.y - h - 6;
  if (pos === 'bc') { x = Math.min(box.x + box.w - 6, SIZE - w - 30); y = box.y + 20; }
  ctx.save();
  ctx.shadowColor = 'rgba(111,98,88,0.15)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, x, y, w, h, 35); ctx.fill();
  ctx.shadowColor = 'transparent';
  // 꼬리
  if (pos === 'bc') {
    ctx.beginPath(); ctx.moveTo(x + 2, y + h - 30); ctx.lineTo(x + 2, y + h - 8); ctx.lineTo(x - 22, y + h + 6); ctx.closePath(); ctx.fill();
  } else {
    const tx = Math.min(Math.max(x + w - 60, x + 30), box.x + box.w * 0.45);
    ctx.beginPath(); ctx.moveTo(tx, y + h - 2); ctx.lineTo(tx + 26, y + h - 2); ctx.lineTo(tx + 30, y + h + 20); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = t.brown;
  ctx.textBaseline = 'middle';
  let s = text;
  while (ctx.measureText(s).width > w - 52 && s.length > 1) s = s.slice(0, -1);
  if (s !== text) s = `${s.slice(0, -1)}…`;
  ctx.fillText(s, x + 26, y + h / 2 + 2);
  ctx.restore();
  return { x, y, w, h: h + 20 };
}

// ---------- 메인 렌더 ----------
export async function renderCard(canvas, content, index, env) {
  const card = content.cards[index];
  const st = { ...(card.style || {}) };
  const settings = env.settings;
  const t = { ...settings.theme, ...(st.accent ? { pink: st.accent } : {}) };
  const family = FONT_STACK[settings.font] || FONT_STACK.Pretendard;
  const layout = autoLayout(card);
  const md = MOA_DEFAULT[layout];
  const pos = st.moaPos || md.pos;
  const moaSize = md.size * (st.moaScale || 1);
  const fontScale = st.fontScale || 1;
  const bg = st.bg || t.bg;
  const textColor = st.textColor || t.brown;
  card.pose = card.pose || DEFAULT_POSE[card.type] || 'default';

  await ensureFonts(settings.font, [card.title, card.body, card.highlight, card.moaSays, card.number, card.numberLabel,
    ...(card.items || []), ...Object.values(card.compare || {}), content.title, settings.handle, settings.brand,
    (content.sources || []).map((s) => s.name).join(''), '01/07 MOA NEWS TREND AI LIFE MONEY FOOD BEAUTY CULTURE SHOPPING PICK CHECK WHAT WHY SO 저장 공유 팔로우 출처']);

  H = cardHeight(content, settings);
  canvas.width = SIZE; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, H);

  // 덱 전체 디자인: 인스타툰 / 매거진 (선택한 대로 7장 모두 적용)
  const theme = deckTheme(content, settings);
  if (!st.bare && theme !== 'classic') {
    const o = { card, st, settings, env, t, family, fontScale, layout, index };
    if (theme === 'magazine') await renderMagazine(ctx, content, o);
    else await renderToon(ctx, content, o);
    return canvas;
  }

  // 배경
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, H);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = t.green; ctx.beginPath(); ctx.arc(SIZE + 40, -40, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.pink; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(-80, H - 120, 220, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.18; ctx.fillStyle = t.brown;
  for (let y = 120; y < H; y += 44) for (let x = 40 + ((y / 44) % 2) * 22; x < SIZE; x += 44) {
    if (x > 980 || y > H - 40) continue;
    if ((x * 7 + y * 3) % 5 !== 0) continue;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // 첫 장(또는 사용자가 배경을 넣은 장): 주제에 맞는 배경
  const bgImg = env.bgs?.[`${content.id}:${index}`];
  // 첫 장 스타일: 사진 매거진 / 캐릭터 썸네일 / 기본
  const coverStyle = st.cover === 'classic' ? 'classic' : (content.coverStyle || settings.coverStyle || 'magazine');
  if (index === 0 && coverStyle === 'character') {
    await drawCharacterCover(ctx, content, card, { family, t, settings, env, fontScale, pos: st.moaPos });
    return canvas;
  }
  // 첫 장 + 사진 배경 → 매거진 커버 스타일 (사진 위 흰색 굵은 제목)
  if (bgImg && index === 0 && coverStyle === 'magazine') {
    drawMagazineCover(ctx, content, card, bgImg, { family, t, settings, env, pos: st.moaPos || 'br', moaScale: 0.62 * (st.moaScale || 1), fontScale });
    return canvas;
  }
  if (bgImg) drawCoverImage(ctx, bgImg, bg);
  else if (index === 0 && st.motif !== false) { drawMotif(ctx, content.category, t); fadeTop(ctx, bg); }

  if (st.bare) {
    const b = moaBox(env.moa, pos, moaSize);
    drawMoa(ctx, env, card, b, t, family);
    return canvas;
  }

  // 헤더: 카테고리 + 페이지
  const cat = CATEGORIES[content.category] || CATEGORIES.NEWS;
  ctx.font = `800 30px ${family}`;
  const catText = cat.label;
  const cw = ctx.measureText(catText).width + 48;
  // 주제별 색 (뉴스는 브랜드 브라운)
  const catColor = content.category === 'NEWS' || !cat.color ? t.brown : cat.color;
  ctx.fillStyle = catColor; roundRect(ctx, PAD, 58, cw, 56, 28); ctx.fill();
  ctx.fillStyle = catColor === t.brown ? '#FFFFFF' : '#3F3530'; ctx.textBaseline = 'middle'; ctx.fillText(catText, PAD + 24, 88);
  ctx.font = `700 30px ${family}`; ctx.fillStyle = t.brown; ctx.textAlign = 'right';
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(content.cards.length).padStart(2, '0')}`, SIZE - PAD, 88);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // 캐릭터 영역 + 말풍선 → 텍스트 회피 영역 계산
  const showMoa = pos !== 'none';
  const box = showMoa ? moaBox(env.moa, pos, moaSize) : null;
  ctx.font = `700 34px ${family}`;
  const bubbleW = card.moaSays ? Math.min(ctx.measureText(card.moaSays).width + 52, 420) : 0;
  const avoid = box ? {
    top: box.y - (card.moaSays ? 96 : 10),
    bottom: box.y + box.h,
    left: (pos === 'bc' ? box.x : Math.min(box.x, card.moaSays ? box.x + box.w * 0.5 - bubbleW - 4 : box.x)) - 24,
    right: box.x + box.w + (pos === 'bc' ? bubbleW : 0) + 24,
  } : null;
  // y 구간에서 쓸 수 있는 가로 폭
  const span = (yTop, yBot) => {
    let l = PAD; let r = SIZE - PAD;
    if (avoid && yBot > avoid.top && yTop < avoid.bottom) {
      if (avoid.left > SIZE / 2) r = Math.min(r, avoid.left);
      else if (avoid.right < SIZE / 2) l = Math.max(l, avoid.right);
      else r = Math.min(r, avoid.left);
    }
    return { l, r, w: Math.max(200, r - l) };
  };

  const ctxText = { family, t, textColor, fontScale, span };
  let y = 170;
  const label = card.type === "MOA'S PICK" ? "MOA'S PICK" : card.type;
  if (layout !== 'big' && layout !== 'cta' && !st.hideLabel) y = drawLabel(ctx, label, y, ctxText);

  const L = { big: layBig, text: layText, list: layList, number: layNumber, compare: layCompare, keyword: layKeyword, cta: layCta }[layout] || layText;
  L(ctx, card, y, ctxText, content, settings);

  // 출처 (2장, 7장)
  if ((index === 1 || index === content.cards.length - 1) && content.sources?.length) {
    const src = `출처: ${content.sources.map((s) => s.name).filter(Boolean).slice(0, 3).join(', ')}`;
    ctx.font = `500 22px ${family}`; ctx.fillStyle = shade(t.brown, 0.35);
    const sp = span(H - 70, H - 40);
    let s = src;
    while (ctx.measureText(s).width > sp.w && s.length > 4) s = s.slice(0, -1);
    ctx.fillText(s === src ? s : `${s.slice(0, -1)}…`, sp.l, H - 48);
  }
  // 브랜드 표기
  if (index === 0) {
    ctx.font = `700 24px ${family}`; ctx.fillStyle = shade(t.brown, 0.3);
    ctx.fillText(`${settings.brand}  ${settings.handle}`, PAD, H - 48);
  }

  if (showMoa) {
    drawMoa(ctx, env, card, box, t, family);
    drawBubble(ctx, card.moaSays, box, t, family, pos);
  }
  return canvas;
}

function drawLabel(ctx, label, y, { family, t }) {
  ctx.font = `800 26px ${family}`;
  const w = ctx.measureText(label).width + 36;
  ctx.fillStyle = t.pink; roundRect(ctx, PAD, y, w, 46, 23); ctx.fill();
  ctx.fillStyle = t.brown; ctx.textBaseline = 'middle'; ctx.fillText(label, PAD + 18, y + 24);
  ctx.textBaseline = 'alphabetic';
  return y + 76;
}

const setSpacing = (ctx, px) => { try { ctx.letterSpacing = `${px}px`; } catch { /* 미지원 브라우저 */ } };

function block(ctx, text, y, o, opts) {
  if (!text) return y;
  // 굵은 제목은 자간을 살짝 좁혀 요즘 매거진 느낌으로
  setSpacing(ctx, opts.weight >= 800 ? -Math.round(opts.max * 0.025) : 0);
  try { return blockInner(ctx, text, y, o, opts); } finally { setSpacing(ctx, 0); }
}

function blockInner(ctx, text, y, o, opts) {
  const { family, span, fontScale } = o;
  const lh = opts.lh || 1.28;
  const widthAt = (i, size) => span(y + i * size * lh, y + (i + 1) * size * lh).w;
  const r = fit(ctx, text, { family, weight: opts.weight, max: Math.round(opts.max * fontScale), min: Math.round(opts.min * fontScale), maxLines: opts.maxLines, widthAt });
  ctx.font = `${opts.weight} ${r.size}px ${family}`;
  const x = span(y, y + r.size * lh).l;
  return drawLines(ctx, text, r.lines, {
    x, y, size: r.size, lh, color: opts.color, hl: opts.hl, hlColor: opts.hlColor, hlText: opts.hlText,
    align: opts.align, widthAt: (i) => widthAt(i, r.size),
  });
}

function layBig(ctx, card, y, o) {
  const { t, textColor } = o;
  if (!card.style?.hideLabel && card.type === 'HOOK') {
    ctx.fillStyle = t.pink; ctx.globalAlpha = 0.9;
    ctx.font = `800 120px ${o.family}`; ctx.fillText('“', PAD - 6, 270 + Math.round((H - 1080) * 0.35));
    ctx.globalAlpha = 1;
  }
  const top = 260 + Math.round((H - 1080) * 0.35); // 세로형 카드에서는 제목을 조금 내려 시선 중앙에 둔다
  let yy = block(ctx, card.title, top, o, { weight: 800, max: 108, min: 60, maxLines: 4, lh: 1.22, color: textColor, hl: card.highlight, hlColor: t.pink });
  yy += 28;
  block(ctx, card.body, yy, o, { weight: 500, max: 42, min: 30, maxLines: 3, lh: 1.4, color: shade(textColor, 0.15), hl: card.highlight, hlColor: 'transparent', hlText: '#E07A76' });
}

function layText(ctx, card, y, o) {
  const { t, textColor, family, fontScale } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 78, min: 50, maxLines: 3, lh: 1.24, color: textColor, hl: card.highlight, hlColor: t.pink });
  if (!card.body) return;
  yy += 36;
  // 본문 흰 박스: 박스가 차지할 높이 전체에서 쓸 수 있는 폭으로 줄바꿈한 뒤, 실제 글자 크기에 맞춰 박스를 줄인다
  const PADX = 40;
  const PADY = 34;
  const lh = 1.5;
  let boxW = o.span(yy, yy + 500).w;
  let r;
  for (let pass = 0; pass < 3; pass++) {
    const innerW = boxW - PADX * 2;
    r = fit(ctx, card.body, { family, weight: 500, max: Math.round(46 * fontScale), min: Math.round(30 * fontScale), maxLines: 6, widthAt: () => innerW });
    const h = PADY * 2 + (r.lines.length - 1) * r.size * lh + r.size * 1.2;
    const w = o.span(yy, yy + h).w;
    if (w === boxW) break;
    boxW = w;
  }
  ctx.font = `500 ${r.size}px ${family}`;
  const textW = Math.max(...r.lines.map((ln) => ctx.measureText(card.body.slice(ln.start, ln.end)).width));
  const w = Math.min(boxW, Math.ceil(textW) + PADX * 2);
  const h = PADY * 2 + (r.lines.length - 1) * r.size * lh + r.size * 1.2;
  const x = o.span(yy, yy + h).l;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.shadowColor = 'rgba(111,98,88,0.10)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  roundRect(ctx, x, yy, w, h, 36); ctx.fill();
  ctx.restore();
  ctx.font = `500 ${r.size}px ${family}`;
  drawLines(ctx, card.body, r.lines, {
    x: x + PADX, y: yy + PADY - r.size * 0.12, size: r.size, lh, color: textColor,
    hl: card.highlight, hlColor: 'transparent', hlText: '#D9706B', widthAt: () => w - PADX * 2,
  });
}

function layList(ctx, card, y, o) {
  const { t, textColor, family, fontScale } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 70, min: 46, maxLines: 2, lh: 1.22, color: textColor, hl: card.highlight, hlColor: t.pink });
  yy += 30;
  const items = (card.items || []).slice(0, 5);
  const gap = 20;
  const avail = H - 80 - yy;
  const rowH = Math.min(132, Math.floor((avail - gap * (items.length - 1)) / Math.max(1, items.length)));
  items.forEach((it, i) => {
    const sp = o.span(yy, yy + rowH);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(111,98,88,0.08)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    roundRect(ctx, sp.l, yy, sp.w, rowH, rowH / 2.4); ctx.fill();
    ctx.restore();
    const r = Math.min(30, rowH * 0.3);
    const cx = sp.l + 26 + r;
    const cy = yy + rowH / 2;
    const isCheck = card.type === 'LIFE/CHECK';
    ctx.fillStyle = isCheck ? t.green : t.pink;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (isCheck) {
      ctx.strokeStyle = t.brown; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy); ctx.lineTo(cx - r * 0.1, cy + r * 0.35); ctx.lineTo(cx + r * 0.5, cy - r * 0.35); ctx.stroke();
    } else {
      ctx.fillStyle = t.brown; ctx.font = `800 ${r * 1.1}px ${family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy + 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    const tx = cx + r + 22;
    const tw = sp.r - tx - 26;
    const res = fit(ctx, it, { family, weight: 700, max: Math.round(40 * fontScale), min: 26, maxLines: rowH > 100 ? 2 : 1, widthAt: () => tw });
    ctx.font = `700 ${res.size}px ${family}`;
    const th = res.lines.length * res.size * 1.3;
    drawLines(ctx, it, res.lines, { x: tx, y: cy - th / 2 - res.size * 0.12, size: res.size, lh: 1.3, color: textColor, hl: card.highlight, hlColor: t.pink, widthAt: () => tw });
    yy += rowH + gap;
  });
  if (!items.length && card.body) block(ctx, card.body, yy, o, { weight: 500, max: 44, min: 30, maxLines: 6, lh: 1.5, color: textColor });
}

function layNumber(ctx, card, y, o) {
  const { t, textColor, family } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 60, min: 42, maxLines: 2, lh: 1.24, color: textColor });
  yy += 20;
  const sp = o.span(yy, yy + 220);
  const r = fit(ctx, card.number, { family, weight: 900, max: 220, min: 100, maxLines: 1, widthAt: () => sp.w });
  ctx.font = `900 ${r.size}px ${family}`;
  const w = ctx.measureText(card.number).width;
  ctx.fillStyle = t.pink; roundRect(ctx, sp.l - 8, yy + r.size * 0.55, w + 16, r.size * 0.38, 16); ctx.fill();
  ctx.fillStyle = textColor; ctx.fillText(card.number, sp.l, yy + r.size * 0.86);
  yy += r.size + 10;
  yy = block(ctx, card.numberLabel, yy, o, { weight: 700, max: 44, min: 32, maxLines: 1, color: shade(textColor, 0.1) });
  yy += 20;
  block(ctx, card.body, yy, o, { weight: 500, max: 40, min: 30, maxLines: 4, lh: 1.5, color: textColor, hl: card.highlight, hlColor: 'transparent', hlText: '#D9706B' });
}

function layCompare(ctx, card, y, o) {
  const { t, textColor, family } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 66, min: 44, maxLines: 2, lh: 1.24, color: textColor, hl: card.highlight, hlColor: t.pink });
  yy += 34;
  const c = card.compare;
  const gap = 28;
  const w = (SIZE - PAD * 2 - gap) / 2;
  const h = Math.min(460, H - 320 - yy);
  [[c.leftTitle || 'BEFORE', c.left, t.green, PAD], [c.rightTitle || 'AFTER', c.right, t.pink, PAD + w + gap]].forEach(([title, body, color, x]) => {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(111,98,88,0.10)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    roundRect(ctx, x, yy, w, h, 32); ctx.fill(); ctx.restore();
    ctx.fillStyle = color; roundRect(ctx, x, yy, w, 84, 32); ctx.fill(); ctx.fillRect(x, yy + 50, w, 34);
    ctx.fillStyle = textColor; ctx.font = `800 36px ${family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, x + w / 2, yy + 44); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const r = fit(ctx, body || '', { family, weight: 600, max: 40, min: 26, maxLines: Math.floor((h - 120) / 48), widthAt: () => w - 60 });
    ctx.font = `600 ${r.size}px ${family}`;
    drawLines(ctx, body || '', r.lines, { x: x + 30, y: yy + 110, size: r.size, lh: 1.42, color: textColor, widthAt: () => w - 60 });
  });
  // VS 배지
  ctx.fillStyle = t.brown; ctx.beginPath(); ctx.arc(SIZE / 2, yy + h / 2, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 32px ${family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VS', SIZE / 2, yy + h / 2 + 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (card.body) block(ctx, card.body, yy + h + 30, o, { weight: 500, max: 36, min: 28, maxLines: 2, lh: 1.4, color: textColor });
}

function layKeyword(ctx, card, y, o) {
  const { t, textColor, family } = o;
  const kw = card.highlight || card.title;
  const sp = o.span(y + 20, y + 220);
  const r = fit(ctx, kw, { family, weight: 900, max: 170, min: 80, maxLines: 1, widthAt: () => sp.w });
  ctx.font = `900 ${r.size}px ${family}`;
  const w = ctx.measureText(kw).width;
  ctx.fillStyle = t.pink; roundRect(ctx, sp.l - 10, y + 20 + r.size * 0.5, w + 20, r.size * 0.42, 18); ctx.fill();
  ctx.fillStyle = textColor; ctx.fillText(kw, sp.l, y + 20 + r.size * 0.86);
  let yy = y + r.size + 70;
  if (kw !== card.title) yy = block(ctx, card.title, yy, o, { weight: 800, max: 60, min: 40, maxLines: 2, lh: 1.24, color: textColor }) + 24;
  block(ctx, card.body, yy, o, { weight: 500, max: 42, min: 30, maxLines: 4, lh: 1.5, color: textColor });
}

function layCta(ctx, card, y, o, content, settings) {
  const { t, textColor, family } = o;
  const full = { ...o, span: () => ({ l: PAD, r: SIZE - PAD, w: SIZE - PAD * 2 }) };
  let yy = block(ctx, card.title, 170, full, { weight: 800, max: 84, min: 54, maxLines: 3, lh: 1.24, color: textColor, hl: card.highlight, hlColor: t.pink, align: 'center' });
  yy += 16;
  yy = block(ctx, card.body, yy, full, { weight: 500, max: 38, min: 28, maxLines: 2, lh: 1.4, color: shade(textColor, 0.15), align: 'center' });
  yy += 30;
  const icons = [['저장', 'save'], ['공유', 'share'], ['팔로우', 'follow']];
  const gap = 210;
  const startX = SIZE / 2 - gap;
  icons.forEach(([label, kind], i) => {
    const cx = startX + i * gap;
    const cy = yy + 52;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.brown; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'save') { ctx.moveTo(cx - 16, cy - 22); ctx.lineTo(cx + 16, cy - 22); ctx.lineTo(cx + 16, cy + 24); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx - 16, cy + 24); ctx.closePath(); }
    if (kind === 'share') { ctx.moveTo(cx - 22, cy + 2); ctx.lineTo(cx + 24, cy - 20); ctx.lineTo(cx + 6, cy + 24); ctx.lineTo(cx, cy + 6); ctx.closePath(); }
    if (kind === 'follow') { ctx.arc(cx - 4, cy - 10, 12, 0, Math.PI * 2); ctx.moveTo(cx - 26, cy + 24); ctx.quadraticCurveTo(cx - 4, cy - 6, cx + 18, cy + 24); ctx.moveTo(cx + 22, cy - 18); ctx.lineTo(cx + 22, cy - 2); ctx.moveTo(cx + 14, cy - 10); ctx.lineTo(cx + 30, cy - 10); }
    ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = `700 28px ${family}`; ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 92); ctx.textAlign = 'left';
  });
  ctx.font = `800 32px ${family}`; ctx.fillStyle = textColor; ctx.textAlign = 'center';
  ctx.fillText(settings.handle, SIZE / 2, yy + 196); ctx.textAlign = 'left';
}

// ---------- 캐릭터 썸네일 커버 (흰 배경 + 큰 제목 + 말풍선 + 모아) ----------
export const CHARACTER_FONTS = { title: '"Jua", "GmarketSans", "Pretendard Variable", sans-serif', bubble: '"Nanum Pen Script", "Jua", "Pretendard Variable", sans-serif' };
const NUM_RE = /\d[\d,.]*\s?(만|천|억|조|%|원|년|배|살|대|가지|개)?/g;

async function drawCharacterCover(ctx, content, card, { t, settings, env, fontScale, pos }) {
  const accent = '#3B7DD8';
  const title = card.title || content.title;
  const says = card.moaSays || '';
  try {
    await Promise.all([document.fonts.load(`400 80px ${CHARACTER_FONTS.title}`, title), document.fonts.load(`400 40px ${CHARACTER_FONTS.bubble}`, says || '가')]);
  } catch { /* 폰트 실패 시 대체 폰트 */ }
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, SIZE, H);

  // 제목: 가운데 정렬, 핵심어·숫자는 파란색
  const fam = CHARACTER_FONTS.title;
  const maxW = SIZE - 120;
  setSpacing(ctx, -3);
  const r = fit(ctx, title, { family: fam, weight: 400, max: Math.round(150 * fontScale), min: 80, maxLines: 3, widthAt: () => maxW });
  const lh = 1.12;
  const blockH = r.lines.length * r.size * lh;
  const top = Math.round(H * 0.1 + (H * 0.42 - blockH) / 2);
  const flags = new Array(title.length).fill(false);
  if (card.highlight) { let i = title.indexOf(card.highlight); while (i >= 0) { for (let k = 0; k < card.highlight.length; k++) flags[i + k] = true; i = title.indexOf(card.highlight, i + 1); } }
  for (const m of title.matchAll(NUM_RE)) for (let k = 0; k < m[0].length; k++) flags[m.index + k] = true;
  ctx.font = `400 ${r.size}px ${fam}`; ctx.textBaseline = 'alphabetic';
  r.lines.forEach((ln, i) => {
    const line = title.slice(ln.start, ln.end);
    const w = ctx.measureText(line).width;
    let x = (SIZE - w) / 2;
    const y = top + r.size + i * r.size * lh;
    let k = 0;
    while (k < line.length) {
      const on = flags[ln.start + k];
      let j = k;
      while (j < line.length && flags[ln.start + j] === on) j++;
      const seg = line.slice(k, j);
      ctx.fillStyle = on ? accent : '#1E1E1E';
      ctx.fillText(seg, x, y);
      x += ctx.measureText(seg).width;
      k = j;
    }
  });
  setSpacing(ctx, 0);

  // 모아 (오른쪽 아래 크게)
  const box = moaBox(env.moa, pos === 'bl' ? 'bl' : 'br', 1.0 + ((H - 1080) / 1080) * 1.2); // 세로형일수록 크게
  if (env.moa) drawMoa(ctx, env, card, box, t, '"Pretendard Variable", sans-serif');

  drawToonBubble(ctx, says, box, pos === 'bl' ? 'left' : 'right');

  // 작은 계정 표기
  ctx.fillStyle = '#9A9A9A'; ctx.font = `600 24px "Pretendard Variable", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(settings.handle, PAD - 20, H - 44);
}

// ---------- 매거진 커버 ----------
function drawMagazineCover(ctx, content, card, img, { family, t, settings, env, pos, moaScale, fontScale }) {
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const sc = Math.max(SIZE / iw, H / ih);
    ctx.drawImage(img, (SIZE - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc);
  } else {
    // 사진이 없을 때: 짙은 단색 + 주제 색 빛번짐
    const catC = (CATEGORIES[content.category] || CATEGORIES.NEWS).color || '#6F6258';
    ctx.fillStyle = '#17130F'; ctx.fillRect(0, 0, SIZE, H);
    const rg = ctx.createRadialGradient(SIZE * 0.78, H * 0.3, 40, SIZE * 0.78, H * 0.3, SIZE * 0.9);
    rg.addColorStop(0, `${catC}AA`); rg.addColorStop(1, 'rgba(23,19,15,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, SIZE, H);
  }
  // 위·아래 어둡게 (헤더와 제목 가독성)
  let g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, 260);
  g = ctx.createLinearGradient(0, H * 0.42, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.42, SIZE, H * 0.58);

  const cat = CATEGORIES[content.category] || CATEGORIES.NEWS;
  // 헤더: 브랜드 + 페이지
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `800 30px ${family}`; ctx.textBaseline = 'middle';
  ctx.fillText(settings.brand, PAD, 86);
  ctx.textAlign = 'right'; ctx.font = `700 28px ${family}`;
  ctx.fillText(`1 / ${content.cards.length}`, SIZE - PAD, 86);
  ctx.textAlign = 'left';

  const maxW = SIZE - PAD * 2 - (pos === 'none' ? 0 : 150);
  // 제목: 아래에서 위로 쌓는다
  const title = card.title || content.title;
  const r = fit(ctx, title, { family, weight: 900, max: Math.round(112 * fontScale), min: 64, maxLines: 3, widthAt: () => maxW });
  const lh = 1.16;
  const bodyText = card.body || '';
  const bodySize = 38;
  const bottom = H - 120;
  const bodyH = bodyText ? bodySize * 1.4 + 18 : 0;
  const titleTop = bottom - bodyH - r.lines.length * r.size * lh;
  // 키커 라벨 (주제)
  const kicker = `${cat.name}`;
  ctx.font = `800 28px ${family}`;
  const kw = ctx.measureText(kicker).width;
  const ky = titleTop - 64;
  ctx.fillStyle = '#FFE45C'; ctx.fillRect(PAD, ky, 16, 16);
  ctx.fillRect(PAD + 26, ky - 10, kw + 22, 38);
  ctx.fillStyle = '#1F1A17'; ctx.textBaseline = 'middle'; ctx.fillText(kicker, PAD + 37, ky + 9);
  ctx.textBaseline = 'alphabetic';
  // 제목
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18;
  try { ctx.letterSpacing = `${-Math.round(r.size * 0.03)}px`; } catch { /* 미지원 브라우저 */ }
  ctx.font = `900 ${r.size}px ${family}`;
  drawLines(ctx, title, r.lines, { x: PAD, y: titleTop, size: r.size, lh, color: '#FFFFFF', hl: card.highlight, hlColor: 'rgba(0,0,0,0)', hlText: '#FFE45C', widthAt: () => maxW });
  ctx.restore();
  try { ctx.letterSpacing = '0px'; } catch { /* 무시 */ }
  if (bodyText) {
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = `600 ${bodySize}px ${family}`;
    let b = bodyText.replace(/\n/g, ' ');
    while (ctx.measureText(b).width > maxW && b.length > 2) b = b.slice(0, -1);
    ctx.fillText(b === bodyText ? b : `${b.slice(0, -1)}…`, PAD, bottom - 4);
  }
  // 하단 계정
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `600 24px ${family}`;
  ctx.fillText(settings.handle, PAD, H - 52);
  // 모아는 오른쪽 아래에 작게
  if (pos !== 'none' && env.moa) {
    const b = moaBox(env.moa, pos === 'bl' ? 'bl' : 'br', moaScale);
    drawMoa(ctx, env, card, b, t, family);
  }
}

// ---------- 배경 ----------
function drawCoverImage(ctx, img, bg) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const sc = Math.max(SIZE / iw, H / ih);
  const w = iw * sc;
  const h = ih * sc;
  ctx.drawImage(img, (SIZE - w) / 2, (H - h) / 2, w, h);
  fadeTop(ctx, bg);
}

// 제목이 잘 읽히도록 위쪽을 배경색으로 부드럽게 덮는다
function fadeTop(ctx, bg) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const c = (a) => {
    const n = parseInt(bg.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  g.addColorStop(0, c(0.92));
  g.addColorStop(0.45, c(0.7));
  g.addColorStop(0.75, c(0.15));
  g.addColorStop(1, c(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, H);
}

// 주제별 일러스트 배경 (이미지가 없을 때 첫 장에 자동으로 깔림)
function drawMotif(ctx, category, t) {
  const col = ({ NEWS: '#8C7F75', TREND: '#E8837E', AI: '#7FA3C8', LIFE: '#8FB58A', MONEY: '#D9A441', FOOD: '#E9A06B', BEAUTY: '#E4A1B9', CULTURE: '#9C8CC4', SHOPPING: '#6FB3A8', MOA: '#F29C9C' })[category] || t.brown;
  const B = H; // 아래쪽 기준
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const ring = (x, y, r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); };
  const star = (x, y, r) => { sparkle(ctx, x, y, r); ctx.fill(); };
  switch (category) {
    case 'MONEY': {
      [[170, B - 300, 110], [360, B - 170, 74], [110, B - 120, 58]].forEach(([x, y, r]) => { circle(x, y, r); ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ring(x, y, r * 0.72, 8); ctx.restore(); });
      [[700, 330, 70], [790, 270, 130], [880, 200, 200]].forEach(([x, top, hh]) => { roundRect(ctx, x, top + 200 - hh, 64, hh, 14); ctx.fill(); });
      ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(680, 470); ctx.lineTo(800, 380); ctx.lineTo(860, 420); ctx.lineTo(980, 300); ctx.stroke();
      break;
    }
    case 'AI': {
      const nodes = [[120, B - 420], [300, B - 330], [180, B - 200], [420, B - 150], [90, B - 90]];
      ctx.lineWidth = 8;
      nodes.forEach(([x, y], i) => nodes.slice(i + 1, i + 3).forEach(([x2, y2]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); }));
      nodes.forEach(([x, y]) => circle(x, y, 26));
      roundRect(ctx, 760, 190, 200, 200, 36); ctx.fill();
      ctx.lineWidth = 12;
      for (let i = 0; i < 4; i++) { const o = 220 + i * 45; ctx.beginPath(); ctx.moveTo(o + 560, 160); ctx.lineTo(o + 560, 190); ctx.moveTo(o + 560, 390); ctx.lineTo(o + 560, 420); ctx.stroke(); }
      break;
    }
    case 'FOOD': {
      ctx.beginPath(); ctx.arc(220, B - 260, 170, 0, Math.PI); ctx.fill();
      roundRect(ctx, 40, B - 280, 360, 30, 15); ctx.fill();
      ctx.lineWidth = 12;
      [150, 220, 290].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, B - 330); ctx.bezierCurveTo(x - 30, B - 380, x + 30, B - 420, x, B - 470); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(840, 180); ctx.lineTo(960, 390); ctx.lineTo(720, 390); ctx.closePath(); ctx.fill();
      break;
    }
    case 'BEAUTY': {
      roundRect(ctx, 150, B - 470, 110, 150, 40); ctx.fill();
      roundRect(ctx, 130, B - 330, 150, 230, 24); ctx.fill();
      [[380, B - 260, 46], [460, B - 380, 28], [330, B - 420, 20], [820, 260, 60], [930, 380, 34]].forEach(([x, y, r]) => ring(x, y, r, 8));
      star(760, 400, 40); star(560, B - 140, 30);
      break;
    }
    case 'CULTURE': {
      ctx.save(); ctx.translate(250, B - 280); ctx.rotate(-0.35);
      roundRect(ctx, -260, -90, 520, 180, 20); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = -220; i < 240; i += 70) { roundRect(ctx, i, -76, 34, 24, 6); ctx.fill(); roundRect(ctx, i, 52, 34, 24, 6); ctx.fill(); }
      ctx.restore();
      star(820, 240, 56); star(930, 380, 32); star(700, 360, 26);
      break;
    }
    case 'SHOPPING': {
      [[90, B - 380, 230, 260], [280, B - 290, 180, 200]].forEach(([x, y, w, hh]) => {
        roundRect(ctx, x, y, w, hh, 22); ctx.fill();
        ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(x + w / 2, y, w * 0.24, Math.PI, 0); ctx.stroke();
      });
      ctx.save(); ctx.translate(840, 290); ctx.rotate(0.4);
      roundRect(ctx, -90, -60, 180, 120, 22); ctx.fill();
      ctx.restore();
      break;
    }
    case 'LIFE': {
      ctx.beginPath(); ctx.moveTo(60, B - 300); ctx.lineTo(240, B - 460); ctx.lineTo(420, B - 300); ctx.closePath(); ctx.fill();
      roundRect(ctx, 100, B - 310, 280, 220, 18); ctx.fill();
      circle(860, 280, 90);
      ctx.lineWidth = 12;
      for (let a = 0; a < 360; a += 45) { const r = (a * Math.PI) / 180; ctx.beginPath(); ctx.moveTo(860 + Math.cos(r) * 120, 280 + Math.sin(r) * 120); ctx.lineTo(860 + Math.cos(r) * 150, 280 + Math.sin(r) * 150); ctx.stroke(); }
      [[560, B - 160, 50], [620, B - 180, 64], [690, B - 160, 48]].forEach(([x, y, r]) => circle(x, y, r));
      break;
    }
    case 'TREND': {
      const flame = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 90 * s, y - 60 * s, x - 40 * s, y - 170 * s, x, y - 240 * s); ctx.bezierCurveTo(x + 50 * s, y - 160 * s, x + 100 * s, y - 70 * s, x, y); ctx.fill(); };
      flame(200, B - 100, 1.3); flame(380, B - 110, 0.8);
      ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(720, 440); ctx.lineTo(940, 220); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(860, 210); ctx.lineTo(950, 210); ctx.lineTo(950, 300); ctx.stroke();
      star(700, 240, 34);
      break;
    }
    case 'MOA': {
      [[180, B - 300, 110], [380, B - 180, 60], [860, 300, 80], [720, 420, 40]].forEach(([x, y, r]) => { heartPath(ctx, x, y, r); ctx.fill(); });
      [[120, 420, 40], [180, 400, 56], [250, 420, 40]].forEach(([x, y, r]) => circle(x, y + 500, r));
      break;
    }
    default: { // NEWS: 신문
      ctx.save(); ctx.translate(230, B - 300); ctx.rotate(-0.12);
      roundRect(ctx, -190, -150, 380, 300, 24); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff';
      roundRect(ctx, -150, -110, 140, 100, 10); ctx.fill();
      [-110, -70, -30].forEach((yy) => { roundRect(ctx, 20, yy, 130, 16, 8); ctx.fill(); });
      [20, 60, 100].forEach((yy) => { roundRect(ctx, -150, yy, 300, 16, 8); ctx.fill(); });
      ctx.restore();
      circle(860, 280, 80);
      ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.font = '900 110px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 860, 286); ctx.restore();
      break;
    }
  }
  ctx.restore();
}


// =====================================================================
// 덱 디자인 테마
// =====================================================================
export const DECK_THEMES = {
  toon: '🐑 인스타툰 (흰 배경 · 손글씨 말풍선 · 모아가 매 장 등장)',
  magazine: '📰 매거진 (사진 커버 · 종이 질감 · 굵은 타이포)',
};
export function deckTheme(content, settings) {
  if (content?.theme) return content.theme;
  if (content?.coverStyle === 'magazine') return 'magazine';
  if (content?.coverStyle) return 'toon';
  return settings?.deckTheme || 'toon';
}

// 같은 카드는 항상 같은 손그림 흔들림이 나오도록 시드 고정 난수
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function sketchRect(ctx, x, y, w, h, r, seed, color = '#2B2B2B', lw = 4) {
  const rnd = seeded(seed);
  const j = () => (rnd() - 0.5) * 5;
  ctx.save(); ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.35 : 1; ctx.lineWidth = pass ? lw * 0.6 : lw;
    const [x1, y1, x2, y2] = [x + j(), y + j(), x + w + j(), y + h + j()];
    ctx.beginPath();
    ctx.moveTo(x1 + r, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, y1 + j(), x2 - r, y1 + j() * 0.5);
    ctx.quadraticCurveTo(x2, y1, x2 + j() * 0.3, y1 + r);
    ctx.quadraticCurveTo(x2 + j(), (y1 + y2) / 2, x2, y2 - r);
    ctx.quadraticCurveTo(x2, y2, x2 - r, y2 + j() * 0.3);
    ctx.quadraticCurveTo((x1 + x2) / 2, y2 + j(), x1 + r, y2);
    ctx.quadraticCurveTo(x1, y2, x1 + j() * 0.3, y2 - r);
    ctx.quadraticCurveTo(x1 + j(), (y1 + y2) / 2, x1, y1 + r);
    ctx.quadraticCurveTo(x1, y1, x1 + r + j() * 0.3, y1);
    ctx.stroke();
  }
  ctx.restore();
}
function sketchLine(ctx, x1, y1, x2, y2, seed, color = '#2B2B2B', lw = 3) {
  const rnd = seeded(seed);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1 + (rnd() - 0.5) * 3);
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + (rnd() - 0.5) * 8, x2, y2 + (rnd() - 0.5) * 3);
  ctx.stroke(); ctx.restore();
}
function sketchCircle(ctx, cx, cy, r, seed, fill, color = '#2B2B2B', lw = 3.5) {
  const rnd = seeded(seed);
  ctx.save();
  if (fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  for (let a = 0; a <= Math.PI * 2.08; a += Math.PI / 10) {
    const rr = r + (rnd() - 0.5) * 3;
    const px = cx + Math.cos(a) * rr; const py = cy + Math.sin(a) * rr;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke(); ctx.restore();
}

// 핵심어(highlight)와 숫자를 강조 표시할 위치
function keyFlags(text, hl) {
  const flags = new Array(text.length).fill(false);
  if (hl) { let i = text.indexOf(hl); while (i >= 0) { for (let k = 0; k < hl.length; k++) flags[i + k] = true; i = text.indexOf(hl, i + 1); } }
  for (const m of text.matchAll(NUM_RE)) for (let k = 0; k < m[0].length; k++) flags[m.index + k] = true;
  return flags;
}
// "라벨: 내용" 형식 항목은 라벨을 강조한다 (예: "11월 20일: 신청 시작")
function itemFlags(text, hl) {
  const flags = keyFlags(text, hl);
  const i = text.indexOf(': ');
  if (i > 0 && i <= 16) { flags.fill(false); for (let k = 0; k <= i; k++) flags[k] = true; }
  return flags;
}

// 줄마다 정렬해서 강조어는 다른 색으로 그린다
function drawRich(ctx, text, lines, { x, w, top, size, lh, color, accent, flags, align = 'center', marker }) {
  ctx.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => {
    const line = text.slice(ln.start, ln.end);
    const lw = ctx.measureText(line).width;
    let cx = align === 'center' ? x + (w - lw) / 2 : x;
    const y = top + size + i * size * lh;
    let k = 0;
    while (k < line.length) {
      const on = flags[ln.start + k];
      let j = k;
      while (j < line.length && flags[ln.start + j] === on) j++;
      const seg = line.slice(k, j);
      const sw = ctx.measureText(seg).width;
      if (on && marker) { ctx.fillStyle = marker; ctx.fillRect(cx - 4, y - size * 0.38, sw + 8, size * 0.42); }
      ctx.fillStyle = on && !marker ? accent : color;
      ctx.fillText(seg, cx, y);
      cx += sw;
      k = j;
    }
  });
  return top + lines.length * size * lh;
}

// 노란 손글씨 말풍선 — side: 모아가 있는 쪽
function drawToonBubble(ctx, text, box, side = 'right', maxW = 340) {
  if (!text) return;
  const bf = CHARACTER_FONTS.bubble;
  ctx.save();
  ctx.font = `400 46px ${bf}`;
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 3);
  const bw = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 64;
  const bh = shown.length * 50 + 40;
  const bx = side === 'right' ? Math.max(30, box.x - bw + 30) : Math.min(SIZE - bw - 30, box.x + box.w - 30);
  const by = Math.max(20, box.y + box.h * 0.3 - bh / 2);
  ctx.fillStyle = '#FFE58A'; ctx.strokeStyle = '#4A3B2F'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  const rr = 34;
  const tailY = by + bh * 0.62;
  ctx.beginPath();
  ctx.moveTo(bx + rr, by);
  ctx.lineTo(bx + bw - rr, by + 2);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw - 2, by + rr);
  if (side === 'right') { ctx.lineTo(bx + bw - 2, tailY - 14); ctx.lineTo(bx + bw + 46, tailY + 18); ctx.lineTo(bx + bw - 6, tailY + 6); }
  ctx.lineTo(bx + bw, by + bh - rr);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh - 1);
  ctx.lineTo(bx + rr, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx + 1, by + bh - rr);
  if (side === 'left') { ctx.lineTo(bx + 2, tailY + 6); ctx.lineTo(bx - 46, tailY + 18); ctx.lineTo(bx + 2, tailY - 14); }
  ctx.lineTo(bx, by + rr);
  ctx.quadraticCurveTo(bx, by, bx + rr, by);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3A2E25'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 45 + i * 50));
  ctx.restore();
}

async function loadThemeFonts(texts) {
  const sample = [...new Set(texts.filter(Boolean).join('').replace(/\s/g, ''))].join('') || '가';
  try {
    await Promise.all([
      document.fonts.load(`400 80px ${CHARACTER_FONTS.title}`, sample),
      document.fonts.load(`400 40px ${CHARACTER_FONTS.bubble}`, sample),
      document.fonts.load('900 60px "Pretendard Variable"', sample),
    ]);
  } catch { /* 대체 폰트 사용 */ }
}
const cardTexts = (card) => [card.title, card.body, card.highlight, card.moaSays, card.number, card.numberLabel, ...(card.items || []), ...Object.values(card.compare || {})];

// ---------------------------------------------------------------------
// 인스타툰
// ---------------------------------------------------------------------
// 인스타툰 배경 (흰색 또는 장마다 다른 파스텔)
export const TOON_PASTELS = ['#FBE8A6', '#BFE3B4', '#BFDDF2', '#F9C29B', '#D9C3F0', '#F8CFE0', '#F6F1C7'];
export const TOON_FONTS = {
  Jua: '"Jua", "Pretendard Variable", sans-serif',
  DoHyeon: '"Do Hyeon", "Jua", "Pretendard Variable", sans-serif',
  BlackHanSans: '"Black Han Sans", "Jua", "Pretendard Variable", sans-serif',
};

// 손그림 말풍선: 텍스트 박스를 그리고 꼬리를 target 쪽으로 낸다
function comicBubble(ctx, text, { cx, cy, maxW = 560, size = 50, target, fill = '#FFFFFF', ink = '#1E1E1E', seed = 1, align = 'center' }) {
  if (!text) return null;
  const bf = CHARACTER_FONTS.bubble;
  ctx.save();
  ctx.font = `400 ${size}px ${bf}`;
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const ch of para.split(/(\s+)/)) {
      const next = cur + ch;
      if (ctx.measureText(next.trim()).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = ch.trimStart(); } else cur = next;
    }
    if (cur.trim()) lines.push(cur.trim());
  }
  const shown = lines.slice(0, 5);
  const lh = size * 1.12;
  const w = Math.max(...shown.map((l) => ctx.measureText(l).width)) + size * 1.3;
  const h = shown.length * lh + size * 0.9;
  let x = align === 'left' ? cx : cx - w / 2;
  x = Math.max(28, Math.min(SIZE - w - 28, x));
  const y = cy - h / 2;
  const rnd = seeded(seed);
  const j = () => (rnd() - 0.5) * 6;
  const r = Math.min(h / 2, 70);
  // 꼬리 (말풍선 가장자리 → 대상 방향)
  let tail = null;
  if (target) {
    const bx = Math.max(x + r, Math.min(x + w - r, target.x));
    const by = target.y > y + h ? y + h : target.y < y ? y : null;
    if (by !== null) {
      const dir = Math.sign(target.y - by) || 1;
      const len = Math.min(70, Math.abs(target.y - by) * 0.6 + 30);
      const tx = bx + Math.max(-60, Math.min(60, (target.x - bx) * 0.4));
      tail = [[bx - 22, by], [tx, by + dir * len], [bx + 22, by]];
    } else {
      const side = target.x > x + w ? x + w : x;
      const dir = target.x > x + w ? 1 : -1;
      const ty = Math.max(y + r * 0.6, Math.min(y + h - r * 0.6, target.y));
      tail = [[side, ty - 20], [side + dir * 60, ty + 26], [side, ty + 20]];
    }
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y + j());
    ctx.quadraticCurveTo(x + w / 2, y + j(), x + w - r, y + j());
    ctx.quadraticCurveTo(x + w + j(), y + j(), x + w + j(), y + h / 2);
    ctx.quadraticCurveTo(x + w + j(), y + h + j(), x + w - r, y + h + j());
    ctx.quadraticCurveTo(x + w / 2, y + h + j(), x + r, y + h + j());
    ctx.quadraticCurveTo(x + j(), y + h + j(), x + j(), y + h / 2);
    ctx.quadraticCurveTo(x + j(), y + j(), x + r, y + j());
    ctx.closePath();
  };
  ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = 4.5;
  if (tail) { ctx.beginPath(); ctx.moveTo(...tail[0]); ctx.lineTo(...tail[1]); ctx.lineTo(...tail[2]); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  path(); ctx.fill(); ctx.stroke();
  if (tail) { ctx.strokeStyle = fill; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(tail[0][0] + 4, tail[0][1]); ctx.lineTo(tail[2][0] - 4, tail[2][1]); ctx.stroke(); }
  ctx.fillStyle = '#222222';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((l, i) => ctx.fillText(l, x + w / 2, y + size * 0.45 + lh * (i + 0.5) + 2));
  ctx.restore();
  return { x, y, w, h };
}

// 효과음처럼 쓰는 손글씨 한마디 (말풍선 없이)
function sfx(ctx, text, x, y, size = 44, rot = -0.12, color = '#1E1E1E') {
  if (!text) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = `400 ${size}px ${CHARACTER_FONTS.bubble}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0); ctx.restore();
}

// 모아를 크게, 아래 가장자리에 걸치게(잘리게) 배치
function toonMoaBox(env, side, heightRatio) {
  const h = H * heightRatio;
  const ratio = env.moa ? env.moa.naturalWidth / env.moa.naturalHeight : 0.86;
  const w = h * ratio;
  const x = side === 'left' ? 30 : side === 'center' ? (SIZE - w) / 2 : SIZE - w - 30;
  const y = H - h * 0.9; // 아래 10%는 화면 밖으로
  return { x, y, w, h };
}

async function renderToon(ctx, content, { card, st, settings, env, t, fontScale, layout, index }) {
  const fontKey = settings.toonFont && TOON_FONTS[settings.toonFont] ? settings.toonFont : 'Jua';
  const T = TOON_FONTS[fontKey];
  const B = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
  const sample = [...new Set(cardTexts(card).filter(Boolean).join('').replace(/\s/g, ''))].join('') || '가';
  try { await Promise.all([document.fonts.load(`400 80px ${T}`, sample), document.fonts.load(`400 40px ${CHARACTER_FONTS.bubble}`, sample), document.fonts.load(`700 40px ${B}`, sample)]); } catch { /* 대체 폰트 */ }

  const pastel = (settings.toonBg || 'white') === 'pastel';
  const bg = st.bg || (pastel ? TOON_PASTELS[(index + (content.id || '').length) % TOON_PASTELS.length] : '#FFFFFF');
  const ink = st.textColor || '#141414';
  const accent = st.accent || settings.toonAccent || '#F0506E';
  const bubbleFill = pastel ? '#FFFFFF' : '#F1F1F1';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, H);

  const total = content.cards.length;
  const seed = index * 131 + (content.id || 'x').length * 7;
  const X = 56;
  const W = SIZE - X * 2;
  const side = st.moaPos === 'bl' ? 'left' : st.moaPos === 'br' ? 'right' : (index % 2 ? 'left' : 'right');
  const other = side === 'left' ? 'right' : 'left';
  const showMoa = st.moaPos !== 'none' && env.moa;
  const flipCard = (sd) => ({ ...card, style: { ...st, moaFlip: sd === 'left' ? !st.moaFlip : st.moaFlip } });

  // 큰 손글씨 제목: 가운데 정렬, 핵심어·숫자는 강조색
  const bigTitle = (text, max, maxLines, top) => {
    if (!text) return top;
    setSpacing(ctx, -Math.round(max * 0.03));
    // 손글씨 제목은 굵게(합성 볼드)해서 마커로 쓴 느낌을 낸다
    const r = fit(ctx, text, { family: T, weight: 700, max: Math.round(max * fontScale), min: 60, maxLines, widthAt: () => W });
    ctx.font = `700 ${r.size}px ${T}`;
    const end = drawRich(ctx, text, r.lines, { x: X, w: W, top, size: r.size, lh: 1.1, color: ink, accent, flags: keyFlags(text, card.highlight) });
    setSpacing(ctx, 0);
    return end;
  };
  const pageMark = () => {
    if (index === 0) return;
    ctx.font = `600 24px ${B}`; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${index + 1}/${total}`, SIZE - 40, 52); ctx.textAlign = 'left';
  };
  const footer = (sd) => {
    ctx.font = `600 22px ${B}`; ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.textBaseline = 'alphabetic';
    const f = index === 1 && content.sources?.length ? `출처: ${content.sources.map((x) => x.name).filter(Boolean).slice(0, 2).join(', ')}` : settings.handle;
    if (sd === 'left') { ctx.textAlign = 'right'; ctx.fillText(f, SIZE - 40, H - 30); ctx.textAlign = 'left'; } else ctx.fillText(f, 40, H - 30);
  };
  const moaAt = (sd, ratio) => {
    if (!showMoa) return null;
    const box = toonMoaBox(env, sd, ratio * (st.moaScale || 1));
    drawMoa(ctx, env, flipCard(sd), box, t, B);
    return box;
  };
  const head = (box) => ({ x: box.x + box.w * 0.5, y: box.y + box.h * 0.28 });

  // ---------- 1장: 썸네일 ----------
  if (index === 0) {
    const titleEnd = bigTitle(card.title || content.title, 168, 3, Math.round(H * 0.06));
    const room = H - titleEnd;
    const box = moaAt(side, Math.min(0.5, Math.max(0.3, (room - 40) / H)));
    if (box) comicBubble(ctx, card.moaSays, { cx: side === 'right' ? box.x - 40 : box.x + box.w + 40, cy: box.y + box.h * 0.32, maxW: 360, size: 46, target: head(box), fill: bubbleFill, seed, align: side === 'right' ? 'center' : 'center' });
    footer(side);
    return;
  }

  pageMark();
  if (layout === 'list') {
    let y = bigTitle(card.title, 104, 2, 80) + 34;
    const items = (card.items || []).slice(0, 5);
    const memoBottom = H - H * 0.24;
    const rowH = Math.min(140, Math.floor((memoBottom - y - 40) / Math.max(1, items.length)));
    const mh = rowH * items.length + 50;
    ctx.save(); ctx.translate(SIZE / 2, y + mh / 2); ctx.rotate(-0.012); ctx.translate(-SIZE / 2, -(y + mh / 2));
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(X + 10, y, W - 20, mh);
    sketchRect(ctx, X + 10, y, W - 20, mh, 18, seed, '#1E1E1E', 4.5);
    items.forEach((it, i) => {
      const cy = y + 25 + rowH * (i + 0.5);
      if (card.type === 'LIFE/CHECK' && (card.kind || 'checklist') === 'checklist') {
        sketchRect(ctx, X + 50, cy - 24, 48, 48, 8, seed + i, '#1E1E1E', 4);
        ctx.strokeStyle = accent; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X + 58, cy - 2); ctx.lineTo(X + 72, cy + 14); ctx.lineTo(X + 104, cy - 30); ctx.stroke();
      } else {
        ctx.font = `400 64px ${T}`; ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), X + 74, cy + 4); ctx.textAlign = 'left';
      }
      const tw = W - 170;
      const r = fit(ctx, it, { family: T, weight: 700, max: Math.round(54 * fontScale), min: 32, maxLines: 2, widthAt: () => tw });
      ctx.font = `700 ${r.size}px ${T}`;
      const th = r.lines.length * r.size * 1.15;
      drawRich(ctx, it, r.lines, { x: X + 130, w: tw, top: cy - th / 2 - r.size * 0.12, size: r.size, lh: 1.15, color: ink, accent, flags: itemFlags(it, card.highlight), align: 'left' });
      if (i < items.length - 1) sketchLine(ctx, X + 130, y + 25 + rowH * (i + 1), X + W - 50, y + 25 + rowH * (i + 1), seed + 40 + i, '#CFCFCF', 2.5);
    });
    ctx.restore();
    const box = moaAt(side, 0.3);
    if (box) comicBubble(ctx, card.moaSays, { cx: side === 'right' ? box.x - 30 : box.x + box.w + 30, cy: box.y + box.h * 0.32, maxW: 320, size: 44, target: head(box), fill: bubbleFill, seed: seed + 9 });
    if (!items.length && card.body) comicBubble(ctx, card.body, { cx: SIZE / 2, cy: y + 160, maxW: 700, size: 50, fill: bubbleFill, seed });
    footer(side);
  } else if (layout === 'compare' && card.compare?.left) {
    const y = bigTitle(card.title, 100, 2, 80) + 40;
    const c = card.compare;
    const gap = 28;
    const w = (W - gap) / 2;
    // 내용 길이에 맞춘 패널 높이
    let need = 0;
    for (const b of [c.left, c.right]) {
      const rr = fit(ctx, b || '', { family: CHARACTER_FONTS.bubble, weight: 400, max: 50, min: 34, maxLines: 6, widthAt: () => w - 60 });
      need = Math.max(need, rr.lines.length * rr.size * 1.2);
    }
    const h = Math.min(H - y - H * 0.32, 116 + need + 60);
    [[c.leftTitle || 'BEFORE', c.left, X, -0.02], [c.rightTitle || 'AFTER', c.right, X + w + gap, 0.02]].forEach(([tt, body, x, rot], i) => {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-(x + w / 2), -(y + h / 2));
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, w, h);
      sketchRect(ctx, x, y, w, h, 16, seed + i, '#1E1E1E', 4.5);
      ctx.font = `400 52px ${T}`; ctx.fillStyle = i ? accent : ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tt, x + w / 2, y + 62); ctx.textAlign = 'left';
      const r = fit(ctx, body || '', { family: CHARACTER_FONTS.bubble, weight: 400, max: 50, min: 34, maxLines: 6, widthAt: () => w - 60 });
      ctx.font = `400 ${r.size}px ${CHARACTER_FONTS.bubble}`;
      drawRich(ctx, body || '', r.lines, { x: x + 30, w: w - 60, top: y + 116, size: r.size, lh: 1.2, color: '#222', accent, flags: new Array((body || '').length).fill(false) });
      ctx.restore();
    });
    const box = moaAt('center', 0.3);
    if (box) sfx(ctx, card.moaSays, box.x + box.w + 120, box.y + 40, 46);
    footer('center');
  } else if (layout === 'cta') {
    const y = bigTitle(card.title, 130, 3, 90) + 30;
    ['저장', '공유', '팔로우'].forEach((label, i) => {
      const cx = SIZE / 2 + (i - 1) * 210;
      sketchCircle(ctx, cx, y + 70, 62, seed + i, i === 2 ? accent : '#FFFFFF', '#1E1E1E', 4.5);
      ctx.font = `400 ${label.length > 2 ? 36 : 42}px ${T}`; ctx.fillStyle = i === 2 ? '#FFFFFF' : ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, y + 72); ctx.textAlign = 'left';
    });
    ctx.font = `400 48px ${T}`; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(settings.handle, SIZE / 2, y + 200); ctx.textAlign = 'left';
    const box = moaAt('center', 0.4);
    if (box) comicBubble(ctx, card.moaSays || card.body, { cx: box.x - 40, cy: box.y + box.h * 0.25, maxW: 300, size: 46, target: head(box), fill: bubbleFill, seed });
  } else if (layout === 'number' && card.number) {
    let y = bigTitle(card.title, 96, 2, 80) + 20;
    const r = fit(ctx, card.number, { family: T, weight: 400, max: 280, min: 120, maxLines: 1, widthAt: () => W });
    ctx.font = `700 ${r.size}px ${T}`; ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(card.number, SIZE / 2, y + r.size * 0.92);
    y += r.size;
    if (card.numberLabel) { ctx.font = `400 50px ${T}`; ctx.fillStyle = ink; ctx.fillText(card.numberLabel, SIZE / 2, y + 40); y += 70; }
    ctx.textAlign = 'left';
    const box = moaAt(side, 0.36);
    if (box) comicBubble(ctx, card.body || card.moaSays, { cx: side === 'right' ? box.x - 40 : box.x + box.w + 40, cy: Math.max(y + 120, box.y + box.h * 0.2), maxW: 460, size: 48, target: head(box), fill: bubbleFill, seed });
    footer(side);
  } else {
    // 설명형: 큰 제목 + 모아가 말풍선으로 설명
    const y = bigTitle(card.title, card.body ? 116 : 150, 3, 80);
    const box = moaAt(side, card.body ? 0.42 : 0.48);
    if (box) {
      const bubbleTop = y + 30;
      const target = head(box);
      if (card.body) {
        comicBubble(ctx, card.body, { cx: SIZE / 2, cy: bubbleTop + 140, maxW: 640, size: 52, target, fill: bubbleFill, seed });
        if (card.moaSays) sfx(ctx, card.moaSays, side === 'right' ? box.x - 30 : box.x + box.w + 30, box.y + box.h * 0.45, 46, side === 'right' ? -0.1 : 0.1);
      } else {
        comicBubble(ctx, card.moaSays, { cx: side === 'right' ? box.x - 40 : box.x + box.w + 40, cy: box.y + box.h * 0.3, maxW: 380, size: 48, target, fill: bubbleFill, seed });
      }
    } else if (card.body) {
      comicBubble(ctx, card.body, { cx: SIZE / 2, cy: y + 200, maxW: 760, size: 54, fill: bubbleFill, seed });
    }
    footer(side);
  }
}

// ---------------------------------------------------------------------
// 매거진
// ---------------------------------------------------------------------
async function renderMagazine(ctx, content, { card, st, settings, env, t, fontScale, layout, index }) {
  await loadThemeFonts([...cardTexts(card), settings.handle, settings.brand]);
  const F = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
  const ink = st.textColor || '#141414';
  const marker = st.accent || '#FFE14D';
  const total = content.cards.length;

  if (index === 0) {
    const img = env.bgs?.[`${content.id}:0`];
    drawMagazineCover(ctx, content, card, img, { family: F, t, settings, env, pos: st.moaPos || 'br', moaScale: 0.62 * (st.moaScale || 1), fontScale });
    return;
  }
  const bgImg = env.bgs?.[`${content.id}:${index}`];
  ctx.fillStyle = st.bg || '#F5F2EC'; ctx.fillRect(0, 0, SIZE, H);
  if (bgImg) drawCoverImage(ctx, bgImg, st.bg || '#F5F2EC');

  const X = 80;
  const W = SIZE - X * 2;
  // 상단 바
  const cat = CATEGORIES[content.category] || CATEGORIES.NEWS;
  setSpacing(ctx, 4);
  ctx.font = `800 22px ${F}`; ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`MOA MAGAZINE  ·  ${cat.label.replace('MOA ', '')}`, X, 82);
  ctx.textAlign = 'right'; ctx.fillText(`${String(index + 1).padStart(2, '0')} — ${String(total).padStart(2, '0')}`, X + W, 82); ctx.textAlign = 'left';
  setSpacing(ctx, 0);
  ctx.fillStyle = ink; ctx.fillRect(X, 102, W, 3);

  // 하단 바 + 모아(작게)
  const footY = H - 96;
  ctx.fillRect(X, footY, W, 1.5);
  ctx.font = `600 22px ${F}`; ctx.fillStyle = '#6B6B6B';
  const src = content.sources?.length ? `출처 ${content.sources.map((x) => x.name).filter(Boolean).slice(0, 2).join(', ')}` : settings.brand;
  ctx.fillText(src, X, footY + 44);
  ctx.textAlign = 'right'; ctx.fillText(settings.handle, X + W, footY + 44); ctx.textAlign = 'left';
  const showMoa = st.moaPos !== 'none' && env.moa;
  const mbox = showMoa ? moaBox(env.moa, 'br', 0.42 * (st.moaScale || 1)) : null;
  if (mbox) { mbox.y = footY - mbox.h + 6; mbox.x = X + W - mbox.w + 10; }
  const bottom = footY - 40 - (mbox ? 40 : 0);

  // 섹션 라벨
  let y = 150;
  const kindTag = { checklist: 'CHECK', timeline: 'TIMELINE', howto: 'HOW TO', numbers: 'NUMBERS', qa: 'Q&A', glossary: 'WORDS', proscons: 'VIEWS', related: 'MORE' }[card.kind];
  const label = kindTag || { HOOK: 'INTRO', WHAT: 'WHAT', WHY: 'WHY', 'SO WHAT': 'SO WHAT', "MOA'S PICK": "MOA'S PICK", 'LIFE/CHECK': 'CHECK', CTA: 'FOLLOW' }[card.type] || card.type;
  setSpacing(ctx, 3);
  ctx.font = `900 26px ${F}`; ctx.fillStyle = ink;
  const lw = ctx.measureText(label).width;
  ctx.fillStyle = marker; ctx.fillRect(X - 6, y - 4, lw + 12, 34);
  ctx.fillStyle = ink; ctx.textBaseline = 'top'; ctx.fillText(label, X, y); ctx.textBaseline = 'alphabetic';
  setSpacing(ctx, 0);
  y += 70;

  const title = (text, max, maxLines, yy, align = 'left') => {
    if (!text) return yy;
    setSpacing(ctx, -Math.round(max * 0.035));
    const r = fit(ctx, text, { family: F, weight: 900, max: Math.round(max * fontScale), min: 50, maxLines, widthAt: () => W });
    ctx.font = `900 ${r.size}px ${F}`;
    const end = drawRich(ctx, text, r.lines, { x: X, w: W, top: yy, size: r.size, lh: 1.16, color: ink, flags: keyFlags(text, card.highlight), marker, align });
    setSpacing(ctx, 0);
    return end;
  };
  const para = (text, yy, maxBottom, size = 40) => {
    if (!text) return yy;
    let r = fit(ctx, text, { family: F, weight: 500, max: Math.round(size * fontScale), min: 28, maxLines: 7, widthAt: () => W - 20 });
    while (yy + r.lines.length * r.size * 1.62 > maxBottom && r.size > 28) r = fit(ctx, text, { family: F, weight: 500, max: r.size - 2, min: 28, maxLines: 7, widthAt: () => W - 20 });
    ctx.fillStyle = ink; ctx.fillRect(X, yy + 8, 6, r.lines.length * r.size * 1.62 - 16);
    ctx.font = `500 ${r.size}px ${F}`;
    return drawRich(ctx, text, r.lines, { x: X + 30, w: W - 30, top: yy, size: r.size, lh: 1.62, color: '#2E2E2E', flags: new Array(text.length).fill(false), align: 'left' });
  };

  if (layout === 'list') {
    y = title(card.title, 84, 2, y) + 40;
    const items = (card.items || []).slice(0, 5);
    const rowH = Math.min(160, Math.floor((bottom - y) / Math.max(1, items.length)));
    items.forEach((it, i) => {
      ctx.fillStyle = ink; ctx.fillRect(X, y, W, 1.5);
      ctx.font = `900 64px ${F}`; ctx.fillStyle = ink; ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1).padStart(2, '0'), X, y + 22);
      ctx.textBaseline = 'alphabetic';
      const r = fit(ctx, it, { family: F, weight: 700, max: Math.round(42 * fontScale), min: 28, maxLines: 2, widthAt: () => W - 130 });
      ctx.font = `700 ${r.size}px ${F}`;
      const th = r.lines.length * r.size * 1.3;
      drawRich(ctx, it, r.lines, { x: X + 130, w: W - 130, top: y + rowH / 2 - th / 2 - r.size * 0.12, size: r.size, lh: 1.3, color: ink, flags: itemFlags(it, card.highlight), marker, align: 'left' });
      y += rowH;
    });
    if (items.length) { ctx.fillStyle = ink; ctx.fillRect(X, y, W, 1.5); }
    else para(card.body, y, bottom);
  } else if (layout === 'number' && card.number) {
    y = title(card.title, 64, 2, y) + 30;
    const r = fit(ctx, card.number, { family: F, weight: 900, max: 260, min: 120, maxLines: 1, widthAt: () => W });
    setSpacing(ctx, -8);
    ctx.font = `900 ${r.size}px ${F}`;
    const nw = ctx.measureText(card.number).width;
    ctx.fillStyle = marker; ctx.fillRect(X - 6, y + r.size * 0.55, nw + 12, r.size * 0.36);
    ctx.fillStyle = ink; ctx.fillText(card.number, X, y + r.size * 0.88);
    setSpacing(ctx, 0);
    y += r.size + 10;
    if (card.numberLabel) { setSpacing(ctx, 2); ctx.font = `800 30px ${F}`; ctx.fillText(card.numberLabel, X, y + 30); setSpacing(ctx, 0); y += 70; }
    para(card.body, y + 10, bottom);
  } else if (layout === 'compare' && card.compare?.left) {
    y = title(card.title, 76, 2, y) + 50;
    const c = card.compare;
    const w = (W - 60) / 2;
    const h = Math.min(560, bottom - y);
    ctx.fillStyle = ink; ctx.fillRect(X + w + 29, y, 2, h);
    [[c.leftTitle || 'BEFORE', c.left, X], [c.rightTitle || 'AFTER', c.right, X + w + 60]].forEach(([tt, body, x]) => {
      ctx.font = `900 44px ${F}`;
      const tw = ctx.measureText(tt).width;
      ctx.fillStyle = marker; ctx.fillRect(x - 4, y + 22, tw + 8, 20);
      ctx.fillStyle = ink; ctx.textBaseline = 'top'; ctx.fillText(tt, x, y); ctx.textBaseline = 'alphabetic';
      const r = fit(ctx, body || '', { family: F, weight: 500, max: 38, min: 26, maxLines: Math.max(2, Math.floor((h - 90) / 58)), widthAt: () => w - 10 });
      ctx.font = `500 ${r.size}px ${F}`;
      drawRich(ctx, body || '', r.lines, { x, w: w - 10, top: y + 84, size: r.size, lh: 1.55, color: '#2E2E2E', flags: new Array((body || '').length).fill(false), align: 'left' });
    });
  } else if (layout === 'cta') {
    y = title(card.title, 100, 3, y + 40) + 30;
    if (card.body) { ctx.font = `500 38px ${F}`; ctx.fillStyle = '#444'; ctx.fillText(card.body, X, y + 30); y += 80; }
    ['SAVE', 'SHARE', 'FOLLOW'].forEach((w, i) => {
      setSpacing(ctx, 3); ctx.font = `900 30px ${F}`;
      const bw = ctx.measureText(w).width + 56;
      const bx = X + i * 230;
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(bx, y + 10, bw, 64);
      if (i === 2) { ctx.fillStyle = marker; ctx.fillRect(bx, y + 10, bw, 64); ctx.strokeRect(bx, y + 10, bw, 64); }
      ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.fillText(w, bx + 28, y + 43); ctx.textBaseline = 'alphabetic';
      setSpacing(ctx, 0);
    });
    ctx.font = `900 58px ${F}`; ctx.fillStyle = ink; ctx.fillText(settings.handle, X, y + 180);
  } else {
    const end = title(card.title, card.body ? 92 : 120, 3, y);
    para(card.body, end + 46, bottom);
  }
  if (mbox) drawMoa(ctx, env, card, mbox, t, F);
}

// ---------- 내보내기 ----------
export const canvasToBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
