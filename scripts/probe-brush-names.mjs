import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => window.eval('BRD.map(function(x){return x.id+":"+x.n}).join(" | ")')));
await browser.close();
