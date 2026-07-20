const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const fileUrl = 'file:///' + path.resolve('..', 'index.html').replace(/\\/g, '/');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(fileUrl);
  // Site normally gates rendering behind a video-intro tap; invoke the
  // calendar module directly to verify its output, bypassing that gate.
  await page.waitForFunction(() => typeof CalendarGenerator !== 'undefined');
  await page.evaluate(() => {
    const loader = document.getElementById('loader');
    if (loader) loader.remove();
    const gate = document.getElementById('video-gate');
    if (gate) gate.remove();
    document.getElementById('main').hidden = false;
    document.getElementById('main').classList.add('is-revealed');
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
    CalendarGenerator.init();
  });
  await page.waitForSelector('#calendar-grid span');

  const headerText = await page.textContent('.calendar__header');
  const weekdays = await page.$$eval('#calendar-weekdays span', (els) => els.map((e) => e.textContent));
  const targetDay = await page.$eval('.calendar__grid > span.is-target', (e) => e.textContent);
  const targetIndex = await page.$$eval('#calendar-grid > span', (els) => {
    const idx = els.findIndex((e) => e.classList.contains('is-target'));
    return idx % 7; // 0 = Sunday column
  });

  console.log('header:', headerText);
  console.log('weekdays:', JSON.stringify(weekdays));
  console.log('target day text:', targetDay);
  console.log('target column index (0=Sun):', targetIndex);
  console.log('console/page errors:', JSON.stringify(errors));

  await page.waitForTimeout(3500); // let font-display:block fallback swap in

  const dump = await page.evaluate(() => {
    const grid = document.getElementById('calendar-grid');
    const header = document.querySelector('.calendar__header');
    return {
      headerNow: header.textContent,
      childCount: grid.children.length,
      cells: Array.from(grid.children).map((c) => c.textContent),
    };
  });
  console.log('LIVE DUMP:', JSON.stringify(dump));

  const style = await page.$eval('.calendar__grid > span.is-target', (e) => {
    const cs = getComputedStyle(e);
    return { color: cs.color, opacity: cs.opacity, fontSize: cs.fontSize };
  });
  console.log('target style:', JSON.stringify(style));

  const el = await page.$('.calendar');
  await el.screenshot({ path: 'calendar-screenshot.png' });

  await browser.close();
})();
