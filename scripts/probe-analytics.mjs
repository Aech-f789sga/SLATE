/**
 * Is the analytics script actually wired into the production build?
 *
 * `inject()` only runs when `import.meta.env.PROD`, so the dev server proves
 * nothing — this has to run against `vite preview`, which serves `dist`.
 *
 * The script itself lives at `/_vercel/insights/script.js`, which only exists on
 * a Vercel deployment, so the request is expected to fail here. What matters is
 * that the tag is added and the request is attempted; a 404 from a preview
 * server is the correct outcome, a missing tag is not.
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '4180';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const seen = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(`http://localhost:${PORT}/`) && !u.startsWith('data:')) seen.push(u);
});
const responses = [];
page.on('response', (r) => {
  const u = r.url();
  if (!u.startsWith(`http://localhost:${PORT}/`)) responses.push({ url: u, status: r.status() });
});
const logs = [];
page.on('console', (m) => {
  if (/analytics|vercel/i.test(m.text())) logs.push(`${m.type()}: ${m.text()}`);
});

// not `networkidle`: the shelf streams theme wallpaper media and never goes quiet
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await page.waitForTimeout(3000);

const tags = await page.evaluate(() =>
  Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))
);
const globals = await page.evaluate(() => ({
  va: typeof window.va,
  queue: Array.isArray(window.vaq) || Array.isArray(window._vercelAnalyticsQueue),
}));

console.log('script tags  ', tags);
console.log('requests     ', seen);
console.log('responses    ', responses);
console.log('window.va    ', globals);
console.log('console      ', logs.length ? logs : 'none');

await ctx.close();
await browser.close();
