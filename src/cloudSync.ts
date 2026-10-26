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
    lib?: any[];
    showLib?: () => void;
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

// Cloud Sync Controller
export const cloudSync = {
  currentUser: null as User | null,

  async onSave(nb: any) {
    if (this.currentUser && nb && nb.id) {
      try {
        const statusEl = document.getElementById('cloud-status');
        if (statusEl) statusEl.textContent = '☁️ Syncing…';
        await saveNotebookToCloud(this.currentUser.uid, nb);
        if (statusEl) statusEl.textContent = '☁️ Cloud Synced';
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
};

window.__inkpad_cloud = cloudSync;

// Listen for auth changes
onAuthStateChanged(auth, async (user) => {
  cloudSync.currentUser = user;
  const statusEl = document.getElementById('cloud-status');
  const userBox = document.getElementById('user-info-box');
  const loginBtn = document.getElementById('auth-login-btn');

  if (user) {
    if (statusEl) {
      statusEl.textContent = '☁️ Cloud Synced';
      statusEl.style.color = '#2a9d4f';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBox) {
      userBox.style.display = 'flex';
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = user.displayName || user.email || 'User';
    }

    // Load cloud notebooks and merge
    try {
      const cloudNbs = await loadNotebooksFromCloud(user.uid);
      if (cloudNbs && cloudNbs.length > 0) {
        let localLib: any[] = [];
        try {
          localLib = JSON.parse(localStorage.getItem('inkpad') || '[]');
        } catch {
          localLib = [];
        }

        const map = new Map<any, any>();
        cloudNbs.forEach((n) => map.set(String(n.id), n));
        localLib.forEach((n) => {
          const key = String(n.id);
          const exist = map.get(key);
          if (!exist || (n.upd || 0) >= (exist.upd || 0)) {
            map.set(key, n);
          }
        });

        const merged = Array.from(map.values());
        localStorage.setItem('inkpad', JSON.stringify(merged));
        if (Array.isArray(window.lib)) {
          window.lib.length = 0;
          merged.forEach((item) => window.lib?.push(item));
          if (typeof window.showLib === 'function') {
            window.showLib();
          }
        }
      }

      // Load general library figures
      const userData = await loadUserDataFromCloud(user.uid);
      if (userData?.generalLib && Array.isArray((window as any).GL)) {
        (window as any).GL = userData.generalLib;
        try {
          localStorage.setItem('inkpad-gl', JSON.stringify((window as any).GL));
        } catch {}
      }
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
  }
});
