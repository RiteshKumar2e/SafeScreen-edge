// End-to-end checks against the production build, using the locally
// installed Chrome through playwright-core. Run `npm run build` first.
//   node scripts/e2e.mjs
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'test-output');
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });
const check = (cond, name, detail = '') => (cond ? pass(name, detail) : fail(name, detail));

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: process.platform === 'win32',
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ROUTES = ['/', '/product', '/technology', '/privacy', '/use-cases', '/about', '/terms', '/does-not-exist', '/app/overview', '/app/assistant', '/app/live-analysis', '/app/detections', '/app/activity', '/app/privacy', '/app/runtime', '/app/settings'];
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 800 },
  { name: 'tablet', width: 768, height: 1000 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function newPage(viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return { context, page, errors };
}

try {
  // 1. Every route at every viewport: overflow, title, description, console.
  const titles = new Set();
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      const { context, page, errors } = await newPage(vp);
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.content ?? '',
        h1: document.querySelectorAll('h1').length,
        favicon: !!document.querySelector('link[rel="icon"]'),
        imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
        overflowing: [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.cmd, pre, .table-wrap, .segmented, .keylines');
          })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      }));
      const label = `${vp.name} ${route}`;
      check(m.sw <= m.iw, `no horizontal scroll: ${label}`, `scrollWidth ${m.sw} vs ${m.iw} ${m.overflowing.join(', ')}`);
      check(m.title.includes('SafeScreen Edge') && m.desc.length > 50, `title + description: ${label}`, m.title);
      check(m.h1 === 1, `exactly one h1: ${label}`, String(m.h1));
      check(m.favicon && m.imgsNoAlt === 0, `favicon + img alt: ${label}`);
      check(errors.length === 0, `no console/network errors: ${label}`, errors.join(' | '));
      if (vp.name === 'desktop') titles.add(m.title);
      await page.screenshot({ path: join(OUT, `${vp.name}${route.replace(/\//g, '_') || '_home'}.png`), fullPage: true });
      await context.close();
    }
  }
  check(titles.size === ROUTES.length, 'page titles are unique', [...titles].join(' / '));

  // 2. Demo scenarios in Live Analysis.
  const insight = (page) => page.locator('.insight-card');
  const waitInsight = (page) => page.locator('.insight-card .insight-title').waitFor({ timeout: 60000 });
  {
    const { context, page, errors } = await newPage({ width: 1440, height: 900 });
    await page.goto(`${BASE}/app/live-analysis`, { waitUntil: 'networkidle' });
    check(await page.getByText('No detections yet.').isVisible(), 'live: empty state shown');
    const expect = {
      'Developer error': [/A Python module import failed/, /pip install pandas/, /Needs Attention/i],
      'Suspicious login': [/Potentially suspicious/, /secure-verify-login\.co/, /Review Required/i],
      'Security warning': [/administrator access|elevated/i, /Only continue if you recognize/],
      'Complex technical log': [/PostgreSQL/, /Technical Error Log/],
      'Complex dashboard': [/Screen understood/, /Update billing/, /Application Screen/],
    };
    for (const [name, res] of Object.entries(expect)) {
      await page.locator('.scenario-chips').getByRole('button', { name, exact: true }).click();
      await waitInsight(page);
      const t = await insight(page).innerText();
      check(res.every((r) => r.test(t)), `live: ${name} analysis`, t.slice(0, 160));
      check(!/\bscam\b|malicious site/i.test(t), `live: ${name} avoids fear language`);
      check((await page.locator('.region').count()) > 0, `live: ${name} draws regions`);
    }
    check(await page.getByText('Demo Simulation.').isVisible(), 'live: demo simulation labeled');
    for (const label of ['What I see', 'What it means', 'Why it matters', 'Recommended action', 'Confidence']) {
      check(await insight(page).getByRole('heading', { name: label }).isVisible(), `live: "${label}" section`);
    }
    await insight(page).getByRole('button', { name: 'Explain', exact: true }).click();
    check(await insight(page).getByRole('heading', { name: 'Evidence' }).isVisible(), 'live: Explain expands evidence');
    await page.goto(`${BASE}/app/detections`, { waitUntil: 'networkidle' });
    check((await page.locator('.tl-item').count()) >= 5, 'detections: timeline lists analyses');
    await page.locator('.tl-card > button').first().click();
    check(await page.getByText('Processing mode').isVisible(), 'detections: item expands with details');
    await page.goto(`${BASE}/app/activity`, { waitUntil: 'networkidle' });
    check((await page.locator('.log li').count()) >= 5, 'activity: audit log records analyses');
    check(errors.length === 0, 'demo flow: no console errors', errors.join(' | '));
    await context.close();
  }

  // 3. Real on-device OCR on an uploaded screenshot, under the production CSP.
  {
    const { context, page, errors } = await newPage({ width: 1440, height: 900 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/demo/enterprise-dashboard.svg`);
    const png = join(OUT, 'upload-dashboard.png');
    await page.screenshot({ path: png });
    await page.setViewportSize({ width: 1440, height: 900 });
    const ext = [];
    page.on('request', (r) => !r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && ext.push(r.url()));
    await page.goto(`${BASE}/app/live-analysis`, { waitUntil: 'networkidle' });
    const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '');
    check(/connect-src 'self'/.test(csp), 'csp: production build restricts connections', csp.slice(0, 80));
    check(await page.evaluate(() => crossOriginIsolated), 'aihub: page is cross-origin isolated (multithreaded WebAssembly)');
    await page.locator('input[type="file"]').setInputFiles(png);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    let started = Date.now();
    await page.locator('.insight-card .insight-title').waitFor({ timeout: 240000 });
    let t = await insight(page).innerText();
    const ocrStage = await page.evaluate(() => [...document.querySelectorAll('li, .stage')].map((e) => e.textContent).filter((x) => /Text recognition/.test(x) && x.length < 400).pop() ?? '');
    check(/Qualcomm AI Hub EasyOCR/.test(ocrStage), 'aihub: Qualcomm AI Hub EasyOCR ran in the browser', ocrStage.replace(/^.*?Done/, '').slice(0, 120));
    check(/Payment method declined/i.test(await page.locator('.recognized pre').textContent()), 'aihub: EasyOCR reads the uploaded dashboard', `${Date.now() - started} ms in headless Chrome`);
    check(/sent off device\s*None/i.test(t), 'ocr: provenance says nothing left the device');
    check((await page.locator('.region').count()) > 0, 'ocr: regions drawn from OCR positions');
    check(ext.length === 0, 'ocr: no third-party requests', ext.join(', '));
    await page.goto(`${BASE}/app/runtime`, { waitUntil: 'networkidle' });
    check(await page.getByText(/End to end: \d+ ms/).isVisible(), 'runtime: measured run appears');
    check(await page.getByText('EasyOCR detector (CRAFT)').isVisible(), 'runtime: measured AI Hub model time appears');

    // Tesseract stays available as the lighter engine.
    await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
    await page.locator('#ocr-engine').selectOption('tesseract');
    await page.goto(`${BASE}/app/live-analysis`, { waitUntil: 'networkidle' });
    await page.getByRole('radio', { name: 'Upload or paste' }).click();
    await page.locator('input[type="file"]').setInputFiles(png);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    started = Date.now();
    await waitInsight(page);
    t = await insight(page).innerText();
    check(/declined|billing/i.test(t), 'ocr: Tesseract engine reads the uploaded dashboard', `${Date.now() - started} ms in headless Chrome`);

    await page.goto(`${BASE}/app/live-analysis`, { waitUntil: 'networkidle' });
    await page.getByRole('radio', { name: 'Upload or paste' }).click();
    const bad = join(OUT, 'broken.png');
    writeFileSync(bad, 'not really an image');
    await page.locator('input[type="file"]').setInputFiles(bad);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.locator('.stage .state.error').waitFor({ timeout: 10000 });
    const errText = await page.locator('.stage .state.error').innerText();
    check(/could not be opened as an image/.test(errText) && !/at\s+\w+\s*\(/.test(errText), 'error: friendly message, no stack trace', errText);
    const txtFile = join(OUT, 'notes.txt');
    writeFileSync(txtFile, 'hello');
    await page.locator('input[type="file"]').setInputFiles(txtFile);
    check(await page.getByText('Not an image').isVisible(), 'error: non-image upload message');
    // Opening the raw SVG makes Chrome probe /favicon.ico; that 404 and its console line are not app requests.
    const probe = !errors.some((e) => e.startsWith('404 '));
    const unexpected = errors.filter((e) => !e.includes('favicon.ico') && !(probe && /Failed to load resource.*404/.test(e)));
    check(unexpected.length === 0, 'ocr flow: no unexpected console errors', unexpected.join(' | '));
    await context.close();
  }

  // 4. Assistant, command palette, privacy, presentation.
  {
    const { context, page, errors } = await newPage({ width: 1440, height: 900 });
    await page.goto(`${BASE}/app/assistant`, { waitUntil: 'networkidle' });
    check(await page.getByText('Load a screen to ask about it').isVisible(), 'assistant: empty state');
    await page.getByRole('button', { name: 'Try the complex dashboard' }).click();
    await page.getByRole('button', { name: 'What should I click?' }).click();
    const ans = await page.locator('.msg.bot').last().innerText();
    check(/Update billing/.test(ans), 'assistant: answers from the screen', ans.slice(0, 120));
    check((await page.locator('.region[data-active="true"]').count()) > 0, 'assistant: highlights the regions used');
    await page.getByLabel('Ask a question about this screen').fill('Summarize this page.');
    await page.keyboard.press('Enter');
    check(/Navigation: Dashboard/.test(await page.locator('.msg.bot').last().innerText()), 'assistant: typed question answered');

    await page.keyboard.press('Control+k');
    check(await page.getByRole('combobox', { name: 'Search commands' }).isVisible(), 'palette: Ctrl+K opens');
    await page.keyboard.type('privacy center');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app/privacy');
    check(true, 'palette: runs a command');
    check(await page.getByRole('switch', { name: 'Cloud fallback' }).isDisabled(), 'privacy: cloud fallback locked by local-only');
    await page.getByRole('switch', { name: 'Store screenshots' }).check();
    check(await page.getByRole('switch', { name: 'Store screenshots' }).isChecked(), 'privacy: toggles work');
    await page.getByRole('switch', { name: 'Store screenshots' }).uncheck();
    await page.getByRole('textbox', { name: 'Application', exact: true }).fill('Journal');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    check(await page.getByText('Exclusion added').isVisible(), 'privacy: success message on add');
    await page.getByRole('button', { name: 'Clear local history' }).click();
    check(await page.getByRole('dialog').isVisible(), 'privacy: clear asks for confirmation');
    await page.getByRole('dialog').getByRole('button', { name: 'Clear history' }).click();
    check(await page.getByText('Local history cleared').isVisible(), 'privacy: clear confirms');

    await page.getByRole('button', { name: 'Present' }).click();
    await page.getByRole('region', { name: 'Presentation mode' }).waitFor();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next step' }).click();
    await page.locator('.insight-title').waitFor();
    check(/Screen data sent off device: none/.test(await page.locator('.present-bar').innerText()), 'present: final step verifies local processing');
    await page.keyboard.press('Escape');
    check((await page.locator('.present-bar').count()) === 0, 'present: Escape exits');
    check(errors.length === 0, 'app flows: no console errors', errors.join(' | '));
    await context.close();
  }

  // 5. Mobile menu, 404, redirects, keyboard.
  {
    const { context, page } = await newPage({ width: 375, height: 800 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const toggle = page.getByRole('button', { name: 'Menu' });
    check(await toggle.isVisible(), 'mobile: menu button visible');
    await toggle.click();
    check((await page.locator('.menu-toggle').getAttribute('aria-expanded')) === 'true', 'mobile: aria-expanded true when open');
    await page.locator('#mobile-nav').getByRole('link', { name: 'Technology' }).click();
    await page.waitForURL('**/technology');
    const closed = await page.locator('#mobile-nav').waitFor({ state: 'hidden', timeout: 3000 }).then(() => true, () => false);
    check(closed, 'mobile: menu closes after navigation');
    await page.locator('.menu-toggle').click();
    await page.keyboard.press('Escape');
    check(!(await page.locator('#mobile-nav').isVisible()), 'mobile: Escape closes menu');
    await page.goto(`${BASE}/app/overview`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    check(await page.locator('.sidebar.open').isVisible(), 'mobile app: sidebar opens as drawer');

    await page.goto(`${BASE}/404`, { waitUntil: 'networkidle' });
    check(await page.getByText('Nothing on this screen.').isVisible(), '404: custom page at /404');
    await page.goto(`${BASE}/demo?scenario=suspicious-login`, { waitUntil: 'networkidle' });
    check(page.url().includes('/app/live-analysis'), 'redirect: /demo goes to the app');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    check((await page.evaluate(() => document.activeElement?.textContent)) === 'Skip to content', 'keyboard: first Tab reaches skip link');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check(outline !== 'none', 'keyboard: focused element has visible outline', outline);
    await context.close();
  }
  {
    const { context, page } = await newPage({ width: 1440, height: 900 }, { reducedMotion: 'reduce' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const tab = page.getByRole('tab', { name: /Developers/ });
    await tab.focus();
    await page.keyboard.press('ArrowDown');
    check((await page.getByRole('tab', { name: /Security/ }).getAttribute('aria-selected')) === 'true', 'landing: arrow keys move between use cases');
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.region') ?? document.body).animationDuration);
    check(parseFloat(anim) < 0.01, 'reduced motion: region animation disabled', anim);
    await context.close();
  }
} catch (err) {
  fail('e2e run crashed', String(err?.stack ?? err));
} finally {
  await browser.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t']);
  else server.kill();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && (!r.ok || r.name.includes('live OCR')) ? `  — ${r.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
