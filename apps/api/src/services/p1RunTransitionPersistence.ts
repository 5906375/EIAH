/** P1 persistence prototype: injected Prisma client, no writer wiring or queue publication. */
import { createHash } from "node:crypto";
import type { PrismaClient, RunStatus } from "@repo/db/client";
import { applyAtomicRunTransition, type RunTransitionCommand, type RunTransitionResult,
  type RunTransitionStore } from "../../../../scripts/lib/p1AtomicRunTransition.js";
import { reconstructRunAtCutoff, type RunTransition } from "../../../../scripts/lib/p1RunTransitionHistory.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type EventRow = {
  id: string; run_id: string; tenant_id: string; workspace_id: string; command_id: string;
  schema_version: string; sequence: bigint; previous_status: string | null;
  previous_finished_at: Date | null; status: string; finished_at: Date | null;
  declared_at: Date; producer_id: string; operation_ref: string; command_digest: string;
};
type IntentRow = { id: string; command_id: string; destination: string; payload_ref: string; payload: Json };
function fail(reason: string): never { throw new Error(reason); }
function canonical(value: Json): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return fail("invalid_durable_payload");
}
const stamp = (date: Date | null) => date === null ? null : date.toISOString();
function event(row: EventRow): RunTransition {
  if (row.sequence < 0n || row.sequence > BigInt(Number.MAX_SAFE_INTEGER)) fail("unsafe_transition_sequence");
  if (row.schema_version !== "p1-run-transition.v1") fail("unknown_transition_version");
  return { schemaVersion: row.schema_version, transitionId: row.id, sequence: Number(row.sequence),
    runId: row.run_id, tenantId: row.tenant_id, workspaceId: row.workspace_id,
    previousStatus: row.previous_status, previousFinishedAt: stamp(row.previous_finished_at),
    status: row.status, finishedAt: stamp(row.finished_at), committedAt: row.declared_at.toISOString(),
    producerId: row.producer_id, operationRef: row.operation_ref };
}

/**
 * Persists one existing-run command. The caller supplies a dedicated client and resolved JSON payload.
 * No source attestation: declared_at and recorded_at are not DB commit timestamps.
 * Returned publishIntent is the original command receipt, never a dispatcher instruction.
 */
export async function persistP1RunTransition(
  prisma: Pick<PrismaClient, "$transaction">,
  input: RunTransitionCommand,
  durablePayload: { [key: string]: Json } | null,
): Promise<RunTransitionResult> {
  if (!Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 0 ||
    input.expectedSequence >= Number.MAX_SAFE_INTEGER) fail("unsafe_transition_sequence");
  const normalizedDate = (value: string) => {
    // Storage is TIMESTAMP(3); reject precision loss and non-UTC spellings.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail("invalid_storage_timestamp");
    const normalized = new Date(value).toISOString();
    if (normalized !== value && normalized.replace(".000Z", "Z") !== value) fail("invalid_storage_timestamp");
    return normalized;
  };
  const state = (v: RunTransitionCommand["next"]) => ({ status: v.status,
    finishedAt: v.finishedAt === null ? null : normalizedDate(v.finishedAt) });
  const command: RunTransitionCommand = { ...input, expected: state(input.expected), next: state(input.next),
    committedAt: normalizedDate(input.committedAt), publish: input.publish === null ? null : { ...input.publish } };
  if (command.publish === null ? durablePayload !== null : durablePayload === null) fail("publish_payload_required_or_unexpected");
  if (durablePayload && (durablePayload.tenantId !== command.tenantId ||
    durablePayload.workspaceId !== command.workspaceId || durablePayload.runId !== command.runId)) fail("publish_payload_scope_mismatch");
  const payloadText = canonical(durablePayload);
  // Fixed fields bind the complete command and actual payload, including reference and destination.
  const fingerprint = canonical([command.schemaVersion, command.commandId, command.tenantId,
    command.workspaceId, command.runId, command.expectedSequence, command.expected.status,
    command.expected.finishedAt, command.next.status, command.next.finishedAt, command.committedAt,
    command.producerId, command.operationRef, command.publish?.intentId ?? null,
    command.publish?.destination ?? null, command.publish?.payloadRef ?? null, JSON.parse(payloadText) as Json]);
  const digest = "sha256:" + createHash("sha256").update(fingerprint).digest("hex");
  const store: RunTransitionStore = {
    withRunTransaction: (scope, action) => prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      // Locks cover the run and its actual workspace ownership for the whole write transaction.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT r.id FROM runs r JOIN workspaces w ON w.id = r.workspace_id AND w.tenant_id = r.tenant_id
        WHERE r.id = ${scope.runId} AND r.tenant_id = ${scope.tenantId} AND r.workspace_id = ${scope.workspaceId}
        FOR UPDATE OF r FOR SHARE OF w`;
      if (locked.length !== 1) fail("run_scope_mismatch");
      const run = await tx.run.findUnique({ where: { id: scope.runId } });
      if (!run) return fail("run_missing_after_lock");
      return action({
        async readRun() {
          return { runId: run.id, tenantId: run.tenantId, workspaceId: run.workspaceId,
            status: run.status, finishedAt: stamp(run.finishedAt) };
        },
        async readLastTransition() {
          const rows = await tx.$queryRaw<EventRow[]>`
            SELECT * FROM run_state_transitions WHERE run_id = ${scope.runId} ORDER BY sequence`;
          if (rows.length === 0) return null;
          const transitions = rows.map(event);
          reconstructRunAtCutoff({ ...scope, createdAt: run.createdAt.toISOString(),
            cutoffAt: command.committedAt, transitions, current: { status: run.status, finishedAt: stamp(run.finishedAt) } });
          const last = transitions[transitions.length - 1];
          if (Date.parse(last.committedAt) > Date.parse(command.committedAt)) fail("declared_time_regression");
          return last;
        },
        async readByCommandId(id) {
          const rows = await tx.$queryRaw<EventRow[]>`SELECT * FROM run_state_transitions WHERE command_id = ${id}`;
          if (rows.length === 0) return null;
          const row = rows[0];
          if (row.command_digest !== digest || row.run_id !== scope.runId ||
            row.tenant_id !== scope.tenantId || row.workspace_id !== scope.workspaceId) fail("command_id_reused_with_different_payload");
          const intents = await tx.$queryRaw<IntentRow[]>`SELECT * FROM run_publish_outbox WHERE command_id = ${id}`;
          const intent = intents[0];
          if (command.publish ? !intent || intent.id !== command.publish.intentId || intent.destination !== command.publish.destination ||
            intent.payload_ref !== command.publish.payloadRef || canonical(intent.payload) !== payloadText : intents.length !== 0)
            fail("persisted_intent_mismatch");
          return { transition: event(row), replayed: true, historyVerification: "not_demonstrated",
            operationalEligibility: "blocked", publishIntent: intent ? { intentId: intent.id,
              commandId: id, destination: "runQueue", payloadRef: intent.payload_ref, state: "pending" } : null };
        },
        async updateRun(expected, next) {
          const changed = await tx.run.updateMany({ where: { id: scope.runId, tenantId: scope.tenantId,
            workspaceId: scope.workspaceId, status: expected.status as RunStatus,
            finishedAt: expected.finishedAt === null ? null : new Date(expected.finishedAt) },
            data: { status: next.status as RunStatus, finishedAt: next.finishedAt === null ? null : new Date(next.finishedAt) } });
          if (changed.count !== 1) fail("concurrent_state_conflict");
        },
        async appendTransition(transition, commandId) {
          await tx.$executeRaw`
            INSERT INTO run_state_transitions (id,run_id,tenant_id,workspace_id,command_id,schema_version,sequence,
              previous_status,previous_finished_at,status,finished_at,declared_at,producer_id,operation_ref,command_digest)
            VALUES (${transition.transitionId},${scope.runId},${scope.tenantId},${scope.workspaceId},${commandId},
              ${transition.schemaVersion},${BigInt(transition.sequence)},${transition.previousStatus}::"RunStatus",
              ${transition.previousFinishedAt === null ? null : new Date(transition.previousFinishedAt)},
              ${transition.status}::"RunStatus",${transition.finishedAt === null ? null : new Date(transition.finishedAt)},
              ${new Date(transition.committedAt)},${transition.producerId},${transition.operationRef},${digest})`;
        },
        async insertPublishIntent(intent) {
          await tx.$executeRaw`
            INSERT INTO run_publish_outbox (id,command_id,run_id,tenant_id,workspace_id,destination,payload_ref,payload)
            VALUES (${intent.intentId},${intent.commandId},${scope.runId},${scope.tenantId},${scope.workspaceId},
              ${intent.destination},${intent.payloadRef},${payloadText}::jsonb)`;
        },
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 30_000 }),
  };
  return applyAtomicRunTransition(store, command);
}
