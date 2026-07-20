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

  // Instrument fully in-page. T0 is captured by a CAPTURING-phase click
  // listener on the button itself -- i.e. the real moment the click event
  // reaches it -- not the moment Playwright's click() call was issued
  // (which can lag behind by up to ~1s due to actionability waits).
  await page.evaluate(() => {
    window.__log = [];
    window.__t0 = null;
    const msg = document.getElementById('ending-message');
    const layer = document.getElementById('petal-burst-layer');
    const btn = document.getElementById('ending-cta-btn');

    const record = (label) => {
      window.__log.push({
        label,
        t: window.__t0 === null ? null : performance.now() - window.__t0,
        msgIsVisible: msg.classList.contains('is-visible'),
        btnHidden: btn.hasAttribute('hidden'),
        btnClass: btn.className,
        layerChildCount: layer.childElementCount,
        flowerCount: layer.querySelectorAll('.ending-flower').length,
        petalCount: layer.querySelectorAll('.petal').length,
        scrollY: window.scrollY,
        docHeight: document.body.scrollHeight,
      });
    };

    // Capturing listener fires BEFORE the app's own click listener (which is
    // added later, in bubble phase) -- this establishes t=0 at the true
    // click-event dispatch time, prior to any app logic running.
    btn.addEventListener('click', () => {
      window.__t0 = performance.now();
      record('CLICK(capture, t0)');
    }, { capture: true });

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') record('MUTATION:' + m.target.id + '.class');
      }
    });
    mo.observe(msg, { attributes: true });
    mo.observe(btn, { attributes: true });

    let ticks = 0;
    const iv = setInterval(() => {
      record('tick');
      ticks++;
      if (ticks > 70) clearInterval(iv);
    }, 100);

    window.__record = record;
  });

  console.log('Clicking #ending-cta-btn...');
  await page.click('#ending-cta-btn');

  await page.waitForTimeout(7200);

  const log = await page.evaluate(() => window.__log);
  const finalScrollY = await page.evaluate(() => window.scrollY);
  const finalUrl = page.url();

  console.log('--- FULL IN-PAGE LOG (t relative to true click-event dispatch) ---');
  for (const entry of log) {
    const tStr = entry.t === null ? 'null' : entry.t.toFixed(1);
    console.log(`t=${tStr}ms [${entry.label}] msgVisible=${entry.msgIsVisible} btnHidden=${entry.btnHidden} btnClass="${entry.btnClass}" layerChildren=${entry.layerChildCount} (flowers=${entry.flowerCount}, petals=${entry.petalCount}) scrollY=${entry.scrollY} docHeight=${entry.docHeight}`);
  }

  let flipEntry = null, prevVisible = null;
  for (const entry of log) {
    if (prevVisible === true && entry.msgIsVisible === false && flipEntry === null) flipEntry = entry;
    prevVisible = entry.msgIsVisible;
  }
  console.log('FLIP (is-visible true->false) at t=', flipEntry ? flipEntry.t.toFixed(1) + 'ms' : 'NOT FOUND', flipEntry ? '[' + flipEntry.label + ']' : '');

  let hiddenEntry = null, prevHidden = null;
  for (const entry of log) {
    if (prevHidden === false && entry.btnHidden === true && hiddenEntry === null) hiddenEntry = entry;
    prevHidden = entry.btnHidden;
  }
  console.log('BTN HIDDEN at t=', hiddenEntry ? hiddenEntry.t.toFixed(1) + 'ms' : 'NOT FOUND');

  // Peak / trend of layerChildCount over time
  const nonNull = log.filter(e => e.t !== null);
  const t500 = nonNull.reduce((a,b) => Math.abs(a.t-500) < Math.abs(b.t-500) ? a : b);
  const t2000 = nonNull.reduce((a,b) => Math.abs(a.t-2000) < Math.abs(b.t-2000) ? a : b);
  const t4000 = nonNull.reduce((a,b) => Math.abs(a.t-4000) < Math.abs(b.t-4000) ? a : b);
  console.log('Sample @~500ms:', JSON.stringify(t500));
  console.log('Sample @~2000ms:', JSON.stringify(t2000));
  console.log('Sample @~4000ms:', JSON.stringify(t4000));

  console.log('--- SUMMARY ---');
  console.log('urlBeforeClick:', urlBeforeClick, 'finalUrl:', finalUrl, 'url unchanged:', urlBeforeClick === finalUrl);
  console.log('scrollYBeforeClick:', scrollYBeforeClick, 'finalScrollY:', finalScrollY, 'scroll unchanged:', scrollYBeforeClick === finalScrollY);
  console.log('JS errors observed:', JSON.stringify(errors, null, 2));

  await browser.close();
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
