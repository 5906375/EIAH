// Vídeos dos imóveis guardados no navegador (IndexedDB). Ficam fora do registro do imóvel de propósito:
// o localStorage não comporta vídeo, e o rascunho exportado para o piloto não deve carregar arquivos grandes.
const DATABASE = 'eiah-imob-property-videos';
const STORE = 'videos';

export const videoStoreAvailable = () => typeof indexedDB !== 'undefined';

const asPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento do navegador.'));
});

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('propertyId', 'propertyId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento do navegador.'));
  });
}

async function transaction(mode, work) {
  const db = await open();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Falha ao gravar no navegador.'));
    });
    const result = await work(tx.objectStore(STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/** Vídeos de um imóvel, do mais antigo para o mais novo. */
export async function listVideos(propertyId) {
  const records = await transaction('readonly', store => asPromise(store.index('propertyId').getAll(propertyId)));
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addVideo(propertyId, { name, type, size, duration, blob }) {
  const record = { id: crypto.randomUUID(), propertyId, name, type, size, duration, blob, createdAt: Date.now() };
  await transaction('readwrite', store => asPromise(store.put(record)));
  return record.id;
}

export const removeVideo = id => transaction('readwrite', store => asPromise(store.delete(id)));

export async function removeVideosOf(propertyId) {
  await transaction('readwrite', async store => {
    const keys = await asPromise(store.index('propertyId').getAllKeys(propertyId));
    await Promise.all(keys.map(key => asPromise(store.delete(key))));
  });
}
