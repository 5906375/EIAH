import {
  ORACULO_CONTENT_REVIEW_SCOPE, oraculoDocumentReviewRequestV1Schema, type OraculoDocumentReviewStateV1, ORACULO_PREPARATION_WRITE_SCOPE, oraculoEvidenceLinkV1Schema, oraculoPreparationWriteV1Schema, oraculoPreparationUpdateV1Schema,
} from "@eiah/contracts";
import { TenantPolicyStore } from "@eiah/core/policy/TenantPolicyStore";
import { prismaGlobal } from "@repo/db";
import { asyncHandler, createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { resolveLogisticaContextAccess } from "../services/logistica/control/logisticaContextAccess";
import { documentReviewBindingHash } from "../services/logistica/oraculo/documentReview";
import { inspectPreparationEvidence, PreparationEvidenceError } from "../services/logistica/oraculo/evidence";
import { OraculoPreparationRepository, PreparationConflictError, PreparationIntegrityError } from "../services/logistica/oraculo/preparationRepository";

export const oraculoPreparationRouter = createGovernedRouter();
const base = "/logistica/oraculo/preparations";
oraculoPreparationRouter.use(base, enforceTenant);
oraculoPreparationRouter.use(base, asyncHandler(async (req: TenantAwareRequest, res, next) => {
  if (!req.authContext?.userId) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
  const context = await resolveLogisticaContextAccess(prismaGlobal, req.authContext);
  if (!context.allowed) return res.status(403).json({ ok: false, error: { code: "ORACULO_CONTEXT_DENIED", reasonCode: "ORACULO_CONTEXT_DENIED", reason: context.reason } });
  const policy = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(req.authContext.tenantId, req.authContext.workspaceId, ORACULO_PREPARATION_WRITE_SCOPE);
  const writeAllowed = context.usage === "full" && policy.allowed;
  if (req.method !== "GET" && !writeAllowed) return res.status(403).json({ ok: false, error: { code: "ORACULO_PREPARATION_WRITE_DENIED", reasonCode: "ORACULO_PREPARATION_WRITE_DENIED" } });
  res.locals.preparationWriteAllowed = writeAllowed;
  return next();
}));
function repository(req: TenantAwareRequest) {
  return new OraculoPreparationRepository(req.prisma!, req.authContext!);
}
function failure(res: import("express").Response, error: unknown) {
  if (error instanceof PreparationEvidenceError) {
    const code = error.status === 404 ? "NOT_FOUND" : error.status === 400 || error.subreason === "already_linked" ? "ORACULO_PREPARATION_INPUT_INVALID" : "ORACULO_PREPARATION_INTEGRITY_VIOLATION";
    return res.status(error.status).json({ ok: false, error: { code, ...(code === "NOT_FOUND" ? {} : { reasonCode: code }), subreason: error.subreason } });
  }
  if (error instanceof PreparationConflictError) return res.status(409).json({ ok: false, error: { code: "ORACULO_PREPARATION_REVISION_CONFLICT", reasonCode: "ORACULO_PREPARATION_REVISION_CONFLICT" } });
  if (error instanceof PreparationIntegrityError) return res.status(409).json({ ok: false, error: { code: "ORACULO_PREPARATION_INTEGRITY_VIOLATION", reasonCode: "ORACULO_PREPARATION_INTEGRITY_VIOLATION" } });
  throw error;
}
oraculoPreparationRouter.get(base, async (req: TenantAwareRequest, res) => {
  try { return res.json({ ok: true, data: { items: await repository(req).list(), writeAllowed: res.locals.preparationWriteAllowed } }); }
  catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.get(`${base}/:id/revisions`, async (req: TenantAwareRequest, res) => {
  try {
    const items = await repository(req).revisions(req.params.id);
    return items ? res.json({ ok: true, data: { items } }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.get(`${base}/:id`, async (req: TenantAwareRequest, res) => {
  try {
    const value = await repository(req).get(req.params.id);
    return value ? res.json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
for (const method of ["post", "patch"] as const) {
  oraculoPreparationRouter[method](method === "post" ? base : `${base}/:id`, async (req: TenantAwareRequest, res) => {
    const parsed = (method === "post" ? oraculoPreparationWriteV1Schema : oraculoPreparationUpdateV1Schema).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "ORACULO_PREPARATION_INPUT_INVALID", reasonCode: "ORACULO_PREPARATION_INPUT_INVALID" } });
    try {
      const value = await repository(req).save({ context: parsed.data.context, ...(parsed.data.operationReference !== undefined ? { operationReference: parsed.data.operationReference } : {}) }, req.authContext!.userId!, method === "patch" ? { caseId: req.params.id, expectedRevision: oraculoPreparationUpdateV1Schema.parse(req.body).expectedRevision } : undefined);
      return value ? res.status(method === "post" ? 201 : 200).json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    } catch (error) { return failure(res, error); }
  });
}

oraculoPreparationRouter.post(`${base}/:id/evidence`, async (req: TenantAwareRequest, res) => {
  const parsed = oraculoEvidenceLinkV1Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "ORACULO_PREPARATION_INPUT_INVALID", reasonCode: "ORACULO_PREPARATION_INPUT_INVALID" } });
  try {
    const value = await repository(req).linkEvidence(req.params.id, parsed.data, req.authContext!.userId!);
    return value ? res.json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.get(`${base}/:id/evidence`, async (req: TenantAwareRequest, res) => {
  try {
    const value = await repository(req).get(req.params.id);
    if (!value) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    const items = [];
    // Sequential reads avoid buffering every document at once.
    for (const evidence of value.evidences ?? []) items.push((await inspectPreparationEvidence(req.prisma!, req.authContext!, evidence)).check);
    return res.json({ ok: true, data: { caseId: value.caseId, revision: value.revision, items, contentReview: value.contentReviews?.length ? "recorded" : "not_performed", operationalValidation: "not_performed" } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.get(`${base}/:id/evidence/:documentId/file`, async (req: TenantAwareRequest, res) => {
  try {
    const value = await repository(req).get(req.params.id);
    const evidence = value?.evidences?.find((item) => item.documentId === req.params.documentId);
    if (!evidence) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    const inspected = await inspectPreparationEvidence(req.prisma!, req.authContext!, evidence);
    if (!inspected.buffer) throw new PreparationEvidenceError(409, inspected.check.integrity);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(evidence.fileName).replace(/'/g, "%27")}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.type(evidence.mimeType).send(inspected.buffer);
  } catch (error) { return failure(res, error); }
});

async function reviewAllowed(req: TenantAwareRequest, writeAllowed: boolean) {
  if (!writeAllowed) return false;
  const { tenantId, workspaceId } = req.authContext!;
  const policy = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(tenantId, workspaceId, ORACULO_CONTENT_REVIEW_SCOPE);
  return policy.allowed;
}
oraculoPreparationRouter.post(`${base}/:id/document-reviews`, async (req: TenantAwareRequest, res) => {
  if (!await reviewAllowed(req, res.locals.preparationWriteAllowed)) return res.status(403).json({ ok: false, error: { code: "ORACULO_PREPARATION_WRITE_DENIED", reasonCode: "ORACULO_PREPARATION_WRITE_DENIED", subreason: "content_review_policy_denied" } });
  const parsed = oraculoDocumentReviewRequestV1Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "ORACULO_PREPARATION_INPUT_INVALID", reasonCode: "ORACULO_PREPARATION_INPUT_INVALID" } });
  try {
    const value = await repository(req).reviewDocument(req.params.id, parsed.data, req.authContext!.userId!);
    return value ? res.json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.get(`${base}/:id/document-reviews`, async (req: TenantAwareRequest, res) => {
  try {
    const value = await repository(req).get(req.params.id);
    if (!value) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    const available = new Set<string>();
    for (const evidence of value.evidences ?? []) {
      if ((await inspectPreparationEvidence(req.prisma!, req.authContext!, evidence)).check.integrity === "available") available.add(evidence.documentId);
    }
    const seen = new Set<string>();
    const items: OraculoDocumentReviewStateV1[] = [...value.contentReviews ?? []].reverse().map((review) => {
      const evidence = value.evidences?.find((item) => item.documentId === review.documentId);
      const superseded = seen.has(review.documentId); seen.add(review.documentId);
      return { review, state: superseded ? "superseded" : !evidence || !available.has(review.documentId) ? "file_unavailable"
        : review.bindingHash !== documentReviewBindingHash(value, evidence) || review.documentSha256 !== evidence.sha256 ? "context_changed" : "current" };
    });
    return res.json({ ok: true, data: { caseId: value.caseId, revision: value.revision, items, reviewAllowed: await reviewAllowed(req, res.locals.preparationWriteAllowed), referenceOrigin: "user_declared", operationalValidation: "not_performed" } });
  } catch (error) { return failure(res, error); }
});
