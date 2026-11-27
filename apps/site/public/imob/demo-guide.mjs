import { createPromptAudio, stopContextAudio } from './context-audio.mjs';
import { demoGuideNarration, demoGuidePages, demoGuideTopics } from './demo-guide-content.mjs';

// Cada seção da página com data-demo-guide-topic ganha um botão "Como funciona?" que abre o passo a passo
// daquele assunto, em texto e em áudio. Não há mais um guia geral no cabeçalho.
const base = new URL('./', import.meta.url);
const page = location.pathname.slice(base.pathname.length).replace(/\/?index\.html$/, '').replace(/\/$/, '');
const topicsById = new Map(demoGuideTopics.map(topic => [topic.id, topic]));

if (demoGuidePages[page]) mountGuide();

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

  const dialog = element('dialog', '', 'demo-guide');
  dialog.id = 'imob-demo-guide';
  dialog.setAttribute('aria-labelledby', 'imob-demo-guide-title');
  const title = element('h2');
  title.id = 'imob-demo-guide-title';
  const close = button('Fechar', 'btn btn-ghost');
  const header = element('div', '', 'demo-guide-header');
  header.append(title, close);
  const content = element('div', '', 'demo-guide-list');
  dialog.append(header, content);
  document.body.append(dialog);

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stopContextAudio);

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
      content.replaceChildren(renderTopic(topic, dialog));
      dialog.showModal();
    });
  });
}

function renderTopic(topic, dialog) {
  const details = element('div', '', 'demo-guide-topic');
  const description = element('p', topic.description);
  const steps = element('ol');
  steps.append(...topic.steps.map(step => element('li', step)));
  const role = document.body.dataset.guideRole ?? 'welcome';
  const fallbackSource = new URL('assets/guia-demo/' + topic.id + '.mp3', base);
  const audio = createPromptAudio(demoGuideNarration(topic), role, () => {}, 'Ouvir passo a passo', {
    fallbackSource,
    headphones: true
  });
  for (const control of audio.querySelectorAll('button')) control.classList.add('btn', 'btn-ghost');
  details.append(description, steps, audio);
  const [label, destination] = topic.link;
  const target = new URL(destination, base);
  if (page === 'ia-cliente' && target.hash === '#jornada') target.pathname = new URL('ia-cliente/', base).pathname;
  const samePage = target.pathname === location.pathname && target.search === location.search;
  const anchor = samePage && target.hash ? document.getElementById(target.hash.slice(1)) : null;
  if (!samePage || (anchor && !anchor.hidden)) {
    const link = element('a', label, 'btn btn-ghost');
    link.href = target;
    link.addEventListener('click', () => dialog.close());
    details.append(link);
  }
  return details;
}
