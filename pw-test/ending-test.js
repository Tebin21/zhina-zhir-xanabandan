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

  // Wait for the video-gate play button to exist and be visible.
  await page.waitForSelector('#video-gate__play', { state: 'visible', timeout: 20000 });

  const initialScrollY = await page.evaluate(() => window.scrollY);

  console.log('Clicking video-gate play button...');
  await page.click('#video-gate__play');

  // Wait (generously) for main to become visible / un-hidden.
  console.log('Waiting for #main to be revealed (up to 20s)...');
  await page.waitForFunction(() => {
    const main = document.getElementById('main');
    if (!main) return false;
    if (main.hidden) return false;
    const cs = getComputedStyle(main);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }, { timeout: 20000 }).catch(async (e) => {
    const state = await page.evaluate(() => {
      const main = document.getElementById('main');
      const gate = document.getElementById('video-gate');
      return {
        mainHidden: main ? main.hidden : 'no main',
        mainClass: main ? main.className : null,
        gateExists: !!gate,
        gateClass: gate ? gate.className : null,
      };
    });
    console.log('TIMEOUT waiting for main reveal. State:', JSON.stringify(state));
    throw e;
  });

  console.log('#main revealed.');

  // Scroll to bottom of the page.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  // Ensure the ending CTA button exists.
  await page.waitForSelector('#ending-cta-btn', { state: 'visible', timeout: 10000 });

  const scrollYBeforeClick = await page.evaluate(() => window.scrollY);
  const urlBeforeClick = page.url();

  async function sample(label, clickTime) {
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
        layerChildCount: layer ? layer.childElementCount : null,
        flowerCount,
        petalCount,
        scrollY: window.scrollY,
        url: location.href,
      };
    });
    data.actualElapsedMs = Date.now() - clickTime;
    console.log(`[${label}]`, JSON.stringify(data));
    return data;
  }

  console.log('Clicking #ending-cta-btn...');
  const clickTime = Date.now();
  await page.click('#ending-cta-btn');

  const results = {};
  results.t0 = await sample('t=0ms', clickTime);

  const targets = [1000, 3000, 5000, 6500, 8000, 10000];
  for (const target of targets) {
    const elapsed = Date.now() - clickTime;
    const waitMs = Math.max(0, target - elapsed);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    results['t' + target] = await sample(`t=${target}ms`, clickTime);
  }

  const finalScrollY = await page.evaluate(() => window.scrollY);
  const finalUrl = page.url();

  console.log('--- SUMMARY ---');
  console.log('initialUrl:', initialUrl);
  console.log('finalUrl:', finalUrl);
  console.log('scrollYBeforeClick:', scrollYBeforeClick, 'finalScrollY:', finalScrollY);
  console.log('urlBeforeClick === finalUrl:', urlBeforeClick === finalUrl);
  console.log('JS errors observed:', JSON.stringify(errors));

  await browser.close();
})();
