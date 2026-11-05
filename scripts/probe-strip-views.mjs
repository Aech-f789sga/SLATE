import { chromium } from 'playwright';
const browser = await chromium.launch();

async function shot(name, viewport, dark) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  if (dark) {
    await page.evaluate(() => {
      localStorage.setItem('inkpad-theme', JSON.stringify({ id: 'midnight', mode: 'dark' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#grid', { timeout: 20000 });
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => {
    const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
    const n = { id: Date.now(), name: 'Strip', upd: Date.now(), pages: [mk('lined'), mk('lined'), mk('grid')] };
    window.lib.push(n);
    window.openNotebook(n);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
    b?.click();
    document.getElementById('tour-root')?.remove();
  });
  await page.evaluate(() => window.__inkpad_pagestrip.set(true));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const st = document.getElementById('pstrip');
    const s = document.getElementById('stage');
    s.scrollTop = st.children[1].offsetTop - 8;
  });
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const s = document.getElementById('stage');
    const st = document.getElementById('pstrip');
    return {
      flow: document.documentElement.dataset.flow,
      theme: document.documentElement.dataset.theme,
      bar: document.documentElement.dataset.bar,
      pi: window.eval('pi'),
      stripW: Math.round(st.getBoundingClientRect().width),
      overflowX: st.getBoundingClientRect().width > s.clientWidth,
      sheets: [...st.children].length,
      painted: [...st.querySelectorAll('canvas')].length,
    };
  });
  console.log(name, JSON.stringify(info));
  await page.screenshot({ path: `shots/strip-${name}.png` });
  await ctx.close();
}

await shot('dark', { width: 1440, height: 900 }, true);
await shot('phone', { width: 414, height: 896 }, false);
await browser.close();
