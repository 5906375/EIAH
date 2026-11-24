import { readSavedBrand } from './client-brand.mjs';
import { readClientProperties } from './client-properties.mjs';
import { readSetup, updateSetup } from './site-setup-store.mjs';
import { bindCarouselNavigation } from './carousel-navigation.mjs';
import { imobSpecialists } from './imob-specialists.mjs';
import {
  pilotApplicationHref, pilotApplyAction, pilotConsentLabel, pilotPrivacyNotice, pilotSlots, pilotWaitlistAction, pilotWaitlistDraftNote, pilotWaitlistFileNote, pilotWaitlistLead,
  exampleCards, slugProblem, suggestSlug
} from './pilot-site.mjs';

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
let slots = pilotSlots(null);
const applyLead = document.getElementById('pilot-lead').textContent;
const applyPublishNote = document.getElementById('publish-note').textContent;

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
  get('publish-site').hidden = state.published?.revision === state.draft?.revision;
  renderApplication();
  get('published-link').hidden = !state.published;
  get('plan-status').textContent = state.published
    ? state.published.revision === state.draft.revision
      ? 'Prévia da versão ' + state.published.revision + ' disponível neste navegador.'
      : 'Atualize a prévia local para conferir seu rascunho mais recente.'
    : 'Abra a prévia neste navegador para revisar a vitrine antes de enviar o rascunho.';
}

// O cadastro só aparece com perfil salvo, endereço válido e autorização marcada; o hint diz o que falta.
function applicationHint(profile, consent) {
  if (!profile) return '';
  const problem = profile.slug ? slugProblem(profile.slug) : 'Informe o endereço desejado e salve o perfil para enviar o cadastro.';
  if (problem) return problem;
  if (consent) return '';
  return slots.full ? 'Marque a autorização acima para entrar na lista de espera.' : 'Marque a autorização acima para liberar o envio do cadastro.';
}

function renderApplication() {
  const application = get('pilot-application');
  const consent = get('pilot-consent').checked;
  // Com as vagas fechadas, o mesmo botão passa a levar à lista de espera.
  const waitlist = slots.full;
  const href = state?.profile ? pilotApplicationHref(state.profile, consent, { waitlist }) : '';
  application.textContent = waitlist ? pilotWaitlistAction : pilotApplyAction;
  get('pilot-lead').textContent = waitlist ? pilotWaitlistLead : applyLead;
  // Na lista de espera o e-mail não leva o site: avisa onde baixar o rascunho e que ele será enviado depois.
  const draftNote = get('pilot-waitlist-note');
  draftNote.hidden = !waitlist;
  draftNote.textContent = waitlist ? pilotWaitlistDraftNote : '';
  get('publish-note').textContent = waitlist ? pilotWaitlistFileNote : applyPublishNote;
  application.hidden = !href;
  if (href) application.setAttribute('href', href);
  else application.removeAttribute('href');
  get('pilot-hint').textContent = applicationHint(state?.profile, consent);
  const slotsLine = get('pilot-slots');
  // Com as vagas fechadas, o convite no topo já diz isso; a linha do contador só aparece enquanto há vagas.
  slotsLine.hidden = !slots.known || slots.full;
  slotsLine.textContent = slots.text;
}

function exampleCard(card) {
  const article = document.createElement('article');
  article.className = 'example-card';
  if (card.photo) {
    const image = document.createElement('img');
    image.src = new URL('./assets/' + card.photo, import.meta.url).href;
    image.alt = '';
    image.loading = 'lazy';
    article.append(image);
  }
  const body = document.createElement('div');
  const link = textElement('a', 'Ver vitrine');
  link.className = 'btn btn-ghost';
  link.href = new URL('./' + card.slug + '/', import.meta.url).href;
  link.setAttribute('aria-label', 'Ver vitrine de exemplo: ' + card.name);
  body.append(textElement('h3', card.name), textElement('p', card.city), textElement('p', card.summary), link);
  article.append(body);
  return article;
}

function renderExamples(cards) {
  get('exemplos').hidden = cards.length === 0;
  get('examples-nav').hidden = cards.length === 0;
  get('example-sites').replaceChildren(...cards.map(exampleCard));
}

async function loadExamples() {
  try {
    const response = await fetch(new URL('./piloto-exemplos.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error('indisponível');
    renderExamples(exampleCards(await response.json()));
  } catch {
    renderExamples([]);
  }
}

async function loadSlots() {
  try {
    const response = await fetch(new URL('./piloto-vagas.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error('indisponível');
    slots = pilotSlots(await response.json());
  } catch {
    slots = pilotSlots(null);
  }
  renderApplication();
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
    showMessage(error.message || 'O navegador não conseguiu salvar os dados neste navegador.', true);
  } finally {
    busy = false;
    document.querySelector('.setup-panels').removeAttribute('aria-busy');
  }
}

async function start() {
  try {
    state = await readSetup();
    for (const [field, value] of Object.entries(state.profile ?? {})) {
      const input = profileForm.elements.namedItem(field);
      if (input) input.value = value;
    }
    if (state.profile?.slug) profileForm.elements.slug.dataset.touched = '1';
    render();
  } catch {
    for (const field of profileForm.elements) field.disabled = true;
    showMessage('Abra a prévia em um navegador que permita salvar dados locais.', true);
  }
}

get('pilot-privacy').textContent = pilotPrivacyNotice;
get('pilot-consent-label').textContent = pilotConsentLabel;
get('pilot-consent').addEventListener('change', renderApplication);

// Sugere o endereço a partir do nome da imobiliária, enquanto a pessoa não escolher o dela.
profileForm.elements.slug.addEventListener('input', () => { profileForm.elements.slug.dataset.touched = '1'; });
profileForm.elements.business.addEventListener('input', () => {
  const slug = profileForm.elements.slug;
  if (slug.dataset.touched !== '1') slug.value = suggestSlug(profileForm.elements.business.value);
});

get('profile-example').addEventListener('click', () => {
  profileForm.elements.name.value = 'Pessoa Exemplo';
  profileForm.elements.business.value = 'Imobiliária Exemplo';
  profileForm.elements.email.value = 'pessoa@example.com';
  profileForm.elements.slug.value = 'imobiliaria-exemplo';
});

profileForm.addEventListener('submit', event => {
  event.preventDefault();
  const profile = Object.fromEntries([...new FormData(profileForm)].map(([key, value]) => [key, value.trim()]));
  if (!profile.name || !profile.business) {
    showMessage('Informe seu nome e o nome da imobiliária ou do negócio.', true);
    return;
  }
  profile.slug = (profile.slug ?? '').toLowerCase();
  if (profile.slug && slugProblem(profile.slug)) {
    showMessage(slugProblem(profile.slug), true);
    profileForm.elements.slug.focus();
    return;
  }
  void save(current => ({ ...current, profile }), 'Perfil salvo. Você já pode enviar o cadastro e importar a personalização.', 'import-draft');
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
  'publish-site');
});

get('download-draft').addEventListener('click', () => {
  if (!state?.draft) return;
  const { brand, properties } = state.draft;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ brand, properties })], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vitrine-imob.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

get('publish-site').addEventListener('click', () => {
  void save(current => {
    requireCondition(current.draft, 'Importe a personalização antes de abrir a prévia.');
    return { ...current, published: current.draft };
  }, 'Prévia atualizada neste navegador.', 'published-link');
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
void loadSlots();
void loadExamples();
