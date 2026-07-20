const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const fileUrl = 'file:///' + path.resolve('..', 'index.html').replace(/\\/g, '/');

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  await page.goto(fileUrl);
  const initialUrl = page.url();

  console.log('Waiting for #video-gate__play...');
  await page.waitForSelector('#video-gate__play', { state: 'visible', timeout: 20000 });

  console.log('Clicking video-gate play button...');
  await page.click('#video-gate__play');

  console.log('Waiting for #main to be revealed (up to 15s)...');
  await page.waitForFunction(() => {
    const main = document.getElementById('main');
    if (!main) return false;
    if (main.hidden) return false;
    const cs = getComputedStyle(main);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }, { timeout: 15000 });
  console.log('#main revealed.');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  await page.waitForSelector('#ending-cta-btn', { state: 'visible', timeout: 10000 });

  const scrollYBeforeClick = await page.evaluate(() => window.scrollY);
  const urlBeforeClick = page.url();

  async function sampleAll(label) {
    const data = await page.evaluate(() => {
      const btn = document.getElementById('ending-cta-btn');
      const msg = document.getElementById('ending-message');
      const layer = document.getElementById('petal-burst-layer');
      const flowerCount = layer ? layer.querySelectorAll('.ending-flower').length : null;
      const petalCount = layer ? layer.querySelectorAll('.petal').length : null;
      return {
        btnClass: btn ? btn.className : null,
        btnHidden: btn ? btn.hasAttribute('hidden') : null,
        msgClass: msg ? msg.className : null,
        msgIsVisible: msg ? msg.classList.contains('is-visible') : null,
        layerChildCount: layer ? layer.childElementCount : null,
        flowerCount,
        petalCount,
      };
    });
    const now = await page.evaluate(() => performance.now());
    console.log(`[${label}]`, JSON.stringify(data));
    return { ...data, perfNow: now };
  }

  console.log('Clicking #ending-cta-btn...');
  const clickPerfStart = await page.evaluate(() => performance.now());
  await page.click('#ending-cta-btn');

  // Immediate synchronous check (same tick as click return)
  const syncData = await sampleAll('t~0ms (sync, right after click)');

  async function waitUntil(targetMs) {
    const now = await page.evaluate(() => performance.now());
    const elapsed = now - clickPerfStart;
    const waitMs = Math.max(0, targetMs - elapsed);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
  }

  await waitUntil(500);
  await sampleAll('t~500ms');

  await waitUntil(700);
  await sampleAll('t~700ms (btn should be hidden by now, ~600ms mark)');

  await waitUntil(2000);
  await sampleAll('t~2000ms');

  await waitUntil(4000);
  await sampleAll('t~4000ms');

  // Now poll every ~120ms from ~4200ms through 6500ms to precisely catch is-visible flip
  const pollResults = [];
  let flipTime = null;
  let prevVisible = null;
  while (true) {
    const now = await page.evaluate(() => performance.now());
    const elapsedMs = now - clickPerfStart;
    if (elapsedMs > 6500) break;
    const state = await page.evaluate(() => {
      const msg = document.getElementById('ending-message');
      const layer = document.getElementById('petal-burst-layer');
      return {
        isVisible: msg ? msg.classList.contains('is-visible') : null,
        layerChildCount: layer ? layer.childElementCount : null,
      };
    });
    pollResults.push({ elapsedMs: Math.round(elapsedMs), ...state });
    if (prevVisible === true && state.isVisible === false && flipTime === null) {
      flipTime = elapsedMs;
    }
    prevVisible = state.isVisible;
    await page.waitForTimeout(120);
  }

  console.log('--- POLL LOG (is-visible + layerChildCount on #ending-message / #petal-burst-layer) ---');
  console.log(JSON.stringify(pollResults));
  console.log('FLIP TIME (is-visible true->false), elapsed ms since click:', flipTime);

  await sampleAll('t~6500ms (final)');

  const finalScrollY = await page.evaluate(() => window.scrollY);
  const finalUrl = page.url();

  console.log('--- SUMMARY ---');
  console.log('initialUrl:', initialUrl);
  console.log('urlBeforeClick:', urlBeforeClick);
  console.log('finalUrl:', finalUrl);
  console.log('scrollYBeforeClick:', scrollYBeforeClick, 'finalScrollY:', finalScrollY);
  console.log('scroll unchanged:', scrollYBeforeClick === finalScrollY);
  console.log('url unchanged:', urlBeforeClick === finalUrl);
  console.log('JS errors observed:', JSON.stringify(errors));

  await browser.close();
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
