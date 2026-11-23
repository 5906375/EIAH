// Cadastro guiado de imóvel da vitrine: campos, validação e estados. Funções puras, sem DOM e sem rede.
// Não usa IA: o site não tem IA conectada. A interpretação de texto livre é uma fase futura, pelo engine.
//
// Os limites numéricos seguem os do cadastro guiado do backend (contagens, área). Eles não são gerados a
// partir do backend: o contrato guiado ainda não está na main. Testes comparam estes limites com o
// client-properties.mjs e com o HTML, para evitar divergência silenciosa dentro do site.
import { parseBrNumber } from './financing.mjs';
import { money } from './stay-visual.mjs';

export const PURPOSES = Object.freeze({ venda: 'Venda', locacao: 'Aluguel anual', temporada: 'Temporada' });

export const GUIDED_LIMITS = Object.freeze({
  text: Object.freeze({ titulo: 100, tipo: 40, cidade: 60, bairro: 60, caracteristicas: 300, descricao: 800 }),
  counts: Object.freeze({ quartos: 50, suites: 50, banheiros: 50, vagas: 100 }),
  areaMax: 100000,
  guests: Object.freeze({ min: 1, max: 12 }),
  amountMax: 1_000_000_000,
});

const text = (name, label, question, extra = {}) =>
  Object.freeze({ name, kind: 'text', label, question, required: true, max: GUIDED_LIMITS.text[name], ...extra });
const count = (name, label, question) =>
  Object.freeze({ name, kind: 'count', label, question, required: false, min: 0, max: GUIDED_LIMITS.counts[name] });

const priceQuestions = {
  venda: 'Qual é o valor de venda, em reais?',
  locacao: 'Qual é o valor do aluguel mensal, em reais?',
  temporada: 'Qual é o valor da diária, em reais?',
};

export const GUIDED_FIELDS = Object.freeze([
  Object.freeze({
    name: 'finalidade', kind: 'choice', label: 'Finalidade', required: true, options: PURPOSES,
    question: 'O imóvel é para venda, aluguel anual ou temporada?',
  }),
  text('tipo', 'Tipo do imóvel', 'Qual é o tipo do imóvel? Por exemplo: apartamento, casa ou studio.'),
  text('titulo', 'Título do anúncio', 'Que título você quer no anúncio?'),
  text('cidade', 'Cidade', 'Em que cidade fica o imóvel?'),
  text('bairro', 'Bairro', 'Em que bairro?'),
  Object.freeze({
    name: 'preco', kind: 'money', label: 'Preço', required: true, positive: true,
    question: values => priceQuestions[values.finalidade] ?? 'Qual é o valor do imóvel, em reais?',
  }),
  Object.freeze({ name: 'area', kind: 'area', label: 'Área (m²)', required: false, question: 'Qual é a área, em m²? Se não souber, pule.' }),
  count('quartos', 'Quartos', 'Quantos quartos?'),
  count('suites', 'Suítes', 'Quantas suítes?'),
  count('banheiros', 'Banheiros', 'Quantos banheiros?'),
  count('vagas', 'Vagas', 'Quantas vagas de garagem?'),
  Object.freeze({
    name: 'condominio', kind: 'money', label: 'Condomínio mensal', required: false, unknownWhenBlank: true,
    appliesTo: Object.freeze(['venda', 'locacao']),
    question: 'Qual é o condomínio mensal, em reais? Deixe em branco se não souber; digite 0 só se não houver.',
  }),
  Object.freeze({
    name: 'iptu', kind: 'money', label: 'IPTU mensal', required: false, unknownWhenBlank: true,
    appliesTo: Object.freeze(['venda', 'locacao']),
    question: 'Qual é o IPTU mensal, em reais? Deixe em branco se não souber; digite 0 só se não houver.',
  }),
  Object.freeze({
    name: 'maxGuests', kind: 'count', label: 'Capacidade de hóspedes', required: true,
    min: GUIDED_LIMITS.guests.min, max: GUIDED_LIMITS.guests.max, appliesTo: Object.freeze(['temporada']),
    question: 'Para quantos hóspedes o imóvel comporta?',
  }),
  Object.freeze({
    name: 'cleaning', kind: 'money', label: 'Taxa de limpeza', required: false, appliesTo: Object.freeze(['temporada']),
    question: 'Qual é a taxa de limpeza, em reais? Se não houver, pule.',
  }),
  text('caracteristicas', 'Características', 'Quais características quer destacar? Separe por vírgula.', { required: false }),
  text('descricao', 'Descrição', 'Descreva o imóvel em poucas frases.', { kind: 'longtext', required: false }),
]);

const isBlank = value => value === undefined || value === null || String(value).trim() === '';
const ok = value => ({ ok: true, value });
const fail = error => ({ ok: false, error });

export const fieldQuestion = (field, values = {}) =>
  typeof field.question === 'function' ? field.question(values) : field.question;

/** Passos que se aplicam aos valores atuais. Campos de temporada ou de encargos dependem da finalidade. */
export const guidedSteps = (values = {}) =>
  GUIDED_FIELDS.filter(field => !field.appliesTo || field.appliesTo.includes(values.finalidade));

/** Valida uma resposta. Devolve { ok: true, value } ou { ok: false, error }. Vazio opcional vira null (ou '' em texto). */
export function validateGuidedField(field, raw) {
  const answer = isBlank(raw) ? '' : String(raw).trim();
  const textual = field.kind === 'text' || field.kind === 'longtext';
  if (answer === '') return field.required ? fail('Informe este campo para continuar.') : ok(textual ? '' : null);
  if (field.kind === 'choice') {
    return Object.hasOwn(field.options, answer) ? ok(answer) : fail('Escolha uma das opções da lista.');
  }
  if (textual) return answer.length > field.max ? fail(`Use até ${field.max} caracteres.`) : ok(answer);
  if (field.kind === 'money') {
    const amount = parseBrNumber(answer);
    if (amount === null) return fail('Informe um valor em reais, por exemplo 650.000 ou 1.250,50.');
    if (field.positive && amount <= 0) return fail('Informe um valor maior que zero.');
    if (amount > GUIDED_LIMITS.amountMax) return fail('Esse valor é alto demais. Confira os zeros.');
    return ok(amount);
  }
  if (field.kind === 'area') {
    const area = parseBrNumber(answer);
    if (area === null) return fail('Informe a área em m², por exemplo 82 ou 82,5.');
    if (area > GUIDED_LIMITS.areaMax) return fail(`A área deve ser de no máximo ${GUIDED_LIMITS.areaMax.toLocaleString('pt-BR')} m².`);
    return ok(area);
  }
  if (!/^\d+$/.test(answer)) return fail('Informe um número inteiro, sem vírgula.');
  const number = Number(answer);
  return number < field.min || number > field.max
    ? fail(`Informe um número inteiro entre ${field.min} e ${field.max}.`) : ok(number);
}

/** Inicia uma sessão. `initial` são os valores já presentes no formulário (texto); valores inválidos são ignorados. */
export function startGuided(initial = {}) {
  const values = {};
  for (const field of GUIDED_FIELDS) {
    if (field.appliesTo && !field.appliesTo.includes(values.finalidade)) continue;
    if (isBlank(initial[field.name])) continue;
    const result = validateGuidedField(field, initial[field.name]);
    if (result.ok) values[field.name] = result.value;
  }
  return { phase: 'collecting', index: 0, values, error: null, returnToReview: false };
}

export const currentStep = state => guidedSteps(state.values)[state.index] ?? null;

function advance(state) {
  if (state.returnToReview) return { ...state, phase: 'review', returnToReview: false, error: null };
  const next = state.index + 1;
  return next >= guidedSteps(state.values).length
    ? { ...state, phase: 'review', error: null }
    : { ...state, index: next, error: null };
}

/** Responde o passo atual. Resposta inválida mantém o passo e registra o erro. */
export function submitAnswer(state, raw) {
  const step = state.phase === 'collecting' ? currentStep(state) : null;
  if (!step) return state;
  const result = validateGuidedField(step, raw);
  if (!result.ok) return { ...state, error: result.error };
  return advance({ ...state, values: { ...state.values, [step.name]: result.value } });
}

/** Pula um campo opcional sem alterar o valor que já existia. Campo obrigatório não pode ser pulado. */
export function skipField(state) {
  const step = state.phase === 'collecting' ? currentStep(state) : null;
  if (!step) return state;
  return step.required ? { ...state, error: 'Este campo é obrigatório e não pode ser pulado.' } : advance(state);
}

export function goBack(state) {
  if (state.phase === 'review') {
    return { ...state, phase: 'collecting', index: Math.max(0, guidedSteps(state.values).length - 1), returnToReview: false, error: null };
  }
  return { ...state, index: Math.max(0, state.index - 1), error: null };
}

/** Volta a um campo específico a partir da revisão; depois da resposta, retorna à revisão. */
export function editStep(state, name) {
  const index = guidedSteps(state.values).findIndex(field => field.name === name);
  return index < 0 ? state : { ...state, phase: 'collecting', index, returnToReview: true, error: null };
}

export const goToReview = state => ({ ...state, phase: 'review', returnToReview: false, error: null });

const hasValue = value => !(value === undefined || value === null || value === '');

function display(step, value) {
  if (!hasValue(value)) {
    if (step.required) return 'Falta informar';
    return step.kind === 'count' || step.kind === 'area' ? 'Não informado (a vitrine usará 0)' : 'Não informado';
  }
  if (step.kind === 'choice') return step.options[value];
  if (step.kind === 'money') return money(value);
  if (step.kind === 'area') return value.toLocaleString('pt-BR') + ' m²';
  return String(value);
}

/** Linhas da revisão. `missing` é verdadeiro só para obrigatório sem valor. */
export const reviewItems = state => guidedSteps(state.values).map(step => ({
  name: step.name,
  label: step.label,
  required: step.required,
  missing: step.required && !hasValue(state.values[step.name]),
  display: display(step, state.values[step.name]),
}));

export const missingRequired = state => reviewItems(state).filter(item => item.missing);
export const canApply = state => missingRequired(state).length === 0;

/** Valores em texto para preencher o formulário, só dos passos aplicáveis. Vazio fica "". */
export function toFormValues(state) {
  return Object.fromEntries(guidedSteps(state.values).map(step => {
    const value = state.values[step.name];
    return [step.name, hasValue(value) ? String(value) : ''];
  }));
}
