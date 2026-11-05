/**
 * Builds a throwaway copy of release-admin.html with seeded release data, so the
 * signed-in admin view can be rendered and checked without a real Google login.
 * Writes dist/demo-admin.html. Development aid only.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('public/release-admin.html', 'utf8');
const marker = '/* ------------------------------------------------------------------- wire */';
const cut = src.indexOf(marker);
if (cut < 0) throw new Error('wire marker not found');

const now = Date.now();

const seeded = {
  approved: {
    version: '2026.11.01-a1b2c3d',
    url: 'https://slate-8f2a1c-team.vercel.app',
    notes: '',
    commit: 'a1b2c3d',
    at: now - 86_400_000 * 2,
  },
  pending: {
    version: '2026.11.05-e4f5g6h',
    url: 'https://slate-77bc02-team.vercel.app',
    notes: 'Faster lasso\nFixed pressure curve on stylus\nNew planner templates',
    commit: 'e4f5g6h',
    at: now - 1000 * 60 * 14,
  },
  history: [
    {
      version: '2026.10.28-99aa88b',
      url: 'https://slate-11aa22-team.vercel.app',
      notes: '',
      commit: '99aa88b',
      at: now - 86_400_000 * 6,
    },
    {
      version: '2026.10.20-77cc66d',
      url: 'https://slate-33bb44-team.vercel.app',
      notes: '',
      commit: '77cc66d',
      at: now - 86_400_000 * 14,
    },
  ],
};

const tail = [
  `state.user = { email: ADMIN_EMAIL, displayName: 'Admin' };`,
  `state.loading = false;`,
  `state.data = ${JSON.stringify(seeded, null, 2)};`,
  `render();`,
  `</script></body></html>`,
].join('\n');

writeFileSync('dist/demo-admin.html', src.slice(0, cut) + tail);
console.log('wrote dist/demo-admin.html');
