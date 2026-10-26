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
    return await signInWithEmailAndPassword(auth, email, pass);
  },

  async signUpWithEmail(email: string, pass: string) {
    return await createUserWithEmailAndPassword(auth, email, pass);
  },

  async resetPassword(email: string) {
    return await sendPasswordResetEmail(auth, email);
  },

  async signOut() {
    await firebaseSignOut(auth);
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
      window.toast?.('Restored from cloud');
    } catch (e: any) {
      note.textContent = 'Restore failed: ' + (e?.message || 'unknown error');
    } finally {
      down.disabled = false;
      down.textContent = '⬇️ Restore';
    }
  };
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
/* Auth state                                                          */
/* ------------------------------------------------------------------ */

onAuthStateChanged(auth, async (user) => {
  cloudSync.currentUser = user;
  const statusEl = document.getElementById('cloud-status');
  const userBox = document.getElementById('user-info-box');
  const loginBtn = document.getElementById('auth-login-btn');

  if (user) {
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
    try {
      await mergeCloudIntoLocal(user);
    } catch (e) {
      console.error('Error syncing cloud notebooks on login:', e);
    }
  } else {
    if (statusEl) {
      statusEl.textContent = '💻 Guest';
      statusEl.style.color = 'var(--mu)';
    }
    if (userBox) userBox.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    ensureGuestBanner();
  }
  if (document.getElementById('cloud-md')?.classList.contains('on')) renderCloudPanel();
});

/* ---- boot ---- */
ensureCloudButton();
ensureGuestBanner();
