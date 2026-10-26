/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use custom firestoreDatabaseId if provisioned
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();

// Test connection on boot per Firebase skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or starting up.');
    }
  }
}
testConnection();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
};
export type { User };

export interface CloudNotebookDoc {
  id: string;
  userId: string;
  name: string;
  cover: string;
  upd: number;
  fav?: boolean;
  del?: number;
  pagesJson: string;
  libJson?: string;
  updatedAt?: any;
}

/**
 * Save or update a notebook in Cloud Firestore
 */
export async function saveNotebookToCloud(userId: string, nb: any): Promise<void> {
  if (!userId || !nb || !nb.id) return;
  const notebookId = String(nb.id);
  const docRef = doc(db, 'users', userId, 'notebooks', notebookId);
  const cloudData: CloudNotebookDoc = {
    id: notebookId,
    userId,
    name: nb.name || 'Untitled',
    cover: nb.cover || '#2f6df6',
    upd: nb.upd || Date.now(),
    fav: Boolean(nb.fav),
    del: nb.del ? 1 : 0,
    pagesJson: JSON.stringify(nb.pages || []),
    libJson: JSON.stringify(nb.lib || []),
    updatedAt: serverTimestamp(),
  };
  await setDoc(docRef, cloudData, { merge: true });
}

/**
 * Delete a notebook document permanently from Cloud Firestore
 */
export async function deleteNotebookFromCloud(userId: string, notebookId: string | number): Promise<void> {
  if (!userId || !notebookId) return;
  const docRef = doc(db, 'users', userId, 'notebooks', String(notebookId));
  await deleteDoc(docRef);
}

/**
 * Load all notebooks for a user from Cloud Firestore
 */
export async function loadNotebooksFromCloud(userId: string): Promise<any[]> {
  if (!userId) return [];
  const colRef = collection(db, 'users', userId, 'notebooks');
  const snap = await getDocs(colRef);
  const notebooks: any[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() as CloudNotebookDoc;
    let pages = [];
    let lib = [];
    try {
      pages = JSON.parse(data.pagesJson || '[]');
    } catch {
      pages = [];
    }
    try {
      lib = JSON.parse(data.libJson || '[]');
    } catch {
      lib = [];
    }
    notebooks.push({
      id: Number(data.id) || data.id,
      name: data.name,
      cover: data.cover,
      upd: data.upd,
      fav: Boolean(data.fav),
      del: data.del || 0,
      pages,
      lib,
    });
  });
  return notebooks;
}

/**
 * Save user profile and global library to cloud
 */
export async function saveUserDataToCloud(userId: string, email: string, generalLib?: any[]): Promise<void> {
  if (!userId) return;
  const userRef = doc(db, 'users', userId);
  const data: Record<string, any> = {
    uid: userId,
    email: email || '',
    updatedAt: Date.now(),
  };
  if (generalLib) {
    data.generalLibJson = JSON.stringify(generalLib);
  }
  await setDoc(userRef, data, { merge: true });
}

/**
 * Load user profile & global library from cloud
 */
export async function loadUserDataFromCloud(userId: string): Promise<{ generalLib?: any[] } | null> {
  if (!userId) return null;
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  let generalLib = undefined;
  if (data.generalLibJson) {
    try {
      generalLib = JSON.parse(data.generalLibJson);
    } catch {
      // ignore
    }
  }
  return { generalLib };
}

/* ------------------------------------------------------------------ */
/* Admin: user directory, presence and moderation                      */
/* ------------------------------------------------------------------ */

export const ADMIN_EMAIL = 'derrickdarrack@gmail.com';
export const CONTACT_EMAIL = 'aechmoose@gmail.com';

export interface DirectoryEntry {
  uid: string;
  email: string;
  provider: string;
  firstSeen: number;
  lastSeen: number;
  seconds: number;
  blocked?: boolean;
}

function providerOf(user: User): string {
  const p = user.providerData?.[0]?.providerId;
  return p === 'google.com' ? 'google' : p === 'password' ? 'email' : p || 'unknown';
}

/**
 * Register / refresh this user in the public directory used by the admin panel.
 * Writes only the signed-in user's own document.
 */
export async function touchDirectory(user: User, deltaSeconds = 0): Promise<void> {
  if (!user) return;
  const ref = doc(db, 'directory', user.uid);
  const snap = await getDoc(ref);
  const now = Date.now();
  const base = {
    email: user.email || '',
    provider: providerOf(user),
    lastSeen: now,
    seconds: (snap.exists() ? Number(snap.data().seconds || 0) : 0) + Math.max(0, deltaSeconds),
  };
  if (!snap.exists()) {
    await setDoc(ref, { ...base, firstSeen: now, lastSeen: now, seconds: Math.max(0, deltaSeconds) });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

export async function listDirectory(): Promise<DirectoryEntry[]> {
  const snap = await getDocs(collection(db, 'directory'));
  const out: DirectoryEntry[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      uid: d.id,
      email: v.email || '(no email)',
      provider: v.provider || 'unknown',
      firstSeen: Number(v.firstSeen || 0),
      lastSeen: Number(v.lastSeen || 0),
      seconds: Number(v.seconds || 0),
      blocked: Boolean(v.blocked),
    });
  });
  return out.sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function listModeration(): Promise<Record<string, boolean>> {
  const snap = await getDocs(collection(db, 'moderation'));
  const out: Record<string, boolean> = {};
  snap.forEach((d) => {
    out[d.id] = Boolean(d.data().blocked);
  });
  return out;
}

export async function setBlocked(uid: string, blocked: boolean): Promise<void> {
  await setDoc(doc(db, 'moderation', uid), { blocked, at: Date.now() }, { merge: true });
}

export async function isBlocked(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'moderation', uid));
  return snap.exists() ? Boolean(snap.data().blocked) : false;
}
