import { canRecordAudio, captureAudio } from './microphone-capture.mjs';
import { stopContextAudio } from './context-audio.mjs';

export function requestVoice(onMessage, onBusy) {
  const record = document.getElementById('recordRequest');
  const stop = document.getElementById('stopRequestRecording');
  const status = document.getElementById('requestVoiceStatus');
  const supported = canRecordAudio();
  let available = true;
  let busy = false;
  let capture;
  let recordingStarted = false;

  function setBusy(value) {
    busy = value;
    record.hidden = busy;
    record.disabled = !supported || !available;
    stop.hidden = !busy;
    stop.disabled = false;
    onBusy();
  }

  function setButtonLabel(button, label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function resetCapture() {
    const wasFocused = document.activeElement === stop;
    capture = undefined;
    recordingStarted = false;
    setBusy(false);
    if (wasFocused) record.focus({ preventScroll: true });
  }

  record.disabled = !supported;
  if (!supported) status.textContent = 'Gravação indisponível neste navegador. Você pode escrever seu pedido.';
  record.addEventListener('click', () => {
    if (busy || !available) return;
    stopContextAudio();
    setButtonLabel(stop, 'Cancelar gravação');
    status.textContent = 'Aguardando acesso ao microfone…';
    setBusy(true);
    stop.focus({ preventScroll: true });
    capture = captureAudio({
      limitSeconds: 30,
      onStart() {
        recordingStarted = true;
        setButtonLabel(stop, 'Parar gravação');
        status.textContent = 'Gravando… até 30 segundos.';
      },
      onComplete(blob) {
        const recording = capture;
        if (!blob.size || blob.size > 512 * 1024 || !blob.type.startsWith('audio/')) {
          status.textContent = 'Não foi possível usar essa gravação. Tente gravar novamente.';
          resetCapture();
          return;
        }
        stop.disabled = true;
        status.textContent = 'Preparando a gravação…';
        const reader = new FileReader();
        reader.onload = () => {
          if (capture !== recording) return;
          status.textContent = onMessage(String(reader.result)) ?? '';
          resetCapture();
        };
        reader.onerror = () => {
          if (capture !== recording) return;
          status.textContent = 'Não foi possível preparar a gravação.';
          resetCapture();
        };
        reader.readAsDataURL(blob);
      },
      onError(error) {
        status.textContent = error.name === 'NotAllowedError'
          ? 'Acesso ao microfone indisponível. Você pode escrever o pedido ou tentar novamente.'
          : 'Não foi possível gravar. Você pode escrever o pedido ou tentar novamente.';
        resetCapture();
      }
    });
  });

  function cancel() {
    if (!capture) return;
    capture.cancel();
    resetCapture();
    status.textContent = 'Gravação cancelada.';
  }

  stop.addEventListener('click', () => {
    if (!recordingStarted) cancel();
    else capture?.stop();
  });
  addEventListener('pagehide', cancel);
  return {
    cancel,
    setAvailable(value) {
      available = value;
      record.disabled = !supported || !available;
    },
    get busy() { return busy; }
  };
}
