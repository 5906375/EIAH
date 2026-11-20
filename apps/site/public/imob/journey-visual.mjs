import { updateGuide } from './step-guides.mjs';
import { createPromptAudio, stopContextAudio } from './context-audio.mjs';
import { formatProposal, readLocal, setRequestAudio, writeLocal } from './requests-local.mjs';
import { findProperty, propertyGoals, renderPropertyContext } from './property-context.mjs';
import { isTeamContactRequest, propertyChatReply } from './property-chat-replies.mjs';
import './client-brand.mjs';
import { money, quoteStay } from './stay-visual.mjs';
import { requestVoice } from './request-voice.mjs';
import { detailsByGoal, goals, inferGoal, matchOption, normalizedDetail, questions } from './request-chat-questions.mjs';

const get = id => document.getElementById(id);
const journey = get('jornada');
const form = get('requestForm');
const progress = [...get('requestProgress').children];
const stageLinks = progress.map(step => step.querySelector('a'));
const stagePreview = get('requestStagePreview');
const stageTitle = get('requestStageTitle');
const simulation = get('simulateOffline');
get('connectionScenario')?.toggleAttribute('hidden', !new URLSearchParams(location.search).has('teste-conexao'));
const reply = get('requestReply');
const thread = get('requestChatHistory');
const prompt = get('requestChatPrompt');
const options = get('requestChatOptions');
const error = get('requestError');
const send = get('sendRequestOpening');
const review = get('requestReview');
const propertyContext = get('requestProperty');
const propertyActions = get('requestPropertyActions');
const propertyReview = get('requestPropertyReview');
const roles = ['Recepção', 'Imóvel', 'Revisão'];
const roleIDs = ['welcome', 'property', 'review'];

const initial = () => ({ step: 0, question: 'opening', inputs: {}, turns: [], proposal: null, draft: null, saved: false });
const propertyWorkKey = id => 'work:property:' + id;
const listingWorkKey = 'work:listing';
const storedWork = readLocal('work', null);
const previousProperty = findProperty(storedWork?.propertyId);
const legacyListing = isLegacyListing(storedWork) ? storedWork : null;
if (previousProperty && !readLocal(propertyWorkKey(previousProperty.id), null)) {
  writeLocal(propertyWorkKey(previousProperty.id), storedWork);
}
if (legacyListing && !readLocal(listingWorkKey, null)) {
  writeLocal(listingWorkKey, legacyListing);
}
let workKey = 'work';
let work = restoreWork(readGeneralWork() ?? initial());
const messageDrafts = new Map();
let launchButton;
const voice = requestVoice(audio => submitMessage({ audio }), renderConnection);
const resumeRequest = document.createElement('button');
resumeRequest.className = 'btn btn-ghost';
resumeRequest.type = 'button';
resumeRequest.textContent = 'Retomar atendimento anterior';
resumeRequest.hidden = true;
get('requestBack').after(resumeRequest);

function isLegacyListing(state) {
  return !state?.propertyId && state?.inputs?.goal === 'cadastrar' && !state.inputs.opening &&
    !state.turns?.some(turn => ['opening', 'goal', 'clarify'].includes(turn.key));
}

function readGeneralWork() {
  const state = readLocal('work', null);
  return state && !state.propertyId && !isLegacyListing(state) ? state : null;
}

function resumableGeneralWork() {
  const state = readGeneralWork();
  return state && !state.saved && (state.turns?.length || state.proposal || state.audio) ? state : null;
}

function initialListingWork() {
  return { ...initial(), step: 1, question: detailsByGoal.cadastrar[0], inputs: { goal: 'cadastrar' } };
}

function restoreWork(state) {
  state.turns ??= [];
  if (state.propertyId && state.step !== 2) {
    state.step = 1;
    state.question = 'propertyOpening';
  }
  state.question ??= state.step === 1 && Object.hasOwn(detailsByGoal, state.inputs.goal)
    ? detailsByGoal[state.inputs.goal][0]
    : state.audio || state.inputs.opening ? 'goal' : 'opening';
  return state;
}

function initialPropertyWork(property) {
  return {
    ...initial(),
    step: 1,
    question: 'propertyOpening',
    propertyId: property.id,
    inputs: {
      goal: propertyGoals[property.finalidade],
      region: property.bairro + ', ' + property.cidade,
      type: property.tipo,
      bedrooms: String(property.quartos)
    }
  };
}

function switchWork(property, listing) {
  const key = property ? propertyWorkKey(property.id) : listing ? listingWorkKey : 'work';
  if (key === workKey) return;
  voice.cancel();
  messageDrafts.set(workKey, reply.value);
  workKey = key;
  if (property) work = restoreWork(readLocal(key, null) ?? initialPropertyWork(property));
  else if (listing) work = restoreWork(readLocal(key, null) ?? legacyListing ?? initialListingWork());
  else work = restoreWork(readGeneralWork() ?? initial());
  reply.value = messageDrafts.get(key) ?? '';
}

const writeWork = (state = work) => writeLocal(workKey, state);

function activeQuestion() {
  const key = work.question;
  const question = questions[key];
  const last = work.turns.at(-1);
  if ((key === 'goal' || key === 'clarify') && last?.audio && last.key !== 'opening') {
    return { ...question, text: 'Recebi sua resposta em áudio. Para identificar o objetivo, toque em uma opção ou escreva sua escolha.' };
  }
  if (key === 'goal' && (last?.audio || (work.audio && !last))) {
    return { ...question, text: 'Recebi seu áudio. Qual é o objetivo do pedido?' };
  }
  if (key === 'notes' && work.inputs.goal === 'negociacao') {
    return { ...question, text: 'Qual é a sua dúvida sobre a negociação?', optional: false };
  }
  return question;
}

function pauseRecordings(except) {
  for (const player of thread.querySelectorAll('audio')) {
    if (player !== except) player.pause();
  }
}

function createMessage(speaker, text, yours) {
  const message = document.createElement('div');
  message.className = 'request-chat-message' + (yours ? ' request-chat-answer' : '');
  const name = document.createElement('p');
  name.className = 'request-chat-speaker';
  name.textContent = speaker;
  message.append(name);
  if (text) {
    const body = document.createElement('p');
    body.textContent = text;
    message.append(body);
  }
  return message;
}

function createAudioMessage(source, label) {
  const player = document.createElement('audio');
  player.controls = true;
  player.preload = 'metadata';
  player.setAttribute('aria-label', label);
  setRequestAudio(player, source);
  player.addEventListener('play', () => {
    stopContextAudio();
    pauseRecordings(player);
  });
  return player;
}

function assistantMessage(text, stage, label) {
  const message = createMessage('Assistente de ' + roles[stage], text);
  message.dataset.role = roleIDs[stage];
  message.append(createPromptAudio(text, roleIDs[stage], () => pauseRecordings(), label));
  return message;
}

function addContactLink(message) {
  const channels = get('contato')?.querySelector('a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me/"]');
  if (!channels) return;
  const contact = document.createElement('a');
  contact.className = 'btn btn-ghost';
  contact.href = '#contato';
  contact.textContent = 'Ver canais de contato';
  message.querySelector('.request-prompt-audio').before(contact);
}

function renderHistory(stage) {
  stopContextAudio();
  pauseRecordings();
  const messages = document.createDocumentFragment();
  if ((stage === undefined || stage === 1) && work.propertyId && !work.turns.some(turn => turn.key === 'propertyOpening' && turn.prompt)) {
    messages.append(assistantMessage(questions.propertyOpening.text, 1));
  }
  const original = work.audio || (work.inputs.opening &&
    !work.turns.some(turn => turn.key === 'opening' || turn.key === 'propertyOpening'));
  if (original && (stage === undefined || stage === (work.propertyId ? 1 : 0))) {
    const entry = createMessage('Você', work.inputs.opening || 'Áudio do pedido inicial', true);
    if (work.audio) entry.append(createAudioMessage(work.audio, 'Ouvir áudio do pedido inicial'));
    messages.append(entry);
  }
  for (const turn of work.turns) {
    if (stage !== undefined && turn.before.step !== stage) continue;
    if (turn.prompt) messages.append(assistantMessage(turn.prompt, turn.before.step));
    const answer = createMessage('Você', turn.text || (turn.audio ? 'Mensagem de voz' : 'Prefiro pular'), true);
    if (turn.audio) answer.append(createAudioMessage(turn.audio, 'Ouvir mensagem sobre ' + recordingLabel(turn.key)));
    messages.append(answer);
    if (turn.assistantReply) {
      const message = assistantMessage(turn.assistantReply, turn.before.step, 'Ouvir resposta');
      if (turn.contactRequest) addContactLink(message);
      messages.append(message);
    }
  }
  thread.replaceChildren(messages);
  thread.hidden = !thread.childElementCount;
  thread.scrollTop = thread.scrollHeight;
}

function renderConnection() {
  const offline = Boolean(simulation?.checked);
  const unavailable = offline || voice.busy;
  if (voice.busy) pauseRecordings();
  voice.setAvailable(!offline && work.step !== 2);
  send.disabled = unavailable;
  propertyReview.disabled = unavailable;
  for (const button of options.querySelectorAll('button')) button.disabled = unavailable;
  get('requestBack').disabled = voice.busy;
  get('confirmDraft').disabled = offline;
  get('saveRequest').disabled = offline;
  if (simulation) get('offlineNotice').hidden = !offline;
}

function renderReview() {
  if (work.proposal) formatProposal(get('requestSummary'), work.proposal.entries);
  get('draftNotice').hidden = !work.draft || work.saved;
  get('receipt').hidden = !work.saved;
  get('confirmDraft').hidden = Boolean(work.draft);
  get('saveRequest').hidden = !work.draft || work.saved;
  get('newRequest').hidden = !work.saved;
}

function addChoice(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    error.textContent = action() ?? '';
  });
  options.append(button);
}

function showStep(focus, stage = work.step) {
  const property = findProperty(work.propertyId);
  const consulting = stage !== work.step;
  renderPropertyContext(propertyContext, !consulting || stage === 1 ? property : null, work.inputs);
  renderHistory(consulting ? stage : undefined);
  stagePreview.hidden = !consulting;
  if (consulting) {
    stageTitle.textContent = roles[stage];
    get('requestStageDescription').textContent = stage > work.step
      ? 'Esta etapa fica disponível após a conclusão da etapa em andamento.'
      : thread.hidden ? 'Não há mensagens nesta etapa.' : 'Confira as mensagens já registradas nesta etapa.';
  }
  prompt.hidden = consulting || stage === 2 || Boolean(property);
  propertyActions.hidden = consulting || !property || stage === 2 || !(work.turns.length || work.audio || work.inputs.opening);
  reply.setAttribute('aria-describedby', property ? 'requestVoiceHelp' : 'requestChatQuestion requestVoiceHelp');
  reply.placeholder = 'Escreva uma mensagem ou grave um áudio';
  get('requestChatComposer').hidden = consulting || stage === 2;
  review.hidden = consulting || stage !== 2;
  get('newRequest').hidden = consulting || stage !== 2 || !work.saved;
  thread.setAttribute('tabindex', thread.hidden ? '-1' : '0');
  progress.forEach((step, index) => {
    step.className = index === stage ? 'current' : index < work.step ? 'complete' : '';
    if (index === stage) stageLinks[index].setAttribute('aria-current', 'step');
    else stageLinks[index].removeAttribute('aria-current');
  });
  get('requestBack').hidden = consulting || work.saved || (!work.turns.length && stage !== 2);
  resumeRequest.hidden = consulting || workKey !== 'work' || work.question !== 'opening' || !resumableGeneralWork();
  get('requestBack').textContent = work.propertyId && stage === 2 ? 'Voltar à conversa'
    : work.turns.at(-1)?.audio ? 'Remover última gravação' : 'Editar última resposta';
  error.textContent = '';
  get('copyFeedback').textContent = '';
  const hints = [
    'Você pode escrever ou gravar a qualquer momento da conversa.',
    work.propertyId ? 'Use a ficha do imóvel para tirar suas dúvidas.' : 'Vou fazer uma pergunta por vez.',
    'Confira a proposta, confirme e salve quando estiver pronto.'
  ];
  updateGuide(roleIDs[stage], consulting ? 'Você está consultando esta etapa do atendimento.' : hints[stage],
    ['Entendimento do pedido', 'Dados do imóvel', 'Revisão do pedido'][stage]);
  if (!consulting && stage === 2) {
    renderReview();
  } else if (!consulting && !property) {
    const question = activeQuestion();
    prompt.dataset.role = roleIDs[stage];
    get('requestChatSpeaker').textContent = 'Assistente de ' + roles[stage];
    get('requestChatQuestion').textContent = question.text;
    prompt.querySelector('.request-prompt-audio')?.remove();
    const numbered = work.question === 'goal' || work.question === 'clarify';
    const list = question.options?.map(([, label], index) => numbered ? (index + 1) + '. ' + label : label);
    const audio = createPromptAudio([question.text, ...(list ?? [])].join(' '), roleIDs[stage], () => pauseRecordings());
    prompt.insertBefore(audio, options);
    options.replaceChildren();
    question.options?.forEach(([value, label], index) =>
      addChoice(list[index], () => submitMessage({ text: label, selected: value })));
    if (question.optional) addChoice('Pular pergunta', () => submitMessage({ skip: true }));
    options.hidden = !options.childElementCount;
    reply.placeholder = numbered ? 'Escreva sua escolha ou grave um áudio' : 'Escreva uma mensagem ou grave um áudio';
  }
  renderConnection();
  if (focus) (consulting ? stageTitle : stage === 2 ? get('proposalTitle') : reply).focus();
}

function stageHash(stage) {
  return stage === work.step ? '#jornada' : stageLinks[stage].hash;
}

function viewStage(stage) {
  if (voice.busy) {
    error.textContent = 'Pare a gravação para trocar de etapa.';
    return;
  }
  const url = new URL(location.href);
  url.hash = stageHash(stage);
  if (url.href !== location.href) history.replaceState(null, '', url);
  showStep(true, stage);
}

stageLinks.forEach((link, stage) => {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    viewStage(stage);
  });
});
get('requestStageReturn').addEventListener('click', event => {
  event.preventDefault();
  viewStage(work.step);
});

function openJourney(detail = {}) {
  const property = findProperty(detail.propertyId);
  const listing = !property && detail.goal === 'cadastrar';
  switchWork(property, listing);
  if (detail.trigger) launchButton = detail.trigger;
  if (!property && !listing && detail.fresh) {
    voice.cancel();
    work = initial();
    reply.value = '';
  }
  if (listing && work.saved && detail.trigger) {
    work = initialListingWork();
    reply.value = '';
    writeWork();
  }
  if (property && detail.stay && !work.turns.length && !work.proposal) {
    work.inputs = { ...work.inputs, ...detail.stay };
    writeWork();
  }
  journey.hidden = false;
  const url = new URL(location.href);
  if (property) url.searchParams.set('imovel', property.id);
  else url.searchParams.delete('imovel');
  if (listing) url.searchParams.set('objetivo', 'cadastrar');
  else if (!property && detail.fresh) url.searchParams.set('objetivo', 'novo');
  else url.searchParams.delete('objetivo');
  const stage = detail.stage ?? work.step;
  url.hash = stageHash(stage);
  if (url.href !== location.href) history.replaceState(null, '', url);
  journey.scrollIntoView({ block: 'start', behavior: 'instant' });
  showStep(!property || stage !== work.step, stage);
  if (property && stage === work.step) propertyContext.focus({ preventScroll: true });
}

function clearNewEntry() {
  const url = new URL(location.href);
  if (url.searchParams.get('objetivo') !== 'novo') return;
  url.searchParams.delete('objetivo');
  history.replaceState(null, '', url);
}

resumeRequest.addEventListener('click', () => {
  const saved = resumableGeneralWork();
  if (!saved) return;
  voice.cancel();
  work = restoreWork(saved);
  reply.value = '';
  clearNewEntry();
  showStep(true);
});

function recordingLabel(key) {
  return questions[key]?.label ?? 'Objetivo';
}

function recordings() {
  const list = work.turns.filter(turn => turn.audio).map(turn => ({ label: recordingLabel(turn.key), source: turn.audio }));
  return work.audio ? [{ label: 'Pedido inicial', source: work.audio }, ...list] : list;
}
function nextSteps(goal, values, property) {
  if (goal === 'cadastrar') {
    const missing = [];
    if (!values.get('listingTitle')?.trim()) missing.push('identificação do imóvel');
    if (!values.get('budget')?.trim()) missing.push('valor pretendido');
    if (!values.get('listingAvailability')?.trim()) missing.push('data de disponibilidade');
    if (values.get('listingPhotos') === 'Já tenho fotos') missing.push('receber e conferir as fotos');
    else missing.push('solicitar fotos');
    missing.push('confirmar a autorização de divulgação');
    return [
      ['Pendências', missing.join(' · ')],
      ['Próxima ação da equipe', 'Conferir a ficha com o proprietário e resolver as pendências antes de preparar a divulgação.']
    ];
  }
  const actions = {
    comprar: property ? 'Responder às dúvidas sobre o imóvel e combinar o próximo passo, se houver interesse.' : 'Buscar imóveis na carteira e encaminhar opções compatíveis.',
    alugar: property ? 'Responder às dúvidas e confirmar valor, encargos ou disponibilidade, se necessário.' : 'Buscar opções considerando orçamento, encargos e prazo de mudança.',
    temporada: 'Conferir a disponibilidade e o valor do período antes de responder à consulta.',
    negociacao: 'Identificar a negociação e encaminhar a dúvida ao responsável.'
  };
  return [['Próxima ação da equipe', actions[goal]]];
}

function prepareProposal() {
  const goal = work.inputs.goal;
  const detailKeys = detailsByGoal[goal];
  const values = new Map(detailKeys.map(key => [key, work.inputs[key] ?? '']));
  const selected = findProperty(work.propertyId);
  const property = selected && propertyGoals[selected.finalidade] === goal ? selected : null;
  const entries = [['Objetivo', goals[goal]]];
  if (property) entries.push(['Imóvel de referência', property.titulo], ['Código do imóvel', property.id.toUpperCase()]);
  if (work.inputs.opening) entries.push(['Pedido inicial', work.inputs.opening]);
  if (property) {
    const messages = work.turns.filter(turn => turn.key === 'propertyOpening' && turn.text).map(turn => turn.text);
    if (messages[0] === work.inputs.opening) messages.shift();
    if (messages.length) entries.push(['Mensagens da conversa', messages.join('\n')]);
  }
  for (const key of detailKeys) {
    const value = values.get(key);
    const voiceAnswer = work.turns.some(turn => turn.key === key && turn.audio);
    if ((!value || value === 'A definir') && !voiceAnswer) continue;
    const display = value && questions[key].date ? value.split('-').reverse().join('/') : value;
    const purpose = key === 'purpose' ? questions.purpose.options.find(([id]) => id === value)?.[1] : undefined;
    entries.push([questions[key].label, purpose ?? (display || 'Informado por áudio · a conferir')]);
  }
  if (goal === 'temporada' && property) {
    const quote = quoteStay(property, Object.fromEntries(values));
    entries.push(['Consulta de temporada', quote
      ? money(quote.total) + ' por ' + quote.nights + ' noite(s), incluindo limpeza · estimativa fictícia'
      : 'Disponibilidade a esclarecer com a equipe']);
  }
  const audioCount = recordings().length;
  if (audioCount) entries.push(['Mensagens de voz', String(audioCount) + ' · ouça os áudios da conversa']);
  entries.push(...nextSteps(goal, values, property));
  work.proposal = { id: crypto.randomUUID(), entries, ...(property ? { property } : {}) };
}

function reviewPropertyRequest() {
  if (!work.propertyId || work.step !== 1 || voice.busy || simulation?.checked) return;
  const previous = work;
  work = { ...work, step: 2 };
  if (!work.proposal) prepareProposal();
  if (!writeWork()) {
    work = previous;
    return 'Não foi possível preparar o resumo nesta aba. Sua conversa continua disponível.';
  }
  showStep(true);
}

propertyReview.addEventListener('click', () => {
  error.textContent = reviewPropertyRequest() ?? '';
});

function submitMessage({ text = '', audio, selected, skip }) {
  if (work.step === 2 || (voice.busy && !audio)) return;
  if (simulation?.checked) return 'Atendimento temporariamente indisponível. Sua conversa continua nesta aba.';
  text = text.trim();
  if (!text && !audio && !skip) return 'Escreva uma mensagem ou grave um áudio.';

  const key = work.question;
  const current = activeQuestion();
  const before = { step: work.step, question: key, inputs: work.inputs };
  const inputs = { ...work.inputs };
  let nextQuestion = key;
  let stage = work.step;
  let assistantReply;
  let contactRequest = false;

  if (key === 'opening') {
    if (text) inputs.opening = text;
    nextQuestion = audio ? 'goal' : inferGoal(text);
    if (Object.hasOwn(goals, nextQuestion)) {
      inputs.goal = nextQuestion;
      stage = 1;
      nextQuestion = detailsByGoal[inputs.goal][0];
    }
  } else if (key === 'propertyOpening') {
    if (text) inputs.opening ||= text;
    contactRequest = !audio && isTeamContactRequest(text);
    if (audio) {
      assistantReply = 'Recebi seu áudio. Você pode revisar o pedido para a equipe ouvir a gravação. Se quiser consultar algum dado do anúncio agora, escreva sua pergunta.';
    } else if (contactRequest) {
      assistantReply = 'Posso reunir sua mensagem e o código deste imóvel para a equipe da imobiliária. Toque em Revisar pedido para conferir antes de salvar.';
    } else {
      assistantReply = propertyChatReply(findProperty(work.propertyId), text, inputs);
    }
  } else if (key === 'goal' || key === 'clarify') {
    if (!audio) {
      const choice = selected ? current.options.find(([value]) => value === selected) : matchOption(key, current.options, text);
      if (!choice) return 'Toque em uma opção ou escreva o objetivo do pedido.';
      if (choice[0] === 'outro') {
        nextQuestion = 'goal';
      } else {
        inputs.goal = choice[0];
        if (key === 'clarify' && inputs.goal === 'cadastrar') inputs.purpose = 'locacao';
        stage = 1;
        nextQuestion = detailsByGoal[inputs.goal].find(field => !inputs[field]);
      }
    }
  } else {
    let value = '';
    if (text) {
      if (current.options) {
        const choice = selected ? current.options.find(([id]) => id === selected) : matchOption(key, current.options, text);
        if (!choice) return 'Toque em uma das opções ou escreva como ela aparece na conversa.';
        value = choice[0];
      } else {
        value = normalizedDetail(key, text, inputs);
        if (value === null) {
          if (current.count) return 'Informe um número de hóspedes entre 1 e 100.';
          if (key === 'departure') return 'Informe uma data de saída válida, posterior à entrada, no formato DD/MM/AAAA.';
          return 'Informe uma data válida no formato DD/MM/AAAA.';
        }
      }
    }
    inputs[key] = value;
    const details = detailsByGoal[inputs.goal];
    nextQuestion = details.slice(details.indexOf(key) + 1).find(field => !inputs[field]);
    if (!nextQuestion) stage = 2;
  }

  const previous = work;
  const turn = { key, prompt: key === 'propertyOpening' ? '' : current.text, text, before };
  if (audio) turn.audio = audio;
  if (assistantReply) turn.assistantReply = assistantReply;
  if (contactRequest) turn.contactRequest = true;
  work = { ...work, step: stage, question: nextQuestion ?? key, inputs, turns: [...work.turns, turn], proposal: null, draft: null, saved: false };
  if (stage === 2) prepareProposal();
  if (!writeWork()) {
    work = previous;
    return audio ? 'A gravação não coube nesta aba. Tente um áudio mais curto ou escreva a resposta.'
      : 'Não foi possível guardar a mensagem nesta aba. A conversa anterior continua disponível.';
  }
  if (!audio) reply.value = '';
  clearNewEntry();
  showStep(true);
  if (assistantReply) get('requestStatus').textContent = assistantReply;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  error.textContent = submitMessage({ text: reply.value }) ?? '';
  if (error.textContent) reply.focus();
});

reply.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!send.disabled) form.requestSubmit(send);
});

reply.addEventListener('input', () => { error.textContent = ''; });

get('confirmDraft').addEventListener('click', () => {
  if (!work.proposal || simulation?.checked) return;
  const updated = { ...work, draft: work.proposal };
  if (!writeWork(updated)) {
    error.textContent = 'Não foi possível confirmar o rascunho nesta aba.';
    return;
  }
  work = updated;
  error.textContent = '';
  renderReview();
  get('requestStatus').textContent = 'Rascunho atualizado.';
  get('saveRequest').focus();
});

get('saveRequest').addEventListener('click', () => {
  if (!work.draft || work.saved || simulation?.checked) return;
  const queue = readLocal('queue', []);
  if (!queue.some(item => item.id === work.draft.id)) {
    const property = work.draft.property ?? findProperty(work.propertyId);
    queue.push({ ...work.draft, ...(property ? { property } : {}), recordings: recordings() });
  }
  if (!writeLocal('queue', queue)) {
    error.textContent = 'Não foi possível salvar neste navegador. Seu rascunho continua aberto.';
    return;
  }
  work.saved = true;
  writeWork();
  error.textContent = '';
  renderReview();
  get('requestBack').hidden = true;
  const receipt = get('receipt');
  get('requestStatus').textContent = receipt.querySelector('strong').textContent;
  (receipt.querySelector('a') ?? receipt).focus();
});

get('copyRequest').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(work.proposal.entries.map(([label, value]) => label + ': ' + value).join('\n'));
    get('copyFeedback').textContent = 'Resumo copiado.';
  } catch {
    get('copyFeedback').textContent = 'Selecione o texto da proposta e copie pelo navegador.';
  }
});

get('requestBack').addEventListener('click', () => {
  if (work.saved || voice.busy) return;
  if (work.propertyId && work.step === 2) {
    work = { ...work, step: 1, question: 'propertyOpening' };
    writeWork();
    showStep(true);
    return;
  }
  const last = work.turns.at(-1);
  const earlier = last?.before ?? {
    step: 1, question: detailsByGoal[work.inputs.goal]?.[0] ?? 'goal'
  };
  work = restoreWork({ ...work, ...earlier, turns: work.turns.slice(0, -1), proposal: null, draft: null });
  reply.value = last?.text ?? '';
  writeWork();
  showStep(true);
});

get('newRequest').addEventListener('click', () => {
  const property = findProperty(work.propertyId);
  work = property ? initialPropertyWork(property) : workKey === listingWorkKey ? initialListingWork() : initial();
  reply.value = '';
  writeWork();
  showStep(true);
});

get('journeyClose').addEventListener('click', event => {
  event.preventDefault();
  stopContextAudio();
  pauseRecordings();
  voice.cancel();
  journey.hidden = true;
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.delete('imovel');
  url.searchParams.delete('objetivo');
  history.replaceState(null, '', url);
  (launchButton ?? document.querySelector('[data-journey]')).focus();
});
simulation?.addEventListener('change', () => {
  if (simulation.checked) voice.cancel();
  renderConnection();
});

document.querySelectorAll('[data-journey]').forEach(button => {
  button.addEventListener('click', () => {
    const goal = button.dataset.journey;
    openJourney({ goal, fresh: !goal, trigger: button });
  });
});
document.addEventListener('imob:start', event => openJourney(event.detail));
const params = new URLSearchParams(location.search);
const requestedProperty = params.get('imovel');
const requestedGoal = params.get('objetivo');
const requestedStage = stageLinks.findIndex(link => link.hash === location.hash);
if (location.hash === '#jornada' || requestedStage >= 0 || requestedProperty) {
  openJourney({
    propertyId: requestedProperty ?? (requestedGoal ? undefined : previousProperty?.id),
    goal: requestedGoal,
    fresh: requestedGoal === 'novo',
    stage: requestedStage >= 0 ? requestedStage : undefined
  });
}
