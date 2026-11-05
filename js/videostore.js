// Keeps uploaded video files in the browser's IndexedDB (localStorage is far too small for
// video). Each file belongs to the profile that was open when it was added, and stays on this
// device and browser. Every call fails with a plain Error that is safe to show.
import { activeProfileId } from './storage.js';

const DB_NAME = 'engarde_videos';
const STORE = 'videos';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('This browser cannot save video files.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('This browser would not open its video storage.'));
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

// Saves a file and returns the id to remember it by.
export async function saveVideo(file) {
  const id = crypto.randomUUID();
  await run('readwrite', (store) => store.put(file, keyFor(id)),
    'The video could not be saved. This browser may be out of storage space.');
  return id;
}

// The saved file (a Blob), or undefined when it is gone.
export const loadVideo = (id) => run('readonly', (store) => store.get(keyFor(id)), 'The video could not be opened.');

export const deleteVideo = (id) => run('readwrite', (store) => store.delete(keyFor(id)), 'The video could not be removed.');

// Removes every video that belongs to one profile (used when the profile is deleted).
export async function deleteProfileVideos(profileId) {
  const prefix = profileId + ':';
  await run('readwrite', (store) => store.delete(IDBKeyRange.bound(prefix, prefix + '￿')), 'The videos could not be removed.');
}
