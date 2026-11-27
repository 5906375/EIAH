import { properties as examples } from './properties.mjs';
import { iaClienteProperties } from './properties-ia-cliente.mjs';

export const clientPropertyStorageKey = 'eiah-imob-visual:client-properties:v1';
const validId = /^(?:[vlt]-\d{2}|p-[a-f0-9-]{36})$/;
const purposes = new Set(['venda', 'locacao', 'temporada']);
const isPhoto = value => typeof value === 'string' && value.length < 1200000 &&
  /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value);

export const propertyTextFields = {
  titulo: 100, tipo: 40, cidade: 60, bairro: 60, descricao: 800, caracteristicas: 300
};
export const propertyNumberFields = [
  'preco', 'condominio', 'iptu', 'area', 'quartos', 'suites', 'banheiros', 'vagas',
  'maxGuests', 'cleaning'
];
// Encargos podem ser desconhecidos: vazio é null ("não informado"), e 0 só vale quando informado.
export const propertyOptionalAmountFields = ['condominio', 'iptu'];

function readEdits() {
  try {
    const edits = JSON.parse(localStorage.getItem(clientPropertyStorageKey));
    return edits && typeof edits === 'object' ? edits : {};
  } catch {
    return {};
  }
}

function normalizeEdit(id, edit) {
  if (!validId.test(id) || !edit || !purposes.has(edit.finalidade)) return null;
  const text = Object.fromEntries(Object.entries(propertyTextFields).map(([key, length]) => [
    key, typeof edit[key] === 'string' ? edit[key].trim().slice(0, length) : ''
  ]));
  if (!text.titulo || !text.tipo || !text.cidade || !text.bairro) return null;
  const numbers = Object.fromEntries(propertyNumberFields.map(key => [
    key, Number.isFinite(edit[key]) && edit[key] >= 0 ? edit[key]
      : propertyOptionalAmountFields.includes(key) ? null : 0
  ]));
  if (!numbers.preco) return null;
  const photos = Array.isArray(edit.photos) ? edit.photos.filter(isPhoto) : [];
  const cover = !photos.length && isPhoto(edit.cover) ? edit.cover : '';
  return { ...text, ...numbers, finalidade: edit.finalidade, cover, photos };
}

export function readClientProperties({ onlyEdited = false } = {}) {
  const edits = readEdits();
  // Prévia 02, editor e rascunho partem das fotos próprias da Prévia 02; a Prévia 01 usa "examples" direto.
  const originals = new Map(iaClienteProperties.map(property => [property.id, property]));
  const properties = onlyEdited ? new Map() : new Map(originals);
  for (const [id, record] of Object.entries(edits)) {
    const edit = normalizeEdit(id, record);
    if (!edit) continue;
    const base = originals.get(id);
    const { finalidade, cover, photos, caracteristicas, maxGuests, cleaning, ...fields } = edit;
    const fotos = base?.fotos ?? [];
    properties.set(id, {
      ...base,
      ...fields,
      id,
      finalidade,
      origem: 'informed_by_manager',
      fotos: photos.length ? photos : cover ? [cover, ...fotos.slice(1)] : fotos,
      caracteristicas: caracteristicas.split(',').map(feature => feature.trim()).filter(Boolean),
      unidadePreco: finalidade === 'temporada' ? 'diária' : 'mês',
      stay: finalidade === 'temporada'
        ? { maxGuests: Math.max(1, maxGuests), cleaning, blocked: base?.stay?.blocked ?? [] }
        : undefined
    });
  }
  return [...properties.values()];
}

function writeEdits(edits) {
  try {
    localStorage.setItem(clientPropertyStorageKey, JSON.stringify(edits));
    return true;
  } catch {
    return false;
  }
}

export function saveClientProperty(id, detail) {
  const edits = readEdits();
  const edit = normalizeEdit(id, { ...edits[id], ...detail });
  if (!edit) return false;
  return writeEdits({ ...edits, [id]: edit });
}

export function resetClientProperty(id) {
  const edits = readEdits();
  delete edits[id];
  return writeEdits(edits);
}

/** Substitui todas as edições de uma vez (reabrir rascunho). Cada registro passa pela mesma validação do editor. */
export function replaceClientProperties(editsById) {
  const next = {};
  let rejected = 0;
  for (const [id, record] of Object.entries(editsById ?? {})) {
    const edit = normalizeEdit(id, record);
    if (edit) next[id] = edit;
    else rejected += 1;
  }
  const ok = writeEdits(next);
  return { ok, saved: ok ? Object.keys(next).length : 0, rejected };
}

export const storefrontProperties = typeof document !== 'undefined' && document.body.dataset.product === 'ia-cliente'
  ? readClientProperties()
  : examples;
