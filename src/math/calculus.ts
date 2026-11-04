/**
 * Calculus and engineering maths on top of the expression tree.
 *
 * The calculator could already evaluate an expression but not answer the two
 * things engineering coursework actually asks: "differentiate this" and "what
 * does this integral come to". Both are here, working on the same `Node` tree
 * the parser produces, so a result can be rendered, re-evaluated, or fed back
 * in as another expression.
 *
 * Differentiation is exact and symbolic. Integration is exact for the shapes
 * worth special-casing (polynomials, sin/cos, e^x, 1/x) and falls back to
 * adaptive Simpson otherwise, which is honest about the answer being numeric.
 *
 * This module deliberately imports only the *type* of `Node` and takes the
 * evaluator as an argument. That keeps it free of a runtime import cycle with
 * core.ts, which is what imports it.
 */

import type { Node } from './core';

/* ------------------------------------------------------------------ */
/* Constructors and small predicates                                   */
/* ------------------------------------------------------------------ */

const num = (v: number): Node => ({ k: 'num', v });
const vr = (name: string): Node => ({ k: 'var', name });
const add = (l: Node, r: Node): Node => ({ k: 'bin', op: '+', l, r });
const sub = (l: Node, r: Node): Node => ({ k: 'bin', op: '-', l, r });
const mul = (l: Node, r: Node): Node => ({ k: 'bin', op: '*', l, r });
const div = (l: Node, r: Node): Node => ({ k: 'bin', op: '/', l, r });
const pow = (l: Node, r: Node): Node => ({ k: 'bin', op: '^', l, r });
const neg = (a: Node): Node => ({ k: 'neg', a });
const fn = (name: string, args: Node[]): Node => ({ k: 'fn', name, args });

const isNum = (n: Node, v?: number): boolean => n.k === 'num' && (v === undefined || Math.abs(n.v - v) < 1e-15);
const isZero = (n: Node) => isNum(n, 0);
const isOne = (n: Node) => isNum(n, 1);

/** Does the subtree mention this variable? */
export function mentions(n: Node, v: string): boolean {
  switch (n.k) {
    case 'num':
      return false;
    case 'var':
      return n.name === v;
    case 'neg':
    case 'fact':
    case 'pct':
    case 'abs':
      return mentions(n.a, v);
    case 'bin':
      return mentions(n.l, v) || mentions(n.r, v);
    case 'fn':
      return n.args.some((a) => mentions(a, v));
  }
}

/* ------------------------------------------------------------------ */
/* Simplification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Enough algebra to make a derivative readable.
 *
 * The product and quotient rules spray `0 * …`, `1 * …` and `x^1` through the
 * result; without this a five-term polynomial differentiates into a line nobody
 * can check by eye.
 */
export function simplify(n: Node): Node {
  switch (n.k) {
    case 'num':
    case 'var':
      return n;
    case 'neg': {
      const a = simplify(n.a);
      if (a.k === 'num') return num(-a.v);
      if (a.k === 'neg') return a.a;
      return neg(a);
    }
    case 'abs': {
      const a = simplify(n.a);
      return a.k === 'num' ? num(Math.abs(a.v)) : { k: 'abs', a };
    }
    case 'fact':
    case 'pct':
      return { ...n, a: simplify(n.a) } as Node;
    case 'fn': {
      const args = n.args.map(simplify);
      return fn(n.name, args);
    }
    case 'bin': {
      const l = simplify(n.l);
      const r = simplify(n.r);
      const op = n.op;

      if (l.k === 'num' && r.k === 'num') {
        switch (op) {
          case '+':
            return num(l.v + r.v);
          case '-':
            return num(l.v - r.v);
          case '*':
            return num(l.v * r.v);
          case '/':
            return Math.abs(r.v) < 1e-15 ? { k: 'bin', op, l, r } : num(l.v / r.v);
          case '^':
            return Number.isFinite(Math.pow(l.v, r.v)) ? num(Math.pow(l.v, r.v)) : { k: 'bin', op, l, r };
        }
      }

      switch (op) {
        case '+':
          if (isZero(l)) return r;
          if (isZero(r)) return l;
          break;
        case '-':
          if (isZero(r)) return l;
          if (isZero(l)) return neg(r);
          break;
        case '*':
          if (isZero(l) || isZero(r)) return num(0);
          if (isOne(l)) return r;
          if (isOne(r)) return l;
          if (isNum(l, -1)) return neg(r);
          if (isNum(r, -1)) return neg(l);
          // fold a constant into a constant product: 2 * (3 * x) -> 6x
          if (l.k === 'num' && r.k === 'bin' && r.op === '*' && r.l.k === 'num') {
            return mul(num(l.v * r.l.v), r.r);
          }
          // 2 * (x²/2) -> x². Antiderivatives arrive in exactly this shape.
          if (l.k === 'num' && r.k === 'bin' && r.op === '/' && r.r.k === 'num' && r.r.v !== 0) {
            const c = l.v / r.r.v;
            if (Math.abs(c - 1) < 1e-15) return r.l;
            return mul(num(c), r.l);
          }
          break;
        case '/':
          if (isZero(l)) return num(0);
          if (isOne(r)) return l;
          // (2·x²)/2 is x². The power rule produces this shape constantly.
          if (r.k === 'num' && l.k === 'bin' && l.op === '*' && l.l.k === 'num' && r.v !== 0) {
            const c = l.l.v / r.v;
            if (Math.abs(c - 1) < 1e-15) return l.r;
            return mul(num(c), l.r);
          }
          break;
        case '^':
          if (isZero(r)) return num(1);
          if (isOne(r)) return l;
          if (isOne(l)) return num(1);
          if (isZero(l)) return num(0);
          break;
      }

      const flat: Node = { k: 'bin', op, l, r };
      return op === '+' ? collect(flat) : flat;
    }
  }
}

/**
 * Merge `a*x + b*x` into `(a+b)*x`. Only the shape the product rule produces is
 * handled — a full CAS is not the goal, and a wrong "simplification" is worse
 * than an ugly one.
 */
function collect(n: Node): Node {
  if (n.k !== 'bin' || n.op !== '+') return n;
  const split = (t: Node): { coef: number; body: Node } => {
    if (t.k === 'num') return { coef: t.v, body: num(1) };
    if (t.k === 'bin' && t.op === '*') {
      if (t.l.k === 'num') return { coef: t.l.v, body: t.r };
      if (t.r.k === 'num') return { coef: t.r.v, body: t.l };
    }
    return { coef: 1, body: t };
  };
  const a = split(n.l);
  const b = split(n.r);
  if (render(a.body) !== render(b.body)) return n;
  const c = a.coef + b.coef;
  if (Math.abs(c) < 1e-15) return num(0);
  if (Math.abs(c - 1) < 1e-15) return a.body;
  return mul(num(c), a.body);
}

/* ------------------------------------------------------------------ */
/* Differentiation                                                     */
/* ------------------------------------------------------------------ */

export class DiffError extends Error {}

/**
 * d/dv of an expression.
 *
 * Every rule below is the textbook one; the chain rule is applied by carrying
 * the inner derivative through as a factor.
 */
export function diff(n: Node, v: string): Node {
  switch (n.k) {
    case 'num':
      return num(0);
    case 'var':
      return num(n.name === v ? 1 : 0);
    case 'neg':
      return neg(diff(n.a, v));
    case 'abs':
      // d|u|/dx = u/|u| · u'
      return mul(div(n.a, { k: 'abs', a: n.a }), diff(n.a, v));
    case 'fact':
    case 'pct':
      throw new DiffError('Cannot differentiate a factorial or a percentage');
    case 'bin': {
      const { l, r } = n;
      switch (n.op) {
        case '+':
          return add(diff(l, v), diff(r, v));
        case '-':
          return sub(diff(l, v), diff(r, v));
        case '*':
          return add(mul(diff(l, v), r), mul(l, diff(r, v)));
        case '/':
          return div(sub(mul(diff(l, v), r), mul(l, diff(r, v))), pow(r, num(2)));
        case '^': {
          const lHas = mentions(l, v);
          const rHas = mentions(r, v);
          if (!rHas) {
            // power rule: r·l^(r-1)·l'
            return mul(mul(r, pow(l, sub(r, num(1)))), diff(l, v));
          }
          if (!lHas) {
            // e^x is written exp(x), which is both truer and far more readable
            // than 2.718…^x · ln(2.718…)
            if (l.k === 'num' && Math.abs(l.v - Math.E) < 1e-9) {
              return mul(fn('exp', [r]), diff(r, v));
            }
            // exponential: l^r · ln(l) · r'
            return mul(mul(pow(l, r), fn('ln', [l])), diff(r, v));
          }
          // general: l^r · ( r'·ln(l) + r·l'/l )
          return mul(pow(l, r), add(mul(diff(r, v), fn('ln', [l])), div(mul(r, diff(l, v)), l)));
        }
      }
      break;
    }
    case 'fn': {
      const u = n.args[0];
      const du = u ? diff(u, v) : num(0);
      const chain = (outer: Node): Node => (isOne(du) ? outer : mul(outer, du));
      const name = n.name;
      switch (name) {
        case 'sin':
          return chain(fn('cos', [u]));
        case 'cos':
          return chain(neg(fn('sin', [u])));
        case 'tan':
          return chain(div(num(1), pow(fn('cos', [u]), num(2))));
        case 'cot':
          return chain(neg(div(num(1), pow(fn('sin', [u]), num(2)))));
        case 'sec':
          return chain(mul(fn('sec', [u]), fn('tan', [u])));
        case 'csc':
        case 'cosec':
          return chain(neg(mul(fn('csc', [u]), fn('cot', [u]))));
        case 'asin':
        case 'arcsin':
          return chain(div(num(1), fn('sqrt', [sub(num(1), pow(u, num(2)))])));
        case 'acos':
        case 'arccos':
          return chain(neg(div(num(1), fn('sqrt', [sub(num(1), pow(u, num(2)))]))));
        case 'atan':
        case 'arctan':
          return chain(div(num(1), add(num(1), pow(u, num(2)))));
        case 'sinh':
          return chain(fn('cosh', [u]));
        case 'cosh':
          return chain(fn('sinh', [u]));
        case 'tanh':
          return chain(div(num(1), pow(fn('cosh', [u]), num(2))));
        case 'asinh':
          return chain(div(num(1), fn('sqrt', [add(pow(u, num(2)), num(1))])));
        case 'acosh':
          return chain(div(num(1), fn('sqrt', [sub(pow(u, num(2)), num(1))])));
        case 'atanh':
          return chain(div(num(1), sub(num(1), pow(u, num(2)))));
        case 'ln':
          return chain(div(num(1), u));
        case 'log':
        case 'log10':
        case 'lg':
          return chain(div(num(1), mul(u, fn('ln', [num(10)]))));
        case 'log2':
          return chain(div(num(1), mul(u, fn('ln', [num(2)]))));
        case 'exp':
          return chain(fn('exp', [u]));
        case 'sqrt':
          return chain(div(num(1), mul(num(2), fn('sqrt', [u]))));
        case 'cbrt':
          return chain(div(num(1), mul(num(3), pow(fn('cbrt', [u]), num(2)))));
        case 'abs':
          return chain(div(u, { k: 'abs', a: u }));
        default:
          throw new DiffError('No derivative rule for "' + name + '"');
      }
    }
  }
  throw new DiffError('Cannot differentiate that expression');
}

/* ------------------------------------------------------------------ */
/* Integration                                                         */
/* ------------------------------------------------------------------ */

/** The evaluator core.ts hands in, so this module needs no runtime import. */
export type Evaluator = (n: Node, env: Record<string, number>) => number;

/** Adaptive Simpson, to a relative tolerance of about 1e-10. */
export function integrateNumeric(f: (x: number) => number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new DiffError('Bounds must be finite numbers');
  const simpson = (lo: number, hi: number, flo: number, fmid: number, fhi: number) =>
    ((hi - lo) / 6) * (flo + 4 * fmid + fhi);

  const recurse = (lo: number, hi: number, flo: number, fmid: number, fhi: number, whole: number, depth: number): number => {
    const mid = (lo + hi) / 2;
    const lm = (lo + mid) / 2;
    const rm = (mid + hi) / 2;
    const flm = f(lm);
    const frm = f(rm);
    const left = simpson(lo, mid, flo, flm, fmid);
    const right = simpson(mid, hi, fmid, frm, fhi);
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) < 15e-12 * Math.max(1, Math.abs(left + right))) {
      return left + right + delta / 15;
    }
    return (
      recurse(lo, mid, flo, flm, fmid, left, depth - 1) +
      recurse(mid, hi, fmid, frm, fhi, right, depth - 1)
    );
  };

  const fa = f(a);
  const fb = f(b);
  const fm = f((a + b) / 2);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || !Number.isFinite(fm)) {
    throw new DiffError('The integrand is undefined somewhere in the interval');
  }
  return recurse(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 22);
}

/**
 * Antiderivative for the forms that appear in coursework, or null.
 * Only used to show an exact answer; the numeric value is computed either way.
 */
export function antiderivative(n: Node, v: string): Node | null {
  const c = (k: Node) => mul(k, vr(v));

  // constant
  if (!mentions(n, v)) return c(n);

  // v itself
  if (n.k === 'var' && n.name === v) return div(pow(vr(v), num(2)), num(2));

  // v^n, n constant and not -1
  if (n.k === 'bin' && n.op === '^' && n.l.k === 'var' && n.l.name === v && !mentions(n.r, v)) {
    if (isNum(n.r, -1)) return fn('ln', [{ k: 'abs', a: vr(v) }]);
    const p = n.r.k === 'num' ? n.r.v : NaN;
    if (Number.isFinite(p)) return div(pow(vr(v), num(p + 1)), num(p + 1));
  }

  // a·f  where a is constant
  if (n.k === 'bin' && n.op === '*') {
    const leftC = !mentions(n.l, v);
    const rightC = !mentions(n.r, v);
    if (leftC) {
      const g = antiderivative(n.r, v);
      return g ? mul(n.l, g) : null;
    }
    if (rightC) {
      const g = antiderivative(n.l, v);
      return g ? mul(n.r, g) : null;
    }
  }

  // f ± g
  if (n.k === 'bin' && (n.op === '+' || n.op === '-')) {
    const a = antiderivative(n.l, v);
    const b = antiderivative(n.r, v);
    if (a && b) return n.op === '+' ? add(a, b) : sub(a, b);
    return null;
  }

  if (n.k === 'neg') {
    const a = antiderivative(n.a, v);
    return a ? neg(a) : null;
  }

  // sin/cos of a linear argument
  if (n.k === 'fn' && (n.name === 'sin' || n.name === 'cos')) {
    const u = n.args[0];
    const lin = linear(u, v);
    if (lin && Math.abs(lin.m) > 1e-15) {
      const inner = div(num(1), num(lin.m));
      if (n.name === 'sin') return mul(neg(inner), fn('cos', [u]));
      return mul(inner, fn('sin', [u]));
    }
  }

  // e^u with linear u
  if (n.k === 'fn' && n.name === 'exp') {
    const lin = linear(n.args[0], v);
    if (lin && Math.abs(lin.m) > 1e-15) return mul(div(num(1), num(lin.m)), fn('exp', [n.args[0]]));
  }

  // 1/u with linear u
  if (n.k === 'bin' && n.op === '/' && isOne(n.l)) {
    const lin = linear(n.r, v);
    if (lin && Math.abs(lin.m) > 1e-15) {
      return mul(div(num(1), num(lin.m)), fn('ln', [{ k: 'abs', a: n.r }]));
    }
  }

  return null;
}

/** Is this expression `m*v + c` with no v anywhere else? */
function linear(n: Node, v: string): { m: number; c: number } | null {
  const at = (x: number) => evalLinear(n, v, x);
  const c = at(0);
  const one = at(1);
  if (!Number.isFinite(c) || !Number.isFinite(one)) return null;
  const m = one - c;
  // verify linearity on a third point
  const two = at(2);
  if (!Number.isFinite(two) || Math.abs(two - (2 * m + c)) > 1e-9 * Math.max(1, Math.abs(two))) return null;
  return { m, c };
}

/**
 * Evaluate with a single substitution, used only by `linear` above. Kept local
 * so the module does not need the full evaluator just to test linearity.
 */
let linearEval: ((n: Node, env: Record<string, number>) => number) | null = null;

export function setLinearEvaluator(f: (n: Node, env: Record<string, number>) => number) {
  linearEval = f;
}

function evalLinear(n: Node, v: string, x: number): number {
  if (!linearEval) return NaN;
  try {
    return linearEval(n, { [v]: x });
  } catch {
    return NaN;
  }
}

/* ------------------------------------------------------------------ */
/* Summation and product                                               */
/* ------------------------------------------------------------------ */

export function sumOver(f: Evaluator, body: Node, v: string, from: number, to: number): number {
  let acc = 0;
  const lo = Math.round(from);
  const hi = Math.round(to);
  if (hi - lo > 2_000_000) throw new DiffError('That sum has too many terms');
  for (let k = lo; k <= hi; k++) acc += f(body, { [v]: k });
  return acc;
}

export function prodOver(f: Evaluator, body: Node, v: string, from: number, to: number): number {
  let acc = 1;
  const lo = Math.round(from);
  const hi = Math.round(to);
  if (hi - lo > 2_000_000) throw new DiffError('That product has too many terms');
  for (let k = lo; k <= hi; k++) acc *= f(body, { [v]: k });
  return acc;
}

/* ------------------------------------------------------------------ */
/* Plain-text rendering                                                */
/* ------------------------------------------------------------------ */

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

/** A readable one-line form, for the popup and for pasting into notes. */
export function render(n: Node): string {
  switch (n.k) {
    case 'num':
      return Number.isInteger(n.v) ? String(n.v) : String(Number(n.v.toPrecision(12)));
    case 'var':
      return n.name;
    case 'neg': {
      const s = render(n.a);
      return n.a.k === 'bin' ? '-(' + s + ')' : '-' + s;
    }
    case 'abs':
      return '|' + render(n.a) + '|';
    case 'fact':
      return render(n.a) + '!';
    case 'pct':
      return render(n.a) + '%';
    case 'fn':
      return n.name + '(' + n.args.map(render).join(', ') + ')';
    case 'bin': {
      const p = PREC[n.op] ?? 0;
      const wrap = (t: Node, right: boolean) => {
        const q = t.k === 'bin' ? PREC[t.op] ?? 0 : 9;
        const need = q < p || (right && q === p && (n.op === '-' || n.op === '/'));
        return need ? '(' + render(t) + ')' : render(t);
      };
      const ls = wrap(n.l, false);
      const rs = wrap(n.r, true);
      if (n.op === '*') {
        // "2x" and "3x^2" are how these are written on paper; "2 * x" is how a
        // computer writes them. Only a leading number is glued, so "x * cos(x)"
        // keeps its star and stays unambiguous.
        const tight = n.r.k === 'var' || n.r.k === 'fn' || n.r.k === 'abs' ||
          (n.r.k === 'bin' && (n.r.op === '^' || n.r.op === '*' || n.r.op === '/'));
        if (n.l.k === 'num' && tight && rs[0] !== '(') return ls + rs;
        return ls + ' * ' + rs;
      }
      // exponents are tight: x^2, never x ^ 2
      if (n.op === '^') return ls + '^' + rs;
      return ls + ' ' + n.op + ' ' + rs;
    }
  }
}
