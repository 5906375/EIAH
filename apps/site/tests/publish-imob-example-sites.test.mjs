import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { assignCovers, publish, removeExamples, renderSite, run, syncExamplesFile, validateDraft } from '../scripts/publish-imob-pilot.mjs';
import { exampleSites, publishExampleSites } from '../scripts/publish-imob-example-sites.mjs';

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'imob-exemplos-'));
  return { dir, root: pathToFileURL(dir + '/'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const slotsOf = dir => JSON.parse(readFileSync(join(dir, 'piloto-vagas.json'), 'utf8'));
const draft = { brand: { name: 'Praia Mar Imóveis', footerEmail: 'a@b.co', footerWhatsapp: '47999990000', footerPhone: '4733330000' }, properties: [] };

test('vitrine de exemplo traz aviso visível, não é indexada e não tem contatos', () => {
  const { html } = renderSite(draft, 'exemplo-praia-mar', { example: true });
  assert.match(html, /<p class="example-banner" role="note"><strong>Vitrine de exemplo\.<\/strong> Nomes, imóveis, valores e fotos são ilustrativos/);
  assert.match(html, /<title>Praia Mar Imóveis · Vitrine de exemplo<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(html.includes('<!-- Vitrine de exemplo'));
  assert.ok(!/wa\.me|tel:|mailto:/.test(html), 'nenhum contato clicável');
  const real = renderSite(draft, 'praia-mar').html;
  assert.ok(!real.includes('example-banner') && !real.includes('noindex'));
  assert.match(real, /wa\.me|mailto:/, 'vitrine real continua com os contatos');
});

test('o prefixo exemplo- separa vitrines de exemplo das de clientes', () => {
  const { dir, root, done } = sandbox();
  try {
    assert.throws(() => publish('praia-mar', draft, { root, example: true }), /deve começar com "exemplo-"/);
    assert.throws(() => publish('exemplo-praia-mar', draft, { root }), /reservado às vitrines de exemplo/);
    assert.deepEqual(readdirSync(dir), []);
    publish('exemplo-praia-mar', draft, { root, example: true });
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 1 }, 'exemplo ocupa vaga');
  } finally { done(); }
});

test('as 10 vitrines de exemplo são válidas, distintas e fictícias', () => {
  assert.equal(exampleSites.length, 10);
  assert.equal(new Set(exampleSites.map(site => site.slug)).size, 10);
  assert.equal(new Set(exampleSites.map(site => site.draft.brand.name)).size, 10);
  for (const { slug, draft: item } of exampleSites) {
    assert.match(slug, /^exemplo-\d\d$/, 'endereço neutro, sem nome');
    assert.match(item.brand.name, /\[x{4,8}\]/, 'nome com a palavra oculta: ' + slug);
    assert.doesNotThrow(() => validateDraft(item), slug);
    assert.ok(item.properties.length >= 3 && item.properties.length <= 4, slug);
    assert.ok(!('footerEmail' in item.brand) && !('footerWhatsapp' in item.brand) && !('footerPhone' in item.brand), 'sem contato: ' + slug);
    for (const property of item.properties) {
      assert.ok(property.fotos.every(foto => /^\/imob\/assets\/[a-z0-9-]+\.webp$/.test(foto)), slug);
      assert.ok(property.preco > 0);
    }
  }
});

test('publicar os 10 exemplos fecha o piloto, recusa a 11ª e o conjunto é estável ao repetir', () => {
  const { dir, root, done } = sandbox();
  try {
    const results = publishExampleSites({ root });
    assert.equal(results.length, 10);
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 10 });
    const before = readFileSync(join(dir, 'exemplo-10/index.html'), 'utf8');
    publishExampleSites({ root });
    assert.equal(readFileSync(join(dir, 'exemplo-10/index.html'), 'utf8'), before, 'mesma página ao repetir');
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 10 });
    assert.throws(() => publish('loja-real', draft, { root }), /10 vagas/);
    assert.ok(!before.includes('<script'), 'nenhum script nas páginas de exemplo');
  } finally { done(); }
});

test('remover os exemplos reabre as vagas e preserva vitrines de clientes e páginas do produto', () => {
  const { dir, root, done } = sandbox();
  try {
    publishExampleSites({ root });
    assert.equal(removeExamples(root), 10);
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 0 });
    publish('loja-real', draft, { root });
    publish('exemplo-a', draft, { root, example: true });
    publish('exemplo-b', draft, { root, example: true });
    mkdirSync(join(dir, 'ia-cliente'));
    writeFileSync(join(dir, 'ia-cliente/index.html'), '<html>produto</html>');
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 3 });
    assert.equal(removeExamples(root), 2);
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 1 });
    assert.ok(existsSync(join(dir, 'loja-real/index.html')), 'vitrine de cliente preservada');
    assert.ok(existsSync(join(dir, 'ia-cliente/index.html')), 'página do produto preservada');
    assert.ok(!existsSync(join(dir, 'exemplo-a')) && !existsSync(join(dir, 'exemplo-b')));
  } finally { done(); }
});

test('--remover-exemplos pela linha de comando e --exemplo publicam e removem', () => {
  const { dir, root, done } = sandbox();
  const log = console.log;
  try {
    const lines = [];
    console.log = line => lines.push(line);
    writeFileSync(join(dir, 'rascunho.json'), JSON.stringify(draft));
    run(['--exemplo', 'exemplo-praia-mar', join(dir, 'rascunho.json')], { root });
    run(['--remover-exemplos'], { root });
    console.log = log;
    assert.match(lines[0], /^Vitrine de exemplo pronta para deploy em https:\/\/eiah\.ia\.br\/imob\/exemplo-praia-mar\//);
    assert.match(lines[1], /Vitrines de exemplo removidas: 1\. Vagas do piloto: 10\/10 livres\./);
    assert.ok(!existsSync(join(dir, 'exemplo-praia-mar')));
  } finally { console.log = log; done(); }
});

const examplesOf = dir => JSON.parse(readFileSync(join(dir, 'piloto-exemplos.json'), 'utf8')).vitrines;

test('publicar os exemplos grava a lista piloto-exemplos.json com um cartão por vitrine', () => {
  const { dir, root, done } = sandbox();
  try {
    publishExampleSites({ root });
    const list = examplesOf(dir);
    assert.equal(list.length, 10);
    assert.deepEqual(list.map(item => item.slug), exampleSites.map(site => site.slug).sort());
    for (const item of list) {
      assert.match(item.slug, /^exemplo-\d\d$/);
      assert.match(item.nome, /\[x{4,8}\]/);
      assert.ok(item.cidade.length > 0);
      assert.ok(item.venda + item.locacao + item.temporada >= 3);
      assert.match(item.foto, /^[a-z0-9-]+\.webp$/, 'foto do cartão é um arquivo das imagens do site');
      assert.ok(existsSync(join(dir, item.slug, 'resumo.json')));
    }
    const first = exampleSites[0];
    assert.equal(list[0].nome, first.draft.brand.name);
    assert.equal(list[0].venda, first.draft.properties.filter(p => p.finalidade === 'venda').length);
  } finally { done(); }
});

test('a lista de exemplos não inclui vitrines de clientes e se esvazia ao remover os exemplos', () => {
  const { dir, root, done } = sandbox();
  try {
    publish('loja-real', draft, { root });
    publish('exemplo-01', draft, { root, example: true });
    assert.deepEqual(examplesOf(dir).map(item => item.slug), ['exemplo-01']);
    assert.ok(!existsSync(join(dir, 'loja-real/resumo.json')), 'vitrine de cliente não tem resumo de exemplo');
    removeExamples(root);
    assert.deepEqual(examplesOf(dir), []);
    assert.ok(existsSync(join(dir, 'loja-real/index.html')));
  } finally { done(); }
});

test('--check recria a lista de exemplos se ela sumir e não a regrava sem mudança', () => {
  const { dir, root, done } = sandbox();
  const log = console.log;
  try {
    publish('exemplo-02', draft, { root, example: true });
    rmSync(join(dir, 'piloto-exemplos.json'));
    console.log = () => {};
    run(['--check'], { root });
    console.log = log;
    assert.deepEqual(examplesOf(dir).map(item => item.slug), ['exemplo-02']);
    assert.equal(syncExamplesFile(root), false, 'nada mudou, nada regravado');
  } finally { console.log = log; done(); }
});

test('cada um dos 10 cartões recebe uma capa diferente, tirada do conjunto da própria vitrine', () => {
  const { dir, root, done } = sandbox();
  try {
    publishExampleSites({ root });
    const list = examplesOf(dir);
    assert.equal(new Set(list.map(item => item.foto)).size, 10, 'nenhuma capa repetida');
    for (const item of list) {
      const { fotos } = JSON.parse(readFileSync(join(dir, item.slug, 'resumo.json'), 'utf8'));
      assert.ok(fotos.includes(item.foto), item.slug + ': a capa é uma das fotos da vitrine');
      assert.ok(!('fotos' in item), 'a lista pública não carrega o conjunto inteiro');
    }
  } finally { done(); }
});

test('assignCovers evita repetição quando existe um jeito e repete só quando não há saída', () => {
  // o primeiro item só aceita "a"; o segundo prefere "a" mas pode usar "b": a escolha ingênua repetiria "a"
  assert.deepEqual(assignCovers([{ fotos: ['a'] }, { fotos: ['a', 'b'] }]), ['a', 'b']);
  assert.deepEqual(assignCovers([{ fotos: ['a', 'b'] }, { fotos: ['a'] }]), ['b', 'a']);
  assert.deepEqual(assignCovers([{ fotos: ['a', 'b', 'c'] }, { fotos: ['a', 'b'] }, { fotos: ['a'] }]), ['c', 'b', 'a']);
  assert.deepEqual(assignCovers([{ fotos: ['a'] }, { fotos: ['a'] }]), ['a', 'a'], 'sem alternativa, repete');
  assert.deepEqual(assignCovers([{ fotos: [] }, { fotos: ['x'] }, {}]), ['', 'x', ''], 'sem fotos, capa vazia');
  assert.deepEqual(assignCovers([]), []);
  const items = [{ fotos: ['a', 'b'] }, { fotos: ['b', 'c'] }, { fotos: ['a', 'c'] }];
  assert.deepEqual(assignCovers(items), assignCovers(items), 'resultado estável');
  assert.equal(new Set(assignCovers(items)).size, 3);
});
