import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid');
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'D', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }, { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(2200);

const hits = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((n) => {
    const t = (n.textContent || '').trim();
    if (n.children.length) return;
    if (!/^(1 \/ 2|100%|\d+%)$/.test(t)) return;
    const r = n.getBoundingClientRect();
    if (!r.width) return;
    let chain = [];
    for (let p = n; p && chain.length < 5; p = p.parentElement) chain.push(p.id ? '#' + p.id : p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).split(' ')[0] : ''));
    out.push({ text: t, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], chain: chain.join(' < ') });
  });
  return out;
});
hits.forEach((h) => console.log(h.text.padEnd(8), JSON.stringify(h.rect), h.chain));

console.log('\n#pg outer:', await page.evaluate(() => {
  const p = document.getElementById('pg');
  const r = p.getBoundingClientRect();
  return JSON.stringify({ rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], html: p.innerHTML.slice(0, 400) });
}));
await browser.close();
