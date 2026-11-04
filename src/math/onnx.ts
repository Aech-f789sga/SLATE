/**
 * Optional ONNX recognition.
 *
 * The built-in reader in `./ocr.ts` is stroke-based: it segments ink into
 * glyphs and compares each against templates. That is the right shape for pen
 * input — it is fast, it needs no weights, and it works offline — but it only
 * knows the alphabet somebody wrote into it. A trained model knows more, and
 * the only practical way to run one in a browser without shipping 40 MB of
 * runtime to everyone is to make it optional and load it on demand.
 *
 * So this module is a *runner*, not a model. It knows nothing about any
 * particular network; it knows two contracts, and either can be pointed at a
 * URL. Nothing here runs unless the user turns it on, and every failure path
 * ends at `null`, which the caller reads as "use the built-in reader".
 *
 * ── Contract: `ctc` ─────────────────────────────────────────────────────
 *   input   image   float32 [1, 1, S, S]
 *   output  logits  float32 [1, T, C]
 *   Class 0 is the CTC blank. Class n (n ≥ 1) is `vocab[n - 1]`. Greedy
 *   decode: take the argmax per frame, drop blanks and immediate repeats.
 *   This is what most small handwriting models export as, and it needs no
 *   tokenizer and no decoding loop.
 *
 * ── Contract: `seq2seq` ─────────────────────────────────────────────────
 *   encoder input   image   float32 [1, 1, S, S]
 *   encoder output  hidden  (whatever the decoder wants)
 *   decoder inputs  tokens int64 [1, L], then the encoder output
 *   decoder output  logits  float32 [1, L, V]
 *   Greedy: start from BOS, append the argmax each step, stop at EOS or after
 *   `maxTokens`. This is the pix2tex/texify shape.
 *
 * Image conventions: white paper, black ink, resized to fit the model's own
 * declared frame with a margin, normalised as `(v / 255 - mean) / std`. The
 * frame is read from the session's input metadata, so a 64-pixel model and a
 * 384-pixel model both work without being told which they are. Set `invert`
 * for models trained the other way up.
 */

import type { InkStroke } from './ocr';

const KEY = 'inkpad-onnx';

export type ModelKind = 'ctc' | 'seq2seq';

export interface OnnxCfg {
  on: boolean;
  /** ESM module for onnxruntime-web. */
  runtime: string;
  /** The .onnx file. */
  model: string;
  kind: ModelKind;
  /** Decoder .onnx — seq2seq only. */
  decoder: string;
  /** JSON array of class labels. Empty means the built-in charset. */
  vocab: string;
  size: number;
  mean: number;
  std: number;
  invert: boolean;
  /** Token ids for seq2seq. */
  bos: number;
  eos: number;
  /** Give up after this many tokens, so a looping model cannot hang a tab. */
  maxTokens: number;
}

const RT_VERSION = '1.22.0';
const DEFAULT_RUNTIME = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${RT_VERSION}/dist/ort.wasm.min.mjs`;

export const ONNX_DEFAULT: OnnxCfg = {
  on: false,
  runtime: DEFAULT_RUNTIME,
  model: '',
  kind: 'ctc',
  decoder: '',
  vocab: '',
  size: 384,
  mean: 0.5,
  std: 0.5,
  invert: false,
  bos: 1,
  eos: 2,
  maxTokens: 192,
};

/**
 * Fallback alphabet: printable ASCII in code order, which is what a character
 * level CTC model trained on handwriting almost always uses. Anything with a
 * real tokenizer should point `vocab` at its own JSON.
 */
const ASCII = (() => {
  const out: string[] = [];
  for (let c = 32; c < 127; c++) out.push(String.fromCharCode(c));
  return out;
})();

let cfg: OnnxCfg = { ...ONNX_DEFAULT };
let vocab: string[] | null = null;
let vocabFor = '';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    for (const k of Object.keys(ONNX_DEFAULT) as (keyof OnnxCfg)[]) {
      const v = (p as any)[k];
      if (typeof v === typeof (ONNX_DEFAULT as any)[k]) (cfg as any)[k] = v;
    }
  } catch {
    /* defaults */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function onnxCfg(): OnnxCfg {
  return { ...cfg };
}

export function setOnnx(patch: Partial<OnnxCfg>) {
  cfg = { ...cfg, ...patch };
  save();
  // a changed model must not keep serving the old session
  if ('model' in patch || 'decoder' in patch || 'runtime' in patch) reset();
}

export function onnxOn(): boolean {
  return cfg.on && !!cfg.model.trim();
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

let ort: any = null;
let rtLoad: Promise<any> | null = null;
const sessions = new Map<string, any>();

export type OnnxState = 'off' | 'idle' | 'loading' | 'ready' | 'failed';
let state: OnnxState = 'off';
let stateNote = '';

export function onnxState(): { state: OnnxState; note: string } {
  return { state, note: stateNote };
}

function fail(where: string, e: unknown) {
  state = 'failed';
  stateNote = `${where}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160);
  return null;
}

async function runtime(): Promise<any> {
  if (ort) return ort;
  if (rtLoad) return rtLoad;
  state = 'loading';
  stateNote = 'loading runtime';
  rtLoad = (async () => {
    try {
      // not bundled: this is a ~10 MB wasm runtime that most sessions never
      // touch, so it is fetched from the CDN (or wherever `runtime` points)
      const mod: any = await import(/* @vite-ignore */ cfg.runtime);
      ort = mod.default || mod;
      try {
        // the .wasm sits beside the .mjs in every published build
        ort.env.wasm.wasmPaths = cfg.runtime.replace(/[^/]+$/, '');
        // single-threaded: threads need SharedArrayBuffer, which needs
        // COOP/COEP headers a static notebook host does not send
        ort.env.wasm.numThreads = 1;
        ort.env.logLevel = 'error';
      } catch {
        /* older builds */
      }
      return ort;
    } catch (e) {
      rtLoad = null;
      return fail('runtime', e);
    }
  })();
  return rtLoad;
}

async function session(url: string): Promise<any> {
  const hit = sessions.get(url);
  if (hit) return hit;
  const o = await runtime();
  if (!o) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const s = await o.InferenceSession.create(buf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    sessions.set(url, s);
    return s;
  } catch (e) {
    return fail('model', e);
  }
}

/**
 * The frame the model wants, taken from the model.
 *
 * Most exported models declare a fixed `[1, 1, H, W]`, and asking the session
 * for it beats asking the user: a 64-pixel model fed 384-pixel images fails
 * with an error nobody can act on, and the size is already written down in the
 * graph. `cfg.size` is only the answer when the dims are dynamic.
 */
function frameOf(s: any): { h: number; w: number } {
  try {
    const meta = s.inputMetadata;
    // onnxruntime-web hands back an array of { name, type, shape }; the node
    // build hands back an object keyed by input name. Accept either.
    let dims: any = null;
    if (Array.isArray(meta)) dims = meta[0]?.shape;
    else if (meta && typeof meta === 'object') {
      const first = meta[s.inputNames?.[0]];
      dims = first?.shape ?? first?.dims;
    }
    if (Array.isArray(dims) && dims.length === 4) {
      const h = Number(dims[2]);
      const w = Number(dims[3]);
      if (h > 0 && w > 0) return { h, w };
    }
  } catch {
    /* fall through */
  }
  return { h: cfg.size, w: cfg.size };
}

export function reset() {
  sessions.clear();
  vocab = null;
  vocabFor = '';
  state = cfg.on && cfg.model ? 'idle' : 'off';
  stateNote = '';
}

/* ------------------------------------------------------------------ */
/* Image                                                               */
/* ------------------------------------------------------------------ */

/**
 * Ink to a square grayscale tensor.
 *
 * The ink is scaled to fill the frame with a margin and centred on its own
 * bounding box, so a small scribble and a large one reach the model at the
 * same size — a model trained on cropped formulas has no idea what to do with
 * a page-sized drawing of the same formula.
 *
 * Stroke width is a fraction of the frame rather than of the ink: scaling it
 * with the ink makes a tiny doodle arrive as a fat blob.
 */
function rasterise(strokes: InkStroke[], c: OnnxCfg, H: number, W: number): Float32Array {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('no 2d context');

  g.fillStyle = c.invert ? '#000' : '#fff';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = c.invert ? '#fff' : '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    for (const q of s.p) {
      if (q[0] < x0) x0 = q[0];
      if (q[1] < y0) y0 = q[1];
      if (q[0] > x1) x1 = q[0];
      if (q[1] > y1) y1 = q[1];
    }
  }
  if (!isFinite(x0)) return new Float32Array(W * H);

  const padX = W * 0.08;
  const padY = H * 0.08;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const k = Math.min((W - padX * 2) / bw, (H - padY * 2) / bh);
  const ox = (W - bw * k) / 2 - x0 * k;
  const oy = (H - bh * k) / 2 - y0 * k;

  g.lineWidth = Math.max(1.5, Math.min(W, H) * 0.026);
  for (const s of strokes) {
    if (!s.p || s.p.length < 2) continue;
    g.beginPath();
    g.moveTo(s.p[0][0] * k + ox, s.p[0][1] * k + oy);
    for (let i = 1; i < s.p.length; i++) g.lineTo(s.p[i][0] * k + ox, s.p[i][1] * k + oy);
    g.stroke();
  }

  const img = g.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  const denom = c.std || 1;
  for (let i = 0; i < W * H; i++) {
    // red channel is enough: the canvas is grey by construction
    out[i] = (img[i * 4] / 255 - c.mean) / denom;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

function softmaxPeak(row: Float32Array, C: number): { best: number; p: number } {
  // two passes: the max has to be known before the sum can be taken, or a
  // large logit overflows the exponential
  let best = 0;
  let bv = -Infinity;
  for (let c = 0; c < C; c++) {
    if (row[c] > bv) {
      bv = row[c];
      best = c;
    }
  }
  let sum = 0;
  for (let c = 0; c < C; c++) sum += Math.exp(row[c] - bv);
  return { best, p: 1 / sum };
}

/**
 * Greedy CTC: argmax per frame, then collapse. Repeats must be collapsed
 * *after* blanks are removed, otherwise "ll" in "hello" would be swallowed —
 * which is exactly why CTC needs the blank symbol in the first place.
 */
function decodeCtc(data: Float32Array, dims: number[], labels: string[]) {
  const C = dims[dims.length - 1];
  const T = dims[dims.length - 2];
  let prev = -1;
  let conf = 0;
  let steps = 0;
  const out: string[] = [];
  for (let t = 0; t < T; t++) {
    const { best, p } = softmaxPeak(data.subarray(t * C, t * C + C), C);
    if (best !== 0) {
      conf += p;
      steps++;
      if (best !== prev) out.push(labels[best - 1] ?? '');
    }
    prev = best;
  }
  return { text: out.join(''), conf: steps ? conf / steps : 0 };
}

/* ------------------------------------------------------------------ */
/* Vocab                                                               */
/* ------------------------------------------------------------------ */

async function labels(): Promise<string[]> {
  if (vocab && vocabFor === cfg.vocab) return vocab;
  if (cfg.vocab.trim()) {
    try {
      const res = await fetch(cfg.vocab);
      const j = await res.json();
      if (Array.isArray(j) && j.every((x) => typeof x === 'string')) {
        vocab = j as string[];
        vocabFor = cfg.vocab;
        return vocab;
      }
      // HF tokenizer.json: tokens live under model.vocab as { token: id }
      const m = j?.model?.vocab;
      if (m && typeof m === 'object') {
        const arr: string[] = [];
        for (const [tok, id] of Object.entries(m)) arr[id as number] = tok;
        vocab = arr.map((t) => (t ?? '').replace(/^▁/, ' '));
        vocabFor = cfg.vocab;
        return vocab;
      }
    } catch {
      /* fall through to the default alphabet */
    }
  }
  vocab = ASCII;
  vocabFor = cfg.vocab;
  return vocab;
}

/* ------------------------------------------------------------------ */
/* Recognise                                                           */
/* ------------------------------------------------------------------ */

export interface OnnxRead {
  text: string;
  conf: number;
}

const TIMEOUT = 20000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => window.setTimeout(() => rej(new Error('timed out')), ms)),
  ]);
}

/**
 * Run the configured model over a set of strokes.
 *
 * Returns `null` for every kind of "no answer" — switched off, no model, bad
 * URL, model error, timeout. The caller treats that as "keep the built-in
 * read", so a broken model can never make the feature worse than not having it.
 */
export async function readWithOnnx(strokes: InkStroke[]): Promise<OnnxRead | null> {
  if (!cfg.on || !cfg.model.trim() || !strokes.length) return null;
  try {
    return await withTimeout(run(strokes), TIMEOUT);
  } catch (e) {
    return fail('run', e);
  }
}

async function run(strokes: InkStroke[]): Promise<OnnxRead | null> {
  const o = await runtime();
  if (!o) return null;
  const enc = await session(cfg.model);
  if (!enc) return null;

  const f = frameOf(enc);
  const image = new o.Tensor('float32', rasterise(strokes, cfg, f.h, f.w), [1, 1, f.h, f.w]);
  const lab = await labels();

  if (cfg.kind === 'seq2seq') {
    const dec = cfg.decoder.trim() ? await session(cfg.decoder) : null;
    if (!dec) return fail('decoder', new Error('no decoder model'));

    const h = await enc.run({ [enc.inputNames[0]]: image });
    const hidden = h[enc.outputNames[0]];

    const ids = [cfg.bos];
    let conf = 0;
    for (let i = 0; i < cfg.maxTokens; i++) {
      const toks = new o.Tensor('int64', BigInt64Array.from(ids.map((n) => BigInt(n))), [1, ids.length]);
      const feed: Record<string, any> = { [dec.inputNames[0]]: toks };
      if (dec.inputNames[1]) feed[dec.inputNames[1]] = hidden;
      const out = await dec.run(feed);
      const logits: any = out[dec.outputNames[0]];
      const dims: number[] = logits.dims;
      const V = dims[dims.length - 1];
      const L = dims[dims.length - 2];
      const row = logits.data.subarray((L - 1) * V, L * V);
      const { best, p } = softmaxPeak(row, V);
      conf += p;
      if (best === cfg.eos) break;
      ids.push(best);
    }
    // token id → label; ids below the vocab length are direct indices
    const text = ids
      .slice(1)
      .map((id) => lab[id] ?? '')
      .join('');
    state = 'ready';
    stateNote = '';
    return { text: text.trim(), conf: ids.length > 1 ? conf / (ids.length - 1) : 0 };
  }

  const out = await enc.run({ [enc.inputNames[0]]: image });
  const logits: any = out[enc.outputNames[0]];
  const r = decodeCtc(logits.data as Float32Array, logits.dims as number[], lab);
  state = 'ready';
  stateNote = '';
  return { text: r.text.trim(), conf: r.conf };
}

/* ------------------------------------------------------------------ */

/**
 * Load the configured model without recognising anything.
 *
 * Worth its own button: a bad URL, a CORS-blocked host or a model built for a
 * different runtime all fail here in a second, with a message, instead of
 * silently doing nothing the next time you convert a formula.
 */
export async function warmOnnx(): Promise<string> {
  if (!cfg.model.trim()) return 'Add a model URL first';
  state = 'loading';
  stateNote = 'loading model';
  const s = await session(cfg.model);
  if (!s) return stateNote || 'Could not load the model';

  let dec = null;
  if (cfg.kind === 'seq2seq') {
    if (!cfg.decoder.trim()) return 'This shape needs a decoder URL';
    dec = await session(cfg.decoder);
    if (!dec) return stateNote || 'Could not load the decoder';
  }

  state = 'ready';
  stateNote = '';
  const bits = [`in ${s.inputNames.join(',')} → out ${s.outputNames.join(',')}`];
  if (dec) bits.push(`decoder in ${dec.inputNames.join(',')}`);
  return `Ready · ${bits.join(' · ')}`;
}

load();
state = cfg.on && cfg.model ? 'idle' : 'off';

(window as any).__inkpadOnnx = {
  cfg: onnxCfg,
  set: setOnnx,
  on: onnxOn,
  state: onnxState,
  read: readWithOnnx,
  warm: warmOnnx,
  reset,
};
