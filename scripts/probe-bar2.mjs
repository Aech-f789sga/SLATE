import { chromium } from 'playwright';
const ids = ['grand-theft-auto-san-andreas','japanese-lofi-mix','minecraft-sound-fireplace','violet-nebula'];
const b = await chromium.launch();
for (const w of [1280, 1024]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
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
      const top = document.getElementById('gn-top');
      const lb = document.querySelector('#gx-theme-btn .gxb-lb');
      const nb = document.getElementById('gn-new');
      const nr = nb.getBoundingClientRect();
      const topR = top.getBoundingClientRect();
      return {
        clipped: lb.scrollWidth > lb.clientWidth + 1,
        barOverflow: top.scrollWidth > top.clientWidth + 1,
        newRight: Math.round(nr.right), topRight: Math.round(topR.right),
        newInside: nr.right <= topR.right + 0.5,
      };
    });
    console.log(`${w} ${id.padEnd(28)} clipped:${r.clipped} overflow:${r.barOverflow} newFits:${r.newInside}`);
  }
  await p.close();
}
await b.close();
