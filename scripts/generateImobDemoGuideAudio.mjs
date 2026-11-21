import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { demoGuideNarration, demoGuideTopics } from '../apps/site/public/imob/demo-guide-content.mjs';

// Pass the local espeak-ng.js from echogarden-project/espeak-ng-emscripten
// at 7ab07eba2d966ce45040c88d9be953e1d68640e7, with espeak-ng.data beside it.
// Use --check to verify that the audio reflects the current guide text.
const mode = process.argv[2];
if (!mode) throw new Error('Use --check ou informe o caminho local de espeak-ng.js.');
const output = new URL('../apps/site/public/imob/assets/guia-demo/', import.meta.url);
const verify = mode === '--check';
let synthesizer;

if (!verify) {
  const { default: loadEngine } = await import(pathToFileURL(resolve(mode)));
  const engine = await loadEngine();
  synthesizer = new engine.eSpeakNGWorker();
  if (synthesizer.set_voice('Portuguese (Brazil)', 'pt-br') !== 0) throw new Error('Voz pt-BR indisponível.');
  synthesizer.set_rate(153);
  mkdirSync(output, { recursive: true });
}

for (const topic of demoGuideTopics) {
  const text = demoGuideNarration(topic);
  const fingerprint = createHash('sha256').update(text).digest('hex');
  const file = fileURLToPath(new URL(topic.id + '.mp3', output));
  if (verify) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment',
      '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
    if (result.status !== 0 || result.stdout.trim() !== fingerprint) {
      throw new Error('Gere o áudio atualizado de ' + topic.id + '.');
    }
    continue;
  }
  const chunks = [];
  synthesizer.synthesize(text, samples => {
    chunks.push(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    return 0;
  });
  if (!chunks.length) throw new Error('A narração não foi gerada para ' + topic.id + '.');
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 's16le', '-ar', String(synthesizer.get_samplerate()), '-ac', '1',
    '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '16k', '-metadata', 'comment=' + fingerprint, file
  ], { input: Buffer.concat(chunks), stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.status !== 0) throw new Error('Não foi possível gerar ' + file + '.');
}
console.log(demoGuideTopics.length + (verify ? ' narrações conferidas.' : ' narrações geradas.'));
