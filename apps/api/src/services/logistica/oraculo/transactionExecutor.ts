import { randomUUID } from "node:crypto";
import {
  oraculoGateIntentV1Schema, oraculoGateResultV1Schema, oraculoCredentialEvaluationV1Schema,
  oraculoGateIntentTrackingV1Schema, oraculoHumanDecisionV1Schema,
  type OraculoGateIntentV1,
} from "@eiah/contracts";
import { buildS1ApprovalContext, evaluateResolvedS1, s1SnapshotSchema } from "./evaluation.js";
import { hashIntent, hashApprovalContext } from "./canonicalization.js";

/** A dedicated, connected client. Never a pool/global client or a caller-supplied body. */
export interface Ci1Connection {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}
export type Ci1Identity = Readonly<{ tenantId: string; workspaceId: string; tokenRef: string }>;
export class Ci1ReconciliationRequired extends Error {
  constructor(readonly intentId: string) { super("CI1_COMMIT_OUTCOME_UNKNOWN"); }
}

/** No retry: even a failed COMMIT response may follow a successful server commit. */
export async function inCi1Transaction<T>(db: Ci1Connection, intentId: string, work: () => Promise<T>): Promise<T> {
  await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  let committing = false;
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '10s'");
    const result = await work();
    committing = true;
    await db.query("COMMIT");
    return result;
  } catch (error) {
    if (committing) throw new Ci1ReconciliationRequired(intentId);
    try { await db.query("ROLLBACK"); } catch { throw new Ci1ReconciliationRequired(intentId); }
    throw error;
  }
}

export async function admitCi1(db: Ci1Connection, who: Ci1Identity, input: unknown) {
  const intent = oraculoGateIntentV1Schema.parse(input);
  await inCi1Transaction(db, intent.intentId, () => db.query(
    "SELECT public.oraculo_admit($1,$2,$3,$4::jsonb,$5)",
    [who.tenantId, who.workspaceId, who.tokenRef, JSON.stringify(intent), hashIntent(intent)],
  ));
}

export async function readCi1(db: Ci1Connection, who: Ci1Identity, intentId: string) {
  return inCi1Transaction(db, intentId, async () => {
    const { rows } = await db.query("SELECT public.oraculo_read($1,$2,$3,$4) AS value",
      [who.tenantId, who.workspaceId, who.tokenRef, intentId]);
    return oraculoGateIntentTrackingV1Schema.parse(rows[0].value);
  });
}

async function begin(db: Ci1Connection, who: Ci1Identity, intentId: string) {
  const { rows } = await db.query("SELECT public.oraculo_begin($1,$2,$3,$4) AS value",
    [who.tenantId, who.workspaceId, who.tokenRef, intentId]);
  return rows[0].value;
}

/** Producer is a separate restricted DB login; review identity is resolved by the database. */
export async function approveCi1(db: Ci1Connection, who: Ci1Identity, intentId: string, decision: "APPROVED" | "REJECTED", validUntil: string) {
  return inCi1Transaction(db, intentId, async () => {
    const current = await begin(db, who, intentId);
    const snapshot = s1SnapshotSchema.parse(current.snapshot);
    const context = buildS1ApprovalContext(snapshot);
    const hd = hashApprovalContext(context);
    await db.query("SELECT public.oraculo_context($1,$2,$3,$4,$5,$6::jsonb)",
      [who.tenantId, who.workspaceId, who.tokenRef, intentId, hd, JSON.stringify(context)]);
    const approval = oraculoHumanDecisionV1Schema.parse({
      schemaVersion: "human-authority-decision.v1", authorityDecisionId: randomUUID(),
      tenantId: who.tenantId, workspaceId: who.workspaceId,
      subject: { caseId: context.caseRef.id, action: context.action, resourceType: "oraculo_gate_visit", resourceId: context.visitRef.id, inputHash: hd },
      decision, decidedByUserId: current.actor.id, decidedAt: snapshot.evaluatedAt, validUntil,
      policyVersion: "1", reasonCodes: decision === "REJECTED" ? ["synthetic-review-rejected"] : [], evidenceRefs: [],
    });
    // This code is fixture-local, not a production reason-code registration.
    await db.query("SELECT public.oraculo_approve($1,$2,$3,$4,$5::jsonb)",
      [who.tenantId, who.workspaceId, who.tokenRef, hd, JSON.stringify(approval)]);
    return approval;
  });
}

/** Resolves all material from storage. Input is only trusted identity and admitted intent ID. */
export async function executeCi1(db: Ci1Connection, who: Ci1Identity, intentId: string) {
  await inCi1Transaction(db, intentId, async () => {
    const current = await begin(db, who, intentId);
    if (current.result || current.assessment) return; // immutable replay, including held negatives
    const snapshot = s1SnapshotSchema.parse(current.snapshot);
    if (snapshot.policy === "sim-return-hitl.v1") {
      const context = buildS1ApprovalContext(snapshot);
      const { rows } = await db.query("SELECT public.oraculo_context($1,$2,$3,$4,$5,$6::jsonb) AS value",
        [who.tenantId, who.workspaceId, who.tokenRef, intentId, hashApprovalContext(context), JSON.stringify(context)]);
      snapshot.approvalContext = context;
      if (rows[0].value) snapshot.approval = oraculoHumanDecisionV1Schema.parse(rows[0].value);
    }
    const assessment = evaluateResolvedS1(snapshot);
    let result = null;
    const evaluations = [];
    if (assessment.disposition === "ELIGIBLE_FOR_SIMULATION") {
      const intent: OraculoGateIntentV1 = snapshot.intent;
      for (const credentialRef of intent.credentialRefs) {
        const observation = snapshot.observations.find(o => o.credentialRef.credentialId === credentialRef.credentialId && o.credentialRef.revision === credentialRef.revision)!;
        evaluations.push(oraculoCredentialEvaluationV1Schema.parse({
          schemaVersion: "oraculo.credential-evaluation.v1", mode: "SIMULATION",
          tenantId: who.tenantId, workspaceId: who.workspaceId, evaluationId: randomUUID(), credentialRef,
          operationRef: { id: snapshot.visit.operationId, revision: snapshot.visit.operationRevision },
          purpose: "SIMULATED_EMPTY_RETURN", observationRefs: [{ observationId: observation.observationId }],
          sourceRefs: [observation.sourceRef], policyId: snapshot.policy, policyVersion: "1",
          evaluatedAt: snapshot.evaluatedAt, result: "ACCEPTED_FOR_SIMULATION", reasonCodes: [],
          ...(snapshot.approval ? { authorityRefs: [snapshot.approval.authorityDecisionId] } : {}),
        }));
      }
      result = oraculoGateResultV1Schema.parse({
        schemaVersion: "oraculo.gate-result.v1", mode: "SIMULATION", tenantId: who.tenantId, workspaceId: who.workspaceId,
        resultId: randomUUID(), intentId, outcome: "APPLIED", reasonCodes: [], evaluationRefs: evaluations.map(e => e.evaluationId),
        evidenceRefs: intent.evidenceRefs ?? [], recordedAt: new Date().toISOString(),
        previousState: snapshot.visit.state, nextState: intent.direction === "IN" ? "INSIDE" : "EXITED",
        previousRevision: snapshot.visit.revision, nextRevision: snapshot.visit.revision + 1,
      });
    }
    // Unratified mappers stay held with a durable assessment, never a fabricated final C5.
    await db.query("SELECT public.oraculo_finish($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)",
      [who.tenantId, who.workspaceId, who.tokenRef, intentId, JSON.stringify(assessment), result && JSON.stringify(result), JSON.stringify(evaluations)]);
  });
  return readCi1(db, who, intentId);
}
