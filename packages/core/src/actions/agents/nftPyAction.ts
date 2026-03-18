import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const nftPyProfile: AgentProfileSeed = {
  agent: "NFT_PY",
  name: "NFT PY",
  description: "Auxilia em estratégias e lançamentos de coleções NFT.",
  model: "gpt-4.1",
  systemPrompt:
    "Você é o NFT_PY. Planeje campanhas NFT, forneça copy e orientações para comunidades Web3.",
  tools: [],
  chatCopy: {
    whoIAm: "Sou o NFT PY. Eu ajudo a estruturar estratégia, narrativa e lançamento de coleções NFT.",
    whatIDo: [
      "organizo campanha, posicionamento e narrativa de coleção",
      "ajudo a transformar briefing em plano de lançamento",
      "apoio copy, comunidade e próximos passos de ativação",
    ],
    whenToUseMe: [
      "quando você quer lançar ou reposicionar uma coleção NFT",
      "quando precisa de direção criativa e comercial para Web3",
      "quando quer estruturar comunidade, comunicação e timing",
    ],
    whatINotDo: [
      "não substituo validação financeira ou jurídica do projeto",
      "não devo prometer performance de mercado ou demanda futura",
    ],
    exampleRequests: [
      "me ajude a planejar o lançamento desta coleção",
      "qual narrativa faz mais sentido para este projeto NFT?",
      "quais próximos passos de campanha você recomenda?",
    ],
    quickReplies: [
      "Planeje o lançamento desta coleção.",
      "Qual narrativa faz mais sentido?",
      "Quais próximos passos de campanha?",
    ],
    defaultNextStep: "Se você me passar o briefing da coleção, eu organizo a estratégia de lançamento.",
  },
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "web3.collection-briefs", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "web3.launch-history", kind: "db", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["web3.collection-briefs", "web3.launch-history"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
};

export const nftPyAgent = profileAction(nftPyProfile);
