const fs = require('fs');
const s = fs.readFileSync('public/assets/aistudio/Inkpad___Handwritten_Notes__7__e420adc2.html', 'utf8');

function findAll(needle, ctx = 240, max = 6) {
  let i = -1, n = 0;
  const out = [];
  while ((i = s.indexOf(needle, i + 1)) !== -1 && n < max) {
    out.push({ at: i, text: s.slice(Math.max(0, i - ctx), i + ctx) });
    n++;
  }
  return out;
}

const q = process.argv[2];
const ctx = Number(process.argv[3] || 240);
for (const hit of findAll(q, ctx)) {
  console.log('=== @' + hit.at + ' ===');
  console.log(hit.text.replace(/\n/g, '\\n'));
  console.log();
}
