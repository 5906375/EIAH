// Contato com a EIAH a partir da vitrine de demonstração. Funções puras, sem DOM e sem rede.
// Só monta um link mailto: nada é enviado pelo site. A mensagem é estática e não leva dados do pedido
// de demonstração (que são fictícios e ficam no navegador); quem escreve decide o que informar.

export const EIAH_CONTACT_EMAIL = 'contato@eiah.ia.br';

const MAX_SUBJECT = 120;
const MAX_BODY = 1500;
// Caracteres de controle (inclui CR e LF) nunca entram no assunto: evitam quebra de cabeçalho.
const controlCharacters = /[\u0000-\u001f\u007f]/g;
// No corpo, só a quebra de linha (LF) é permitida.
const bodyControlCharacters = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/** Monta o link mailto para a EIAH. Assunto e corpo são saneados e limitados. */
export function eiahContactHref({ subject, lines = [] } = {}) {
  const cleanSubject = String(subject ?? '').replace(controlCharacters, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT)
    || 'Contato pelo site IMOB';
  const body = lines.map(line => String(line ?? '').replace(bodyControlCharacters, '')).join('\n').slice(0, MAX_BODY);
  return 'mailto:' + EIAH_CONTACT_EMAIL + '?subject=' + encodeURIComponent(cleanSubject) + '&body=' + encodeURIComponent(body);
}

// Origem conhecida do pedido de contato. Só estas opções existem: não se aceita texto livre vindo da página.
export const interestOrigins = Object.freeze({
  temporada: 'a demonstração de pedido de temporada do IMOB',
});

/** Link de interesse em usar o IMOB na própria imobiliária. Origem desconhecida cai no texto genérico. */
export function imobInterestHref(origin) {
  const source = interestOrigins[origin] ?? 'a demonstração do IMOB';
  return eiahContactHref({
    subject: 'Quero conhecer o IMOB da EIAH',
    lines: [
      'Olá! Vi ' + source + ' e gostaria de conversar sobre usar o IMOB na minha imobiliária.',
      '',
      'Nome:',
      'Imobiliária:',
      'Melhor horário para contato:',
    ],
  });
}
