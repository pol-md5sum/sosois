// 네트워크 없이 파서·점수·정규화를 점검한다: node scripts/selftest.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseRss, cluster, scoreCluster, classify, selectBalanced, hardNewsOverride } from './fetch-news.mjs';
import { isSimilar, normalizeContent, templateContent, extractJson, heuristicScore, buildContentPrompt, CARD_TYPES } from '../js/ai.js';

const xml = await readFile(new URL('./fixtures/gnews.xml', import.meta.url), 'utf8');
const items = parseRss(xml).map((x) => ({ ...x, category: 'NEWS' }));
assert.equal(items.length, 4);
assert.equal(items[0].source, '연합뉴스');
assert.equal(items[0].related.length, 3);
assert.equal(items[0].related[1].name, '한국경제');

const cl = cluster(items);
assert.equal(cl.length, 3, '같은 금리 동결 기사는 하나로 묶여야 함');
assert.ok(cl[0].sources.length >= 4);
const now = Date.parse('2026-10-08T06:00:00Z');
const scored = cl.map((c) => ({ title: c.title, ...scoreCluster(c, now) })).sort((a, b) => b.moaScore - a.moaScore);
console.table(scored.map((s) => ({ title: s.title.slice(0, 24), moa: s.moaScore, buzz: s.buzzScore })));
assert.match(scored.at(-1).title, /국회의원/, '정치 공방 기사는 가장 낮아야 함');

const trends = parseRss(await readFile(new URL('./fixtures/trends.xml', import.meta.url), 'utf8'));
assert.equal(trends[0].traffic, '20000+');
assert.equal(trends[0].trendNews[0].name, '조선일보');

const news = { category: 'MONEY', title: cl[0].title, sources: cl[0].sources, url: cl[0].url, source: cl[0].source };
const t = templateContent(news);
assert.equal(t.cards.length, 7);
assert.deepEqual(t.cards.map((c) => c.type), CARD_TYPES);
assert.ok(t.cards.every((c) => c.pose));

const n = normalizeContent(extractJson('```json\n{"title":"x","category":"BAD","cards":[{"title":"a","pose":"nope","layout":"zzz"}],"hashtags":["#모아","모아 뉴스"]}\n```'), news);
assert.equal(n.cards.length, 7);
assert.equal(n.category, 'MONEY');
assert.equal(n.cards[0].pose, 'surprised');
assert.equal(n.cards[0].layout, 'auto');
assert.deepEqual(n.hashtags, ['모아', '모아뉴스']);
assert.ok(n.sources.length > 0, '출처가 없으면 뉴스 출처로 채움');
assert.ok(heuristicScore(t).readability > 0);
assert.ok(buildContentPrompt(news, { webSearch: true }).includes('웹 검색'));
assert.equal(classify('한국은행 기준금리 동결, 대출 이자는'), 'MONEY');
assert.equal(classify('올리브영 스킨케어 신상 화장품'), 'BEAUTY');
assert.equal(classify('국회 본회의 개최'), 'NEWS');
const pool = [...Array(30)].map((_, i) => ({ category: i < 25 ? 'NEWS' : 'BEAUTY', moaScore: 100 - i }));
const bal = selectBalanced(pool, 3, 6);
assert.equal(bal.filter((x) => x.category === 'BEAUTY').length, 3, '점수가 낮아도 주제별 최소 개수 보장');
assert.equal(hardNewsOverride("'개인정보 유출' 쿠팡, 6200억대 과징금 불복해 소송 제기", 'SHOPPING'), 'NEWS');
assert.equal(hardNewsOverride('쿠팡 블랙프라이데이 최대 70% 할인', 'SHOPPING'), 'SHOPPING');
assert.equal(hardNewsOverride('한은 기준금리 동결 논란', 'MONEY'), 'MONEY');
// 따옴표 종류만 다른 같은 제목은 한 번만
const dupNews = { category: 'NEWS', title: "‘개인정보 유출’ 쿠팡, 6200억대 과징금 불복해 소송 제기", url: 'u', source: 'A',
  sources: [{ name: 'A', title: "‘개인정보 유출’ 쿠팡, 6200억대 과징금 불복해 소송 제기" }, { name: 'B', title: "'개인정보 유출' 쿠팡, 6200억대 과징금 불복해 소송 제기 - B" }, { name: 'C', title: '쿠팡 과징금 행정소송, 개인정보위와 법정 공방' }] };
const pick = templateContent(dupNews).cards[4].items;
assert.equal(pick.length, 3);
for (let i = 0; i < pick.length; i++) for (let j = i + 1; j < pick.length; j++) assert.ok(!isSimilar(pick[i], pick[j]), `중복 항목: ${pick[i]} / ${pick[j]}`);
const n2 = normalizeContent({ cards: [{}, {}, {}, {}, { items: ['A 항목입니다', 'A 항목입니다!', 'B 다른 항목'] }] });
assert.equal(n2.cards[4].items.length, 2);
console.log('selftest OK');

// ---------- 숏폼 ----------
const SH = await import('../js/shorts.js');
assert.equal(SH.srtTime(3723.456), '01:02:03,456');
const srt = SH.toSrt([{ start: 2, end: 4, text: '두번째' }, { start: 0, end: 1.5, text: '첫 자막' }]);
assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:01,500\n첫 자막'), srt);
const dist = SH.distribute(['짧음', '조금 더 긴 자막이에요', '끝'], 10);
assert.equal(dist.length, 3);
assert.ok(dist.every((d, i) => d.end > d.start && (i === 0 || d.start >= dist[i - 1].start)));
assert.ok(dist.at(-1).end <= 10);
const proj = { clips: [{ name: 'a.mp4', duration: 10, in: 0, out: 10 }, { name: 'b.mp4', duration: 6, in: 0, out: 6 }], desc: '성수동 카페 딸기라떼 리뷰. 크림이 진짜 두꺼워요! 가격은 6,500원.', platforms: { reels: true } };
const tp = SH.templatePlan(proj, '@moa.story');
assert.ok(tp.subtitles.length >= 2);
assert.ok(tp.captions.instagram.text.includes('@moa.story'));
SH.applyPlan(proj, { clips: [{ index: 0, in: 2, out: 99 }, { index: 1, in: -3, out: 4 }], subtitles: [{ start: 0, end: 2, text: '훅', hl: '' }, { start: 50, end: 60, text: '범위 밖' }], thumbnail: { clip: 9, time: 2 } });
assert.deepEqual([proj.clips[0].in, proj.clips[0].out, proj.clips[1].in, proj.clips[1].out], [2, 10, 0, 4]);
assert.equal(SH.totalLen(proj), 12);
assert.equal(proj.subtitles.length, 1, '전체 길이 밖 자막은 제외');
assert.equal(proj.thumb.clip, 1, '썸네일 클립 번호 보정');
assert.equal(SH.speakify('딸기가 통째로 들어감'), '딸기가 통째로 들어가요');
assert.equal(SH.speakify('가격 6,500원임.'), '가격 6,500원이에요');
assert.equal(SH.speakify('주차 공간 있음'), '주차 공간 있어요');
const rich = SH.templatePlan({ clips: [{ duration: 30, in: 0, out: 30 }], desc: '성수동 카페 딸기라떼 리뷰. 크림이 엄청 두껍고 딸기가 통째로 들어감. 가격 6,500원임. 귀엽고 발랄하게.' }, '@moa.story');
const richTexts = rich.subtitles.map((x) => x.text.replace('\n', ' '));
assert.ok(rich.subtitles.length >= 5, richTexts.join(' / '));
assert.ok(!richTexts.some((x) => x.includes('발랄')), '말투 요청은 자막에서 제외');
assert.ok(richTexts.some((x) => x.includes('들어가요')), '메모체를 말투로');
assert.ok(rich.thumbnail.title.includes('후기'));
assert.ok(rich.subtitles.at(-1).end <= 30);
assert.ok(SH.titleSrt({ clips: [{ duration: 8, in: 0, out: 8 }], thumb: { title: '제목\n둘째 줄' } }).includes('00:00:00,000 --> 00:00:08,000\n제목\n둘째 줄'));
assert.ok(Object.values(SH.PLATFORMS).every((pf) => pf.w === 1080 && pf.h === 1920));
const ar = { target: 10, clips: [{ name: 'b', mtime: 20, duration: 12, in: 1, out: 5, zoom: 2 }, { name: 'a', mtime: 10, duration: 8, in: 0, out: 8 }] };
assert.deepEqual(SH.autoArrange(ar), [1, 0], '촬영 순서로 정렬');
assert.equal(ar.clips[0].name, 'a');
assert.ok(Math.abs(SH.totalLen(ar) - 10) < 0.05, `목표 길이에 맞춤: ${SH.totalLen(ar)}`);
assert.ok(ar.clips.every((c) => c.zoom === 1 && c.in >= 0 && c.out <= c.duration));
assert.equal(SH.textOf({ subPos: 'lower' }, 'sub').y, 60, '예전 위치 설정 반영');
assert.equal(SH.textOf({ text: { sub: { size: 70 } } }, 'sub').size, 70);
assert.equal(SH.fitOf({ fit: 'auto' }, { w: 1920, h: 1080 }), 'blur');
assert.equal(SH.fitOf({ fit: 'auto' }, { w: 1080, h: 1920 }), 'cover');
assert.equal(SH.fitOf({ fit: 'auto' }, { w: 1080, h: 1920, fit: 'contain' }), 'contain');
assert.ok(SH.templatePlan(proj, '@h', '해피해피').captions.instagram.hashtags.includes('해피해피'));
console.log('shorts selftest OK');

// ---------- 계정 ----------
const AI2 = await import('../js/ai.js');
const sys2 = AI2.personaSystem(AI2.SYSTEM_PROMPT, { charName: '해피해피', charDesc: '아기 곰 캐릭터', brand: '해피해피' });
assert.ok(sys2.includes('"해피해피"') && sys2.includes('해피해피는 아기 곰 캐릭터이자') && !sys2.includes('모아'));
assert.equal(AI2.personaSystem(AI2.SYSTEM_PROMPT, { charName: '모아', brand: 'MOA | 모아' }), AI2.SYSTEM_PROMPT);
const rn = AI2.renameCharacter({ cards: [{ type: "MOA'S PICK", title: '모아의 PICK', category: 'MOA' }] }, '해피해피');
assert.equal(rn.cards[0].type, "MOA'S PICK");
assert.equal(rn.cards[0].title, '해피해피의 PICK');
const R = await import('../js/render.js').catch(() => null);
if (R) {
  assert.equal(R.tagLabel('MOA NEWS', { tagPrefix: 'happy' }), 'HAPPY NEWS');
  assert.equal(R.tagLabel("MOA'S PICK", { tagPrefix: 'HAPPY' }), "HAPPY'S PICK");
  assert.equal(R.tagLabel('WHAT', { tagPrefix: 'HAPPY' }), 'WHAT');
}
// 해피해피 뉴스: 육아·아기·생활용품·생활템 분류와 점수
const FN = await import('./fetch-news.mjs');
assert.equal(FN.classifyHappy('아기 이유식 기저귀 할인', 'PARENTING'), 'BABY');
assert.equal(FN.classifyHappy('다이소 살림템 품절', 'LIVING'), 'ITEM');
assert.equal(FN.classifyHappy('부모급여 신청 방법 육아휴직', 'BABY'), 'PARENTING');
const hnow = Date.now();
const hitems = FN.buildHappyItems([
  { title: '부모급여 내년부터 인상…신청 방법은 - 연합뉴스', source: '연합뉴스', url: 'https://a/1', publishedAt: new Date(hnow - 36e5).toISOString(), category: 'PARENTING', related: [] },
  { title: '아기 젖병 리콜 대상 제품 확인하세요 - KBS', source: 'KBS', url: 'https://a/2', publishedAt: new Date(hnow - 2 * 36e5).toISOString(), category: 'BABY', related: [] },
  { title: '다이소 신상 수납 꿀템 품절 행렬 - 머니투데이', source: '머니투데이', url: 'https://a/3', publishedAt: new Date(hnow - 3 * 36e5).toISOString(), category: 'ITEM', related: [] },
], hnow);
assert.equal(hitems.length, 3);
assert.ok(hitems.every((x) => x.channel === 'happy' && AI2.HAPPY_TOPICS.includes(x.category)), JSON.stringify(hitems.map((x) => x.category)));
assert.ok(!AI2.TOPIC_KEYS().includes('PARENTING'), '모아 주제에는 해피해피 주제가 섞이지 않음');
assert.ok(AI2.personaSystem('기본', { focus: '육아만 다룬다' }).includes('육아만 다룬다'));
assert.equal(AI2.introContentHappy().cards.length, 7);
assert.ok(!JSON.stringify(AI2.introContentHappy()).includes('모아'));
// 원문 기사 링크
assert.equal(AI2.directUrl('https://news.google.com/rss/articles/CBMiXyz'), '');
assert.equal(AI2.directUrl('https://www.yna.co.kr/view/AKR2026'), 'https://www.yna.co.kr/view/AKR2026');
const capL = AI2.withArticleLink('본문\n\n출처: 연합뉴스', { title: '부모급여 인상 - 연합뉴스', source: '연합뉴스', url: 'https://www.yna.co.kr/view/AKR2026', publishedAt: '2026-10-09T01:00:00Z' });
assert.ok(capL.includes('📰 원문 기사\n연합뉴스 「부모급여 인상」 (2026.10.09)\n🔗 https://www.yna.co.kr/view/AKR2026'), capL);
assert.ok(!capL.includes('출처: 연합뉴스'), '출처 한 줄은 원문 기사 블록으로 대체');
const capG = AI2.withArticleLink('본문', { title: '제목', source: 'KBS', url: 'https://news.google.com/rss/articles/abc' });
assert.ok(capG.includes('KBS 「제목」') && !capG.includes('news.google.com'), capG);
assert.equal(AI2.withArticleLink(capL, { title: 'x' }), capL, '두 번 넣지 않음');
// 카드뉴스 형식(추천템·나들이·육아 정보)
const nr = AI2.normalizeContent({ cards: [
  { type: 'HOOK', title: '표지' }, { type: 'PLACE', title: '키즈랜드', specs: [{ k: '위치', v: '판교' }, { k: '', v: 'x' }], emoji: '🎡' },
  { type: 'PLACE', title: '테마파크' }, { type: 'LIFE/CHECK', title: '준비물', items: ['물티슈'] }, { type: 'CTA', title: '끝' },
] }, { recipe: 'place', category: 'OUTING' });
assert.equal(nr.cards.length, 5, '형식 카드는 7장으로 늘리지 않음');
assert.deepEqual(nr.cards.map((x) => x.type), ['HOOK', 'PLACE', 'PLACE', 'LIFE/CHECK', 'CTA']);
assert.equal(nr.cards[1].layout, 'place');
assert.deepEqual(nr.cards[1].specs, [{ k: '위치', v: '판교' }]);
assert.equal(nr.recipe, 'place');
assert.equal(AI2.normalizeContent({ cards: [{}, {}] }, {}).cards.length, 7, '뉴스 요약은 7장 그대로');
for (const r of ['items', 'place', 'guide']) {
  const tr = AI2.templateRecipe({ title: '주말 아이와 가볼 만한 곳 - 뉴스1' }, r, { handle: '@h' });
  assert.equal(tr.cards[0].type, 'HOOK'); assert.equal(tr.cards.at(-1).type, 'CTA');
  assert.ok(tr.cards.length >= 5 && tr.cards.length <= 10, `${r}: ${tr.cards.length}`);
}
assert.ok(AI2.buildContentPrompt({ title: 't', recipe: 'items', category: 'ITEM' }).includes('추천템'));
assert.equal(FN.classifyHappy('주말 아이와 가볼만한 키즈카페 테마파크', 'PARENTING'), 'OUTING');
assert.ok(AI2.HAPPY_TOPICS.includes('OUTING'));
// 📍 다녀왔어요
assert.deepEqual(AI2.memoLines('볼풀이 엄청 큼. 수유실 있음\n주차 무료'), ['볼풀이 엄청 커요', '수유실 있어요', '주차 무료']);
const tv = AI2.templateVisit({ place: '키즈랜드', area: '경기 성남', fee: '18,000원', memo: '한산했음. 볼풀 큼. 주차 팁: 지하 무료' }, { handle: '@h', photos: 4 });
assert.deepEqual(tv.cards.map((x) => x.layout), ['photo', 'photo', 'photo', 'photo', 'place', 'list', 'cta']);
assert.equal(tv.cards[0].title, '아기랑 여기\n다녀왔어요!');
assert.ok(tv.cards[4].specs.some((x) => x.k === '요금' && x.v === '18,000원'));
assert.ok(tv.caption.includes('방문 전 확인') && tv.hashtags.includes('경기가볼만한곳'));
assert.ok(AI2.buildVisitPrompt({ place: '키즈랜드' }, { photos: 3 }).includes('사진 3장'));
const nv = AI2.normalizeContent({ cards: [{ type: 'HOOK', layout: 'photo', title: 't' }, { type: 'WHAT', layout: 'photo' }, { type: 'CTA' }] }, { recipe: 'visit' });
assert.deepEqual(nv.cards.map((x) => x.layout), ['photo', 'photo', 'auto', 'auto'], '형식 카드는 최소 4장으로 채움');
const vp = SH.templateVisitPlan({ clips: [{ duration: 10, in: 0, out: 10 }], desc: '평일이라 한산했음. 볼풀 큼', visit: { place: '키즈랜드', fee: '18,000원' } }, '@h');
assert.equal(vp.thumbnail.title, '아기랑 여기\n다녀왔어요!');
assert.ok(vp.subtitles[0].text.includes('키즈랜드') && vp.subtitles.some((x) => x.text.includes('18,000원')));
assert.ok(vp.subtitles.at(-1).end <= 10);
// 👶 육아 정보
const PA = await import('../js/parenting.js');
assert.equal(AI2.sourceKind({ name: '질병관리청 · 예방접종', url: 'https://www.kdca.go.kr/x' }), 'gov');
assert.equal(AI2.sourceKind({ name: 'WHO', url: 'https://www.who.int/a' }), 'intl');
assert.equal(AI2.sourceKind({ name: '대한소아청소년과학회', url: 'https://www.kps.or.kr/a' }), 'society');
assert.equal(AI2.sourceKind({ name: '맘카페', url: 'https://cafe.naver.com/x' }), 'media');
const gp = AI2.buildGuidePrompt({ title: '이유식 시작', recipe: 'info_qa', guide: { title: '이유식, 언제 시작하면 될까요?', age: '4~6개월', group: '이유식·영양' } }, { handle: '@h' });
assert.ok(gp.includes('출처에 적힌 것만') && gp.includes('결론') && gp.includes('4~6개월') && gp.includes('7장 구조 대신'));
assert.ok(AI2.buildContentPrompt({ title: 't', guide: { title: 't' }, recipe: 'info_top' }).includes('POINT'));
const gn = AI2.normalizeContent({ cards: [{ type: 'HOOK', title: '돌 전 조심할 음식 3가지' }, { type: 'POINT', title: '항목 A', specs: [{ k: '월령', v: '12개월 전' }] }, { type: 'POINT', title: '항목 B' }, { type: 'CTA' }] }, { recipe: 'info_top', category: 'PARENTING' });
assert.deepEqual(gn.cards.map((x) => x.layout), ['auto', 'point', 'point', 'auto']);
const tg = AI2.templateGuide({ title: 't', recipe: 'info_top', guide: { title: '돌 전 아기 조심할 음식' } }, { handle: '@h' });
assert.equal(tg.cards[0].title, '돌 전 아기 조심할 음식');
assert.ok(tg.cards.some((x) => x.type === 'POINT') && tg.factNotes[0].includes('빈 틀') && tg.sources.length === 0);
const fb = AI2.finalizeGuide({ cards: [{ type: 'HOOK' }, { type: 'CTA', body: '' }], caption: '훅', sources: [{ name: '질병관리청 · 예방접종', url: 'https://www.kdca.go.kr/x' }] }, { title: 't', format: 'info_qa' }, new Date('2026-10-10T00:00:00Z'));
assert.ok(fb.caption.includes('아기마다 달라요') && fb.caption.includes('📚 근거: 질병관리청 · 예방접종') && fb.cards[1].body.includes('출처: 질병관리청'));
const r1 = AI2.reviewGuide({ ...fb, review: {}, factNotes: [] }, new Date('2026-10-11').getTime());
assert.equal(r1.ready, false); assert.equal(r1.official, 1);
const r2 = AI2.reviewGuide({ ...fb, review: { age: true, nums: true, sources: true }, factNotes: [] }, new Date('2026-10-11').getTime());
assert.equal(r2.ready, true, JSON.stringify(r2.warnings));
const bad = AI2.reviewGuide({ title: '꿀 먹이면 반드시 낫게 해요', caption: '', cards: [], sources: [{ name: '블로그', url: 'https://blog.example.com' }], review: { age: true, nums: true, sources: true }, checkedAt: '2020-01-01' }, Date.now());
assert.ok(bad.warnings.some((w) => w.includes('공공기관')) && bad.warnings.some((w) => w.includes('치료·예방·효능') || w.includes('낫게')) && bad.warnings.some((w) => w.includes('단정')) && bad.warnings.some((w) => w.includes('90일')));
assert.equal(bad.ready, false);
assert.equal(AI2.isStale('2026-01-01', new Date('2026-10-10').getTime()), true);
assert.equal(AI2.isStale('2026-09-20', new Date('2026-10-10').getTime()), false);
assert.equal(PA.loadTopics('x').length, 16);
const wk1 = PA.weeklyPick(PA.SEED_TOPICS, new Date('2026-10-12')).map((t) => t.id);
assert.deepEqual(wk1, PA.weeklyPick(PA.SEED_TOPICS, new Date('2026-10-14')).map((t) => t.id), '같은 주(월·수)에는 같은 추천');
assert.notDeepEqual(wk1, PA.weeklyPick(PA.SEED_TOPICS, new Date('2026-10-20')).map((t) => t.id), '주가 바뀌면 추천도 바뀜');
assert.ok(PA.SEED_TOPICS.every((t) => PA.ageLabel(t.age) && PA.groupLabel(t.group) && ['info_qa', 'info_top', 'info_check'].includes(t.format)));
// 🎞️ 슬라이드 숏폼
assert.equal(SH.slideNarration({ type: 'HOOK', title: '이유식\n언제 시작?', body: '티저' }), '이유식 언제 시작?');
assert.equal(SH.slideNarration({ type: 'POINT', title: '꿀', body: '12개월 전 금지', specs: [{ k: '월령', v: '12개월' }] }), '꿀. 12개월 전 금지. 월령 12개월');
assert.equal(SH.slideDur('짧음', 'WHAT'), 2.8); assert.ok(SH.slideDur('가'.repeat(80), 'WHAT') <= 7); assert.equal(SH.slideDur('', 'CTA'), 3.2);
const sc = { id: 'c1', title: '이유식 시작', guide: { title: 'x' }, checkedAt: '2026-10-10T00:00:00Z', caption: '캡션', hashtags: ['육아', '이유식'], sources: [{ name: '질병관리청 · 안내', url: 'https://www.kdca.go.kr/x' }], cards: [{ type: 'HOOK', title: '이유식\n언제?' }, { type: 'WHAT', title: '결론', body: '몇 개월부터' }, { type: 'CTA', title: '저장' }] };
const sp = SH.buildSlideProject(sc, { handle: '@h' });
assert.equal(sp.kind, 'slides'); assert.equal(sp.slides.length, 3); assert.equal(SH.totalLen(sp), sp.slides.reduce((a, x) => a + x.dur, 0));
assert.ok(sp.captions.youtube.title.endsWith('#Shorts') && sp.captions.youtube.description.includes('아기마다 달라요') && sp.captions.youtube.description.includes('질병관리청'));
assert.equal(sp.captions.instagram.text, '캡션'); assert.ok(sp.captions.naver.title.length <= 30);
sp.slides[1].on = false; assert.equal(SH.totalLen(sp), sp.slides[0].dur + sp.slides[2].dur);
console.log('profile selftest OK');
