// MOA AI 공통 모듈 — 브라우저와 Node(GitHub Actions) 양쪽에서 사용한다. DOM 의존성 없음.

export const PROVIDERS = {
  claude: { label: 'Claude', defaultModel: 'claude-opus-5-5' },
  gpt: { label: 'GPT', defaultModel: 'gpt-5' },
  gemini: { label: 'Gemini', defaultModel: 'gemini-2.5-flash' },
};

export const CATEGORIES = {
  NEWS: {
    label: 'MOA NEWS', emoji: '📰', name: '오늘의 뉴스', color: '#6F6258',
    desc: '오늘 꼭 알아야 할 사회·정책 뉴스',
    guide: '정책·사회 뉴스. 누가·언제·무엇을 정확히, 정치적 입장은 중립으로. 정부·공공기관 발표를 우선 출처로.',
    tags: ['오늘의뉴스', '뉴스요약', '시사상식', '이슈정리'],
  },
  TREND: {
    label: 'MOA TREND', emoji: '🔥', name: '요즘 트렌드', color: '#E8837E',
    desc: '지금 SNS에서 뜨는 화제와 유행',
    guide: '화제·유행. "왜 다들 이걸 하는지"를 중심으로, 유행의 시작·확산 경로를 쉽게. 과장된 "대란" 표현은 사실일 때만.',
    tags: ['요즘트렌드', '유행', '핫이슈', 'MZ트렌드'],
  },
  AI: {
    label: 'MOA AI', emoji: '🤖', name: 'AI·테크', color: '#7FA3C8',
    desc: 'AI와 테크 소식을 쉬운 말로',
    guide: 'AI·테크. 전문용어는 반드시 일상 비유로 풀고, "내 일·생활에서 어떻게 쓰는지" 예시를 넣는다. 성능 과장 금지.',
    tags: ['AI뉴스', '인공지능', '테크트렌드', 'AI활용'],
  },
  LIFE: {
    label: 'MOA LIFE', emoji: '🏠', name: '생활 정보', color: '#8FB58A',
    desc: '물가·날씨·건강 등 생활에 바로 쓰는 정보',
    guide: '생활 정보. 신청 방법·기간·대상 같은 실용 정보를 LIFE/CHECK에 구체적으로. 건강 정보는 의료 조언처럼 단정하지 말 것.',
    tags: ['생활정보', '꿀팁', '알아두면좋은정보', '생활꿀팁'],
  },
  MONEY: {
    label: 'MOA MONEY', emoji: '💰', name: '머니·재테크', color: '#D9A441',
    desc: '금리·세금·재테크를 내 지갑 기준으로',
    guide: '돈·재테크. 숫자(금리, 금액, 기간)는 정확히 표기하고 출처 확인. 특정 상품·종목 매수 권유 금지, "투자 판단은 본인 책임" 뉘앙스 유지.',
    tags: ['재테크', '경제뉴스', '돈공부', '월급관리'],
  },
  FOOD: {
    label: 'MOA FOOD', emoji: '🍙', name: '푸드', color: '#E9A06B',
    desc: '신메뉴·맛집·먹거리 트렌드',
    guide: '음식. 출시일·가격·판매처 등 확인된 정보 위주로, 맛 평가는 의견임을 표시. 광고처럼 보이지 않게.',
    tags: ['신메뉴', '편의점신상', '먹스타그램', '디저트'],
  },
  BEAUTY: {
    label: 'MOA BEAUTY', emoji: '💄', name: '뷰티', color: '#E4A1B9',
    desc: '화장품·스킨케어 트렌드와 소비 정보',
    guide: '뷰티. 효능을 단정하거나 의학적 효과를 주장하지 말 것(화장품법 표시·광고 기준 유의). 성분은 쉽게 풀어서.',
    tags: ['뷰티트렌드', '화장품추천', '스킨케어', '뷰티꿀팁'],
  },
  CULTURE: {
    label: 'MOA CULTURE', emoji: '🎬', name: '컬처', color: '#9C8CC4',
    desc: '드라마·영화·전시·공연 소식',
    guide: '문화. 결말 등 스포일러 금지, 공개일·장소·예매 정보는 정확히. 출연자 사생활 언급 금지.',
    tags: ['문화생활', '전시추천', '드라마추천', '주말뭐하지'],
  },
  MOA: {
    label: 'HELLO MOA', emoji: '🐑', name: '모아 소개', color: '#F5B8B5', hidden: true,
    desc: '모아 브랜드·계정 소개 게시물',
    guide: '브랜드 소개. 반말 친근체, 짧은 문장, 따뜻한 톤.',
    tags: ['모아', '첫게시물', '모아가모아올게', '뉴스요약', '카드뉴스'],
  },
  SHOPPING: {
    label: 'MOA SHOPPING', emoji: '🛍️', name: '쇼핑', color: '#6FB3A8',
    desc: '할인·신상·쇼핑 이슈 정리',
    guide: '쇼핑. 할인율·기간·조건을 정확히, 특정 판매처 홍보처럼 쓰지 말 것. 가격은 변동될 수 있음을 알린다.',
    tags: ['쇼핑정보', '할인정보', '신상', '쇼핑꿀팁'],
  },
};

export const TOPIC_KEYS = () => Object.keys(CATEGORIES).filter((k) => !CATEGORIES[k].hidden);

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

[원고 규칙 — 0.5초 안에 이해되게]
- 완전 초보도 바로 이해할 쉬운 말. 어려운 용어는 쓰지 않거나 한 단어로 풀어 쓴다.
- 긴 문단 금지, 배경 설명 금지. 카드 하나에 문장 1~2개. 제목 18자 이내, 본문 60자 이내, 리스트 항목 각 20자 이내.
- 핵심을 한 번에 다 주지 않는다. 장을 넘길수록 하나씩 공개해서 끝까지 넘겨 볼 이유를 만든다.
- 기사 원문 문장을 그대로 옮기지 않는다. 반드시 다시 쓴다.
- 사실과 의견을 구분한다. 의견·전망은 "~로 보여요"처럼 표시한다.
- 과장, 공포 조장, 사실과 다른 낚시 금지. 확인되지 않은 수치·날짜·인용은 만들지 않는다.
- 정책·경제·의료·법률 주제는 정부·공공기관·주요 언론 등 신뢰할 수 있는 출처를 우선한다.
- 확인이 필요한 사항은 factNotes에 적는다.

[1장 HOOK 헤드라인 — 가장 중요]
- 한 문장, 공백 포함 16자 안팎(최대 20자). 짧게, 굵게, 궁금하게.
- 결론·정답을 1장에서 말하지 않는다. "왜?", "뭐가?", "나도?"가 떠오르게 해서 다음 장을 넘기게 만든다.
- 배경 설명·수식어·기관명 나열 금지. 0.5초 안에 읽히는 단어만.
- 좋은 예: "내 월급, 이제 달라져요?" / "다들 이거 사려고 줄 섰대" / "카톡에 이 기능 생겼어요"
- 나쁜 예: "한국은행 금융통화위원회 기준금리 연 2.25% 동결 결정" (길고, 답을 다 줌)
- body는 비우거나 12자 이내 티저(예: "끝까지 보면 알려줄게요").

[7장 구조 — 반드시 이 순서, 정확히 7장]
1 HOOK: 위 헤드라인 규칙
2 WHAT: 무슨 일인지 한두 문장
3 WHY: 왜 화제인지 한두 문장
4 SO WHAT: 나한테 무슨 상관인지
5 MOA'S PICK: 핵심 3가지 (items 3개, 서로 다른 내용)
6 LIFE/CHECK: 지금 할 일 체크리스트 (items 2~4개)
7 CTA: 저장/공유/팔로우 유도

[카드 필드]
- highlight: title 또는 body 안에 실제로 들어 있는 핵심 단어(2~8자). 없으면 "".
- number/numberLabel: 핵심 숫자가 있으면 "3.5%" / "기준금리" 형태, 없으면 "".
- compare: 전후·찬반 비교가 핵심이면 채우고, 아니면 모두 "".
- layout: big(짧은 큰 제목) / text(설명) / list(리스트) / number(큰 숫자) / compare(좌우 비교) / keyword(키워드 강조) / cta / auto 중 내용에 맞게.
- pose: HOOK=surprised, WHAT=curious, WHY=thinking, SO WHAT=explain, MOA'S PICK=check, LIFE/CHECK=check, CTA=wave 를 기본으로 하되 내용에 더 맞는 포즈가 있으면 바꿔도 된다.
- moaSays: 모아가 말풍선으로 하는 짧은 한마디(16자 이내). HOOK의 moaSays는 독자 마음을 대신하는 혼잣말 반응(예: "안 사면 뒤처지는 거야..?", "이게 진짜라고..?").

[캡션]
관심을 끄는 첫 문장 → 뉴스 핵심 2~3줄 → 모아의 한마디 → CTA(저장/공유/팔로우) → 출처 표기 순서. 해시태그는 hashtags 배열에 # 없이 5~15개.`;

export function buildContentPrompt(news, opts = {}) {
  const lines = [];
  lines.push('아래 뉴스로 MOA 7장 카드뉴스를 만들어 줘.');
  lines.push('');
  const cat = CATEGORIES[news.category] || CATEGORIES.NEWS;
  if ((!opts.fromUrl && !opts.images?.length) || news.category) lines.push(`카테고리: ${news.category || 'NEWS'} — ${cat.emoji} ${cat.label} (${cat.desc}). 사용자가 정한 주제이므로 category 필드는 ${news.category || 'NEWS'} 그대로 출력한다.`);
  lines.push(`이 카테고리 작성 원칙: ${cat.guide}`);
  lines.push(`기본 해시태그 후보: ${['모아뉴스', ...cat.tags].join(', ')}`);
  if (news.title) lines.push(`제목: ${news.title}`);
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
  if (opts.fromUrl && news.url) {
    lines.push('');
    lines.push(`기사 URL: ${news.url}`);
    lines.push('위 URL의 기사를 직접 열어 읽고, 그 기사 내용만을 근거로 작성해. 기사 제목·언론사·날짜를 확인해서 title과 sources에 넣어.');
    lines.push(`category는 기사 내용에 가장 맞는 것으로 골라: ${TOPIC_KEYS().join(', ')} (사건·사고·소송·제재는 NEWS).`);
    lines.push('기사를 열 수 없으면 지어내지 말고 factNotes에 "기사를 열 수 없음"이라고 쓰고, 확인 가능한 범위에서만 작성해.');
  } else if (opts.webSearch) {
    lines.push('');
    lines.push('웹 검색으로 이 뉴스의 핵심 사실(날짜, 수치, 주체)을 2개 이상의 출처에서 확인한 뒤 작성해. 확인한 출처는 sources에 넣어.');
  } else {
    lines.push('');
    lines.push('제공된 정보 밖의 구체적 수치나 인용은 지어내지 말고, 일반적인 배경 설명 수준으로만 보충해.');
  }
  if (opts.images?.length) {
    lines.push('');
    lines.push(`첨부 이미지 ${opts.images.length}장은 사용자가 캡처한 기사 화면이다. 이미지 속 기사 내용(제목, 언론사, 날짜, 본문)을 읽고 그 내용만 근거로 작성해. 읽기 어려운 부분은 지어내지 말고 factNotes에 적어.`);
    if (!news.category) lines.push(`category는 기사 내용에 가장 맞는 것으로 골라: ${TOPIC_KEYS().join(', ')} (사건·사고·소송·제재는 NEWS).`);
  }
  if (opts.handle) lines.push(`캡션의 팔로우 문구는 반드시 "🐑 ${opts.handle} 팔로우하고 매일 쉬운 뉴스 받기"로 쓴다.`);
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

async function callClaude({ apiKey, model, system, prompt, images, schema, webSearch, fetchUrl, maxTokens, fetchImpl, browser }) {
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
    messages: [{
      role: 'user',
      content: images?.length
        ? [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } })), { type: 'text', text: prompt }]
        : prompt,
    }],
    output_config: { effort: 'medium' },
  };
  if (webSearch || fetchUrl) {
    body.tools = [];
    if (fetchUrl) body.tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 });
    body.tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
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

async function callGpt({ apiKey, model, system, prompt, images, webSearch, fetchUrl, fetchImpl }) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
  if (webSearch || fetchUrl) {
    const data = await httpJson(fetchImpl, 'https://api.openai.com/v1/responses', {
      method: 'POST', headers,
      body: JSON.stringify({
        model, instructions: system, tools: [{ type: 'web_search' }],
        input: images?.length
          ? [{ role: 'user', content: [...images.map((im) => ({ type: 'input_image', image_url: `data:${im.mime};base64,${im.data}` })), { type: 'input_text', text: prompt }] }]
          : prompt,
      }),
    });
    if (data.output_text) return data.output_text;
    return (data.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  }
  const data = await httpJson(fetchImpl, 'https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, {
        role: 'user',
        content: images?.length
          ? [...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })), { type: 'text', text: prompt }]
          : prompt,
      }],
      response_format: { type: 'json_object' },
    }),
  });
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini({ apiKey, model, system, prompt, images, webSearch, fetchUrl, fetchImpl }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [...(images || []).map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), { text: prompt }] }],
    generationConfig: {},
  };
  if (webSearch || fetchUrl) {
    body.tools = [{ google_search: {} }];
    if (fetchUrl) body.tools.unshift({ url_context: {} });
  } else body.generationConfig.responseMimeType = 'application/json';
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
// 따옴표·기호·띄어쓰기 차이를 무시하고 비슷한 문장인지 판단한다
const normKey = (s) => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
const tokenSet = (s) => new Set(String(s || '').toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []);
export function isSimilar(a, b) {
  const ka = normKey(a);
  const kb = normKey(b);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.min(ta.size || 1, tb.size || 1) >= 0.7;
}
export function dedupeTexts(list) {
  const out = [];
  for (const t of list) if (t && !out.some((x) => isSimilar(x, t))) out.push(t);
  return out;
}

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
      items: dedupeTexts((Array.isArray(card.items) ? card.items : []).map((s) => clampText(s, 40)).filter(Boolean)).slice(0, 5),
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
export function templateContent(news, { handle = '@moa.story' } = {}) {
  const title = (news.title || '').replace(/\s+-\s+[^-]+$/, '').trim();
  const short = title.length > 26 ? `${title.slice(0, 24)}…` : title;
  // 대표 기사와 같은 내용(따옴표·언론사 표기만 다른 제목)은 관련 보도에서 뺀다
  const related = dedupeTexts([title, ...(news.sources || []).map((s) => s.title)]).slice(1, 4);
  const srcName = news.source || news.sources?.[0]?.name || '';
  const cat = CATEGORIES[news.category] ? news.category : 'NEWS';
  const kw = (title.match(/[가-힣A-Za-z0-9]{2,8}/g) || ['이슈'])[0];
  const raw = {
    title,
    category: cat,
    hook: `요즘 다들 얘기하는 '${kw}', 알고 있어요?`,
    cards: [
      { type: 'HOOK', title: `다들 '${kw}' 얘기, 왜?`, body: '끝까지 보면 알려줄게요', highlight: kw, layout: 'big', moaSays: '이거 봤어요?' },
      { type: 'WHAT', title: '무슨 일이냐면요', body: short, highlight: kw, layout: 'text', moaSays: '정리해 볼게요' },
      { type: 'WHY', title: '왜 화제일까요?', body: related.length ? `여러 매체가 동시에 다루고 있어요. ${related[0].slice(0, 50)}` : '많은 사람들의 생활과 맞닿아 있는 이슈라서 관심이 커지고 있어요.', layout: 'text', moaSays: '흠, 그렇구나' },
      { type: 'SO WHAT', title: '우리에겐 어떤 의미?', body: '내 일상에 바로 영향이 있는지, 앞으로 무엇이 바뀌는지 한 번 확인해 보세요.', layout: 'text', moaSays: '이게 포인트!' },
      { type: "MOA'S PICK", title: "모아's PICK 3", items: dedupeTexts([short.slice(0, 24), related[0]?.slice(0, 24), related[1]?.slice(0, 24), '관련 보도가 이어지는 중', '공식 발표·원문 확인 필요']).slice(0, 3), layout: 'list', moaSays: '핵심만 쏙!' },
      { type: 'LIFE/CHECK', title: '이것만 체크!', items: ['원문 기사 한 번 더 확인하기', '나와 관련 있는지 따져보기', '공식 발표 업데이트 지켜보기'], layout: 'list', moaSays: '체크 완료!' },
      { type: 'CTA', title: '유용했다면\n저장해 두세요', body: '매일 모아가 쉬운 뉴스로 찾아올게요', layout: 'cta', moaSays: '또 만나요!' },
    ],
    moaComment: '어려운 뉴스, 모아가 쉽게 알려줄게요!',
    cta: '저장하고 친구에게도 공유해 주세요',
    caption: `요즘 다들 얘기하는 '${kw}' 이야기 🐑\n\n${title}\n\n모아가 핵심만 정리했어요. 자세한 내용은 원문 기사를 꼭 확인해 주세요!\n\n📌 저장해 두고 필요할 때 꺼내 보세요\n💬 친구에게 공유하기\n🐑 ${handle} 팔로우하고 매일 쉬운 뉴스 받기\n\n출처: ${srcName}`,
    hashtags: ['모아뉴스', '카드뉴스', ...CATEGORIES[cat].tags, kw, '정보공유'],
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

// ---------- 첫 장 배경 이미지 생성 ----------
export const IMAGE_PROVIDERS = {
  gpt: { label: 'GPT 이미지', defaultModel: 'gpt-image-1' },
  gemini: { label: 'Gemini 이미지', defaultModel: 'gemini-2.5-flash-image' },
};

export function buildImagePrompt(content) {
  const cat = CATEGORIES[content.category] || CATEGORIES.NEWS;
  const topic = content.news?.title || content.title || cat.desc;
  return [
    'Background illustration for a Korean Instagram card-news cover (portrait).',
    `Topic: ${topic}`,
    `Mood: ${cat.desc}. Soft, cute, cozy 3D clay / felt illustration, gentle lighting.`,
    'Palette: cream (#FFF9F0), soft pink (#F5B8B5), sage green (#C9D8C0), warm brown accents.',
    'Composition: keep the top 45% calm, simple and low-detail so a big headline can sit on it; place the main objects in the lower half and the sides.',
    'Strictly no text, no letters, no numbers, no logos, no brand marks, no real people or faces.',
  ].join('\n');
}

// 첫 장 커버용: 실제 사진 같은 매거진 스타일 배경
export function buildCoverPrompt(content) {
  const cat = CATEGORIES[content.category] || CATEGORIES.NEWS;
  const topic = content.news?.title || content.title || cat.desc;
  const hook = content.cards?.[0]?.title?.replace(/\n/g, ' ') || '';
  return [
    'A photorealistic editorial photograph for the cover of a trendy Korean Instagram magazine card post (portrait).',
    `News topic: ${topic}`,
    hook ? `Headline mood: ${hook}` : '',
    `Category: ${cat.desc}.`,
    'Show a concrete, relatable everyday scene or object that instantly suggests this topic (e.g. objects on a desk, a street, a shop shelf, a phone screen glow, food close-up).',
    'Style: candid 35mm film photo, natural light, soft grain, slightly muted warm tones, shallow depth of field, like a modern Korean lifestyle magazine.',
    'Composition: the bottom 40% should be simpler and darker so white headline text can sit there.',
    'People only from behind, cropped, or out of focus — no identifiable faces, no real celebrities or politicians.',
    'Strictly no text, letters, numbers, logos, watermarks or brand marks anywhere in the image.',
  ].filter(Boolean).join('\n');
}

export async function generateImage(provider, { apiKey, model, prompt, aspect = '4:5', fetchImpl = globalThis.fetch.bind(globalThis) }) {
  if (!apiKey) throw new Error(`${PROVIDERS[provider]?.label || provider} API 키가 필요합니다.`);
  if (provider === 'gpt') {
    const data = await httpJson(fetchImpl, 'https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || IMAGE_PROVIDERS.gpt.defaultModel, prompt, size: '1024x1536', n: 1 }),
    });
    const b64 = data.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;
    if (data.data?.[0]?.url) return data.data[0].url;
    throw new Error('이미지 응답이 비어 있습니다.');
  }
  if (provider === 'gemini') {
    const m = model || IMAGE_PROVIDERS.gemini.defaultModel;
    const data = await httpJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
      }),
    });
    const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
    const inline = part?.inlineData || part?.inline_data;
    if (!inline) throw new Error('Gemini가 이미지를 돌려주지 않았습니다.');
    return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
  }
  throw new Error('배경 이미지는 GPT 또는 Gemini 키로 만들 수 있어요. (Claude는 이미지 생성을 지원하지 않음)');
}

// ---------- 첫 게시물: 모아 소개 ----------
export function introContent() {
  const blank = { highlight: '', items: [], number: '', numberLabel: '', compare: { leftTitle: '', left: '', rightTitle: '', right: '' } };
  const card = (type, o) => ({ ...blank, type, body: '', layout: 'big', ...o, style: { hideLabel: true, ...(o.style || {}) } });
  return {
    title: '안녕! 나는 모아야',
    category: 'MOA',
    preset: 'intro',
    hook: '안녕! 나는 모아야',
    cards: [
      card('HOOK', { title: '안녕!\n나는 모아야', highlight: '모아', pose: 'wave', moaSays: '반가워!', style: { moaScale: 1.15 } }),
      card('WHAT', { title: '세상에는\n매일 새로운 이야기가\n생기잖아.', highlight: '새로운 이야기', pose: 'curious', moaSays: '그치?' }),
      card('WHY', { title: '그런데 뉴스는 어렵고\n트렌드는 너무 빨리\n지나가고…', highlight: '어렵고', pose: 'sleepy', moaSays: '나도 그래…' }),
      card('SO WHAT', { title: '그래서 내가\n요즘 꼭 알아두면 좋은 것들을\n하나씩 모아오기로 했어.', highlight: '모아오기로', pose: 'idea', moaSays: '좋은 생각!' }),
      card("MOA'S PICK", { title: '모아가 모아올 것들', layout: 'list', items: ['📰 뉴스', '🔥 트렌드', '🤖 AI', '🏠 생활'], pose: 'check', moaSays: '하나씩!' }),
      card('LIFE/CHECK', { title: '어렵지 않게,\n가볍게,\n딱 필요한 만큼.', highlight: '딱 필요한 만큼', pose: 'heart', moaSays: '약속!' }),
      card('CTA', { title: '앞으로\n모아가 모아올게.', highlight: '모아올게', layout: 'cta', body: '팔로우하고 같이 봐요', pose: 'wave', moaSays: '잘 부탁해!' }),
    ],
    moaComment: '앞으로 모아가 모아올게!',
    cta: '팔로우하고 같이 봐요',
    caption: '안녕! 나는 모아야 🐑\n\n세상에는 매일 새로운 이야기가 생기는데\n뉴스는 어렵고, 트렌드는 너무 빨리 지나가죠.\n\n그래서 모아가 요즘 꼭 알아두면 좋은 것들을\n어렵지 않게, 가볍게, 딱 필요한 만큼 모아올게요.\n\n📰 뉴스 🔥 트렌드 🤖 AI 🏠 생활\n\n앞으로 모아가 모아올게 🐑🤍\n팔로우하고 같이 봐요!',
    hashtags: ['모아', '첫게시물', '안녕', '모아가모아올게', '뉴스요약', '카드뉴스', '트렌드', 'AI', '생활정보', '정보공유'],
    sources: [],
    factNotes: [],
  };
}
