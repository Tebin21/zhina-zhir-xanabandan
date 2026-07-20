const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 1400 } });
  const fileUrl = 'file:///' + path.resolve('..', 'index.html').replace(/\\/g, '/');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(fileUrl);
  await page.waitForFunction(() => typeof CalendarGenerator !== 'undefined');
  await page.evaluate(() => {
    const loader = document.getElementById('loader');
    if (loader) loader.remove();
    const gate = document.getElementById('video-gate');
    if (gate) gate.remove();
    document.getElementById('main').hidden = false;
    document.getElementById('main').classList.add('is-revealed');
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
  });
  await page.waitForSelector('#timeline');
  console.log('console/page errors:', JSON.stringify(errors));

  const el = await page.$('#timeline');
  await el.screenshot({ path: 'timeline-screenshot.png' });

  await browser.close();
})();
