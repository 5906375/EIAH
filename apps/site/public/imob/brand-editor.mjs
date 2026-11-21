import { accessibleAccent, applyBrand, readSavedBrand, saveBrand } from './client-brand.mjs';
import { contactNumber, footerFields } from './client-footer.mjs';

const form = document.getElementById('brandEditor');
const pane = document.getElementById('designPreview');
const feedback = document.getElementById('brandFeedback');
const fileInput = document.getElementById('brandLogo');
const chooseLogo = document.getElementById('chooseLogo');
const createLogo = document.getElementById('createLogo');
const logoUpload = document.getElementById('logoUpload');
const logoCreation = document.getElementById('logoCreation');
const logoDirection = document.getElementById('logoDirection');
const logoPrompt = document.getElementById('logoPrompt');
const promptFeedback = document.getElementById('logoPromptFeedback');
const remove = document.getElementById('removeLogo');
const save = document.getElementById('saveBrand');
const loadSaved = document.getElementById('loadSavedBrand');
const colorInput = document.getElementById('brandColor');
const colorPicker = document.getElementById('brandColorPicker');
const colorValue = document.getElementById('brandColorValue');
const sectionButtons = [...document.querySelectorAll('[data-editor-section]')];

function showSection(id) {
  const contacts = id === 'editorContact';
  save.textContent = contacts ? 'Salvar dados do rodapé' : 'Aplicar à prévia 02';
  save.formNoValidate = contacts;
  for (const button of sectionButtons) {
    const selected = button.dataset.editorSection === id;
    button.setAttribute('aria-pressed', String(selected));
    document.getElementById(button.dataset.editorSection).hidden = !selected;
  }
  const propertySection = id === 'propertyEditor';
  form.hidden = propertySection;
  pane.hidden = propertySection;
  document.getElementById('propertyDesignPreview').hidden = !propertySection;
}

for (const button of sectionButtons) {
  button.addEventListener('click', () => showSection(button.dataset.editorSection));
}

let showingValidation = false;
form.addEventListener('invalid', event => {
  if (showingValidation) return;
  const section = event.target.closest('.editor-section');
  if (!section || !section.hidden) return;
  showingValidation = true;
  showSection(section.id);
  queueMicrotask(() => { showingValidation = false; });
}, true);

let logo = '';
let selection = 0;

const contactFields = ['contact', ...footerFields];
const profileFields = ['name', 'introduction', 'accent', ...contactFields];
const savedAtOpen = readSavedBrand();
for (const field of contactFields) {
  form.elements.namedItem(field).value = savedAtOpen[field] ?? '';
}
loadSaved.hidden = Object.keys(savedAtOpen).length === 0;

loadSaved.addEventListener('click', () => {
  const saved = readSavedBrand();
  selection += 1;
  save.disabled = false;
  fileInput.value = '';
  logo = saved.logo ?? '';
  for (const field of profileFields) {
    const input = form.elements.namedItem(field);
    input.value = saved[field] ?? '';
    input.setCustomValidity('');
  }
  logoPrompt.value = '';
  document.getElementById('logoPromptResult').hidden = true;
  promptFeedback.textContent = '';
  refresh();
  feedback.textContent = 'Dados salvos carregados para edição.';
});

function profile() {
  return {
    ...Object.fromEntries(profileFields.map(field => [field, form.elements.namedItem(field).value.trim()])),
    logo
  };
}

function refresh() {
  const current = profile();
  applyBrand(pane, current, { preview: true });
  const adjusted = accessibleAccent(current.accent);
  const chosenColor = colorInput.validity.valid && current.accent;
  colorPicker.value = chosenColor || adjusted;
  colorValue.hidden = !chosenColor || adjusted === current.accent.toLowerCase();
  colorValue.value = colorValue.hidden ? '' : 'Cor aplicada: ' + adjusted.toUpperCase();
  remove.hidden = !logo;
}

for (const field of profileFields) {
  form.elements.namedItem(field).addEventListener('input', event => {
    event.currentTarget.setCustomValidity('');
    feedback.textContent = '';
    refresh();
  });
}

colorPicker.addEventListener('input', () => {
  colorInput.value = colorPicker.value;
  feedback.textContent = '';
  refresh();
});

function setLogoMode(create) {
  chooseLogo.setAttribute('aria-pressed', String(!create));
  createLogo.setAttribute('aria-pressed', String(create));
  logoUpload.hidden = create;
  logoCreation.hidden = !create;
}

chooseLogo.addEventListener('click', () => setLogoMode(false));
createLogo.addEventListener('click', () => setLogoMode(true));

document.getElementById('generateLogoPrompt').addEventListener('click', () => {
  const { name, introduction, accent } = profile();
  if (!name) {
    promptFeedback.textContent = 'Informe o nome da imobiliária para gerar o prompt.';
    form.elements.namedItem('name').focus();
    return;
  }
  const direction = logoDirection.value.trim();
  logoPrompt.value = [
    `Crie um logotipo original para a imobiliária “${name}”.`,
    introduction && `Apresentação da marca: ${introduction}`,
    colorInput.validity.valid && accent && `Use ${accent.toUpperCase()} como cor principal e complemente com tons neutros de bom contraste.`,
    direction ? `Preferências visuais: ${direction}` : 'Use um estilo limpo, com um símbolo simples e marcante.',
    'Entregue em formato quadrado, com fundo transparente, margens livres e um símbolo que permaneça legível em tamanho pequeno.',
    `Se usar texto, escreva exatamente “${name}”. Entregue apenas o logo, sem mockup ou marca-d’água, em PNG.`
  ].filter(Boolean).join('\n\n');
  document.getElementById('logoPromptResult').hidden = false;
  promptFeedback.textContent = 'Prompt gerado. Você pode editar o texto antes de copiar.';
  logoPrompt.focus();
});

document.getElementById('copyLogoPrompt').addEventListener('click', async () => {
  if (!logoPrompt.value.trim()) {
    promptFeedback.textContent = 'Escreva ou gere um prompt para copiar.';
    logoPrompt.focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(logoPrompt.value);
    promptFeedback.textContent = 'Prompt copiado.';
  } catch {
    logoPrompt.focus();
    logoPrompt.select();
    promptFeedback.textContent = 'Texto selecionado. Use o comando de copiar do seu navegador.';
  }
});

function reduceLogo(image) {
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', .85);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener('change', async () => {
  const current = ++selection;
  const file = fileInput.files[0];
  save.disabled = false;
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    feedback.textContent = 'Escolha uma imagem PNG, JPG ou WebP de até 10 MB.';
    fileInput.value = '';
    return;
  }
  save.disabled = true;
  try {
    const data = await readFile(file);
    const image = new Image();
    image.src = data;
    await image.decode();
    if (current !== selection) return;
    const optimized = file.size > 500 * 1024 ? reduceLogo(image) : data;
    if (!optimized.startsWith('data:image/') || optimized.length >= 730000) {
      feedback.textContent = 'Não foi possível reduzir esta imagem. Escolha uma versão menor.';
      fileInput.value = '';
      return;
    }
    logo = optimized;
    feedback.textContent = '';
    refresh();
  } catch {
    if (current !== selection) return;
    feedback.textContent = 'Não foi possível abrir a imagem selecionada.';
    fileInput.value = '';
  } finally {
    if (current === selection) save.disabled = false;
  }
});

remove.addEventListener('click', () => {
  selection += 1;
  save.disabled = false;
  logo = '';
  fileInput.value = '';
  feedback.textContent = '';
  refresh();
  if (logoUpload.hidden) createLogo.focus();
  else fileInput.focus();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const contactsOnly = save.formNoValidate;
  const current = profile();
  if (!contactsOnly && (!current.name || !current.introduction)) {
    feedback.textContent = 'Preencha o nome e o texto de apresentação.';
    const input = form.elements.namedItem(current.name ? 'introduction' : 'name');
    showSection(input.closest('.editor-section').id);
    input.focus();
    return;
  }
  const email = form.elements.namedItem('footerEmail');
  if (!email.checkValidity()) {
    showSection('editorContact');
    email.reportValidity();
    return;
  }
  for (const field of ['footerPhone', 'footerWhatsapp']) {
    if (current[field] && !contactNumber(current[field])) {
      const input = form.elements.namedItem(field);
      const label = field === 'footerPhone' ? 'Telefone' : 'WhatsApp';
      const message = label + ': digite o número com DDD ou inclua o código do país com +.';
      feedback.textContent = message;
      input.setCustomValidity(message);
      showSection('editorContact');
      input.reportValidity();
      return;
    }
  }
  const next = contactsOnly
    ? { ...readSavedBrand(), ...Object.fromEntries(contactFields.map(field => [field, current[field]])) }
    : current;
  if (!saveBrand({ ...next, footerConfirmed: true })) {
    feedback.textContent = 'O navegador não conseguiu salvar a personalização. Mantenha a página aberta e tente novamente.';
    return;
  }
  loadSaved.hidden = false;
  feedback.textContent = contactsOnly
    ? 'Rodapé salvo neste navegador. Para atualizar a vitrine publicada na demo, importe a personalização e publique novamente.'
    : 'Personalização aplicada à prévia 02 neste navegador.';
});

if (location.hash === '#editorContact') showSection('editorContact');
refresh();
