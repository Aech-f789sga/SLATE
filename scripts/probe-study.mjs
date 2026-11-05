import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 760 } });
await p.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v2','1');
  localStorage.setItem('inkpad-tour-editor-v2','1');
  localStorage.setItem('inkpad-install-dismissed','1');
});
await p.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#gn-study-btn', { state: 'attached', timeout: 15000 });
console.log(JSON.stringify(await p.evaluate(() => {
  const g = (id) => {
    const el = document.getElementById(id);
    if (!el) return { missing: id };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      flex: cs.flex, ws: cs.whiteSpace, minW: cs.minWidth,
      fontSize: cs.fontSize, pad: cs.padding,
      text: el.textContent,
      scrollW: el.scrollWidth, clientW: el.clientWidth,
    };
  };
  return { board: g('gn-board'), study: g('gn-study-btn'), newBtn: g('gn-new') };
}), null, 1));
await b.close();
