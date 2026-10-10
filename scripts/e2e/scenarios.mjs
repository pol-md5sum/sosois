// 브라우저 통합 테스트 시나리오. 실행: node scripts/e2e/run.mjs [이름…]
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mockClaude, setKeys, switchProfile, shot } from './harness.mjs';

const EMPTY_CMP = { leftTitle: '', left: '', rightTitle: '', right: '' };
const card = (o) => ({ title: '', body: '', highlight: '', items: [], number: '', numberLabel: '', compare: EMPTY_CMP, layout: 'auto', pose: 'curious', moaSays: '', kind: 'none', specs: [], emoji: '', ...o });
// 테스트용 가짜 AI 응답 (의학 내용이 아니라 자리표시 문장)
export const GUIDE_PAYLOAD = {
  title: '이유식, 언제 시작하면 될까요?', category: 'PARENTING', hook: '이유식 언제부터?', moaComment: '', cta: '저장해 두세요',
  cards: [
    card({ type: 'HOOK', title: '이유식,\n언제 시작할까?', highlight: '언제', layout: 'big', moaSays: '궁금했지?' }),
    card({ type: 'WHAT', title: '출처 기준 한 줄 결론(테스트)', body: '아기마다 달라서 상담이 필요해요', layout: 'answer' }),
    card({ type: 'WHY', title: '왜 그럴까요?', body: '테스트용 설명 문장이에요.', layout: 'text' }),
    card({ type: 'STEP', title: '이렇게 시작해요', body: '테스트용 방법 설명이에요.', layout: 'text' }),
    card({ type: 'STEP', title: '처음엔 이렇게', items: ['첫째 항목', '둘째 항목', '셋째 항목'], layout: 'list' }),
    card({ type: 'LIFE/CHECK', title: '이럴 땐 상담!', items: ['걱정될 때', '평소와 다를 때', '헷갈릴 때'], kind: 'checklist', layout: 'list' }),
    card({ type: 'CTA', title: '저장해 두세요', layout: 'cta' }),
  ],
  caption: '이유식 언제 시작할까요? 👶\n테스트용 캡션이에요.\n\n📌 저장해 두기\n🧸 @happyhappy 팔로우하고 육아·살림 꿀정보 받기',
  hashtags: ['육아', '육아정보', '이유식'],
  sources: [{ name: '질병관리청 · 영유아 안내(테스트)', url: 'https://www.kdca.go.kr/test' }, { name: '대한소아청소년과학회 · 이유식(테스트)', url: 'https://www.kps.or.kr/test' }],
  factNotes: [],
};

export const scenarios = {
  // 계정별 주제·메뉴
  async accounts({ page, base, log }) {
    await page.goto(base + '#/dashboard'); await page.waitForTimeout(800);
    log.moaTopics = await page.$$eval('.topic-grid .topic b', (b) => b.map((x) => x.textContent));
    assert.ok(log.moaTopics.includes('오늘의 뉴스') && !log.moaTopics.includes('육아'));
    assert.equal(await page.$eval('#nav-care', (e) => e.hidden), true, 'MOA 계정에는 육아정보 메뉴가 없어야 함');
    await switchProfile(page, 'happy');
    log.happyTopics = await page.$$eval('.topic-grid .topic b', (b) => b.map((x) => x.textContent));
    assert.deepEqual(log.happyTopics, ['육아', '아기·유아용품', '생활용품', '생활템', '아기랑 나들이']);
    assert.equal(await page.$eval('#nav-care', (e) => e.hidden), false);
    await page.goto(base + '#/intro'); await page.waitForURL(/#\/editor\//); await page.waitForTimeout(1500);
    assert.ok(!(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('moa.contents'))[0]).includes('모아'))), '해피해피 첫 게시물에 모아가 없어야 함');
    await page.goto(base + '#/dashboard'); await page.waitForTimeout(500); // (열린 해피해피 콘텐츠가 계정을 되돌리지 않게)
    await switchProfile(page, 'moa');
    await page.goto(base + '#/care'); await page.waitForTimeout(800);
    assert.match(page.url(), /#\/dashboard/, 'MOA 계정은 육아정보 화면에서 대시보드로 돌아가야 함');
  },

  // 오늘의 육아정보: 주제 → 카드뉴스 → 점검 → AI 숏폼
  async care({ page, base, out, log }) {
    await setKeys(page, base);
    const seen = await mockClaude(page, GUIDE_PAYLOAD);
    await page.goto(base + '#/dashboard'); await switchProfile(page, 'happy');
    await page.goto(base + '#/care'); await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, 'care_view_guide.png') });
    log.topicCards = await page.$$eval('.care-topic', (a) => a.length);
    assert.ok(log.topicCards >= 16, '기본 주제 16개 + 이번 주 추천');
    // 소식 탭: 공식 배지
    await page.click('#care-tabs [data-tab="news"]'); await page.waitForTimeout(500);
    assert.ok((await page.$$eval('#care-body .chip', (c) => c.filter((x) => x.textContent.includes('공식')).length)) >= 1, '공식 발표 기사 배지');
    await page.screenshot({ path: join(out, 'care_view_news.png') });
    // 가이드 탭에서 첫 주제를 카드뉴스로
    await page.click('#care-tabs [data-tab="guide"]'); await page.waitForTimeout(400);
    await page.click('[data-cn="seed-solid-start"]'); await page.waitForURL(/#\/editor\//, { timeout: 30000 }); await page.waitForTimeout(2500);
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('moa.contents'))[0]);
    log.guide = c.guide;
    assert.equal(c.category, 'PARENTING'); assert.equal(c.recipe, 'info_check'); assert.equal(c.guide.topicId, 'seed-solid-start');
    assert.ok(c.caption.includes('아기마다 달라요') && c.caption.includes('📚 근거'), '면책·근거 자동 삽입');
    assert.ok(!c.caption.includes('📰 원문 기사'), '육아 정보에는 원문 기사 블록을 넣지 않음');
    assert.match(c.cards.at(-1).body, /출처: 질병관리청/);
    const sent = JSON.stringify(seen.at(-1));
    assert.ok(sent.includes('출처에 적힌 것만') && sent.includes('web_search'), '웹 검색과 육아 정보 원칙이 AI에 전달됨');
    // 카드 렌더링 확인용 이미지
    for (const i of [0, 1, 4, 5]) { await page.click(`#thumbs button[data-i="${i}"]`); await page.waitForTimeout(800); await shot(page, '#stage', join(out, `care_card${i + 1}.png`)); }
    // 점검 패널
    assert.equal(await page.$$eval('#guide-panel li', (l) => l.filter((x) => x.textContent.includes('공공기관') || x.textContent.includes('학회')).length), 2);
    assert.match(await page.$eval('#guide-chip', (e) => e.textContent), /점검 필요/);
    for (const k of ['age', 'nums', 'src']) await page.check(`#rv-${k}`);
    assert.match(await page.$eval('#guide-chip', (e) => e.textContent), /발행 준비 완료/);
    // 주제 상태가 '제작함'으로
    const topic = await page.evaluate(() => JSON.parse(localStorage.getItem('moa.careTopics.happy')).find((t) => t.id === 'seed-solid-start'));
    assert.equal(topic.status, 'done');
    // AI 숏폼
    await page.click('#e-short'); await page.waitForURL(/#\/shorts\//, { timeout: 20000 });
    await page.waitForSelector('#sl-list [data-dur]', { timeout: 60000 }); await page.waitForTimeout(800);
    const rows = await page.$$eval('#sl-list [data-dur]', (e) => e.length);
    assert.equal(rows, c.cards.length);
    await shot(page, '#sh-stage', join(out, 'care_short_preview.png'));
    assert.match(await page.$eval('#sl-script', (t) => t.value), /^1\. /);
    await page.click('#cap-tabs [data-cap="youtube"]');
    const yt = await page.$eval('#cp-desc', (t) => t.value);
    assert.ok(yt.includes('아기마다 달라요') && yt.includes('질병관리청'), '유튜브 설명에 면책·출처');
    // 시간을 줄여 녹화 시간을 아낀다
    for (const el of await page.$$('#sl-list [data-dur]')) { await el.fill('1'); }
    const [video] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#ex-video')]);
    log.video = video.suggestedFilename(); await video.saveAs(join(out, `care_short.${log.video.split('.').pop()}`));
    const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#ex-zip')]);
    await zip.saveAs(join(out, 'care_upload.zip'));
    // 내 주제함: 추가
    await page.goto(base + '#/care'); await page.waitForTimeout(600);
    await page.click('#care-tabs [data-tab="mine"]'); await page.waitForTimeout(300);
    await page.fill('#ct-title', '아기 낮잠, 하루에 몇 번?'); await page.click('#ct-add'); await page.waitForTimeout(400);
    assert.ok((await page.$eval('#care-body', (b) => b.textContent)).includes('아기 낮잠'));
    assert.ok((await page.$eval('#care-body', (b) => b.textContent)).includes('이유식, 언제 시작하면 될까요?'), '만든 육아 정보 목록');
  },

  // 해피해피 카드 형식(소프트 디자인)
  async happyCards({ page, base, out, log }) {
    await page.goto(base + '#/dashboard'); await switchProfile(page, 'happy');
    for (const [cat, key] of [['OUTING', 'place'], ['ITEM', 'item'], ['PARENTING', 'guide']]) {
      await page.goto(base + `#/topics/${cat}`); await page.waitForTimeout(900);
      await page.click('#t-one'); await page.waitForURL(/#\/editor\//, { timeout: 20000 }); await page.waitForTimeout(2000);
      const n = await page.$$eval('#thumbs button', (b) => b.length);
      log[`${key}Cards`] = n; assert.ok(n >= 5);
      assert.equal(await page.$eval('#e-theme', (s) => s.value), 'soft');
      for (let i = 0; i < n; i++) { await page.click(`#thumbs button[data-i="${i}"]`); await page.waitForTimeout(500); }
      await shot(page, '#stage', join(out, `${key}_last.png`));
    }
    // 장 삭제
    const before = await page.$$eval('#thumbs button', (b) => b.length);
    await page.click('#thumbs button[data-i="2"]'); await page.click('#sl-del'); await page.waitForTimeout(2000);
    assert.equal(await page.$$eval('#thumbs button', (b) => b.length), before - 1);
  },

  // 다녀왔어요: 내 사진으로 카드뉴스, 숏폼 컨셉, 캐릭터 끄기
  async visit({ page, base, out, media, log }) {
    await page.goto(base + '#/dashboard'); await switchProfile(page, 'happy');
    await page.goto(base + '#/create'); await page.waitForTimeout(1000);
    await page.setInputFiles('#v-files', [join(media, 'photo.png'), join(media, 'photo2.png'), join(media, 'photo.png')]); await page.waitForTimeout(2000);
    await page.fill('#v-place', '키즈랜드 판교점'); await page.fill('#v-fee', '아이 2시간 18,000원');
    await page.fill('#v-memo', '평일 오전이라 한산했음. 볼풀이 엄청 큼. 수유실 깨끗함.');
    await page.click('#v-tpl'); await page.waitForURL(/#\/editor\//, { timeout: 20000 }); await page.waitForTimeout(2500);
    log.cards = await page.$$eval('#thumbs button', (b) => b.length); assert.ok(log.cards >= 6);
    await shot(page, '#stage', join(out, 'visit_cover.png'));
    await page.selectOption('#e-char', 'off'); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('moa.contents'))[0].showChar), false);
    await page.goto(base + '#/shorts'); await page.waitForTimeout(400);
    await page.setInputFiles('#sh-files', [join(media, 'v1.webm'), join(media, 'v2.webm')]);
    await page.waitForURL(/#\/shorts\//, { timeout: 20000 }); await page.waitForTimeout(1500);
    await page.selectOption('#sh-concept', 'visit'); await page.fill('[data-v="place"]', '키즈랜드 판교점');
    await page.fill('#sh-desc', '평일 오전이라 한산했음. 볼풀이 엄청 큼.'); await page.click('#sh-tpl');
    await page.waitForFunction(() => document.querySelectorAll('.sub-row').length >= 3, null, { timeout: 20000 });
    assert.ok((await page.$$eval('.sub-row textarea', (t) => t.map((x) => x.value))).some((x) => x.includes('키즈랜드')));
  },

  // 영상 클립 숏폼(자막·썸네일·캡컷 묶음)
  async shortsClips({ page, base, out, media, log }) {
    await page.goto(base + '#/shorts'); await page.waitForTimeout(500);
    await page.setInputFiles('#sh-files', [join(media, 'v1.webm'), join(media, 'v2.webm')]);
    await page.waitForURL(/#\/shorts\//, { timeout: 20000 }); await page.waitForTimeout(1500);
    await page.fill('#sh-desc', '성수동 카페 딸기라떼 리뷰. 크림이 엄청 두껍고 딸기가 통째로 들어감. 가격 6,500원.');
    await page.selectOption('#sh-target', '15'); await page.click('#sh-tpl');
    await page.waitForFunction(() => document.querySelectorAll('.sub-row').length >= 4, null, { timeout: 20000 });
    await page.click('#sh-auto'); await page.waitForTimeout(1200);
    const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#ex-capcut')]);
    await zip.saveAs(join(out, 'shorts_capcut.zip'));
    log.zip = zip.suggestedFilename();
  },
};
