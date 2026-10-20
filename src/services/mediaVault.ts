/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StoredMediaItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'font' | 'file';
  mimeType: string;
  size: number;
  createdAt: number;
  blob: Blob;
}

const DB_NAME = 'slate_media_vault';
const DB_VERSION = 1;
const STORE_NAME = 'media_items';

const urlCache = new Map<string, string>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMediaItem(
  blob: Blob,
  name: string,
  type: 'image' | 'video' | 'font' | 'file'
): Promise<string> {
  const db = await openDB();
  const id = `m_${type.charAt(0)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item: StoredMediaItem = {
    id,
    name: name || `media_${Date.now()}`,
    type,
    mimeType: blob.type || 'application/octet-stream',
    size: blob.size,
    createdAt: Date.now(),
    blob,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => {
      // create and cache object URL
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      resolve(id);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMediaItem(id: string): Promise<StoredMediaItem | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getMediaUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) {
    return urlCache.get(id)!;
  }
  const item = await getMediaItem(id);
  if (!item || !item.blob) return null;
  const url = URL.createObjectURL(item.blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteMediaItem(id: string): Promise<boolean> {
  if (urlCache.has(id)) {
    URL.revokeObjectURL(urlCache.get(id)!);
    urlCache.delete(id);
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function listAllMediaItems(): Promise<Omit<StoredMediaItem, 'blob'>[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const items: StoredMediaItem[] = req.result || [];
      const summaries = items
        .map(({ id, name, type, mimeType, size, createdAt }) => ({
          id,
          name,
          type,
          mimeType,
          size,
          createdAt,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(summaries);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllMedia(): Promise<void> {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getStorageStats(): Promise<{
  itemCount: number;
  totalSizeBytes: number;
  estimateQuota?: number;
}> {
  const items = await listAllMediaItems();
  const totalSizeBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
  let estimateQuota: number | undefined;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      estimateQuota = est.quota;
    } catch {
      // ignore
    }
  }
  return {
    itemCount: items.length,
    totalSizeBytes,
    estimateQuota,
  };
}
