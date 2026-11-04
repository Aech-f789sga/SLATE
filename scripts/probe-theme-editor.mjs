/**
 * Does the theme's shape language survive inside a notebook?
 *
 * The shelf is the easy half — it is HTML and CSS. The editor bar and the page
 * are drawn by the engine, so this checks the two things that can actually go
 * wrong there: icon strokes turning to hair or to marker, and the bar's radius
 * fighting its own layout.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => /skip tour/i.test(b.textContent || ''))
    ?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
  const n = {
    id: Date.now(),
    name: 'Theme',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);

for (const id of ['slate', 'blockified', 'elden-ring', 'cyberdeck']) {
  const info = await page.evaluate((id) => {
    window.__inkpadTheme.choice.id = id;
    window.__inkpadTheme.apply();
    const tb = document.getElementById('tb');
    const svg = document.querySelector('#tb svg');
    const cs = getComputedStyle(tb);
    const pill = document.getElementById('bar2');
    const ics = document.querySelector('#tb .ic');
    const pcs = pill ? getComputedStyle(pill) : null;
    return {
      theme: document.documentElement.dataset.gxTheme,
      barRadius: cs.borderTopLeftRadius,
      pillRadius: pcs ? pcs.borderTopLeftRadius : null,
      pillBorder: pcs ? pcs.borderTopWidth : null,
      iconBtnRadius: ics ? getComputedStyle(ics).borderTopLeftRadius : null,
      iconStroke: svg ? getComputedStyle(svg).strokeWidth : null,
      iconCap: svg ? getComputedStyle(svg).strokeLinecap : null,
      barW: Math.round(tb.getBoundingClientRect().width),
      barH: Math.round(tb.getBoundingClientRect().height),
      overflow: tb.scrollWidth > tb.clientWidth + 2,
    };
  }, id);
  console.log(id.padEnd(12), JSON.stringify(info));
  await page.screenshot({ path: `shots/editor-${id}.png`, clip: { x: 0, y: 0, width: 1400, height: 150 } });
}

// leave the app on its own palette
await page.evaluate(() => {
  window.__inkpadTheme.choice.id = 'slate';
  window.__inkpadTheme.choice.mode = 'auto';
  window.__inkpadTheme.apply();
});

/* ---------------- dark mode ---------------- */
// the sub-toolbar was hardcoded white; in a dark theme it must follow the
// palette or the whole cluster glows out of the page
for (const id of ['slate', 'blockified', 'cyberdeck']) {
  const info = await page.evaluate((id) => {
    window.__inkpadTheme.choice.id = id;
    window.__inkpadTheme.choice.mode = 'dark';
    window.__inkpadTheme.apply();
    const pill = document.getElementById('bar2');
    const pcs = getComputedStyle(pill);
    const btn = pill.querySelector('button');
    const bcs = btn ? getComputedStyle(btn) : null;
    return {
      theme: document.documentElement.dataset.gxTheme,
      pillBg: pcs.backgroundColor,
      pillBorder: pcs.borderTopColor,
      btnBg: bcs ? bcs.backgroundColor : null,
      btnColor: bcs ? bcs.color : null,
      text: pcs.color,
    };
  }, id);
  console.log('dark', id.padEnd(11), JSON.stringify(info));
  await page.screenshot({ path: `shots/editor-dark-${id}.png`, clip: { x: 0, y: 0, width: 1400, height: 150 } });
}

await page.evaluate(() => {
  window.__inkpadTheme.choice.id = 'slate';
  window.__inkpadTheme.choice.mode = 'auto';
  window.__inkpadTheme.apply();
});
await browser.close();
