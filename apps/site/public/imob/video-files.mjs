// Regras dos vídeos de imóvel: tipos, limites e checagem do conteúdo. Funções puras, sem DOM e sem rede.
// Os limites seguem o teto de 25 MiB por arquivo do Cloudflare, para que um vídeo aceito aqui também caiba
// numa futura publicação. Hoje, na prévia, os vídeos ficam só no navegador (IndexedDB).

export const VIDEO_LIMITS = Object.freeze({ maxBytes: 25 * 1024 * 1024, maxSeconds: 120, maxPerProperty: 3 });
export const VIDEO_TYPES = Object.freeze(['video/mp4', 'video/webm']);
const extensionTypes = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' };

const fail = error => ({ ok: false, error });

const oneDecimal = value => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "25,0 MB" a partir de 1 MB; abaixo disso em KB, para um arquivo pequeno não aparecer como "0,0 MB". */
export const formatSize = bytes => (bytes < 1024 * 1024 ? oneDecimal(bytes / 1024) + ' KB' : oneDecimal(bytes / (1024 * 1024)) + ' MB');

/** Nome para exibir: sem caminho, sem caracteres de controle e com tamanho limitado. */
export const displayName = name =>
  String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || 'vídeo';

function declaredType(file) {
  const type = String(file?.type ?? '').toLowerCase().split(';')[0].trim();
  if (type) return type;
  const extension = String(file?.name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extensionTypes[extension] ?? '';
}

/** Primeira checagem, só com os metadados do arquivo. `existing` é quantos vídeos o imóvel já tem. */
export function validateVideoFile(file, { existing = 0 } = {}) {
  const name = displayName(file?.name);
  if (existing >= VIDEO_LIMITS.maxPerProperty) return fail(`Cada imóvel aceita até ${VIDEO_LIMITS.maxPerProperty} vídeos.`);
  if (!Number.isFinite(file?.size) || file.size <= 0) return fail(`${name}: o arquivo está vazio.`);
  const type = declaredType(file);
  if (!VIDEO_TYPES.includes(type)) return fail(`${name}: use um vídeo MP4 ou WebM.`);
  if (file.size > VIDEO_LIMITS.maxBytes) {
    return fail(`${name}: tem ${formatSize(file.size)}; o limite é ${formatSize(VIDEO_LIMITS.maxBytes)}.`);
  }
  return { ok: true, type };
}

/** Descobre o contêiner pelos primeiros bytes. Devolve 'video/webm', 'video/mp4', 'video/quicktime' ou null. */
export function sniffVideoContainer(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  if (bytes.length >= 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') {
    return String.fromCharCode(bytes[8], bytes[9]) === 'qt' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

/** Segunda checagem: o conteúdo precisa ser do tipo informado (a extensão sozinha não prova nada). */
export function checkVideoContent(bytes, type, name = 'vídeo') {
  const sniffed = sniffVideoContainer(bytes);
  if (!sniffed || !VIDEO_TYPES.includes(sniffed)) return fail(`${displayName(name)}: o arquivo não parece ser um vídeo MP4 ou WebM válido.`);
  if (sniffed !== type) return fail(`${displayName(name)}: o conteúdo não corresponde ao tipo do arquivo.`);
  return { ok: true, type: sniffed };
}

/** Terceira checagem, com a duração lida pelo navegador. */
export function checkVideoDuration(seconds, name = 'vídeo') {
  if (!Number.isFinite(seconds) || seconds <= 0) return fail(`${displayName(name)}: não foi possível ler a duração.`);
  if (seconds > VIDEO_LIMITS.maxSeconds) {
    return fail(`${displayName(name)}: dura mais de ${VIDEO_LIMITS.maxSeconds / 60} minutos.`);
  }
  return { ok: true, seconds };
}
