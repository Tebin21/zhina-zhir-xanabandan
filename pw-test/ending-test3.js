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

  await page.waitForSelector('#video-gate__play', { state: 'visible', timeout: 20000 });
  await page.click('#video-gate__play');

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

  // Install a fully in-page instrumentation harness BEFORE clicking, so all
  // timing is measured on the browser's own clock (no Playwright round-trip
  // noise). Uses MutationObserver for the class flip, and setInterval
  // (100ms) for periodic layer/btn snapshots -- all logged into a window array.
  await page.evaluate(() => {
    window.__log = [];
    window.__clickPerf = null;
    const msg = document.getElementById('ending-message');
    const layer = document.getElementById('petal-burst-layer');
    const btn = document.getElementById('ending-cta-btn');

    const record = (label) => {
      window.__log.push({
        label,
        t: performance.now() - (window.__clickPerf || 0),
        msgIsVisible: msg.classList.contains('is-visible'),
        btnHidden: btn.hasAttribute('hidden'),
        btnClass: btn.className,
        layerChildCount: layer.childElementCount,
        flowerCount: layer.querySelectorAll('.ending-flower').length,
        petalCount: layer.querySelectorAll('.petal').length,
      });
    };

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') record('MUTATION:' + m.target.id + '.class');
      }
    });
    mo.observe(msg, { attributes: true });
    mo.observe(btn, { attributes: true });

    // periodic snapshot every 100ms for 7s
    let ticks = 0;
    const iv = setInterval(() => {
      record('tick');
      ticks++;
      if (ticks > 70) clearInterval(iv);
    }, 100);

    window.__record = record;
  });

  console.log('Clicking #ending-cta-btn...');
  await page.evaluate(() => { window.__clickPerf = performance.now(); window.__record('CLICK'); });
  await page.click('#ending-cta-btn');

  // Passive wait -- let the page run entirely on its own, no interference.
  await page.waitForTimeout(7200);

  const log = await page.evaluate(() => window.__log);
  const finalScrollY = await page.evaluate(() => window.scrollY);
  const finalUrl = page.url();

  console.log('--- FULL IN-PAGE LOG ---');
  for (const entry of log) {
    console.log(`t=${entry.t.toFixed(0)}ms [${entry.label}] msgVisible=${entry.msgIsVisible} btnHidden=${entry.btnHidden} btnClass="${entry.btnClass}" layerChildren=${entry.layerChildCount} (flowers=${entry.flowerCount}, petals=${entry.petalCount})`);
  }

  // find flip
  let flipEntry = null;
  let prevVisible = null;
  for (const entry of log) {
    if (prevVisible === true && entry.msgIsVisible === false && flipEntry === null) flipEntry = entry;
    prevVisible = entry.msgIsVisible;
  }
  console.log('FLIP (is-visible true->false) at t=', flipEntry ? flipEntry.t.toFixed(1) + 'ms' : 'NOT FOUND', flipEntry ? '[' + flipEntry.label + ']' : '');

  // find btn hidden transition
  let hiddenEntry = null;
  let prevHidden = null;
  for (const entry of log) {
    if (prevHidden === false && entry.btnHidden === true && hiddenEntry === null) hiddenEntry = entry;
    prevHidden = entry.btnHidden;
  }
  console.log('BTN HIDDEN at t=', hiddenEntry ? hiddenEntry.t.toFixed(1) + 'ms' : 'NOT FOUND');

  console.log('--- SUMMARY ---');
  console.log('urlBeforeClick:', urlBeforeClick, 'finalUrl:', finalUrl, 'url unchanged:', urlBeforeClick === finalUrl);
  console.log('scrollYBeforeClick:', scrollYBeforeClick, 'finalScrollY:', finalScrollY, 'scroll unchanged:', scrollYBeforeClick === finalScrollY);
  console.log('JS errors observed:', JSON.stringify(errors, null, 2));

  await browser.close();
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
