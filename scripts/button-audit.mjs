// Dev helper: measures every button-like control on every page and state.
// Flags small touch targets, clipped/wrapped labels and inconsistent heights.
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4183;
const BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const browser = await chromium.launch({ channel: 'chrome' });

const STATES = [
  ['/', null],
  ['/product', null],
  ['/product', async (p) => {
    await p.getByRole('button', { name: /Developer error/ }).click();
  }],
  ['/product', async (p) => {
    await p.getByRole('button', { name: /Developer error/ }).click();
    await p.getByRole('button', { name: 'Select region' }).click();
  }],
  ['/demo', async (p) => {
    await p.getByRole('button', { name: /Complex technical log/ }).click();
    await p.getByRole('button', { name: 'Analyze', exact: true }).click();
    await p.getByText('Analysis complete.').waitFor();
    await p.getByRole('button', { name: 'Explain further' }).click();
  }],
  ['/how-it-works', null],
  ['/privacy', null],
  ['/terms', null],
  ['/nope', null],
];

const issues = [];
const inventory = new Map();
try {
  for (const vp of [{ width: 375, height: 800, name: 'mobile' }, { width: 768, height: 1000, name: 'tablet' }, { width: 1440, height: 900, name: 'desktop' }]) {
    for (const [url, act] of STATES) {
      const page = await (await browser.newContext({ viewport: vp })).newPage();
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      if (act) await act(page);
      if (vp.name === 'mobile') await page.locator('.menu-toggle').click();
      const data = await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, a.btn, .scenario-btn, .mode-option, .tabs button, .nav-mobile a, .nav-desktop a, summary')];
        return els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('.visually-hidden');
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
            const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
            return {
              label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
              cls: el.className,
              tag: el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              font: cs.fontSize,
              clipped: el.scrollWidth > el.clientWidth + 1,
              wrapped: el.matches('.btn, .tabs button') && getComputedStyle(el).flexDirection !== 'column' && r.height - padV > lineH * 1.6,
              offscreen: r.right > window.innerWidth + 1 || r.left < -1,
              group: el.parentElement?.className || el.parentElement?.tagName,
            };
          });
      });
      const bigIcons = await page.evaluate(() =>
        [...document.querySelectorAll('svg.icon')]
          .map((svg) => svg.getBoundingClientRect())
          .filter((r) => r.width > 28 || r.height > 28)
          .map((r) => Math.round(r.width) + 'x' + Math.round(r.height)),
      );
      for (const size of bigIcons) issues.push('OVERSIZED ICON ' + size + ': ' + vp.name + ' ' + url);
      for (const b of data) {
        const key = `${vp.name} ${url}${act ? '*' : ''}`;
        const id = `${key} "${b.label}" (${b.tag}.${b.cls})`;
        if (!inventory.has(b.cls)) inventory.set(b.cls, new Set());
        inventory.get(b.cls).add(`${b.h}px/${b.font}`);
        const isInline = b.tag === 'summary' || (b.tag === 'a' && !String(b.cls).includes('btn') && !b.group?.includes?.('nav'));
        const minTarget = vp.name === 'desktop' ? 32 : 40;
        if (!isInline && b.h < minTarget) issues.push(`SMALL ${b.h}px tall: ${id}`);
        if (b.clipped) issues.push(`CLIPPED: ${id} (${b.w}px wide)`);
        if (b.wrapped) issues.push(`WRAPPED label: ${id} (${b.w}x${b.h})`);
        if (b.offscreen) issues.push(`OFFSCREEN: ${id}`);
      }
      await page.context().close();
    }
  }
} finally {
  await browser.close();
  spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t']);
}
console.log('--- sizes by class ---');
for (const [cls, sizes] of inventory) console.log(`${cls || '(none)'}: ${[...sizes].join(', ')}`);
console.log(`--- ${issues.length} issues ---`);
console.log([...new Set(issues)].join('\n'));
