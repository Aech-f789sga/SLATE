import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsMathSyntax,
  splitTopLevelLines,
  parseMathLine,
  parseMathLines,
  layoutMathNode,
  measureMathBlock,
  findSlotOffsets,
  findNextSlotRange,
  insertTemplateAtCursor,
  MATH_KEYPAD,
  type MathMeasurer,
} from './math-expr.ts';

function makeFakeMeasurer(widthMultiplier = 0.56): MathMeasurer {
  return {
    measureText(text, fontPx, bold) {
      const m = bold ? widthMultiplier * 1.08 : widthMultiplier;
      return {
        width: text.length * fontPx * m,
        ascent: fontPx * 0.78,
        descent: fontPx * 0.22,
      };
    },
  };
}

test('containsMathSyntax detects math notation and ignores plain prose', () => {
  assert.equal(containsMathSyntax('\\frac{x^2 + 1}{x - 1}'), true);
  assert.equal(containsMathSyntax('\\sqrt[3]{x + 1}'), true);
  assert.equal(containsMathSyntax('\\int_{0}^{1} x^2 dx'), true);
  assert.equal(containsMathSyntax('x^2 + y_1 = z_{n+1}'), true);
  assert.equal(containsMathSyntax('$E = mc^2$'), true);
  assert.equal(containsMathSyntax('\\alpha + \\beta = \\pi'), true);
  assert.equal(containsMathSyntax('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}'), true);

  assert.equal(containsMathSyntax('Hello world'), false);
  assert.equal(containsMathSyntax('Lecture 4: Calculus overview'), false);
  assert.equal(containsMathSyntax('my_file_name.pdf'), false);
  assert.equal(containsMathSyntax('Price is $20 today'), false);
});

test('splitTopLevelLines keeps multiline matrix/cases intact while splitting prose lines', () => {
  const txt = 'Line 1\n\\begin{pmatrix}\na & b\n\\\\ c & d\n\\end{pmatrix}\nLine 2';
  const lines = splitTopLevelLines(txt);
  assert.equal(lines.length, 6);

  const braced = 'f(x) = \\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}\nDone';
  assert.deepEqual(splitTopLevelLines(braced), [
    'f(x) = \\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}',
    'Done',
  ]);

  const multiFrac = '\\frac{a}{\nb\n}\nnext';
  assert.deepEqual(splitTopLevelLines(multiFrac), ['\\frac{a}{\nb\n}', 'next']);
});

test('parseMathLine parses fractions, scripts, nth roots, bigops, accents, and matrices', () => {
  const frac = parseMathLine('\\frac{x+1}{2}');
  assert.equal(frac.length, 1);
  assert.equal(frac[0].k, 'frac');

  const quad = parseMathLine('x^{2} + a_i - y_0^n');
  assert.equal(quad.length, 5);
  assert.equal(quad[0].k, 'sup');
  assert.equal(quad[2].k, 'sub');
  assert.equal(quad[4].k, 'subsup');

  const root = parseMathLine('\\sqrt[3]{x+1}');
  assert.equal(root[0].k, 'sqrt');
  if (root[0].k === 'sqrt') {
    assert.ok(root[0].index);
  }

  const integ = parseMathLine('\\int_{0}^{\\infty} e^{-x} dx');
  assert.equal(integ[0].k, 'bigop');
  if (integ[0].k === 'bigop') {
    assert.equal(integ[0].op, '∫');
    assert.ok(integ[0].sub);
    assert.ok(integ[0].sup);
  }

  const limSupOnly = parseMathLine('\\lim^{x} f(x)');
  assert.equal(limSupOnly[0].k, 'bigop');
  const laid = measureMathBlock(makeFakeMeasurer(), '\\lim^{x} f(x)', { fontSize: 28 });
  assert.ok(laid.width > 0 && laid.height > 0);

  const mat = parseMathLine('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}');
  assert.equal(mat[0].k, 'matrix');
  if (mat[0].k === 'matrix') {
    assert.equal(mat[0].kind, 'bmatrix');
    assert.equal(mat[0].rows.length, 2);
    assert.equal(mat[0].rows[0].length, 2);
  }

  const vec = parseMathLine('\\vec{v} + \\hat{i} + \\bar{x}');
  assert.equal(vec.filter((n) => n.k === 'accent').length, 3);
});

test('measureMathBlock reflects font metrics (narrow vs wide font & size)', () => {
  const narrow = makeFakeMeasurer(0.45);
  const wide = makeFakeMeasurer(0.75);
  const expr = '\\frac{a + b}{c + d} + \\sqrt{x^2 + y^2}';

  const bNarrow = measureMathBlock(narrow, expr, { fontSize: 28 });
  const bWide = measureMathBlock(wide, expr, { fontSize: 28 });
  assert.ok(bWide.width > bNarrow.width, 'wider font family must expand math layout width');

  const bSmall = measureMathBlock(narrow, expr, { fontSize: 16 });
  const bLarge = measureMathBlock(narrow, expr, { fontSize: 40 });
  assert.ok(bLarge.width > bSmall.width * 1.8);
  assert.ok(bLarge.height > bSmall.height * 1.8);
});

test('layoutMathNode scales text and radical/frac bounding boxes properly', () => {
  const m = makeFakeMeasurer(0.55);
  const [frac] = parseMathLine('\\frac{\\frac{1}{2}}{3}');
  const box = layoutMathNode(m, frac, 30, false, false);
  assert.ok(box.ascent > 20);
  assert.ok(box.descent > 10);
  assert.ok(box.items.some((i) => i.kind === 'line'));
  assert.ok(box.items.some((i) => i.kind === 'text'));
});

test('Symbolab template insertion wraps selections and jumps between slots', () => {
  const fracBtn = MATH_KEYPAD.basic.find((t) => t.id === 'frac')!;
  const res1 = insertTemplateAtCursor('', 0, 0, fracBtn);
  assert.equal(res1.value, '\\frac{}{}');
  assert.equal(res1.selStart, 6);

  // Jump to denominator slot
  const next = findNextSlotRange(res1.value, res1.selStart, 1);
  assert.deepEqual(next, { start: 8, end: 8 });

  // Wrap selected text into numerator and land in denominator
  const res2 = insertTemplateAtCursor('x+1', 0, 3, fracBtn);
  assert.equal(res2.value, '\\frac{x+1}{}');
  assert.equal(res2.selStart, 11);

  // Definite integral slots
  const defint = MATH_KEYPAD.calculus.find((t) => t.id === 'defint')!;
  const res3 = insertTemplateAtCursor('', 0, 0, defint);
  const slots = findSlotOffsets(res3.value);
  assert.equal(slots.length, 3);
  const prev = findNextSlotRange(res3.value, slots[1].start, -1);
  assert.deepEqual(prev, slots[0]);
});
