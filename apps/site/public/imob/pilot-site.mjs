// Regras do piloto de vitrines gratuitas, usadas pela tela "Criar meu site" e pelo gerador de páginas.
// Funções puras, sem DOM e sem rede: o pedido é só um link mailto, nada é enviado pelo site.
import { eiahContactHref } from './contact-eiah.mjs';

export const PILOT_LIMIT = 10;
export const PILOT_ORIGIN = 'https://eiah.ia.br/imob/';
export const slugFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 65;

// Endereços que o piloto nunca entrega a uma imobiliária: páginas e rotas do próprio IMOB e nomes de serviço.
export const reservedSlugs = Object.freeze([
  'admin', 'api', 'app', 'assets', 'catalog', 'criar-site', 'eiah', 'equipe', 'ia-cliente', 'imob', 'index',
  'legal', 'login', 'operacao-eiah', 'personalizar', 'piloto-vagas', 'privacidade', 'status', 'suporte',
  'temporada', 'termos', 'visual', 'www'
]);

/** Mensagem em português quando o endereço não serve; texto vazio quando serve. */
export function slugProblem(slug) {
  if (typeof slug !== 'string' || !slugFormat.test(slug) || slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return 'Use de ' + SLUG_MIN + ' a ' + SLUG_MAX + ' caracteres, com letras minúsculas, números e hífens, sem espaços nem acentos.';
  }
  if (reservedSlugs.includes(slug)) return 'O endereço "' + slug + '" é reservado no IMOB. Escolha outro nome.';
  return '';
}

/** Sugere um endereço a partir do nome da imobiliária: sem acentos, minúsculo, com hífens. */
export function suggestSlug(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

export const slugAddress = slug => PILOT_ORIGIN + slug + '/';

/** Estado das vagas a partir do arquivo piloto-vagas.json. Dado fora do esperado vira "desconhecido". */
export function pilotSlots(data) {
  const limit = Number.isInteger(data?.limit) && data.limit > 0 ? data.limit : null;
  const used = Number.isInteger(data?.used) && data.used >= 0 ? data.used : null;
  if (limit === null || used === null) return { known: false, limit: PILOT_LIMIT, used: null, free: null, full: false, text: '' };
  const free = Math.max(0, limit - used);
  return {
    known: true, limit, used, free, full: free === 0,
    text: free === 0
      ? 'As ' + limit + ' vagas do piloto já foram preenchidas.'
      : free + (free === 1 ? ' vaga disponível' : ' vagas disponíveis') + ' de ' + limit + ' no piloto.'
  };
}

/** Texto do aviso de privacidade mostrado antes de enviar o cadastro. */
export const pilotPrivacyNotice = 'Ao enviar o cadastro, seu programa de e-mail abre uma mensagem para ' +
  'contato@eiah.ia.br com seu nome, a imobiliária, o e-mail e o endereço desejado. O site não envia nada sozinho: ' +
  'você revisa a mensagem e decide enviar. A EIAH usa esses dados para responder ao seu pedido do piloto. ' +
  'Para corrigir ou apagar os dados, escreva para o mesmo endereço.';

export const pilotConsentLabel = 'Li o aviso e autorizo a EIAH a usar estes dados para responder ao meu pedido do piloto.';

/** Link mailto do cadastro no piloto. Devolve '' enquanto faltar dado, endereço válido ou consentimento. */
export function pilotApplicationHref({ name, business, email, slug } = {}, consent = false) {
  if (!consent || !name || !business || !email || slugProblem(slug)) return '';
  return eiahContactHref({
    subject: 'Piloto de vitrines gratuitas IMOB',
    lines: [
      'Quero participar do piloto de vitrines gratuitas IMOB.',
      '',
      'Nome: ' + name,
      'Imobiliária: ' + business,
      'E-mail: ' + email,
      'Endereço desejado: ' + slugAddress(slug),
      '',
      'Autorizo a EIAH a usar estes dados para responder a este pedido do piloto.'
    ]
  });
}
