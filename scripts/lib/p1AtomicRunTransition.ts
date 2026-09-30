/** Proposed transition transaction contract. No DB adapter, queue or operational attestation. */
import { RUN_TRANSITION_VERSION, type RunTransition } from "./p1RunTransitionHistory.js";
import { validateSourceTimestamp } from "./p1SourceMaterial.js";

export const RUN_TRANSITION_COMMAND_VERSION = "p1-run-transition-command.v1";
export type RunState = Readonly<{ status: string; finishedAt: string | null }>;
export type RunTransitionCommand = Readonly<{
  schemaVersion: typeof RUN_TRANSITION_COMMAND_VERSION;
  commandId: string; tenantId: string; workspaceId: string; runId: string;
  expectedSequence: number; expected: RunState; next: RunState;
  /** Declared clock value; the caller cannot attest DB commit order or visibility. */
  committedAt: string; producerId: string; operationRef: string;
  publish: null | Readonly<{ intentId: string; destination: "runQueue"; payloadRef: string }>;
}>;
export type RunTransitionResult = Readonly<{
  transition: RunTransition;
  publishIntent: null | Readonly<{ intentId: string; commandId: string; destination: "runQueue"; payloadRef: string; state: "pending" }>;
  replayed: boolean;
  historyVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;
export type LockedRunTransaction = Readonly<{
  readRun(): Promise<RunState & Readonly<{ tenantId: string; workspaceId: string; runId: string }>>;
  readLastTransition(): Promise<RunTransition | null>;
  readByCommandId(commandId: string): Promise<RunTransitionResult | null>;
  updateRun(expected: RunState, next: RunState): Promise<void>;
  appendTransition(transition: RunTransition, commandId: string): Promise<void>;
  insertPublishIntent(intent: NonNullable<RunTransitionResult["publishIntent"]>): Promise<void>;
}>;
/** The future adapter must implement lock and all-or-nothing commit, including the outbox row. */
export type RunTransitionStore = Readonly<{
  withRunTransaction<T>(scope: Readonly<{ tenantId: string; workspaceId: string; runId: string }>,
    action: (tx: LockedRunTransaction) => Promise<T>): Promise<T>;
}>;
const validId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim() === v;
const fail = (reason: string): never => { throw new Error(reason); };
const same = (a: RunState, b: RunState) => a.status === b.status && a.finishedAt === b.finishedAt;
const terminal = new Set(["success", "error", "blocked"]);
const pending = new Set(["pending", "running", "awaiting_approval"]);
function validateState(state: RunState, committedAt: number) {
  if (!state || (!terminal.has(state.status) && !pending.has(state.status))) fail("invalid_transition_status");
  if (terminal.has(state.status)) {
    if (state.finishedAt === null || Date.parse(validateSourceTimestamp(state.finishedAt)) > committedAt)
      fail("invalid_terminal_finish");
  } else if (state.finishedAt !== null) fail("pending_with_finish");
}
export async function applyAtomicRunTransition(store: RunTransitionStore, command: RunTransitionCommand): Promise<RunTransitionResult> {
  if (!store || typeof store.withRunTransaction !== "function" || !command ||
    command.schemaVersion !== RUN_TRANSITION_COMMAND_VERSION || !validId(command.commandId) ||
    !validId(command.tenantId) || !validId(command.workspaceId) || !validId(command.runId) ||
    !validId(command.producerId) || !validId(command.operationRef) ||
    !Number.isSafeInteger(command.expectedSequence) || command.expectedSequence < 0)
    fail("invalid_transition_command");
  const committed = Date.parse(validateSourceTimestamp(command.committedAt));
  validateState(command.expected, committed); validateState(command.next, committed);
  if (command.publish && (command.publish.destination !== "runQueue" || !validId(command.publish.intentId) ||
    !validId(command.publish.payloadRef))) fail("invalid_publish_intent");
  const scope = { tenantId: command.tenantId, workspaceId: command.workspaceId, runId: command.runId };
  return store.withRunTransaction(scope, async tx => {
    const previous = await tx.readByCommandId(command.commandId);
    if (previous) {
      if (previous.transition.runId !== command.runId || previous.transition.tenantId !== command.tenantId ||
        previous.transition.workspaceId !== command.workspaceId || previous.transition.sequence !== command.expectedSequence + 1 ||
        !same({ status: previous.transition.previousStatus ?? "", finishedAt: previous.transition.previousFinishedAt }, command.expected) ||
        !same({ status: previous.transition.status, finishedAt: previous.transition.finishedAt }, command.next) ||
        previous.transition.committedAt !== command.committedAt || previous.transition.producerId !== command.producerId ||
        previous.transition.operationRef !== command.operationRef ||
        previous.publishIntent?.intentId !== (command.publish?.intentId ?? undefined) ||
        previous.publishIntent?.payloadRef !== (command.publish?.payloadRef ?? undefined)) fail("command_id_reused_with_different_payload");
      return { ...previous, replayed: true };
    }
    const run = await tx.readRun();
    if (run.tenantId !== scope.tenantId || run.workspaceId !== scope.workspaceId || run.runId !== scope.runId)
      fail("run_scope_mismatch");
    const last = await tx.readLastTransition();
    if (!last || last.sequence !== command.expectedSequence || last.tenantId !== scope.tenantId ||
      last.workspaceId !== scope.workspaceId || last.runId !== scope.runId ||
      !same({ status: last.status, finishedAt: last.finishedAt }, run)) fail("history_or_sequence_mismatch");
    if (!same(run, command.expected)) fail("concurrent_state_conflict");
    const transition: RunTransition = {
      schemaVersion: RUN_TRANSITION_VERSION, transitionId: command.commandId, sequence: command.expectedSequence + 1,
      ...scope, previousStatus: run.status, previousFinishedAt: run.finishedAt,
      status: command.next.status, finishedAt: command.next.finishedAt,
      committedAt: command.committedAt, producerId: command.producerId, operationRef: command.operationRef,
    };
    const publishIntent = command.publish ? { ...command.publish, commandId: command.commandId, state: "pending" as const } : null;
    await tx.updateRun(command.expected, command.next);
    await tx.appendTransition(transition, command.commandId);
    if (publishIntent) await tx.insertPublishIntent(publishIntent);
    return { transition, publishIntent, replayed: false,
      historyVerification: "not_demonstrated", operationalEligibility: "blocked" };
  });
}
