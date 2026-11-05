import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
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
console.log(JSON.stringify(await p.evaluate(() => {
  const btn = document.getElementById('gx-theme-btn');
  const lb = btn.querySelector('.gxb-lb');
  const top = btn.parentElement;
  return {
    btnW: btn.getBoundingClientRect().width,
    lbW: lb.getBoundingClientRect().width,
    lbScroll: lb.scrollWidth,
    lbFlex: getComputedStyle(lb).flex,
    lbMinW: getComputedStyle(lb).minWidth,
    topDisplay: getComputedStyle(top).display,
    topW: top.getBoundingClientRect().width,
    parentOfBtn: btn.parentElement.id || btn.parentElement.className,
    btnFlex: getComputedStyle(btn).flex,
  };
}, null), null, 1));
await b.close();
