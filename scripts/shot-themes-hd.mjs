import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
for (const id of ['minecraft-sound-fireplace', 'grand-theft-auto-san-andreas', 'anime', 'capybara-party']) {
  await p.addInitScript((t) => {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
    localStorage.setItem('inkpad-install-dismissed', '1');
    localStorage.setItem('inkpad-gx-theme', JSON.stringify({ id: t, mode: 'dark', wall: true }));
  }, id);
  await p.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#grid');
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `C:/tmp/slate-shots/hd-${id}.png` });
}
await b.close();
