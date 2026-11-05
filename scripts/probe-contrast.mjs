import { chromium } from 'playwright';
const ids = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v2','1');
  localStorage.setItem('inkpad-tour-editor-v2','1');
  localStorage.setItem('inkpad-install-dismissed','1');
});
await p.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });
for (const id of ids) {
  await p.click('#gx-theme-btn');
  await p.waitForSelector('.gxp-card', { state: 'attached' });
  await p.evaluate((t) => {
    const c = [...document.querySelectorAll('.gxp-card')].find(x => x.dataset.id === t);
    c?.click();
  }, id);
  await p.waitForTimeout(350);
  await p.evaluate(() => document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const chip = document.getElementById('gx-theme-btn');
    const cc = getComputedStyle(chip);
    return {
      tx: root.getPropertyValue('--tx').trim(),
      ac: root.getPropertyValue('--ac').trim(),
      bg: root.getPropertyValue('--bg').trim(),
      sf: root.getPropertyValue('--sf').trim(),
      chipColor: cc.color, chipBg: cc.backgroundColor,
    };
  });
  console.log(id.padEnd(26), JSON.stringify(r));
}
await b.close();
