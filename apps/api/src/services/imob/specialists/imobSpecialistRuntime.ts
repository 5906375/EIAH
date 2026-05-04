import type { ImobEvidenceRef } from "../imobConversationContract";

export type ImobSpecialistId =
  | "imob.lead_scoring_agent"
  | "imob.profile_analyst"
  | "imob.viability_analyst"
  | "imob.reengagement_agent"
  | "imob.inventory_watch_agent"
  | "imob.closing_agent"
  | "imob.relationship_memory_agent"
  | "imob.mission_orchestrator";

export type ImobSpecialistExecution<TInput, TOutput> = {
  specialistId: ImobSpecialistId;
  capabilityId: string;
  version: string;
  input: TInput;
  output: TOutput;
  reasonCodes: string[];
  evidenceRefs: ImobEvidenceRef[];
  generatedAt: string;
};

export function createImobSpecialistExecution<TInput, TOutput>(params: {
  specialistId: ImobSpecialistId;
  capabilityId: string;
  version: string;
  input: TInput;
  output: TOutput;
  reasonCodes?: string[] | null;
  evidenceRefs?: ImobEvidenceRef[] | null;
  generatedAt?: string | null;
}) {
  return {
    specialistId: params.specialistId,
    capabilityId: params.capabilityId,
    version: params.version,
    input: params.input,
    output: params.output,
    reasonCodes: Array.from(new Set((params.reasonCodes ?? []).filter(Boolean))),
    evidenceRefs: params.evidenceRefs ?? [],
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  } satisfies ImobSpecialistExecution<TInput, TOutput>;
}
