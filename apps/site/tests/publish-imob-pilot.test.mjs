import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { publish, renderSite, run } from '../scripts/publish-imob-pilot.mjs';

const brand = { name: 'Horizonte Imóveis', introduction: 'Imóveis na praia.', accent: '#087566' };
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32, 7)]);
const photo = 'data:image/webp;base64,' + webp.toString('base64');
const house = (extra = {}) => ({
  titulo: 'Casa na Meia Praia', finalidade: 'locacao', preco: 3200, bairro: 'Meia Praia', cidade: 'Itapema',
  descricao: 'Casa de exemplo.', tipo: 'Casa', area: 90, quartos: 2, suites: 1, banheiros: 0, vagas: 1,
  condominio: null, iptu: null, caracteristicas: ['Varanda', 'Piscina'], fotos: [], ...extra
});

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'imob-piloto-'));
  const root = pathToFileURL(dir + '/');
  return { dir, root, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('a vitrine mostra os dados cadastrados e não inventa o que falta', () => {
  const { html } = renderSite({ brand, properties: [house()] }, 'horizonte');
  for (const text of ['Casa', '90 m²', '2 quartos', '1 suíte', '1 vaga', 'Varanda, Piscina', 'Condomínio e IPTU não informados']) {
    assert.ok(html.includes(text), 'faltou: ' + text);
  }
  assert.ok(!html.includes('banheiro'), 'zero banheiros não deve aparecer');
  assert.ok(!html.includes('Total mensal'), 'sem encargos conhecidos não há total');
  assert.ok(!/R\$\s?0,00/.test(html), 'valor não informado nunca vira R$ 0');
});

test('locação com encargos informados mostra condomínio, IPTU e total', () => {
  const { html } = renderSite({ brand, properties: [house({ condominio: 600, iptu: 150, origem: 'informed_by_manager' })] }, 'horizonte');
  assert.match(html, /Condomínio R\$\s?600,00/);
  assert.match(html, /IPTU R\$\s?150,00/);
  assert.match(html, /Total mensal R\$\s?3\.950,00/);
  assert.ok(!html.includes('não informado'));
});

test('venda não mostra encargos e temporada mostra hóspedes e limpeza', () => {
  const sale = renderSite({ brand, properties: [house({ finalidade: 'venda', preco: 900000, condominio: 600 })] }, 'a').html;
  assert.ok(!/Condomínio/.test(sale) && !/IPTU/.test(sale));
  const stay = renderSite({ brand, properties: [house({ finalidade: 'temporada', preco: 400, stay: { maxGuests: 4, cleaning: 120, blocked: [] } })] }, 'a').html;
  assert.match(stay, /até 4 hóspedes/);
  assert.match(stay, /Taxa de limpeza R\$\s?120,00/);
  assert.match(stay, /por diária/);
});

test('texto hostil é escapado em todos os campos novos', () => {
  const evil = '<script>alert(1)</script>';
  const { html } = renderSite({ brand, properties: [house({ tipo: evil, caracteristicas: [evil], titulo: 'ok' })] }, 'a');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('fotos enviadas viram arquivos e a página não carrega base64', () => {
  const { html, files } = renderSite({ brand: { ...brand, logo: photo }, properties: [house({ fotos: [photo, './assets/casa-01.webp'] })] }, 'horizonte');
  assert.ok(!html.includes('data:image'), 'sem base64 na página');
  assert.deepEqual([...files.keys()].sort(), ['fotos/imovel-1-1.webp', 'fotos/logo.webp']);
  assert.ok(html.includes('/imob/horizonte/fotos/imovel-1-1.webp'));
  assert.ok(html.includes('/imob/assets/casa-01.webp'));
  assert.ok(files.get('fotos/logo.webp').equals(webp));
});

test('imagem cujo conteúdo não confere com o tipo é descartada', () => {
  const fake = 'data:image/png;base64,' + Buffer.from('isto não é uma imagem').toString('base64');
  const { html, files } = renderSite({ brand, properties: [house({ fotos: [fake, 'data:image/svg+xml;base64,PHN2Zz4='] })] }, 'a');
  assert.equal(files.size, 0);
  assert.ok(!html.includes('<img'));
});

test('publicar grava página e fotos e a atualização troca tudo sem deixar sobras', () => {
  const { dir, root, done } = sandbox();
  try {
    const result = publish('horizonte', { brand, properties: [house({ fotos: [photo, photo.replace('B', 'C')] })] }, { root });
    assert.equal(result.url, 'https://eiah.ia.br/imob/horizonte/');
    assert.ok(existsSync(join(dir, 'horizonte/index.html')));
    assert.ok(readdirSync(join(dir, 'horizonte/fotos')).length >= 1);
    publish('horizonte', { brand, properties: [house({ titulo: 'Casa nova' })] }, { root });
    assert.ok(readFileSync(join(dir, 'horizonte/index.html'), 'utf8').includes('Casa nova'));
    assert.ok(!existsSync(join(dir, 'horizonte/fotos')), 'foto antiga removida');
    assert.deepEqual(readdirSync(dir), ['horizonte'], 'nenhuma pasta temporária sobra');
  } finally { done(); }
});

test('rascunho inválido não cria nem altera pasta', () => {
  const { dir, root, done } = sandbox();
  try {
    assert.throws(() => publish('horizonte', { brand, properties: [house({ preco: -1 })] }, { root }), /Confira o título/);
    assert.throws(() => publish('horizonte', { brand, properties: [house({ titulo: '  ' })] }, { root }), /Confira o título/);
    assert.throws(() => publish('horizonte', { brand: {}, properties: [] }, { root }), /rascunho válido/);
    assert.deepEqual(readdirSync(dir), []);
  } finally { done(); }
});

test('limite de 10: a 11ª é recusada, a atualização mantém a vaga e pasta alheia é protegida', () => {
  const { dir, root, done } = sandbox();
  try {
    for (let i = 1; i <= 10; i += 1) publish('loja-' + i, { brand, properties: [] }, { root });
    assert.throws(() => publish('loja-11', { brand, properties: [] }, { root }), /10 vagas/);
    publish('loja-3', { brand: { ...brand, name: 'Nova' }, properties: [] }, { root });
    assert.ok(readFileSync(join(dir, 'loja-3/index.html'), 'utf8').includes('Nova'));
    mkdirSync(join(dir, 'assets-alheios'));
    writeFileSync(join(dir, 'assets-alheios/index.html'), '<html>outro conteúdo</html>');
    assert.throws(() => publish('assets-alheios', { brand, properties: [] }, { root }), /reservado/);
    assert.throws(() => publish('Nome Inválido', { brand, properties: [] }, { root }), /letras minúsculas/);
  } finally { done(); }
});

test('--check conta as vitrines e recusa mais de dez pastas', () => {
  const { dir, root, done } = sandbox();
  const log = console.log;
  try {
    const lines = [];
    console.log = line => lines.push(line);
    run(['--check'], { root });
    publish('a', { brand, properties: [] }, { root });
    run(['--check'], { root });
    console.log = log;
    assert.deepEqual(lines, ['Piloto IMOB: 0/10 vitrines.', 'Piloto IMOB: 1/10 vitrines.']);
    for (let i = 0; i < 10; i += 1) {
      mkdirSync(join(dir, 'extra-' + i));
      writeFileSync(join(dir, 'extra-' + i, 'index.html'), '<!doctype html>\n<!-- Vitrine do piloto IMOB -->');
    }
    assert.throws(() => run(['--check'], { root }), /ultrapassou o limite/);
  } finally { console.log = log; done(); }
});

test('uso incorreto e rascunho ilegível dão mensagem clara em português', () => {
  const { dir, root, done } = sandbox();
  try {
    assert.throws(() => run([], { root }), /Uso: node/);
    assert.throws(() => run(['horizonte'], { root }), /Uso: node/);
    writeFileSync(join(dir, 'ruim.json'), '{ não é json');
    assert.throws(() => run(['horizonte', join(dir, 'ruim.json')], { root }), /vitrine-imob\.json/);
    assert.ok(!existsSync(join(dir, 'horizonte')));
  } finally { done(); }
});
