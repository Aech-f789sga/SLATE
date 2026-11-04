/**
 * SLATE math core — a small CAS for handwritten arithmetic.
 *
 * The notebook can read an expression the moment a line ends in "=", so this
 * module has to be more than `eval()`: it must
 *
 *   • parse the way people write, not the way JavaScript parses
 *     (`2x`, `3(x+1)`, `sin30`, `√2`, `x²`, `5!`, `20%`, `|x|`),
 *   • stay exact where exactness is meaningful (`1/3`, `√2`, `π/6`, `sin 30°`),
 *   • solve single-variable equations (`2x+3=7`, `x²-5x+6=0`, `sin x = 1/2`),
 *   • check identities (`sin²x+cos²x=1`) instead of just evaluating them,
 *   • convert units (`5 cm to in`, `3 kg + 400 g`, `60 mph in km/h`).
 *
 * Everything here is pure and dependency-free so it can be unit-tested and
 * reused by the OCR path, the calculator popup and the settings sheet.
 */

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type AngleMode = 'rad' | 'deg';

export interface CalcOptions {
  mode: AngleMode;
  /** Show exact forms (π/6, √2, 3/4) when the value has one. */
  exact: boolean;
  /** Significant decimals for irrational results. */
  decimals: number;
  /** Try unit conversion before treating names as variables. */
  units: boolean;
}

export const DEFAULTS: CalcOptions = { mode: 'rad', exact: true, decimals: 10, units: true };

export type CalcKind = 'value' | 'solutions' | 'identity' | 'compare' | 'units' | 'error';

export interface CalcResult {
  ok: boolean;
  kind: CalcKind;
  /** Human-readable answer, ready for a popup or a text object. */
  text: string;
  /** Same answer as LaTeX, for "convert to formula". */
  latex?: string;
  /** Extra line, e.g. the factorised form or a note about radians. */
  note?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

type TokKind = 'num' | 'id' | 'op' | 'lp' | 'rp' | 'comma' | 'bar';

interface Tok {
  k: TokKind;
  v: string;
  n?: number;
}

const SUP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

/** Normalise the typographic soup a stylus produces. */
export function normalise(src: string): string {
  let s = src;
  s = s.replace(/[×⋅·∙]/g, '*').replace(/[÷∕]/g, '/');
  s = s.replace(/[−–—]/g, '-').replace(/[′’‘]/g, "'").replace(/[″]/g, '"');
  s = s.replace(/[，]/g, ',').replace(/[（]/g, '(').replace(/[）]/g, ')');
  s = s.replace(/[\[\{]/g, '(').replace(/[\]\}]/g, ')');
  s = s.replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/∞/g, 'Infinity');
  s = s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=');
  // superscript runs → ^(...)
  s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (m) => '^(' + m.split('').map((c) => SUP[c] ?? c).join('') + ')');
  // degree sign is a unit on its own
  s = s.replace(/°/g, ' deg');
  return s;
}

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'cosec',
  'asin', 'acos', 'atan', 'atan2', 'acot',
  'arcsin', 'arccos', 'arctan', 'arcsec', 'arccsc', 'arccot',
  'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
  'asinh', 'acosh', 'atanh',
  'ln', 'log', 'log2', 'log10', 'lg', 'exp', 'sqrt', 'cbrt', 'abs',
  'floor', 'ceil', 'round', 'sign', 'sgn', 'fact', 'min', 'max', 'mod', 'gcd', 'lcm',
]);

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity,
  infinity: Infinity,
};

export function tokenise(src: string): Tok[] {
  const s = src;
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === ',' || c === ';') {
      out.push({ k: 'comma', v: ',' });
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ k: 'lp', v: c });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ k: 'rp', v: c });
      i++;
      continue;
    }
    if (c === '|') {
      out.push({ k: 'bar', v: c });
      i++;
      continue;
    }
    if ('+-*/^!%<>=:'.includes(c)) {
      // two-character comparisons
      const two = s.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '==') {
        out.push({ k: 'op', v: two });
        i += 2;
        continue;
      }
      if (c === '=' && s[i + 1] === '=') {
        out.push({ k: 'op', v: '==' });
        i += 2;
        continue;
      }
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === '.') {
        j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      if (s[j] === 'e' || s[j] === 'E') {
        const save = j;
        j++;
        if (s[j] === '+' || s[j] === '-') j++;
        if (/[0-9]/.test(s[j] || '')) {
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        } else j = save;
      }
      const raw = s.slice(i, j);
      out.push({ k: 'num', v: raw, n: Number(raw) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z_]/.test(s[j])) j++;
      // allow log_2 and similar
      if (s[j] === '_') {
        j++;
        while (j < s.length && /[0-9A-Za-z]/.test(s[j])) j++;
      }
      out.push({ k: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    // anything unknown is skipped rather than thrown on
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AST                                                                 */
/* ------------------------------------------------------------------ */

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: Node; r: Node }
  | { k: 'neg'; a: Node }
  | { k: 'fn'; name: string; args: Node[] }
  | { k: 'fact'; a: Node }
  | { k: 'pct'; a: Node }
  | { k: 'abs'; a: Node };

export class MathError extends Error {}

/* ------------------------------------------------------------------ */
/* Parser — Pratt, with implicit multiplication                        */
/* ------------------------------------------------------------------ */

class Parser {
  private i = 0;
  private barDepth = 0;
  constructor(private toks: Tok[]) {}

  peek(off = 0): Tok | undefined {
    return this.toks[this.i + off];
  }

  next(): Tok | undefined {
    return this.toks[this.i++];
  }

  parse(): Node {
    const n = this.expr(0);
    if (this.i < this.toks.length) {
      const t = this.peek();
      if (t && t.k === 'op' && ['<', '>', '<=', '>=', '!=', '=='].includes(t.v)) {
        this.next();
        const r = this.expr(0);
        return { k: 'fn', name: '__cmp' + t.v, args: [n, r] };
      }
    }
    return n;
  }

  private expr(minBp: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
        const bp = 10;
        if (bp < minBp) break;
        this.next();
        const right = this.expr(bp + 1);
        left = { k: 'bin', op: t.v as '+' | '-', l: left, r: right };
        continue;
      }
      if (t.k === 'op' && (t.v === '*' || t.v === '/')) {
        const bp = 20;
        if (bp < minBp) break;
        this.next();
        const right = this.expr(bp + 1);
        left = { k: 'bin', op: t.v as '*' | '/', l: left, r: right };
        continue;
      }
      // implicit multiplication: 2x, 3(x+1), (a)(b), 2π, x sin x
      if (t.k !== 'bar' && this.startsPrimary(t) && 20 >= minBp) {
        const right = this.expr(21);
        left = { k: 'bin', op: '*', l: left, r: right };
        continue;
      }
      break;
    }
    return left;
  }

  private startsPrimary(t: Tok): boolean {
    if (t.k === 'num' || t.k === 'lp' || t.k === 'bar') return true;
    if (t.k === 'id') return true;
    return false;
  }

  private unary(): Node {
    const t = this.peek();
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      const a = this.unary();
      return t.v === '-' ? { k: 'neg', a } : a;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    const t = this.peek();
    if (t && t.k === 'op' && t.v === '^') {
      this.next();
      // right-associative, and the exponent may be signed: 2^-3
      const exp = this.unary();
      return { k: 'bin', op: '^', l: base, r: exp };
    }
    return base;
  }

  private postfix(): Node {
    let n = this.primary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && t.v === '!') {
        this.next();
        n = { k: 'fact', a: n };
        continue;
      }
      if (t && t.k === 'op' && t.v === '%') {
        this.next();
        n = { k: 'pct', a: n };
        continue;
      }
      break;
    }
    return n;
  }

  private primary(): Node {
    const t = this.next();
    if (!t) throw new MathError('Unexpected end of expression');
    if (t.k === 'num') return { k: 'num', v: t.n ?? Number(t.v) };
    if (t.k === 'lp') {
      const n = this.expr(0);
      const close = this.next();
      if (!close || close.k !== 'rp') throw new MathError('Missing closing bracket');
      return n;
    }
    if (t.k === 'bar') {
      this.barDepth++;
      const n = this.expr(0);
      this.barDepth--;
      const close = this.next();
      if (!close || close.k !== 'bar') throw new MathError('Missing closing |');
      return { k: 'abs', a: n };
    }
    if (t.k === 'id') {
      const name = t.v.toLowerCase();
      if (this.peek()?.k === 'lp') {
        if (!FUNCS.has(name)) {
          // f(x) is not supported; treat as implicit product of a variable
          // with a bracketed group, which is what a student usually means.
          const n = this.primary();
          return { k: 'bin', op: '*', l: { k: 'var', name: t.v }, r: n };
        }
        this.next();
        const args: Node[] = [];
        if (this.peek()?.k !== 'rp') {
          for (;;) {
            args.push(this.expr(0));
            const c = this.peek();
            if (c && c.k === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        const close = this.next();
        if (!close || close.k !== 'rp') throw new MathError('Missing ) after ' + name);
        return { k: 'fn', name, args };
      }
      // sin 30, sin 2x, sin x — no brackets, still a function call.
      // `sin^2 x` is (sin x)^2, the way it is written on paper.
      if (FUNCS.has(name)) {
        let expo: Node | null = null;
        const nx0 = this.peek();
        if (nx0 && nx0.k === 'op' && nx0.v === '^') {
          this.next();
          expo = this.postfix();
        }
        let arg = this.power();
        // absorb a numeric or variable product: sin2x → sin(2x)
        for (;;) {
          const nx = this.peek();
          if (!nx) break;
          if (nx.k === 'num') {
            const r = this.power();
            arg = { k: 'bin', op: '*', l: arg, r };
            continue;
          }
          if (nx.k === 'id' && !FUNCS.has(nx.v.toLowerCase())) {
            const r = this.power();
            arg = { k: 'bin', op: '*', l: arg, r };
            continue;
          }
          break;
        }
        const call: Node = { k: 'fn', name, args: [arg] };
        return expo ? { k: 'bin', op: '^', l: call, r: expo } : call;
      }
      // log_2 style
      if (name.startsWith('log_')) {
        const base = Number(name.slice(4));
        if (Number.isFinite(base) && base > 0) {
          return { k: 'fn', name: 'log', args: [{ k: 'num', v: base }, this.primary()] };
        }
      }
      if (name in CONSTS) return { k: 'num', v: CONSTS[name] };
      // multi-letter identifiers that are not functions are products: xy → x*y
      if (name.length > 1) {
        let n: Node | null = null;
        for (const ch of name) {
          if (ch === '_') continue;
          n = n ? { k: 'bin', op: '*', l: n, r: { k: 'var', name: ch } } : { k: 'var', name: ch };
        }
        return n ?? { k: 'var', name: name[0] };
      }
      return { k: 'var', name: t.v };
    }
    throw new MathError('Unexpected "' + t.v + '"');
  }
}

export function parse(src: string): Node {
  const toks = tokenise(normalise(src));
  if (!toks.length) throw new MathError('Nothing to calculate');
  return new Parser(toks).parse();
}

/** Split on the top-level "=" so each side can be parsed separately. */
export function splitEquation(src: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '=' && depth === 0 && src[i + 1] !== '=' && src[i - 1] !== '=') {
      return [src.slice(0, i), src.slice(i + 1)];
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

const toRad = (v: number, m: AngleMode) => (m === 'deg' ? (v * Math.PI) / 180 : v);
const fromRad = (v: number, m: AngleMode) => (m === 'deg' ? (v * 180) / Math.PI : v);

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) {
    return gamma(n + 1);
  }
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Lanczos approximation — lets 0.5! and 4.2! work. */
function gamma(z: number): number {
  const g = 7;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

export function evalNode(n: Node, mode: AngleMode, env: Record<string, number> = {}): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var': {
      const key = n.name;
      if (key in env) return env[key];
      const low = key.toLowerCase();
      if (low in env) return env[low];
      throw new MathError('Unknown value "' + key + '"');
    }
    case 'neg':
      return -evalNode(n.a, mode, env);
    case 'abs':
      return Math.abs(evalNode(n.a, mode, env));
    case 'fact':
      return factorial(evalNode(n.a, mode, env));
    case 'pct':
      return evalNode(n.a, mode, env) / 100;
    case 'bin': {
      const l = evalNode(n.l, mode, env);
      const r = evalNode(n.r, mode, env);
      switch (n.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r === 0) throw new MathError('Division by zero');
          return l / r;
        case '^':
          return Math.pow(l, r);
      }
      return NaN;
    }
    case 'fn':
      return evalFn(n, mode, env);
  }
}

function evalFn(n: Extract<Node, { k: 'fn' }>, mode: AngleMode, env: Record<string, number>): number {
  const name = n.name;
  if (name.startsWith('__cmp')) {
    const a = evalNode(n.args[0], mode, env);
    const b = evalNode(n.args[1], mode, env);
    const eq = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    switch (name.slice(5)) {
      case '<':
        return a < b ? 1 : 0;
      case '>':
        return a > b ? 1 : 0;
      case '<=':
        return a <= b || eq ? 1 : 0;
      case '>=':
        return a >= b || eq ? 1 : 0;
      case '!=':
        return eq ? 0 : 1;
      case '==':
        return eq ? 1 : 0;
    }
  }
  const A = (i: number) => evalNode(n.args[i], mode, env);
  const deg = mode === 'deg';
  switch (name) {
    case 'sin':
      return snap(Math.sin(toRad(A(0), mode)));
    case 'cos':
      return snap(Math.cos(toRad(A(0), mode)));
    case 'tan':
      return snap(Math.tan(toRad(A(0), mode)));
    case 'cot':
      return snap(1 / Math.tan(toRad(A(0), mode)));
    case 'sec':
      return snap(1 / Math.cos(toRad(A(0), mode)));
    case 'csc':
    case 'cosec':
      return snap(1 / Math.sin(toRad(A(0), mode)));
    case 'asin':
    case 'arcsin':
      return fromRad(Math.asin(A(0)), mode);
    case 'acos':
    case 'arccos':
      return fromRad(Math.acos(A(0)), mode);
    case 'atan':
    case 'arctan':
      return fromRad(Math.atan(A(0)), mode);
    case 'acot':
    case 'arccot':
      return fromRad(Math.atan2(1, A(0)), mode);
    case 'atan2':
      return fromRad(Math.atan2(A(0), A(1)), mode);
    case 'sinh':
      return Math.sinh(A(0));
    case 'cosh':
      return Math.cosh(A(0));
    case 'tanh':
      return Math.tanh(A(0));
    case 'coth':
      return 1 / Math.tanh(A(0));
    case 'asinh':
      return Math.asinh(A(0));
    case 'acosh':
      return Math.acosh(A(0));
    case 'atanh':
      return Math.atanh(A(0));
    case 'ln':
      return Math.log(A(0));
    case 'log':
    case 'log10':
    case 'lg':
      return n.args.length > 1 ? Math.log(A(1)) / Math.log(A(0)) : Math.log10(A(0));
    case 'log2':
      return Math.log2(A(0));
    case 'exp':
      return Math.exp(A(0));
    case 'sqrt':
      return Math.sqrt(A(0));
    case 'cbrt':
      return Math.cbrt(A(0));
    case 'abs':
      return Math.abs(A(0));
    case 'floor':
      return Math.floor(A(0));
    case 'ceil':
      return Math.ceil(A(0));
    case 'round':
      return n.args.length > 1
        ? Math.round(A(0) * Math.pow(10, A(1))) / Math.pow(10, A(1))
        : Math.round(A(0));
    case 'sign':
    case 'sgn':
      return Math.sign(A(0));
    case 'fact':
      return factorial(A(0));
    case 'mod':
      return A(0) % A(1);
    case 'min':
      return Math.min(...n.args.map((_, i) => A(i)));
    case 'max':
      return Math.max(...n.args.map((_, i) => A(i)));
    case 'gcd': {
      let a = Math.abs(Math.round(A(0)));
      let b = Math.abs(Math.round(A(1)));
      while (b) [a, b] = [b, a % b];
      return a;
    }
    case 'lcm': {
      const a = Math.abs(Math.round(A(0)));
      const b = Math.abs(Math.round(A(1)));
      if (!a || !b) return 0;
      let x = a;
      let y = b;
      while (y) [x, y] = [y, x % y];
      return (a * b) / x;
    }
  }
  throw new MathError('Unknown function "' + name + '"');
}

/** Kill floating-point fuzz such as 6.123e-17 for cos 90°. */
function snap(v: number): number {
  if (!Number.isFinite(v)) return v;
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-12) return r;
  const big = v * 1e12;
  if (Math.abs(big - Math.round(big)) < 1e-3) return Math.round(big) / 1e12;
  return v;
}

export function varsIn(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case 'var':
      out.add(n.name);
      break;
    case 'bin':
      varsIn(n.l, out);
      varsIn(n.r, out);
      break;
    case 'neg':
    case 'fact':
    case 'pct':
    case 'abs':
      varsIn(n.a, out);
      break;
    case 'fn':
      n.args.forEach((a) => varsIn(a, out));
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Exact formatting                                                    */
/* ------------------------------------------------------------------ */

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Continued-fraction rational approximation. */
function asFraction(v: number, maxDen = 10000): [number, number] | null {
  if (!Number.isFinite(v)) return null;
  const sign = v < 0 ? -1 : 1;
  let x = Math.abs(v);
  let h0 = 0;
  let h1 = 1;
  let k0 = 1;
  let k1 = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    if (Math.abs(h1 / k1 - Math.abs(v)) < 1e-12 * Math.max(1, Math.abs(v))) {
      return [sign * h1, k1];
    }
    const f = x - a;
    if (f < 1e-12) break;
    x = 1 / f;
  }
  if (Math.abs(h1 / k1 - Math.abs(v)) < 1e-10) return [sign * h1, k1];
  return null;
}

function dec(v: number, places: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '-∞' : 'undefined';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-7 || abs >= 1e12)) {
    return v.toExponential(Math.min(places, 10)).replace(/e([+-])(\d)$/, 'e$10$2');
  }
  let s = v.toFixed(Math.max(0, Math.min(15, places)));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/** π-multiple, radical, fraction or decimal — whichever is honest. */
export function formatNumber(v: number, opts: CalcOptions = DEFAULTS): string {
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (Math.abs(v) < 1e-12) return '0';
  if (!opts.exact) return dec(v, opts.decimals);
  if (v < 0) return '-' + formatNumber(-v, opts);
  if (Number.isInteger(v)) return String(v);

  const fr = asFraction(v, 2000);
  if (fr && fr[1] !== 1) return `${fr[0]}/${fr[1]}`;

  // π multiples: v = p/q · π
  const p = v / Math.PI;
  const pf = asFraction(p, 72);
  if (pf && Math.abs(pf[0]) <= 40 && pf[1] <= 36 && Math.abs(pf[0] / pf[1]) < 20) {
    const [a, b] = pf;
    if (a === 1 && b === 1) return 'π';
    if (a === -1 && b === 1) return '-π';
    if (b === 1) return `${a}π`;
    return a === 1 ? `π/${b}` : a === -1 ? `-π/${b}` : `${a}π/${b}`;
  }

  // √n and k√n — pull perfect squares out so √8 reads as 2√2
  for (const k of [1, 1 / 2, 2, 3, 1 / 3, 4]) {
    const q = v / k;
    const sq = q * q;
    if (Math.abs(sq - Math.round(sq)) < 1e-10) {
      const n = Math.round(sq);
      if (n > 1 && n <= 100000 && Math.abs(q - Math.round(q)) > 1e-9) {
        const [outside, inside] = simplifyRadical(n);
        if (inside === 1) return dec(v, opts.decimals);
        const coef = k * outside;
        const rad = `√${inside}`;
        if (Math.abs(coef - 1) < 1e-12) return rad;
        if (Math.abs(coef - 0.5) < 1e-12) return `${rad}/2`;
        return `${dec(coef, 4)}${rad}`;
      }
    }
  }
  return dec(v, opts.decimals);
}

/** √n = outside·√inside */
function simplifyRadical(n: number): [number, number] {
  let outside = 1;
  let inside = n;
  for (let f = 2; f * f <= inside; f++) {
    while (inside % (f * f) === 0) {
      inside /= f * f;
      outside *= f;
    }
  }
  return [outside, inside];
}

/* ------------------------------------------------------------------ */
/* Polynomials                                                         */
/* ------------------------------------------------------------------ */

type Poly = number[]; // index = power

function pTrim(p: Poly): Poly {
  let n = p.length;
  while (n > 1 && Math.abs(p[n - 1]) < 1e-14) n--;
  return p.slice(0, n);
}

function pAdd(a: Poly, b: Poly): Poly {
  const out = new Array(Math.max(a.length, b.length)).fill(0);
  for (let i = 0; i < out.length; i++) out[i] = (a[i] || 0) + (b[i] || 0);
  return pTrim(out);
}

function pMul(a: Poly, b: Poly): Poly {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return pTrim(out);
}

function pScale(a: Poly, k: number): Poly {
  return pTrim(a.map((c) => c * k));
}

/** Convert an AST to polynomial coefficients in `v`, or null when impossible. */
export function toPoly(n: Node, v: string, mode: AngleMode = 'rad'): Poly | null {
  switch (n.k) {
    case 'num':
      return [n.v];
    case 'var':
      return n.name === v ? [0, 1] : null;
    case 'neg': {
      const p = toPoly(n.a, v, mode);
      return p && pScale(p, -1);
    }
    case 'abs': {
      const inner = toPoly(n.a, v, mode);
      if (!inner || inner.length === 1) return inner && [Math.abs(inner[0])];
      return null;
    }
    case 'bin': {
      const a = toPoly(n.l, v, mode);
      const b = toPoly(n.r, v, mode);
      if (!a || !b) return null;
      switch (n.op) {
        case '+':
          return pAdd(a, b);
        case '-':
          return pAdd(a, pScale(b, -1));
        case '*':
          if (a.length + b.length - 2 > 12) return null;
          return pMul(a, b);
        case '/':
          if (b.length !== 1 || Math.abs(b[0]) < 1e-15) return null;
          return pScale(a, 1 / b[0]);
        case '^': {
          if (b.length !== 1) return null;
          const e = b[0];
          if (!Number.isInteger(e) || e < 0 || e > 12) return null;
          let out: Poly = [1];
          for (let i = 0; i < e; i++) {
            out = pMul(out, a);
            if (out.length > 13) return null;
          }
          return out;
        }
      }
      return null;
    }
    case 'fn': {
      // a function of a constant is a constant
      if (varsIn(n).size) return null;
      try {
        return [evalNode(n, mode)];
      } catch {
        return null;
      }
    }
    case 'fact':
    case 'pct': {
      if (varsIn(n).size) return null;
      return [evalNode(n, mode)];
    }
  }
  return null;
}

/** Durand–Kerner: all complex roots of a monic polynomial, then keep reals. */
function polyRoots(p: Poly): number[] {
  const c = pTrim(p.slice());
  const n = c.length - 1;
  if (n <= 0) return [];
  const a = c.map((x) => x / c[n]);
  const roots: { re: number; im: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + 0.4;
    roots.push({ re: Math.cos(ang) * 0.9, im: Math.sin(ang) * 0.9 });
  }
  const evalC = (z: { re: number; im: number }) => {
    let re = 0;
    let im = 0;
    for (let i = n; i >= 0; i--) {
      const nr = re * z.re - im * z.im + a[i];
      const ni = re * z.im + im * z.re;
      re = nr;
      im = ni;
    }
    return { re, im };
  };
  for (let iter = 0; iter < 200; iter++) {
    let maxd = 0;
    for (let i = 0; i < n; i++) {
      const zi = roots[i];
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dzr = zi.re - roots[j].re;
        const dzi = zi.im - roots[j].im;
        const nr = dr * dzr - di * dzi;
        const ni = dr * dzi + di * dzr;
        dr = nr;
        di = ni;
      }
      const f = evalC(zi);
      const den = dr * dr + di * di || 1e-12;
      const qr = (f.re * dr + f.im * di) / den;
      const qi = (f.im * dr - f.re * di) / den;
      zi.re -= qr;
      zi.im -= qi;
      maxd = Math.max(maxd, Math.hypot(qr, qi));
    }
    if (maxd < 1e-13) break;
  }
  const out: number[] = [];
  for (const r of roots) {
    if (Math.abs(r.im) < 1e-7) out.push(Math.abs(r.re) < 1e-11 ? 0 : r.re);
  }
  return dedupe(out);
}

function dedupe(xs: number[], tol = 1e-7): number[] {
  const out: number[] = [];
  for (const x of xs.sort((a, b) => a - b)) {
    if (!out.length || Math.abs(out[out.length - 1] - x) > tol * Math.max(1, Math.abs(x))) out.push(x);
  }
  return out;
}

/** Numeric fallback for equations that are not polynomials (trig, logs, …). */
function scanRoots(f: (x: number) => number, lo: number, hi: number, steps = 4000): number[] {
  const roots: number[] = [];
  let prevX = lo;
  let prevY = f(lo);
  for (let i = 1; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const y = f(x);
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (y === 0) roots.push(x);
      else if (prevY * y < 0) {
        // bisect for a clean root
        let a = prevX;
        let b = x;
        let fa = prevY;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2;
          const fm = f(m);
          if (fa * fm <= 0) b = m;
          else {
            a = m;
            fa = fm;
          }
        }
        roots.push((a + b) / 2);
      }
    }
    prevX = x;
    prevY = y;
  }
  return dedupe(roots.filter((r) => Number.isFinite(r)), 1e-6);
}

function periodOf(f: (x: number) => number, scale = 1): number | null {
  const base = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, Math.PI, 2 * Math.PI, 4 * Math.PI];
  const candidates = base.map((p) => p * scale);
  for (const p of candidates) {
    let ok = true;
    for (let k = 0; k < 9; k++) {
      const x = (0.137 + k * 0.317) * scale;
      const a = f(x);
      const b = f(x + p);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) {
        ok = false;
        break;
      }
    }
    if (ok) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

type Dim = [number, number, number, number, number, number, number, number];
// L, M, T, angle, data, temp, current, luminosity

interface Unit {
  dim: Dim;
  /** to base */
  f: number;
  /** offset for temperatures, applied on the way in */
  off?: number;
  name: string;
}

const D = (l = 0, m = 0, t = 0, a = 0, d = 0, k = 0): Dim => [l, m, t, a, d, k, 0, 0];

const UNITS: Record<string, Unit> = {};
function U(name: string, dim: Dim, f: number, off?: number, label?: string) {
  UNITS[name] = { dim, f, off, name: label || name };
}

/* length — base metre */
U('m', D(1), 1, undefined, 'm');
U('metre', D(1), 1, undefined, 'm');
U('meter', D(1), 1, undefined, 'm');
U('metres', D(1), 1, undefined, 'm');
U('meters', D(1), 1, undefined, 'm');
U('km', D(1), 1000, undefined, 'km');
U('kilometre', D(1), 1000, undefined, 'km');
U('kilometer', D(1), 1000, undefined, 'km');
U('cm', D(1), 0.01, undefined, 'cm');
U('centimetre', D(1), 0.01, undefined, 'cm');
U('centimeter', D(1), 0.01, undefined, 'cm');
U('mm', D(1), 0.001, undefined, 'mm');
U('millimetre', D(1), 0.001, undefined, 'mm');
U('millimeter', D(1), 0.001, undefined, 'mm');
U('um', D(1), 1e-6, undefined, 'µm');
U('nm', D(1), 1e-9, undefined, 'nm');
U('in', D(1), 0.0254, undefined, 'in');
U('inch', D(1), 0.0254, undefined, 'in');
U('inches', D(1), 0.0254, undefined, 'in');
U('ft', D(1), 0.3048, undefined, 'ft');
U('foot', D(1), 0.3048, undefined, 'ft');
U('feet', D(1), 0.3048, undefined, 'ft');
U('yd', D(1), 0.9144, undefined, 'yd');
U('yard', D(1), 0.9144, undefined, 'yd');
U('mi', D(1), 1609.344, undefined, 'mi');
U('mile', D(1), 1609.344, undefined, 'mi');
U('miles', D(1), 1609.344, undefined, 'mi');
U('nmi', D(1), 1852, undefined, 'nmi');
U('au', D(1), 1.495978707e11, undefined, 'AU');
U('ly', D(1), 9.4607e15, undefined, 'ly');
U('pc', D(1), 3.0857e16, undefined, 'pc');

/* mass — base kilogram */
U('kg', D(0, 1), 1, undefined, 'kg');
U('kilogram', D(0, 1), 1, undefined, 'kg');
U('g', D(0, 1), 0.001, undefined, 'g');
U('gram', D(0, 1), 0.001, undefined, 'g');
U('grams', D(0, 1), 0.001, undefined, 'g');
U('mg', D(0, 1), 1e-6, undefined, 'mg');
U('ug', D(0, 1), 1e-9, undefined, 'µg');
U('t', D(0, 1), 1000, undefined, 't');
U('tonne', D(0, 1), 1000, undefined, 't');
U('lb', D(0, 1), 0.45359237, undefined, 'lb');
U('lbs', D(0, 1), 0.45359237, undefined, 'lb');
U('pound', D(0, 1), 0.45359237, undefined, 'lb');
U('pounds', D(0, 1), 0.45359237, undefined, 'lb');
U('oz', D(0, 1), 0.028349523125, undefined, 'oz');
U('ounce', D(0, 1), 0.028349523125, undefined, 'oz');
U('st', D(0, 1), 6.35029318, undefined, 'st');
U('stone', D(0, 1), 6.35029318, undefined, 'st');

/* time — base second */
U('s', D(0, 0, 1), 1, undefined, 's');
U('sec', D(0, 0, 1), 1, undefined, 's');
U('second', D(0, 0, 1), 1, undefined, 's');
U('seconds', D(0, 0, 1), 1, undefined, 's');
U('ms', D(0, 0, 1), 0.001, undefined, 'ms');
U('min', D(0, 0, 1), 60, undefined, 'min');
U('minute', D(0, 0, 1), 60, undefined, 'min');
U('minutes', D(0, 0, 1), 60, undefined, 'min');
U('h', D(0, 0, 1), 3600, undefined, 'h');
U('hr', D(0, 0, 1), 3600, undefined, 'h');
U('hour', D(0, 0, 1), 3600, undefined, 'h');
U('hours', D(0, 0, 1), 3600, undefined, 'h');
U('d', D(0, 0, 1), 86400, undefined, 'd');
U('day', D(0, 0, 1), 86400, undefined, 'd');
U('days', D(0, 0, 1), 86400, undefined, 'd');
U('wk', D(0, 0, 1), 604800, undefined, 'wk');
U('week', D(0, 0, 1), 604800, undefined, 'wk');
U('yr', D(0, 0, 1), 31557600, undefined, 'yr');
U('year', D(0, 0, 1), 31557600, undefined, 'yr');

/* area */
U('m2', D(2), 1, undefined, 'm²');
U('m²', D(2), 1, undefined, 'm²');
U('cm2', D(2), 1e-4, undefined, 'cm²');
U('cm²', D(2), 1e-4, undefined, 'cm²');
U('mm2', D(2), 1e-6, undefined, 'mm²');
U('km2', D(2), 1e6, undefined, 'km²');
U('km²', D(2), 1e6, undefined, 'km²');
U('ha', D(2), 1e4, undefined, 'ha');
U('hectare', D(2), 1e4, undefined, 'ha');
U('acre', D(2), 4046.8564224, undefined, 'acre');
U('ft2', D(2), 0.09290304, undefined, 'ft²');
U('in2', D(2), 0.00064516, undefined, 'in²');
U('yd2', D(2), 0.83612736, undefined, 'yd²');

/* volume — base m³ */
U('l', D(3), 0.001, undefined, 'L');
U('L', D(3), 0.001, undefined, 'L');
U('litre', D(3), 0.001, undefined, 'L');
U('liter', D(3), 0.001, undefined, 'L');
U('ml', D(3), 1e-6, undefined, 'mL');
U('mL', D(3), 1e-6, undefined, 'mL');
U('cl', D(3), 1e-5, undefined, 'cL');
U('dl', D(3), 1e-4, undefined, 'dL');
U('m3', D(3), 1, undefined, 'm³');
U('m³', D(3), 1, undefined, 'm³');
U('cm3', D(3), 1e-6, undefined, 'cm³');
U('cc', D(3), 1e-6, undefined, 'cc');
U('gal', D(3), 0.003785411784, undefined, 'gal');
U('gallon', D(3), 0.003785411784, undefined, 'gal');
U('qt', D(3), 0.000946352946, undefined, 'qt');
U('pt', D(3), 0.000473176473, undefined, 'pt');
U('cup', D(3), 0.0002365882365, undefined, 'cup');
U('floz', D(3), 2.95735295625e-5, undefined, 'fl oz');
U('tbsp', D(3), 1.478676478125e-5, undefined, 'tbsp');
U('tsp', D(3), 4.92892159375e-6, undefined, 'tsp');

/* speed */
U('mps', D(1, 0, -1), 1, undefined, 'm/s');
U('kph', D(1, 0, -1), 1 / 3.6, undefined, 'km/h');
U('kmh', D(1, 0, -1), 1 / 3.6, undefined, 'km/h');
U('mph', D(1, 0, -1), 0.44704, undefined, 'mph');
U('knot', D(1, 0, -1), 0.514444444, undefined, 'kn');
U('knots', D(1, 0, -1), 0.514444444, undefined, 'kn');
U('kn', D(1, 0, -1), 0.514444444, undefined, 'kn');

/* energy */
U('j', D(2, 1, -2), 1, undefined, 'J');
U('J', D(2, 1, -2), 1, undefined, 'J');
U('joule', D(2, 1, -2), 1, undefined, 'J');
U('kj', D(2, 1, -2), 1000, undefined, 'kJ');
U('cal', D(2, 1, -2), 4.184, undefined, 'cal');
U('kcal', D(2, 1, -2), 4184, undefined, 'kcal');
U('wh', D(2, 1, -2), 3600, undefined, 'Wh');
U('kwh', D(2, 1, -2), 3.6e6, undefined, 'kWh');
U('ev', D(2, 1, -2), 1.602176634e-19, undefined, 'eV');
U('btu', D(2, 1, -2), 1055.05585262, undefined, 'BTU');

/* pressure */
U('pa', D(-1, 1, -2), 1, undefined, 'Pa');
U('kpa', D(-1, 1, -2), 1000, undefined, 'kPa');
U('bar', D(-1, 1, -2), 1e5, undefined, 'bar');
U('atm', D(-1, 1, -2), 101325, undefined, 'atm');
U('psi', D(-1, 1, -2), 6894.757293168, undefined, 'psi');
U('mmhg', D(-1, 1, -2), 133.322387415, undefined, 'mmHg');
U('torr', D(-1, 1, -2), 133.322368421, undefined, 'torr');

/* data — base byte */
U('b', D(0, 0, 0, 0, 1), 1, undefined, 'B');
U('byte', D(0, 0, 0, 0, 1), 1, undefined, 'B');
U('bytes', D(0, 0, 0, 0, 1), 1, undefined, 'B');
U('kb', D(0, 0, 0, 0, 1), 1000, undefined, 'kB');
U('mb', D(0, 0, 0, 0, 1), 1e6, undefined, 'MB');
U('gb', D(0, 0, 0, 0, 1), 1e9, undefined, 'GB');
U('tb', D(0, 0, 0, 0, 1), 1e12, undefined, 'TB');
U('kib', D(0, 0, 0, 0, 1), 1024, undefined, 'KiB');
U('mib', D(0, 0, 0, 0, 1), 1048576, undefined, 'MiB');
U('gib', D(0, 0, 0, 0, 1), 1073741824, undefined, 'GiB');

/* angle — base radian */
U('rad', D(0, 0, 0, 1), 1, undefined, 'rad');
U('radian', D(0, 0, 0, 1), 1, undefined, 'rad');
U('deg', D(0, 0, 0, 1), Math.PI / 180, undefined, '°');
U('degree', D(0, 0, 0, 1), Math.PI / 180, undefined, '°');
U('degrees', D(0, 0, 0, 1), Math.PI / 180, undefined, '°');
U('grad', D(0, 0, 0, 1), Math.PI / 200, undefined, 'grad');
U('turn', D(0, 0, 0, 1), Math.PI * 2, undefined, 'turn');

/* temperature — special: offset applies to the value in base units */
U('c', D(0, 0, 0, 0, 0, 1), 1, 273.15, '°C');
U('°c', D(0, 0, 0, 0, 0, 1), 1, 273.15, '°C');
U('celsius', D(0, 0, 0, 0, 0, 1), 1, 273.15, '°C');
U('f', D(0, 0, 0, 0, 0, 1), 5 / 9, 255.3722222222222, '°F');
U('°f', D(0, 0, 0, 0, 0, 1), 5 / 9, 255.3722222222222, '°F');
U('fahrenheit', D(0, 0, 0, 0, 0, 1), 5 / 9, 255.3722222222222, '°F');
U('k', D(0, 0, 0, 0, 0, 1), 1, 0, 'K');
U('kelvin', D(0, 0, 0, 0, 0, 1), 1, 0, 'K');

function unitOf(tok: string): Unit | null {
  if (tok in UNITS) return UNITS[tok];
  const low = tok.toLowerCase();
  if (low in UNITS) return UNITS[low];
  return null;
}

/** "km/h", "m/s^2", "kg m/s2", "sq m" */
export function parseUnitExpr(src: string): { dim: Dim; f: number; label: string; off?: number } | null {
  let s = src.trim().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/\bsq\.?\s*/i, '');
  if (/^sq/i.test(src)) s = s.replace(/^sq/i, '') + '2';
  const parts = s.split(/([*/])/);
  let dim: Dim = D();
  let f = 1;
  let off: number | undefined;
  const numParts: string[] = [];
  const denParts: string[] = [];
  let sign = 1;
  for (const raw of parts) {
    if (!raw) continue;
    if (raw === '*') {
      sign = 1;
      continue;
    }
    if (raw === '/') {
      sign = -1;
      continue;
    }
    let name = raw;
    let pow = 1;
    const m = raw.match(/^(.+?)\^?(-?\d+)$/);
    if (m && !(raw in UNITS)) {
      name = m[1];
      pow = Number(m[2]);
    }
    const u = unitOf(name) || unitOf(name.replace(/s$/, '')) || unitOf(name.replace(/2$/, '2'));
    if (!u) return null;
    const p = pow * sign;
    for (let i = 0; i < dim.length; i++) dim[i] += u.dim[i] * p;
    f *= Math.pow(u.f, p);
    const token = u.name + (Math.abs(p) !== 1 ? '^' + Math.abs(p) : '');
    if (p > 0) numParts.push(token);
    else denParts.push(token);
    // a lone temperature unit carries an offset; compounds never do
    if (parts.length === 1 && u.off !== undefined) off = u.off;
    sign = 1;
  }
  const label = numParts.join('·') + (denParts.length ? '/' + denParts.join('·') : '');
  return { dim, f, label, off };
}

const dimEq = (a: Dim, b: Dim) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

export interface UnitAnswer {
  text: string;
  latex: string;
  note?: string;
}

/** "5 cm to in", "3 kg + 400 g", "60 mph in km/h", "100 F to C" */
export function convertUnits(input: string, opts: CalcOptions = DEFAULTS): UnitAnswer | null {
  const src = normalise(input).replace(/^convert\s+/i, '').trim();
  const arrow = src.match(/^(.*?)(?:\s+(?:to|in|into|as)\s+|\s*(?:->|=>|→)\s*)([a-zA-Z°µ²³/^0-9\s.]+)$/i);
  if (!arrow) return null;
  const left = arrow[1].trim();
  const target = parseUnitExpr(arrow[2].trim());
  if (!target || !left) return null;

  // left side: one or more "number unit" terms joined by + or -
  const terms = left.split(/\s*([+-])\s*(?![^()]*\))/).filter((t) => t !== '');
  let total = 0;
  let dim: Dim | null = null;
  let sign = 1;
  let any = false;
  for (const term of terms) {
    if (term === '+') {
      sign = 1;
      continue;
    }
    if (term === '-') {
      sign = -1;
      continue;
    }
    const m = term.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*([a-zA-Z°µ²³/^0-9\s]*)$/);
    if (!m) return null;
    const num = Number(m[1]);
    if (!Number.isFinite(num)) return null;
    const u = m[2].trim() ? parseUnitExpr(m[2]) : null;
    if (!u) {
      if (m[2].trim()) return null;
      // a bare number next to a unit expression makes no sense
      return null;
    }
    const base = u.off !== undefined ? num * u.f + u.off : num * u.f;
    if (dim && !dimEq(dim, u.dim)) {
      return { text: 'Units do not match', latex: '', note: 'Cannot add ' + u.label + ' to a different quantity.' };
    }
    dim = u.dim;
    total += sign * base;
    any = true;
    sign = 1;
  }
  if (!any || !dim) return null;
  if (!dimEq(dim, target.dim)) {
    return {
      text: 'Units do not match',
      latex: '',
      note: `${dimName(dim)} cannot be converted to ${dimName(target.dim)}.`,
    };
  }
  const out = target.off !== undefined ? (total - target.off) / target.f : total / target.f;
  const value = formatNumber(out, { ...opts, exact: false, decimals: Math.min(opts.decimals, 8) });
  const latexNum = formatNumber(out, { ...opts, exact: false, decimals: Math.min(opts.decimals, 8) });
  return {
    text: `${value} ${target.label}`,
    latex: `${latexNum}\\;\\text{${target.label}}`,
    note: `${src}`,
  };
}

function dimName(d: Dim): string {
  const names = ['length', 'mass', 'time', 'angle', 'data', 'temperature'];
  const idx = d.findIndex((v) => Math.abs(v) > 1e-9);
  return idx >= 0 ? names[idx] : 'dimensionless';
}

interface Term {
  base: number;
  dim: Dim;
  unit: { dim: Dim; f: number; label: string; off?: number };
  sign: number;
}

/** "400 g" → base value plus its dimension. */
function parseUnitTerm(raw: string, sign: number): Term | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([a-zA-Z°µ²³]+(?:\s*\/\s*[a-zA-Z°µ²³]+)?(?:\^?-?\d)?)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = parseUnitExpr(m[2]);
  if (!unit) return null;
  const u = unitOf(m[2].trim()) || null;
  const base = u && u.off !== undefined ? num * unit.f + u.off : num * unit.f;
  return { base, dim: unit.dim, unit: { ...unit, off: u?.off }, sign };
}

/**
 * A single quantity on its own: "45 deg", "5 cm", "98.6 F".
 * Useful on its own (a conversion is often the whole question) and as a
 * sanity check that the unit is spelled the way the table expects.
 */
export function bareQuantity(input: string, opts: CalcOptions = DEFAULTS): UnitAnswer | null {
  const m = normalise(input).trim().match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([a-zA-Z°µ²³]+(?:\s*\/\s*[a-zA-Z°µ²³]+)?)$/);
  if (!m) return null;
  const num = Number(m[1]);
  const unit = parseUnitExpr(m[2]);
  if (!Number.isFinite(num) || !unit) return null;
  const u = unitOf(m[2].trim());
  const base = u && u.off !== undefined ? num * unit.f + u.off : num * unit.f;
  // show the same quantity in the SI counterpart so the answer says something
  const partner = partnerUnit(u ?? null, unit.dim);
  let note: string | undefined;
  if (partner) {
    const v = partner.off !== undefined ? (base - partner.off) / partner.f : base / partner.f;
    note = `${formatNumber(v, { ...opts, exact: false, decimals: 6 })} ${partner.name}`;
  }
  return {
    text: `${formatNumber(num, opts)} ${unit.label}`,
    latex: `${formatNumber(num, { ...opts, exact: false })}\\;\\text{${unit.label}}`,
    note,
  };
}

function partnerUnit(u: Unit | null, dim: Dim): Unit | null {
  if (u && dim[3] > 0) return u.name === '°' ? UNITS.rad : UNITS.deg;
  if (u && dim[5] > 0) return u.name === 'K' ? UNITS.c : UNITS.k;
  if (u && dim[0] === 1 && dim.every((v, i) => i === 0 || Math.abs(v) < 1e-9)) {
    return u.f === 1 ? UNITS.cm : UNITS.m;
  }
  return null;
}

/**
 * A sum of quantities with units: "3 kg + 400 g", "1 m + 30 cm".
 * Only fires when every term carries a unit of the same dimension, so ordinary
 * algebra such as "2x + 3" is never captured.
 */
export function sumUnits(input: string, opts: CalcOptions = DEFAULTS): UnitAnswer | null {
  const src = normalise(input).trim();
  if (!/[a-zA-Z°µ²³]/.test(src)) return null;
  if (!/[+-]/.test(src)) return null;
  const chunks = src.split(/\s*([+-])\s*/).filter((x) => x !== '');
  if (chunks.length < 3) return null;

  const terms: Term[] = [];
  let sign = 1;
  let first: Term | null = null;
  for (const chunk of chunks) {
    if (chunk === '+') {
      sign = 1;
      continue;
    }
    if (chunk === '-') {
      sign = -1;
      continue;
    }
    const t = parseUnitTerm(chunk, sign);
    if (!t) return null;
    if (!first) first = t;
    if (!dimEq(first.dim, t.dim)) return null;
    if (t.dim[5] > 0) return null; // temperature sums are not meaningful
    terms.push(t);
    sign = 1;
  }
  if (terms.length < 2 || !first) return null;

  const total = terms.reduce((a, t) => a + t.sign * t.base, 0);
  const value = total / first.unit.f;
  const shown = formatNumber(value, { ...opts, exact: false, decimals: Math.min(opts.decimals, 8) });
  return {
    text: `${shown} ${first.unit.label}`,
    latex: `${shown}\\;\\text{${first.unit.label}}`,
    note: terms.map((t) => formatNumber(t.base / t.unit.f, { ...opts, exact: false }) + ' ' + t.unit.label).join(' + '),
  };
}

/* ------------------------------------------------------------------ */
/* LaTeX                                                               */
/* ------------------------------------------------------------------ */

const GREEK: Record<string, string> = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', theta: '\\theta',
  lambda: '\\lambda', mu: '\\mu', sigma: '\\sigma', omega: '\\omega', phi: '\\phi',
};

export function toLatex(n: Node): string {
  switch (n.k) {
    case 'num': {
      if (n.v === Math.PI) return '\\pi';
      if (n.v === Math.E) return 'e';
      return formatNumber(n.v, { ...DEFAULTS, exact: true }).replace('π', '\\pi ').replace('√', '\\sqrt');
    }
    case 'var':
      return GREEK[n.name] || n.name;
    case 'neg':
      return '-' + wrapTex(n.a);
    case 'abs':
      return '\\left|' + toLatex(n.a) + '\\right|';
    case 'fact':
      return wrapTex(n.a) + '!';
    case 'pct':
      return wrapTex(n.a) + '\\%';
    case 'bin': {
      if (n.op === '/') return `\\frac{${toLatex(n.l)}}{${toLatex(n.r)}}`;
      if (n.op === '^') return `${wrapTex(n.l)}^{${toLatex(n.r)}}`;
      if (n.op === '*') {
        const l = toLatex(n.l);
        const r = toLatex(n.r);
        return `${needsParen(n.l) ? '(' + l + ')' : l} \\cdot ${needsParen(n.r) ? '(' + r + ')' : r}`;
      }
      return `${toLatex(n.l)} ${n.op} ${toLatex(n.r)}`;
    }
    case 'fn': {
      const name = n.name.replace(/^arc/, 'arc');
      const texName: Record<string, string> = {
        sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc',
        asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', arcsin: '\\arcsin',
        arccos: '\\arccos', arctan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
        ln: '\\ln', log: '\\log', log2: '\\log_2', log10: '\\log_{10}', lg: '\\lg',
        exp: '\\exp', abs: '\\left|', floor: '\\lfloor', ceil: '\\lceil',
      };
      if (name === 'sqrt') return `\\sqrt{${toLatex(n.args[0])}}`;
      if (name === 'cbrt') return `\\sqrt[3]{${toLatex(n.args[0])}}`;
      if (name === 'abs') return `\\left|${toLatex(n.args[0])}\\right|`;
      if (name === 'floor' || name === 'ceil') {
        const close = name === 'floor' ? '\\rfloor' : '\\rceil';
        return `${texName[name]}${toLatex(n.args[0])}${close}`;
      }
      const fn = texName[name] || `\\operatorname{${name}}`;
      return `${fn}\\left(${n.args.map(toLatex).join(', ')}\\right)`;
    }
  }
}

function needsParen(n: Node): boolean {
  return n.k === 'bin' && (n.op === '+' || n.op === '-');
}

function wrapTex(n: Node): string {
  const s = toLatex(n);
  return needsParen(n) ? `\\left(${s}\\right)` : s;
}

/* ------------------------------------------------------------------ */
/* Top level                                                           */
/* ------------------------------------------------------------------ */

type Intent = 'auto' | 'solve' | 'simplify' | 'check' | 'convert';

function stripPrefix(src: string): { text: string; intent: Intent } {
  let s = src.trim();
  let intent: Intent = 'auto';
  const rules: [RegExp, Intent][] = [
    [/^(?:please\s+)?(?:solve|find\s+x|roots?\s+of)\s+/i, 'solve'],
    [/^(?:simplify|evaluate|calculate|compute|calc|what\s+is|what's|how\s+much\s+is)\s+/i, 'simplify'],
    [/^(?:check|verify|is\s+it\s+true\s+that)\s+/i, 'check'],
    [/^(?:convert)\s+/i, 'convert'],
  ];
  for (const [re, kind] of rules) {
    if (re.test(s)) {
      s = s.replace(re, '');
      intent = kind;
      break;
    }
  }
  s = s.replace(/^=\s*/, '').replace(/[?？]\s*$/, '').replace(/=+\s*$/, '').trim();
  return { text: s, intent };
}

/** Numbers that only make sense when rounded: keep them short. */
function tidy(v: number, opts: CalcOptions): string {
  if (Number.isInteger(v)) return String(v);
  const r = Math.round(v * 1e9) / 1e9;
  return formatNumber(r, opts);
}

function solveEquation(
  lhs: Node,
  rhs: Node,
  variable: string,
  opts: CalcOptions
): CalcResult {
  const f = (x: number) => {
    try {
      return evalNode(lhs, opts.mode, { [variable]: x }) - evalNode(rhs, opts.mode, { [variable]: x });
    } catch {
      return NaN;
    }
  };

  const diff: Node = { k: 'bin', op: '-', l: lhs, r: rhs };
  const poly = toPoly(diff, variable, opts.mode);

  let roots: number[] = [];
  let exact: string[] = [];
  let degree = 0;

  if (poly) {
    degree = poly.length - 1;
    if (degree === 0) {
      const c = poly[0];
      return Math.abs(c) < 1e-12
        ? { ok: true, kind: 'identity', text: 'True for every value', latex: '\\text{identity}' }
        : { ok: true, kind: 'compare', text: 'No solution', latex: '\\varnothing' };
    }
    if (degree === 1) {
      const x = -poly[0] / poly[1];
      roots = [x];
      exact = [formatNumber(x, opts)];
    } else if (degree === 2) {
      const [c, b, a] = [poly[0], poly[1], poly[2]];
      const disc = b * b - 4 * a * c;
      if (disc < -1e-12) {
        const re = -b / (2 * a);
        const im = Math.sqrt(-disc) / (2 * a);
        return {
          ok: true,
          kind: 'solutions',
          text: `No real solution (x = ${tidy(re, opts)} ± ${tidy(Math.abs(im), opts)}i)`,
          latex: `x = ${tidy(re, opts)} \\pm ${tidy(Math.abs(im), opts)}i`,
          note: 'The discriminant is negative.',
        };
      }
      const sq = Math.sqrt(Math.max(0, disc));
      const r1 = (-b + sq) / (2 * a);
      const r2 = (-b - sq) / (2 * a);
      roots = dedupe([r1, r2]);
      exact = roots.map((r) => formatNumber(r, opts));
      // exact radical form for a perfect-square discriminant
      if (opts.exact && Math.abs(sq - Math.round(sq)) < 1e-10 && Math.abs(a - 1) < 1e-12) {
        const m = Math.round(sq);
        const bAbs = Math.abs(b);
        const sign = b < 0 ? '+' : '-';
        if (m > 1 && !Number.isInteger(Math.sqrt(m))) {
          exact = [`(${-b} ${sign} √${m})/2`];
        }
      }
    } else {
      roots = polyRoots(poly);
      exact = roots.map((r) => formatNumber(r, opts));
    }
  } else {
    // not a polynomial — scan, then look for a period
    let allZero = true;
    for (let i = 0; i < 24; i++) {
      const y = f(0.21 + i * 0.37);
      if (!Number.isFinite(y) || Math.abs(y) > 1e-9) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      return { ok: true, kind: 'identity', text: 'True for every value', latex: '\\text{identity}' };
    }
    const scale = opts.mode === 'deg' ? 180 / Math.PI : 1;
    const period = periodOf(f, scale);
    if (period) {
      roots = scanRoots(f, -1e-9, period * 1.0000001, 6000).filter((r) => r < period - 1e-6);
    } else {
      // log, exp and friends: the root can sit far outside a small window
      roots = [
        ...scanRoots(f, -200, 200, 4000),
        ...scanRoots(f, 200, 100000, 6000),
        ...scanRoots(f, -100000, -200, 4000),
      ];
    }
    // drop poles (tan, sec, …) where the sign flips through infinity
    roots = roots
      .filter((r) => {
        const y = f(r);
        return Number.isFinite(y) && Math.abs(y) < 1e-3;
      })
      .map((r) => (Math.abs(r) < 1e-9 ? 0 : r));
    exact = roots.map((r) => formatNumber(r, opts));
  }

  if (!roots.length) {
    return { ok: true, kind: 'solutions', text: 'No real solution', latex: '\\varnothing' };
  }

  const uniq = dedupe(roots, 1e-6);
  const labels = uniq.map((r) => formatNumber(r, opts));
  const deg = opts.mode === 'deg';
  const period = poly ? null : periodOf(f, deg ? 180 / Math.PI : 1);

  const head = uniq.length === 1 ? `${variable} = ${labels[0]}` : `${variable} = ${labels.join(', ')}`;
  let note: string | undefined;
  if (period) {
    const p = period;
    const pTxt = formatNumber(p, opts);
    note = `Repeats every ${pTxt}${deg ? '°' : ''} — add n·${pTxt} for the general solution.`;
  } else if (degree >= 3) {
    note = `Degree ${degree}; roots found numerically.`;
  }
  const latex = uniq.length === 1
    ? `${variable} = ${labels[0]}`
    : `${variable} \\in \\{${labels.join(',\\; ')}\\}`;

  return { ok: true, kind: 'solutions', text: head, latex, note };
}

function compareSides(lhs: Node, rhs: Node, opts: CalcOptions): CalcResult {
  const vars = new Set([...varsIn(lhs), ...varsIn(rhs)]);
  if (!vars.size) {
    const a = evalNode(lhs, opts.mode);
    const b = evalNode(rhs, opts.mode);
    const equal = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    return {
      ok: true,
      kind: 'compare',
      text: equal ? `True — both sides equal ${formatNumber(a, opts)}` : `False — ${formatNumber(a, opts)} ≠ ${formatNumber(b, opts)}`,
      latex: `${toLatex(lhs)} ${equal ? '=' : '\\neq'} ${toLatex(rhs)}`,
    };
  }
  // identity test on random samples
  const names = [...vars];
  let ok = true;
  for (let i = 0; i < 60 && ok; i++) {
    const env: Record<string, number> = {};
    names.forEach((n, j) => {
      env[n] = 0.37 + i * 0.113 + j * 0.71;
    });
    try {
      const a = evalNode(lhs, opts.mode, env);
      const b = evalNode(rhs, opts.mode, env);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a))) ok = false;
    } catch {
      ok = false;
    }
  }
  if (ok) {
    return {
      ok: true,
      kind: 'identity',
      text: 'Identity — true for all values',
      latex: `${toLatex(lhs)} \\equiv ${toLatex(rhs)}`,
    };
  }
  if (names.length === 1) {
    return solveEquation(lhs, rhs, names[0], opts);
  }
  return { ok: true, kind: 'compare', text: 'Not an identity', latex: '' };
}

export function calculate(raw: string, options: Partial<CalcOptions> = {}): CalcResult {
  const opts: CalcOptions = { ...DEFAULTS, ...options };
  const { text, intent } = stripPrefix(raw);
  if (!text) return { ok: false, kind: 'error', text: '', error: 'Nothing to calculate' };

  // units first — "5 cm to in" would otherwise parse as variables
  if (opts.units) {
    const bare = bareQuantity(text, opts);
    if (bare) return { ok: true, kind: 'units', text: bare.text, latex: bare.latex, note: bare.note };
    const conv = convertUnits(text, opts);
    if (conv) return { ok: true, kind: 'units', text: conv.text, latex: conv.latex, note: conv.note };
    const sum = sumUnits(text, opts);
    if (sum) return { ok: true, kind: 'units', text: sum.text, latex: sum.latex, note: sum.note };
  }

  const eq = splitEquation(text);
  try {
    if (eq) {
      const left = parse(eq[0]);
      const right = parse(eq[1]);
      const vars = new Set([...varsIn(left), ...varsIn(right)]);
      if (intent === 'solve') {
        return solveEquation(left, right, pickVariable(vars), opts);
      }
      // "sin²x+cos²x=1" and "1+1=3" are checks, not solves; compareSides
      // falls back to solving when the two sides are simply not identical.
      return compareSides(left, right, opts);
    }

    const node = parse(text);
    const vars = varsIn(node);
    if (vars.size) {
      return {
        ok: false,
        kind: 'error',
        text: 'Needs a value for ' + [...vars].join(', '),
        error: 'unbound',
        latex: toLatex(node),
      };
    }
    const v = evalNode(node, opts.mode);
    const shown = formatNumber(v, opts);
    return {
      ok: true,
      kind: 'value',
      text: shown,
      latex: toLatex(node) + ' = ' + shown.replace('π', '\\pi ').replace('√', '\\sqrt'),
    };
  } catch (e) {
    const msg = e instanceof MathError ? e.message : 'Could not read that expression';
    return { ok: false, kind: 'error', text: '', error: msg };
  }
}

function pickVariable(vars: Set<string>): string {
  for (const preferred of ['x', 'y', 'z', 't', 'n', 'a']) if (vars.has(preferred)) return preferred;
  return [...vars][0] || 'x';
}
