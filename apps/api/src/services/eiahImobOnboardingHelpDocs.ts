import {
  ImobOnboardingIntent,
  type ImobOnboardingResponse,
} from "./eiah/contracts/imobOnboardingResponse.v1";
import { resolveImobOnboardingResponse } from "./imob/orchestrator/imobOnboardingResolver";

export type EiahHelpDoc = {
  id: string;
  scope: "eiah";
  question: string;
  answer: string;
  tags: string[];
  track?: "P0" | "P1" | "P2" | "P3" | "P4";
  status?: "evidenciado" | "parcial" | "proposta" | "canonica";
  sourceFiles: string[];
  updatedAt: string;
};

function formatImobOnboardingAnswer(response: ImobOnboardingResponse) {
  const promptLines = response.suggestedPrompts
    .slice(0, 6)
    .map((item) => `- ${item.label}: ${item.prompt}`);

  return [
    response.summary,
    `Como começar: ${response.startingInstruction}`,
    promptLines.length > 0 ? `Prompts recomendados:\n${promptLines.join("\n")}` : null,
    `Comportamento esperado: ${response.systemBehaviorNote}`,
    response.handoffShortcut
      ? response.handoffShortcut.allowed
        ? `Próximo passo: abrir Chat IMOB com a mensagem inicial \`${response.handoffShortcut.preloadedMessage}\`.`
        : "Próximo passo: o EIAH pode explicar o uso do IMOB, mas o atalho acionável depende de tenant, workspace e entitlement válidos."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildImobOnboardingHelpDocs(params: {
  sourcePath: string;
  sourceMtime: string;
}): EiahHelpDoc[] {
  const sourceFiles = [
    params.sourcePath,
    "apps/api/src/services/imob/orchestrator/imobOnboardingResolver.ts",
    "apps/api/src/services/imob/imobCapabilityRegistry.ts",
    "apps/api/src/services/imob/imobAccessGate.ts",
  ];

  const docsByIntent = [
    {
      id: "help.eiah.imob.onboarding.general",
      question: "Como usar o chat IMOB?",
      intent: ImobOnboardingIntent.GENERAL_HELP,
      tags: ["help", "imob", "onboarding", "chat"],
    },
    {
      id: "help.eiah.imob.onboarding.capture",
      question: "Como começar uma captação no IMOB?",
      intent: ImobOnboardingIntent.CAPTURE_HELP,
      tags: ["help", "imob", "captacao", "onboarding"],
    },
    {
      id: "help.eiah.imob.onboarding.documents",
      question: "Como continuar um caso imobiliário com documentos no chat IMOB?",
      intent: ImobOnboardingIntent.DOCUMENT_HELP,
      tags: ["help", "imob", "documentos", "onboarding"],
    },
    {
      id: "help.eiah.imob.onboarding.next-step",
      question: "Quais mensagens eu posso usar para continuar um caso no IMOB?",
      intent: ImobOnboardingIntent.NEXT_ACTION_QUERY,
      tags: ["help", "imob", "next_action", "onboarding"],
    },
  ] as const;

  return docsByIntent.map((item) => {
    const response = resolveImobOnboardingResponse({
      intent: item.intent,
    });

    return {
      id: item.id,
      scope: "eiah",
      question: item.question,
      answer: formatImobOnboardingAnswer(response),
      tags: item.tags,
      track: "P1",
      status: "canonica",
      sourceFiles,
      updatedAt: params.sourceMtime,
    } satisfies EiahHelpDoc;
  });
}
