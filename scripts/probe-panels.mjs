/** Every editor window: same button closes it, an outside press closes it. */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'P',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);

const on = (sel) => page.evaluate((s) => {
  const n = document.querySelector(s);
  return !!n && (n.classList.contains('on') || n.classList.contains('open'));
}, sel);
const results = [];
async function check(name, trigger, panel, viaClick = true) {
  await page.click(trigger);
  await page.waitForTimeout(320);
  const opened = await on(panel);
  if (viaClick) await page.click(trigger);
  await page.waitForTimeout(320);
  const closedBySame = !(await on(panel));
  if (!closedBySame) { await page.keyboard.press('Escape'); await page.mouse.click(900, 600); await page.waitForTimeout(300); }
  await page.click(trigger);
  await page.waitForTimeout(300);
  await page.mouse.click(900, 620);
  await page.waitForTimeout(320);
  const closedOutside = !(await on(panel));
  if (!closedOutside) { await page.mouse.click(900, 620); await page.waitForTimeout(200); }
  results.push({ name, opened, closedBySame, closedOutside });
}

await check('shapes picker', '#sh-trigger', '#sh-pick');
await check('dock sheet', '#pen-dock .pd-gear', '#pen-sheet');
await check('accessories', '#acc-trigger', '#acc-pop');
await check('page menu', '#pgm', '#bar2');

console.log('\nsummary');
let ok = 0;
for (const r of results) {
  const pass = r.opened && r.closedBySame && r.closedOutside;
  if (pass) ok++;
  console.log(` ${pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} open=${r.opened} same=${r.closedBySame} outside=${r.closedOutside}`);
}
console.log(`${ok}/${results.length}`);
await browser.close();
