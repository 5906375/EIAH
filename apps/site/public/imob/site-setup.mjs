import { readSavedBrand } from './client-brand.mjs';
import { readClientProperties } from './client-properties.mjs';
import { readSetup, updateSetup } from './site-setup-store.mjs';
import { bindCarouselNavigation } from './carousel-navigation.mjs';
import { imobSpecialists } from './imob-specialists.mjs';

const journeyAgents = [
  { name: 'Recepção', position: '0%', purpose: 'Entende o objetivo do visitante e encaminha o pedido.' },
  { name: 'Imóvel', position: '50%', purpose: 'Organiza os dados do imóvel ou da busca.' },
  { name: 'Revisão', position: '100%', purpose: 'Reúne os dados para conferência antes do envio.' }
];
const get = id => document.getElementById(id);
const profileForm = get('profile-form');
const feedback = get('setup-feedback');
const steps = [...document.querySelectorAll('.setup-steps a')];
const agentTrack = get('expert-options');
const updateAgentNavigation = bindCarouselNavigation(
  agentTrack, get('agent-navigation'), get('agent-previous'), get('agent-next')
);
let state;
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

function agentCard(agent) {
  const card = document.createElement('article');
  card.className = 'setup-option setup-expert';
  const heading = document.createElement('header');
  const label = textElement('p', agent.image ? 'Contratável' : 'Na jornada');
  label.className = 'setup-agent-label';
  if (agent.image) {
    const portrait = document.createElement('img');
    portrait.src = new URL('./assets/' + agent.image, import.meta.url).href;
    portrait.alt = '';
    portrait.width = portrait.height = 42;
    portrait.loading = 'lazy';
    heading.append(portrait);
  } else {
    const portrait = document.createElement('span');
    portrait.className = 'setup-agent-portrait';
    portrait.style.setProperty('--agent-position', agent.position);
    portrait.setAttribute('aria-hidden', 'true');
    heading.append(portrait);
    label.toggleAttribute('data-included', true);
  }
  heading.append(textElement('h3', agent.name));
  card.append(heading, label, textElement('p', agent.purpose));
  return card;
}

function renderAgents() {
  const cards = journeyAgents.map(agentCard);
  for (const [id, expert] of imobSpecialists) {
    const card = agentCard(expert);
    const details = document.createElement('details');
    details.append(textElement('summary', 'Exemplo de uso'), textElement('p', expert.example));
    const request = textElement('a', 'Solicitar Demo');
    request.className = 'btn btn-ghost';
    request.href = '../?especialista=' + encodeURIComponent(id) + '#jornada';
    request.setAttribute('aria-label', 'Solicitar Demo de ' + expert.name);
    card.append(details, request);
    cards.push(card);
  }
  const expansion = document.createElement('article');
  expansion.className = 'setup-option setup-expert setup-agent-expansion';
  expansion.append(
    textElement('h3', 'Mais agentes'),
    textElement('p', 'Espaço para novos agentes conforme a demanda e o porte da imobiliária.')
  );
  agentTrack.replaceChildren(...cards, expansion);
  updateAgentNavigation();
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
  }, 'Vitrine publicada na demonstração.', 'published-link');
});

function highlightStep() {
  for (const link of steps) {
    if (link.hash === (location.hash || '#perfil')) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
}

highlightStep();
renderAgents();
addEventListener('hashchange', highlightStep);
addEventListener('pageshow', event => { if (event.persisted) void start(); });
void start();
