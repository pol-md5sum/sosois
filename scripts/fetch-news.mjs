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
// 해피해피(육아·아기·생활용품·생활템) 계정용 피드 — MOA 뉴스와 따로 묶고 점수를 매긴다
export const HAPPY_FEEDS = [
  { category: 'PARENTING', url: q('육아 OR 부모급여 OR 아동수당 OR 어린이집 OR 육아휴직') },
  { category: 'PARENTING', url: q('아이 키우기 OR 육아맘 OR 육아 꿀팁 OR 영유아 건강') },
  { category: 'BABY', url: q('아기용품 OR 유아용품 OR 출산용품 OR 이유식 OR 기저귀 OR 분유') },
  { category: 'BABY', url: q('베이비페어 OR 유모차 OR 카시트 OR 신생아 OR 어린이 제품 리콜') },
  { category: 'LIVING', url: q('생활용품 OR 주방용품 OR 세제 OR 수납 OR 청소용품 OR 살림') },
  { category: 'ITEM', url: q('생활템 OR 살림템 OR 육아템 OR 꿀템 OR 다이소 신상 OR 품절템') },
  { category: 'ITEM', url: q('육아템 추천 OR 아기 꿀템 OR 살림 꿀템 OR 생활 꿀템 OR 인기템') },
  { category: 'OUTING', url: q('아이와 가볼만한 곳 OR 아기랑 가볼만한곳 OR 키즈카페 OR 어린이 테마파크 OR 가족 나들이') },
  { category: 'OUTING', url: q('아이랑 여행 OR 아기랑 여행 OR 유아 동반 여행 OR 어린이 체험 OR 키즈 풀빌라') },
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

// ---------- 주제 분류 ----------
// 종합 뉴스로 들어온 기사도 제목 키워드로 주제를 다시 판단한다
export const TOPIC_KW = {
  AI: ['AI', '인공지능', '챗GPT', 'GPT', '생성형', '오픈AI', '제미나이', '클로드', '로봇', '반도체', '자율주행', 'LLM'],
  MONEY: ['금리', '대출', '적금', '예금', '재테크', '주식', '코스피', '환율', '연말정산', '청약', '부동산', '집값', '전세', '월세', '세금', '연금', '코인', '비트코인'],
  LIFE: ['날씨', '미세먼지', '육아', '출산', '건강', '병원', '교통', '물가', '요금', '전기', '가스', '지원금', '복지', '반려', '이사'],
  FOOD: ['맛집', '신메뉴', '편의점', '디저트', '카페', '음식', '먹거리', '라면', '빵', '커피', '배달', '레시피', '식품'],
  BEAUTY: ['뷰티', '화장품', '스킨케어', '올리브영', '메이크업', '피부', '향수', '헤어', '네일', '선크림'],
  CULTURE: ['드라마', '영화', '전시', '공연', '넷플릭스', '콘서트', '아이돌', '뮤지컬', '웹툰', '책', '예능', 'OTT', '팝업'],
  SHOPPING: ['쇼핑', '할인', '세일', '쿠팡', '신상', '출시', '무신사', '블랙프라이데이', '특가', '쇼핑몰', '이커머스'],
  TREND: ['화제', '열풍', '품절', '유행', '인기', '챌린지', '밈', 'MZ', '대란', '오픈런', '핫플'],
};
export function classify(title, fallback = 'NEWS', only = null) {
  let best = fallback;
  let bestHits = 0;
  for (const [cat, words] of Object.entries(TOPIC_KW)) {
    if (only && !only.includes(cat)) continue;
    const hits = words.reduce((n, w) => n + (title.includes(w) ? 1 : 0), 0);
    if (hits > bestHits) { best = cat; bestHits = hits; }
  }
  return best;
}

export const HAPPY_KW = {
  PARENTING: ['육아', '부모', '엄마', '아빠', '어린이집', '유치원', '부모급여', '아동수당', '육아휴직', '출산', '임신', '영유아', '아이', '돌봄', '발달'],
  BABY: ['아기', '신생아', '유아', '이유식', '기저귀', '분유', '젖병', '유모차', '카시트', '아기띠', '베이비', '출산용품', '유아용품', '아기용품'],
  LIVING: ['생활용품', '주방', '세제', '수납', '정리', '청소', '살림', '욕실', '세탁', '냄비', '프라이팬', '청소기'],
  ITEM: ['생활템', '살림템', '육아템', '꿀템', '추천템', '다이소', '품절', '인기템', '신상', '가성비'],
  OUTING: ['가볼만한', '가볼 만한', '키즈카페', '테마파크', '나들이', '여행', '체험', '놀이공원', '동물원', '수족관', '캠핑', '축제', '풀빌라', '박물관', '키즈존'],
};
export function classifyHappy(text, fallback) {
  let best = fallback;
  let bestHits = 0;
  for (const [cat, words] of Object.entries(HAPPY_KW)) {
    const hits = countHitsKW(text, words);
    if (hits > bestHits) { best = cat; bestHits = hits; }
  }
  return best;
}
const countHitsKW = (t, list) => list.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

// 사건·사고·법적 분쟁·제재 성격의 기사는 브랜드 이름(쿠팡, 올리브영 등)이 들어 있어도 생활·쇼핑 주제가 아니라 뉴스로 본다
export const HARD_NEWS_KW = ['개인정보', '유출', '해킹', '과징금', '소송', '제재', '수사', '압수수색', '기소', '판결', '법원', '공정위', '공정거래위원회', '고발', '징계', '사고', '화재', '사망', '부상', '리콜', '불매', '노조', '파업', '갑질', '논란', '의혹', '피해자', '집단소송', '청문회', '국정감사'];
const LIFESTYLE = ['SHOPPING', 'FOOD', 'BEAUTY', 'CULTURE', 'LIFE', 'TREND'];
export function hardNewsOverride(text, category) {
  const hits = HARD_NEWS_KW.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  if (LIFESTYLE.includes(category) && hits >= 1) return 'NEWS';
  if ((category === 'MONEY' || category === 'AI') && hits >= 2) return 'NEWS';
  return category;
}

// 주제마다 최소 perCat개를 보장하고 나머지는 점수순으로 채운다
export function selectBalanced(items, perCat = 12, total = 140, cats = Object.keys(CATEGORIES)) {
  const out = [];
  const seen = new Set();
  for (const cat of cats) {
    items.filter((x) => x.category === cat).slice(0, perCat).forEach((x) => { out.push(x); seen.add(x); });
  }
  for (const x of items) { if (out.length >= total) break; if (!seen.has(x)) out.push(x); }
  return out.sort((a, b) => b.moaScore - a.moaScore);
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

// ---------- 해피해피 적합도 (육아 중인 부모 기준) ----------
const HKW = {
  target: ['엄마', '아빠', '부모', '육아', '아기', '아이', '영유아', '신생아', '맘', '임산부', '어린이'],
  life: ['지원', '신청', '가격', '할인', '출시', '신상', '추천', '꿀팁', '방법', '리콜', '안전', '인증', '무료', '혜택', '정리', '수납'],
  avoid: ['학대', '살해', '사망', '숨져', '폭행', '유기', '성범죄', '실종', '참사', '구속', '기소', '탄핵', '여당', '야당'],
};
export function scoreHappy(c, now = Date.now()) {
  const t = c.title + ' ' + c.sources.map((s) => s.title).join(' ');
  const hours = Math.max(0, (now - new Date(c.publishedAt).getTime()) / 36e5) || 24;
  const outlets = new Set(c.sources.map((s) => s.name).filter(Boolean)).size;
  const avoid = countHits(t, HKW.avoid);
  const s = {
    recency: clamp(100 - hours * 3.5),
    buzz: clamp(15 + outlets * 14),
    sns: clamp(35 + countHits(t, KW.sns) * 18 - avoid * 15),
    target: clamp(30 + countHits(t, HKW.target) * 18),
    life: clamp(30 + countHits(t, HKW.life) * 16),
    ease: clamp(85 - Math.max(0, c.title.length - 30) * 1.5),
    card: clamp(50 + (outlets >= 2 ? 15 : 0) + (/\d/.test(c.title) ? 10 : 0) - avoid * 20),
  };
  const fit = 0.15 * s.recency + 0.12 * s.buzz + 0.1 * s.sns + 0.25 * s.target + 0.2 * s.life + 0.08 * s.ease + 0.1 * s.card - avoid * 12;
  return { scores: s, moaScore: clamp(fit), buzzScore: s.buzz };
}

// ---------- 수집 ----------
export function buildHappyItems(hraw, now = Date.now()) {
  const list = cluster(hraw).map((c, i) => {
    const text = c.title + ' ' + c.sources.map((x) => x.title).join(' ');
    c.category = classifyHappy(text, [...c.categories][0]);
    const { scores, moaScore, buzzScore } = scoreHappy(c, now);
    return {
      id: `h${now.toString(36)}${i}`, channel: 'happy', category: c.category, title: c.title,
      summary: c.sources.map((s) => s.title).filter((t) => t && t !== c.title).slice(0, 2).join(' · '),
      source: c.source, url: c.url, publishedAt: new Date(c.publishedAt).toISOString(), sources: c.sources.slice(0, 8),
      outlets: [...new Set(c.sources.map((s) => s.name).filter(Boolean))], scores, moaScore, buzzScore, reason: '',
    };
  }).filter((x) => x.scores.target > 30 || x.category !== 'PARENTING' || /육아|아이|아기|부모/.test(x.title))
    .sort((a, b) => b.moaScore - a.moaScore);
  return selectBalanced(list, 15, 85, ['PARENTING', 'BABY', 'LIVING', 'ITEM', 'OUTING']);
}
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
  for (const c of clusters) {
    const text = c.title + ' ' + c.sources.map((x) => x.title).join(' ');
    const specific = [...c.categories].filter((k) => k !== 'NEWS');
    // 여러 주제 피드에 함께 걸리면 키워드가 가장 많이 맞는 주제로, 종합 피드만이면 키워드로 분류
    c.category = specific.length > 1 ? classify(text, specific[0], specific) : specific[0] || classify(text);
    c.category = hardNewsOverride(c.title, c.category);
  }
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
  items = selectBalanced(items, 12, 140, Object.keys(CATEGORIES).filter((k) => !CATEGORIES[k].scope));

  // 해피해피 피드
  const hraw = [];
  for (const f of HAPPY_FEEDS) {
    try {
      parseRss(await fetchText(f.url)).slice(0, 25).forEach((it) => hraw.push({ ...it, category: f.category }));
    } catch (e) {
      errors.push(`${f.category}: ${e.message}`);
    }
  }
  const happyItems = buildHappyItems(hraw, now);
  items = [...items, ...happyItems];
  const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, items.filter((x) => x.category === k).length]));

  let trends = [];
  try {
    trends = parseRss(await fetchText(TRENDS_URL)).slice(0, 20).map((t) => ({
      keyword: t.title, traffic: t.traffic, publishedAt: t.publishedAt ? new Date(t.publishedAt).toISOString() : '',
      news: t.trendNews.slice(0, 3),
    }));
  } catch (e) {
    errors.push(`트렌드: ${e.message}`);
  }

  const out = { generatedAt: new Date(now).toISOString(), curatedBy, count: items.length, byCategory, errors, items, trends };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`news.json: ${items.length} items, ${trends.length} trends, curatedBy=${curatedBy}, errors=${errors.length}`);
  console.log('  by category:', JSON.stringify(byCategory));
  errors.forEach((e) => console.warn('  -', e));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
