import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
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
  const c = [...document.querySelectorAll('.gxp-card')].find(x => x.dataset.id === 'naruto-itachi-uchiha');
  c?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => {
  const span = document.querySelector('#gx-theme-btn .gxb-lb');
  const cs = getComputedStyle(span);
  const btn = document.getElementById('gx-theme-btn');
  // does the selector match?
  const probe = document.createElement('div');
  let matches = false;
  try { matches = span.matches('html[data-gx] #gx-theme-btn .gxb-lb'); } catch (e) { matches = 'err'; }
  return {
    spanColor: cs.color,
    spanTx: cs.getPropertyValue('--tx').trim(),
    spanAc: cs.getPropertyValue('--ac').trim(),
    matchesSelector: matches,
    htmlAttrs: document.documentElement.getAttribute('data-gx'),
    btnColor: getComputedStyle(btn).color,
  };
}), null, 1));
await b.close();
