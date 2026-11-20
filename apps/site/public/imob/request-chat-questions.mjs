export const goals = {
  comprar: 'Comprar um imóvel',
  alugar: 'Procurar imóvel para alugar',
  temporada: 'Procurar imóvel para temporada',
  cadastrar: 'Anunciar meu imóvel',
  negociacao: 'Tirar dúvida sobre uma negociação'
};

export const detailsByGoal = {
  comprar: ['region', 'type', 'bedrooms', 'budget', 'intent', 'notes'],
  alugar: ['region', 'type', 'bedrooms', 'budget', 'budgetKind', 'moveBy', 'notes'],
  temporada: ['region', 'arrival', 'departure', 'guests', 'type', 'bedrooms', 'budget', 'notes'],
  cadastrar: ['purpose', 'listingTitle', 'region', 'type', 'bedrooms', 'budget', 'listingPhotos', 'listingAvailability', 'notes'],
  negociacao: ['dealReference', 'notes']
};

const choices = (...labels) => labels.map(label => [label, label]);
export const questions = {
  opening: { text: 'Olá! Conte o que você precisa. Pode escrever ou gravar um áudio.', label: 'Pedido inicial' },
  propertyOpening: { text: 'Olá! O que você gostaria de saber sobre este imóvel? Pode escrever ou gravar um áudio.', label: 'Pedido inicial' },
  goal: { text: 'Qual é o objetivo do seu pedido?', options: Object.entries(goals) },
  clarify: {
    text: 'Você está procurando um imóvel para alugar ou quer anunciar um imóvel para locação?',
    options: [['alugar', 'Estou procurando'], ['cadastrar', 'Quero anunciar'], ['outro', 'Outro objetivo']]
  },
  region: { text: 'Em qual cidade ou bairro?', label: 'Cidade ou bairro' },
  type: { text: 'Que tipo de imóvel?', label: 'Tipo', optional: true, options: choices('Apartamento', 'Casa', 'Kitnet / studio', 'Comercial', 'Terreno') },
  bedrooms: { text: 'Quantos quartos?', label: 'Quartos', optional: true, options: choices('1', '2', '3 ou mais', 'Não se aplica') },
  budget: { text: 'Qual é a faixa de valor?', label: 'Faixa de valor', optional: true },
  intent: { text: 'Você pretende morar ou investir?', label: 'Intenção', optional: true, options: choices('Morar', 'Investir', 'Ainda estou avaliando') },
  budgetKind: {
    text: 'O valor mensal inclui condomínio e outros encargos?', label: 'Composição do orçamento', optional: true,
    options: choices('Total mensal, incluindo encargos', 'Somente aluguel base', 'Preciso esclarecer com a equipe')
  },
  moveBy: { text: 'Quando pretende se mudar?', label: 'Prazo de mudança', optional: true },
  arrival: { text: 'Qual é a data de entrada? Se escrever, use DD/MM/AAAA.', label: 'Entrada', date: true },
  departure: { text: 'Qual é a data de saída? Se escrever, use DD/MM/AAAA.', label: 'Saída', date: true },
  guests: { text: 'Para quantos hóspedes?', label: 'Hóspedes', count: true },
  purpose: { text: 'Você quer anunciar para venda, locação residencial ou temporada?', label: 'Finalidade do anúncio',
    options: [['venda', 'Venda'], ['locacao', 'Locação residencial'], ['temporada', 'Temporada']] },
  listingTitle: { text: 'Como você identifica o imóvel que quer anunciar?', label: 'Imóvel', optional: true },
  listingPhotos: { text: 'Você já tem fotos do imóvel?', label: 'Fotos', optional: true, options: choices('Já tenho fotos', 'Ainda preciso de fotos') },
  listingAvailability: { text: 'A partir de quando o imóvel estará disponível? Se escrever, use DD/MM/AAAA.', label: 'Disponível a partir de', optional: true, date: true },
  dealReference: { text: 'Qual é o imóvel ou a proposta de referência?', label: 'Negociação', optional: true },
  notes: { text: 'Quer acrescentar alguma preferência ou dúvida?', label: 'Preferências ou dúvidas', optional: true }
};

const aliases = {
  comprar: 'comprar', compra: 'comprar',
  alugar: 'alugar', aluguel: 'alugar', locar: 'alugar',
  temporada: 'temporada', anunciar: 'cadastrar', negociacao: 'negociacao',
  'estou procurando': 'alugar', procurando: 'alugar', 'quero anunciar': 'cadastrar',
  'outro objetivo': 'outro', outro: 'outro'
};

export function normalizeReply(text) {
  return text.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
}

export function inferGoal(message) {
  const text = normalizeReply(message);
  if (/\b(anunciar|cadastrar|colocar)\b/.test(text) || /\b(meu|minha)\b.*\b(alugar|locacao)\b/.test(text)) return 'cadastrar';
  if (/\btemporada\b/.test(text)) return 'temporada';
  if (/\b(comprar|compra)\b/.test(text)) return 'comprar';
  if (/\bnegociacao\b/.test(text)) return 'negociacao';
  if (/\b(alugar|locar|locacao|aluguel)\b/.test(text)) {
    return /\b(procuro|procurando|busco|procurar)\b/.test(text) ? 'alugar' : 'clarify';
  }
  return 'goal';
}

export function matchOption(key, options, message) {
  const text = normalizeReply(message);
  const option = options.find(([value, label], index) =>
    text === normalizeReply(value) || text === normalizeReply(label) ||
      ((key === 'goal' || key === 'clarify') && text === String(index + 1))
  );
  if (option) return option;
  if (key === 'goal' || key === 'clarify') {
    const guess = Object.hasOwn(aliases, text) ? aliases[text] : inferGoal(message);
    return options.find(([value]) => value === guess);
  }
}

export function normalizedDetail(key, value, inputs) {
  const question = questions[key];
  if (question.count) {
    const match = /^(\d{1,3})(?:\s+h[oó]spedes?)?$/i.exec(value);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 100) return null;
    return String(Number(match[1]));
  }
  if (question.date) {
    const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    const iso = local
      ? [local[3], local[2].padStart(2, '0'), local[1].padStart(2, '0')].join('-')
      : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const date = new Date(iso);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) return null;
    if (key === 'departure' && inputs.arrival && iso <= inputs.arrival) return null;
    return iso;
  }
  return value;
}
