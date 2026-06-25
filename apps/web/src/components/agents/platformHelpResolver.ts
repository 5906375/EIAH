import type { Agent } from "@/lib/api";
import {
  buildPublicTaxonomyBoundaryLine,
  buildPublicTaxonomyRoadmapLine,
  buildPublicTaxonomySummaryLine,
} from "@/components/agents/publicProductTaxonomyCopy";

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  return agent?.name || "EIAH";
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
    buildPublicTaxonomySummaryLine(),
    "",
    "Na prática, a plataforma se divide assim:",
    "- `Runs`: executar, simular e acompanhar tarefas",
    "- `Agentes`: ver especialistas disponíveis no workspace",
    "- `Billing`: plano, uso, faturas e cobrança",
    "- `Marketplace`: ativar agentes e módulos",
    "- `IMOB`: contexto imobiliário, pipeline e acompanhamento",
    "",
    buildPublicTaxonomyBoundaryLine(),
    buildPublicTaxonomyRoadmapLine(),
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
    buildPublicTaxonomySummaryLine(),
    "",
    "Na prática, essa área te ajuda a:",
    "- ver quais especialistas estão disponíveis no workspace",
    "- entender o foco de cada agente",
    "- decidir quando seguir com o EIAH ou quando aprofundar em um especialista",
    "",
    "Se quiser, eu também posso te dizer qual agente usar em um caso específico.",
  ].join("\n");
}

function buildAgentsCardReadingReply() {
  return [
    "**Como ler os cards dos agentes**",
    "",
    "Ao olhar um agente, observe principalmente:",
    "- especialidade",
    "- disponibilidade no workspace",
    "- risco e necessidade de aprovação",
    "- integrações declaradas",
    "- comprovantes ou contexto exigidos",
    "",
    "Esses sinais ajudam a decidir se o agente é adequado ao caso e ao nível de governança exigido.",
  ].join("\n");
}

function buildEiahVsSpecialistReply() {
  return [
    "**Quando usar o EIAH e quando usar especialista**",
    "",
    "- `EIAH`: triagem, navegação, comparação de páginas e próximo passo",
    "- `Especialista`: profundidade de domínio e contexto específico",
    "",
    buildPublicTaxonomySummaryLine(),
    "",
    "Regra prática:",
    "- comece pelo `EIAH` quando a dúvida ainda estiver aberta",
    "- use um especialista quando o caso já estiver claramente dentro de um domínio",
  ].join("\n");
}

function buildChatVsImobReply() {
  return [
    "**Chat principal e Chat IMOB: quando usar cada um**",
    "",
    "- `Chat principal`: triagem, páginas da plataforma, comparação de caminhos e próximo passo",
    "- `Chat IMOB`: orientação contextual de casos e jornadas da operação imobiliária",
    "",
    "Regra prática:",
    "- comece no `Chat` quando a dúvida ainda estiver aberta",
    "- use `Chat IMOB` quando o caso já for claramente imobiliário",
  ].join("\n");
}

function buildChatTriageReply() {
  return [
    "**Como funciona a triagem do EIAH**",
    "",
    "O `EIAH` atua como front door da conversa.",
    "",
    "Na prática, ele faz três coisas:",
    "- entende sua intenção",
    "- escolhe a área mais adequada da plataforma",
    "- encaminha para especialista quando a profundidade do caso exigir",
  ].join("\n");
}

function buildChatHandoffReply() {
  return [
    "**Como o EIAH faz handoff para especialista**",
    "",
    "O handoff acontece quando a conversa sai da orientação geral e entra em profundidade de domínio.",
    "",
    "Sinais típicos:",
    "- necessidade jurídica, financeira ou vertical específica",
    "- decisão crítica",
    "- contexto que exige especialista com mais profundidade",
  ].join("\n");
}

function buildChatVsRunsReply() {
  return [
    "**Quando usar Chat e quando usar Runs**",
    "",
    "- `Chat`: entender o caminho, escolher especialista, esclarecer contexto",
    "- `Runs`: executar a ação prática",
    "",
    "Regra simples:",
    "- se você ainda está decidindo, fique no `Chat`",
    "- se você já sabe o que quer executar, vá para `Runs`",
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

  if (normalized.includes("economy") || normalized.includes("oportunidade") || normalized.includes("impacto")) {
    return [
      "**Como funciona a página Economy**",
      "",
      "A `Economy` mostra impacto consolidado, oportunidades e priorização econômica da operação.",
      "",
      "**Como usar na prática**",
      "1. Veja primeiro as oportunidades priorizadas.",
      "2. Compare o impacto estimado de cada uma.",
      "3. Use `Billing` para validar consumo e custo real.",
      "4. Use `Runs` quando a oportunidade precisar virar ação prática.",
      "",
      "**Como interpretar**",
      "- `Economy`: decide onde agir",
      "- `Billing`: confirma custo, uso e consistência financeira",
      "- `Runs`: executa a ação",
      "",
      "**Perguntas úteis**",
      "- como priorizar oportunidades?",
      "- qual a diferença entre Economy, Billing e Runs?",
    ].join("\n");
  }

  if (
    normalized.includes("marketplace") ||
    normalized.includes("nao instalado") ||
    normalized.includes("não instalado") ||
    normalized.includes("ativar modulo") ||
    normalized.includes("ativar módulo") ||
    normalized.includes("habilitado")
  ) {
    return [
      "**Como funciona o Marketplace**",
      "",
      "O `Marketplace` é a área onde você ativa agentes, módulos e verticais no workspace.",
      "",
      "**Como usar na prática**",
      "1. Abra o item que você quer liberar.",
      "2. Veja se o status está como `não instalado` ou já ativado.",
      "3. Ative o módulo quando quiser liberar a capacidade operacional.",
      "4. Depois volte para `Chat`, `Runs` ou a vertical correspondente.",
      "",
      "**Como interpretar**",
      "- `não instalado`: ainda não disponível para uso",
      "- `ativado`: capacidade liberada no workspace",
      "- ativação não substitui `Billing`: preço e consumo real são vistos lá",
    ].join("\n");
  }

  if (normalized.includes("perfil")) {
    return [
      "**Como funciona a página Perfil**",
      "",
      "A `Perfil` é a área para confirmar conta, workspace ativo e contexto de acesso antes de concluir que algo está indisponível.",
      "",
      "**Como usar na prática**",
      "1. Abra `Perfil`.",
      "2. Confirme se o workspace ativo é o correto.",
      "3. Verifique se o seu acesso está coerente com a operação esperada.",
      "4. Depois volte para `Chat`, `Agentes` ou `Marketplace` com o contexto validado.",
      "",
      "**Como interpretar**",
      "- `Perfil`: valida identidade e contexto",
      "- `Marketplace`: valida ativação de módulo ou vertical",
      "- `Chat` e `Agentes`: dependem desse contexto para responder corretamente",
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
