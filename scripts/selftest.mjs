// 네트워크 없이 파서·점수·정규화를 점검한다: node scripts/selftest.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseRss, cluster, scoreCluster } from './fetch-news.mjs';
import { normalizeContent, templateContent, extractJson, heuristicScore, buildContentPrompt, CARD_TYPES } from '../js/ai.js';

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
console.log('selftest OK');
