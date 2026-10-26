/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  saveNotebookToCloud,
  deleteNotebookFromCloud,
  loadNotebooksFromCloud,
  saveUserDataToCloud,
  loadUserDataFromCloud,
  ADMIN_EMAIL,
  CONTACT_EMAIL,
  touchDirectory,
  listDirectory,
  listModeration,
  setBlocked,
  isBlocked,
  User,
} from './services/firebase';

declare global {
  interface Window {
    __inkpad_cloud?: any;
    __inkpad_storageFull?: () => void;
    lib?: any[];
    showLib?: () => void;
    toast?: (msg: string) => void;
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Deferred PWA prompt
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const pwaBtn = document.getElementById('pwa-btn');
  if (pwaBtn) pwaBtn.style.display = 'block';
});

/* ------------------------------------------------------------------ */
/* Local store helpers                                                 */
/* ------------------------------------------------------------------ */

function readLocalLib(): any[] {
  try {
    return JSON.parse(localStorage.getItem('inkpad') || '[]') || [];
  } catch {
    return [];
  }
}

function readLocalGL(): any[] {
  try {
    return JSON.parse(localStorage.getItem('inkpad-gl') || '[]') || [];
  } catch {
    return [];
  }
}

/** Replace the in-memory notebook list (shared with the engine) and repaint. */
function hydrateLib(list: any[]) {
  try {
    localStorage.setItem('inkpad', JSON.stringify(list));
  } catch {
    /* quota is reported by the engine */
  }
  if (Array.isArray(window.lib)) {
    window.lib.length = 0;
    list.forEach((n) => window.lib?.push(n));
    if (typeof window.showLib === 'function') window.showLib();
  }
}

function hydrateGL(list: any[]) {
  try {
    localStorage.setItem('inkpad-gl', JSON.stringify(list));
  } catch {
    /* ignore */
  }
  const w = window as any;
  if (Array.isArray(w.GL)) {
    w.GL.length = 0;
    list.forEach((g) => w.GL.push(g));
  }
}

function backupAt(): number {
  return Number(localStorage.getItem('inkpad-backup-at') || 0) || 0;
}

function backupCount(): number {
  return Number(localStorage.getItem('inkpad-backup-count') || 0) || 0;
}

function relTime(ts: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/* Cloud sync controller                                               */
/* ------------------------------------------------------------------ */

export const cloudSync = {
  currentUser: null as User | null,

  async onSave(nb: any) {
    if (this.currentUser && nb && nb.id) {
      try {
        const statusEl = document.getElementById('cloud-status');
        if (statusEl) statusEl.textContent = '☁️ Syncing…';
        await saveNotebookToCloud(this.currentUser.uid, nb);
        if (statusEl) statusEl.textContent = '☁️ Cloud';
      } catch (e) {
        console.error('Failed to sync notebook to cloud:', e);
      }
    }
  },

  async onDelete(nbId: string | number) {
    if (this.currentUser && nbId) {
      try {
        await deleteNotebookFromCloud(this.currentUser.uid, nbId);
      } catch (e) {
        console.error('Failed to delete notebook from cloud:', e);
      }
    }
  },

  async promptInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      deferredPrompt = null;
      const pwaBtn = document.getElementById('pwa-btn');
      if (pwaBtn) pwaBtn.style.display = 'none';
    }
  },

  openAuth(mode = 'signin') {
    const md = document.getElementById('auth-md');
    if (!md) return;
    md.classList.add('on');
    (window as any).__auth_setMode?.(mode);
  },

  closeAuth() {
    const md = document.getElementById('auth-md');
    if (md) md.classList.remove('on');
  },

  async signInWithGoogle() {
    return await signInWithPopup(auth, googleProvider);
  },

  async signInWithEmail(email: string, pass: string) {
    if ((email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      throw Object.assign(
        new Error('The administrator account is Google-only — use “Continue with Google”.'),
        { code: 'auth/admin-google-only' }
      );
    }
    return await signInWithEmailAndPassword(auth, email, pass);
  },

  async signUpWithEmail(email: string, pass: string) {
    // The administrator account is Google-only: e-mail/password sign-up for
    // that address is rejected before it ever reaches Firebase.
    if ((email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      throw Object.assign(
        new Error(
          'This address is reserved for the administrator and can only be used with Google sign-in.'
        ),
        { code: 'auth/admin-google-only' }
      );
    }
    return await createUserWithEmailAndPassword(auth, email, pass);
  },

  async resetPassword(email: string) {
    return await sendPasswordResetEmail(auth, email);
  },

  async signOut() {
    await firebaseSignOut(auth);
    setSyncedIds([]);
    decorateCards();
  },

  /** Push every local notebook to Firestore. Signed-in only. */
  async backupAll(): Promise<{ ok: number; failed: number; signedOut: boolean }> {
    const user = auth.currentUser;
    if (!user) return { ok: 0, failed: 0, signedOut: true };
    const lib = readLocalLib();
    let ok = 0;
    let failed = 0;
    for (const nb of lib) {
      try {
        await saveNotebookToCloud(user.uid, nb);
        ok++;
      } catch (e) {
        console.error('Backup failed for notebook', nb?.id, e);
        failed++;
      }
    }
    try {
      await saveUserDataToCloud(user.uid, user.email || '', readLocalGL());
    } catch {
      /* non-fatal */
    }
    localStorage.setItem('inkpad-backup-at', String(Date.now()));
    localStorage.setItem('inkpad-backup-count', String(ok));
    return { ok, failed, signedOut: false };
  },

  /** Pull cloud notebooks and merge them with the local ones. */
  async restoreAll(): Promise<{ restored: number; signedOut: boolean }> {
    const user = auth.currentUser;
    if (!user) return { restored: 0, signedOut: true };
    const n = await mergeCloudIntoLocal(user);
    return { restored: n, signedOut: false };
  },
};

window.__inkpad_cloud = cloudSync;

/* ------------------------------------------------------------------ */
/* Per-notebook sync state                                             */
/* ------------------------------------------------------------------ */

const SYNC_KEY = 'inkpad-cloud-ids';

function syncedIds(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SYNC_KEY) || '[]'));
  } catch {
    return new Set<string>();
  }
}

function setSyncedIds(ids: Iterable<string>) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function markSynced(id: string | number, on: boolean) {
  const s = syncedIds();
  if (on) s.add(String(id));
  else s.delete(String(id));
  setSyncedIds(s);
  decorateCards();
}

async function refreshSyncedIds() {
  const user = auth.currentUser;
  if (!user) {
    // Signed out or not restored yet — keep the cached set so offline sessions
    // still show their cloud marks; signOut() clears it explicitly.
    decorateCards();
    return;
  }
  try {
    const list = await loadNotebooksFromCloud(user.uid);
    setSyncedIds(list.map((n) => String(n.id)));
  } catch {
    /* offline: keep the cached set */
  }
  decorateCards();
}

/** Add a cloud toggle to every notebook card in the library. */
function decorateCards() {
  const user = auth.currentUser;
  const ids = syncedIds();
  document.querySelectorAll<HTMLElement>('#grid .card[data-id]').forEach((card) => {
    const id = String(card.dataset.id);
    let btn = card.querySelector<HTMLButtonElement>('.cloud-tog');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'cloud-tog';
      btn.type = 'button';
      // Match the sibling pills (☆ / Delete) so it reads as a real control.
      btn.style.cssText =
        'display:inline-flex;align-items:center;gap:3px;border:1px solid var(--bd);background:var(--sf);border-radius:10px;padding:2px 7px;font-size:12px;line-height:1.1;font-family:inherit;cursor:pointer;color:var(--mu)';
      const host = card.querySelector('.sub span:last-child');
      if (host) host.prepend(btn);
      btn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await toggleNotebook(id);
      };
    }
    const on = ids.has(id);
    btn.textContent = on ? '☁️✓' : '☁️';
    btn.style.borderColor = on ? '#2a9d4f' : 'var(--bd)';
    btn.style.color = on ? '#2a9d4f' : 'var(--mu)';
    btn.style.background = on ? 'rgba(42,157,79,.12)' : 'var(--sf)';
    btn.style.opacity = user ? '1' : '.8';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on
      ? 'Synced to the cloud — click to remove the cloud copy'
      : user
      ? 'Sync this notebook to the cloud'
      : 'Sign in to sync this notebook';
  });
}

async function toggleNotebook(id: string) {
  const user = auth.currentUser;
  if (!user) {
    cloudSync.openAuth('signin');
    return;
  }
  const nb = (window.lib || []).find((n: any) => String(n.id) === id);
  if (syncedIds().has(id)) {
    await deleteNotebookFromCloud(user.uid, id);
    markSynced(id, false);
    window.toast?.('Removed from cloud');
    if (document.getElementById('cloud-md')?.classList.contains('on')) renderCloudPanel();
    return;
  }
  if (!nb) return;
  await saveNotebookToCloud(user.uid, nb);
  markSynced(id, true);
  localStorage.setItem('inkpad-backup-at', String(Date.now()));
  window.toast?.('Synced to cloud');
  if (document.getElementById('cloud-md')?.classList.contains('on')) renderCloudPanel();
}

/** Re-decorate after the engine repaints the library. */
function hookShowLib() {
  const orig = window.showLib;
  if (!orig || (orig as any).__cloudHooked) return;
  const wrapped = function (this: any, ...args: any[]) {
    const r = (orig as any).apply(this, args);
    setTimeout(decorateCards, 0);
    return r;
  };
  (wrapped as any).__cloudHooked = true;
  window.showLib = wrapped as any;
}

/* ------------------------------------------------------------------ */
/* Cloud merge                                                         */
/* ------------------------------------------------------------------ */

async function mergeCloudIntoLocal(user: User): Promise<number> {
  const cloudNbs = await loadNotebooksFromCloud(user.uid);
  if (!cloudNbs || cloudNbs.length === 0) return 0;

  const localLib = readLocalLib();
  const map = new Map<string, any>();
  cloudNbs.forEach((n) => map.set(String(n.id), n));
  localLib.forEach((n) => {
    const key = String(n.id);
    const exist = map.get(key);
    if (!exist || (n.upd || 0) >= (exist.upd || 0)) map.set(key, n);
  });

  const merged = Array.from(map.values());
  hydrateLib(merged);

  const userData = await loadUserDataFromCloud(user.uid);
  if (userData?.generalLib) hydrateGL(userData.generalLib);

  return merged.length;
}

/* ------------------------------------------------------------------ */
/* Home UI: cloud panel + guest banner                                 */
/* ------------------------------------------------------------------ */

function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ensureCloudButton() {
  if (document.getElementById('cloud-btn')) return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  const b = document.createElement('button');
  b.id = 'cloud-btn';
  b.type = 'button';
  b.textContent = '☁️ Cloud backup';
  b.style.cssText =
    'text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit';
  b.onclick = () => openCloudPanel();

  const pen = document.getElementById('pen-btn');
  const links = nav.querySelectorAll('a[data-f]');
  const anchor = pen || (links.length ? links[links.length - 1] : null);
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor.nextSibling);
  else nav.appendChild(b);
}

function buildCloudPanel(): HTMLElement {
  let md = document.getElementById('cloud-md');
  if (md) return md;

  md = document.createElement('div');
  md.id = 'cloud-md';
  md.innerHTML =
    '<div class="box">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<b style="font-size:17px">Cloud backup</b>' +
    '<button class="ic" id="cloud-close" style="font-size:16px;padding:2px 6px" aria-label="Close">✕</button>' +
    '</div>' +
    '<div id="cloud-body" style="display:flex;flex-direction:column;gap:10px"></div>' +
    '</div>';
  document.body.appendChild(md);

  const close = () => md!.classList.remove('on');
  document.getElementById('cloud-close')!.onclick = close;
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) close();
  });
  return md;
}

function renderCloudPanel() {
  const body = document.getElementById('cloud-body');
  if (!body) return;
  body.innerHTML = '';

  const user = auth.currentUser;
  const localCount = readLocalLib().length;

  if (!user) {
    body.appendChild(
      el(
        'div',
        'font-size:13px;line-height:1.5;color:var(--mu)',
        'You are not signed in. Notebooks are kept in this browser only, so they survive a refresh but are lost if you clear site data, use private mode, or the device runs low on storage.'
      )
    );
    const signIn = el('button', 'font-weight:600;padding:9px', '🔐 Sign in to back up to the cloud') as HTMLButtonElement;
    signIn.onclick = () => {
      document.getElementById('cloud-md')?.classList.remove('on');
      cloudSync.openAuth('signin');
    };
    body.appendChild(signIn);
    body.appendChild(
      el(
        'div',
        'font-size:11.5px;color:var(--mu);line-height:1.5',
        localCount + ' notebook' + (localCount === 1 ? '' : 's') + ' on this device, waiting to be backed up.'
      )
    );
    return;
  }

  const rows: [string, string][] = [
    ['Account', user.email || user.displayName || 'signed in'],
    ['On this device', localCount + ' notebook' + (localCount === 1 ? '' : 's')],
    ['Last backup', relTime(backupAt()) + (backupCount() ? ' (' + backupCount() + ' files)' : '')],
  ];
  rows.forEach(([k, v]) => {
    const row = el('div', 'display:flex;justify-content:space-between;gap:10px;font-size:13px');
    row.appendChild(el('span', 'color:var(--mu)', k));
    row.appendChild(el('span', 'font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis', v));
    body.appendChild(row);
  });

  // ---- files that actually live in the cloud ----
  const listHead = el('div', 'display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-top:2px', '');
  listHead.innerHTML = '<span>Files in the cloud</span><span id="cloud-count"></span>';
  body.appendChild(listHead);

  const files = el('div', 'display:flex;flex-direction:column;gap:6px;max-height:230px;overflow:auto;border:1px solid var(--bd);border-radius:10px;padding:6px');
  files.id = 'cloud-files';
  files.appendChild(el('div', 'color:var(--mu);font-size:12px;padding:8px', 'Loading…'));
  body.appendChild(files);
  void loadCloudFiles(files);

  const bar = el('div', 'display:flex;gap:8px;flex-wrap:wrap');
  const up = el('button', 'flex:1;font-weight:600;padding:9px', '⬆️ Back up all') as HTMLButtonElement;
  const down = el('button', 'flex:1;padding:9px', '⬇️ Restore') as HTMLButtonElement;
  bar.appendChild(up);
  bar.appendChild(down);
  body.appendChild(bar);

  const note = el('div', 'font-size:11.5px;color:var(--mu);line-height:1.5', '');
  body.appendChild(note);

  const signOut = el('button', 'font-size:12px;padding:6px 10px;align-self:flex-start', 'Sign out') as HTMLButtonElement;
  signOut.onclick = async () => {
    await cloudSync.signOut();
    document.getElementById('cloud-md')?.classList.remove('on');
  };
  body.appendChild(signOut);

  up.onclick = async () => {
    up.disabled = true;
    up.textContent = 'Backing up…';
    try {
      const r = await cloudSync.backupAll();
      note.textContent = r.failed
        ? r.ok + ' backed up, ' + r.failed + ' failed (check your connection).'
        : 'Backed up ' + r.ok + ' notebook' + (r.ok === 1 ? '' : 's') + ' to the cloud.';
      window.toast?.('Backed up ' + r.ok + ' notebook' + (r.ok === 1 ? '' : 's'));
      await refreshSyncedIds();
      renderCloudPanel();
    } catch (e: any) {
      note.textContent = 'Backup failed: ' + (e?.message || 'unknown error');
    } finally {
      up.disabled = false;
      up.textContent = '⬆️ Back up all';
    }
  };

  down.onclick = async () => {
    down.disabled = true;
    down.textContent = 'Restoring…';
    try {
      const r = await cloudSync.restoreAll();
      note.textContent = r.restored
        ? 'Merged ' + r.restored + ' notebooks from the cloud.'
        : 'Nothing in the cloud yet — run a backup first.';
      await refreshSyncedIds();
      window.toast?.('Restored from cloud');
    } catch (e: any) {
      note.textContent = 'Restore failed: ' + (e?.message || 'unknown error');
    } finally {
      down.disabled = false;
      down.textContent = '⬇️ Restore';
    }
  };
}

/** Render the list of notebooks stored in Firestore, with previews. */
async function loadCloudFiles(host: HTMLElement) {
  const user = auth.currentUser;
  host.innerHTML = '';
  if (!user) return;
  let list: any[] = [];
  try {
    list = await loadNotebooksFromCloud(user.uid);
  } catch (e: any) {
    host.appendChild(el('div', 'color:#e5383b;font-size:12px;padding:8px', 'Could not load: ' + (e?.message || 'offline')));
    return;
  }
  const count = document.getElementById('cloud-count');
  if (count) count.textContent = list.length + ' file' + (list.length === 1 ? '' : 's');
  if (!list.length) {
    host.appendChild(el('div', 'color:var(--mu);font-size:12px;padding:8px', 'No files in the cloud yet. Tap ☁️ on a notebook or use Back up all.'));
    return;
  }
  list.sort((a, b) => (b.upd || 0) - (a.upd || 0));
  list.forEach((nb) => {
    const row = el('div', 'display:flex;align-items:center;gap:9px;padding:5px;border-radius:8px');
    row.style.background = 'var(--bg)';

    const cv = document.createElement('canvas');
    cv.width = 72;
    cv.height = 99;
    cv.style.cssText = 'width:36px;height:49px;flex:none;border-radius:4px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25)';
    const g = cv.getContext('2d');
    const p0 = nb.pages?.[0];
    if (g && p0 && typeof (window as any).render === 'function') {
      const k = Math.min(72 / (p0.pw || 800), 99 / (p0.ph || 1100));
      g.save();
      g.scale(k, k);
      try {
        (window as any).render(g, p0);
      } catch {
        /* preview is best effort */
      }
      g.restore();
    } else if (g) {
      g.fillStyle = nb.cover || '#2f6df6';
      g.fillRect(0, 0, 72, 99);
    }
    row.appendChild(cv);

    const meta = el('div', 'flex:1;min-width:0;font-size:12px');
    meta.appendChild(el('div', 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', nb.name || 'Untitled'));
    meta.appendChild(el('div', 'color:var(--mu);font-size:11px', (nb.pages?.length || 0) + ' pages · ' + relTime(nb.upd || 0)));
    row.appendChild(meta);

    const del = el('button', 'border:0;background:transparent;font-size:12px;padding:4px 6px;cursor:pointer;color:#e5383b', '✕') as HTMLButtonElement;
    del.title = 'Remove from cloud';
    del.onclick = async () => {
      del.disabled = true;
      try {
        await deleteNotebookFromCloud(user.uid, nb.id);
        markSynced(nb.id, false);
        window.toast?.('Removed from cloud');
        renderCloudPanel();
      } catch (e: any) {
        del.disabled = false;
        window.toast?.('Could not remove: ' + (e?.message || 'error'));
      }
    };
    row.appendChild(del);
    host.appendChild(row);
  });
}

function openCloudPanel() {
  buildCloudPanel().classList.add('on');
  renderCloudPanel();
}

/* ---- guest banner ---- */

function ensureGuestBanner(force = false) {
  const libm = document.getElementById('libm');
  const existing = document.getElementById('guest-banner');

  if (auth.currentUser) {
    existing?.remove();
    return;
  }
  if (!force && localStorage.getItem('inkpad-guest-dismissed') === '1') {
    existing?.remove();
    return;
  }
  if (!libm || existing) return;

  const bar = document.createElement('div');
  bar.id = 'guest-banner';
  const text = el('div', 'grow', '');
  text.innerHTML =
    '<b>Saved on this device only.</b> Notebooks survive a refresh, but clearing browser data, private mode or iOS storage cleanup can remove them. Sign in to keep a copy in the cloud.';
  bar.appendChild(text);

  const signIn = el('button', '', 'Sign in') as HTMLButtonElement;
  signIn.onclick = () => cloudSync.openAuth('signin');
  bar.appendChild(signIn);

  const close = el('button', 'border:0;background:transparent;padding:5px 6px', '✕') as HTMLButtonElement;
  close.title = 'Dismiss';
  close.onclick = () => {
    localStorage.setItem('inkpad-guest-dismissed', '1');
    bar.remove();
  };
  bar.appendChild(close);

  libm.insertBefore(bar, libm.firstChild);
}

/* ---- storage quota ---- */

window.__inkpad_storageFull = () => {
  window.toast?.('Device storage is full — back up to the cloud');
  localStorage.removeItem('inkpad-guest-dismissed');
  ensureGuestBanner(true);
};

/* ------------------------------------------------------------------ */
/* BETA badge + contact                                                */
/* ------------------------------------------------------------------ */

function ensureBetaBadge() {
  if (document.getElementById('beta-badge')) return;
  const lib = document.getElementById('lib');
  if (!lib) return;
  const box = document.createElement('div');
  box.id = 'beta-badge';
  // lives inside #lib, so it disappears together with the library
  box.style.cssText =
    'position:fixed;right:12px;bottom:10px;z-index:40;display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--mu);background:color-mix(in srgb,var(--sf) 88%,transparent);border:1px solid var(--bd);border-radius:20px;padding:3px 9px;pointer-events:auto';
  const tag = document.createElement('b');
  tag.textContent = 'BETA';
  tag.style.cssText = 'font-size:9.5px;letter-spacing:.08em;color:var(--ac);font-weight:700';
  box.appendChild(tag);
  const a = document.createElement('a');
  a.href = 'mailto:' + CONTACT_EMAIL;
  a.textContent = CONTACT_EMAIL;
  a.style.cssText = 'color:var(--mu);text-decoration:none';
  a.title = 'Contact the Inkpad team';
  box.appendChild(a);
  lib.appendChild(box);
}

/* ------------------------------------------------------------------ */
/* Admin: user directory                                               */
/* ------------------------------------------------------------------ */

function isAdminUser(user: User | null): boolean {
  if (!user || !user.email) return false;
  const google = (user.providerData || []).some((p) => p.providerId === 'google.com');
  return user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && google;
}

/* ---- presence heartbeat (60 s) ---- */

let hbTimer: number | null = null;
let hbLast = 0;

function startHeartbeat(user: User) {
  stopHeartbeat();
  hbLast = Date.now();
  void touchDirectory(user, 0).catch(() => {});
  hbTimer = window.setInterval(() => {
    const u = auth.currentUser;
    if (!u) return;
    const now = Date.now();
    const delta = Math.round((now - hbLast) / 1000);
    hbLast = now;
    void touchDirectory(u, delta).catch(() => {});
  }, 60000);
  window.addEventListener('beforeunload', flushHeartbeat);
}

function flushHeartbeat() {
  const u = auth.currentUser;
  if (!u || !hbLast) return;
  const delta = Math.round((Date.now() - hbLast) / 1000);
  hbLast = Date.now();
  if (delta > 0) void touchDirectory(u, delta).catch(() => {});
}

function stopHeartbeat() {
  if (hbTimer !== null) {
    clearInterval(hbTimer);
    hbTimer = null;
  }
  window.removeEventListener('beforeunload', flushHeartbeat);
}

function ensureAdminButton() {
  const existing = document.getElementById('admin-btn');
  if (!isAdminUser(auth.currentUser)) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  const b = document.createElement('button');
  b.id = 'admin-btn';
  b.type = 'button';
  b.textContent = '🛡 Admin';
  b.style.cssText =
    'text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit';
  b.onclick = () => openAdminPanel();
  const cloud = document.getElementById('cloud-btn');
  if (cloud && cloud.parentNode) cloud.parentNode.insertBefore(b, cloud.nextSibling);
  else nav.appendChild(b);
}

function fmtDur(sec: number): string {
  if (!sec || sec < 60) return Math.round(sec || 0) + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function buildAdminPanel(): HTMLElement {
  let md = document.getElementById('admin-md');
  if (md) return md;
  md = document.createElement('div');
  md.id = 'admin-md';
  md.className = 'on';
  md.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:99;padding:16px';
  md.innerHTML =
    '<div class="box" style="background:var(--sf);border-radius:18px;padding:18px;width:min(96vw,560px);max-height:88vh;overflow:auto;display:flex;flex-direction:column;gap:10px;border:1px solid var(--bd)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<b style="font-size:17px">🛡 Admin — users</b>' +
    '<button class="ic" id="admin-close" style="font-size:16px;padding:2px 6px">✕</button>' +
    '</div>' +
    '<div id="admin-summary" style="font-size:12px;color:var(--mu)"></div>' +
    '<div id="admin-list" style="display:flex;flex-direction:column;gap:6px"></div>' +
    '<div style="font-size:11px;color:var(--mu);line-height:1.5">Blocking signs the account out on its next check and the client refuses to sync. Contact address shown to users: ' +
    CONTACT_EMAIL +
    '.</div>' +
    '</div>';
  md.style.display = 'none';
  document.body.appendChild(md);
  const close = () => (md!.style.display = 'none');
  document.getElementById('admin-close')!.onclick = close;
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) close();
  });
  return md;
}

async function loadAdminList(host: HTMLElement) {
  host.innerHTML = '';
  host.appendChild(el('div', 'color:var(--mu);font-size:12px', 'Loading…'));
  try {
    const [dir, mod] = await Promise.all([listDirectory(), listModeration()]);
    host.innerHTML = '';
    const online = dir.filter((d) => Date.now() - d.lastSeen < 150000).length;
    const summary = document.getElementById('admin-summary');
    if (summary) summary.textContent = dir.length + ' registered · ' + online + ' online now';

    if (!dir.length) {
      host.appendChild(el('div', 'color:var(--mu);font-size:12px', 'No accounts have opened the app yet.'));
      return;
    }
    dir.forEach((u) => {
      const row = el('div', 'display:flex;align-items:center;gap:9px;padding:8px;border:1px solid var(--bd);border-radius:10px;font-size:12px');
      const dot = el('span', 'width:8px;height:8px;border-radius:50%;flex:none', '');
      const isOn = Date.now() - u.lastSeen < 150000;
      dot.style.background = isOn ? '#2a9d4f' : 'var(--bd)';
      dot.title = isOn ? 'online' : 'offline';
      row.appendChild(dot);

      const info = el('div', 'flex:1;min-width:0');
      const mail = el('div', 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', u.email);
      mail.title = u.email;
      info.appendChild(mail);
      info.appendChild(
        el(
          'div',
          'color:var(--mu);font-size:11px',
          u.provider + ' · used ' + fmtDur(u.seconds) + ' · seen ' + relTime(u.lastSeen)
        )
      );
      row.appendChild(info);

      const blocked = mod[u.uid] ?? u.blocked ?? false;
      const btn = el(
        'button',
        'font-size:11px;padding:5px 9px;flex:none' + (blocked ? ';border-color:#e5383b;color:#e5383b' : ''),
        blocked ? 'Unblock' : 'Block'
      ) as HTMLButtonElement;
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await setBlocked(u.uid, !blocked);
          window.toast?.(blocked ? 'Unblocked ' + u.email : 'Blocked ' + u.email);
          await loadAdminList(host);
        } catch (e: any) {
          btn.disabled = false;
          window.toast?.('Failed: ' + (e?.message || 'permission denied'));
        }
      };
      row.appendChild(btn);
      host.appendChild(row);
    });
  } catch (e: any) {
    host.innerHTML = '';
    host.appendChild(
      el(
        'div',
        'color:#e5383b;font-size:12px;line-height:1.5',
        'Could not read the directory: ' +
          (e?.message || 'permission denied') +
          '. Deploy the updated firestore.rules so the admin can list users.'
      )
    );
  }
}

function openAdminPanel() {
  const md = buildAdminPanel();
  md.style.display = 'flex';
  const host = document.getElementById('admin-list');
  if (host) void loadAdminList(host);
}

/* ------------------------------------------------------------------ */
/* Auth state                                                          */
/* ------------------------------------------------------------------ */

onAuthStateChanged(auth, async (user) => {
  cloudSync.currentUser = user;
  const statusEl = document.getElementById('cloud-status');
  const userBox = document.getElementById('user-info-box');
  const loginBtn = document.getElementById('auth-login-btn');

  if (user) {
    /* --- moderation gate ------------------------------------------- */
    let blocked = false;
    try {
      blocked = await isBlocked(user.uid);
    } catch {
      /* rules may not allow the read yet — fail open, never lock out */
    }
    if (blocked && !isAdminUser(user)) {
      stopHeartbeat();
      ensureAdminButton();
      await firebaseSignOut(auth).catch(() => {});
      const md = document.getElementById('auth-md');
      const msg = document.getElementById('auth-msg');
      if (msg) {
        msg.textContent =
          'This account has been suspended. Contact ' + CONTACT_EMAIL + ' if you think this is a mistake.';
        msg.style.color = '#e5383b';
      }
      if (md) md.classList.add('on');
      return;
    }

    if (statusEl) {
      statusEl.textContent = '☁️ Cloud';
      statusEl.style.color = '#2a9d4f';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBox) {
      userBox.style.display = 'flex';
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = user.displayName || user.email || 'User';
    }
    ensureGuestBanner();
    ensureAdminButton();
    startHeartbeat(user);
    try {
      await mergeCloudIntoLocal(user);
    } catch (e) {
      console.error('Error syncing cloud notebooks on login:', e);
    }
    try {
      await refreshSyncedIds();
    } catch {
      /* non-fatal */
    }
  } else {
    stopHeartbeat();
    ensureAdminButton();
    if (statusEl) {
      statusEl.textContent = '💻 Guest';
      statusEl.style.color = 'var(--mu)';
    }
    if (userBox) userBox.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    ensureGuestBanner();
  }
  if (document.getElementById('cloud-md')?.classList.contains('on')) renderCloudPanel();
  decorateCards();
});

/* ---- boot ---- */
ensureCloudButton();
ensureGuestBanner();
ensureBetaBadge();
ensureAdminButton();
hookShowLib();
void refreshSyncedIds();
