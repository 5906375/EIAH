import type { ActionCriticality } from "../actionRegistry";
import { registerAction } from "../actionRegistry";
import { aadvAgent, aadvProfile } from "./aadvAction";
import { defiOneAgent, defiOneProfile } from "./defiOneAction";
import { diariasAgent, diariasProfile } from "./diariasAction";
import { eiahAgent, eiahProfile } from "./eiahAction";
import { finNexusAgent, finNexusProfile } from "./finNexusAction";
import { flowOrchestratorAgent, flowOrchestratorProfile } from "./flowOrchestratorAction";
import { guardianAgent, guardianProfile } from "./guardianAction";
import { iBCAgent, iBcProfile } from "./iBCAction";
import { imageNftDiariasAgent, imageNftDiariasProfile } from "./imageNftDiariasAction";
import { j360Agent, j360Profile } from "./j360Action";
import { mktAgent, marketingProfile } from "./mktAction";
import { nftPyAgent, nftPyProfile } from "./nftPyAction";
import { onchainMonitorAgent, onchainMonitorProfile } from "./onchainMonitorAction";
import { pitchAgent, pitchProfileThinking } from "./pitchAction";
import { riskAnalyzerAgent, riskAnalyzerProfile } from "./riskAnalyzerAction";

export * from "./aadvAction";
export * from "./defiOneAction";
export * from "./diariasAction";
export * from "./eiahAction";
export * from "./finNexusAction";
export * from "./flowOrchestratorAction";
export * from "./guardianAction";
export * from "./iBCAction";
export * from "./imageNftDiariasAction";
export * from "./j360Action";
export * from "./mktAction";
export * from "./nftPyAction";
export * from "./onchainMonitorAction";
export * from "./pitchAction";
export * from "./riskAnalyzerAction";

const profileCriticality: ActionCriticality = "low";
const agentActionDefinitions = [
  { name: "aadv", description: aadvProfile.description, handler: aadvAgent, version: "v1", criticality: profileCriticality },
  { name: "defiOne", description: defiOneProfile.description, handler: defiOneAgent, version: "v1", criticality: profileCriticality },
  { name: "diarias", description: diariasProfile.description, handler: diariasAgent, version: "v1", criticality: profileCriticality },
  { name: "eiah", description: eiahProfile.description, handler: eiahAgent, version: "v1", criticality: profileCriticality },
  { name: "finNexus", description: finNexusProfile.description, handler: finNexusAgent, version: "v1", criticality: profileCriticality },
  {
    name: "flowOrchestrator",
    description: flowOrchestratorProfile.description,
    handler: flowOrchestratorAgent,
    version: "v1",
    criticality: profileCriticality,
  },
  { name: "guardian", description: guardianProfile.description, handler: guardianAgent, version: "v1", criticality: profileCriticality },
  { name: "iBC", description: iBcProfile.description, handler: iBCAgent, version: "v1", criticality: profileCriticality },
  {
    name: "imageNftDiarias",
    description: imageNftDiariasProfile.description,
    handler: imageNftDiariasAgent,
    version: "v1",
    criticality: profileCriticality,
  },
  { name: "j360", description: j360Profile.description, handler: j360Agent, version: "v1", criticality: profileCriticality },
  { name: "mkt", description: marketingProfile.description, handler: mktAgent, version: "v1", criticality: profileCriticality },
  { name: "nftPy", description: nftPyProfile.description, handler: nftPyAgent, version: "v1", criticality: profileCriticality },
  {
    name: "onchainMonitor",
    description: onchainMonitorProfile.description,
    handler: onchainMonitorAgent,
    version: "v1",
    criticality: profileCriticality,
  },
  { name: "pitch", description: pitchProfileThinking.description, handler: pitchAgent, version: "v1", criticality: profileCriticality },
  {
    name: "riskAnalyzer",
    description: riskAnalyzerProfile.description,
    handler: riskAnalyzerAgent,
    version: "v1",
    criticality: profileCriticality,
  },
];

export function registerAgentProfileActions() {
  agentActionDefinitions.forEach((action) => registerAction(action));
}
