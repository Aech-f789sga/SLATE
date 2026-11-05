import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
  const n = { id: Date.now(), name: 'Strip', upd: Date.now(), pages: [mk('lined'), mk('lined'), mk('lined'), mk('lined')] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(400);

const snap = () =>
  page.evaluate(() => {
    const s = document.getElementById('stage');
    const st = document.getElementById('pstrip');
    const w = document.getElementById('wrap');
    const sheets = st ? [...st.children].map((e) => ({
      i: e.dataset.i ?? 'live',
      h: Math.round(e.getBoundingClientRect().height),
      cv: !!e.querySelector('canvas'),
    })) : [];
    return {
      flow: document.documentElement.dataset.flow || '(none)',
      pi: window.eval('pi'),
      strip: !!st,
      stripW: st ? Math.round(st.getBoundingClientRect().width) : 0,
      wrapW: Math.round(w.getBoundingClientRect().width),
      scrollTop: Math.round(s.scrollTop),
      scrollH: s.scrollHeight,
      sheets,
    };
  });

console.log('before  ', JSON.stringify(await snap()));

// turn it on through the bridge
await page.evaluate(() => window.__inkpad_pagestrip.set(true));
await page.waitForTimeout(900);
console.log('strip on', JSON.stringify(await snap()));

// scroll down to the third page
await page.evaluate(() => {
  const st = document.getElementById('pstrip');
  const third = st.children[2];
  const s = document.getElementById('stage');
  s.scrollTop = third.offsetTop - 8;
});
await page.waitForTimeout(900);
console.log('scrolled', JSON.stringify(await snap()));
await page.screenshot({ path: 'shots/strip.png' });

// draw a stroke on the page we are now looking at, then check where it landed
const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
});
await page.mouse.move(box.x - 90, box.y - 40);
await page.mouse.down();
await page.mouse.move(box.x + 90, box.y + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);

const landed = await page.evaluate(() => window.eval('nb.pages.map(p => p.strokes.length)'));
console.log('strokes per page', JSON.stringify(landed));

// page navigation buttons should scroll, not flip
await page.evaluate(() => document.getElementById('prev').click());
await page.waitForTimeout(700);
console.log('after prev', JSON.stringify(await snap()));

await page.evaluate(() => document.getElementById('next').click());
await page.waitForTimeout(700);
console.log('after next', JSON.stringify(await snap()));

// the card row
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(700);
const row = await page.evaluate(() => {
  const h = document.querySelector('#bar2 .pgm-flow');
  if (!h) return 'missing';
  return [...h.children].map((c) => c.textContent.trim()).filter(Boolean);
});
console.log('card row', JSON.stringify(row));
const flowBox = await page.evaluate(() => {
  const h = document.querySelector('#bar2 .pgm-flow');
  const r = h.getBoundingClientRect();
  return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 };
});
await page.screenshot({ path: 'shots/strip-card.png', clip: flowBox });
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(300);

// and back off
await page.evaluate(() => window.__inkpad_pagestrip.set(false));
await page.waitForTimeout(900);
console.log('strip off', JSON.stringify(await snap()));

await browser.close();
