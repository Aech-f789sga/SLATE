import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173/release-admin.html';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

const errors = [];
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);

const bodyText = (await page.locator('body').innerText()).trim();
const buttons = await page.locator('button').allInnerTexts();
const heading = await page.locator('h1').innerText().catch(() => '(none)');

console.log('--- heading ---');
console.log(heading);
console.log('--- buttons ---');
console.log(JSON.stringify(buttons));
console.log('--- visible text ---');
console.log(bodyText.slice(0, 600));
console.log('--- page errors ---');
console.log(errors.length ? errors.join('\n') : '(none)');
console.log('--- console (last 8) ---');
console.log(logs.slice(-8).join('\n') || '(none)');

await page.screenshot({ path: 'release-admin-check.png', fullPage: true });
await browser.close();
