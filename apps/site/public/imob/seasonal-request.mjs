import { applyBrand, readSavedBrand } from './client-brand.mjs';
import { imobInterestHref } from './contact-eiah.mjs';
import { storefrontProperties } from './client-properties.mjs';
import { formatProposal } from './requests-local.mjs';
import { createSeasonalCase, readSeasonalCase, seasonalStatus, seasonalSummary } from './seasonal-cases.mjs';
import { readSetup } from './site-setup-store.mjs';
import { money, stayDate } from './stay-visual.mjs';

const get = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const message = get('seasonal-message');
const form = get('seasonal-form');
const published = params.get('origem') === 'publicada';
const submit = form.querySelector('[type=submit]');
let caseId = params.get('pedido');
let property;

async function showTracking() {
  const record = await readSeasonalCase(caseId);
  if (!record) {
    message.textContent = 'Este pedido não foi encontrado neste navegador.';
    return;
  }
  get('seasonal-request').hidden = true;
  get('seasonal-tracking').hidden = false;
  get('tracking-property').textContent = record.propertyTitle;
  get('tracking-status').textContent = seasonalStatus[record.status];
  formatProposal(get('tracking-summary'), [...seasonalSummary(record), ['Estimativa da demo', money(record.total)]]);
  const url = new URL(location.pathname, location.origin);
  if (published) url.searchParams.set('origem', 'publicada');
  url.searchParams.set('pedido', caseId);
  get('tracking-link').href = url;
  history.replaceState(null, '', url);
  message.textContent = '';
}

async function initialize() {
  get('contact-eiah').href = imobInterestHref('temporada');
  const snapshot = published ? (await readSetup()).published : null;
  get('back-to-store').href = published ? '../criar-site/vitrine/' : '../';
  applyBrand(document.body, published ? snapshot?.brand ?? {} : readSavedBrand(), { preview: true });
  if (caseId) {
    await showTracking();
    return;
  }
  const properties = published ? snapshot?.properties ?? [] : storefrontProperties;
  property = properties.find(item => item.id === params.get('imovel') && item.finalidade === 'temporada' && item.stay);
  if (!property) {
    message.textContent = 'Volte à vitrine e escolha um imóvel de temporada.';
    return;
  }
  get('seasonal-property').textContent = property.titulo;
  form.elements.arrival.min = stayDate();
  form.elements.departure.min = stayDate(1);
  form.elements.guests.max = Math.min(property.stay.maxGuests, 12);
  form.elements.guests.value = Math.min(2, Number(form.elements.guests.max));
  for (const key of ['arrival', 'departure', 'guests']) {
    if (params.has(key)) form.elements[key].value = params.get(key);
  }
  get('seasonal-request').hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = true;
  const id = crypto.randomUUID();
  try {
    await createSeasonalCase(id, property, Object.fromEntries(new FormData(form)));
    caseId = id;
    get('seasonal-request').hidden = true;
    await showTracking();
  } catch (error) {
    message.textContent = error?.message || 'O navegador não conseguiu salvar este pedido.';
  } finally {
    submit.disabled = false;
  }
});

const reportError = () => { message.textContent = 'O navegador não conseguiu abrir o pedido de temporada.'; };
addEventListener('pageshow', event => {
  if (event.persisted && caseId) void showTracking().catch(reportError);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && caseId) void showTracking().catch(reportError);
});
void initialize().catch(reportError);
