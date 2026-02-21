
export type HallucinationJudgment = {
  confidence: number;
  reasons: string[];
  policyVersion: "judge-v1";
  modelVersion?: string;
};

type JudgeGateModule = {
  evaluateHallucination: (params: {
    action: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    toolVersion?: string;
  }) => Promise<HallucinationJudgment>;
};

let judgeGateModulePromise: Promise<JudgeGateModule> | null = null;

async function loadJudgeGateModule() {
  if (!judgeGateModulePromise) {
    const url = new URL("../../../api/src/services/judgeGate.ts", import.meta.url);
    judgeGateModulePromise = import(url.href) as Promise<JudgeGateModule>;
  }
  return judgeGateModulePromise;
}

export async function evaluateHallucination(params: {
  action: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  toolVersion?: string;
}) {
  const mod = await loadJudgeGateModule();
  return mod.evaluateHallucination(params);
}
