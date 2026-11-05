import { chromium } from 'playwright';
const id = process.argv[2] || 'naruto-itachi-uchiha';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 4, serviceWorkers: 'block' });
const p = await ctx.newPage();
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
await (await p.$('#gx-theme-btn')).screenshot({ path: `shots/chip-${id}.png` });
console.log('chip ' + id);
await b.close();
