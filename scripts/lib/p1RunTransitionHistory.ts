/** Proposed versioned state history. Inclusion and commit provenance remain unverified. */
import { validateSourceTimestamp } from "./p1SourceMaterial.js";

export const RUN_TRANSITION_VERSION = "p1-run-transition.v1";
const terminal = new Set(["success", "error", "blocked"]);
const pending = new Set(["pending", "running", "awaiting_approval"]);
export type RunTransition = Readonly<{
  schemaVersion: typeof RUN_TRANSITION_VERSION;
  transitionId: string; sequence: number; tenantId: string; workspaceId: string; runId: string;
  previousStatus: string | null; status: string;
  previousFinishedAt: string | null; finishedAt: string | null;
  committedAt: string; producerId: string; operationRef: string;
}>;
export type ReconstructedRun = Readonly<{
  schemaVersion: "p1-reconstructed-run.v1";
  tenantId: string; workspaceId: string; runId: string; cutoffAt: string;
  stateAtCutoff: Readonly<{ status: string; finishedAt: string | null; sequence: number }>;
  lastSequence: number;
  sourceHistoryVerification: "not_demonstrated";
  stateAtCutoffVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;
const fail = (reason: string): never => { throw new Error(reason); };
const validId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim() === v;
const instant = (v: unknown): number => Date.parse(validateSourceTimestamp(v));
function checkState(status: unknown, finishedAt: unknown, createdAt: number, committedAt: number): void {
  if (!terminal.has(status as string) && !pending.has(status as string)) fail("unknown_transition_status");
  if (terminal.has(status as string)) {
    if (finishedAt === null) fail("invalid_terminal_finish");
    const finished = instant(finishedAt);
    if (finished < createdAt || finished > committedAt) fail("invalid_terminal_finish");
  } else if (finishedAt !== null) fail("pending_with_finish");
}
/** Reconstructs INCLUDED events; success does not establish that every writer emitted one. */
export function reconstructRunAtCutoff(input: Readonly<{
  tenantId: string; workspaceId: string; runId: string; createdAt: string; cutoffAt: string;
  transitions: readonly RunTransition[];
  current: Readonly<{ status: string; finishedAt: string | null }>;
}>): ReconstructedRun {
  if (!input || !validId(input.tenantId) || !validId(input.workspaceId) || !validId(input.runId) ||
    !input.current || !Array.isArray(input.transitions) || input.transitions.length === 0) fail("invalid_transition_input");
  const created = instant(input.createdAt), cutoff = instant(input.cutoffAt);
  if (created > cutoff) fail("creation_after_cutoff");
  let status: string | null = null, finishedAt: string | null = null, observed: ReconstructedRun["stateAtCutoff"] | null = null;
  let previousCommit = -Infinity;
  const ids = new Set<string>();
  for (const [position, event] of input.transitions.entries()) {
    if (!event || event.schemaVersion !== RUN_TRANSITION_VERSION || !validId(event.transitionId) ||
      !validId(event.producerId) || !validId(event.operationRef) ||
      event.tenantId !== input.tenantId || event.workspaceId !== input.workspaceId || event.runId !== input.runId)
      fail("invalid_transition_identity");
    if (ids.has(event.transitionId)) fail("duplicate_transition_id");
    ids.add(event.transitionId);
    if (event.sequence !== position) fail("transition_sequence_gap_or_duplicate");
    const committed = instant(event.committedAt);
    if (committed < created || committed < previousCommit) fail("transition_commit_order_invalid");
    previousCommit = committed;
    if (event.previousStatus !== status || event.previousFinishedAt !== finishedAt) fail("transition_chain_mismatch");
    checkState(event.status, event.finishedAt, created, committed);
    status = event.status; finishedAt = event.finishedAt;
    if (committed <= cutoff) observed = { status, finishedAt, sequence: position };
  }
  if (observed === null) fail("initial_transition_after_cutoff");
  if (status !== input.current.status || finishedAt !== input.current.finishedAt) fail("current_run_state_mismatch");
  return { schemaVersion: "p1-reconstructed-run.v1", tenantId: input.tenantId, workspaceId: input.workspaceId,
    runId: input.runId, cutoffAt: input.cutoffAt, stateAtCutoff: observed as ReconstructedRun["stateAtCutoff"], lastSequence: input.transitions.length - 1,
    sourceHistoryVerification: "not_demonstrated", stateAtCutoffVerification: "not_demonstrated", operationalEligibility: "blocked" };
}
