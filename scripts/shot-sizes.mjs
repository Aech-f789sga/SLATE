import { chromium } from 'playwright';
const sizes = [
  { name: 'phone-portrait', w: 390, h: 844, mobile: true },
  { name: 'phone-landscape', w: 844, h: 390, mobile: true },
  { name: 'tablet-portrait', w: 834, h: 1112, mobile: true },
  { name: 'tablet-landscape', w: 1112, h: 834, mobile: true },
];
const browser = await chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/size-${s.name}.png` });
  console.log(s.name, await page.evaluate(() => ({
    bar: document.documentElement.dataset.bar,
    tbH: Math.round(document.getElementById('tb').getBoundingClientRect().height),
    pgm: !!document.getElementById('pgm'),
    pgmVisible: document.getElementById('pgm') ? getComputedStyle(document.getElementById('pgm')).display : 'none',
    dock: (() => { const d = document.getElementById('pen-dock'); if (!d) return 'none'; const r = d.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
    ink: (() => { const d = document.getElementById('ink-pen'); if (!d) return 'none'; const r = d.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; })(),
  })));
  await ctx.close();
}
await browser.close();
