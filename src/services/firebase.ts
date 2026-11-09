/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
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
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  getAggregateFromServer,
  sum,
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

/**
 * Google sign-in that also works inside the Android app.
 *
 * Google refuses to serve its OAuth flow to an embedded WebView, so
 * `signInWithPopup` is a dead end there — the popup never opens and the button
 * appears to do nothing. When the APK is hosting us it exposes
 * `window.SlateNative.signInWithGoogle()`, which runs the real Android account
 * picker and resolves with a Google ID token; we trade that token for a normal
 * Firebase session. In a browser the native surface is absent and we fall back
 * to the popup, so the web build is unchanged.
 */
export async function signInWithGoogleAnywhere(): Promise<any> {
  const native = (window as any)?.SlateNative;

  if (native?.signInWithGoogle && native?.hasGoogleSignIn?.()) {
    const idToken: string = await native.signInWithGoogle();
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  }

  return signInWithPopup(auth, googleProvider);
}

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
  signInWithCredential,
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
  /** Engaged seconds, accumulated by the client's own activity clock. */
  seconds: number;
  /** What the client last said about itself. Absent on older rows. */
  online?: boolean;
  blocked?: boolean;
}

function providerOf(user: User): string {
  const p = user.providerData?.[0]?.providerId;
  return p === 'google.com' ? 'google' : p === 'password' ? 'email' : p || 'unknown';
}

/**
 * Register / refresh this user in the public directory used by the admin panel.
 * Writes only the signed-in user's own document.
 *
 * `deltaSeconds` is engaged time, never wall-clock: the caller measures it with
 * the activity clock in `src/usage.ts`. `online` is passed explicitly rather
 * than inferred from `lastSeen`, because the two disagree in the window that
 * matters — somebody who has been still for four minutes is present but has
 * earned no time, and somebody who was closed an hour ago is neither.
 */
export async function touchDirectory(user: User, deltaSeconds = 0, online?: boolean): Promise<void> {
  if (!user) return;
  const ref = doc(db, 'directory', user.uid);
  const snap = await getDoc(ref);
  const now = Date.now();
  const prev = snap.exists() ? snap.data() : null;
  const base: Record<string, any> = {
    email: user.email || '',
    provider: providerOf(user),
    lastSeen: now,
    seconds: Number(prev?.seconds || 0) + Math.max(0, Math.round(deltaSeconds)),
  };
  if (typeof online === 'boolean') base.online = online;
  if (!prev) {
    await setDoc(ref, { ...base, firstSeen: now });
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
      online: typeof v.online === 'boolean' ? v.online : undefined,
      blocked: Boolean(v.blocked),
    });
  });
  return out.sort((a, b) => b.lastSeen - a.lastSeen);
}

/* ------------------------------------------------------------------ */
/* Anonymous visits                                                    */
/* ------------------------------------------------------------------ */

/**
 * One engaged signed-out visit: ten minutes or more, by construction.
 *
 * The collection is written by browsers that have no account, so the create is
 * public (see firestore.rules — it is the only public write in the project).
 * The rules pin the id to the document name, fix the shape, and refuse anything
 * under 600 seconds, so the collection can only ever hold exactly what the
 * admin panel counts.
 */
export interface VisitorDoc {
  id: string;
  /** First moment of the visit, ms. */
  first: number;
  /** Last update from the client, ms. */
  last: number;
  /** Engaged seconds. */
  seconds: number;
}

export interface VisitorStats {
  total: number;
  week: number;
  today: number;
  seconds: number;
}

export async function upsertVisitor(v: VisitorDoc): Promise<void> {
  if (!v || !v.id) return;
  await setDoc(
    doc(db, 'visitors', v.id),
    {
      id: v.id,
      first: Math.round(v.first),
      last: Math.round(v.last),
      seconds: Math.round(v.seconds),
    },
    { merge: true }
  );
}

/**
 * Aggregates rather than documents: the panel only needs four numbers, and
 * pulling every visit down to count them would get slower every week.
 * Falls back to a bounded read if the backend refuses the aggregate.
 */
export async function visitorStats(): Promise<VisitorStats> {
  const col = collection(db, 'visitors');
  const start = new Date();
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const weekStart = dayStart - 6 * 86400000;
  try {
    const [all, week, today, total] = await Promise.all([
      getCountFromServer(col),
      getCountFromServer(query(col, where('first', '>=', weekStart))),
      getCountFromServer(query(col, where('first', '>=', dayStart))),
      getAggregateFromServer(col, { seconds: sum('seconds') }),
    ]);
    return {
      total: all.data().count,
      week: week.data().count,
      today: today.data().count,
      seconds: Number(total.data().seconds || 0),
    };
  } catch {
    const snap = await getDocs(query(col, orderBy('last', 'desc'), limit(1000)));
    let week = 0;
    let today = 0;
    let seconds = 0;
    snap.forEach((d) => {
      const v = d.data() as any;
      const first = Number(v.first || 0);
      seconds += Number(v.seconds || 0);
      if (first >= weekStart) week++;
      if (first >= dayStart) today++;
    });
    return { total: snap.size, week, today, seconds };
  }
}

export async function recentVisitors(max = 4): Promise<VisitorDoc[]> {
  const snap = await getDocs(query(collection(db, 'visitors'), orderBy('last', 'desc'), limit(max)));
  return snap.docs.map((d) => {
    const v = d.data() as any;
    return {
      id: d.id,
      first: Number(v.first || 0),
      last: Number(v.last || 0),
      seconds: Number(v.seconds || 0),
    };
  });
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
