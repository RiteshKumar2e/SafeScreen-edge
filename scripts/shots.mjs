// Dev helper: viewport screenshots of key screens for visual review.
//   npm run build && node scripts/shots.mjs [filter]
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const PORT = 4182, BASE = `http://localhost:${PORT}`;
const only = process.argv[2];
mkdirSync('test-output', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const b = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
  const shot = async (name, vp, url, act, full = false) => {
    if (only && !name.includes(only)) return;
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    if (act) await act(p);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `test-output/shot-${name}.png`, fullPage: full });
    await ctx.close();
  };
  const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
  const runDemo = (id) => async (p) => {
    await p.goto(`${BASE}/app/live-analysis?scenario=${id}`, { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'AI Insights' }).waitFor();
    await p.waitForSelector('.insight-title');
  };
  await shot('home', D, '/', null, true);
  await shot('home-mobile', M, '/', null, true);
  await shot('overview', D, '/app/overview');
  await shot('live-dev', D, '/app/live-analysis', runDemo('developer-error'));
  await shot('live-login', D, '/app/live-analysis', runDemo('suspicious-login'));
  await shot('live-dash', D, '/app/live-analysis', runDemo('enterprise-dashboard'), true);
  await shot('live-empty', D, '/app/live-analysis');
  await shot('assistant', D, '/app/assistant', async (p) => {
    await runDemo('enterprise-dashboard')(p);
    await p.goto(`${BASE}/app/assistant`);
  });
  await shot('detections', D, '/app/detections');
  await shot('privacy-app', D, '/app/privacy', null, true);
  await shot('runtime', D, '/app/runtime', null, true);
  await shot('settings', D, '/app/settings', null, true);
  await shot('palette', D, '/app/overview', async (p) => p.keyboard.press('Control+k'));
  await shot('live-mobile', M, '/app/live-analysis', runDemo('suspicious-login'), true);
  await shot('technology', D, '/technology', null, true);
  await shot('product', D, '/product', null, true);
  await shot('privacy', D, '/privacy', null, true);
  await shot('usecases', D, '/use-cases', null, true);
  await shot('about', D, '/about', null, true);
  await shot('404', D, '/nope');
  await shot('menu-mobile', M, '/', async (p) => p.locator('.menu-toggle').click());
} finally {
  await b.close();
  spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t']);
  console.log(errors.length ? errors.join('\n') : 'no console errors');
}
