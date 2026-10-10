// 브라우저 통합 테스트 실행기
//   node scripts/e2e/make-media.mjs          (처음 한 번, ffmpeg 필요)
//   node scripts/e2e/run.mjs                 (전체)   node scripts/e2e/run.mjs care visit
//   PLAYWRIGHT_MODULE=… E2E_OFFLINE=1 …      (외부 접속이 막힌 환경)
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from './harness.mjs';
import { scenarios } from './scenarios.mjs';

const here = resolve(dirname(fileURLToPath(import.meta.url)));
const media = join(here, '.media');
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios);
const server = await startServer();
let failed = 0;
for (const name of names) {
  const fn = scenarios[name];
  if (!fn) { console.error(`없는 시나리오: ${name} (${Object.keys(scenarios).join(', ')})`); failed++; continue; }
  const out = join(here, 'out', name); mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await launch();
  const log = {};
  const t0 = Date.now();
  try {
    await fn({ page, base: server.url, out, media, log });
    if (errors.length) throw new Error(`브라우저 오류 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);
    console.log(`✅ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}초)`, JSON.stringify(log));
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e.message}`);
    await page.screenshot({ path: join(out, 'FAIL.png') }).catch(() => {});
  }
  await browser.close();
}
server.close();
process.exit(failed ? 1 : 0);
