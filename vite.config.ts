import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

/**
 * Identity of this build, used by the in-app update check.
 *
 * The commit sha is preferred because it is stable across rebuilds of the same
 * commit — a rebuild then does not look like a new version to every client.
 * Local builds fall back to a timestamp so they still differ from each other.
 */
const BUILD_VERSION =
  (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '')
    .slice(0, 7) || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);

const BUILD_TIME = new Date().toISOString();

/**
 * Publishes `version.json` next to the app so a running client can ask what is
 * currently deployed. It is deliberately not a hashed asset: the point is to
 * have one stable path that always reports the live version.
 */
function emitVersion(): Plugin {
  return {
    name: 'slate-emit-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({version: BUILD_VERSION, builtAt: BUILD_TIME}, null, 2),
      });
    },
  };
}

/**
 * In Vite dev mode (`apply: 'serve'`), clears any stale `/dev-sw.js` Workbox
 * precache worker so preview tabs always receive live edits to `index.html`
 * instead of a cached shell. Production builds (`vite build`) are untouched.
 */
function cleanupDevServiceWorker(): Plugin {
  const selfDestructSw = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.includes('workbox') || k.includes('precache')).map((k) => caches.delete(k)));
    } catch {}
    try { await self.registration.unregister(); } catch {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => { if ('navigate' in client) client.navigate(client.url).catch(() => {}); });
    } catch {}
  })());
});
`;
  const unregisterClient = `
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      const url = (r.active && r.active.scriptURL) || (r.installing && r.installing.scriptURL) || (r.waiting && r.waiting.scriptURL) || '';
      if (url.includes('dev-sw')) r.unregister().catch(() => {});
    });
  }).catch(() => {});
}
`;
  return {
    name: 'slate-cleanup-dev-sw',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0];
        if (pathOnly === '/dev-sw.js') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(selfDestructSw);
          return;
        }
        if (pathOnly === '/registerSW.js') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(unregisterClient);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __SLATE_VERSION__: JSON.stringify(BUILD_VERSION),
    },
    plugins: [
      react(),
      tailwindcss(),
      emitVersion(),
      cleanupDevServiceWorker(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'icon-maskable.svg'],
        manifest: {
          id: '/',
          name: 'Slate – Handwritten Notes',
          short_name: 'Slate',
          description: 'Slate is a handwritten notes and multimedia canvas for sketching, documents, and animations with cloud sync and offline PWA support.',
          theme_color: '#2f6df6',
          background_color: '#e9eef7',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          categories: ['productivity', 'utilities', 'education'],
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icon-1024.png',
              sizes: '1024x1024',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // the sticker packs are ~800 KB of SVG and are only touched when the
          // picker is open, so keep them out of the install-time precache and
          // cache them on first use instead.
          //
          // The theme wallpapers and mod media are in the same boat, and now
          // they are the mods' own files rather than re-encodes: a single
          // 4K wallpaper is bigger than this whole app. Precaching them would
          // mean downloading every theme on first visit.
          globIgnores: ['**/stickers/**', '**/themes/**', '**/mods/**', '**/brushes/**', '**/brush-icons/**', '**/version.json'],
          // release-admin.html is a plain page, not a route of the SPA. Without
          // this the service worker would answer the navigation with the cached
          // index.html shell and the admin console would never appear.
          navigateFallbackDenylist: [/^\/release-admin\.html/],
          runtimeCaching: [
            {
              urlPattern: /\/stickers\/.*\.svg$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'inkpad-stickers',
                expiration: { maxEntries: 420, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // imported Sketchbook brush masks, fetched the first time a brush
              // from that pack is previewed or drawn with
              urlPattern: /\/brushes\/[0-9a-f]{32}\.png$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'inkpad-brush-masks',
                expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // brush icons for the picker, same deal
              urlPattern: /\/brush-icons\/[0-9a-f]{32}\.webp$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'inkpad-brush-icons',
                expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR WebSocket is disabled in the AI Studio preview iframe.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

