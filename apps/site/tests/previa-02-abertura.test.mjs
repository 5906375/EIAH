import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const page = name => readFileSync(new URL('../public/imob/' + name, import.meta.url), 'utf8');
const heroOf = html => html.match(/<figure class="intro-art"><img src="([^"]+)"[^>]*>/)?.[1];

test('a abertura da Prévia 02 usa a imagem própria e a da Prévia 01 continua a maquete', () => {
  assert.equal(heroOf(page('ia-cliente/index.html')), '../assets/previa02-abertura.webp');
  assert.equal(heroOf(page('operacao-eiah/index.html')), '../assets/eiah-imoveis-conceito.webp');
  assert.ok(existsSync(new URL('../public/imob/assets/previa02-abertura.webp', import.meta.url)));
});

test('a imagem da abertura da Prévia 02 tem texto alternativo e dimensões coerentes', () => {
  const html = page('ia-cliente/index.html');
  const tag = html.match(/<figure class="intro-art"><img [^>]*>/)[0];
  assert.match(tag, /width="1024" height="572"/);
  assert.match(tag, /fetchpriority="high"/);
  assert.match(tag, /alt="[^"]{20,}"/, 'alt descritivo');
  assert.ok(!/Maquete/.test(tag), 'o texto alternativo não descreve mais a maquete');
});

test('a prévia da marca do editor da Prévia 02 usa a mesma imagem da abertura', () => {
  const html = page('ia-cliente/personalizar/index.html');
  const art = html.match(/<img class="brand-sample-art" src="([^"]+)"/)?.[1];
  assert.equal(art, '../../assets/previa02-abertura.webp');
  assert.ok(!html.includes('eiah-imoveis-conceito'), 'o editor não usa mais a maquete');
  assert.match(html, /<img id="propertyCoverPreview" class="brand-sample-art"/, 'a capa do imóvel no editor continua dinâmica');
});
