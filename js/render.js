// 1080×1080 카드뉴스 캔버스 렌더러
import { CATEGORIES, DEFAULT_POSE } from './ai.js';

export const SIZE = 1080;
const PAD = 80;

const FONT_STACK = {
  Pretendard: '"Pretendard Variable", Pretendard, "SUIT Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  SUIT: '"SUIT Variable", SUIT, "Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
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
  const fam = family === 'SUIT' ? '"SUIT Variable"' : '"Pretendard Variable"';
  const sample = [...new Set(texts.join('').replace(/\s/g, ''))].join('') || '가';
  try {
    await Promise.all([400, 600, 800].map((w) => document.fonts.load(`${w} 40px ${fam}`, sample)));
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
  const y = pos.startsWith('t') ? 150 : SIZE - 34 - h;
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

  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);

  // 배경
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = t.green; ctx.beginPath(); ctx.arc(SIZE + 40, -40, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.pink; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(-80, SIZE - 120, 220, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.18; ctx.fillStyle = t.brown;
  for (let y = 120; y < SIZE; y += 44) for (let x = 40 + ((y / 44) % 2) * 22; x < SIZE; x += 44) {
    if (x > 980 || y > 1040) continue;
    if ((x * 7 + y * 3) % 5 !== 0) continue;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

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
  ctx.fillStyle = t.brown; roundRect(ctx, PAD, 58, cw, 56, 28); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle'; ctx.fillText(catText, PAD + 24, 88);
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
  if (layout !== 'big' && layout !== 'cta') y = drawLabel(ctx, label, y, ctxText);

  const L = { big: layBig, text: layText, list: layList, number: layNumber, compare: layCompare, keyword: layKeyword, cta: layCta }[layout] || layText;
  L(ctx, card, y, ctxText, content, settings);

  // 출처 (2장, 7장)
  if ((index === 1 || index === content.cards.length - 1) && content.sources?.length) {
    const src = `출처: ${content.sources.map((s) => s.name).filter(Boolean).slice(0, 3).join(', ')}`;
    ctx.font = `500 22px ${family}`; ctx.fillStyle = shade(t.brown, 0.35);
    const sp = span(SIZE - 70, SIZE - 40);
    let s = src;
    while (ctx.measureText(s).width > sp.w && s.length > 4) s = s.slice(0, -1);
    ctx.fillText(s === src ? s : `${s.slice(0, -1)}…`, sp.l, SIZE - 48);
  }
  // 브랜드 표기
  if (index === 0) {
    ctx.font = `700 24px ${family}`; ctx.fillStyle = shade(t.brown, 0.3);
    ctx.fillText(`${settings.brand}  ${settings.handle}`, PAD, SIZE - 48);
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

function block(ctx, text, y, o, opts) {
  if (!text) return y;
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
  ctx.fillStyle = t.pink; ctx.globalAlpha = 0.9;
  ctx.font = `800 120px ${o.family}`; ctx.fillText('“', PAD - 6, 270);
  ctx.globalAlpha = 1;
  let yy = block(ctx, card.title, 260, o, { weight: 800, max: 108, min: 60, maxLines: 4, lh: 1.22, color: textColor, hl: card.highlight, hlColor: t.pink });
  yy += 28;
  block(ctx, card.body, yy, o, { weight: 500, max: 42, min: 30, maxLines: 3, lh: 1.4, color: shade(textColor, 0.15), hl: card.highlight, hlColor: 'transparent', hlText: '#E07A76' });
}

function layText(ctx, card, y, o) {
  const { t, textColor } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 78, min: 50, maxLines: 3, lh: 1.24, color: textColor, hl: card.highlight, hlColor: t.pink });
  if (!card.body) return;
  yy += 36;
  // 본문 카드 (흰 박스) — 높이를 먼저 계산
  const inner = { ...o, span: (a, b) => { const s = o.span(a, b); return { l: s.l + 40, r: s.r - 40, w: s.w - 80 }; } };
  const off = document.createElement('canvas').getContext('2d');
  const endY = block(off, card.body, yy + 40, inner, { weight: 500, max: 46, min: 32, maxLines: 6, lh: 1.5, color: textColor });
  const sp = o.span(yy, endY + 40);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = 'rgba(111,98,88,0.10)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  roundRect(ctx, sp.l, yy, sp.w, endY - yy + 40, 36); ctx.fill();
  ctx.restore();
  block(ctx, card.body, yy + 40, inner, { weight: 500, max: 46, min: 32, maxLines: 6, lh: 1.5, color: textColor, hl: card.highlight, hlColor: 'transparent', hlText: '#D9706B' });
}

function layList(ctx, card, y, o) {
  const { t, textColor, family, fontScale } = o;
  let yy = block(ctx, card.title, y, o, { weight: 800, max: 70, min: 46, maxLines: 2, lh: 1.22, color: textColor, hl: card.highlight, hlColor: t.pink });
  yy += 30;
  const items = (card.items || []).slice(0, 5);
  const gap = 20;
  const avail = 1000 - yy;
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
  const h = Math.min(400, 760 - yy);
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
