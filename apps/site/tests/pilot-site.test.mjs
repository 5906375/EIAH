import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  PILOT_LIMIT, exampleCards, pilotApplicationHref, pilotApplyAction, pilotConsentLabel, pilotPrivacyNotice, pilotSlots, pilotWaitlistAction, pilotWaitlistDraftNote, pilotWaitlistFileNote, pilotWaitlistLead, reservedSlugs, slugAddress, slugProblem, suggestSlug
} from '../public/imob/pilot-site.mjs';
import { publish, run, syncSlots } from '../scripts/publish-imob-pilot.mjs';

const profile = { name: 'Ana Souza', business: 'Horizonte Imóveis', email: 'ana@horizonte.com.br', slug: 'horizonte-imoveis' };
const draftBrand = { name: 'Horizonte Imóveis' };

test('slugProblem aceita endereços bons e explica os ruins em português', () => {
  for (const slug of ['horizonte', 'horizonte-imoveis', 'casa-123', 'abc']) assert.equal(slugProblem(slug), '', slug);
  for (const slug of ['', 'ab', 'Horizonte', 'com espaço', 'açai-imoveis', '-inicio', 'fim-', 'duplo--hifen', 'a'.repeat(66), undefined, 42]) {
    assert.match(slugProblem(slug), /3 a 65 caracteres/, String(slug));
  }
  for (const slug of ['api', 'admin', 'www', 'legal', 'imob', 'ia-cliente', 'operacao-eiah', 'piloto-vagas']) {
    assert.ok(reservedSlugs.includes(slug), slug);
    assert.match(slugProblem(slug), /reservado no IMOB/);
  }
});

test('suggestSlug tira acentos, símbolos e hífens soltos', () => {
  assert.equal(suggestSlug('Imobiliária Exemplo'), 'imobiliaria-exemplo');
  assert.equal(suggestSlug('  Horizonte & Filhos, Ltda. '), 'horizonte-filhos-ltda');
  assert.equal(suggestSlug('Çãõ ÉÊ'), 'cao-ee');
  assert.equal(suggestSlug('!!!'), '');
  assert.equal(suggestSlug(undefined), '');
  assert.ok(suggestSlug('a'.repeat(100)).length <= 40);
  assert.equal(slugProblem(suggestSlug('Imobiliária Exemplo')), '');
});

test('o e-mail do cadastro leva o endereço desejado e a autorização, só com consentimento', () => {
  assert.equal(pilotApplicationHref(profile, false), '', 'sem consentimento não há link');
  assert.equal(pilotApplicationHref(profile), '');
  assert.equal(pilotApplicationHref({ ...profile, slug: '' }, true), '', 'sem endereço não há link');
  assert.equal(pilotApplicationHref({ ...profile, slug: 'api' }, true), '', 'endereço reservado não gera link');
  assert.equal(pilotApplicationHref({ ...profile, email: '' }, true), '');
  const href = pilotApplicationHref(profile, true);
  assert.ok(href.startsWith('mailto:contato@eiah.ia.br?subject='));
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.match(body, /Nome: Ana Souza/);
  assert.match(body, /Imobiliária: Horizonte Imóveis/);
  assert.match(body, /E-mail: ana@horizonte\.com\.br/);
  assert.match(body, /Endereço desejado: https:\/\/eiah\.ia\.br\/imob\/horizonte-imoveis\//);
  assert.match(body, /Autorizo a EIAH/);
  assert.equal(slugAddress('horizonte'), 'https://eiah.ia.br/imob/horizonte/');
});

test('quebras de linha no nome não injetam cabeçalhos nem linhas extras no e-mail', () => {
  const href = pilotApplicationHref({ ...profile, name: 'Ana\r\nBcc: alguem@example.com' }, true);
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.ok(!body.includes('\r'));
  assert.equal(href.split('?')[1].split('&')[0], 'subject=' + encodeURIComponent('Piloto de vitrines gratuitas IMOB'));
});

test('o aviso de privacidade diz o que é enviado e que o site não envia nada sozinho', () => {
  for (const part of ['contato@eiah.ia.br', 'nome', 'imobiliária', 'e-mail', 'endereço desejado', 'não envia nada sozinho', 'corrigir ou apagar']) {
    assert.ok(pilotPrivacyNotice.toLowerCase().includes(part.toLowerCase()), 'faltou: ' + part);
  }
  assert.match(pilotConsentLabel, /autorizo a EIAH/);
});

test('pilotSlots mostra vagas livres, vagas esgotadas e ignora dado inválido', () => {
  assert.deepEqual(pilotSlots({ limit: 10, used: 3 }), { known: true, limit: 10, used: 3, free: 7, full: false, text: '7 vagas disponíveis de 10 no piloto.' });
  assert.equal(pilotSlots({ limit: 10, used: 9 }).text, '1 vaga disponível de 10 no piloto.');
  assert.equal(pilotSlots({ limit: 10, used: 10 }).text, 'As vagas do piloto estão fechadas por enquanto.');
  assert.equal(pilotSlots({ limit: 10, used: 10 }).full, true);
  assert.equal(pilotSlots({ limit: 10, used: 12 }).free, 0);
  for (const bad of [null, undefined, {}, { limit: 'dez', used: 1 }, { limit: 10, used: -1 }, { limit: 0, used: 0 }, { limit: 10.5, used: 1 }, 'texto']) {
    const slots = pilotSlots(bad);
    assert.equal(slots.known, false, JSON.stringify(bad));
    assert.equal(slots.text, '');
    assert.equal(slots.full, false, 'dado desconhecido não bloqueia ninguém');
  }
  assert.equal(PILOT_LIMIT, 10);
});

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'imob-vagas-'));
  return { dir, root: pathToFileURL(dir + '/'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const slotsOf = dir => JSON.parse(readFileSync(join(dir, 'piloto-vagas.json'), 'utf8'));

test('o arquivo de vagas acompanha as vitrines publicadas e o --check o corrige', () => {
  const { dir, root, done } = sandbox();
  const log = console.log;
  try {
    assert.equal(syncSlots(root), true, 'cria o arquivo na primeira vez');
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 0 });
    assert.equal(syncSlots(root), false, 'não regrava quando nada mudou');
    publish('horizonte', { brand: draftBrand, properties: [] }, { root });
    publish('praia-mar', { brand: draftBrand, properties: [] }, { root });
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 2 });
    publish('praia-mar', { brand: { name: 'Praia Mar Nova' }, properties: [] }, { root });
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 2 }, 'atualizar não gasta vaga');
    // alguém apagou uma pasta à mão: o --check, que roda antes de todo deploy, sincroniza
    rmSync(join(dir, 'horizonte'), { recursive: true });
    const lines = [];
    console.log = line => lines.push(line);
    run(['--check'], { root });
    console.log = log;
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 1 });
    assert.match(lines[0], /1\/10 vitrines\. Arquivo piloto-vagas\.json atualizado\./);
  } finally { console.log = log; done(); }
});

test('pastas temporárias e pastas sem a marca do piloto não contam como vaga', () => {
  const { dir, root, done } = sandbox();
  try {
    mkdirSync(join(dir, '.piloto-123'));
    writeFileSync(join(dir, '.piloto-123/index.html'), '<!doctype html>\n<!-- Vitrine do piloto IMOB -->');
    mkdirSync(join(dir, 'ia-cliente'));
    writeFileSync(join(dir, 'ia-cliente/index.html'), '<html>página do produto</html>');
    syncSlots(root);
    assert.deepEqual(slotsOf(dir), { limit: 10, used: 0 });
  } finally { done(); }
});

test('com 11 pastas o --check recusa e não grava um número impossível', () => {
  const { dir, root, done } = sandbox();
  try {
    for (let i = 0; i < 11; i += 1) {
      mkdirSync(join(dir, 'loja-' + i));
      writeFileSync(join(dir, 'loja-' + i, 'index.html'), '<!doctype html>\n<!-- Vitrine do piloto IMOB -->');
    }
    assert.throws(() => run(['--check'], { root }), /ultrapassou o limite/);
    assert.throws(() => readFileSync(join(dir, 'piloto-vagas.json')), /ENOENT/);
  } finally { done(); }
});

test('a lista de espera usa o mesmo cadastro, com assunto e autorização próprios', () => {
  assert.equal(pilotApplicationHref(profile, false, { waitlist: true }), '', 'sem consentimento não há link');
  const href = pilotApplicationHref(profile, true, { waitlist: true });
  assert.equal(new URL(href).searchParams.get('subject'), 'Lista de espera do piloto de vitrines gratuitas IMOB');
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.match(body, /Quero entrar na lista de espera/);
  assert.match(body, /Autorizo a EIAH a usar estes dados para me avisar quando o piloto abrir novas vagas/);
  assert.match(body, /Vou enviar o rascunho da minha vitrine \(arquivo vitrine-imob\.json\) quando abrirem vagas\./);
  assert.ok(!/Vou enviar o rascunho/.test(decodeURIComponent(pilotApplicationHref(profile, true).split('&body=')[1])), 'o cadastro comum não leva essa linha');
  assert.match(body, /Endereço desejado: https:\/\/eiah\.ia\.br\/imob\/horizonte-imoveis\//);
  assert.equal(new URL(pilotApplicationHref(profile, true)).searchParams.get('subject'), 'Piloto de vitrines gratuitas IMOB');
});

test('os textos da lista de espera não prometem o que o produto ainda não entrega', () => {
  assert.match(pilotWaitlistLead, /fechadas por enquanto/);
  assert.match(pilotWaitlistLead, /lista de espera/);
  assert.ok(!/garant|imediat|já pode publicar/i.test(pilotWaitlistLead));
  assert.equal(pilotWaitlistAction, 'Entrar na lista de espera');
  for (const note of [pilotWaitlistDraftNote, pilotWaitlistFileNote]) {
    assert.match(note, /baixe o rascunho/i);
    assert.match(note, /guarde o arquivo/);
    assert.match(note, /quando abrirem vagas/);
    assert.match(note, /e-mail/);
  }
  assert.match(pilotWaitlistDraftNote, /importar a personalização/, 'o botão de baixar só aparece depois de importar');
  assert.equal(pilotApplyAction, 'Enviar cadastro para o piloto');
});

test('exampleCards monta os cartões a partir da lista e descarta entradas inseguras ou quebradas', () => {
  const good = { slug: 'exemplo-01', nome: 'Recanto das [xxxxxxx] Imóveis', cidade: 'Itapema', venda: 2, locacao: 1, temporada: 0, foto: 'vitrine-casa.webp' };
  const [card] = exampleCards({ vitrines: [good] });
  assert.deepEqual(card, { slug: 'exemplo-01', name: 'Recanto das [xxxxxxx] Imóveis', city: 'Itapema', photo: 'vitrine-casa.webp', total: 3, summary: '3 imóveis: 2 à venda, 1 para alugar' });
  assert.equal(exampleCards({ vitrines: [{ ...good, venda: 1, locacao: 0 }] })[0].summary, '1 imóvel: 1 à venda');
  assert.equal(exampleCards({ vitrines: [{ ...good, venda: 0, locacao: 0, temporada: 2 }] })[0].summary, '2 imóveis: 2 de temporada');
  assert.equal(exampleCards({ vitrines: [{ ...good, venda: 0, locacao: 0 }] })[0].summary, 'Sem imóveis');
  const hostile = [
    { ...good, slug: '../admin' }, { ...good, slug: 'exemplo-1' }, { ...good, slug: 'exemplo-01/../x' }, { ...good, slug: 'javascript:alert(1)' },
    { ...good, nome: '' }, { ...good, nome: 42 }, { ...good, nome: 'x'.repeat(121) }, null, 'texto', 7
  ];
  assert.deepEqual(exampleCards({ vitrines: hostile }), []);
  assert.equal(exampleCards({ vitrines: [{ ...good, foto: '../../segredo.webp' }] })[0].photo, '', 'foto fora do padrão é descartada');
  assert.equal(exampleCards({ vitrines: [{ ...good, foto: 'http://x/y.webp' }] })[0].photo, '');
  const odd = exampleCards({ vitrines: [{ ...good, venda: -1, locacao: 'dois', temporada: 1000 }] })[0];
  assert.equal(odd.total, 0, 'contagem inválida vira zero');
  for (const bad of [null, undefined, {}, { vitrines: 'x' }, [], 'texto']) assert.deepEqual(exampleCards(bad), []);
  assert.equal(exampleCards({ vitrines: Array.from({ length: 30 }, (_, i) => ({ ...good, slug: 'exemplo-' + String(i).padStart(2, '0') })) }).length, 10, 'no máximo 10 cartões');
});
