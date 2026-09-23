import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4184, BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const b = await chromium.launch({ channel: 'chrome' });
const errors = [];
const shot = async (name, vp, url, dark, act) => {
  const ctx = await b.newContext({ viewport: vp, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  if (dark) await p.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  if (act) await act(p);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `test-output/rev-${name}.png`, fullPage: true });
  const ow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (ow) errors.push(`${name}: horizontal overflow`);
  await ctx.close();
};
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const demo = (id) => async (p) => { await p.goto(`${BASE}/app/live-analysis?scenario=${id}`, { waitUntil: 'networkidle' }); await p.evaluate(() => (document.documentElement.dataset.theme = 'dark')); await p.waitForSelector('.insight-title'); };
try {
  for (const [n, url, vp] of [['s-tech', '/technology', D], ['s-runtime', '/app/runtime', D], ['s-settings', '/app/settings', M]]) {
    const ctx = await b.newContext({ viewport: vp, reducedMotion: 'reduce' }); const p = await ctx.newPage();
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    if (url.includes('settings')) { const t0 = Date.now(); await p.getByText('Checking…').waitFor({ state: 'detached', timeout: 15000 }).catch(() => errors.push('settings: still Checking after 15s')); console.log('probe resolved in', Date.now() - t0, 'ms'); await p.locator('#about, section:has-text("Hardware information")').last().screenshot({ path: `test-output/${n}.png` }); }
    else if (url.includes('runtime')) await p.locator('.steps-list').screenshot({ path: `test-output/${n}.png` });
    else await p.locator('.stack').screenshot({ path: `test-output/${n}.png` });
    await ctx.close();
  }
} finally { await b.close(); server.kill(); spawn('taskkill', ['/pid', String(server.pid), '/t', '/f']); }
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exit(0);
