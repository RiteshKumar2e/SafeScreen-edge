// Renders public/og.png (1200x630) from the landing hero. Run after a build:
//   node scripts/og.mjs
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const b = await chromium.launch({ channel: 'chrome' });
try {
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: '.site-header,.trust,.hero-copy .btn-row{display:none!important}.hero{padding-top:44px!important}' });
  await p.screenshot({ path: 'test-output/og-raw.png' });
} finally {
  await b.close();
  spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t']);
}
