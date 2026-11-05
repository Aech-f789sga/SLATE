import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
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
await p.evaluate(() => {
  const c = [...document.querySelectorAll('.gxp-card')].find(x => x.dataset.id === 'naruto-itachi-uchiha');
  c?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => {
  const spans = [...document.querySelectorAll('#gx-theme-btn .gxb-lb')];
  const btn = document.getElementById('gx-theme-btn');
  const chain = [];
  let n = btn;
  while (n && chain.length < 6) {
    const cs = getComputedStyle(n);
    chain.push(`${n.id || n.className || n.tagName} op:${cs.opacity} color:${cs.color} filter:${cs.filter}`);
    n = n.parentElement;
  }
  return {
    spanCount: spans.length,
    spans: spans.map(s => ({ color: getComputedStyle(s).color, vis: getComputedStyle(s).visibility, op: getComputedStyle(s).opacity })),
    chain,
  };
}), null, 1));
await b.close();
