/**
 * Theme "feel" probe.
 *
 * A GX mod is not only a palette — it also decides corner radii, border weight,
 * typeface, icon stroke and the sound pack. This checks that switching a theme
 * actually moves all of those, and that the sound synthesiser is being driven
 * with the right waveform per pack.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160));
});
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());

// record every oscillator the sound layer creates, so we can prove a click
// actually reached the audio graph (headless cannot play it back)
await page.addInitScript(() => {
  window.__osc = [];
  window.__buf = 0;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  const osc = C.prototype.createOscillator;
  C.prototype.createOscillator = function () {
    const o = osc.call(this);
    window.__osc.push(o);
    return o;
  };
  const buf = C.prototype.createBufferSource;
  C.prototype.createBufferSource = function () {
    window.__buf++;
    return buf.call(this);
  };
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => /skip tour/i.test(b.textContent || ''))
    ?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(400);

/* ---------------- picker footer ---------------- */
await page.click('#gx-theme-btn');
await page.waitForTimeout(400);
const foot = await page.evaluate(() => {
  const t = document.getElementById('gxp-tag');
  return {
    panel: !!document.querySelector('#gx-theme-panel.on'),
    sound: !!document.getElementById('gxp-snd-t'),
    soundOn: document.getElementById('gxp-snd-t')?.checked ?? null,
    tag: t?.textContent || null,
    cards: document.querySelectorAll('#gx-theme-panel .gxp-card').length,
  };
});
console.log('picker:', JSON.stringify(foot));

/* ---------------- per-theme application ---------------- */
const pick = async (id) => {
  await page.evaluate((id) => {
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${id}"]`)?.click();
  }, id);
  await page.waitForTimeout(280);
  return page.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const search = document.getElementById('gn-search');
    const scs = search ? getComputedStyle(search) : null;
    const lib = document.getElementById('lib');
    // whichever icon container exists in this shell build
    const icon =
      document.querySelector('#nav a svg') ||
      document.querySelector('.gn-head svg') ||
      document.querySelector('#gn-top svg');
    return {
      theme: root.dataset.gxTheme,
      r: cs.getPropertyValue('--gx-r').trim(),
      r2: cs.getPropertyValue('--gx-r2').trim(),
      bd: cs.getPropertyValue('--gx-bd').trim(),
      iw: cs.getPropertyValue('--gx-iw').trim(),
      font: cs.getPropertyValue('--gx-font').trim().slice(0, 28),
      caps: root.dataset.gxCaps,
      searchRadius: scs ? scs.borderTopLeftRadius : null,
      searchBorder: scs ? scs.borderTopWidth : null,
      libFont: lib ? getComputedStyle(lib).fontFamily.slice(0, 30) : null,
      iconStroke: icon ? getComputedStyle(icon).strokeWidth : null,
      iconCap: icon ? getComputedStyle(icon).strokeLinecap : null,
      tag: document.getElementById('gxp-tag')?.textContent,
    };
  });
};

const seen = {};
for (const id of ['slate', 'blockified', 'elden-ring', 'cyberdeck', 'cozy']) {
  seen[id] = await pick(id);
  console.log(id.padEnd(12), JSON.stringify(seen[id]));
  if (['blockified', 'elden-ring', 'cyberdeck'].includes(id)) {
    await page.screenshot({ path: `shots/feel-${id}.png` });
  }
}

/* ---------------- sound ---------------- */
// close the picker so the click below lands on the shelf, then click a real
// control and inspect the oscillator the pack produced
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const sound = async (id, expectWave) => {
  await page.evaluate((id) => {
    window.__osc.length = 0;
    window.__buf = 0;
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${id}"]`)?.click();
  }, id);
  await page.waitForTimeout(150);
  // the card click itself already fired one transient with the new pack
  const got = await page.evaluate(() => ({
    n: window.__osc.length,
    waves: window.__osc.map((o) => o.type),
    freq: window.__osc.map((o) => Math.round(o.frequency.value)),
    noise: window.__buf,
    theme: document.documentElement.dataset.gxTheme,
  }));
  const ok = got.n > 0 && got.waves.includes(expectWave);
  console.log(
    `sound ${id.padEnd(12)} n=${got.n} waves=[${got.waves.join(',')}] f=[${got.freq.join(',')}] noise=${got.noise} ${ok ? 'OK' : 'MISS'}`,
  );
  return ok;
};

// reopen the picker for the sound tests
await page.click('#gx-theme-btn');
await page.waitForTimeout(300);

let allOk = true;
allOk &&= await sound('blockified', 'square');
allOk &&= await sound('elden-ring', 'sine');
allOk &&= await sound('cyberdeck', 'square');
allOk &&= await sound('cozy', 'triangle');


console.log('all packs match their waveform:', allOk);

/* ---------------- mute ---------------- */
// the picker is a full-screen overlay, so it has to go before the shelf button
// is clickable at all
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
await page.evaluate(() => {
  document.getElementById('gxp-snd-t')?.click();
  window.__osc.length = 0;
});
await page.waitForTimeout(120);
await page.click('#gx-theme-btn');
await page.waitForTimeout(250);
const muted = await page.evaluate(() => window.__osc.length);
console.log('muted, oscillators on click:', muted, muted === 0 ? 'OK' : 'LEAK');

// put the preference back, or every later run starts silent
await page.evaluate(() => window.__inkpadSfx?.setOn(true));
const restored = await page.evaluate(() => window.__inkpadSfx?.on());
console.log('sound restored:', restored);

console.log('feels distinct:', new Set(Object.values(seen).map((s) => s.r + s.font)).size);
await browser.close();
