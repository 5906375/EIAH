export function canRecordAudio() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

export function captureAudio({ limitSeconds, onStart, onComplete, onError }) {
  let stream;
  let recorder;
  let timer;
  let cancelled = false;
  const chunks = [];

  function release() {
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
  }

  function stop() {
    if (recorder?.state === 'recording') recorder.stop();
  }

  async function start() {
    if (cancelled) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled) {
        release();
        return;
      }
      if (document.visibilityState === 'hidden') {
        release();
        onError(new Error('A aba está em segundo plano.'));
        return;
      }
      recorder = new MediaRecorder(stream, { audioBitsPerSecond: 64000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = event => {
        release();
        if (cancelled) return;
        cancelled = true;
        onError(event.error ?? new Error('A gravação foi interrompida.'));
      };
      recorder.onstop = () => {
        release();
        if (cancelled) return;
        const type = (recorder.mimeType || chunks[0]?.type || 'audio/webm').split(';')[0];
        onComplete(new Blob(chunks, { type }));
      };
      recorder.start();
      timer = setTimeout(stop, limitSeconds * 1000);
      onStart();
    } catch (error) {
      release();
      if (!cancelled) onError(error);
    }
  }

  // Defer startup so callers can keep the controller before any callback fires.
  queueMicrotask(start);
  return {
    stop,
    cancel() {
      cancelled = true;
      stop();
      release();
    }
  };
}
