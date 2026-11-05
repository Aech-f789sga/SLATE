import { chromium } from 'playwright';
const w = Number(process.argv[2] || 1024);
const id = process.argv[3] || 'japanese-lofi-mix';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2 });
await p.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v2','1');
  localStorage.setItem('inkpad-tour-editor-v2','1');
  localStorage.setItem('inkpad-install-dismissed','1');
});
await p.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });
await p.click('#gx-theme-btn');
await p.waitForSelector('.gxp-card', { state: 'attached' });
await p.evaluate((t) => {
  const c = [...document.querySelectorAll('.gxp-card')].find(x => x.dataset.id === t);
  c?.click();
}, id);
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
await p.waitForTimeout(400);
const top = await p.$('#gn-top');
await top.screenshot({ path: `shots/bar-${w}.png` });
console.log('bar ' + w);
await b.close();
