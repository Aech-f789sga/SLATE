/* Syntax-check the inline engine in index.html.
 *
 *   node scripts/check-inline.mjs
 *
 * The drawing engine is ~1400 lines of classic JavaScript written directly into
 * index.html. Nothing in the build touches it: `tsc` only looks at src/, and
 * Vite copies index.html through without parsing the inline block. So a stray
 * brace there produces a file that typechecks, builds, and then renders an
 * empty library at runtime with a single `SyntaxError` in the console — which
 * is exactly what happened once, and took a browser session to find.
 *
 * This compiles each inline block without running it, which is enough to catch
 * unbalanced brackets, bad tokens and truncated edits before they ship.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const file = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(file, 'utf8');

/* Only bare <script> tags: `type="module"` blocks are handled by the bundler,
   and `type="application/json"` blocks are data, not code. */
const re = /<script(?![^>]*\btype\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
let n = 0;
let bad = 0;

for (const m of html.matchAll(re)) {
  const code = m[1];
  if (!code.trim()) continue;
  n++;
  const line = html.slice(0, m.index).split('\n').length;
  try {
    // Compiles without executing: catches every syntax error, runs nothing.
    new vm.Script(code, { filename: `index.html:inline@${line}` });
  } catch (e) {
    bad++;
    console.error(`FAIL inline script at line ${line}: ${e.message}`);
  }
}

if (!n) {
  console.error('FAIL no inline scripts found — did the markup change?');
  process.exit(1);
}
if (bad) process.exit(1);

console.log(`inline scripts OK (${n} block${n === 1 ? '' : 's'})`);
