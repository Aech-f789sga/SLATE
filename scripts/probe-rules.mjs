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
const out = await p.evaluate(() => {
  const el = document.getElementById('gx-theme-btn');
  const hits = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const r of list) {
        if (r.cssRules) { walk(r.cssRules); continue; }
        if (!r.selectorText) continue;
        let match = false;
        try { match = el.matches(r.selectorText); } catch { continue; }
        if (!match) continue;
        const c = r.style?.getPropertyValue('color');
        if (c) hits.push({ sel: r.selectorText, color: c, prio: r.style.getPropertyPriority('color'), sheet: sheet.id || '(anon)' });
      }
    };
    walk(rules);
  }
  return { computed: getComputedStyle(el).color, inline: el.getAttribute('style'), hits };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
