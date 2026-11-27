import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EIAH_CONTACT_EMAIL, eiahContactHref, imobInterestHref, interestOrigins } from '../public/imob/contact-eiah.mjs';

const parts = href => {
  const url = new URL(href);
  return { protocol: url.protocol, to: url.pathname, subject: url.searchParams.get('subject'), body: url.searchParams.get('body') };
};

test('o link é um mailto para o endereço da EIAH, com assunto e corpo codificados', () => {
  const link = parts(eiahContactHref({ subject: 'Olá, tudo bem?', lines: ['Linha 1', 'Linha 2 ✓'] }));
  assert.equal(link.protocol, 'mailto:');
  assert.equal(link.to, EIAH_CONTACT_EMAIL);
  assert.equal(link.subject, 'Olá, tudo bem?');
  assert.equal(link.body, 'Linha 1\nLinha 2 ✓');
});

test('o href não tem espaço, quebra de linha nem aspas sem codificar', () => {
  const href = imobInterestHref('temporada');
  assert.ok(!/[\s"<>]/.test(href), href);
  assert.ok(href.startsWith('mailto:contato@eiah.ia.br?subject='));
});

test('assunto com quebra de linha não injeta cabeçalhos', () => {
  const { subject } = parts(eiahContactHref({ subject: 'Oi\r\nBcc: alguem@exemplo.com\nX: y' }));
  assert.ok(!/[\r\n]/.test(subject));
  assert.equal(subject, 'Oi Bcc: alguem@exemplo.com X: y', 'vira texto de uma linha, sem cabeçalho novo');
});

test('assunto vazio ou inválido usa o texto padrão e há limite de tamanho', () => {
  assert.equal(parts(eiahContactHref({ subject: '   ' })).subject, 'Contato pelo site IMOB');
  assert.equal(parts(eiahContactHref()).subject, 'Contato pelo site IMOB');
  assert.equal(parts(eiahContactHref({ subject: 'a'.repeat(500) })).subject.length, 120);
  assert.equal(parts(eiahContactHref({ lines: ['b'.repeat(5000)] })).body.length, 1500);
});

test('o corpo mantém a quebra de linha, mas descarta caracteres de controle', () => {
  const { body } = parts(eiahContactHref({ lines: ['a\u0000b\u0007c', 'd\re'] }));
  assert.equal(body, 'abc\nde');
});

test('a mensagem de interesse é estática e traz campos em branco para a pessoa preencher', () => {
  const { subject, body } = parts(imobInterestHref('temporada'));
  assert.equal(subject, 'Quero conhecer o IMOB da EIAH');
  assert.match(body, /demonstração de pedido de temporada/);
  for (const field of ['Nome:', 'Imobiliária:', 'Melhor horário para contato:']) {
    assert.ok(body.split('\n').includes(field), field + ' deve estar em branco');
  }
});

test('origem desconhecida ou hostil cai no texto genérico e não entra na mensagem', () => {
  const hostile = '<script>alert(1)</script>';
  const { body } = parts(imobInterestHref(hostile));
  assert.match(body, /a demonstração do IMOB/);
  assert.ok(!body.includes('script'));
  assert.ok(!(hostile in interestOrigins));
});

test('a página de acompanhamento do pedido tem o botão de contato ligado ao módulo', () => {
  const page = readFileSync(new URL('../public/imob/ia-cliente/temporada/index.html', import.meta.url), 'utf8');
  assert.match(page, /id="contact-eiah"/);
  const script = readFileSync(new URL('../public/imob/seasonal-request.mjs', import.meta.url), 'utf8');
  assert.match(script, /imobInterestHref\('temporada'\)/);
});
