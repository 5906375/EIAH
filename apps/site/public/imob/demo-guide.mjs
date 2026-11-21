import { createPromptAudio, stopContextAudio } from './context-audio.mjs';
import { demoGuideNarration, demoGuidePages, demoGuideTopics } from './demo-guide-content.mjs';

const base = new URL('./', import.meta.url);
const page = location.pathname.slice(base.pathname.length).replace(/\/?index\.html$/, '').replace(/\/$/, '');
const pageTopics = demoGuidePages[page];
const brand = document.querySelector('.topbar .brand');
const topicsById = new Map(demoGuideTopics.map(topic => [topic.id, topic]));

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
    title.textContent = 'Guia da demo IMOB';
    intro.hidden = false;
    filter.hidden = false;
    const topics = showAll ? demoGuideTopics : pageTopics.map(id => topicsById.get(id));
    list.replaceChildren(...topics.map(topic => renderTopic(topic, dialog)));
    const anchor = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    const preferred = anchor?.dataset.demoGuideTopic ?? anchor?.querySelector('[data-demo-guide-topic]')?.dataset.demoGuideTopic;
    const hashTopic = topics.findIndex(topic => topic.id === preferred);
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

  document.querySelectorAll('[data-demo-guide-topic]').forEach((section, index) => {
    const help = button('Como funciona?', 'btn btn-ghost demo-guide-section');
    help.setAttribute('aria-haspopup', 'dialog');
    help.setAttribute('aria-controls', dialog.id);
    if (section.matches('footer')) {
      help.setAttribute('aria-label', 'Como funciona? Contato e rodapé');
      section.querySelector('.wrap').prepend(help);
    } else {
      section.id ||= 'demo-guide-section-' + index;
      help.setAttribute('aria-describedby', section.id);
      section.after(help);
    }
    help.addEventListener('click', () => {
      const topic = topicsById.get(section.dataset.demoGuideTopic);
      if (!topic) return;
      stopContextAudio();
      title.textContent = topic.title;
      intro.hidden = true;
      filter.hidden = true;
      list.replaceChildren(renderTopic(topic, dialog, true));
      dialog.showModal();
    });
  });
}

function renderTopic(topic, dialog, standalone = false) {
  const details = element(standalone ? 'div' : 'details', '', 'demo-guide-topic');
  if (!standalone) {
    details.name = 'imob-demo-topics';
    details.append(element('summary', topic.title));
    details.addEventListener('toggle', () => {
      if (!details.open) stopContextAudio();
    });
  }
  const description = element('p', topic.description);
  const steps = element('ol');
  steps.append(...topic.steps.map(step => element('li', step)));
  const role = document.body.dataset.guideRole ?? 'welcome';
  const fallbackSource = new URL('assets/guia-demo/' + topic.id + '.mp3', base);
  const audio = createPromptAudio(demoGuideNarration(topic), role, () => {}, 'Ouvir passo a passo', { fallbackSource });
  for (const control of audio.querySelectorAll('button')) control.classList.add('btn', 'btn-ghost');
  details.append(description, steps, audio);
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
  return details;
}
