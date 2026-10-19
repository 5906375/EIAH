import { createHash, randomUUID } from "node:crypto";
import {
  ORACULO_PREPARATION_CASE_TYPE, oraculoPreparationRecordV1Schema,
  oraculoPreparationWriteV1Schema, type OraculoPreparationRecordV1,
  type OraculoPreparationScope, type OraculoEvidenceLinkV1, type OraculoDocumentReviewRequestV1,
} from "@eiah/contracts";
import { Prisma, type PrismaClient } from "@repo/db";
import { canonicalizeGovernedJsonV1 } from "../preDuimpGovernedCaseCanonicalization";
import { assessEmptyReturnPreparation } from "./preparation";
import { buildDocumentReview } from "./documentReview";
import { createPreparationEvidence, inspectPreparationEvidence, PreparationEvidenceError } from "./evidence";

export class PreparationIntegrityError extends Error {}
export class PreparationConflictError extends Error {}
const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: unknown) => "sha256:" + createHash("sha256").update(canonicalizeGovernedJsonV1(value)).digest("hex");
type Row = { snapshot: unknown; snapshotHash: string; tenantId: string; workspaceId: string;
  revision: number; schemaVersion: string; lifecycle: string; caseId?: string; id?: string };

/** Same GovernedCase store and append-only revision pattern as PRE-DUIMP; no operational lifecycle transitions. */
export class OraculoPreparationRepository {
  private readonly scope: OraculoPreparationScope;
  constructor(private readonly db: PrismaClient, scope: OraculoPreparationScope) {
    if (!scope.tenantId.trim() || !scope.workspaceId.trim()) throw new Error("Authenticated scope required");
    this.scope = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
  }
  private where(caseId?: string) {
    return { ...this.scope, caseType: ORACULO_PREPARATION_CASE_TYPE, ...(caseId ? { id: caseId } : {}) };
  }
  private verify(row: Row): OraculoPreparationRecordV1 {
    const result = oraculoPreparationRecordV1Schema.safeParse(row.snapshot);
    if (!result.success) throw new PreparationIntegrityError("Invalid preparation snapshot");
    const value = result.data;
    if (value.tenantId !== this.scope.tenantId || value.workspaceId !== this.scope.workspaceId
      || row.tenantId !== this.scope.tenantId || row.workspaceId !== this.scope.workspaceId
      || value.caseId !== (row.caseId ?? row.id) || value.revision !== row.revision
      || value.lifecycle !== row.lifecycle || value.schemaVersion !== row.schemaVersion
      || hash(value) !== row.snapshotHash) throw new PreparationIntegrityError("Preparation integrity mismatch");
    return value;
  }
  async list() {
    const rows = await this.db.governedCase.findMany({ where: this.where(), orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100 });
    return rows.map((row) => this.verify(row));
  }
  async get(caseId: string) {
    const row = await this.db.governedCase.findFirst({ where: this.where(caseId) });
    return row ? this.verify(row) : null;
  }
  async revisions(caseId: string) {
    if (!await this.get(caseId)) return null;
    const rows = await this.db.governedCaseRevision.findMany({ where: { ...this.scope, caseId }, orderBy: { revision: "asc" } });
    return rows.map((row) => this.verify(row));
  }
  async save(input: unknown, actorRef: string, update?: { caseId: string; expectedRevision: number }) {
    if (!actorRef.trim()) throw new Error("Authenticated actor required");
    const { context, operationReference } = oraculoPreparationWriteV1Schema.parse(input);
    const current = update ? await this.get(update.caseId) : null;
    if (update && !current) return null;
    if (update && current?.revision !== update.expectedRevision) throw new PreparationConflictError("Revision conflict");
    const now = new Date();
    const draft = assessEmptyReturnPreparation(this.scope, {
      schemaVersion: "oraculo.empty-return-preparation.v1", ...this.scope, context,
    }).draft;
    const value = oraculoPreparationRecordV1Schema.parse({
      ...draft, caseId: current?.caseId ?? randomUUID(), caseType: ORACULO_PREPARATION_CASE_TYPE,
      revision: (current?.revision ?? 0) + 1, lifecycle: "DISCOVERY",
      evidences: current?.evidences ?? [],
      ...((operationReference ?? current?.operationReference) ? { operationReference: operationReference ?? current?.operationReference } : {}),
      ...(current?.contentReviews ? { contentReviews: current.contentReviews } : {}),
      createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
      executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false,
    });
    return this.commit(value, current, actorRef, current ? "oraculo.preparation.updated" : "oraculo.preparation.created");
  }
  async linkEvidence(caseId: string, input: OraculoEvidenceLinkV1, actorRef: string) {
    if (!actorRef.trim()) throw new Error("Authenticated actor required");
    const current = await this.get(caseId);
    if (!current) return null;
    if (current.revision !== input.expectedRevision) throw new PreparationConflictError("Revision conflict");
    const evidences = current.evidences ?? [];
    if (evidences.some((item) => item.documentId === input.documentId)) throw new PreparationEvidenceError(409, "already_linked");
    if (evidences.length >= 20) throw new PreparationEvidenceError(400, "evidence_limit");
    const evidence = await createPreparationEvidence(this.db, this.scope, actorRef, input);
    const value = oraculoPreparationRecordV1Schema.parse({ ...current, evidences: [...evidences, evidence], revision: current.revision + 1, updatedAt: evidence.linkedAt });
    return this.commit(value, current, actorRef, "oraculo.preparation.evidence_linked");
  }
  async reviewDocument(caseId: string, input: OraculoDocumentReviewRequestV1, actorRef: string) {
    if (!actorRef.trim()) throw new Error("Authenticated actor required");
    const current = await this.get(caseId);
    if (!current) return null;
    if (current.revision !== input.expectedRevision) throw new PreparationConflictError("Revision conflict");
    const evidence = current.evidences?.find((item) => item.documentId === input.documentId);
    if (!evidence) throw new PreparationEvidenceError(404, "document_not_linked");
    if ((current.contentReviews?.length ?? 0) >= 100) throw new PreparationEvidenceError(400, "review_limit");
    const inspection = await inspectPreparationEvidence(this.db, this.scope, evidence);
    if (inspection.check.integrity !== "available") throw new PreparationEvidenceError(409, inspection.check.integrity);
    const review = buildDocumentReview(current, evidence, input, actorRef);
    const value = oraculoPreparationRecordV1Schema.parse({ ...current, contentReviews: [...current.contentReviews ?? [], review], revision: current.revision + 1, updatedAt: review.reviewedAt });
    return this.commit(value, current, actorRef, "oraculo.preparation.document_reviewed");
  }
  private async commit(value: OraculoPreparationRecordV1, current: OraculoPreparationRecordV1 | null, actorRef: string, transitionCode: string) {
    const now = new Date(value.updatedAt);
    const snapshotHash = hash(value);
    await this.db.$transaction(async (tx) => {
      const data = { schemaVersion: value.schemaVersion, revision: value.revision, lifecycle: "DISCOVERY" as const,
        subject: json({ scenario: "empty_container_return" }), domainState: json({ preparationOnly: true, executionAllowed: false, externalTransmissionAllowed: false }),
        snapshot: json(value), snapshotHash, updatedAt: now };
      if (current) {
        const changed = await tx.governedCase.updateMany({ where: { ...this.where(current.caseId), revision: current.revision }, data });
        if (changed.count !== 1) throw new PreparationConflictError("Revision conflict");
      } else {
        await tx.governedCase.create({ data: { ...data, ...this.scope, id: value.caseId, caseType: value.caseType, createdAt: now } });
      }
      await tx.governedCaseRevision.create({ data: {
        id: randomUUID(), ...this.scope, caseId: value.caseId, revision: value.revision,
        schemaVersion: value.schemaVersion, lifecycle: "DISCOVERY", snapshot: json(value), snapshotHash,
        fromLifecycle: current ? "DISCOVERY" : null, toLifecycle: "DISCOVERY", actorType: "user", actorRef,
        transitionCode, createdAt: now,
      } });
    });
    return value;
  }
}
