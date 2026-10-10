// 브라우저 통합 테스트 공통 도구: 정적 서버 · 브라우저 · 외부 주소 처리 · AI 응답 모의
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };

export async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw new Error('nf');
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

export async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`${r.status()} ${r.url()}`); });
  page.on('dialog', (d) => d.accept());
  // 뉴스는 고정 데이터로
  await page.route(/data\/news\.json/, async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: await readFile(join(ROOT, 'scripts/e2e/fixtures/news.json')) }));
  // 외부 접속이 막힌 환경(E2E_OFFLINE=1): CDN 글꼴은 비우거나 로컬 파일로, 구글 글꼴은 curl로 받아 온다
  if (process.env.E2E_OFFLINE) {
    const pv = process.env.E2E_PRETENDARD ? await readFile(process.env.E2E_PRETENDARD) : null;
    await page.route(/cdn\.jsdelivr\.net/, (r) => {
      const u = r.request().url();
      if (pv && u.includes('pretendardvariable') && u.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: "@font-face{font-family:'Pretendard Variable';font-weight:45 920;src:url('https://cdn.jsdelivr.net/__pv.woff2') format('woff2');}" });
      if (pv && u.endsWith('__pv.woff2')) return r.fulfill({ status: 200, contentType: 'font/woff2', body: pv, headers: { 'access-control-allow-origin': '*' } });
      return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => {
      const u = r.request().url();
      try { r.fulfill({ status: 200, contentType: u.includes('gstatic') ? 'font/woff2' : 'text/css', headers: { 'access-control-allow-origin': '*' }, body: execFileSync('curl', ['-sS', '-m', '20', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }) }); } catch { r.fulfill({ status: 404, body: '' }); }
    });
  }
  return { browser, context, page, errors };
}

// Claude API 응답을 모의한다 (실제 AI 호출 없이 화면 흐름을 확인)
export async function mockClaude(page, payload) {
  const seen = [];
  await page.route('https://api.anthropic.com/**', async (r) => {
    try { seen.push(JSON.parse(r.request().postData())); } catch { /* 무시 */ }
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }], stop_reason: 'end_turn' }) });
  });
  return seen;
}
export const setKeys = (page, base) => page.goto(base + '#/dashboard').then(() => page.evaluate(() => localStorage.setItem('moa.keys', JSON.stringify({ claude: 'test-key' }))));
export const switchProfile = async (page, id) => { await page.selectOption('#ps-sel', id); await page.waitForTimeout(900); };
export const shot = async (page, sel, file) => { const { writeFileSync } = await import('node:fs'); const u = await page.$eval(sel, (c) => c.toDataURL('image/png')); writeFileSync(file, Buffer.from(u.split(',')[1], 'base64')); };
