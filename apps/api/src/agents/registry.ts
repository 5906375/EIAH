import type { AgentProfileSeed } from "./types";

import { finNexusProfile } from "./finNexus";
import { flowOrchestratorProfile } from "./flowOrchestrator";
import { riskAnalyzerProfile } from "./riskAnalyzer";
import { onchainMonitorProfile } from "./onchainMonitor";
import { iBcProfile } from "./iBC";
import { diariasProfile } from "./diarias";
import { nftPyProfile } from "./nftPy";
import { imageNftDiariasProfile } from "./imageNftDiarias";
import { defiOneProfile } from "./defiOne";
import { pitchProfile } from "./pitch";
import { marketingProfile } from "./mkt";
import { j360Profile } from "./j360";
import { eiahProfile } from "./eiah";
import { guardianProfile } from "./guardian";

export type { AgentProfileSeed } from "./types";

export const agentProfiles: AgentProfileSeed[] = [
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
