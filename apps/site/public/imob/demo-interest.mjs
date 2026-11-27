import { findProperty, renderPropertyContext } from './property-context.mjs';
import { imobSpecialists } from './imob-specialists.mjs';

const section = document.getElementById('jornada');
const product = document.body.dataset.product === 'ia-cliente' ? 'Site com IA do Cliente' : 'Operação EIAH';
const subject = 'Interesse em demonstração com IA · EIAH IMOB';
const whatsapp = 'https://wa.me/5547999674434';
const email = 'mailto:contato@eiah.ia.br';
const introduction = 'Esta prévia usa imóveis fictícios e funciona sem IA. Conte o que você gostaria de testar e solicite uma demonstração com a IA da EIAH, com a sua própria IA ou com as duas.';

section.innerHTML = `
  <div class="wrap">
    <a class="btn btn-ghost" href="#vitrine" id="interest-back">Voltar à vitrine</a>
    <h2 id="interest-title" data-demo-guide-topic="conversa" tabindex="-1">Quer conhecer o IMOB com IA?</h2>
    <p class="interest-intro" id="interest-intro">${introduction}</p>
    <aside id="interest-property" aria-label="Imóvel de exemplo" hidden></aside>
    <div class="interest-layout">
      <form class="interest-fields" id="interest-form" aria-label="Interesse em demonstração">
        <label>Seu nome <input name="nome" maxlength="90" autocomplete="name"></label>
        <label>Imobiliária ou equipe <input name="empresa" maxlength="120" autocomplete="organization"></label>
        <label>E-mail ou WhatsApp para retorno <input name="contato" maxlength="150"></label>
        <label>Qual opção você quer conhecer?
          <select name="ia">
            <option value="">Selecione se quiser</option>
            <option>IA da EIAH</option>
            <option>Minha própria IA</option>
            <option>Comparar as duas opções</option>
            <option>Quero conversar antes</option>
          </select>
        </label>
        <label>O que você gostaria de testar?
          <textarea name="cenario" rows="3" maxlength="600" placeholder="Ex.: atender interessados em imóveis de temporada"></textarea>
        </label>
      </form>
      <aside class="interest-summary" aria-labelledby="interest-summary-title">
        <p class="eyebrow">Resumo do interesse</p>
        <h3 id="interest-summary-title" data-demo-guide-topic="revisar">0 de 5 itens preenchidos</h3>
        <progress max="5" value="0" aria-labelledby="interest-summary-title"></progress>
        <p id="interest-missing"></p>
        <div class="interest-actions">
          <a class="btn btn-primary" id="interest-whatsapp" href="${whatsapp}" target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
          <a class="btn btn-ghost" id="interest-email" href="${email}">Enviar por e-mail</a>
          <button type="button" class="btn btn-ghost" id="interest-copy">Copiar mensagem</button>
        </div>
        <details id="interest-details">
          <summary>Ver a mensagem</summary>
          <pre id="interest-message" tabindex="0"></pre>
        </details>
        <p class="field-help">Você revisa e envia pelo canal que escolher. Seus dados não ficam salvos na prévia.</p>
        <p id="interest-feedback" class="field-help" role="status"></p>
      </aside>
    </div>
  </div>`;

const get = id => document.getElementById(id);
const form = get('interest-form');
const fields = [
  ['nome', 'Nome'],
  ['empresa', 'Imobiliária ou equipe'],
  ['contato', 'Contato para retorno'],
  ['ia', 'Opção de IA'],
  ['cenario', 'Cenário de interesse']
];
let property;
let listing = false;
let trigger;
let specialist;

function renderSummary() {
  const values = new FormData(form);
  const filled = [];
  const missing = [];
  for (const [name, label] of fields) {
    const value = values.get(name).trim();
    if (value) filled.push(label + ': ' + value);
    else missing.push(label);
  }
  const message = [
    specialist
      ? 'Olá! Quero solicitar uma demonstração de ' + specialist.name + ' no EIAH IMOB.'
      : 'Olá! Quero conhecer o IMOB em uma demonstração com IA.',
    'Prévia de origem: ' + product,
    ...(listing ? ['Contexto: Quero conhecer o fluxo para anunciar um imóvel.'] : []),
    ...(property ? ['Imóvel de exemplo: ' + property.titulo + ' (' + property.id.toUpperCase() + ')'] : []),
    ...filled
  ].join('\n');

  get('interest-summary-title').textContent = filled.length + ' de ' + fields.length + ' itens preenchidos';
  section.querySelector('progress').value = filled.length;
  get('interest-missing').textContent = missing.length
    ? 'Faltam: ' + missing.join(', ') + '. Você pode enviar mesmo assim.'
    : 'Revise a mensagem e escolha como enviar.';
  get('interest-message').textContent = message;
  get('interest-whatsapp').href = whatsapp + '?text=' + encodeURIComponent(message);
  get('interest-email').href = email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
  get('interest-feedback').textContent = '';
}

function openInterest(detail = {}) {
  property = findProperty(detail.propertyId);
  specialist = property ? undefined : imobSpecialists.get(detail.specialistId);
  listing = !property && !specialist && Boolean(detail.listing);
  trigger = detail.trigger;
  const url = new URL(location.href);
  url.searchParams.delete('imovel');
  url.searchParams.delete('objetivo');
  url.searchParams.delete('especialista');
  if (property) url.searchParams.set('imovel', property.id);
  else if (specialist) url.searchParams.set('especialista', detail.specialistId);
  else url.searchParams.set('objetivo', listing ? 'cadastrar' : 'novo');
  url.hash = 'jornada';
  if (url.href !== location.href) history.replaceState(null, '', url);
  renderPropertyContext(get('interest-property'), property, detail.stay);
  const title = get('interest-title');
  title.textContent = specialist ? 'Solicitar demo de ' + specialist.name : 'Quer conhecer o IMOB com IA?';
  get('interest-intro').textContent = specialist
    ? 'Conte o que gostaria de testar com este especialista e escolha como enviar sua solicitação.'
    : introduction;
  renderSummary();
  section.hidden = false;
  section.scrollIntoView();
  title.focus({ preventScroll: true });
}

form.addEventListener('input', renderSummary);
form.addEventListener('submit', event => event.preventDefault());
get('interest-copy').addEventListener('click', async () => {
  const message = get('interest-message');
  const feedback = get('interest-feedback');
  try {
    await navigator.clipboard.writeText(message.textContent);
    feedback.textContent = 'Mensagem copiada.';
  } catch {
    get('interest-details').open = true;
    message.focus();
    feedback.textContent = 'Selecione o texto da mensagem para copiá-lo.';
  }
});

get('interest-back').addEventListener('click', () => {
  section.hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete('imovel');
  url.searchParams.delete('objetivo');
  url.searchParams.delete('especialista');
  history.replaceState(null, '', url);
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});

document.querySelectorAll('[data-interest]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openInterest({ listing: link.dataset.interest === 'anuncio', trigger: link });
  });
});
document.addEventListener('imob:start', event => openInterest(event.detail));

const params = new URLSearchParams(location.search);
if (/^#jornada(?:-recepcao|-imovel|-revisao)?$/.test(location.hash) || params.has('imovel')) {
  openInterest({
    propertyId: params.get('imovel'),
    listing: params.get('objetivo') === 'cadastrar',
    specialistId: params.get('especialista')
  });
} else {
  renderSummary();
}
