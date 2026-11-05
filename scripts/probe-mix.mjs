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
console.log(JSON.stringify(await p.evaluate(() => {
  const test = (v) => {
    const d = document.createElement('div');
    d.style.color = v;
    document.body.append(d);
    const got = getComputedStyle(d).color;
    d.remove();
    return got;
  };
  return {
    withVars: test('color-mix(in srgb, var(--ac) 50%, var(--tx))'),
    withLiterals: test('color-mix(in srgb, hsl(0 100% 23%) 50%, hsl(0 12% 96%))'),
    supportsMix: CSS.supports('color', 'color-mix(in srgb, red 50%, white)'),
    txRaw: getComputedStyle(document.documentElement).getPropertyValue('--tx'),
    acRaw: getComputedStyle(document.documentElement).getPropertyValue('--ac'),
  };
}), null, 1));
await b.close();
