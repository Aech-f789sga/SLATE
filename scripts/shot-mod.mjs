import { chromium } from 'playwright';

// vite preview binds to [::1] on this box, so 127.0.0.1 is refused outright
const URL = 'http://[::1]:4173/';
const browser = await chromium.launch();
const errors = [];

async function session(id, mode, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag} CONSOLE ${m.text()}`);
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
    b?.click();
    document.getElementById('tour-root')?.remove();
  });
  await page.evaluate(
    ([id, mode]) => {
      const t = window.__inkpadTheme;
      t.choice.id = id;
      t.choice.mode = mode;
      t.choice.wall = true;
      t.apply();
      const mk = (name, tpl) => ({
        id: name + Math.random(),
        name,
        upd: Date.now() - Math.random() * 1e7,
        cover: '#2f6df6',
        pages: [{ tpl, col: '', strokes: [], pw: 800, ph: 1100 }],
      });
      window.lib.push(mk('Sunset notes', 'lined'), mk('Chord ideas', 'grid'));
      window.eval('save()');
      window.showLib();
    },
    [id, mode],
  );
  await page.waitForTimeout(1100);
  // a real gesture, so the soundtrack is allowed to start — on empty shelf
  // space, because a card would open a notebook and start the tour
  await page.mouse.click(980, 560);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/mod-${tag}-shelf.png` });

  // open the player
  await page.evaluate(() => document.querySelector('.gxm-fab')?.click());
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/mod-${tag}-panel.png` });

  const state = await page.evaluate(() => {
    const g = document.getElementById('gxm');
    const v = document.querySelector('#gx-wall .gx-wall-video');
    const fx = document.querySelector('#gx-wall .gx-wall-fx');
    return {
      panel: !!g && g.classList.contains('on'),
      state: g?.dataset.state,
      wallOn: document.getElementById('gx-wall')?.dataset.on,
      wallLive: document.getElementById('gx-wall')?.dataset.live,
      video: v ? { src: v.getAttribute('src'), paused: v.paused, w: v.videoWidth } : null,
      fx: fx ? { display: getComputedStyle(fx).display, w: fx.width } : null,
    };
  });

  // into a notebook
  await page.evaluate(() => window.openNotebook(window.lib[window.lib.length - 1]));
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
    b?.click();
    document.getElementById('tour-root')?.remove();
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/mod-${tag}-editor.png` });

  const inEditor = await page.evaluate(() => {
    const v = document.querySelector('#gx-wall .gx-wall-video');
    const st = document.getElementById('stage');
    const ed = document.getElementById('ed');
    return {
      videoPaused: v ? v.paused : null,
      videoSrc: v ? v.getAttribute('src') : null,
      stageBg: st ? getComputedStyle(st).backgroundColor : null,
      edZ: ed ? getComputedStyle(ed).zIndex : null,
      panelCls: document.getElementById('gxm')?.className,
    };
  });
  console.log(tag, JSON.stringify({ ...state, inEditor }));
  await ctx.close();
}

await session('cyberdeck', 'dark', 'cyberdeck-dark');
await session('minecraft-sound-fireplace', 'dark', 'mc-dark');
await session('lofi-chill', 'light', 'lofi-light');
await browser.close();
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 12).join('\n'));
else console.log('no page errors');
