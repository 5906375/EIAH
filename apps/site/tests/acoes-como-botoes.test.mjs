import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const base = new URL('../public/imob/', import.meta.url);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const url = new URL(name + (statSync(new URL(name, dir)).isDirectory() ? '/' : ''), dir);
    if (name === 'assets' || name.startsWith('exemplo-')) continue;
    if (statSync(url).isDirectory()) walk(url);
    else if (/\.(html|mjs)$/.test(name)) files.push(url);
  }
})(base);

// Links de navegação ficam no cabeçalho (<header class="topbar">); toda ação na página é botão (btn).
const outsideHeader = html => html.replace(/<header[\s\S]*?<\/header>/g, '');

test('nenhuma ação no conteúdo das páginas é link solto: só o cabeçalho usa quiet-link', () => {
  const found = [];
  for (const url of files) {
    const text = readFileSync(url, 'utf8');
    const content = url.pathname.endsWith('.html') ? outsideHeader(text) : text;
    if (content.includes('quiet-link')) found.push(url.pathname.split('/imob/')[1]);
  }
  assert.deepEqual(found, [], 'links soltos fora do cabeçalho: ' + found.join(', '));
});

test('os links de navegação do cabeçalho continuam links, para o layout do celular', () => {
  const headers = files.filter(url => url.pathname.endsWith('.html'))
    .flatMap(url => (readFileSync(url, 'utf8').match(/<header[\s\S]*?<\/header>/g) ?? []).map(header => ({ url, header })));
  const withLink = headers.filter(({ header }) => header.includes('quiet-link'));
  assert.ok(withLink.length >= 5, 'cabeçalhos com link de navegação: ' + withLink.length);
  for (const { header } of withLink) assert.ok(!/class="btn/.test(header.match(/<a class="quiet-link"[^>]*>/)?.[0] ?? ''));
});

test('os botões de ação mantêm destino, texto e identificadores que o código usa', () => {
  const page = name => readFileSync(new URL(name, base), 'utf8');
  assert.match(page('ia-cliente/criar-site/index.html'), /<a class="btn btn-ghost" href="..\/personalizar\/">Revisar no editor<\/a>/);
  assert.match(page('ia-cliente/criar-site/index.html'), /<a class="btn btn-ghost" href="..\/personalizar\/#editorContact">Editar dados do rodapé<\/a>/);
  assert.match(page('ia-cliente/temporada/index.html'), /<a class="btn btn-ghost" id="tracking-link" href=".\/">Link deste pedido<\/a>/);
  assert.match(page('index.html'), /<a class="btn btn-ghost" id="link-exemplos"[^>]* hidden>Ver vitrines de exemplo<\/a>/);
  assert.match(readFileSync(new URL('demo-interest.mjs', base), 'utf8'), /<a class="btn btn-ghost" href="#vitrine" id="interest-back">/);
  assert.match(readFileSync(new URL('demo-guide.mjs', base), 'utf8'), /element\('a', label, 'btn btn-ghost'\)/);
});
