import {
  propertyNumberFields, propertyOptionalAmountFields, propertyTextFields, readClientProperties,
  resetClientProperty, saveClientProperty
} from './client-properties.mjs';
import { money } from './stay-visual.mjs';

const form = document.getElementById('propertyEditor');
const selection = document.getElementById('propertyChoice');
const feedback = document.getElementById('propertyFeedback');
const photosInput = document.getElementById('propertyCover');
const coverPreview = document.getElementById('propertyCoverPreview');
const save = document.getElementById('saveProperty');
const reset = document.getElementById('resetProperty');
const field = name => form.elements.namedItem(name);
const textFields = Object.keys(propertyTextFields);
// Em condomínio e IPTU, campo vazio significa "não informado" (null), e não zero.
const readNumber = name => {
  const raw = field(name).value.trim();
  return raw === '' && propertyOptionalAmountFields.includes(name) ? null : Number(raw);
};
let selectedPhotos;
let savedPhotos = [];
let uploadVersion = 0;

function listOptions(selected = 'novo') {
  selection.replaceChildren(
    new Option('Adicionar imóvel', 'novo'),
    ...readClientProperties().map(property => new Option(property.titulo, property.id))
  );
  selection.value = selected;
}

function renderCard() {
  const title = field('titulo').value.trim();
  const price = Number(field('preco').value);
  const purpose = field('finalidade').value;
  const photos = selectedPhotos ?? savedPhotos;
  const [photo] = photos;
  document.getElementById('propertyPhotoCount').textContent = photos.length
    ? photos.length + (photos.length === 1 ? ' foto no imóvel.' : ' fotos no imóvel.') : '';
  document.getElementById('samplePropertyTitle').textContent = title || 'Título do imóvel';
  document.getElementById('samplePropertyPlace').textContent =
    ['tipo', 'bairro', 'cidade'].map(name => field(name).value.trim()).filter(Boolean).join(' · ');
  const unit = { locacao: ' / mês', temporada: ' / diária' }[purpose] ?? '';
  document.getElementById('samplePropertyPrice').textContent = price > 0 ? money(price) + unit : '';
  document.getElementById('samplePropertyDescription').textContent = field('descricao').value.trim();
  coverPreview.hidden = !photo;
  if (photo) coverPreview.src = photo;
  else coverPreview.removeAttribute('src');
  const season = purpose === 'temporada';
  document.getElementById('seasonPropertyFields').hidden = !season;
  field('maxGuests').required = season;
  field('maxGuests').disabled = !season;
  field('cleaning').disabled = !season;
}

function loadSelection() {
  uploadVersion += 1;
  save.disabled = false;
  photosInput.value = '';
  photosInput.setCustomValidity('');
  feedback.textContent = '';
  const property = readClientProperties().find(item => item.id === selection.value);
  reset.hidden = !property;
  reset.textContent = property?.id.startsWith('p-') ? 'Remover anúncio' : 'Restaurar imóvel de exemplo';
  savedPhotos = property?.fotos ?? [];
  selectedPhotos = undefined;
  field('finalidade').value = property?.finalidade ?? '';
  for (const name of textFields) field(name).value = property?.[name] ?? '';
  field('caracteristicas').value = property?.caracteristicas.join(', ') ?? '';
  for (const name of propertyNumberFields) field(name).value = property?.[name] ?? '';
  field('maxGuests').value = property?.stay?.maxGuests ?? '';
  field('cleaning').value = property?.stay?.cleaning ?? '';
  renderCard();
}

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Escolha uma imagem PNG, JPG ou WebP de até 10 MB.');
  }
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', 0.78);
    if (!data.startsWith('data:image/webp;') || data.length >= 1200000) {
      throw new Error('Escolha uma versão menor da foto.');
    }
    return data;
  } finally {
    image.close();
  }
}

selection.addEventListener('change', loadSelection);
form.addEventListener('input', event => {
  if (event.target === photosInput || event.target === selection) return;
  feedback.textContent = '';
  renderCard();
});
photosInput.addEventListener('change', async () => {
  const version = ++uploadVersion;
  const files = [...photosInput.files];
  photosInput.setCustomValidity('');
  save.disabled = Boolean(files.length);
  if (!files.length) return;
  try {
    const photos = [];
    for (const file of files) {
      const photo = await preparePhoto(file);
      if (version !== uploadVersion) return;
      photos.push(photo);
    }
    selectedPhotos = photos;
    feedback.textContent = photos.length === 1 ? 'Foto pronta para aplicar.' : 'Fotos prontas para aplicar.';
    renderCard();
  } catch (error) {
    if (version !== uploadVersion) return;
    feedback.textContent = error.message || 'Não foi possível abrir a imagem.';
    photosInput.value = '';
  } finally {
    if (version === uploadVersion) save.disabled = false;
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const details = {
    finalidade: field('finalidade').value,
    ...(selectedPhotos ? { photos: selectedPhotos } : {}),
    ...Object.fromEntries(textFields.map(name => [name, field(name).value.trim()])),
    ...Object.fromEntries(propertyNumberFields.map(name => [name, readNumber(name)]))
  };
  if (['titulo', 'tipo', 'cidade', 'bairro'].some(name => !details[name])) {
    feedback.textContent = 'Preencha título, tipo, cidade e bairro.';
    return;
  }
  const id = selection.value === 'novo' ? 'p-' + crypto.randomUUID() : selection.value;
  if (!saveClientProperty(id, details)) {
    feedback.textContent = 'Não foi possível salvar o imóvel neste navegador. Tente usar menos fotos ou imagens menores.';
    return;
  }
  listOptions(id);
  loadSelection();
  feedback.textContent = 'Imóvel aplicado à vitrine neste navegador.';
});

reset.addEventListener('click', () => {
  const id = selection.value;
  const added = id.startsWith('p-');
  const prompt = added
    ? 'Remover este anúncio da prévia neste navegador?'
    : 'Descartar as alterações neste imóvel e restaurar os dados de exemplo?';
  if (!window.confirm(prompt)) return;
  if (!resetClientProperty(id)) {
    feedback.textContent = 'Não foi possível atualizar o anúncio neste navegador.';
    return;
  }
  listOptions(added ? 'novo' : id);
  loadSelection();
  selection.focus();
  feedback.textContent = added ? 'Anúncio removido da prévia.' : 'Imóvel de exemplo restaurado.';
});

listOptions();
loadSelection();
