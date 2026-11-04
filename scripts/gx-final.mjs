import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => /skip tour/i.test(b.textContent || ''))
    ?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});

// 1. open the picker with a real click on the shelf button
await page.click('#gx-theme-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/gx-panel.png' });
const cards = await page.$$eval('#gx-theme-panel .gxp-card', (els) => els.length);
console.log('picker cards:', cards);

// 2. choose a theme by clicking its card
const pickCard = async (name) => {
  await page.evaluate((n) => {
    const c = [...document.querySelectorAll('#gx-theme-panel .gxp-card')].find(
      (x) => (x.querySelector('.gxp-name')?.textContent || '') === n
    );
    c?.click();
  }, name);
  await page.waitForTimeout(600);
};
await pickCard('LoFi Chill');
await page.screenshot({ path: 'shots/gx-panel-lofi.png' });

// 3. switch to dark through the mode buttons, then close the panel
await page.click('#gx-theme-panel .gxp-modes button[data-m="dark"]');
await page.waitForTimeout(600);
await page.click('#gx-theme-panel .gxp-x');
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/gx-lofi-dark.png' });

const stored = await page.evaluate(() => localStorage.getItem('inkpad-gx-theme'));
console.log('stored:', stored);

// 4. reload and confirm the choice survives
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1600);
const afterReload = await page.evaluate(() => {
  const t = window.__inkpadTheme;
  const wall = document.getElementById('gx-wall');
  return {
    choice: { ...t.choice },
    wallOn: wall?.dataset.on,
    img: (getComputedStyle(wall).backgroundImage || '').split('/').pop(),
    theme: document.documentElement.dataset.theme,
    btn: document.getElementById('gx-theme-btn')?.textContent?.trim(),
    btnParent: document.getElementById('gx-theme-btn')?.parentElement?.id,
    bar: document.documentElement.style.getPropertyValue('--gx-bar'),
  };
});
console.log('after reload:', JSON.stringify(afterReload));
await page.screenshot({ path: 'shots/gx-reload.png' });

// 5. create a notebook and inspect the editor
await page.evaluate(() => document.querySelector('#grid .new')?.click());
await page.waitForTimeout(800);
await page.evaluate(() => {
  const ok = [...document.querySelectorAll('#md .box button')].find((b) => /create/i.test(b.textContent || ''));
  ok?.click();
});
await page.waitForTimeout(2200);
const editor = await page.evaluate(() => {
  const cs = (s) => {
    const e = document.querySelector(s);
    return e ? getComputedStyle(e) : null;
  };
  return {
    stageBg: cs('#stage')?.backgroundColor,
    barBg: cs('#tb')?.backgroundColor,
    pageBg: cs('#pg')?.backgroundColor || cs('canvas')?.backgroundColor,
    panelOpen: !!document.querySelector('#ink-shape'),
  };
});
console.log('editor:', JSON.stringify(editor));
await page.screenshot({ path: 'shots/gx-editor-dark.png' });

// 6. a tool panel on the editor
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#tb button')].find((x) => /pen|brush/i.test(x.title || x.textContent || ''));
  b?.click();
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/gx-editor-panel-dark.png' });

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
