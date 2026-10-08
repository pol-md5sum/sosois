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
