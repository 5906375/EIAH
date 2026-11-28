import { formatProposal } from './requests-local.mjs';
import { changeSeasonalStatus, seasonalStatus, seasonalSummary } from './seasonal-cases.mjs';
import { readSeasonalCases } from './site-setup-store.mjs';
import { money } from './stay-visual.mjs';

const queue = document.getElementById('seasonal-queue');
const message = document.getElementById('seasonal-queue-message');
const actions = {
  pending: [['confirmed', 'Confirmar disponibilidade'], ['unavailable', 'Marcar como indisponível']],
  confirmed: [['checkedIn', 'Registrar check-in simulado']]
};
const time = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

async function applyStatus(record, status, button) {
  const buttons = button.parentElement.querySelectorAll('button');
  buttons.forEach(item => { item.disabled = true; });
  try {
    const cases = await changeSeasonalStatus(record.id, status);
    render(cases);
    document.getElementById('seasonal-' + record.id)?.focus();
    message.textContent = seasonalStatus[status] + ' no pedido de ' + record.propertyTitle + '.';
  } catch (error) {
    message.textContent = error?.message || 'Não foi possível atualizar o pedido.';
    buttons.forEach(item => { item.disabled = false; });
  }
}

function makeCard(record) {
  const card = element('article', '', 'team-card');
  const heading = element('h3', record.propertyTitle);
  heading.id = 'seasonal-' + record.id;
  heading.tabIndex = -1;
  card.setAttribute('aria-labelledby', heading.id);
  const summary = element('dl', '', 'request-summary');
  formatProposal(summary, [
    ...seasonalSummary(record),
    ['Estimativa da demo', money(record.total)],
    ['Histórico', record.history.map(event => seasonalStatus[event.status] + ' · ' + time.format(new Date(event.at))).join('\n')]
  ]);
  card.append(heading, element('p', seasonalStatus[record.status], 'team-status'), summary);
  const controls = element('div', '', 'next-actions');
  for (const [status, label] of actions[record.status] ?? []) {
    const button = element('button', label, status === 'unavailable' ? 'btn btn-ghost' : 'btn btn-primary');
    button.type = 'button';
    button.addEventListener('click', () => { void applyStatus(record, status, button); });
    controls.append(button);
  }
  card.append(controls);
  return card;
}

function render(cases) {
  const records = Object.values(cases).reverse();
  queue.replaceChildren(...records.length ? records.map(makeCard) : [element('p', 'Nenhum pedido de temporada neste navegador.')]);
}

async function refresh() {
  try {
    render(await readSeasonalCases());
  } catch {
    message.textContent = 'O navegador não conseguiu carregar os pedidos de temporada.';
  }
}

addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
void refresh();
