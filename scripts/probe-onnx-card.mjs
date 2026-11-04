/**
 * The ONNX path as a user meets it: menu → Smart ink → Handwriting model,
 * paste a URL, press Load, then convert a formula and watch the model's answer
 * replace the built-in guess.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { onnx } = require('onnx-proto');

/* same trivial model as probe-onnx.mjs: ignores the image, emits "AB" */
const S = 64;
const T = 6;
const C = 5;
const frames = [0, 1, 1, 0, 2, 2];
const data = new Float32Array(T * C).fill(-8);
frames.forEach((cls, t) => {
  data[t * C + cls] = 8;
});
const vi = (name, dims) => ({
  name,
  type: { tensorType: { elemType: 1, shape: { dim: dims.map((d) => ({ dimValue: d })) } } },
});
const bytes = onnx.ModelProto.encode(
  onnx.ModelProto.create({
    irVersion: 7,
    opsetImport: [{ domain: '', version: 13 }],
    graph: {
      name: 'g',
      input: [vi('image', [1, 1, S, S])],
      output: [vi('logits', [1, T, C])],
      node: [
        {
          opType: 'Constant',
          output: ['logits'],
          attribute: [{ name: 'value', type: 4, t: { dims: [1, T, C], dataType: 1, floatData: data } }],
        },
      ],
    },
  }),
).finish();
const modelUrl = `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`;
const vocabUrl = `data:application/json,${encodeURIComponent(JSON.stringify(['A', 'B', 'C', 'D']))}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('console', (m) => { const t = m.text(); if (/refine|frame/.test(t)) console.log('  [page]', t); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
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
    name: 'ONNX',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);

/* ---------------- the menu path ---------------- */
const openSheet = async () => {
  await page.evaluate(() => (document.getElementById('acc-trigger'))?.click());
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#acc-pop .acc-item')].find((r) =>
      /smart ink/i.test(r.textContent || ''),
    );
    (row)?.click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => (document.getElementById('acc-onnx-open'))?.click());
  await page.waitForTimeout(250);
};

await openSheet();
const sheet = await page.evaluate(() => {
  const s = document.getElementById('acc-onnx');
  return {
    visible: !!s?.classList.contains('on'),
    fields: [...(s?.querySelectorAll('input,select') || [])].map((i) => (i).id),
    status: s?.querySelector('#onnx-st')?.textContent,
    hint: s?.querySelector('#onnx-hint')?.textContent,
    switchOn: !!s?.querySelector('#onnx-on.on'),
  };
});
console.log('sheet:', JSON.stringify(sheet));

/* ---------------- configure through the UI ---------------- */
await page.evaluate(
  ([m, v]) => {
    const set = (id, val) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('onnx-model', m);
    set('onnx-vocab', v);
    document.getElementById('onnx-on')?.click();
  },
  [modelUrl, vocabUrl],
);
await page.waitForTimeout(300);

const afterToggle = await page.evaluate(() => {
  const s = document.getElementById('acc-onnx');
  return {
    switchOn: !!s?.querySelector('#onnx-on.on'),
    status: s?.querySelector('#onnx-st')?.textContent,
    cfgOn: window.__inkpadOnnx.cfg().on,
    cfgModel: window.__inkpadOnnx.cfg().model.slice(0, 24),
  };
});
console.log('after toggle:', JSON.stringify(afterToggle));

await page.evaluate(() => (document.getElementById('onnx-load'))?.click());
await page.waitForTimeout(3500);
const loaded = await page.evaluate(() => ({
  hint: document.getElementById('onnx-hint')?.textContent,
  state: window.__inkpadOnnx.state(),
}));
console.log('load:', JSON.stringify(loaded));

await page.screenshot({ path: 'shots/onnx-sheet.png' });

/* ---------------- convert with the model ---------------- */
await page.evaluate(async () => {
  const smart = await import('/src/smart.ts');
  smart.setSmart('toLatex', true);
  smart.setSmart('toText', false);

  const seg = (a, b, n = 12) =>
    Array.from({ length: n + 1 }, (_, i) => [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n,
    ]);
  const strokes = [
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([120, 360], [176, 424]) },
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([176, 360], [120, 424]) },
  ];
  const json = JSON.stringify(strokes);
  window.eval(
    `(function(){ var s = ${json}; pg().strokes.push.apply(pg().strokes, s); draw(); sel = s; })()`,
  );
});
await page.waitForTimeout(700);
await page.evaluate(() => (document.querySelector('#lasso-pill .lp-latex'))?.click());
await page.waitForTimeout(250);

const instant = await page.evaluate(() => ({
  text: (document.querySelector('#lasso-card .lc-area'))?.value,
  conf: document.querySelector('#lasso-card .lc-conf')?.textContent,
}));
console.log('instant (built-in):', JSON.stringify(instant));

await page.waitForTimeout(2500);
const refined = await page.evaluate(() => ({
  text: (document.querySelector('#lasso-card .lc-area'))?.value,
  conf: document.querySelector('#lasso-card .lc-conf')?.textContent,
  confV: (document.querySelector('#lasso-card .lc-conf'))?.dataset.v,
  katex: !!document.querySelector('#lasso-card .lc-prev .katex'),
  onnx: window.__inkpadOnnx.state(),
}));
console.log('refined (model):', JSON.stringify(refined));
await page.screenshot({ path: 'shots/onnx-card.png' });

/* ---------------- stale answers are dropped ---------------- */
const stale = await page.evaluate(async () => {
  // close the card, then ask for a read and check nothing lands on screen
  (document.querySelector('#lasso-card .lc-x'))?.click();
  const r = await window.__inkpadOnnx.read([{ p: [[0, 0], [9, 9]] }]);
  return { cardOpen: !!document.querySelector('#lasso-card.on'), modelStillAnswers: !!r };
});
console.log('stale:', JSON.stringify(stale));

/* leave the app as we found it */
await page.evaluate(() => {
  window.__inkpadOnnx.set({ on: false, model: '', vocab: '' });
  window.__inkpadOnnx.reset();
});

await browser.close();
