#!/usr/bin/env node
/**
 * Records a freshly deployed web build in Firestore as `pending`.
 *
 * Called by .github/workflows/release.yml after `vercel deploy`. It never
 * touches `approved` — that is the admin's job, and it is the whole point of
 * the gate. Worst case, a CI bug can leave a build sitting in `pending`
 * forever; it can never push code to users.
 *
 * Usage:
 *   node scripts/publish-release.mjs --url <immutable-deployment-url> \
 *        --version <version> [--commit <sha>] [--notes <text>]
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON with
 * the "Cloud Datastore User" role (firebase-adminsdk works).
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROJECT = 'project-d6c1fcd0-76ec-4d52-b97';
const DATABASE = 'ai-studio-slate-289ffd97-dd6b-4b1f-9f9d-93b8e9fea93e';
const DOC_PATH = 'app_config/release';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const url = arg('url');
const version = arg('version');
const commit = arg('commit', '');
const notes = arg('notes', '');

if (!url || !version) {
  console.error('publish-release: --url and --version are required');
  process.exit(1);
}

if (!/^https:\/\//.test(url)) {
  console.error(`publish-release: refusing non-https url: ${url}`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Service-account -> OAuth access token (JWT bearer flow, no SDK needed)      */
/* -------------------------------------------------------------------------- */

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function accessToken() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set');

  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claim)
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/* -------------------------------------------------------------------------- */

const buildValue = {
  mapValue: {
    fields: {
      version: { stringValue: version },
      url: { stringValue: url },
      notes: { stringValue: notes },
      commit: { stringValue: commit },
      at: { integerValue: String(Date.now()) },
    },
  },
};

const token = await accessToken();

const endpoint =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}` +
  `/documents/${DOC_PATH}?updateMask.fieldPaths=pending&updateMask.fieldPaths=channel`;

const res = await fetch(endpoint, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fields: {
      pending: buildValue,
      channel: { stringValue: 'gated' },
    },
  }),
});

if (!res.ok) {
  console.error(`publish-release: write failed ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log(`publish-release: ${version} is now pending admin approval`);
console.log(`  url: ${url}`);
