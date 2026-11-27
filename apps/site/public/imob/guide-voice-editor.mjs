import { guideRecording } from './guide-voice-store.mjs';
import { canRecordAudio, captureAudio } from './microphone-capture.mjs';

const get = id => document.getElementById(id);
const assistant = get('voiceRole');
const record = get('voiceRecord');
const stop = get('voiceStop');
const fileInput = get('voiceFile');
const listen = get('voiceListen');
const apply = get('voiceApply');
const remove = get('voiceRemove');
const status = get('voiceStatus');
const maxBytes = 4 * 1024 * 1024;
const maxDuration = 30;
const canRecord = canRecordAudio();
const scripts = {
  welcome: 'Olá! Conte se você procura um imóvel ou quer anunciar. Vamos organizar o seu pedido.',
  property: 'Informe os dados que você já sabe sobre o imóvel. Nossa equipe ajuda com o que faltar.',
  review: 'Confira o resumo e corrija o que precisar. Depois de confirmar, salve o pedido se quiser encaminhá-lo à equipe.'
};

let draft;
let saved;
let busy = false;
let capture;
let recording = false;
let url;

function refresh() {
  assistant.disabled = busy;
  record.disabled = busy || !canRecord;
  stop.hidden = !recording;
  fileInput.disabled = busy;
  apply.hidden = !draft;
  apply.disabled = busy;
  remove.hidden = !saved;
  remove.disabled = busy;
}

function preview(blob) {
  listen.pause();
  listen.removeAttribute('src');
  listen.load();
  if (url) URL.revokeObjectURL(url);
  url = blob ? URL.createObjectURL(blob) : undefined;
  listen.hidden = !url;
  if (url) listen.src = url;
}

async function loadAssistant() {
  get('voiceScript').textContent = scripts[assistant.value];
  draft = undefined;
  saved = undefined;
  preview();
  status.textContent = '';
  busy = true;
  refresh();
  try {
    saved = await guideRecording(assistant.value);
    preview(saved);
    status.textContent = saved ? 'Mensagem aplicada a esta etapa.' : '';
  } catch {
    status.textContent = 'Não foi possível acessar os áudios salvos neste navegador.';
  } finally {
    busy = false;
    refresh();
  }
}

assistant.addEventListener('change', () => {
  fileInput.value = '';
  loadAssistant();
});

function useDraft(blob) {
  draft = blob;
  preview(blob);
  status.textContent = 'Confira a mensagem e aplique o áudio à etapa.';
}

function audioDuration(file) {
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    const source = URL.createObjectURL(file);
    probe.preload = 'metadata';
    const timer = setTimeout(() => finish(reject, new Error('Metadados indisponíveis')), 6000);
    function finish(callback, value) {
      clearTimeout(timer);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(source);
      callback(value);
    }
    probe.onloadedmetadata = () => finish(resolve, probe.duration);
    probe.onerror = () => finish(reject, new Error('Formato não suportado'));
    probe.src = source;
  });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file || busy) return;
  if (!file.size || file.size > maxBytes) {
    status.textContent = 'Escolha um arquivo de áudio de até 4 MB.';
    return;
  }
  busy = true;
  refresh();
  try {
    const duration = await audioDuration(file);
    if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration) {
      status.textContent = 'Escolha um áudio de até 30 segundos com duração reconhecida pelo navegador.';
      return;
    }
    useDraft(file);
  } catch {
    status.textContent = 'Não foi possível abrir esse áudio. Experimente um arquivo MP3 ou WAV.';
  } finally {
    busy = false;
    refresh();
  }
});

function finishCapture() {
  capture = undefined;
  recording = false;
  busy = false;
  refresh();
}

record.addEventListener('click', () => {
  if (!canRecord || busy) return;
  listen.pause();
  busy = true;
  status.textContent = 'Aguardando acesso ao microfone…';
  refresh();
  capture = captureAudio({
    limitSeconds: maxDuration,
    onStart() {
      recording = true;
      status.textContent = 'Gravando… limite de 30 segundos.';
      refresh();
    },
    onComplete(blob) {
      if (blob.size && blob.size <= maxBytes) useDraft(blob);
      else status.textContent = 'Não foi possível aproveitar essa gravação. Tente gravar uma mensagem mais curta.';
      finishCapture();
    },
    onError(error) {
      status.textContent = error.name === 'NotAllowedError'
        ? 'Acesso ao microfone indisponível. Permita o acesso ou escolha um arquivo de áudio.'
        : 'Não foi possível gravar. Experimente escolher um arquivo de áudio.';
      finishCapture();
    }
  });
});
stop.addEventListener('click', () => capture?.stop());

apply.addEventListener('click', async () => {
  if (!draft || busy) return;
  busy = true;
  refresh();
  try {
    await guideRecording(assistant.value, 'save', draft);
    saved = draft;
    draft = undefined;
    status.textContent = 'Mensagem aplicada a esta etapa.';
  } catch {
    status.textContent = 'Não foi possível salvar a mensagem neste navegador.';
  } finally {
    busy = false;
    refresh();
  }
});

remove.addEventListener('click', async () => {
  if (!saved || busy) return;
  busy = true;
  refresh();
  try {
    await guideRecording(assistant.value, 'remove');
    saved = undefined;
    preview(draft);
    status.textContent = 'Mensagem salva removida desta etapa.';
  } catch {
    status.textContent = 'Não foi possível remover a mensagem.';
  } finally {
    busy = false;
    refresh();
  }
});

addEventListener('pagehide', () => {
  if (capture) {
    capture.cancel();
    finishCapture();
  }
  listen.pause();
});
addEventListener('pageshow', event => { if (event.persisted && !busy) refresh(); });
if (!canRecord) {
  get('voiceHelp').textContent = 'O microfone está indisponível neste navegador. Você pode escolher um arquivo de até 30 segundos e 4 MB.';
}
loadAssistant();
