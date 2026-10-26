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
