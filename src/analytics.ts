/**
 * Vercel Web Analytics.
 *
 * Loaded as its own module tag in `index.html`, like everything else here — the
 * app has no single entry point, and `src/main.tsx` (the React scaffold this
 * project was generated from) is never loaded by the page at all, so putting
 * this there would have been a silent no-op.
 *
 * `inject()`, not the `<Analytics />` component: the component is the Next.js
 * and react-router adapters, and its whole job is watching a router for page
 * changes. This app has no router — the shelf and the editor are two states of
 * one page — so there is nothing to watch, and a "page view" here means an app
 * load. That is what the dashboard will show, and it is the honest number.
 *
 * Production only. The script is served from `/_vercel/insights/script.js`,
 * which exists on a Vercel deployment and nowhere else, so on the dev server it
 * would 404 on every reload — and in development the package logs every event to
 * the console as well.
 */
import { inject } from '@vercel/analytics';

if (import.meta.env.PROD) inject();
