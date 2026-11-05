import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1280, 1100, 1024]) {
  const p = await b.newPage({ viewport: { width: w, height: 820 } });
  await p.addInitScript(() => {
    localStorage.setItem('inkpad-tour-home-v2','1');
    localStorage.setItem('inkpad-tour-editor-v2','1');
    localStorage.setItem('inkpad-install-dismissed','1');
  });
  await p.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });
  await p.click('#gx-theme-btn');
  await p.waitForSelector('.gxp-card', { state: 'attached' });
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('.gxp-card')].find(x => x.dataset.id === 'japanese-lofi-mix');
    c?.click();
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const top = document.getElementById('gn-top');
    const btn = document.getElementById('gx-theme-btn');
    const lb = btn.querySelector('.gxb-lb');
    return {
      clipped: lb.scrollWidth > lb.clientWidth + 1,
      lbW: Math.round(lb.getBoundingClientRect().width),
      lbScroll: lb.scrollWidth,
      barOverflow: top.scrollWidth > top.clientWidth + 1,
      barScroll: top.scrollWidth, barClient: top.clientWidth,
    };
  });
  console.log(w, JSON.stringify(r));
  await p.close();
}
await b.close();
