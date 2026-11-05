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
  const el = document.querySelector('#gx-theme-btn .gxb-lb');
  const hits = [];
  let sheetIdx = 0;
  for (const sheet of document.styleSheets) {
    sheetIdx++;
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list, media) => {
      for (const r of list) {
        if (r.cssRules) { walk(r.cssRules, media || (r.conditionText || r.media?.mediaText)); continue; }
        if (!r.selectorText) continue;
        let m = false; try { m = el.matches(r.selectorText); } catch { continue; }
        if (!m) continue;
        const c = r.style?.getPropertyValue('color');
        if (c) hits.push({ sheet: sheetIdx, sel: r.selectorText, color: c, prio: r.style.getPropertyPriority('color'), media: media || null });
      }
    };
    walk(rules, null);
  }
  return { computed: getComputedStyle(el).color, hits };
}), null, 1));
await b.close();
