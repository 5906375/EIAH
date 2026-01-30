import type { RunAtivoInterpreter } from "../types";
import type { RunAtivoUniversalInput } from "../validator/runAtivoUniversalInput.schema";
import { interpretMkt } from "./mktInterpreter";
import { interpretJ360 } from "./j360Interpreter";
import { interpretRiskAnalyzer } from "./riskAnalyzerInterpreter";
import { interpretGeneric } from "./genericInterpreter";

const interpreters: Record<string, RunAtivoInterpreter> = {
  mkt: interpretMkt,
  "j_360": interpretJ360,
  j360: interpretJ360,
  "risk-analyzer": interpretRiskAnalyzer,
  risk_analyzer: interpretRiskAnalyzer,
};

export function resolveInterpreter(agent: string) {
  return interpreters[agent.toLowerCase()] ?? interpretGeneric;
}

export function interpretPayload(input: RunAtivoUniversalInput) {
  const interpreter = resolveInterpreter(input.agent);
  return interpreter(input);
}
