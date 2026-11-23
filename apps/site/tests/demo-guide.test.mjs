import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { demoGuideNarration, demoGuidePages, demoGuideTopics } from '../public/imob/demo-guide-content.mjs';

const root = new URL('../public/imob/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ids = demoGuideTopics.map(topic => topic.id);

test('cada assunto tem título, descrição, passos e um link', () => {
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const topic of demoGuideTopics) {
    assert.match(topic.id, /^[a-z]+(?:-[a-z]+)*$/, topic.id);
    assert.ok(topic.title.length > 3 && topic.description.length > 10, topic.id);
    assert.ok(Array.isArray(topic.steps) && topic.steps.length >= 1 && topic.steps.length <= 5, `${topic.id}: de 1 a 5 passos`);
    for (const step of topic.steps) assert.ok(typeof step === 'string' && step.length > 10, `${topic.id}: passo vazio`);
    assert.equal(topic.link.length, 2, `${topic.id}: link [rótulo, destino]`);
  }
});

test('as páginas só citam assuntos que existem e nenhum assunto fica órfão', () => {
  const used = new Set(Object.values(demoGuidePages).flat());
  for (const [page, list] of Object.entries(demoGuidePages)) {
    for (const id of list) assert.ok(ids.includes(id), `${page || '(raiz)'}: assunto inexistente "${id}"`);
  }
  assert.deepEqual(ids.filter(id => !used.has(id)), [], 'assuntos que nenhuma página usa');
});

test('cada data-demo-guide-topic do HTML existe e está registrado para a própria página', () => {
  for (const [page, list] of Object.entries(demoGuidePages)) {
    const file = page ? `${page}/index.html` : 'index.html';
    if (!existsSync(new URL(file, root))) continue;
    for (const [, id] of read(file).matchAll(/data-demo-guide-topic="([a-z-]+)"/g)) {
      assert.ok(ids.includes(id), `${file}: assunto inexistente "${id}"`);
      assert.ok(list.includes(id), `${file}: "${id}" não está em demoGuidePages["${page}"]`);
    }
  }
});

test('o editor tem o botão "Como funciona?" do cadastro guiado e dos vídeos', () => {
  const html = read('ia-cliente/personalizar/index.html');
  assert.match(html, /id="guidedTitle" data-demo-guide-topic="cadastro-guiado"/);
  assert.match(html, /for="propertyVideos" data-demo-guide-topic="videos"/);
});

test('o botão "Guia da demo" do cabeçalho foi removido de todas as páginas', () => {
  const files = readdirSync(root, { recursive: true }).filter(name => /\.(html|mjs|css)$/.test(name));
  assert.ok(files.length > 20);
  for (const file of files) {
    const text = read(file);
    assert.ok(!text.includes('Guia da demo'), `${file}: ainda cita "Guia da demo"`);
    assert.ok(!text.includes('demo-guide-launcher'), `${file}: ainda cita demo-guide-launcher`);
  }
});

test('a narração junta título, descrição e passos numerados', () => {
  const text = demoGuideNarration(demoGuideTopics[0]);
  assert.ok(text.startsWith(demoGuideTopics[0].title + '.'));
  assert.match(text, /Passo 1\. /);
});

test('os textos são amigáveis à leitura em voz alta (sem MB/KB abreviados)', () => {
  for (const topic of demoGuideTopics) {
    for (const text of [topic.title, topic.description, ...topic.steps]) {
      assert.ok(!/\b[MKG]B\b/.test(text), `${topic.id}: escreva "megabytes" por extenso: ${text.slice(0, 50)}`);
    }
  }
});

test('o MP3 de reserva de cada assunto reflete o texto atual (mesma regra do --check)', () => {
  const stale = [];
  for (const topic of demoGuideTopics) {
    const file = new URL(`assets/guia-demo/${topic.id}.mp3`, root);
    if (!existsSync(file)) { stale.push(topic.id + ' (sem arquivo)'); continue; }
    const fingerprint = createHash('sha256').update(demoGuideNarration(topic)).digest('hex');
    if (!readFileSync(file).includes(fingerprint)) stale.push(topic.id);
  }
  assert.deepEqual(stale, [], 'regenere com scripts/generateImobDemoGuideAudio.mjs');
});

test('não há MP3 sem assunto correspondente', () => {
  const files = readdirSync(new URL('assets/guia-demo/', root)).filter(name => name.endsWith('.mp3'));
  assert.deepEqual(files.map(name => name.replace(/\.mp3$/, '')).filter(id => !ids.includes(id)), []);
});
