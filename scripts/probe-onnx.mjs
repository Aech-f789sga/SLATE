/**
 * The optional ONNX path, end to end.
 *
 * There is no real handwriting model to test against — the point of the
 * feature is that you bring your own — so this builds a deliberately trivial
 * one: a graph that declares the image input and ignores it, and emits a fixed
 * logits tensor. That is enough to prove every part of the pipeline that can
 * actually be wrong:
 *
 *   · the runtime loads from its CDN module
 *   · the session is created from bytes fetched over HTTP
 *   · the rasteriser produces exactly the declared shape and dtype (a mismatch
 *     throws inside the runtime, so a silent pass here means the image really
 *     is [1,1,S,S] float32)
 *   · greedy CTC decode collapses blanks and repeats into the right string
 *   · every failure mode returns null instead of throwing
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { onnx } = require('onnx-proto');

/* ---------------- build a tiny CTC model ---------------- */
const S = 64;
const T = 6;
const C = 5;
// frames → classes: blank, A, A, blank, B, B  →  "AB" after CTC collapse
const frames = [0, 1, 1, 0, 2, 2];

function logits() {
  const data = new Float32Array(T * C).fill(-8);
  frames.forEach((cls, t) => {
    data[t * C + cls] = 8;
  });
  return data;
}

const valueInfo = (name, dims) => ({
  name,
  type: {
    tensorType: {
      elemType: 1, // float
      shape: { dim: dims.map((d) => ({ dimValue: d })) },
    },
  },
});

const model = onnx.ModelProto.create({
  irVersion: 7,
  opsetImport: [{ domain: '', version: 13 }],
  producerName: 'slate-onnx-probe',
  graph: {
    name: 'const-logits',
    input: [valueInfo('image', [1, 1, S, S])],
    output: [valueInfo('logits', [1, T, C])],
    node: [
      {
        opType: 'Constant',
        name: 'logits',
        output: ['logits'],
        attribute: [
          {
            name: 'value',
            type: 4, // TENSOR
            t: { dims: [1, T, C], dataType: 1, floatData: logits() },
          },
        ],
      },
    ],
  },
});

const bytes = onnx.ModelProto.encode(model).finish();
const b64 = Buffer.from(bytes).toString('base64');
const modelUrl = `data:application/octet-stream;base64,${b64}`;
const vocabUrl = `data:application/json,${encodeURIComponent(JSON.stringify(['A', 'B', 'C', 'D']))}`;
console.log('model bytes:', bytes.length);

/* ---------------- drive it in the browser ---------------- */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/Failed to load resource|unsupported MIME/.test(t)) {
    console.log('  [console]', t.slice(0, 160));
  }
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);

const ready = await page.evaluate(() => !!window.__inkpadOnnx);
console.log('module mounted:', ready);

/* ---------------- off by default ---------------- */
const off = await page.evaluate(async () => {
  const api = window.__inkpadOnnx;
  api.set({ on: false });
  const r = await api.read([{ p: [[0, 0], [10, 10]] }]);
  return { on: api.on(), state: api.state().state, read: r };
});
console.log('off:', JSON.stringify(off));

/* ---------------- configure + warm ---------------- */
const warm = await page.evaluate(async ([m, v]) => {
  const api = window.__inkpadOnnx;
  api.set({ on: true, model: m, vocab: v, kind: 'ctc', size: 64 });
  const msg = await api.warm();
  return { msg, state: api.state() };
}, [modelUrl, vocabUrl]);
console.log('warm:', JSON.stringify(warm));

/* ---------------- recognise ---------------- */
const read = await page.evaluate(async () => {
  const strokes = [
    { p: [[10, 10], [40, 40]], w: 3 },
    { p: [[40, 10], [10, 40]], w: 3 },
  ];
  const t0 = performance.now();
  const r = await window.__inkpadOnnx.read(strokes);
  return { r, ms: Math.round(performance.now() - t0), state: window.__inkpadOnnx.state() };
});
console.log('read:', JSON.stringify(read));

/* ---------------- failure modes ---------------- */
const bad = await page.evaluate(async () => {
  const api = window.__inkpadOnnx;
  api.set({ model: 'https://example.invalid/nope.onnx' });
  const r = await api.read([{ p: [[0, 0], [9, 9]] }]);
  const st = api.state();
  api.set({ model: '' });
  return { returnedNull: r === null, state: st.state, note: st.note.slice(0, 60) };
});
console.log('bad url:', JSON.stringify(bad));

/* ---------------- reset ---------------- */
const clean = await page.evaluate(() => {
  const api = window.__inkpadOnnx;
  api.set({ on: false, model: '' });
  api.reset();
  return { on: api.on(), state: api.state().state };
});
console.log('reset:', JSON.stringify(clean));

await browser.close();
