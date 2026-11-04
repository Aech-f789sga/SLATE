import { calculate } from '../src/math/core';

const cases: [string, string][] = [
  // derivatives
  ['d/dx(x^2+1)', '2x'],
  ['d/dx(x^3)', '3x^2'],
  ['d/dx(3x^2+2x+7)', '6x + 2'],
  ['d/dx(sin(x))', 'cos(x)'],
  ['d/dx(cos(x))', '-sin(x)'],
  ['d/dx(tan(x))', '1 / cos(x)^2'],
  ['d/dx(ln(x))', '1 / x'],
  ['d/dx(exp(x))', 'exp(x)'],
  ['d/dx(sqrt(x))', '1 / (2sqrt(x))'],
  ['d/dx(x*sin(x))', 'sin(x) + x * cos(x)'],
  ['d/dx(sin(x^2))', 'cos(x^2) * 2x'],
  ['d/dx(e^x)', 'exp(x)'],
  ['diff(x^2*y, y)', 'x^2'],
  ['d/dx(5)', '0'],
  ['d/dx(atan(x))', '1 / (1 + x^2)'],

  // antiderivatives
  ['integral(x^2, x)', 'x^3 / 3 + C'],
  ['integral(2x+1, x)', 'x^2 + x + C'],
  ['integral(sin(x), x)', '-cos(x) + C'],
  ['integral(cos(x), x)', 'sin(x) + C'],
  ['integral(1/x, x)', 'ln(|x|) + C'],
  ['integral(exp(x), x)', 'exp(x) + C'],

  // definite integrals
  ['integral(x^2, x, 0, 3)', '9'],
  ['integral(sin(x), x, 0, pi)', '2'],
  ['integral(1/x, x, 1, e)', '1'],
  ['integral(x, x, 0, 1)', '1/2'],

  // summation
  ['sum(k, k, 1, 10)', '55'],
  ['sum(k^2, k, 1, 5)', '55'],
  ['sum(2k, k, 0, 3)', '12'],
  ['prod(k, k, 1, 5)', '120'],

  // engineering / stats
  ['gamma(5)', '24'],
  ['ncr(10, 3)', '120'],
  ['npr(5, 2)', '20'],
  ['mean(2, 4, 6, 8)', '5'],
  ['median(3, 1, 4, 1, 5)', '3'],
  ['hypot(3, 4)', '5'],
  ['deg2rad(180)', 'π'],
  ['sinc(0)', '1'],
  ['erf(0)', '0'],
  ['clamp(12, 0, 10)', '10'],
  ['lerp(0, 10, 0.25)', '5/2'],
  ['rms(3, 4)', '2.5√2'],
];

let pass = 0;
for (const [src, want] of cases) {
  const r = calculate(src, { exact: true });
  const got = r.ok ? r.text : 'ERR: ' + (r.error || '');
  const ok = got === want;
  if (ok) pass++;
  console.log((ok ? '✓' : '✗').padEnd(2), src.padEnd(28), '→', got, ok ? '' : `   [want ${want}]`);
}
console.log(`\n${pass}/${cases.length}`);
