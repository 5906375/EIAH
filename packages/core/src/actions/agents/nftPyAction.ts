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
