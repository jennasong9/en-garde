// Keeps files (uploaded videos, meal photos) in the browser's IndexedDB, because localStorage is
// far too small for them. Each file belongs to the profile that was open when it was added and
// stays on this device and browser. Every call fails with a plain Error that is safe to show.
import { activeProfileId } from './storage.js';

// `kind` is the word used in error messages, such as "video" or "photo". `STORE` is the name of
// the object store inside the database.
export function createBlobStore(databaseName, STORE, kind) {

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('This browser cannot save ' + kind + ' files.'));
        return;
      }
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('This browser would not open its ' + kind + ' storage.'));
    });
  }

  // Runs one request against the store and waits for it to finish.
  async function run(mode, makeRequest, failure) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = makeRequest(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(new Error(failure));
        transaction.onabort = () => reject(new Error(failure));
      });
    } finally {
      db.close();
    }
  }

  const keyFor = (id) => activeProfileId() + ':' + id;

  return {
    // Saves a file and returns the id to remember it by.
    async save(file) {
      const id = crypto.randomUUID();
      await run('readwrite', (store) => store.put(file, keyFor(id)),
        'The ' + kind + ' could not be saved. This browser may be out of storage space.');
      return id;
    },
    // The saved file (a Blob), or undefined when it is gone.
    load: (id) => run('readonly', (store) => store.get(keyFor(id)), 'The ' + kind + ' could not be opened.'),
    remove: (id) => run('readwrite', (store) => store.delete(keyFor(id)), 'The ' + kind + ' could not be removed.'),
    // The ids of every file the open profile has saved.
    async listIds() {
      const prefix = activeProfileId() + ':';
      const keys = await run('readonly', (store) => store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')),
        'The ' + kind + 's could not be listed.');
      return keys.map((key) => key.slice(prefix.length));
    },
    // Removes every file that belongs to one profile (used when the profile is deleted).
    async removeProfile(profileId) {
      const prefix = profileId + ':';
      await run('readwrite', (store) => store.delete(IDBKeyRange.bound(prefix, prefix + '￿')), 'The ' + kind + 's could not be removed.');
    },
  };
}
