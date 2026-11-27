const prefix = 'eiah-imob-visual:' + document.body.dataset.product + ':';

export function readLocal(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(prefix + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function formatProposal(container, entries) {
  container.replaceChildren();
  for (const [name, value] of entries) {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const text = document.createElement('dd');
    if (name === 'Pendências' || name === 'Próxima ação da equipe') row.className = 'review-highlight';
    label.textContent = name;
    text.textContent = value;
    row.append(label, text);
    container.append(row);
  }
}

export function setRequestAudio(player, source) {
  if (!/^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(source ?? '')) source = null;
  if (player.getAttribute('src') === (source || null)) return;
  player.pause();
  if (source) player.src = source;
  else {
    player.removeAttribute('src');
    player.load();
  }
}
