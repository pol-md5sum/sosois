// MOA AI 공통 모듈 — 브라우저와 Node(GitHub Actions) 양쪽에서 사용한다. DOM 의존성 없음.

export const PROVIDERS = {
  claude: { label: 'Claude', defaultModel: 'claude-opus-5-5' },
  gpt: { label: 'GPT', defaultModel: 'gpt-5' },
  gemini: { label: 'Gemini', defaultModel: 'gemini-2.5-flash' },
};

export const CATEGORIES = {
  NEWS: { label: 'MOA NEWS', emoji: '📰' },
  TREND: { label: 'MOA TREND', emoji: '🔥' },
  AI: { label: 'MOA AI', emoji: '🤖' },
  LIFE: { label: 'MOA LIFE', emoji: '🏠' },
  MONEY: { label: 'MOA MONEY', emoji: '💰' },
  FOOD: { label: 'MOA FOOD', emoji: '🍙' },
  BEAUTY: { label: 'MOA BEAUTY', emoji: '💄' },
  CULTURE: { label: 'MOA CULTURE', emoji: '🎬' },
  SHOPPING: { label: 'MOA SHOPPING', emoji: '🛍️' },
};

export const CARD_TYPES = ['HOOK', 'WHAT', 'WHY', 'SO WHAT', "MOA'S PICK", 'LIFE/CHECK', 'CTA'];

// 카드 유형별 기본 포즈 (기획안 16항)
export const DEFAULT_POSE = {
  HOOK: 'surprised',
  WHAT: 'curious',
  WHY: 'thinking',
  'SO WHAT': 'explain',
  "MOA'S PICK": 'check',
  'LIFE/CHECK': 'check',
  CTA: 'wave',
};

export const POSES = {
  default: '기본', surprised: '놀람', curious: '궁금', thinking: '생각', idea: '아이디어',
  laugh: '웃음', excited: '신남', shock: '충격', sleepy: '졸림', check: '체크',
  explain: '설명', wave: '손흔들기', heart: '하트', ok: 'OK',
};

export const LAYOUTS = ['auto', 'big', 'text', 'list', 'number', 'compare', 'keyword', 'cta'];

const str = { type: 'string' };
const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'body', 'highlight', 'items', 'number', 'numberLabel', 'compare', 'layout', 'pose', 'moaSays'],
  properties: {
    type: { type: 'string', enum: CARD_TYPES },
    title: str,
    body: str,
    highlight: str,
    items: { type: 'array', items: str },
    number: str,
    numberLabel: str,
    compare: {
      type: 'object',
      additionalProperties: false,
      required: ['leftTitle', 'left', 'rightTitle', 'right'],
      properties: { leftTitle: str, left: str, rightTitle: str, right: str },
    },
    layout: { type: 'string', enum: LAYOUTS },
    pose: { type: 'string', enum: Object.keys(POSES) },
    moaSays: str,
  },
};

export const CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'category', 'hook', 'cards', 'moaComment', 'cta', 'caption', 'hashtags', 'sources', 'factNotes'],
  properties: {
    title: str,
    category: { type: 'string', enum: Object.keys(CATEGORIES) },
    hook: str,
    cards: { type: 'array', items: CARD_SCHEMA },
    moaComment: str,
    cta: str,
    caption: str,
    hashtags: { type: 'array', items: str },
    sources: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'url'],
        properties: { name: str, url: str },
      },
    },
    factNotes: { type: 'array', items: str },
  },
};

export const SYSTEM_PROMPT = `너는 인스타그램 카드뉴스 브랜드 "MOA | 모아"의 수석 에디터다.
모아는 귀엽고 복슬복슬한 양 캐릭터이자, 뉴스를 쉽게 설명해 주는 작은 진행자다.
슬로건: "요즘 뭐가 뜨는지, 모아가 알려줄게."
타깃: 20~40대 여성, 바쁜 직장인, 인스타그램 사용자.

[톤앤매너]
- 귀여움 + 신뢰감 + 쉬움 + 트렌디함. 딱딱한 앵커 말투 금지, 친근한 설명체(~해요, ~이에요).
- 이모지는 카드 본문에 쓰지 않는다(디자인에서 처리). 캡션에는 2~5개까지 허용.

[원고 규칙]
- 짧고 읽기 쉽게. 카드 제목 22자 이내, 본문 90자 이내, 리스트 항목 각 24자 이내.
- 어려운 용어는 괄호나 한 문장으로 풀어 쓴다.
- 기사 원문 문장을 그대로 옮기지 않는다. 반드시 다시 쓴다.
- 사실과 의견을 구분한다. 의견·전망은 "~로 보여요", "~라는 의견도 있어요"처럼 표시한다.
- 과장, 공포 조장, 낚시성 표현 금지. 제공된 자료나 검색으로 확인되지 않은 수치·날짜·인용은 만들지 않는다.
- 정책·경제·의료·법률 주제는 정부·공공기관·주요 언론 등 신뢰할 수 있는 출처를 우선한다.
- 확인이 필요한 사항은 factNotes에 적는다.

[7장 구조 — 반드시 이 순서, 정확히 7장]
1 HOOK: 스크롤을 멈추게 하는 한 줄 (title 짧게, body는 한 줄 보조문구)
2 WHAT: 무슨 일이 일어났는지 (누가/언제/무엇)
3 WHY: 왜 화제인지
4 SO WHAT: 우리 생활에 어떤 의미인지
5 MOA'S PICK: 핵심 3가지 (items 3개)
6 LIFE/CHECK: 실제 생활에서 알아둘 점 (items 2~4개 체크리스트)
7 CTA: 저장/공유/팔로우 유도

[카드 필드]
- highlight: title 또는 body 안에 실제로 들어 있는 핵심 단어(2~8자). 없으면 "".
- number/numberLabel: 핵심 숫자가 있으면 "3.5%" / "기준금리" 형태, 없으면 "".
- compare: 전후·찬반 비교가 핵심이면 채우고, 아니면 모두 "".
- layout: big(짧은 큰 제목) / text(설명) / list(리스트) / number(큰 숫자) / compare(좌우 비교) / keyword(키워드 강조) / cta / auto 중 내용에 맞게.
- pose: HOOK=surprised, WHAT=curious, WHY=thinking, SO WHAT=explain, MOA'S PICK=check, LIFE/CHECK=check, CTA=wave 를 기본으로 하되 내용에 더 맞는 포즈가 있으면 바꿔도 된다.
- moaSays: 모아가 말풍선으로 하는 짧은 한마디(16자 이내).

[캡션]
관심을 끄는 첫 문장 → 뉴스 핵심 2~3줄 → 모아의 한마디 → CTA(저장/공유/팔로우) → 출처 표기 순서. 해시태그는 hashtags 배열에 # 없이 5~15개.`;

export function buildContentPrompt(news, opts = {}) {
  const lines = [];
  lines.push('아래 뉴스로 MOA 7장 카드뉴스를 만들어 줘.');
  lines.push('');
  lines.push(`카테고리 후보: ${news.category || 'NEWS'} (더 맞는 카테고리가 있으면 바꿔도 됨: ${Object.keys(CATEGORIES).join(', ')})`);
  lines.push(`제목: ${news.title}`);
  if (news.publishedAt) lines.push(`기사 날짜: ${news.publishedAt}`);
  if (news.summary) lines.push(`요약: ${news.summary}`);
  const sources = news.sources?.length ? news.sources : (news.url ? [{ name: news.source || '', title: news.title, url: news.url }] : []);
  if (sources.length) {
    lines.push('관련 기사(같은 사건의 여러 보도):');
    sources.slice(0, 8).forEach((s, i) => lines.push(`  ${i + 1}. [${s.name || '출처'}] ${s.title || ''} ${s.url || ''}`));
  }
  if (news.articleText) {
    lines.push('');
    lines.push('기사 본문(사용자가 제공, 참고용 — 문장을 그대로 옮기지 말 것):');
    lines.push(news.articleText.slice(0, 12000));
  }
  if (opts.webSearch) {
    lines.push('');
    lines.push('웹 검색으로 이 뉴스의 핵심 사실(날짜, 수치, 주체)을 2개 이상의 출처에서 확인한 뒤 작성해. 확인한 출처는 sources에 넣어.');
  } else {
    lines.push('');
    lines.push('제공된 정보 밖의 구체적 수치나 인용은 지어내지 말고, 일반적인 배경 설명 수준으로만 보충해.');
  }
  if (opts.extra) lines.push(`추가 요청: ${opts.extra}`);
  lines.push('');
  lines.push('출력은 아래 JSON 스키마를 따르는 JSON 객체 하나만. 코드블록이나 설명 문장 없이.');
  lines.push(JSON.stringify(CONTENT_SCHEMA));
  return lines.join('\n');
}

// ---------- JSON 파싱 ----------
export function extractJson(text) {
  if (!text) throw new Error('AI 응답이 비어 있습니다.');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(t.slice(start, end + 1));
}

// ---------- 공급자별 호출 ----------
async function httpJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.status || raw.slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}

async function callClaude({ apiKey, model, system, prompt, schema, webSearch, maxTokens, fetchImpl, browser }) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const body = {
    model,
    max_tokens: maxTokens || 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium' },
  };
  if (webSearch) {
    body.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];
  } else if (schema) {
    body.output_config.format = { type: 'json_schema', schema };
  }
  let messages = body.messages;
  let data;
  // 서버 도구가 길어지면 pause_turn으로 끊길 수 있어 이어서 요청한다.
  for (let i = 0; i < 4; i++) {
    data = await httpJson(fetchImpl, 'https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify({ ...body, messages }),
    });
    if (data.stop_reason !== 'pause_turn') break;
    messages = [...messages, { role: 'assistant', content: data.content }];
  }
  if (data.stop_reason === 'refusal') throw new Error('Claude가 요청을 거절했습니다.');
  if (data.stop_reason === 'max_tokens') throw new Error('응답이 길어 잘렸습니다. 다시 시도해 주세요.');
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function callGpt({ apiKey, model, system, prompt, webSearch, fetchImpl }) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
  if (webSearch) {
    const data = await httpJson(fetchImpl, 'https://api.openai.com/v1/responses', {
      method: 'POST', headers,
      body: JSON.stringify({ model, instructions: system, input: prompt, tools: [{ type: 'web_search' }] }),
    });
    if (data.output_text) return data.output_text;
    return (data.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  }
  const data = await httpJson(fetchImpl, 'https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini({ apiKey, model, system, prompt, webSearch, fetchImpl }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {},
  };
  if (webSearch) body.tools = [{ google_search: {} }];
  else body.generationConfig.responseMimeType = 'application/json';
  const data = await httpJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const cand = data.candidates?.[0];
  if (!cand) throw new Error(`Gemini 응답 없음: ${data.promptFeedback?.blockReason || ''}`);
  return (cand.content?.parts || []).map((p) => p.text || '').join('');
}

export async function callModel(provider, opts) {
  const o = { fetchImpl: globalThis.fetch.bind(globalThis), ...opts };
  if (!o.apiKey) throw new Error(`${PROVIDERS[provider]?.label || provider} API 키가 설정되지 않았습니다.`);
  o.model = o.model || PROVIDERS[provider].defaultModel;
  if (provider === 'claude') return callClaude(o);
  if (provider === 'gpt') return callGpt(o);
  if (provider === 'gemini') return callGemini(o);
  throw new Error(`알 수 없는 AI 모델: ${provider}`);
}

// ---------- 결과 정규화 ----------
const clampText = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

export function normalizeContent(raw, news = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const cards = Array.isArray(c.cards) ? c.cards.slice(0, 7) : [];
  while (cards.length < 7) cards.push({});
  const out = {
    title: clampText(c.title, 80) || news.title || '제목 없음',
    category: CATEGORIES[c.category] ? c.category : (CATEGORIES[news.category] ? news.category : 'NEWS'),
    hook: clampText(c.hook, 80),
    moaComment: clampText(c.moaComment, 120),
    cta: clampText(c.cta, 80),
    caption: typeof c.caption === 'string' ? c.caption.trim() : '',
    hashtags: (Array.isArray(c.hashtags) ? c.hashtags : [])
      .map((h) => String(h).replace(/^#+/, '').replace(/\s+/g, '').trim()).filter(Boolean).slice(0, 15),
    sources: (Array.isArray(c.sources) ? c.sources : []).filter((s) => s && (s.name || s.url))
      .map((s) => ({ name: clampText(s.name, 60), url: clampText(s.url, 500) })).slice(0, 8),
    factNotes: (Array.isArray(c.factNotes) ? c.factNotes : []).map((s) => clampText(s, 200)).filter(Boolean),
  };
  out.cards = cards.map((card, i) => {
    const type = CARD_TYPES[i];
    const cmp = card.compare || {};
    return {
      type,
      title: clampText(card.title, 60),
      body: clampText(card.body, 220),
      highlight: clampText(card.highlight, 20),
      items: (Array.isArray(card.items) ? card.items : []).map((s) => clampText(s, 40)).filter(Boolean).slice(0, 5),
      number: clampText(card.number, 12),
      numberLabel: clampText(card.numberLabel, 24),
      compare: {
        leftTitle: clampText(cmp.leftTitle, 16), left: clampText(cmp.left, 80),
        rightTitle: clampText(cmp.rightTitle, 16), right: clampText(cmp.right, 80),
      },
      layout: LAYOUTS.includes(card.layout) ? card.layout : 'auto',
      pose: POSES[card.pose] ? card.pose : DEFAULT_POSE[type],
      moaSays: clampText(card.moaSays, 24),
      style: {},
    };
  });
  if (!out.sources.length && news) {
    const src = news.sources?.length ? news.sources : (news.url ? [{ name: news.source, url: news.url }] : []);
    out.sources = src.slice(0, 3).map((s) => ({ name: s.name || '', url: s.url || '' }));
  }
  return out;
}

// ---------- 템플릿 모드 (AI 키가 없을 때) ----------
export function templateContent(news) {
  const title = (news.title || '').replace(/\s+-\s+[^-]+$/, '').trim();
  const short = title.length > 26 ? `${title.slice(0, 24)}…` : title;
  const related = (news.sources || []).map((s) => s.title).filter((t) => t && t !== news.title).slice(0, 3);
  const srcName = news.source || news.sources?.[0]?.name || '';
  const cat = CATEGORIES[news.category] ? news.category : 'NEWS';
  const kw = (title.match(/[가-힣A-Za-z0-9]{2,8}/g) || ['이슈'])[0];
  const raw = {
    title,
    category: cat,
    hook: `요즘 다들 얘기하는 '${kw}', 알고 있어요?`,
    cards: [
      { type: 'HOOK', title: `요즘 다들 얘기하는\n'${kw}'`, body: '모아가 3분 만에 정리해 줄게요', highlight: kw, layout: 'big', moaSays: '이거 봤어요?' },
      { type: 'WHAT', title: '무슨 일이냐면요', body: short, highlight: kw, layout: 'text', moaSays: '정리해 볼게요' },
      { type: 'WHY', title: '왜 화제일까요?', body: related.length ? `여러 매체가 동시에 다루고 있어요. ${related[0].slice(0, 50)}` : '많은 사람들의 생활과 맞닿아 있는 이슈라서 관심이 커지고 있어요.', layout: 'text', moaSays: '흠, 그렇구나' },
      { type: 'SO WHAT', title: '우리에겐 어떤 의미?', body: '내 일상에 바로 영향이 있는지, 앞으로 무엇이 바뀌는지 한 번 확인해 보세요.', layout: 'text', moaSays: '이게 포인트!' },
      { type: "MOA'S PICK", title: "모아's PICK 3", items: [short.slice(0, 24), related[0]?.slice(0, 24) || '관련 보도가 이어지는 중', '공식 발표·원문 확인 필요'], layout: 'list', moaSays: '핵심만 쏙!' },
      { type: 'LIFE/CHECK', title: '이것만 체크!', items: ['원문 기사 한 번 더 확인하기', '나와 관련 있는지 따져보기', '공식 발표 업데이트 지켜보기'], layout: 'list', moaSays: '체크 완료!' },
      { type: 'CTA', title: '유용했다면\n저장해 두세요', body: '매일 모아가 쉬운 뉴스로 찾아올게요', layout: 'cta', moaSays: '또 만나요!' },
    ],
    moaComment: '어려운 뉴스, 모아가 쉽게 알려줄게요!',
    cta: '저장하고 친구에게도 공유해 주세요',
    caption: `요즘 다들 얘기하는 '${kw}' 이야기 🐑\n\n${title}\n\n모아가 핵심만 정리했어요. 자세한 내용은 원문 기사를 꼭 확인해 주세요!\n\n📌 저장해 두고 필요할 때 꺼내 보세요\n💬 친구에게 공유하기\n🐑 @moa 팔로우하고 매일 쉬운 뉴스 받기\n\n출처: ${srcName}`,
    hashtags: ['모아뉴스', '카드뉴스', '오늘의뉴스', '뉴스요약', '이슈정리', kw, '정보공유', '트렌드'],
    sources: [],
    factNotes: ['템플릿 모드로 생성되어 기사 내용이 충분히 반영되지 않았습니다. 본문을 직접 수정해 주세요.'],
  };
  return normalizeContent(raw, news);
}

// ---------- 모델 비교 ----------
export function buildJudgePrompt(news, candidates) {
  const lines = [
    '아래는 같은 뉴스로 서로 다른 AI가 만든 MOA 카드뉴스 원고들이다.',
    '각 원고를 6개 기준으로 1~10점 평가하고 가장 추천하는 원고를 골라라.',
    '기준: factuality(사실성), readability(가독성), hook(후킹), cardFit(카드뉴스 적합성), tone(MOA 톤앤매너), shareability(SNS 공유 가능성)',
    `뉴스 제목: ${news.title}`,
    '',
  ];
  candidates.forEach((c) => {
    lines.push(`### ${c.provider}`);
    lines.push(JSON.stringify({ title: c.content.title, cards: c.content.cards.map((k) => ({ type: k.type, title: k.title, body: k.body, items: k.items })), caption: c.content.caption }));
  });
  lines.push('');
  lines.push('출력은 JSON 하나만: {"scores":{"<provider>":{"factuality":0,"readability":0,"hook":0,"cardFit":0,"tone":0,"shareability":0,"comment":""}},"recommended":"<provider>","reason":""}');
  return lines.join('\n');
}

export const JUDGE_CRITERIA = { factuality: '사실성', readability: '가독성', hook: '후킹', cardFit: '카드뉴스 적합성', tone: 'MOA 톤앤매너', shareability: 'SNS 공유' };

// AI 판정이 불가능할 때 쓰는 규칙 기반 점수
export function heuristicScore(content) {
  const cards = content.cards || [];
  const titleLens = cards.map((c) => (c.title || '').length);
  const bodyLens = cards.map((c) => (c.body || '').length);
  const over = titleLens.filter((n) => n > 24).length + bodyLens.filter((n) => n > 110).length;
  const readability = Math.max(3, 10 - over);
  const hookLen = (cards[0]?.title || '').length;
  const hook = hookLen === 0 ? 3 : hookLen <= 20 ? 8 : 6;
  const filled = cards.filter((c) => c.title && (c.body || c.items.length)).length;
  const cardFit = Math.round(3 + (filled / 7) * 7);
  const pickOk = (cards[4]?.items || []).length >= 3 ? 1 : 0;
  const factuality = Math.min(10, 5 + (content.sources?.length ? 2 : 0) + (content.factNotes?.length ? 1 : 0) + pickOk);
  const tone = /요[.!?]?(\s|$)/.test(cards.map((c) => c.body).join(' ')) ? 8 : 6;
  const tags = content.hashtags?.length || 0;
  const shareability = Math.min(10, 4 + (tags >= 5 ? 3 : 1) + (content.caption ? 2 : 0));
  return { factuality, readability, hook, cardFit, tone, shareability, comment: '규칙 기반 자동 점수' };
}

// ---------- 뉴스 큐레이션 (Actions에서 사용) ----------
export function buildCurationPrompt(items) {
  const list = items.map((n, i) => `${i}. [${n.category}] ${n.title} (보도 ${n.sources.length}건, ${n.publishedAt})`).join('\n');
  return `다음은 오늘 수집한 한국 뉴스 후보다. MOA(20~40대 여성 대상 인스타그램 카드뉴스) 적합도를 평가해라.
평가 기준: 최근성, 화제성, SNS 확산 가능성, 20~40대 여성 관심도, 생활 연관성, 설명 용이성, 카드뉴스 적합성. 중복 사건은 낮게.
정치 공방·사건사고 자극 보도·특정인 사생활은 낮게 평가한다.

${list}

출력은 JSON 하나만: {"items":[{"index":0,"moaScore":0~100,"summary":"60자 이내 쉬운 요약","reason":"추천 이유 30자 이내","category":"${Object.keys(CATEGORIES).join('|')}"}]}`;
}
