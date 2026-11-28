import { addVideo, listVideos, removeVideo, removeVideosOf, videoStoreAvailable } from './property-videos.mjs';
import {
  checkVideoContent, checkVideoDuration, displayName, formatSize, validateVideoFile
} from './video-files.mjs';

// Lê a duração pelo navegador. WebM gravado no próprio navegador costuma informar duração infinita;
// ir ao fim do vídeo força o navegador a calcular o valor real.
function readDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const timer = setTimeout(() => finish(reject, new Error('demorou demais para abrir')), 10000);
    function finish(settle, value) {
      clearTimeout(timer);
      video.onloadedmetadata = video.ontimeupdate = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      settle(value);
    }
    video.preload = 'metadata';
    video.muted = true;
    video.onerror = () => finish(reject, new Error('o navegador não conseguiu abrir este vídeo'));
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return finish(resolve, video.duration);
      video.ontimeupdate = () => { if (Number.isFinite(video.duration)) finish(resolve, video.duration); };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.src = url;
  });
}

const quotaMessage = 'não há espaço no navegador para guardar este vídeo';

/**
 * Editor de vídeos de um imóvel. Vídeos escolhidos ficam "pendentes" e só são gravados em `commit`,
 * junto com o botão de aplicar o imóvel. Remover um vídeo já salvo pede confirmação e é imediato.
 */
export function createVideoEditor({ input, list, status, onBusy = () => {} }) {
  let propertyId = null;
  let saved = [];
  let pending = [];
  let token = 0;
  const say = text => { status.textContent = text; };

  function entry(label, detail, onRemove) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = label + ' · ' + detail;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-ghost';
    remove.textContent = 'Remover';
    remove.setAttribute('aria-label', 'Remover o vídeo ' + label);
    remove.addEventListener('click', onRemove);
    item.append(text, remove);
    return item;
  }

  function render() {
    list.replaceChildren(
      ...saved.map(record => entry(displayName(record.name), formatSize(record.size) + ' · salvo', async () => {
        if (!window.confirm('Remover este vídeo do imóvel?')) return;
        try {
          await removeVideo(record.id);
          saved = saved.filter(item => item.id !== record.id);
          say('Vídeo removido.');
        } catch {
          say('Não foi possível remover o vídeo neste navegador.');
        }
        render();
      })),
      ...pending.map(video => entry(video.name, formatSize(video.size) + ' · será salvo ao aplicar', () => {
        pending = pending.filter(item => item.id !== video.id);
        say('Vídeo retirado da seleção.');
        render();
      }))
    );
  }

  async function prepare(file, existing) {
    const basic = validateVideoFile(file, { existing });
    if (!basic.ok) return basic;
    const content = checkVideoContent(new Uint8Array(await file.slice(0, 16).arrayBuffer()), basic.type, file.name);
    if (!content.ok) return content;
    let seconds;
    try { seconds = await readDuration(file); } catch (error) {
      return { ok: false, error: `${displayName(file.name)}: ${error.message}.` };
    }
    const duration = checkVideoDuration(seconds, file.name);
    if (!duration.ok) return duration;
    return { ok: true, video: { id: crypto.randomUUID(), name: displayName(file.name), type: basic.type, size: file.size, duration: seconds, blob: file } };
  }

  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (!files.length) return;
    const mine = token;
    onBusy(true);
    const errors = [];
    let added = 0;
    try {
      for (const file of files) {
        const result = await prepare(file, saved.length + pending.length);
        if (mine !== token) return; // trocou de imóvel no meio da leitura
        if (!result.ok) { errors.push(result.error); continue; }
        pending.push(result.video);
        added += 1;
      }
      render();
      say([added ? (added === 1 ? '1 vídeo pronto para aplicar.' : `${added} vídeos prontos para aplicar.`) : '', ...errors].filter(Boolean).join(' '));
    } finally {
      if (mine === token) onBusy(false);
    }
  });

  return {
    /** Carrega os vídeos salvos de um imóvel (null = imóvel novo, ainda sem vídeos). */
    load(id) {
      token += 1;
      const mine = token;
      propertyId = id;
      saved = [];
      pending = [];
      input.value = '';
      onBusy(false);
      say('');
      render();
      if (!videoStoreAvailable()) {
        input.disabled = true;
        say('Este navegador não permite guardar vídeos na prévia.');
        return;
      }
      input.disabled = false;
      if (!id) return;
      listVideos(id).then(records => {
        if (mine !== token) return;
        saved = records;
        render();
      }).catch(() => { if (mine === token) say('Não foi possível ler os vídeos guardados neste navegador.'); });
    },
    /** Grava os vídeos pendentes no imóvel já salvo. Devolve quantos foram gravados e o que falhou. */
    async commit(id) {
      const failed = [];
      let savedNow = 0;
      for (const video of pending) {
        try {
          await addVideo(id, video);
          savedNow += 1;
        } catch (error) {
          failed.push(`${video.name}: ${error?.name === 'QuotaExceededError' ? quotaMessage : 'não foi possível guardar o vídeo'}.`);
        }
      }
      pending = [];
      return { saved: savedNow, failed };
    },
    /** Apaga todos os vídeos de um imóvel (ao remover o anúncio ou restaurar o exemplo). */
    async discardAll(id) {
      try { await removeVideosOf(id); } catch { /* sem vídeos para apagar ou sem armazenamento */ }
      saved = [];
      pending = [];
      render();
    },
    get count() { return saved.length + pending.length; },
    get pendingCount() { return pending.length; },
    get currentId() { return propertyId; },
  };
}
