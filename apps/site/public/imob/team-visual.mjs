import { formatProposal, readLocal, setRequestAudio } from './requests-local.mjs';
import { renderPropertyContext } from './property-context.mjs';

const queue = document.getElementById('savedQueue');
const records = readLocal('queue', []);
if (records.length === 0) {
  queue.textContent = 'Nenhum pedido salvo nesta aba.';
}
for (const record of records.slice().reverse()) {
  const card = document.createElement('article');
  card.className = 'team-card';
  const title = document.createElement('h2');
  const objective = record.entries.find(([label]) => label === 'Objetivo')?.[1];
  title.textContent = objective ?? 'Pedido salvo';
  const status = document.createElement('p');
  status.className = 'team-status';
  status.textContent = 'Recebido · simulação';
  const contents = document.createElement('dl');
  contents.className = 'request-summary';
  formatProposal(contents, record.entries);
  card.append(status, title, contents);
  if (record.property) {
    const property = document.createElement('aside');
    property.setAttribute('aria-label', 'Imóvel do pedido');
    renderPropertyContext(property, record.property);
    card.append(property);
  }
  const recordings = record.recordings ?? (record.audio ? [{ label: 'Pedido inicial', source: record.audio }] : []);
  for (const { label, source } of recordings) {
    const recording = document.createElement('div');
    recording.className = 'request-voice';
    const caption = document.createElement('p');
    caption.textContent = label + ' · mensagem de voz';
    const player = document.createElement('audio');
    player.controls = true;
    player.preload = 'metadata';
    player.setAttribute('aria-label', 'Ouvir mensagem sobre ' + label);
    setRequestAudio(player, source);
    if (player.getAttribute('src')) {
      recording.append(caption, player);
      card.append(recording);
    }
  }
  queue.append(card);
}
