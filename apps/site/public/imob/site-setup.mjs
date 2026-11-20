import { readSavedBrand } from './client-brand.mjs';
import { readClientProperties } from './client-properties.mjs';
import { readSetup, updateSetup } from './site-setup-store.mjs';

const experts = new Map([
  ['j360', {
    name: 'J_360',
    purpose: 'Apoio à revisão documental de contratos de locação.',
    scope: 'Documentos autorizados no caso IMOB selecionado.'
  }],
  ['fin-nexus', {
    name: 'FinNexus',
    purpose: 'Apoio à análise financeira de uma proposta imobiliária.',
    scope: 'Dados financeiros autorizados da proposta selecionada.'
  }]
]);
const get = id => document.getElementById(id);
const profileForm = get('profile-form');
const feedback = get('setup-feedback');
const steps = [...document.querySelectorAll('.setup-steps a')];
let state = { experts: {} };
let selectedExpert = null;
let busy = false;

function showMessage(message, isError = false) {
  feedback.textContent = message;
  feedback.toggleAttribute('data-error', isError);
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function textElement(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function action(label, onClick, primary = false) {
  const button = textElement('button', label);
  button.type = 'button';
  button.className = 'btn ' + (primary ? 'btn-primary' : 'btn-ghost');
  button.addEventListener('click', onClick);
  return button;
}

function renderExperts() {
  const options = get('expert-options');
  const review = get('expert-review');
  const cards = [];
  for (const [id, expert] of experts) {
    const card = document.createElement('article');
    card.className = 'setup-option';
    card.append(textElement('h3', expert.name), textElement('p', expert.purpose));
    if (state.experts[id] === 'active') {
      card.append(textElement('p', 'Ativo na demonstração'));
    } else if (state.experts[id] === 'contracted') {
      card.append(textElement('p', 'Contratação simulada registrada'));
      card.append(action('Ativar ' + expert.name, () => activateExpert(id)));
    } else {
      card.append(action('Revisar ' + expert.name, () => {
        selectedExpert = id;
        renderExpertReview();
        review.querySelector('h3')?.focus();
      }));
    }
    cards.push(card);
  }
  options.replaceChildren(...cards);
  renderExpertReview();
}

function renderExpertReview() {
  const review = get('expert-review');
  const expert = experts.get(selectedExpert);
  review.hidden = !expert || Boolean(state.experts[selectedExpert]);
  if (review.hidden) {
    review.replaceChildren();
    return;
  }
  const id = selectedExpert;
  const title = textElement('h3', 'Contratação de ' + expert.name);
  title.tabIndex = -1;
  review.replaceChildren(
    title,
    textElement('p', 'Acesso previsto: ' + expert.scope),
    textElement('p', 'O valor e a unidade de cobrança serão apresentados na contratação real. Esta simulação não gera cobrança.'),
    action('Confirmar contratação simulada', () => contractExpert(id), true)
  );
}

function render() {
  get('draft-controls').hidden = !state.profile;
  const editedCount = state.draft?.properties.length ?? 0;
  get('draft-status').textContent = state.draft
    ? state.draft.brand.name + ' · ' + (editedCount === 1 ? '1 imóvel editado' : editedCount + ' imóveis editados')
    : 'Recupere as edições feitas na Prévia 02 neste navegador.';
  get('plan-locked').hidden = Boolean(state.draft);
  get('plan-controls').hidden = !state.draft;
  get('simulate-payment').hidden = Boolean(state.plan);
  get('publish-site').hidden = !state.plan || state.published?.revision === state.draft?.revision;
  get('published-link').hidden = !state.published;
  get('plan-status').textContent = state.published
    ? state.published.revision === state.draft.revision
      ? 'Versão ' + state.published.revision + ' publicada na demonstração.'
      : 'Há uma edição em rascunho. A vitrine demonstra a última versão publicada.'
    : state.plan
      ? 'Pagamento simulado confirmado. Revise o rascunho e publique quando estiver pronto.'
      : 'A simulação dispensa dados de pagamento.';
  get('experts-locked').hidden = Boolean(state.published);
  get('experts-controls').hidden = !state.published;
  if (state.published) renderExperts();
}

async function save(change, success, focusId) {
  if (busy) return;
  busy = true;
  document.querySelector('.setup-panels').setAttribute('aria-busy', 'true');
  try {
    state = await updateSetup(change);
    render();
    showMessage(success);
    if (focusId) get(focusId).focus();
  } catch (error) {
    showMessage(error.message || 'O navegador não conseguiu salvar a demonstração.', true);
  } finally {
    busy = false;
    document.querySelector('.setup-panels').removeAttribute('aria-busy');
  }
}

async function start() {
  try {
    state = await readSetup();
    for (const [field, value] of Object.entries(state.profile ?? {})) {
      profileForm.elements.namedItem(field).value = value;
    }
    render();
  } catch {
    for (const field of profileForm.elements) field.disabled = true;
    showMessage('Abra a prévia em um navegador que permita salvar dados locais.', true);
  }
}

get('profile-example').addEventListener('click', () => {
  profileForm.elements.name.value = 'Pessoa Exemplo';
  profileForm.elements.business.value = 'Imobiliária Exemplo';
  profileForm.elements.email.value = 'pessoa@example.com';
});

profileForm.addEventListener('submit', event => {
  event.preventDefault();
  const profile = Object.fromEntries([...new FormData(profileForm)].map(([key, value]) => [key, value.trim()]));
  if (!profile.name || !profile.business) {
    showMessage('Informe seu nome e o nome da imobiliária ou do negócio.', true);
    return;
  }
  void save(current => ({ ...current, profile }), 'Perfil de demonstração salvo.', 'import-draft');
});

get('import-draft').addEventListener('click', () => {
  const edited = readSavedBrand();
  const properties = readClientProperties({ onlyEdited: true });
  void save(current => {
    requireCondition(current.profile, 'Salve o perfil antes de criar o rascunho.');
    const brand = {
      ...edited,
      name: edited.name || current.profile.business,
      introduction: edited.introduction || 'Conheça nossos imóveis e fale com nossa equipe.'
    };
    const revision = (current.draft?.revision ?? 0) + 1;
    return { ...current, draft: { brand, properties, revision } };
  }, 'Rascunho atualizado com a personalização disponível neste navegador.',
  state.plan ? 'publish-site' : 'simulate-payment');
});

get('simulate-payment').addEventListener('click', () => {
  void save(current => {
    requireCondition(current.draft, 'Importe a personalização antes de continuar.');
    return current.plan ? current : { ...current, plan: 'site-imob-personalizado' };
  }, 'Pagamento simulado. O botão Publicar na demonstração está disponível.', 'publish-site');
});

get('publish-site').addEventListener('click', () => {
  void save(current => {
    requireCondition(current.draft && current.plan, 'Confirme o pagamento simulado antes de publicar.');
    return { ...current, published: current.draft };
  }, 'Vitrine publicada na demonstração. A área de especialistas está disponível.', 'published-link');
});

function contractExpert(id) {
  void save(current => {
    requireCondition(current.published && experts.has(id), 'Publique a vitrine para contratar um especialista.');
    if (current.experts[id]) return current;
    return { ...current, experts: { ...current.experts, [id]: 'contracted' } };
  }, 'Contratação simulada. Ative o especialista quando estiver pronto.');
}

function activateExpert(id) {
  void save(current => {
    requireCondition(current.published && current.experts[id] === 'contracted',
      'A contratação simulada precisa estar confirmada.');
    return { ...current, experts: { ...current.experts, [id]: 'active' } };
  }, experts.get(id).name + ' está ativo na demonstração.');
}

function highlightStep() {
  for (const link of steps) {
    if (link.hash === (location.hash || '#perfil')) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
}

highlightStep();
addEventListener('hashchange', highlightStep);
addEventListener('pageshow', event => { if (event.persisted) void start(); });
void start();
