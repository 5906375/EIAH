export type MarketScanLlmTask =
  | "intent_router"
  | "query_builder"
  | "market_analysis"
  | "policy_judge"
  | "final_response";

export type MarketScanModelTaskPolicy = {
  task: MarketScanLlmTask;
  providerEnv: string;
  modelEnv: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | null;
  temperature: number;
  requiresStructuredOutput: boolean;
  requiresEvidence: boolean;
};

export const MARKET_SCAN_MODEL_POLICY_VERSION = "1.0" as const;

export const DEFAULT_MARKET_SCAN_MODEL_POLICY: Record<MarketScanLlmTask, MarketScanModelTaskPolicy> = {
  intent_router: {
    task: "intent_router",
    providerEnv: "IMOB_MARKET_SCAN_ROUTER_PROVIDER",
    modelEnv: "IMOB_MARKET_SCAN_ROUTER_MODEL",
    reasoningEffort: "low",
    temperature: 0,
    requiresStructuredOutput: true,
    requiresEvidence: false,
  },
  query_builder: {
    task: "query_builder",
    providerEnv: "IMOB_MARKET_SCAN_QUERY_PROVIDER",
    modelEnv: "IMOB_MARKET_SCAN_QUERY_MODEL",
    reasoningEffort: "low",
    temperature: 0,
    requiresStructuredOutput: true,
    requiresEvidence: false,
  },
  market_analysis: {
    task: "market_analysis",
    providerEnv: "IMOB_MARKET_SCAN_ANALYSIS_PROVIDER",
    modelEnv: "IMOB_MARKET_SCAN_ANALYSIS_MODEL",
    reasoningEffort: "medium",
    temperature: 0.2,
    requiresStructuredOutput: false,
    requiresEvidence: true,
  },
  policy_judge: {
    task: "policy_judge",
    providerEnv: "IMOB_MARKET_SCAN_JUDGE_PROVIDER",
    modelEnv: "IMOB_MARKET_SCAN_JUDGE_MODEL",
    reasoningEffort: "medium",
    temperature: 0,
    requiresStructuredOutput: true,
    requiresEvidence: true,
  },
  final_response: {
    task: "final_response",
    providerEnv: "IMOB_MARKET_SCAN_WRITER_PROVIDER",
    modelEnv: "IMOB_MARKET_SCAN_WRITER_MODEL",
    reasoningEffort: "low",
    temperature: 0.3,
    requiresStructuredOutput: false,
    requiresEvidence: true,
  },
};

export function resolveMarketScanModelTaskPolicy(task: MarketScanLlmTask) {
  return DEFAULT_MARKET_SCAN_MODEL_POLICY[task];
}

