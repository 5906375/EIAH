import { guideRecording, guideVoiceRoles } from './guide-voice-store.mjs';

const speech = 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
const questionAudioLabel = 'Ouvir pergunta';
let active;

export function stopContextAudio() {
  if (!active) return;
  const playback = active;
  active = null;
  playback.stop();
  playback.end('Áudio interrompido.');
}

function playbackButton(wrap, label, status, play, stop, { onUnavailable, headphones = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  const setLabel = playing => {
    const action = playing ? 'Parar áudio' : label;
    const showIcon = headphones && !playing;
    button.textContent = showIcon ? '🎧' : action;
    if (headphones) {
      button.setAttribute('aria-label', action);
      button.title = action;
      button.classList.toggle('audio-headphones', showIcon);
    }
  };
  setLabel(false);
  wrap.append(button);
  button.addEventListener('click', () => {
    if (active?.button === button) {
      stopContextAudio();
      return;
    }
    stopContextAudio();
    const end = message => {
      setLabel(false);
      status.textContent = message;
    };
    const current = { button, stop, end };
    active = current;
    setLabel(true);
    try {
      play((message, unavailable) => {
        if (active !== current) return;
        active = null;
        end(message);
        if (unavailable) onUnavailable?.();
      });
    } catch {
      active = null;
      end('Não foi possível iniciar o áudio.');
      onUnavailable?.();
    }
  });
  return button;
}

function speakText(text, preferredVoice, status, done) {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speech.getVoices();
  const voice = voices.find(item => item.voiceURI === preferredVoice)
    ?? voices.find(item => /^pt[-_]BR$/i.test(item.lang) && item.localService)
    ?? voices.find(item => /^pt[-_]BR$/i.test(item.lang))
    ?? voices.find(item => /^pt/i.test(item.lang));
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'pt-BR';
  utterance.onend = () => done('Leitura concluída.');
  utterance.onerror = () => done('Leitura indisponível. Você pode seguir pela mensagem em texto.', true);
  status.textContent = 'Lendo a mensagem…';
  speech.speak(utterance);
}

const voiceKey = role => 'eiah-imob-visual:voice:' + document.body.dataset.product + ':' + role;

export function createPromptAudio(text, role, beforePlay, label = questionAudioLabel, {
  fallbackSource, headphones = label === questionAudioLabel
} = {}) {
  const element = document.createElement('div');
  element.className = 'context-audio request-prompt-audio';
  const status = document.createElement('span');
  status.className = 'audio-status';
  status.setAttribute('role', 'status');
  const fallback = fallbackSource ? document.createElement('div') : null;
  if (fallback) {
    fallback.hidden = Boolean(speech);
    fallback.append(createRecordedPromptAudio(fallbackSource, 'Ouvir gravação alternativa'));
  }
  if (speech) {
    playbackButton(element, label, status, done => {
      beforePlay();
      if (fallback) fallback.hidden = true;
      let preferredVoice;
      try { preferredVoice = localStorage.getItem(voiceKey(role)); } catch {}
      speakText(text, preferredVoice, status, done);
    }, () => speech.cancel(), {
      headphones,
      onUnavailable: () => { if (fallback) fallback.hidden = false; }
    });
    element.append(status);
  } else if (fallback) {
    status.textContent = 'Leitura por voz indisponível neste navegador.';
    element.append(status);
  }
  if (fallback) element.append(fallback);
  return element;
}

function createRecordedPromptAudio(source, label) {
  const element = document.createElement('div');
  element.className = 'context-audio request-prompt-audio';
  const status = document.createElement('span');
  status.className = 'audio-status';
  status.setAttribute('role', 'status');
  const audio = new Audio();
  audio.preload = 'none';
  playbackButton(element, label, status, done => {
    if (!audio.hasAttribute('src')) audio.src = source;
    audio.onended = () => done('Áudio concluído.');
    audio.onerror = () => done('Áudio indisponível. Você pode seguir pelos passos em texto.');
    status.textContent = 'Reproduzindo a orientação…';
    audio.play().catch(() => done('Áudio indisponível. Você pode seguir pelos passos em texto.'));
  }, () => {
    audio.pause();
    audio.currentTime = 0;
  });
  element.append(status);
  return element;
}

export function createContextAudio(textProvider) {
  const element = document.createElement('div');
  element.className = 'context-audio';
  const status = document.createElement('span');
  status.className = 'audio-status';
  status.setAttribute('role', 'status');
  const voiceLabel = document.createElement('label');
  voiceLabel.className = 'context-voice';
  voiceLabel.textContent = 'Voz da leitura';
  const select = document.createElement('select');
  voiceLabel.append(select);
  element.append(voiceLabel);

  let role = 'welcome';
  function populateVoices() {
    const voices = (speech?.getVoices() ?? []).filter(voice => /^pt([-_]|$)/i.test(voice.lang))
      .sort((a, b) => Number(/^pt[-_]BR$/i.test(b.lang)) - Number(/^pt[-_]BR$/i.test(a.lang)));
    select.replaceChildren(new Option('Padrão do navegador', ''));
    for (const voice of voices) select.add(new Option(voice.name + ' (' + voice.lang + ')', voice.voiceURI));
    try { select.value = localStorage.getItem(voiceKey(role)) ?? ''; } catch {}
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
  select.addEventListener('change', () => {
    stopContextAudio();
    status.textContent = '';
    try { localStorage.setItem(voiceKey(role), select.value); } catch {}
  });
  speech?.addEventListener('voiceschanged', populateVoices);
  voiceLabel.hidden = !speech;

  const listen = playbackButton(element, 'Ouvir orientação', status,
    done => speakText(textProvider(), select.value, status, done), () => speech.cancel());
  listen.disabled = !speech;

  const audio = new Audio();
  let objectUrl;
  let readRevision = 0;
  const recorded = playbackButton(element, 'Ouvir mensagem da imobiliária', status, done => {
    audio.onended = () => done('Mensagem concluída.');
    audio.onerror = () => done('Não foi possível reproduzir a mensagem.');
    status.textContent = 'Reproduzindo a mensagem…';
    audio.play().catch(() => done('Não foi possível reproduzir a mensagem.'));
  }, () => { audio.pause(); audio.currentTime = 0; });
  recorded.hidden = true;
  element.append(status);

  async function loadRecording() {
    if (document.body.dataset.product !== 'ia-cliente') return;
    const revision = ++readRevision;
    recorded.hidden = true;
    if (objectUrl) {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
    try {
      const recording = await guideRecording(role);
      if (revision !== readRevision || !recording?.size) return;
      objectUrl = URL.createObjectURL(recording);
      audio.src = objectUrl;
      recorded.hidden = false;
    } catch {
      // Browser speech and text remain available.
    }
  }

  addEventListener('pageshow', event => { if (event.persisted) loadRecording(); });
  return {
    element,
    setRole(nextRole) {
      role = Object.hasOwn(guideVoiceRoles, nextRole) ? nextRole : 'welcome';
      select.setAttribute('aria-label', 'Voz da leitura para ' + guideVoiceRoles[role]);
      populateVoices();
      status.textContent = speech ? '' : 'Leitura por voz indisponível neste navegador.';
      loadRecording();
    }
  };
}

addEventListener('pagehide', stopContextAudio);
