// Reabrir um rascunho salvo (vitrine-imob.json) no editor, sem rede:
// o arquivo é só dado. Nada vira código, e cada campo passa pelas mesmas regras do editor.
import { footerFields } from './client-footer.mjs';
import { validateDraft } from './draft-rules.mjs';
import { clientBrandStorageKey, saveBrand } from './client-brand.mjs';
import { clientPropertyStorageKey, replaceClientProperties } from './client-properties.mjs';

export const MAX_DRAFT_BYTES = 25 * 1024 * 1024;

// Campos de texto da marca e tamanho máximo; os do rodapé vêm da lista oficial (client-footer.mjs), 200 caracteres por padrão.
const brandText = { name: 80, introduction: 500, contact: 120, ...Object.fromEntries(footerFields.map(field => [field, 200])) };
const validLogo = value => typeof value === 'string' && value.length < 730000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
const validPhoto = value => typeof value === 'string' && value.length < 1200000 && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value);
const validId = /^(?:[vlt]-\d{2}|p-[a-f0-9-]{36})$/;
const number = value => (Number.isFinite(value) && value >= 0 ? value : undefined);

/** Lê o texto do arquivo. Devolve { ok: true, draft } ou { ok: false, message } em português. */
export function parseDraftText(text, { maxBytes = MAX_DRAFT_BYTES } = {}) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, message: 'O arquivo está vazio.' };
  if (text.length > maxBytes) return { ok: false, message: 'O arquivo é grande demais (o limite é ' + Math.round(maxBytes / 1048576) + ' MB).' };
  let draft;
  try {
    draft = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Não foi possível ler o arquivo. Escolha o vitrine-imob.json que você baixou em "Baixar rascunho para publicação".' };
  }
  try {
    validateDraft(draft);
  } catch (error) {
    return { ok: false, message: error.message.replace('Corrija o rascunho antes de publicar:', 'O arquivo tem problemas:') };
  }
  return { ok: true, draft };
}

/** Só os campos conhecidos da marca, cada um no formato que o editor aceita. Todo o resto é descartado. */
export function brandFromDraft(brand) {
  const next = {};
  for (const [field, max] of Object.entries(brandText)) {
    if (typeof brand?.[field] === 'string' && brand[field].length <= max) next[field] = brand[field];
  }
  if (/^#[0-9a-f]{6}$/i.test(brand?.accent)) next.accent = brand.accent;
  if (validLogo(brand?.logo)) next.logo = brand.logo;
  if (brand?.footerConfirmed === true) next.footerConfirmed = true;
  return next;
}

/**
 * Converte os imóveis do arquivo nos registros do editor (o mesmo formato de saveClientProperty).
 * Imóvel sem endereço válido ganha um novo; só fotos enviadas pelo cliente (webp) voltam, as do site já vêm do catálogo.
 */
export function editsFromDraft(properties) {
  const edits = {};
  for (const property of properties) {
    const id = validId.test(property?.id) ? property.id : 'p-' + crypto.randomUUID();
    edits[id] = {
      finalidade: property.finalidade,
      titulo: property.titulo,
      tipo: property.tipo ?? '',
      cidade: property.cidade ?? '',
      bairro: property.bairro ?? '',
      descricao: property.descricao ?? '',
      caracteristicas: Array.isArray(property.caracteristicas) ? property.caracteristicas.join(', ') : '',
      preco: property.preco,
      condominio: number(property.condominio) ?? null,
      iptu: number(property.iptu) ?? null,
      area: number(property.area) ?? 0,
      quartos: number(property.quartos) ?? 0,
      suites: number(property.suites) ?? 0,
      banheiros: number(property.banheiros) ?? 0,
      vagas: number(property.vagas) ?? 0,
      maxGuests: number(property.stay?.maxGuests) ?? 0,
      cleaning: number(property.stay?.cleaning) ?? 0,
      photos: (Array.isArray(property.fotos) ? property.fotos : []).filter(validPhoto),
      cover: ''
    };
  }
  return edits;
}

/** Frase para a confirmação antes de substituir a personalização atual. */
export function summarizeDraft(draft) {
  const count = draft.properties.length;
  return 'O arquivo traz a marca "' + draft.brand.name.trim() + '" e ' + (count === 1 ? '1 imóvel' : count + ' imóveis') + '.';
}

/**
 * Restauração compensável: mantém as duas chaves anteriores em memória.
 * persist só resolve após o commit da transação IndexedDB existente.
 * Não há transação atômica entre localStorage e IndexedDB, nem proteção contra crash/outra aba.
 */
export async function restoreDraftText(text, { confirm, persist }) {
  const parsed = parseDraftText(text);
  if (!parsed.ok) return parsed;
  if (typeof confirm !== 'function' || typeof persist !== 'function') {
    return { ok: false, message: 'A restauração não está disponível. Nenhum dado foi alterado.' };
  }
  const { brand, properties } = parsed.draft;
  const nextBrand = brandFromDraft(brand);
  const edits = editsFromDraft(properties);
  if (confirm(summarizeDraft(parsed.draft) + '\n\nAbrir este rascunho substitui a marca e os imóveis que você editou neste navegador. Continuar?') !== true) {
    return { ok: false, cancelled: true };
  }
  let storage;
  let previous;
  try {
    storage = globalThis.localStorage;
    previous = [clientPropertyStorageKey, clientBrandStorageKey].map(key => [key, storage.getItem(key)]);
  } catch {
    return { ok: false, message: 'Não foi possível preservar os dados anteriores. Nenhum dado foi alterado.' };
  }
  try {
    const result = replaceClientProperties(edits);
    if (!result.ok || !saveBrand(nextBrand)) throw new Error('storage');
    const setup = await persist();
    return { ok: true, saved: result.saved, rejected: result.rejected, setup };
  } catch {
    let recovered = true;
    // Tenta todas as chaves, mesmo quando uma recuperação falha. Preserva ausência e texto original.
    for (const [key, value] of previous.slice().reverse()) {
      try {
        if (storage.getItem(key) !== value) {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        }
        if (storage.getItem(key) !== value) recovered = false;
      } catch {
        recovered = false;
      }
    }
    return {
      ok: false,
      recovered,
      message: recovered
        ? 'Não foi possível restaurar o rascunho. Os dados anteriores da marca e dos imóveis foram recuperados.'
        : 'A restauração falhou e não foi possível recuperar todos os dados anteriores. Confira a marca e os imóveis antes de continuar e utilize sua cópia do rascunho salvo.'
    };
  }
}
