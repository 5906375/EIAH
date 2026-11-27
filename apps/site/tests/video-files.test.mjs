import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  VIDEO_LIMITS, checkVideoContent, checkVideoDuration, displayName, formatSize, sniffVideoContainer, validateVideoFile
} from '../public/imob/video-files.mjs';

const MB = 1024 * 1024;
const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0, 0, 0, 0]);
const ftyp = brand => Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from(brand)]);

test('os limites são 25 MB, 2 minutos e 3 vídeos por imóvel', () => {
  assert.deepEqual({ ...VIDEO_LIMITS }, { maxBytes: 25 * MB, maxSeconds: 120, maxPerProperty: 3 });
});

test('aceita MP4 e WebM dentro dos limites, também pela extensão quando o tipo vem vazio', () => {
  assert.deepEqual(validateVideoFile({ name: 'tour.mp4', type: 'video/mp4', size: 5 * MB }), { ok: true, type: 'video/mp4' });
  assert.deepEqual(validateVideoFile({ name: 'tour.webm', type: 'video/webm;codecs=vp9', size: 1 }), { ok: true, type: 'video/webm' });
  assert.equal(validateVideoFile({ name: 'tour.mp4', type: '', size: MB }).type, 'video/mp4');
  assert.equal(validateVideoFile({ name: 'tour.webm', type: '', size: MB }).type, 'video/webm');
});

test('recusa tipo não suportado, arquivo vazio e arquivo grande demais, dizendo o motivo', () => {
  assert.match(validateVideoFile({ name: 'a.mov', type: 'video/quicktime', size: MB }).error, /MP4 ou WebM/);
  assert.match(validateVideoFile({ name: 'a.avi', type: '', size: MB }).error, /MP4 ou WebM/);
  assert.match(validateVideoFile({ name: 'a.png', type: 'image/png', size: MB }).error, /MP4 ou WebM/);
  assert.match(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 0 }).error, /vazio/);
  assert.match(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: undefined }).error, /vazio/);
  const big = validateVideoFile({ name: 'grande.mp4', type: 'video/mp4', size: 25 * MB + 1 });
  assert.equal(big.ok, false);
  assert.match(big.error, /grande\.mp4.*25,0 MB/);
  assert.equal(validateVideoFile({ name: 'limite.mp4', type: 'video/mp4', size: 25 * MB }).ok, true);
});

test('limita a 3 vídeos por imóvel', () => {
  const file = { name: 'a.mp4', type: 'video/mp4', size: MB };
  assert.equal(validateVideoFile(file, { existing: 2 }).ok, true);
  assert.match(validateVideoFile(file, { existing: 3 }).error, /até 3 vídeos/);
});

test('reconhece o contêiner pelos primeiros bytes', () => {
  assert.equal(sniffVideoContainer(webm), 'video/webm');
  assert.equal(sniffVideoContainer(ftyp('isom')), 'video/mp4');
  assert.equal(sniffVideoContainer(ftyp('mp42')), 'video/mp4');
  assert.equal(sniffVideoContainer(ftyp('qt  ')), 'video/quicktime');
  assert.equal(sniffVideoContainer(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(sniffVideoContainer(Uint8Array.from([1, 2])), null);
  assert.equal(sniffVideoContainer(null), null);
});

test('a extensão não basta: o conteúdo precisa ser do tipo informado', () => {
  assert.equal(checkVideoContent(webm, 'video/webm').ok, true);
  assert.equal(checkVideoContent(ftyp('isom'), 'video/mp4').ok, true);
  assert.match(checkVideoContent(webm, 'video/mp4', 'x.mp4').error, /não corresponde/);
  assert.match(checkVideoContent(Uint8Array.from(Buffer.from('<script>alert(1)</script>')), 'video/mp4', 'x.mp4').error, /não parece ser um vídeo/);
  assert.match(checkVideoContent(ftyp('qt  '), 'video/mp4', 'x.mp4').error, /não parece ser um vídeo/);
});

test('duração: aceita até 2 minutos e recusa valor ilegível', () => {
  assert.equal(checkVideoDuration(120).ok, true);
  assert.match(checkVideoDuration(121, 'longo.mp4').error, /mais de 2 minutos/);
  for (const bad of [0, -1, NaN, Infinity, undefined]) assert.match(checkVideoDuration(bad).error, /duração/);
});

test('nome exibido não traz caminho nem caracteres de controle', () => {
  assert.equal(displayName('C:\\Users\\ana\\Videos\\tour.mp4'), 'tour.mp4');
  assert.equal(displayName('../../etc/passwd'), 'passwd');
  assert.equal(displayName('a\u0000b\u0007.mp4'), 'ab.mp4');
  assert.equal(displayName('x'.repeat(200)).length, 60);
  assert.equal(displayName(''), 'vídeo');
  assert.equal(displayName(undefined), 'vídeo');
});

test('tamanho em MB no formato brasileiro', () => {
  assert.equal(formatSize(25 * MB), '25,0 MB');
  assert.equal(formatSize(1.5 * MB), '1,5 MB');
  assert.equal(formatSize(MB), '1,0 MB');
  assert.equal(formatSize(11937), '11,7 KB', 'arquivo pequeno em KB, nunca "0,0 MB"');});

test('o formulário do editor aceita só MP4 e WebM e informa os mesmos limites do módulo', () => {
  const html = readFileSync(new URL('../public/imob/ia-cliente/personalizar/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="propertyVideos"[^>]*accept="video\/mp4,video\/webm"/);
  assert.match(html, /até 25 MB/);
  assert.match(html, /2 minutos/);
  assert.match(html, /até 3 vídeos/);
});
