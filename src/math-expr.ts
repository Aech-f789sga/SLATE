/**
 * Structured Math Expression AST, Parser, Layout & Canvas2D Renderer.
 *
 * Pure and font-aware: every text atom, operator, fraction, root, integral,
 * summation, limit, exponent, subscript, and matrix is measured and rendered
 * using the caller's chosen font family (`FF(s.f)`), size, weight, slant, and
 * color so expressions adopt handwritten, serif, monospace, or sans fonts.
 */

export interface MathMeasurer {
  measureText(
    text: string,
    fontPx: number,
    bold: boolean,
    italic: boolean,
  ): { width: number; ascent: number; descent: number };
}

export interface MathRenderOptions {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  maxWidth?: number;
}

export type MathNode =
  | { k: 'text'; v: string }
  | { k: 'space'; w: number }
  | { k: 'row'; items: MathNode[] }
  | { k: 'frac'; num: MathNode; den: MathNode }
  | { k: 'binom'; top: MathNode; bot: MathNode }
  | { k: 'sup'; base: MathNode | null; exp: MathNode }
  | { k: 'sub'; base: MathNode | null; sub: MathNode }
  | { k: 'subsup'; base: MathNode | null; sub: MathNode; exp: MathNode }
  | { k: 'sqrt'; index?: MathNode | null; rad: MathNode }
  | { k: 'bigop'; op: '∫' | '∬' | '∑' | '∏' | 'lim'; sub?: MathNode | null; sup?: MathNode | null }
  | { k: 'accent'; kind: 'vec' | 'bar' | 'hat'; body: MathNode }
  | { k: 'delim'; left: string; right: string; body: MathNode }
  | { k: 'matrix'; kind: 'pmatrix' | 'bmatrix' | 'vmatrix' | 'Bmatrix' | 'cases' | 'matrix'; rows: MathNode[][] };

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
  Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', cdot: '·', ast: '∗', div: '÷',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', propto: '∝', sim: '∼', simeq: '≃', cong: '≅',
  infty: '∞', infty2: '∞',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦',
  partial: '∂', nabla: '∇',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', land: '∧', lor: '∨',
  therefore: '∴', because: '∵',
  angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', degree: '°', prime: '′',
  ldots: '…', cdots: '⋯', dots: '…',
  R: 'ℝ', mathbbR: 'ℝ', Z: 'ℤ', N: 'ℕ', Q: 'ℚ', C: 'ℂ',
  quad: '  ', qquad: '    ',
};

const BLACKBOARD: Record<string, string> = {
  R: 'ℝ', Z: 'ℤ', N: 'ℕ', Q: 'ℚ', C: 'ℂ', P: 'ℙ',
};

const NAMED_FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'ln', 'log', 'lg', 'exp', 'det', 'max', 'min', 'gcd', 'lcm', 'mod', 'arg', 'deg',
]);

const MATH_CMD_RE =
  /\\(?:d?frac|tfrac|sqrt|i?int|sum|prod|lim|binom|abs|vec|bar|overline|hat|left|begin|mathbb|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|pm|mp|times|cdot|div|leq?|geq?|neq?|approx|equiv|propto|infty|to|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftrightarrow|partial|nabla|in|notin|subset|subseteq|supset|cup|cap|emptyset|forall|exists|therefore|because|angle|perp|parallel|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|det|max|min|gcd)\b/;

/** Fast check for whether a text string contains structured math notation. */
export function containsMathSyntax(txt: string): boolean {
  if (!txt) return false;
  if (/(?:^|[^\\])\$[^$\n]+\$/.test(txt)) return true;
  if (MATH_CMD_RE.test(txt)) return true;
  if (/[\^_]\{[^}]*\}/.test(txt)) return true;
  if (/[A-Za-z0-9)\]}∫∑∏]\^[A-Za-z0-9+\-]/.test(txt)) return true;
  if (/(?:^|[^A-Za-z])[A-Za-z0-9)\]}∫∑∏]_[A-Za-z0-9]/.test(txt)) return true;
  if (/[∫∑∏]/.test(txt) && /[_^]/.test(txt)) return true;
  return false;
}

class ExprParser {
  private i = 0;
  constructor(
    private src: string,
    private inDollar = false,
  ) {}

  eof(): boolean {
    return this.i >= this.src.length;
  }

  peek(offset = 0): string {
    return this.src[this.i + offset] || '';
  }

  skipSpaces() {
    while (this.i < this.src.length && this.src[this.i] === ' ') this.i++;
  }

  parseSequence(stopTokens: string[] = []): MathNode {
    const items: MathNode[] = [];
    while (!this.eof()) {
      let stopped = false;
      for (const tok of stopTokens) {
        if (this.src.startsWith(tok, this.i)) {
          stopped = true;
          break;
        }
      }
      if (stopped) break;

      const ch = this.peek();
      if (ch === '}') break;

      const node = this.parseAtomWithScripts();
      if (node) {
        const toPush = node.k === 'row' ? node.items : [node];
        for (const subNode of toPush) {
          // Merge adjacent plain text nodes for clean kerning & text measurement.
          const prev = items[items.length - 1];
          if (prev && prev.k === 'text' && subNode.k === 'text') {
            prev.v += subNode.v;
          } else {
            items.push(subNode);
          }
        }
      }
    }
    if (items.length === 0) return { k: 'text', v: '' };
    if (items.length === 1) return items[0];
    return { k: 'row', items };
  }

  private parseBracedArg(): MathNode {
    this.skipSpaces();
    if (this.peek() === '{') {
      this.i++;
      const inner = this.parseSequence(['}']);
      if (this.peek() === '}') this.i++;
      return inner;
    }
    // Single-token fallback: `\frac 1 2` or `x^2`
    const atom = this.parsePrimary();
    return atom || { k: 'text', v: '' };
  }

  private parseBracketArg(): MathNode | null {
    this.skipSpaces();
    if (this.peek() !== '[') return null;
    this.i++;
    const inner = this.parseSequence([']']);
    if (this.peek() === ']') this.i++;
    return inner;
  }

  private readBalancedRaw(openCh: string, closeCh: string): string {
    if (this.peek() !== openCh) return '';
    this.i++;
    let depth = 1;
    const start = this.i;
    while (this.i < this.src.length && depth > 0) {
      const c = this.src[this.i];
      if (c === '\\') {
        this.i += 2;
        continue;
      }
      if (c === openCh) depth++;
      else if (c === closeCh) {
        depth--;
        if (depth === 0) {
          const out = this.src.slice(start, this.i);
          this.i++;
          return out;
        }
      }
      this.i++;
    }
    return this.src.slice(start);
  }

  private readScriptArg(ch: string): MathNode | null {
    const start = this.i;
    if (this.peek() !== ch) return null;
    this.i++;
    this.skipSpaces();
    if (this.peek() === '{') {
      return this.parseBracedArg();
    }
    const next = this.peek();
    if (!next) {
      this.i = start;
      return null;
    }
    if (next === '\\') {
      const atom = this.parsePrimary();
      return atom || { k: 'text', v: '' };
    }
    // Outside $...$, only treat single alphanumeric/sign after ^/_ as script if valid math atom
    if (/^[A-Za-z0-9+\-′]$/.test(next)) {
      this.i++;
      return { k: 'text', v: next };
    }
    this.i = start;
    return null;
  }

  private canAttachUnbracedScript(base: MathNode | null): boolean {
    if (!base) return false;
    if (this.inDollar) return true;
    if (base.k === 'bigop' || base.k === 'delim' || base.k === 'frac' || base.k === 'sqrt') return true;
    if (base.k === 'text') {
      const trimmed = base.v.trimEnd();
      if (!trimmed) return false;
      const last = trimmed[trimmed.length - 1];
      return /[A-Za-z0-9)\]}πθασωΔΣΠ∫]/.test(last);
    }
    return true;
  }

  private parseAtomWithScripts(): MathNode | null {
    const base = this.parsePrimary();
    if (!base) return null;

    // Look ahead for _{...} / ^{...} (or ^x / _x)
    let sub: MathNode | null = null;
    let sup: MathNode | null = null;

    for (let pass = 0; pass < 2; pass++) {
      const save = this.i;
      // Do not consume scripts across spaces if base is bigop unless immediately following or space+script on bigop
      if (base.k === 'bigop') this.skipSpaces();
      const c = this.peek();
      if (c === '_' && !sub) {
        const afterNext = this.src[this.i + 1];
        const braced = afterNext === '{' || (afterNext === ' ' && this.src[this.i + 2] === '{');
        if (braced || this.canAttachUnbracedScript(base)) {
          const parsed = this.readScriptArg('_');
          if (parsed) {
            sub = parsed;
            continue;
          }
        }
      } else if (c === '^' && !sup) {
        const afterNext = this.src[this.i + 1];
        const braced = afterNext === '{' || (afterNext === ' ' && this.src[this.i + 2] === '{');
        if (braced || this.canAttachUnbracedScript(base)) {
          const parsed = this.readScriptArg('^');
          if (parsed) {
            sup = parsed;
            continue;
          }
        }
      }
      this.i = save;
      break;
    }

    if (!sub && !sup) return base;

    if (base.k === 'bigop') {
      return {
        k: 'bigop',
        op: base.op,
        sub: sub ?? base.sub ?? null,
        sup: sup ?? base.sup ?? null,
      };
    }

    // If base is a multi-char plain text node like "Area + x", split off the trailing token ("x")
    // so only "x" gets the exponent/subscript, not the whole preceding word/phrase!
    if (base.k === 'text' && base.v.length > 1) {
      const m = base.v.match(/^(.*?)([A-Za-z0-9]+|[)\]]|[α-ωΑ-Ωπθ])$/);
      if (m && m[1]) {
        const prefix: MathNode = { k: 'text', v: m[1] };
        const tail: MathNode = { k: 'text', v: m[2] };
        const scripted: MathNode =
          sub && sup
            ? { k: 'subsup', base: tail, sub, exp: sup }
            : sup
              ? { k: 'sup', base: tail, exp: sup }
              : { k: 'sub', base: tail, sub: sub! };
        return { k: 'row', items: [prefix, scripted] };
      }
    }

    if (sub && sup) return { k: 'subsup', base, sub, exp: sup };
    if (sup) return { k: 'sup', base, exp: sup };
    return { k: 'sub', base, sub: sub! };
  }

  private parsePrimary(): MathNode | null {
    if (this.eof()) return null;
    const ch = this.peek();

    // Unwrapped $...$ inline math delimiters
    if (ch === '$' && !this.inDollar) {
      const dbl = this.peek(1) === '$';
      const delim = dbl ? '$$' : '$';
      const closeIdx = this.src.indexOf(delim, this.i + delim.length);
      if (closeIdx > this.i) {
        const inner = this.src.slice(this.i + delim.length, closeIdx);
        this.i = closeIdx + delim.length;
        const sub = new ExprParser(inner, true);
        return sub.parseSequence();
      }
    }

    if (ch === '{') {
      return this.parseBracedArg();
    }

    // Leading standalone superscript/subscript like ^{2}
    if (ch === '^' && this.src[this.i + 1] === '{') {
      const exp = this.readScriptArg('^');
      if (exp) return { k: 'sup', base: null, exp };
    }
    if (ch === '_' && this.src[this.i + 1] === '{') {
      const sub = this.readScriptArg('_');
      if (sub) return { k: 'sub', base: null, sub };
    }

    if (ch === '∫' || ch === '∑' || ch === '∏') {
      this.i++;
      return { k: 'bigop', op: ch };
    }

    if (ch === '\\') {
      return this.parseCommand();
    }

    // Consume plain text run up to next special character
    let end = this.i + 1;
    while (end < this.src.length) {
      const c = this.src[end];
      if (
        c === '\\' ||
        c === '{' ||
        c === '}' ||
        c === '$' ||
        c === '^' ||
        c === '_' ||
        c === '∫' ||
        c === '∑' ||
        c === '∏'
      ) {
        break;
      }
      end++;
    }
    const text = this.src.slice(this.i, end);
    this.i = end;
    return { k: 'text', v: text };
  }

  private parseCommand(): MathNode {
    this.i++; // consume '\'
    if (this.eof()) return { k: 'text', v: '\\' };

    const first = this.peek();
    // Escaped single non-letter punctuation: \{ \} \| \, \; \! \: \
    if (!/[A-Za-z]/.test(first)) {
      this.i++;
      if (first === ',' || first === ':' || first === ';') {
        return { k: 'space', w: first === ',' ? 0.18 : 0.28 };
      }
      if (first === '!') return { k: 'space', w: 0 };
      if (first === ' ') return { k: 'text', v: ' ' };
      if (first === '{' || first === '}' || first === '|' || first === '%' || first === '&' || first === '#') {
        return { k: 'text', v: first };
      }
      return { k: 'text', v: first };
    }

    let j = this.i;
    while (j < this.src.length && /[A-Za-z]/.test(this.src[j])) j++;
    const cmd = this.src.slice(this.i, j);
    this.i = j;

    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
      const num = this.parseBracedArg();
      const den = this.parseBracedArg();
      return { k: 'frac', num, den };
    }

    if (cmd === 'binom') {
      const top = this.parseBracedArg();
      const bot = this.parseBracedArg();
      return { k: 'binom', top, bot };
    }

    if (cmd === 'sqrt') {
      const idx = this.parseBracketArg();
      const rad = this.parseBracedArg();
      return { k: 'sqrt', index: idx, rad };
    }

    if (cmd === 'abs') {
      const body = this.parseBracedArg();
      return { k: 'delim', left: '|', right: '|', body };
    }

    if (cmd === 'vec' || cmd === 'bar' || cmd === 'overline' || cmd === 'hat') {
      const body = this.parseBracedArg();
      const kind = cmd === 'vec' ? 'vec' : cmd === 'hat' ? 'hat' : 'bar';
      return { k: 'accent', kind, body };
    }

    if (cmd === 'int') return { k: 'bigop', op: '∫' };
    if (cmd === 'iint') return { k: 'bigop', op: '∬' };
    if (cmd === 'sum') return { k: 'bigop', op: '∑' };
    if (cmd === 'prod') return { k: 'bigop', op: '∏' };
    if (cmd === 'lim') return { k: 'bigop', op: 'lim' };

    if (cmd === 'mathbb') {
      const raw = this.readBalancedRaw('{', '}').trim();
      return { k: 'text', v: BLACKBOARD[raw] || raw };
    }

    if (cmd === 'text' || cmd === 'mathrm' || cmd === 'mathbf' || cmd === 'mathit') {
      return this.parseBracedArg();
    }

    if (cmd === 'left') {
      this.skipSpaces();
      let left = this.readDelimiterToken();
      const body = this.parseSequence(['\\right']);
      let right = '';
      if (this.src.startsWith('\\right', this.i)) {
        this.i += '\\right'.length;
        this.skipSpaces();
        right = this.readDelimiterToken();
      }
      return { k: 'delim', left, right, body };
    }

    if (cmd === 'begin') {
      const env = this.readBalancedRaw('{', '}').trim();
      const endTag = `\\end{${env}}`;
      const endIdx = this.src.indexOf(endTag, this.i);
      const bodySrc = endIdx >= 0 ? this.src.slice(this.i, endIdx) : this.src.slice(this.i);
      this.i = endIdx >= 0 ? endIdx + endTag.length : this.src.length;

      const rowStrs = bodySrc.split('\\\\');
      const rows = rowStrs.map((rs) =>
        splitTopLevelAmpersand(rs).map((cell) => new ExprParser(cell.trim(), true).parseSequence()),
      );
      const kind: 'pmatrix' | 'bmatrix' | 'vmatrix' | 'Bmatrix' | 'cases' | 'matrix' =
        env === 'pmatrix' ||
        env === 'bmatrix' ||
        env === 'vmatrix' ||
        env === 'Bmatrix' ||
        env === 'cases'
          ? env
          : 'matrix';
      return { k: 'matrix', kind, rows };
    }

    if (SYMBOLS[cmd] !== undefined) {
      return { k: 'text', v: SYMBOLS[cmd] };
    }

    if (NAMED_FUNCS.has(cmd)) {
      return { k: 'text', v: cmd };
    }

    // Unknown command — render cleanly without crashing
    return { k: 'text', v: cmd };
  }

  private readDelimiterToken(): string {
    if (this.eof()) return '';
    const c = this.peek();
    if (c === '.') {
      this.i++;
      return '';
    }
    if (c === '\\') {
      this.i++;
      const n = this.peek();
      if (n === '{' || n === '}' || n === '|') {
        this.i++;
        return n;
      }
      let j = this.i;
      while (j < this.src.length && /[A-Za-z]/.test(this.src[j])) j++;
      const w = this.src.slice(this.i, j);
      this.i = j;
      if (w === 'langle') return '⟨';
      if (w === 'rangle') return '⟩';
      return w;
    }
    this.i++;
    return c;
  }
}

function splitTopLevelAmpersand(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && depth > 0) depth--;
    else if (c === '&' && depth === 0) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out;
}

/** Split multiline text into top-level lines (preserving braces/environments). */
export function splitTopLevelLines(txt: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '{') depth++;
    else if (c === '}' && depth > 0) depth--;
    else if (c === '\n' && depth === 0) {
      out.push(txt.slice(start, i));
      start = i + 1;
    }
  }
  out.push(txt.slice(start));
  return out;
}

export function parseMathLine(line: string): MathNode[] {
  const seq = new ExprParser(line, false).parseSequence();
  if (seq.k === 'row') return seq.items;
  if (seq.k === 'text' && seq.v === '') return [];
  return [seq];
}

export function parseMathLines(txt: string): MathNode[][] {
  return splitTopLevelLines(txt).map((line) => parseMathLine(line));
}

/* ------------------------------------------------------------------ */
/* Layout Engine                                                       */
/* ------------------------------------------------------------------ */

export type LayoutItem =
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      fontPx: number;
      bold: boolean;
      italic: boolean;
    }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lw: number;
    }
  | {
      kind: 'radical';
      x: number;
      top: number;
      bot: number;
      hookW: number;
      overbarEnd: number;
      lw: number;
    }
  | {
      kind: 'delim';
      glyph: string;
      x: number;
      top: number;
      bot: number;
      w: number;
      lw: number;
    }
  | {
      kind: 'integral';
      dbl: boolean;
      x: number;
      top: number;
      bot: number;
      w: number;
      lw: number;
    }
  | {
      kind: 'bigsigma';
      op: '∑' | '∏';
      x: number;
      top: number;
      bot: number;
      w: number;
      lw: number;
    }
  | {
      kind: 'arrow';
      x1: number;
      x2: number;
      y: number;
      lw: number;
    }
  | {
      kind: 'hat';
      x1: number;
      x2: number;
      y: number;
      h: number;
      lw: number;
    };

export interface BoxLayout {
  width: number;
  ascent: number;
  descent: number;
  items: LayoutItem[];
}

function offsetBox(box: BoxLayout, dx: number, dy: number, out: LayoutItem[]) {
  for (const it of box.items) {
    if (it.kind === 'text') {
      out.push({ ...it, x: it.x + dx, y: it.y + dy });
    } else if (it.kind === 'line') {
      out.push({ ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy });
    } else if (it.kind === 'radical') {
      out.push({
        ...it,
        x: it.x + dx,
        top: it.top + dy,
        bot: it.bot + dy,
        overbarEnd: it.overbarEnd + dx,
      });
    } else if (it.kind === 'delim' || it.kind === 'integral' || it.kind === 'bigsigma') {
      out.push({ ...it, x: it.x + dx, top: it.top + dy, bot: it.bot + dy });
    } else if (it.kind === 'arrow') {
      out.push({ ...it, x1: it.x1 + dx, x2: it.x2 + dx, y: it.y + dy });
    } else if (it.kind === 'hat') {
      out.push({ ...it, x1: it.x1 + dx, x2: it.x2 + dx, y: it.y + dy });
    }
  }
}

function delimWidth(glyph: string, fontPx: number, height: number): number {
  if (!glyph) return 0;
  if (glyph === '|') return Math.max(5, fontPx * 0.24);
  if (glyph === '{' || glyph === '}') return Math.max(8, Math.min(18, fontPx * 0.38 + height * 0.06));
  return Math.max(7, Math.min(16, fontPx * 0.32 + height * 0.055));
}

export function layoutMathNode(
  m: MathMeasurer,
  node: MathNode,
  fontPx: number,
  bold: boolean,
  italic: boolean,
): BoxLayout {
  const lwBase = Math.max(1, fontPx * (bold ? 0.085 : 0.058));
  const axis = fontPx * 0.30;

  if (node.k === 'space') {
    return {
      width: Math.max(0, node.w * fontPx),
      ascent: fontPx * 0.75,
      descent: fontPx * 0.2,
      items: [],
    };
  }

  if (node.k === 'text') {
    const str = node.v;
    if (!str) {
      return { width: 0, ascent: fontPx * 0.78, descent: fontPx * 0.22, items: [] };
    }
    const met = m.measureText(str, fontPx, bold, italic);
    return {
      width: met.width,
      ascent: Math.max(fontPx * 0.78, met.ascent),
      descent: Math.max(fontPx * 0.22, met.descent),
      items: [{ kind: 'text', x: 0, y: 0, text: str, fontPx, bold, italic }],
    };
  }

  if (node.k === 'row') {
    let x = 0;
    let ascent = fontPx * 0.78;
    let descent = fontPx * 0.22;
    const items: LayoutItem[] = [];
    for (const child of node.items) {
      const b = layoutMathNode(m, child, fontPx, bold, italic);
      offsetBox(b, x, 0, items);
      x += b.width;
      if (b.ascent > ascent) ascent = b.ascent;
      if (b.descent > descent) descent = b.descent;
    }
    return { width: x, ascent, descent, items };
  }

  if (node.k === 'frac') {
    const childPx = Math.max(8, fontPx * 0.78);
    const num = layoutMathNode(m, node.num, childPx, bold, italic);
    const den = layoutMathNode(m, node.den, childPx, bold, italic);
    const padX = Math.max(4, fontPx * 0.16);
    const barW = Math.max(fontPx * 0.55, num.width, den.width) + padX * 2;
    const gap = Math.max(2.5, fontPx * 0.14);
    const lw = Math.max(1, fontPx * (bold ? 0.08 : 0.056));

    const numY = -axis - gap - num.descent;
    const denY = -axis + gap + den.ascent;
    const numX = (barW - num.width) / 2;
    const denX = (barW - den.width) / 2;

    const items: LayoutItem[] = [];
    offsetBox(num, numX, numY, items);
    items.push({ kind: 'line', x1: 1, y1: -axis, x2: barW - 1, y2: -axis, lw });
    offsetBox(den, denX, denY, items);

    return {
      width: barW + 2,
      ascent: Math.max(fontPx * 0.85, -numY + num.ascent + 1),
      descent: Math.max(fontPx * 0.25, denY + den.descent + 1),
      items,
    };
  }

  if (node.k === 'binom') {
    const childPx = Math.max(8, fontPx * 0.78);
    const top = layoutMathNode(m, node.top, childPx, bold, italic);
    const bot = layoutMathNode(m, node.bot, childPx, bold, italic);
    const innerW = Math.max(fontPx * 0.5, top.width, bot.width);
    const gap = Math.max(4, fontPx * 0.2);
    const topY = -axis - gap / 2 - top.descent;
    const botY = -axis + gap / 2 + bot.ascent;
    const totalAsc = Math.max(fontPx * 0.85, -topY + top.ascent + 2);
    const totalDesc = Math.max(fontPx * 0.35, botY + bot.descent + 2);
    const dw = delimWidth('(', fontPx, totalAsc + totalDesc);
    const items: LayoutItem[] = [];
    items.push({ kind: 'delim', glyph: '(', x: 0, top: -totalAsc, bot: totalDesc, w: dw, lw: lwBase });
    offsetBox(top, dw + (innerW - top.width) / 2, topY, items);
    offsetBox(bot, dw + (innerW - bot.width) / 2, botY, items);
    items.push({
      kind: 'delim',
      glyph: ')',
      x: dw + innerW,
      top: -totalAsc,
      bot: totalDesc,
      w: dw,
      lw: lwBase,
    });
    return {
      width: dw * 2 + innerW,
      ascent: totalAsc,
      descent: totalDesc,
      items,
    };
  }

  if (node.k === 'sup' || node.k === 'sub' || node.k === 'subsup') {
    const base = node.base
      ? layoutMathNode(m, node.base, fontPx, bold, italic)
      : { width: 0, ascent: fontPx * 0.72, descent: fontPx * 0.18, items: [] };
    const scriptPx = Math.max(7, fontPx * 0.65);
    const exp =
      node.k === 'sup' || node.k === 'subsup'
        ? layoutMathNode(m, node.exp, scriptPx, bold, italic)
        : null;
    const sub =
      node.k === 'sub' || node.k === 'subsup'
        ? layoutMathNode(m, node.sub, scriptPx, bold, italic)
        : null;

    const items: LayoutItem[] = [];
    offsetBox(base, 0, 0, items);

    let ascent = base.ascent;
    let descent = base.descent;
    const xOff = base.width + Math.max(0.5, fontPx * 0.03);
    let maxScriptW = 0;

    let expY = 0;
    if (exp) {
      expY = -Math.max(fontPx * 0.38, base.ascent * 0.56) - Math.max(0, exp.descent - scriptPx * 0.22);
      offsetBox(exp, xOff, expY, items);
      ascent = Math.max(ascent, -expY + exp.ascent);
      maxScriptW = Math.max(maxScriptW, exp.width);
    }
    if (sub) {
      let subY = Math.max(fontPx * 0.22, base.descent * 0.65 + scriptPx * 0.22);
      if (exp) {
        const expBot = expY + exp.descent;
        const subTop = subY - sub.ascent;
        if (subTop < expBot + 2) {
          subY += expBot + 2 - subTop;
        }
      }
      offsetBox(sub, xOff, subY, items);
      descent = Math.max(descent, subY + sub.descent);
      maxScriptW = Math.max(maxScriptW, sub.width);
    }

    return {
      width: xOff + maxScriptW + 1,
      ascent,
      descent,
      items,
    };
  }

  if (node.k === 'sqrt') {
    const rad = layoutMathNode(m, node.rad, fontPx, bold, italic);
    const idxPx = Math.max(7, fontPx * 0.54);
    const idx = node.index ? layoutMathNode(m, node.index, idxPx, bold, italic) : null;
    const padTop = Math.max(3, fontPx * 0.16);
    const padRight = Math.max(3, fontPx * 0.14);
    const lw = Math.max(1.1, fontPx * (bold ? 0.085 : 0.06));

    const hookW = Math.max(10, fontPx * 0.54);
    const idxExtraX = idx ? Math.max(0, idx.width - hookW * 0.45) : 0;
    const radLeft = idxExtraX + hookW;
    const barTop = -rad.ascent - padTop;
    const bot = Math.max(rad.descent + 1, fontPx * 0.22);

    const items: LayoutItem[] = [];
    if (idx) {
      const idxY = barTop + (bot - barTop) * 0.44 - idx.descent;
      const idxX = Math.max(0, radLeft - hookW * 0.55 - idx.width);
      offsetBox(idx, idxX, idxY, items);
    }
    items.push({
      kind: 'radical',
      x: idxExtraX,
      top: barTop,
      bot,
      hookW,
      overbarEnd: radLeft + Math.max(fontPx * 0.45, rad.width) + padRight,
      lw,
    });
    offsetBox(rad, radLeft + 1, 0, items);

    return {
      width: radLeft + Math.max(fontPx * 0.45, rad.width) + padRight + 2,
      ascent: Math.max(-barTop + 2, idx ? Math.max(-barTop + 2, -(barTop + (bot - barTop) * 0.44 - idx.descent) + idx.ascent) : 0),
      descent: bot + 1,
      items,
    };
  }

  if (node.k === 'bigop') {
    const subPx = Math.max(7, fontPx * 0.62);
    const sub = node.sub ? layoutMathNode(m, node.sub, subPx, bold, italic) : null;
    const sup = node.sup ? layoutMathNode(m, node.sup, subPx, bold, italic) : null;
    const items: LayoutItem[] = [];

    if (node.op === 'lim') {
      const limBox = layoutMathNode(m, { k: 'text', v: 'lim' }, fontPx, bold, false);
      const colW = Math.max(limBox.width, sub ? sub.width : 0, sup ? sup.width : 0);
      offsetBox(limBox, (colW - limBox.width) / 2, 0, items);
      let ascent = limBox.ascent;
      let descent = limBox.descent;
      if (sub) {
        const subY = limBox.descent + sub.ascent + 1;
        offsetBox(sub, (colW - sub.width) / 2, subY, items);
        descent = subY + sub.descent;
      }
      if (sup) {
        const supY = -limBox.ascent - sup.descent - 2;
        offsetBox(sup, (colW - sup.width) / 2, supY, items);
        ascent = -supY + sup.ascent;
      }
      return { width: colW + fontPx * 0.22, ascent, descent, items };
    }

    if (node.op === '∫' || node.op === '∬') {
      const dbl = node.op === '∬';
      const intW = dbl ? Math.max(14, fontPx * 0.72) : Math.max(10, fontPx * 0.46);
      const top = -fontPx * 0.94;
      const bot = fontPx * 0.44;
      const lw = Math.max(1.2, fontPx * (bold ? 0.095 : 0.068));

      items.push({ kind: 'integral', dbl, x: 1, top, bot, w: intW, lw });
      let ascent = -top + 1;
      let descent = bot + 1;
      let rightEdge = intW + 2;

      const supX = intW + 2;
      const subX = intW * 0.85;
      if (sup) {
        const supY = top + sup.ascent * 0.35;
        offsetBox(sup, supX, supY, items);
        ascent = Math.max(ascent, -supY + sup.ascent);
        rightEdge = Math.max(rightEdge, supX + sup.width + 2);
      }
      if (sub) {
        const subY = bot + sub.ascent * 0.28;
        offsetBox(sub, subX, subY, items);
        descent = Math.max(descent, subY + sub.descent);
        rightEdge = Math.max(rightEdge, subX + sub.width + 2);
      }
      return { width: rightEdge + fontPx * 0.14, ascent, descent, items };
    }

    // ∑ or ∏
    const symW = Math.max(14, fontPx * 0.82);
    const symTop = -axis - fontPx * 0.56;
    const symBot = -axis + fontPx * 0.56;
    const lw = Math.max(1.2, fontPx * (bold ? 0.09 : 0.065));
    const colW = Math.max(symW, sub ? sub.width : 0, sup ? sup.width : 0);

    items.push({
      kind: 'bigsigma',
      op: node.op,
      x: (colW - symW) / 2,
      top: symTop,
      bot: symBot,
      w: symW,
      lw,
    });

    let ascent = -symTop + 1;
    let descent = symBot + 1;
    if (sup) {
      const supY = symTop - 3 - sup.descent;
      offsetBox(sup, (colW - sup.width) / 2, supY, items);
      ascent = -supY + sup.ascent;
    }
    if (sub) {
      const subY = symBot + 3 + sub.ascent;
      offsetBox(sub, (colW - sub.width) / 2, subY, items);
      descent = subY + sub.descent;
    }
    return { width: colW + fontPx * 0.22, ascent, descent, items };
  }

  if (node.k === 'accent') {
    const body = layoutMathNode(m, node.body, fontPx, bold, italic);
    const bw = Math.max(fontPx * 0.45, body.width);
    const lw = Math.max(1, fontPx * (bold ? 0.08 : 0.056));
    const items: LayoutItem[] = [];
    offsetBox(body, (bw - body.width) / 2, 0, items);
    const ay = -body.ascent - Math.max(3, fontPx * 0.14);
    if (node.kind === 'vec') {
      items.push({ kind: 'arrow', x1: 1, x2: bw - 1, y: ay, lw });
      return { width: bw, ascent: -ay + fontPx * 0.18, descent: body.descent, items };
    }
    if (node.kind === 'hat') {
      const h = Math.max(4, fontPx * 0.2);
      items.push({ kind: 'hat', x1: 1, x2: bw - 1, y: ay, h, lw });
      return { width: bw, ascent: -ay + h + 1, descent: body.descent, items };
    }
    items.push({ kind: 'line', x1: 1, y1: ay, x2: bw - 1, y2: ay, lw });
    return { width: bw, ascent: -ay + 2, descent: body.descent, items };
  }

  if (node.k === 'delim') {
    const body = layoutMathNode(m, node.body, fontPx, bold, italic);
    const top = -body.ascent - 1;
    const bot = body.descent + 1;
    const h = bot - top;
    const lw = Math.max(1, fontPx * (bold ? 0.08 : 0.056));
    const lwW = delimWidth(node.left, fontPx, h);
    const rwW = delimWidth(node.right, fontPx, h);
    const pad = Math.max(1, fontPx * 0.06);
    const items: LayoutItem[] = [];
    if (node.left) {
      items.push({ kind: 'delim', glyph: node.left, x: 0, top, bot, w: lwW, lw });
    }
    offsetBox(body, lwW + pad, 0, items);
    if (node.right) {
      items.push({ kind: 'delim', glyph: node.right, x: lwW + pad + body.width + pad, top, bot, w: rwW, lw });
    }
    return {
      width: lwW + pad + body.width + pad + rwW,
      ascent: body.ascent + 2,
      descent: body.descent + 2,
      items,
    };
  }

  // Matrix / Cases
  const cellPx = Math.max(8, fontPx * 0.88);
  const rows = node.rows.length ? node.rows : [[{ k: 'text', v: '' } as MathNode]];
  const nCols = Math.max(1, ...rows.map((r) => r.length));
  const laidRows = rows.map((r) => r.map((cell) => layoutMathNode(m, cell, cellPx, bold, italic)));
  const colW = new Array<number>(nCols).fill(fontPx * 0.5);
  const rowAsc = laidRows.map((r) => Math.max(cellPx * 0.75, ...r.map((c) => c.ascent)));
  const rowDesc = laidRows.map((r) => Math.max(cellPx * 0.22, ...r.map((c) => c.descent)));

  laidRows.forEach((r) =>
    r.forEach((c, ci) => {
      if (c.width > colW[ci]) colW[ci] = c.width;
    }),
  );

  const colGap = Math.max(8, fontPx * 0.45);
  const rowGap = Math.max(4, fontPx * 0.24);
  const totalInnerW = colW.reduce((a, b) => a + b, 0) + colGap * (nCols - 1);
  const totalInnerH =
    rowAsc.reduce((a, b) => a + b, 0) +
    rowDesc.reduce((a, b) => a + b, 0) +
    rowGap * Math.max(0, rows.length - 1);

  const topEdge = -axis - totalInnerH / 2;
  const botEdge = -axis + totalInnerH / 2;

  const delims: [string, string] =
    node.kind === 'pmatrix'
      ? ['(', ')']
      : node.kind === 'bmatrix'
        ? ['[', ']']
        : node.kind === 'vmatrix'
          ? ['|', '|']
          : node.kind === 'Bmatrix'
            ? ['{', '}']
            : node.kind === 'cases'
              ? ['{', '']
              : ['', ''];

  const lw = Math.max(1.1, fontPx * (bold ? 0.08 : 0.056));
  const lW = delimWidth(delims[0], fontPx, totalInnerH);
  const rW = delimWidth(delims[1], fontPx, totalInnerH);
  const padX = Math.max(3, fontPx * 0.14);

  const items: LayoutItem[] = [];
  if (delims[0]) {
    items.push({ kind: 'delim', glyph: delims[0], x: 0, top: topEdge - 2, bot: botEdge + 2, w: lW, lw });
  }

  let curY = topEdge;
  laidRows.forEach((r, ri) => {
    const baseLineY = curY + rowAsc[ri];
    let curX = lW + padX;
    r.forEach((cell, ci) => {
      const alignX = node.kind === 'cases' ? 0 : (colW[ci] - cell.width) / 2;
      offsetBox(cell, curX + alignX, baseLineY, items);
      curX += colW[ci] + colGap;
    });
    curY += rowAsc[ri] + rowDesc[ri] + rowGap;
  });

  if (delims[1]) {
    items.push({
      kind: 'delim',
      glyph: delims[1],
      x: lW + padX + totalInnerW + padX,
      top: topEdge - 2,
      bot: botEdge + 2,
      w: rW,
      lw,
    });
  }

  return {
    width: lW + padX + totalInnerW + padX + rW,
    ascent: -topEdge + 3,
    descent: botEdge + 3,
    items,
  };
}

export interface LaidLine {
  box: BoxLayout;
  yOffset: number;
  baselineY: number;
}

export interface MathBlockLayout {
  lines: LaidLine[];
  width: number;
  height: number;
}

function wrapLineNodes(
  m: MathMeasurer,
  nodes: MathNode[],
  fontPx: number,
  bold: boolean,
  italic: boolean,
  maxWidth?: number,
): MathNode[][] {
  if (!maxWidth || maxWidth <= 0 || !nodes.length) return [nodes];

  // Expand plain text nodes into word/space runs so prose + math wraps cleanly.
  const flat: MathNode[] = [];
  for (const n of nodes) {
    if (n.k === 'text') {
      const parts = n.v.split(/( +)/);
      for (const p of parts) {
        if (p) flat.push({ k: 'text', v: p });
      }
    } else {
      flat.push(n);
    }
  }

  const lines: MathNode[][] = [];
  let cur: MathNode[] = [];
  let curW = 0;
  for (const tok of flat) {
    const w = layoutMathNode(m, tok, fontPx, bold, italic).width;
    const isSpace = tok.k === 'text' && /^\s+$/.test(tok.v);
    if (cur.length > 0 && !isSpace && curW + w > maxWidth) {
      while (cur.length && cur[cur.length - 1].k === 'text' && /^\s+$/.test((cur[cur.length - 1] as { k: 'text'; v: string }).v)) {
        cur.pop();
      }
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      if (cur.length === 0 && isSpace) continue;
      cur.push(tok);
      curW += w;
    }
  }
  if (cur.length > 0 || lines.length === 0) lines.push(cur);
  return lines;
}

export function measureMathBlock(
  m: MathMeasurer,
  txt: string,
  opts: { fontSize: number; bold?: boolean; italic?: boolean; maxWidth?: number },
): MathBlockLayout {
  const fontPx = Math.max(6, opts.fontSize || 24);
  const bold = !!opts.bold;
  const italic = !!opts.italic;
  const rawLines = parseMathLines(txt);
  const wrapped: MathNode[][] = [];
  for (const ln of rawLines) {
    wrapped.push(...wrapLineNodes(m, ln, fontPx, bold, italic, opts.maxWidth));
  }

  const minLineH = fontPx * 1.3;
  const lineGap = Math.max(3, fontPx * 0.16);
  const laid: LaidLine[] = [];
  let y = 0;
  let maxW = 12;

  wrapped.forEach((nodes, idx) => {
    const rowNode: MathNode = nodes.length === 0 ? { k: 'text', v: '' } : nodes.length === 1 ? nodes[0] : { k: 'row', items: nodes };
    const box = layoutMathNode(m, rowNode, fontPx, bold, italic);
    const naturalH = box.ascent + box.descent;
    const h = Math.max(minLineH, naturalH);
    const extraTop = Math.max(0, (h - naturalH) * 0.35);
    const baselineY = y + extraTop + box.ascent;
    laid.push({ box, yOffset: y, baselineY });
    if (box.width > maxW) maxW = box.width;
    y += h + (idx < wrapped.length - 1 ? lineGap : 0);
  });

  return {
    lines: laid,
    width: maxW,
    height: Math.max(minLineH, y),
  };
}

export function createCanvasMeasurer(
  ctx: CanvasRenderingContext2D,
  fontFamily: string,
): MathMeasurer {
  return {
    measureText(text, fontPx, bold, italic) {
      ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontPx}px ${fontFamily}`;
      const m = ctx.measureText(text);
      return {
        width: m.width,
        ascent: typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : fontPx * 0.78,
        descent: typeof m.actualBoundingBoxDescent === 'number' && m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : fontPx * 0.22,
      };
    },
  };
}

function strokeDelim(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  top: number,
  bot: number,
  w: number,
) {
  const h = bot - top;
  const mid = (top + bot) / 2;
  ctx.beginPath();
  if (glyph === '|') {
    ctx.moveTo(x + w / 2, top);
    ctx.lineTo(x + w / 2, bot);
  } else if (glyph === '(') {
    const cx = x + w * 0.85;
    const curve = Math.min(w * 0.7, h * 0.28);
    ctx.moveTo(cx, top);
    ctx.quadraticCurveTo(cx - curve, mid, cx, bot);
  } else if (glyph === ')') {
    const cx = x + w * 0.15;
    const curve = Math.min(w * 0.7, h * 0.28);
    ctx.moveTo(cx, top);
    ctx.quadraticCurveTo(cx + curve, mid, cx, bot);
  } else if (glyph === '[') {
    const lx = x + w * 0.35;
    const rx = x + w * 0.88;
    ctx.moveTo(rx, top);
    ctx.lineTo(lx, top);
    ctx.lineTo(lx, bot);
    ctx.lineTo(rx, bot);
  } else if (glyph === ']') {
    const lx = x + w * 0.12;
    const rx = x + w * 0.65;
    ctx.moveTo(lx, top);
    ctx.lineTo(rx, top);
    ctx.lineTo(rx, bot);
    ctx.lineTo(lx, bot);
  } else if (glyph === '{') {
    const rx = x + w * 0.85;
    const mx = x + w * 0.45;
    const tip = x + w * 0.12;
    ctx.moveTo(rx, top);
    ctx.quadraticCurveTo(mx, top, mx, top + h * 0.22);
    ctx.lineTo(mx, mid - h * 0.08);
    ctx.quadraticCurveTo(mx, mid, tip, mid);
    ctx.quadraticCurveTo(mx, mid, mx, mid + h * 0.08);
    ctx.lineTo(mx, bot - h * 0.22);
    ctx.quadraticCurveTo(mx, bot, rx, bot);
  } else if (glyph === '}') {
    const lx = x + w * 0.15;
    const mx = x + w * 0.55;
    const tip = x + w * 0.88;
    ctx.moveTo(lx, top);
    ctx.quadraticCurveTo(mx, top, mx, top + h * 0.22);
    ctx.lineTo(mx, mid - h * 0.08);
    ctx.quadraticCurveTo(mx, mid, tip, mid);
    ctx.quadraticCurveTo(mx, mid, mx, mid + h * 0.08);
    ctx.lineTo(mx, bot - h * 0.22);
    ctx.quadraticCurveTo(mx, bot, lx, bot);
  } else if (glyph === '⟨') {
    ctx.moveTo(x + w * 0.85, top);
    ctx.lineTo(x + w * 0.15, mid);
    ctx.lineTo(x + w * 0.85, bot);
  } else if (glyph === '⟩') {
    ctx.moveTo(x + w * 0.15, top);
    ctx.lineTo(x + w * 0.85, mid);
    ctx.lineTo(x + w * 0.15, bot);
  }
  ctx.stroke();
}

function strokeSingleIntegral(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bot: number,
  w: number,
) {
  const h = bot - top;
  const cx = x + w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.92, top + h * 0.06);
  ctx.bezierCurveTo(
    x + w * 0.56,
    top - h * 0.04,
    cx + w * 0.08,
    top + h * 0.18,
    cx,
    top + h * 0.5,
  );
  ctx.bezierCurveTo(
    cx - w * 0.08,
    bot - h * 0.18,
    x + w * 0.44,
    bot + h * 0.04,
    x + w * 0.08,
    bot - h * 0.06,
  );
  ctx.stroke();
}

export function drawMathBlock(
  ctx: CanvasRenderingContext2D,
  txt: string,
  x: number,
  y: number,
  opts: MathRenderOptions,
): MathBlockLayout {
  const measurer = createCanvasMeasurer(ctx, opts.fontFamily);
  const block = measureMathBlock(measurer, txt, {
    fontSize: opts.fontSize,
    bold: opts.bold,
    italic: opts.italic,
    maxWidth: opts.maxWidth,
  });

  const availW = opts.maxWidth && opts.maxWidth > 0 ? Math.max(opts.maxWidth, block.width) : block.width;
  const align = opts.align || 'left';

  ctx.save();
  ctx.fillStyle = opts.color;
  ctx.strokeStyle = opts.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  for (const ln of block.lines) {
    let lx = x;
    if (align === 'center') lx = x + (availW - ln.box.width) / 2;
    else if (align === 'right') lx = x + (availW - ln.box.width);
    const ly = y + ln.baselineY;

    for (const it of ln.box.items) {
      if (it.kind === 'text') {
        ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? '700 ' : '400 '}${it.fontPx}px ${opts.fontFamily}`;
        ctx.fillText(it.text, lx + it.x, ly + it.y);
      } else if (it.kind === 'line') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lx + it.x1, ly + it.y1);
        ctx.lineTo(lx + it.x2, ly + it.y2);
        ctx.stroke();
      } else if (it.kind === 'radical') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const rx = lx + it.x;
        const rTop = ly + it.top;
        const rBot = ly + it.bot;
        const midY = rTop + (rBot - rTop) * 0.56;
        ctx.beginPath();
        ctx.moveTo(rx + it.hookW * 0.08, midY + (rBot - rTop) * 0.08);
        ctx.lineTo(rx + it.hookW * 0.34, midY);
        ctx.lineTo(rx + it.hookW * 0.62, rBot);
        ctx.lineTo(rx + it.hookW, rTop);
        ctx.lineTo(lx + it.overbarEnd, rTop);
        ctx.stroke();
      } else if (it.kind === 'delim') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokeDelim(ctx, it.glyph, lx + it.x, ly + it.top, ly + it.bot, it.w);
      } else if (it.kind === 'integral') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        if (it.dbl) {
          const singleW = it.w * 0.62;
          strokeSingleIntegral(ctx, lx + it.x, ly + it.top, ly + it.bot, singleW);
          strokeSingleIntegral(ctx, lx + it.x + it.w * 0.38, ly + it.top, ly + it.bot, singleW);
        } else {
          strokeSingleIntegral(ctx, lx + it.x, ly + it.top, ly + it.bot, it.w);
        }
      } else if (it.kind === 'bigsigma') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const sx = lx + it.x;
        const st = ly + it.top;
        const sb = ly + it.bot;
        const sm = (st + sb) / 2;
        ctx.beginPath();
        if (it.op === '∑') {
          ctx.moveTo(sx + it.w * 0.92, st + (sb - st) * 0.14);
          ctx.lineTo(sx + it.w * 0.92, st);
          ctx.lineTo(sx + it.w * 0.08, st);
          ctx.lineTo(sx + it.w * 0.56, sm);
          ctx.lineTo(sx + it.w * 0.08, sb);
          ctx.lineTo(sx + it.w * 0.92, sb);
          ctx.lineTo(sx + it.w * 0.92, sb - (sb - st) * 0.14);
        } else {
          // ∏
          ctx.moveTo(sx + it.w * 0.04, st);
          ctx.lineTo(sx + it.w * 0.96, st);
          ctx.moveTo(sx + it.w * 0.24, st);
          ctx.lineTo(sx + it.w * 0.24, sb);
          ctx.moveTo(sx + it.w * 0.76, st);
          ctx.lineTo(sx + it.w * 0.76, sb);
        }
        ctx.stroke();
      } else if (it.kind === 'arrow') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const ax1 = lx + it.x1;
        const ax2 = lx + it.x2;
        const ay = ly + it.y;
        const hs = Math.max(3, it.lw * 2.2);
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax2, ay);
        ctx.moveTo(ax2 - hs, ay - hs * 0.75);
        ctx.lineTo(ax2, ay);
        ctx.lineTo(ax2 - hs, ay + hs * 0.75);
        ctx.stroke();
      } else if (it.kind === 'hat') {
        ctx.lineWidth = it.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const hx1 = lx + it.x1;
        const hx2 = lx + it.x2;
        const hy = ly + it.y;
        ctx.beginPath();
        ctx.moveTo(hx1, hy);
        ctx.lineTo((hx1 + hx2) / 2, hy - it.h);
        ctx.lineTo(hx2, hy);
        ctx.stroke();
      }
    }

    if ((opts.underline || opts.strike) && ln.box.width > 0) {
      ctx.save();
      ctx.lineWidth = Math.max(1, opts.fontSize * 0.055);
      ctx.lineCap = 'butt';
      if (opts.underline) {
        ctx.beginPath();
        ctx.moveTo(lx, ly + ln.box.descent * 0.7);
        ctx.lineTo(lx + ln.box.width, ly + ln.box.descent * 0.7);
        ctx.stroke();
      }
      if (opts.strike) {
        ctx.beginPath();
        ctx.moveTo(lx, ly - opts.fontSize * 0.30);
        ctx.lineTo(lx + ln.box.width, ly - opts.fontSize * 0.30);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  ctx.restore();
  return block;
}

/* ------------------------------------------------------------------ */
/* Symbolab-style template editing helpers (pure, unit-tested)         */
/* ------------------------------------------------------------------ */

export interface MathTemplateItem {
  id: string;
  label: string;
  title: string;
  template: string;
  wrapSelected?: boolean;
  /** Offset from start of inserted template where caret lands when no slot exists. */
  caretOffset?: number;
  /** Optional mini SVG/HTML markup for the Symbolab keypad button. */
  iconHtml?: string;
}

export type MathTabId = 'basic' | 'calculus' | 'functions' | 'matrices' | 'greek';

export const MATH_TABS: { id: MathTabId; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'calculus', label: 'Calculus' },
  { id: 'functions', label: 'Trig & Log' },
  { id: 'matrices', label: 'Matrices & Sets' },
  { id: 'greek', label: 'Greek' },
];

const BOX_SLOT = '<span class="mp-slot">□</span>';

export const MATH_KEYPAD: Record<MathTabId, MathTemplateItem[]> = {
  basic: [
    {
      id: 'frac',
      label: 'a/b',
      title: 'Fraction',
      template: '\\frac{}{}',
      wrapSelected: true,
      iconHtml: `<span class="mp-ico-frac"><span>${BOX_SLOT}</span><i></i><span>${BOX_SLOT}</span></span>`,
    },
    {
      id: 'sup',
      label: 'xⁿ',
      title: 'Exponent / Superscript',
      template: '^{}',
      iconHtml: `<span class="mp-ico-script">x<sup>${BOX_SLOT}</sup></span>`,
    },
    {
      id: 'sq',
      label: 'x²',
      title: 'Square',
      template: '^{2}',
      iconHtml: `<span>x<sup>2</sup></span>`,
    },
    {
      id: 'sub',
      label: 'xₙ',
      title: 'Subscript',
      template: '_{}',
      iconHtml: `<span class="mp-ico-script">x<sub>${BOX_SLOT}</sub></span>`,
    },
    {
      id: 'sqrt',
      label: '√x',
      title: 'Square root',
      template: '\\sqrt{}',
      wrapSelected: true,
      iconHtml: `<span>√${BOX_SLOT}</span>`,
    },
    {
      id: 'nroot',
      label: 'ⁿ√x',
      title: 'nth root',
      template: '\\sqrt[]{}',
      iconHtml: `<span><sup>${BOX_SLOT}</sup>√${BOX_SLOT}</span>`,
    },
    {
      id: 'abs',
      label: '|x|',
      title: 'Absolute value',
      template: '\\abs{}',
      wrapSelected: true,
      iconHtml: `<span>|${BOX_SLOT}|</span>`,
    },
    {
      id: 'parens',
      label: '( )',
      title: 'Auto-sized parentheses',
      template: '\\left(\\right)',
      wrapSelected: true,
      caretOffset: 6,
      iconHtml: `<span>(${BOX_SLOT})</span>`,
    },
    {
      id: 'brackets',
      label: '[ ]',
      title: 'Auto-sized brackets',
      template: '\\left[\\right]',
      wrapSelected: true,
      caretOffset: 6,
      iconHtml: `<span>[${BOX_SLOT}]</span>`,
    },
    {
      id: 'binom',
      label: 'nCk',
      title: 'Binomial coefficient',
      template: '\\binom{}{}',
      iconHtml: `<span class="mp-ico-binom">(<span>${BOX_SLOT}<br>${BOX_SLOT}</span>)</span>`,
    },
    { id: 'pm', label: '±', title: 'Plus-minus', template: '\\pm ' },
    { id: 'times', label: '×', title: 'Multiply', template: '\\times ' },
    { id: 'div', label: '÷', title: 'Divide', template: '\\div ' },
    { id: 'cdot', label: '·', title: 'Dot multiply', template: '\\cdot ' },
    { id: 'eq', label: '=', title: 'Equals', template: ' = ' },
    { id: 'neq', label: '≠', title: 'Not equal', template: '\\neq ' },
    { id: 'leq', label: '≤', title: 'Less than or equal', template: '\\leq ' },
    { id: 'geq', label: '≥', title: 'Greater than or equal', template: '\\geq ' },
    { id: 'approx', label: '≈', title: 'Approximately equal', template: '\\approx ' },
    { id: 'pi', label: 'π', title: 'Pi', template: '\\pi' },
    { id: 'inf', label: '∞', title: 'Infinity', template: '\\infty' },
  ],
  calculus: [
    {
      id: 'int',
      label: '∫',
      title: 'Indefinite integral',
      template: '\\int {} dx',
      wrapSelected: true,
      iconHtml: `<span>∫ ${BOX_SLOT} dx</span>`,
    },
    {
      id: 'defint',
      label: '∫ₐᵇ',
      title: 'Definite integral',
      template: '\\int_{}^{} {} dx',
      iconHtml: `<span>∫<sub>${BOX_SLOT}</sub><sup>${BOX_SLOT}</sup> ${BOX_SLOT}</span>`,
    },
    {
      id: 'iint',
      label: '∬',
      title: 'Double integral',
      template: '\\iint {} dA',
      wrapSelected: true,
    },
    {
      id: 'deriv',
      label: 'd/dx',
      title: 'Derivative',
      template: '\\frac{d}{dx}\\left(\\right)',
      wrapSelected: true,
      caretOffset: 17,
      iconHtml: `<span class="mp-ico-frac"><span>d</span><i></i><span>dx</span></span>`,
    },
    {
      id: 'pderiv',
      label: '∂/∂x',
      title: 'Partial derivative',
      template: '\\frac{\\partial}{\\partial x}\\left(\\right)',
      wrapSelected: true,
      caretOffset: 29,
      iconHtml: `<span class="mp-ico-frac"><span>∂</span><i></i><span>∂x</span></span>`,
    },
    {
      id: 'sum',
      label: '∑',
      title: 'Summation',
      template: '\\sum_{i=1}^{n} {}',
      iconHtml: `<span>∑<sub>${BOX_SLOT}</sub><sup>${BOX_SLOT}</sup></span>`,
    },
    {
      id: 'prod',
      label: '∏',
      title: 'Product',
      template: '\\prod_{i=1}^{n} {}',
      iconHtml: `<span>∏<sub>${BOX_SLOT}</sub><sup>${BOX_SLOT}</sup></span>`,
    },
    {
      id: 'lim',
      label: 'lim',
      title: 'Limit',
      template: '\\lim_{x \\to } {}',
      iconHtml: `<span>lim<sub>x→${BOX_SLOT}</sub></span>`,
    },
    { id: 'partial', label: '∂', title: 'Partial symbol', template: '\\partial ' },
    { id: 'nabla', label: '∇', title: 'Nabla / gradient', template: '\\nabla ' },
    { id: 'to', label: '→', title: 'Approaches', template: '\\to ' },
    { id: 'prime', label: '′', title: 'Prime', template: '′' },
  ],
  functions: [
    { id: 'sin', label: 'sin', title: 'Sine', template: '\\sin\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'cos', label: 'cos', title: 'Cosine', template: '\\cos\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'tan', label: 'tan', title: 'Tangent', template: '\\tan\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'cot', label: 'cot', title: 'Cotangent', template: '\\cot\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'sec', label: 'sec', title: 'Secant', template: '\\sec\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'csc', label: 'csc', title: 'Cosecant', template: '\\csc\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    { id: 'arcsin', label: 'sin⁻¹', title: 'Arcsine', template: '\\arcsin\\left(\\right)', wrapSelected: true, caretOffset: 13 },
    { id: 'arccos', label: 'cos⁻¹', title: 'Arccosine', template: '\\arccos\\left(\\right)', wrapSelected: true, caretOffset: 13 },
    { id: 'arctan', label: 'tan⁻¹', title: 'Arctangent', template: '\\arctan\\left(\\right)', wrapSelected: true, caretOffset: 13 },
    { id: 'ln', label: 'ln', title: 'Natural logarithm', template: '\\ln\\left(\\right)', wrapSelected: true, caretOffset: 9 },
    { id: 'log', label: 'log', title: 'Logarithm base 10', template: '\\log\\left(\\right)', wrapSelected: true, caretOffset: 10 },
    {
      id: 'logb',
      label: 'logₐ',
      title: 'Logarithm with base',
      template: '\\log_{}\\left(\\right)',
      iconHtml: `<span>log<sub>${BOX_SLOT}</sub>(${BOX_SLOT})</span>`,
    },
    { id: 'exp', label: 'eˣ', title: 'Exponential', template: 'e^{}', wrapSelected: true },
    { id: 'tenx', label: '10ˣ', title: 'Power of 10', template: '10^{}', wrapSelected: true },
    { id: 'sinh', label: 'sinh', title: 'Hyperbolic sine', template: '\\sinh\\left(\\right)', wrapSelected: true, caretOffset: 11 },
    { id: 'cosh', label: 'cosh', title: 'Hyperbolic cosine', template: '\\cosh\\left(\\right)', wrapSelected: true, caretOffset: 11 },
  ],
  matrices: [
    {
      id: 'mat2',
      label: '2×2 ( )',
      title: '2×2 Parenthesis matrix',
      template: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
      caretOffset: 16,
    },
    {
      id: 'bmat2',
      label: '2×2 [ ]',
      title: '2×2 Bracket matrix',
      template: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
      caretOffset: 16,
    },
    {
      id: 'mat3',
      label: '3×3 ( )',
      title: '3×3 Matrix',
      template: '\\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{pmatrix}',
      caretOffset: 16,
    },
    {
      id: 'det2',
      label: 'det | |',
      title: '2×2 Determinant',
      template: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
      caretOffset: 16,
    },
    {
      id: 'cases',
      label: 'cases {',
      title: 'Piecewise function',
      template: '\\begin{cases} x, & x \\geq 0 \\\\ -x, & x < 0 \\end{cases}',
      caretOffset: 14,
    },
    { id: 'vec', label: 'v⃗', title: 'Vector arrow', template: '\\vec{}', wrapSelected: true },
    { id: 'bar', label: 'x̄', title: 'Overbar / mean', template: '\\bar{}', wrapSelected: true },
    { id: 'hat', label: 'x̂', title: 'Unit vector hat', template: '\\hat{}', wrapSelected: true },
    { id: 'in', label: '∈', title: 'Element of', template: '\\in ' },
    { id: 'notin', label: '∉', title: 'Not element of', template: '\\notin ' },
    { id: 'subset', label: '⊂', title: 'Subset', template: '\\subset ' },
    { id: 'cup', label: '∪', title: 'Union', template: '\\cup ' },
    { id: 'cap', label: '∩', title: 'Intersection', template: '\\cap ' },
    { id: 'forall', label: '∀', title: 'For all', template: '\\forall ' },
    { id: 'exists', label: '∃', title: 'Exists', template: '\\exists ' },
    { id: 'implies', label: '⇒', title: 'Implies', template: '\\Rightarrow ' },
    { id: 'iff', label: '⇔', title: 'If and only if', template: '\\Leftrightarrow ' },
    { id: 'reals', label: 'ℝ', title: 'Real numbers', template: '\\mathbb{R}' },
    { id: 'ints', label: 'ℤ', title: 'Integers', template: '\\mathbb{Z}' },
    { id: 'nats', label: 'ℕ', title: 'Natural numbers', template: '\\mathbb{N}' },
  ],
  greek: [
    { id: 'alpha', label: 'α', title: 'alpha', template: '\\alpha' },
    { id: 'beta', label: 'β', title: 'beta', template: '\\beta' },
    { id: 'gamma', label: 'γ', title: 'gamma', template: '\\gamma' },
    { id: 'delta', label: 'δ', title: 'delta', template: '\\delta' },
    { id: 'epsilon', label: 'ε', title: 'epsilon', template: '\\varepsilon' },
    { id: 'zeta', label: 'ζ', title: 'zeta', template: '\\zeta' },
    { id: 'eta', label: 'η', title: 'eta', template: '\\eta' },
    { id: 'theta', label: 'θ', title: 'theta', template: '\\theta' },
    { id: 'lambda', label: 'λ', title: 'lambda', template: '\\lambda' },
    { id: 'mu', label: 'μ', title: 'mu', template: '\\mu' },
    { id: 'nu', label: 'ν', title: 'nu', template: '\\nu' },
    { id: 'xi', label: 'ξ', title: 'xi', template: '\\xi' },
    { id: 'pi', label: 'π', title: 'pi', template: '\\pi' },
    { id: 'rho', label: 'ρ', title: 'rho', template: '\\rho' },
    { id: 'sigma', label: 'σ', title: 'sigma', template: '\\sigma' },
    { id: 'tau', label: 'τ', title: 'tau', template: '\\tau' },
    { id: 'phi', label: 'φ', title: 'phi', template: '\\phi' },
    { id: 'chi', label: 'χ', title: 'chi', template: '\\chi' },
    { id: 'psi', label: 'ψ', title: 'psi', template: '\\psi' },
    { id: 'omega', label: 'ω', title: 'omega', template: '\\omega' },
    { id: 'Gamma', label: 'Γ', title: 'Gamma', template: '\\Gamma' },
    { id: 'Delta', label: 'Δ', title: 'Delta', template: '\\Delta' },
    { id: 'Theta', label: 'Θ', title: 'Theta', template: '\\Theta' },
    { id: 'Lambda', label: 'Λ', title: 'Lambda', template: '\\Lambda' },
    { id: 'Pi', label: 'Π', title: 'Pi', template: '\\Pi' },
    { id: 'Sigma', label: 'Σ', title: 'Sigma', template: '\\Sigma' },
    { id: 'Phi', label: 'Φ', title: 'Phi', template: '\\Phi' },
    { id: 'Psi', label: 'Ψ', title: 'Psi', template: '\\Psi' },
    { id: 'Omega', label: 'Ω', title: 'Omega', template: '\\Omega' },
  ],
};

/** Find all empty/editable `{}` or `[]` or `\left(\right)` slot offsets in an expression. */
export function findSlotOffsets(value: string): { start: number; end: number }[] {
  const slots: { start: number; end: number }[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '{' && value[i + 1] === '}') {
      slots.push({ start: i + 1, end: i + 1 });
    } else if (value[i] === '[' && value[i + 1] === ']') {
      slots.push({ start: i + 1, end: i + 1 });
    } else if (value.startsWith('\\left(', i) && value.startsWith('\\right)', i + 6)) {
      slots.push({ start: i + 6, end: i + 6 });
    } else if (value.startsWith('\\left[', i) && value.startsWith('\\right]', i + 6)) {
      slots.push({ start: i + 6, end: i + 6 });
    }
  }
  return slots;
}

export function findNextSlotRange(
  value: string,
  cursorPos: number,
  dir: 1 | -1 = 1,
): { start: number; end: number } | null {
  const slots = findSlotOffsets(value);
  if (!slots.length) return null;
  if (dir === 1) {
    const after = slots.find((s) => s.start > cursorPos);
    return after || slots[0];
  }
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].start < cursorPos) return slots[i];
  }
  return slots[slots.length - 1];
}

export function insertTemplateAtCursor(
  value: string,
  selStart: number,
  selEnd: number,
  item: Pick<MathTemplateItem, 'template' | 'wrapSelected' | 'caretOffset'>,
): { value: string; selStart: number; selEnd: number } {
  const start = Math.max(0, Math.min(selStart, value.length));
  const end = Math.max(start, Math.min(selEnd, value.length));
  const selected = value.slice(start, end);
  let inserted = item.template;
  let relCaret: number | null = null;

  if (selected && item.wrapSelected) {
    if (inserted.includes('{}')) {
      const idx = inserted.indexOf('{}');
      inserted = inserted.slice(0, idx + 1) + selected + inserted.slice(idx + 1);
      // After wrapping selection into first slot, land in next empty slot if any, else after inserted
      const nextEmpty = inserted.indexOf('{}', idx + 2 + selected.length);
      if (nextEmpty >= 0) relCaret = nextEmpty + 1;
      else relCaret = idx + 1 + selected.length;
    } else if (inserted.includes('\\left(\\right)')) {
      const idx = inserted.indexOf('\\left(\\right)');
      inserted = inserted.slice(0, idx + 6) + selected + inserted.slice(idx + 6);
      relCaret = idx + 6 + selected.length;
    } else if (inserted.includes('\\left[\\right]')) {
      const idx = inserted.indexOf('\\left[\\right]');
      inserted = inserted.slice(0, idx + 6) + selected + inserted.slice(idx + 6);
      relCaret = idx + 6 + selected.length;
    }
  }

  if (relCaret === null) {
    if (typeof item.caretOffset === 'number') {
      relCaret = item.caretOffset;
    } else {
      const slots = findSlotOffsets(inserted);
      relCaret = slots.length ? slots[0].start : inserted.length;
    }
  }

  const nextValue = value.slice(0, start) + inserted + value.slice(end);
  const caret = start + relCaret;
  return { value: nextValue, selStart: caret, selEnd: caret };
}
