/**
 * Generates the Inkpad app icon (SVG + every PNG size the PWA / iOS needs).
 *
 *   node scripts/makeIcons.cjs
 *
 * Design: a blue tile holding a white ruled page with a red margin and a bold
 * tapered ink flourish. The flourish is the memorable part and still reads at
 * 60 px on a home screen, where a thin stylus would disappear.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PUBLIC = path.join(__dirname, '../public');

/* ---------- geometry ---------- */
const lerp = (a, b, t) => a + (b - a) * t;

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
function cubicD(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
}

/** Tapered brush stroke as a filled outline, following one or more cubics. */
function taperedPath(segments, w0, w1, n = 48) {
  const pts = [];
  const ws = [];
  segments.forEach(([p0, p1, p2, p3], si) => {
    for (let i = si === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n;
      const [x, y] = cubic(p0, p1, p2, p3, t);
      const [dx, dy] = cubicD(p0, p1, p2, p3, t);
      const d = Math.hypot(dx, dy) || 1;
      pts.push([x, y, -dy / d, dx / d]);
      // global progress across all segments, used for the taper
      ws.push((si + t) / segments.length);
    }
  });
  const L = [];
  const R = [];
  pts.forEach(([x, y, nx, ny], i) => {
    // ease the taper so the thick end stays fat for a while
    const w = lerp(w0, w1, Math.pow(ws[i], 0.72)) / 2;
    L.push([x + nx * w, y + ny * w]);
    R.push([x - nx * w, y - ny * w]);
  });
  const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M ${f(L[0])}`;
  for (let i = 1; i < L.length; i++) d += ` L ${f(L[i])}`;
  for (let i = R.length - 1; i >= 0; i--) d += ` L ${f(R[i])}`;
  return d + ' Z';
}

// Two cubics so the flourish hooks over at the end, like a real pen flick.
const INK = taperedPath(
  [
    [
      [128, 374],
      [186, 330],
      [198, 216],
      [292, 198],
    ],
    [
      [292, 198],
      [332, 186],
      [362, 182],
      [392, 214],
    ],
  ],
  37,
  4
);

/* ---------- svg ---------- */
function iconSvg({ maskable = false } = {}) {
  // maskable art has to survive a circular crop: keep everything inside 80%.
  const art = maskable
    ? '<g transform="translate(256 256) scale(.78) translate(-256 -256)">'
    : '<g>';
  const tileRx = maskable ? 0 : 112;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b93ff"/>
      <stop offset=".55" stop-color="#2f6df6"/>
      <stop offset="1" stop-color="#1b46c2"/>
    </linearGradient>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eaf1fd"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#16307a"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#06123a" flood-opacity=".38"/>
    </filter>
  </defs>

  <rect width="512" height="512" rx="${tileRx}" fill="url(#tile)"/>
  ${art}
    <rect x="104" y="92" width="304" height="328" rx="30" fill="url(#page)" filter="url(#soft)"/>

    <g stroke="#c6d8f4" stroke-width="8" stroke-linecap="round">
      <line x1="140" y1="150" x2="372" y2="150"/>
      <line x1="140" y1="208" x2="372" y2="208"/>
      <line x1="140" y1="266" x2="372" y2="266"/>
      <line x1="140" y1="324" x2="372" y2="324"/>
      <line x1="140" y1="382" x2="372" y2="382"/>
    </g>
    <line x1="178" y1="122" x2="178" y2="390" stroke="#f4708c" stroke-width="6" opacity=".72" stroke-linecap="round"/>

    <path d="${INK}" fill="url(#ink)"/>
    <circle cx="128" cy="374" r="18.5" fill="#0b1220"/>
    <circle cx="392" cy="214" r="2.6" fill="#16307a"/>
  </g>
</svg>`;
}

/* ---------- rasterise ---------- */
const SIZES = [
  ['pwa-192x192.png', 192, {}],
  ['pwa-512x512.png', 512, {}],
  ['pwa-maskable-512x512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['icon-1024.png', 1024, {}],
  ['icon-64.png', 64, {}],
];

(async () => {
  fs.writeFileSync(path.join(PUBLIC, 'icon.svg'), iconSvg({ maskable: false }), 'utf8');
  fs.writeFileSync(path.join(PUBLIC, 'icon-maskable.svg'), iconSvg({ maskable: true }), 'utf8');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, opts] of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    const svg = iconSvg(opts).replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<html><body style="margin:0;padding:0;overflow:hidden;background:transparent">${svg}</body></html>`,
      { waitUntil: 'load' }
    );
    await page.waitForTimeout(120);
    await page.screenshot({
      path: path.join(PUBLIC, file),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log('wrote', file, size + 'px');
  }
  await browser.close();
})();
