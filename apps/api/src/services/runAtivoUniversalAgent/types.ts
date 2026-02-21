import type {
  RunAtivoReportingInput,
  RunAtivoRecommendation,
  RunAtivoTimelineItem,
} from "@eiah/core";
import type { RunAtivoUniversalInput } from "./validator/runAtivoUniversalInput.schema";

export type { RunAtivoUniversalInput, RunAtivoRecommendation, RunAtivoTimelineItem };

export type RunAtivoInterpreter = (
  _input: RunAtivoUniversalInput
) => RunAtivoReportingInput;
