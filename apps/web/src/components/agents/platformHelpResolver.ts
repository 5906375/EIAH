import type { Agent } from "@/lib/api";

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  return agent?.chatCopy?.displayName || agent?.name || agent?.agent || "EIAH";
}

export function isFlowGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  return (
    normalized.includes("analise este fluxo") ||
    normalized.includes("analise esse fluxo") ||
    normalized.includes("recomende o proximo passo") ||
    normalized.includes("recomende o próximo passo")
  );
}

export function isAgentSignupHelpQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  return (
    (normalized.includes("assinar") || normalized.includes("ativar") || normalized.includes("instalar")) &&
    (normalized.includes("agente") || normalized.includes("agentes") || normalized.includes("marketplace"))
  );
}

export function buildAgentSignupHelpReply() {
  return [
    "Para assinar ou ativar agentes no workspace, o caminho mais rápido é este:",
    "",
    "1. Abra `Marketplace` no menu principal.",
    "2. Procure o agente que você quer usar.",
    "3. Revise descrição, caso de uso e disponibilidade para o workspace.",
    "4. Ative ou assine o agente no catálogo.",
    "5. Volte para `Agentes` ou `Runs` para começar a usar.",
    "",
    "Se quiser, eu também posso te dizer qual agente faz mais sentido para o seu caso antes da assinatura.",
  ].join("\n");
}

export function isPlatformSelfExplainQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "o que e o eiah",
    "o que eh o eiah",
    "preciso entender o que o eiah e",
    "me explique o que e o eiah",
    "entender o que o eiah e",
    "explique voce",
    "me explique voce",
    "fala de voce",
    "fale sobre voce",
    "quem e voce",
    "quem eh voce",
    "qual agente esta aqui",
    "qual agente está aqui",
    "quem esta falando comigo",
    "quem está falando comigo",
    "quem esta aqui",
    "quem está aqui",
    "qual agente esta ativo",
    "qual agente está ativo",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function isPlatformUiExplainQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const directSignals = [
    "essa tela",
    "este bloco",
    "esse bloco",
    "essa coluna",
    "essa tabela",
    "esse card",
    "esses cards",
    "esse botao",
    "esse botão",
    "inventario governado de agentes",
    "inventario de agentes",
    "inventario governado",
    "governanca de agentes",
    "governança de agentes",
    "bloco de governanca",
    "bloco de governança",
  ];
  const hasUiNoun =
    normalized.includes("tela") ||
    normalized.includes("bloco") ||
    normalized.includes("coluna") ||
    normalized.includes("card") ||
    normalized.includes("cards") ||
    normalized.includes("tabela") ||
    normalized.includes("botao") ||
    normalized.includes("botão");
  const hasExplainVerb =
    normalized.includes("explique") ||
    normalized.includes("explica") ||
    normalized.includes("o que e") ||
    normalized.includes("o que eh") ||
    normalized.includes("qual o sentido") ||
    normalized.includes("para que serve");
  return directSignals.some((signal) => normalized.includes(signal)) || (hasUiNoun && hasExplainVerb);
}

export function buildPlatformSelfExplainReply(agentProfile: Agent | null) {
  const displayName = getAgentDisplayName(agentProfile);
  return [
    `${displayName} é o assistente principal da plataforma.`,
    "",
    "Eu existo para te ajudar a entender o produto, navegar pelas páginas, organizar o próximo passo e te encaminhar para o especialista certo quando o caso pedir profundidade maior.",
    "",
    "Na prática, eu costumo ajudar melhor quando você quer:",
    "- entender o que dá para fazer no site",
    "- descobrir qual página ou agente usar",
    "- seguir um passo a passo rápido sem cair em burocracia",
    "",
    "Se quiser, me diga o que você quer resolver e eu sigo pelo caminho mais direto.",
  ].join("\n");
}

export function isInternalTechnicalAccessQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const codeSignals = [
    "clonar os codigos internos",
    "clonar os codigos",
    "acessar os codigos internos",
    "codigo interno",
    "codigo fonte",
    "repositorio interno",
    "repositorio privado",
  ];
  return codeSignals.some((signal) => normalized.includes(signal));
}

export function buildInternalTechnicalAccessReply() {
  return [
    "Eu não consigo liberar acesso aos códigos internos por aqui.",
    "",
    "Se você precisa desse tipo de acesso, o caminho correto é contatar o Admin do workspace ou o responsável interno pela administração da plataforma.",
    "",
    "Se quiser, eu posso te ajudar a identificar se a sua necessidade é de uso da plataforma, documentação ou acesso administrativo.",
  ].join("\n");
}

export function isDocumentationExplainQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "base interna documental",
    "documentacao interna do eiah",
    "documentacao do eiah",
    "consulta da base interna documental do eiah",
    "guia do usuario",
    "guia do usuário",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function buildDocumentationExplainReply() {
  return [
    "A base documental do EIAH reúne guias, playbooks e referências internas para explicar como a plataforma funciona.",
    "",
    "Ela serve principalmente para:",
    "- orientar páginas e fluxos",
    "- responder dúvidas de uso com base interna",
    "- mostrar próximos passos sem inventar funcionalidade",
    "",
    "Se você quiser, eu posso resumir uma área específica, como Runs, Billing, Marketplace, IMOB ou Agentes.",
  ].join("\n");
}

function buildPlatformOverviewReply() {
  return [
    "**Como a plataforma EIAH se organiza**",
    "",
    "O EIAH combina chat, agentes, runs, billing e verticais para te ajudar a sair de uma dúvida até uma execução com mais contexto.",
    "",
    "Na prática, a plataforma se divide assim:",
    "- `Runs`: executar, simular e acompanhar tarefas",
    "- `Agentes`: ver especialistas disponíveis no workspace",
    "- `Billing`: plano, uso, faturas e cobrança",
    "- `Marketplace`: ativar agentes e módulos",
    "- `IMOB`: contexto imobiliário, pipeline e acompanhamento",
    "",
    "Se você quiser, eu posso te explicar só uma dessas áreas agora.",
  ].join("\n");
}

function buildPagesOverviewReply() {
  return [
    "**Como pensar as páginas do EIAH**",
    "",
    "- `Runs`: quando você quer criar, simular ou acompanhar execução",
    "- `Agentes`: quando quer entender qual especialista usar",
    "- `Billing`: quando quer ver plano, uso e faturas",
    "- `Marketplace`: quando quer instalar agentes ou módulos",
    "- `IMOB`: quando quer acompanhar jornada e contexto imobiliário",
    "",
    "Se você me disser a área, eu te explico a página certa e o próximo passo.",
  ].join("\n");
}

function buildAgentsOverviewReply() {
  return [
    "**Como pensar a área de Agentes**",
    "",
    "Use `Agentes` quando você quiser entender qual especialista faz mais sentido para o seu caso.",
    "",
    "Na prática, essa área te ajuda a:",
    "- ver quais especialistas estão disponíveis no workspace",
    "- entender o foco de cada agente",
    "- decidir quando seguir com o EIAH ou quando aprofundar em um especialista",
    "",
    "Se quiser, eu também posso te dizer qual agente usar em um caso específico.",
  ].join("\n");
}

function buildAgentsGovernanceInventoryReply() {
  return [
    "**Como ler o inventário governado de agentes**",
    "",
    "Esse bloco mostra como o agente foi configurado para operar no workspace.",
    "",
    "Na prática, ele te ajuda a ver:",
    "- especialidade do agente",
    "- custo e uso quando houver atividade real",
    "- ferramentas ou integrações declaradas",
    "- nível de risco e necessidade de aprovação",
    "- comprovante e contexto exigidos para uso",
    "",
    "Se você quiser, eu posso te explicar item por item desse bloco.",
  ].join("\n");
}

export function buildPlatformSwitchOfferReply() {
  return [
    "Essa pergunta é sobre a plataforma, não sobre a especialidade deste agente.",
    "",
    "Quer entender melhor a plataforma?",
    "O agente EIAH pode ajudar!",
  ].join("\n");
}

function buildSelfServiceOverviewReply() {
  return [
    "**Como funciona o Self-service**",
    "",
    "O `Self-service` e a area de fluxos guiados da plataforma.",
    "",
    "Na pratica, ele serve para:",
    "- abrir formularios prontos por agente",
    "- coletar contexto de forma guiada",
    "- simular antes de executar",
    "- transformar o formulario em uma run real quando o agente estiver liberado no workspace",
    "",
    "O catalogo de recipes do tenant controla quais caminhos guiados aparecem para cada workspace.",
  ].join("\n");
}

function buildRecipesOverviewReply() {
  return [
    "**Como funcionam recipes**",
    "",
    "Recipe e a camada de governanca que libera um caminho guiado por agente no workspace.",
    "",
    "Estados principais:",
    "- `draft`: salva no catalogo do tenant, mas ainda nao libera para uso visivel no workspace",
    "- `homologated`: libera a recipe para aparecer no self-service conforme o escopo configurado",
    "",
    "Importante: a recipe publica contexto e visibilidade. Ela nao cria sozinha um formulario novo se a rota do agente ja for fixa no codigo.",
  ].join("\n");
}

function buildPreviewProductionReply() {
  return [
    "**Preview, rodar agora e promover para producao**",
    "",
    "- `Simular`: gera uma prévia técnica sem executar o efeito real",
    "- `Rodar agora`: tenta criar a run real diretamente",
    "- `Promover para producao`: pega uma prévia aprovada e transforma em execucao real",
    "",
    "Em resumo: simular e ensaio. Producao e execucao real do agente.",
  ].join("\n");
}

function buildAgentNotEnabledReply() {
  return [
    "**Por que o agente nao esta habilitado no workspace**",
    "",
    "Esse bloqueio normalmente significa que esse agente ainda nao foi liberado para uso nesse workspace.",
    "",
    "Isso e diferente de billing:",
    "- plano e limites: controlam se o workspace pode executar dentro da politica de cobranca",
    "- habilitacao do agente: controla se um agente especifico esta liberado naquele workspace",
    "",
    "Por isso, voce pode conseguir simular e ainda assim ficar bloqueado para rodar em producao.",
  ].join("\n");
}

function buildWorkspaceEnablementReply() {
  return [
    "**O que precisa para liberar um agente no workspace**",
    "",
    "Para um agente rodar em producao, normalmente voce precisa de duas coisas:",
    "1. o workspace com plano e limites habilitados;",
    "2. o agente liberado para uso naquele workspace.",
    "",
    "Se faltar a liberacao do agente, aparece o erro de agente nao habilitado. Se faltarem plano ou limites, o bloqueio tende a ser de cobranca.",
  ].join("\n");
}

function buildFastPathReply() {
  return [
    "**Caminho rápido sem burocracia**",
    "",
    "Se você quiser ir pelo caminho mais direto, use esta sequência:",
    "1. diga o objetivo em uma frase;",
    "2. eu te indico a área certa: Runs, Agentes, Billing, IMOB ou proposta;",
    "3. se precisar, eu já te encaminho para o especialista certo.",
    "",
    "Se quiser começar agora, me diga o que você quer resolver.",
  ].join("\n");
}

function buildAppShortcutReply(input: string): string | null {
  const normalized = normalizeIntentText(input);

  if (normalized.includes("/app/runs#runs-criar")) {
    return [
      "**Abrir criação de run**",
      "",
      "Esse atalho te leva direto para o ponto de criação de execução em `Runs`.",
      "",
      "**Abrir agora**",
      "- [Runs · criar](/app/runs#runs-criar)",
    ].join("\n");
  }

  if (normalized.includes("/app/billing")) {
    return [
      "**Abrir Billing**",
      "",
      "Esse atalho leva para a área de plano, uso, invoices e cobrança do workspace.",
      "",
      "**Abrir agora**",
      "- [Billing](/app/billing)",
    ].join("\n");
  }

  if (normalized.includes("/app/imob/dashboard")) {
    return [
      "**Abrir Dashboard IMOB**",
      "",
      "Esse atalho leva para a visão de pipeline, contexto operacional e evolução das etapas do IMOB.",
      "",
      "**Abrir agora**",
      "- [Dashboard IMOB](/app/imob/dashboard)",
    ].join("\n");
  }

  if (normalized.includes("/app/imob/chat")) {
    return [
      "**Abrir Chat IMOB**",
      "",
      "Esse atalho leva para o chat contextual do IMOB para orientar o próximo passo do caso atual.",
      "",
      "**Abrir agora**",
      "- [Chat IMOB](/app/imob/chat)",
    ].join("\n");
  }

  if (normalized.includes("/app/marketplace/imob")) {
    return [
      "**Abrir Marketplace IMOB**",
      "",
      "Esse atalho leva para a instalação/ativação do IMOB no workspace.",
      "",
      "**Abrir agora**",
      "- [Marketplace IMOB](/app/marketplace/imob)",
    ].join("\n");
  }

  return null;
}

export function isHostileInput(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "filho da puta",
    "fdp",
    "vai se foder",
    "vai tomar no cu",
    "puta que pariu",
    "caralho",
    "merda",
    "idiota",
    "imbecil",
    "otario",
    "otário",
    "burro",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function buildHostileInputReply() {
  return [
    "Posso continuar te ajudando, mas preciso que você me diga o que quer resolver.",
    "",
    "Se quiser seguir, me diga sua dúvida sobre a plataforma e eu respondo de forma direta.",
  ].join("\n");
}

export function buildDeterministicPlaybookReply() {
  return [
    "**Resumo**",
    "O EIAH te ajuda a entender a plataforma e seguir o melhor caminho para cada tarefa.",
    "",
    "**O que eu cubro aqui**",
    "- orientação sobre Runs, Agentes, Billing, Marketplace, IMOB, Self-service e Perfil",
    "- ajuda passo a passo para usar páginas e fluxos",
    "- apoio comercial para proposta, plano e estimativa",
    "- encaminhamento para especialistas quando fizer mais sentido",
    "",
    "Se você quiser, me diga o que está tentando resolver e eu já te respondo do jeito mais direto.",
  ].join("\n");
}

export function buildDeterministicHelpReply(input: string): string | null {
  const normalized = normalizeIntentText(input);
  const appShortcut = buildAppShortcutReply(input);
  if (appShortcut) return appShortcut;

  if (
    normalized.includes("explique a plataforma") ||
    normalized.includes("explica a plataforma") ||
    normalized.includes("como a plataforma funciona") ||
    normalized.includes("o que da para fazer no site") ||
    normalized.includes("o que dá para fazer no site") ||
    normalized.includes("o que posso fazer no site") ||
    normalized.includes("o que posso fazer aqui")
  ) {
    return buildPlatformOverviewReply();
  }

  if (
    normalized.includes("explique as paginas") ||
    normalized.includes("explique as páginas") ||
    normalized.includes("explica as paginas") ||
    normalized.includes("explica as páginas") ||
    normalized.includes("quais paginas eu devo usar") ||
    normalized.includes("quais páginas eu devo usar")
  ) {
    return buildPagesOverviewReply();
  }

  if (
    normalized === "agentes" ||
    normalized.startsWith("agentes") ||
    normalized.includes("sobre agentes") ||
    normalized.includes("area de agentes") ||
    normalized.includes("área de agentes") ||
    normalized.includes("como funcionam os agentes") ||
    normalized.includes("como funcionam agentes")
  ) {
    return buildAgentsOverviewReply();
  }

  if (
    normalized.includes("selecione um agente") ||
    normalized.includes("escolher um agente") ||
    normalized.includes("escolher agente") ||
    normalized.includes("por que escolher um agente") ||
    normalized.includes("qual a vantagem de escolher um agente") ||
    normalized.includes("o que eu ganho ao escolher um agente") ||
    normalized.includes("quando escolher um agente")
  ) {
    return [
      "Escolher um agente te dá foco no domínio certo.",
      "",
      "Sem escolher, você pode falar comigo no EIAH e eu faço a triagem: explico a plataforma, entendo a intenção e te encaminho quando necessário.",
      "",
      "Escolhendo um especialista, você ganha:",
      "- respostas mais curtas e específicas no tema certo",
      "- menos triagem e menos ambiguidade",
      "- mais profundidade no domínio escolhido",
      "",
      "Na prática:",
      "- J_360: contratos, cláusulas e risco jurídico",
      "- FinNexus: pagamentos, pendências e conciliação",
      "- Guardian: evidências, integridade e verificabilidade",
      "- AADV: consolidação de evidências e próximos passos executivos",
      "- DeFi One: simulação DeFi, custo e risco",
      "",
      "Se você ainda não souber qual agente usar, pode começar comigo no EIAH que eu direciono a conversa pelo caminho mais útil.",
    ].join("\n");
  }

  if (
    normalized.includes("inventario governado de agentes") ||
    normalized.includes("inventário governado de agentes") ||
    normalized.includes("inventario de agentes") ||
    normalized.includes("inventário de agentes") ||
    normalized.includes("governanca de agentes") ||
    normalized.includes("governança de agentes")
  ) {
    return buildAgentsGovernanceInventoryReply();
  }

  if (
    normalized.includes("self-service") ||
    normalized.includes("self service") ||
    normalized.includes("formulario guiado") ||
    normalized.includes("formulario guiado do agente")
  ) {
    return buildSelfServiceOverviewReply();
  }

  if (
    normalized.includes("recipe") ||
    normalized.includes("recipes") ||
    normalized.includes("draft e homologado") ||
    normalized.includes("draft ou homologado") ||
    normalized.includes("homologar recipe") ||
    normalized.includes("catalogo interno homologado")
  ) {
    return buildRecipesOverviewReply();
  }

  if (
    normalized.includes("preview") ||
    normalized.includes("simular") ||
    normalized.includes("promover para producao") ||
    normalized.includes("promover para produção") ||
    normalized.includes("rodar agora") ||
    normalized.includes("diferenca entre simular e rodar") ||
    normalized.includes("diferenca entre preview e producao") ||
    normalized.includes("diferença entre preview e produção")
  ) {
    return buildPreviewProductionReply();
  }

  if (
    normalized.includes("nao esta habilitado no workspace") ||
    normalized.includes("nao está habilitado no workspace") ||
    normalized.includes("agent not enabled") ||
    normalized.includes("agente nao habilitado") ||
    normalized.includes("agente não habilitado")
  ) {
    return buildAgentNotEnabledReply();
  }

  if (
    normalized.includes("habilitar agente no workspace") ||
    normalized.includes("liberar agente no workspace") ||
    normalized.includes("enablement do agente") ||
    normalized.includes("assignment do agente")
  ) {
    return buildWorkspaceEnablementReply();
  }

  if (
    normalized.includes("passo a passo rapido sem cair em burocracia") ||
    normalized.includes("passo a passo rápido sem cair em burocracia") ||
    normalized.includes("sem cair em burocracia")
  ) {
    return buildFastPathReply();
  }

  if (
    normalized.includes("acompanho o status") ||
    normalized.includes("acompanhar status") ||
    normalized.includes("status de uma run") ||
    normalized.includes("status em tempo real")
  ) {
    return [
      "**Como acompanhar status de run em tempo real**",
      "",
      "1. Abra `Runs` e selecione a execução que deseja acompanhar.",
      "2. Observe os indicadores de andamento (em execução, sucesso, falha ou bloqueio).",
      "3. Use o botão de atualizar para recarregar eventos recentes quando necessário.",
      "4. Abra o resultado da run para validar saída, evidências e próximo passo.",
      "",
      "**Atalhos**",
      "- [Runs · status](/app/runs#runs-status)",
      "- [Runs · resultado](/app/runs#runs-resultado)",
    ].join("\n");
  }

  if (normalized.includes("como criar um run") || (normalized.includes("criar") && normalized.includes("run"))) {
    return [
      "**Como criar um run no EIAH**",
      "",
      "1. Abra `Runs` no menu principal.",
      "2. Escolha o agente que vai executar a tarefa.",
      "3. Escreva o objetivo em linguagem simples no campo de entrada.",
      "4. Comece por **Simular primeiro** para validar sem risco.",
      "5. Se o resultado estiver ok, clique em **Rodar agora**.",
      "6. Acompanhe status, custo e resultado no histórico da própria página.",
      "",
      "**Atalho**",
      "- [Runs · criar](/app/runs#runs-criar)",
    ].join("\n");
  }

  if (normalized.includes("billing") || normalized.includes("invoice") || normalized.includes("cobranca")) {
    return [
      "No EIAH, o billing combina plano contratado com uso do workspace para compor o custo mensal.",
      "",
      "O que entra nessa visão:",
      "- resumo do plano ativo",
      "- uso de runs e usuários do workspace",
      "- faturas, cobranças e histórico",
      "",
      "Como ler isso rapidamente:",
      "- plano define a base contratada",
      "- usuários e runs mostram o volume operacional",
      "- faturas mostram o fechamento financeiro",
      "",
      "Se quiser consultar isso agora, o melhor caminho é abrir [Billing](/app/billing).",
    ].join("\n");
  }

  if (
    normalized.includes("endpoint") ||
    normalized.includes("/api/") ||
    normalized.includes("api no eiah") ||
    normalized.includes("rotas da api") ||
    normalized.includes("endpoints da api")
  ) {
    return [
      "**API no EIAH (visão rápida)**",
      "",
      "- Runs: execução, eventos e histórico.",
      "- Billing: resumo, uso, limites e faturas.",
      "- Help: consulta da base interna documental do EIAH.",
      "",
      "**Exemplos**",
      "- `/api/runs/*`",
      "- `/api/billing/*`",
      "- `/api/help/eiah/query`",
    ].join("\n");
  }

  if (
    normalized.includes("exemplo pratico") ||
    normalized === "mostre um exemplo" ||
    normalized === "mostre um exemplo pratico"
  ) {
    return [
      "Claro. Um exemplo simples seria este:",
      "",
      "Você me diz algo como `quero criar um run para analisar um caso comercial`.",
      "A partir disso, eu te mostro onde fazer isso, qual agente usar e qual é o próximo passo mais seguro.",
      "",
      "Também posso te ajudar com coisas como criar runs, escolher agentes, revisar billing, orientar IMOB ou montar proposta comercial.",
    ].join("\n");
  }

  if (normalized.includes("riscos comuns") || normalized.includes("quais riscos")) {
    return [
      "Os riscos mais comuns são estes:",
      "",
      "- escolher o agente errado para o objetivo",
      "- executar sem simular quando o caso ainda é novo",
      "- pedir algo amplo demais sem dizer o resultado esperado",
      "- avançar em fluxo sensível sem revisar risco ou aprovação",
    ].join("\n");
  }

  if (normalized.includes("proximos passos") || normalized.includes("próximos passos")) {
    return [
      "Os próximos passos dependem do que você quer resolver, mas o caminho mais comum é:",
      "",
      "1. definir o objetivo principal",
      "2. escolher a área certa: Runs, Agentes, Billing, IMOB ou proposta",
      "3. seguir o próximo passo guiado pelo launcher",
    ].join("\n");
  }

  return null;
}

export function buildOrchestratorGuidanceReply() {
  return [
    "**Como eu te ajudo com fluxos**",
    "",
    "Se você me mostrar um fluxo, eu posso ajudar a:",
    "- identificar gargalos",
    "- sugerir o próximo passo mais seguro",
    "- apontar quando vale usar especialista",
    "",
    "Se quiser, descreva o cenário e eu sigo por essa linha.",
  ].join("\n");
}

export function buildContextualFallback() {
  return "Posso te ajudar a entender a plataforma, explicar páginas e indicar o melhor próximo passo. Se você me disser o objetivo, eu sigo de forma mais direta.";
}
