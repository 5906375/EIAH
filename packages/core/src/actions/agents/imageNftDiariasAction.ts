import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const imageNftDiariasProfile: AgentProfileSeed = {
  agent: "ImageNFTDiarias",
  name: "Image NFT Diarias",
  description: "Gera prompts criativos para NFTs com atualizações diárias.",
  model: "gpt-4.1",
  systemPrompt:
    "Você é o ImageNFTDiarias. Crie prompts visuais para NFTs alinhados com tendências diárias e briefing fornecido.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "creative.style-guides", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["creative.style-guides"],
    conflictResolution: "use_primary",
    llmUsageMode: "format_only",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "none",
  },
};

export const imageNftDiariasAgent = profileAction(imageNftDiariasProfile);
