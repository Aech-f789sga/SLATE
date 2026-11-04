import { calculate, parse, toLatex } from '../src/math/core';

const cases: [string, string][] = [
  ['2+2=', '4'],
  ['1/3', '1/3'],
  ['sqrt(2)', '√2'],
  ['sin(30)', ''],
  ['sin30', ''],
  ['2x+3=7', 'x = 2'],
  ['x^2-5x+6=0', 'x = 2, 3'],
  ['x^2=9', 'x = -3, 3'],
  ['3(x+1)=12', 'x = 3'],
  ['sin(x)=0', ''],
  ['sin^2x+cos^2x=1', 'identity'],
  ['1+1=3', 'False'],
  ['5 cm to in', '1.968'],
  ['3 kg + 400 g', '3.4'],
  ['60 mph in km/h', '96.5'],
  ['100 F to C', '37.7'],
  ['20%', '1/5'],
  ['5!', '120'],
  ['log(100)', '2'],
  ['ln(e)', '1'],
  ['|−3|', '3'],
  ['2^10', '1024'],
  ['1/2 + 1/3', '5/6'],
  ['sqrt(8)', '2√2'],
  ['cos(60)', ''],
  ['tan(45)', ''],
  ['x/2+1=4', 'x = 6'],
  ['2x^2=8', 'x = -2, 2'],
  ['1 m + 30 cm', '1.3'],
  ['10 kg to lb', '22.046'],
];

for (const [src, want] of cases) {
  const r = calculate(src, { mode: 'deg', exact: true, decimals: 10, units: true });
  console.log(
    (r.ok ? '✓' : '✗').padEnd(2),
    src.padEnd(20),
    '→',
    (r.text || r.error || '').padEnd(34),
    want && !r.text.includes(want) ? `  [want ${want}]` : ''
  );
}

console.log('\nrad mode:');
for (const src of ['sin(pi/6)', 'cos(pi)', 'sin(pi)', 'tan(pi/4)', 'asin(0.5)', 'sin x = 1/2']) {
  const r = calculate(src, { mode: 'rad', exact: true, decimals: 10, units: true });
  console.log(' ', src.padEnd(14), '→', r.text || r.error, r.note ? '· ' + r.note : '');
}

console.log('\nlatex:');
for (const src of ['(x+1)/(x-2)', 'sqrt(x^2+1)', 'sin(x)^2', '1/2']) {
  try {
    console.log(' ', src.padEnd(14), '→', toLatex(parse(src)));
  } catch (e) {
    console.log(' ', src, 'ERR', (e as Error).message);
  }
}
