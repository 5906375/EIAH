import { createRecordedPromptAudio, stopContextAudio } from './context-audio.mjs';
import { demoGuidePages, demoGuideTopics } from './demo-guide-content.mjs';

const base = new URL('./', import.meta.url);
const page = location.pathname.slice(base.pathname.length).replace(/\/?index\.html$/, '').replace(/\/$/, '');
const pageTopics = demoGuidePages[page];
const brand = document.querySelector('.topbar .brand');

if (pageTopics && brand) mountGuide();

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function button(text, className) {
  const item = element('button', text, className);
  item.type = 'button';
  return item;
}

function mountGuide() {
  const style = element('link');
  style.rel = 'stylesheet';
  style.href = new URL('demo-guide.css', base);
  document.head.append(style);

  const launch = button('Guia da demo', 'btn btn-ghost demo-guide-launcher');
  launch.setAttribute('aria-haspopup', 'dialog');
  launch.setAttribute('aria-controls', 'imob-demo-guide');
  brand.after(launch);

  const dialog = element('dialog', '', 'demo-guide');
  dialog.id = 'imob-demo-guide';
  dialog.setAttribute('aria-labelledby', 'imob-demo-guide-title');
  const title = element('h2', 'Guia da demo IMOB');
  title.id = 'imob-demo-guide-title';
  const close = button('Fechar', 'btn btn-ghost');
  const header = element('div', '', 'demo-guide-header');
  header.append(title, close);

  const intro = element('p', 'Escolha um recurso para ver os passos e ouvir a explicação.');
  const filter = element('div', '', 'demo-guide-filter next-actions');
  filter.setAttribute('role', 'group');
  filter.setAttribute('aria-label', 'Assuntos do guia');
  const current = button('Nesta tela', 'btn btn-ghost');
  const all = button('Todos os recursos', 'btn btn-ghost');
  filter.append(current, all);
  const list = element('div', '', 'demo-guide-list');
  dialog.append(header, intro, filter, list);
  document.body.append(dialog);

  function render(showAll) {
    stopContextAudio();
    current.setAttribute('aria-pressed', String(!showAll));
    all.setAttribute('aria-pressed', String(showAll));
    const topics = showAll ? demoGuideTopics : pageTopics.map(id => demoGuideTopics.find(topic => topic.id === id));
    list.replaceChildren(...topics.map(topic => renderTopic(topic, dialog)));
    const hashTopic = topics.findIndex(topic => location.hash && new URL(topic.link[1], base).hash === location.hash);
    list.children[Math.max(0, hashTopic)].open = true;
  }

  launch.addEventListener('click', () => {
    render(false);
    dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stopContextAudio);
  current.addEventListener('click', () => render(false));
  all.addEventListener('click', () => render(true));
}

function renderTopic(topic, dialog) {
  const details = element('details', '', 'demo-guide-topic');
  details.name = 'imob-demo-topics';
  const summary = element('summary', topic.title);
  const description = element('p', topic.description);
  const steps = element('ol');
  steps.append(...topic.steps.map(step => element('li', step)));
  const audio = createRecordedPromptAudio(new URL('assets/guia-demo/' + topic.id + '.mp3', base), 'Ouvir passo a passo');
  audio.querySelector('button').classList.add('btn', 'btn-ghost');
  details.append(summary, description, steps, audio);
  const [label, destination] = topic.link;
  const target = new URL(destination, base);
  const samePage = target.pathname === location.pathname && target.search === location.search;
  const anchor = samePage && target.hash ? document.getElementById(target.hash.slice(1)) : null;
  if (!samePage || (anchor && !anchor.hidden)) {
    const link = element('a', label, 'quiet-link');
    link.href = target;
    link.addEventListener('click', () => dialog.close());
    details.append(link);
  }
  details.addEventListener('toggle', () => {
    if (!details.open) stopContextAudio();
  });
  return details;
}
