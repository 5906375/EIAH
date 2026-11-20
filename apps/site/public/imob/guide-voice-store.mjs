export const guideVoiceRoles = {
  welcome: 'Recepção',
  property: 'Imóvel',
  review: 'Revisão'
};

export function guideRecording(role, action = 'read', audio) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eiah-imob-visual:guide-voice', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('recordings', action === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('recordings');
      const operation = action === 'read' ? store.get(role)
        : action === 'remove' ? store.delete(role) : store.put(audio, role);
      transaction.oncomplete = () => { db.close(); resolve(operation.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}
