const database = 'eiah-imob-site-setup-demo';
const storeName = 'workspaces';
const workspaceKey = 'demo';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function access(update) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, update ? 'readwrite' : 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(workspaceKey);
    let result;
    let problem;
    request.onsuccess = () => {
      try {
        const current = request.result ?? { experts: {} };
        result = update ? update(current) : current;
        if (update) store.put(result, workspaceKey);
      } catch (error) {
        problem = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      reject(problem ?? transaction.error);
    };
  });
}

export const readSetup = () => access();
export const updateSetup = update => access(update);
