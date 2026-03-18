import type { AgentProfileSeed } from "./types";

import { aadvProfile } from "./aadvAction";
import { finNexusProfile } from "./finNexusAction";
import { flowOrchestratorProfile } from "./flowOrchestratorAction";
import { riskAnalyzerProfile } from "./riskAnalyzerAction";
import { onchainMonitorProfile } from "./onchainMonitorAction";
import { iBcProfile } from "./iBCAction";
import { diariasProfile } from "./diariasAction";
import { nftPyProfile } from "./nftPyAction";
import { imageNftDiariasProfile } from "./imageNftDiariasAction";
import { defiOneProfile } from "./defiOneAction";
import { pitchProfileThinking as pitchProfile } from "./pitchAction";
import { marketingProfile } from "./mktAction";
import { j360Profile } from "./j360Action";
import { eiahProfile } from "./eiahAction";
import { guardianProfile } from "./guardianAction";

export type { AgentProfileSeed } from "./types";

export const agentProfiles: AgentProfileSeed[] = [
  aadvProfile,
  finNexusProfile,
  flowOrchestratorProfile,
  riskAnalyzerProfile,
  onchainMonitorProfile,
  iBcProfile,
  diariasProfile,
  nftPyProfile,
  imageNftDiariasProfile,
  defiOneProfile,
  pitchProfile,
  marketingProfile,
  j360Profile,
  eiahProfile,
  guardianProfile,
];
