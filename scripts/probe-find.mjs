import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });
console.log(JSON.stringify(await p.evaluate(() => {
  const sheets = [...document.styleSheets];
  const found = [];
  for (const s of sheets) {
    let txt = '';
    try { txt = [...s.cssRules].map(r => r.cssText).join('\n'); } catch { txt = 'BLOCKED'; }
    if (txt.includes('ac) 50%')) found.push({ id: s.id, has: true });
    if (txt.includes('#gx-theme-btn{') || txt.includes('#gx-theme-btn {')) found.push({ id: s.id, hasBtn: true });
  }
  // walk ancestors for a colour
  const el = document.getElementById('gx-theme-btn');
  const anc = [];
  let n = el;
  while (n && anc.length < 8) { anc.push(`${n.id || n.className || n.tagName}: ${getComputedStyle(n).color}`); n = n.parentElement; }
  return { sheetCount: sheets.length, found, anc, ownColor: getComputedStyle(el).color };
}), null, 1));
await b.close();
