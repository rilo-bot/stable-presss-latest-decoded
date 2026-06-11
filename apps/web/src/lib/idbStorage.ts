/**
 * Minimal async IndexedDB storage adapter for zustand `persist`.
 *
 * The magazine store holds image-heavy documents that overflow localStorage's
 * ~5MB cap, so it persists to IndexedDB instead. This is a tiny key/value
 * wrapper exposed as a zustand `StateStorage`, ready for `createJSONStorage`.
 *
 * (Auth/onboarding stores keep using localStorage — their payloads are tiny.)
 */

import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const DB_NAME = 'stablepress';
const STORE_NAME = 'kv';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = fn(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

const idbStateStorage: StateStorage = {
  getItem: (key) =>
    run<string | undefined>('readonly', (s) => s.get(key)).then((v) => v ?? null),
  setItem: (key, value) =>
    run('readwrite', (s) => s.put(value, key)).then(() => undefined),
  removeItem: (key) =>
    run('readwrite', (s) => s.delete(key)).then(() => undefined),
};

/** Pass to zustand `persist({ storage: idbJSONStorage })`. */
export const idbJSONStorage = createJSONStorage(() => idbStateStorage);
