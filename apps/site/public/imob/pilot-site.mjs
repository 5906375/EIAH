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
      ? 'As vagas do piloto estão fechadas por enquanto.'
      : free + (free === 1 ? ' vaga disponível' : ' vagas disponíveis') + ' de ' + limit + ' no piloto.'
  };
}

/** Texto do aviso de privacidade mostrado antes de enviar o cadastro. */
export const pilotPrivacyNotice = 'Ao enviar o cadastro, seu programa de e-mail abre uma mensagem para ' +
  'contato@eiah.ia.br com seu nome, a imobiliária, o e-mail e o endereço desejado. O site não envia nada sozinho: ' +
  'você revisa a mensagem e decide enviar. A EIAH usa esses dados para responder ao seu pedido do piloto ou avisar quando abrirem vagas. ' +
  'Para corrigir ou apagar os dados, escreva para o mesmo endereço.';

export const pilotConsentLabel = 'Li o aviso e autorizo a EIAH a usar estes dados para responder ao meu pedido do piloto ou me avisar quando abrirem vagas.';

export const pilotApplyAction = 'Enviar cadastro para o piloto';
export const pilotWaitlistAction = 'Entrar na lista de espera';
// O cadastro por e-mail não leva o site: a pessoa guarda o arquivo e o envia quando abrirem vagas.
export const pilotWaitlistDraftNote = 'Depois de importar a personalização, baixe o rascunho em "Publicação gratuita" e guarde o arquivo: ' +
  'quando abrirem vagas, a equipe da EIAH avisa e você o envia por e-mail.';
export const pilotWaitlistFileNote = 'As vagas estão fechadas por enquanto. Baixe o rascunho e guarde o arquivo: ' +
  'quando abrirem vagas, a equipe da EIAH avisa e você o envia por e-mail.';
export const pilotWaitlistLead = 'As vagas gratuitas do piloto estão fechadas por enquanto, até o produto ficar pronto. ' +
  'Prepare a sua vitrine e entre na lista de espera: a equipe da EIAH avisa quando abrirem novas vagas.';

/**
 * Link mailto do cadastro no piloto (ou da lista de espera, com { waitlist: true }).
 * Devolve '' enquanto faltar dado, endereço válido ou consentimento.
 */
export function pilotApplicationHref({ name, business, email, slug } = {}, consent = false, { waitlist = false } = {}) {
  if (!consent || !name || !business || !email || slugProblem(slug)) return '';
  return eiahContactHref({
    subject: waitlist ? 'Lista de espera do piloto de vitrines gratuitas IMOB' : 'Piloto de vitrines gratuitas IMOB',
    lines: [
      waitlist ? 'Quero entrar na lista de espera do piloto de vitrines gratuitas IMOB.' : 'Quero participar do piloto de vitrines gratuitas IMOB.',
      '',
      'Nome: ' + name,
      'Imobiliária: ' + business,
      'E-mail: ' + email,
      'Endereço desejado: ' + slugAddress(slug),
      ...(waitlist ? ['Vou enviar o rascunho da minha vitrine (arquivo vitrine-imob.json) quando abrirem vagas.'] : []),
      '',
      waitlist
        ? 'Autorizo a EIAH a usar estes dados para me avisar quando o piloto abrir novas vagas.'
        : 'Autorizo a EIAH a usar estes dados para responder a este pedido do piloto.'
    ]
  });
}
