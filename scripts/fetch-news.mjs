// 최신 뉴스/트렌드를 수집해 data/news.json을 만든다.
// GitHub Actions에서 배포 직전에 실행된다 (브라우저는 CORS 때문에 RSS를 직접 읽을 수 없음).
// 선택: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나가 있으면 AI로 MOA 적합도를 재평가한다.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurationPrompt, callModel, extractJson, CATEGORIES } from '../js/ai.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/news.json');

const GN = 'https://news.google.com/rss';
const q = (query) => `${GN}/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=ko&gl=KR&ceid=KR:ko`;

export const FEEDS = [
  { category: 'NEWS', url: `${GN}?hl=ko&gl=KR&ceid=KR:ko` },
  { category: 'NEWS', url: q('정부 OR 정책 OR 발표') },
  { category: 'TREND', url: q('화제 OR 인기 OR 열풍 OR 품절 OR 유행') },
  { category: 'AI', url: q('AI OR 인공지능 OR 챗GPT OR 생성형') },
  { category: 'LIFE', url: q('생활 OR 물가 OR 날씨 OR 건강 OR 육아') },
  { category: 'MONEY', url: q('금리 OR 재테크 OR 적금 OR 연말정산 OR 청약') },
  { category: 'FOOD', url: q('맛집 OR 신메뉴 OR 편의점 OR 디저트') },
  { category: 'BEAUTY', url: q('뷰티 OR 화장품 OR 스킨케어 OR 올리브영') },
  { category: 'CULTURE', url: q('드라마 OR 영화 OR 전시 OR 공연 OR 넷플릭스') },
  { category: 'SHOPPING', url: q('쇼핑 OR 할인 OR 세일 OR 쿠팡 OR 신상') },
];
const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=KR';

// ---------- RSS 파싱 (의존성 없이) ----------
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : '';
};
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1];
    const sourceTag = x.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const desc = tag(x, 'description');
    // Google News description = 같은 사건의 관련 기사 목록
    const related = [];
    for (const r of desc.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:&nbsp;|\s)*(?:<font[^>]*>([\s\S]*?)<\/font>)?/g)) {
      related.push({ url: decode(r[1]), title: stripTags(decode(r[2])), name: stripTags(decode(r[3] || '')) });
    }
    items.push({
      title: tag(x, 'title'),
      url: tag(x, 'link'),
      publishedAt: tag(x, 'pubDate'),
      source: sourceTag ? stripTags(decode(sourceTag[2])) : '',
      related,
      // Google Trends 전용 필드
      traffic: tag(x, 'ht:approx_traffic'),
      trendNews: [...x.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((n) => ({
        title: tag(n[1], 'ht:news_item_title'), url: tag(n[1], 'ht:news_item_url'), name: tag(n[1], 'ht:news_item_source'),
      })),
    });
  }
  return items;
}

// ---------- 클러스터링 ----------
const cleanTitle = (t, source) => {
  let s = t;
  if (source && s.endsWith(` - ${source}`)) s = s.slice(0, -(source.length + 3));
  return s.replace(/\s+-\s+[^-]{1,30}$/, '').replace(/\[[^\]]{1,12}\]/g, '').replace(/\s+/g, ' ').trim();
};
const tokens = (t) => new Set((t.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []).filter((w) => !STOP.has(w)));
const STOP = new Set(['단독', '속보', '종합', '오늘', '이번', '관련', '위해', '대한', '통해', '있다', '없다', '했다', '한다', '에서', '으로']);
const jaccard = (a, b) => {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

export function cluster(raw) {
  const clusters = [];
  for (const it of raw) {
    const title = cleanTitle(it.title, it.source);
    const tk = tokens(title);
    const sources = [{ name: it.source, title, url: it.url }, ...it.related.map((r) => ({ ...r, title: cleanTitle(r.title, r.name) }))];
    let hit = clusters.find((c) => jaccard(c.tk, tk) >= 0.34);
    if (hit) {
      for (const s of sources) if (!hit.sources.some((x) => x.title === s.title)) hit.sources.push(s);
      hit.categories.add(it.category);
      if (new Date(it.publishedAt) > new Date(hit.publishedAt)) hit.publishedAt = it.publishedAt;
      continue;
    }
    clusters.push({ title, tk, category: it.category, categories: new Set([it.category]), publishedAt: it.publishedAt, source: it.source, url: it.url, sources });
  }
  return clusters;
}

// ---------- MOA 적합도 (규칙 기반) ----------
const KW = {
  target: ['여성', '엄마', '육아', '출산', '결혼', '직장인', '뷰티', '다이어트', '건강', '카페', '여행', '쇼핑', '드라마', '아이돌', '패션', '반려', '인테리어', '연애', '맞벌이', '워킹맘', '피부'],
  life: ['물가', '요금', '가격', '인상', '인하', '금리', '대출', '세금', '연말정산', '지원금', '날씨', '미세먼지', '교통', '병원', '보험', '청약', '전기', '가스', '배달', '편의점', '마트', '할인', '환급', '신청'],
  sns: ['품절', '열풍', '화제', '인기', '대란', '첫', '역대', '신상', '출시', '논란', '꿀팁', '챌린지', '밈', '줄서', '오픈', '한정'],
  avoid: ['살해', '사망', '숨져', '폭행', '성폭', '참사', '추락', '시신', '검찰', '기소', '구속', '탄핵', '여당', '야당', '국회의원', '의원실', '공천', '전쟁', '미사일'],
};
const countHits = (t, list) => list.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreCluster(c, now = Date.now()) {
  const t = c.title + ' ' + c.sources.map((s) => s.title).join(' ');
  const hours = Math.max(0, (now - new Date(c.publishedAt).getTime()) / 36e5) || 24;
  const outlets = new Set(c.sources.map((s) => s.name).filter(Boolean)).size;
  const avoid = countHits(t, KW.avoid);
  const s = {
    recency: clamp(100 - hours * 3.5),
    buzz: clamp(15 + outlets * 14 + Math.min(2, c.categories.size - 1) * 10),
    sns: clamp(35 + countHits(t, KW.sns) * 18 - avoid * 15),
    target: clamp(35 + countHits(t, KW.target) * 20 + (['BEAUTY', 'FOOD', 'CULTURE', 'SHOPPING', 'LIFE'].includes(c.category) ? 15 : 0)),
    life: clamp(30 + countHits(t, KW.life) * 18 + (['LIFE', 'MONEY'].includes(c.category) ? 15 : 0)),
    ease: clamp(85 - Math.max(0, c.title.length - 30) * 1.5 - (/[A-Z]{3,}/.test(c.title) ? 8 : 0)),
    card: clamp(50 + (outlets >= 2 ? 15 : 0) + (/\d/.test(c.title) ? 10 : 0) - avoid * 20),
  };
  const moa = 0.15 * s.recency + 0.15 * s.buzz + 0.12 * s.sns + 0.18 * s.target + 0.18 * s.life + 0.1 * s.ease + 0.12 * s.card - avoid * 6;
  return { scores: s, moaScore: clamp(moa), buzzScore: s.buzz };
}

// ---------- 수집 ----------
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (MOA Content Studio news bot)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function aiCurate(items) {
  const provider = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.OPENAI_API_KEY ? 'gpt' : process.env.GEMINI_API_KEY ? 'gemini' : null;
  if (!provider) return null;
  const apiKey = { claude: process.env.ANTHROPIC_API_KEY, gpt: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY }[provider];
  const model = process.env.MOA_CURATION_MODEL || undefined;
  const top = items.slice(0, 30);
  const text = await callModel(provider, {
    apiKey, model, system: '너는 MOA 카드뉴스 편집장이다. JSON만 출력한다.', prompt: buildCurationPrompt(top), maxTokens: 8000,
  });
  const data = extractJson(text);
  for (const r of data.items || []) {
    const it = top[r.index];
    if (!it) continue;
    it.ruleScore = it.moaScore;
    it.moaScore = clamp(0.6 * Number(r.moaScore || 0) + 0.4 * it.moaScore);
    if (r.summary) it.summary = String(r.summary).slice(0, 120);
    if (r.reason) it.reason = String(r.reason).slice(0, 60);
    if (CATEGORIES[r.category]) it.category = r.category;
  }
  return provider;
}

async function main() {
  const errors = [];
  const raw = [];
  for (const f of FEEDS) {
    try {
      const items = parseRss(await fetchText(f.url));
      items.slice(0, 25).forEach((it) => raw.push({ ...it, category: f.category }));
    } catch (e) {
      errors.push(`${f.category}: ${e.message}`);
    }
  }

  const now = Date.now();
  const clusters = cluster(raw);
  let items = clusters.map((c, i) => {
    const { scores, moaScore, buzzScore } = scoreCluster(c, now);
    const outlets = [...new Set(c.sources.map((s) => s.name).filter(Boolean))];
    return {
      id: `n${now.toString(36)}${i}`,
      category: c.category,
      title: c.title,
      summary: c.sources.map((s) => s.title).filter((t) => t && t !== c.title).slice(0, 2).join(' · '),
      source: c.source,
      url: c.url,
      publishedAt: new Date(c.publishedAt).toISOString(),
      sources: c.sources.slice(0, 8),
      outlets,
      scores,
      moaScore,
      buzzScore,
      reason: '',
    };
  }).sort((a, b) => b.moaScore - a.moaScore);

  let curatedBy = null;
  try {
    curatedBy = await aiCurate(items);
    if (curatedBy) items.sort((a, b) => b.moaScore - a.moaScore);
  } catch (e) {
    errors.push(`AI 큐레이션: ${e.message}`);
  }
  items = items.slice(0, 80);

  let trends = [];
  try {
    trends = parseRss(await fetchText(TRENDS_URL)).slice(0, 20).map((t) => ({
      keyword: t.title, traffic: t.traffic, publishedAt: t.publishedAt ? new Date(t.publishedAt).toISOString() : '',
      news: t.trendNews.slice(0, 3),
    }));
  } catch (e) {
    errors.push(`트렌드: ${e.message}`);
  }

  const out = { generatedAt: new Date(now).toISOString(), curatedBy, count: items.length, errors, items, trends };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`news.json: ${items.length} items, ${trends.length} trends, curatedBy=${curatedBy}, errors=${errors.length}`);
  errors.forEach((e) => console.warn('  -', e));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
