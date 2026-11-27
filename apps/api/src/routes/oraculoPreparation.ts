import {
  ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_DECISION_SCOPE, deriveOraculoDecisionTriggers, oraculoDecisionInputV1Schema, oraculoDecisionRequestInputV1Schema, oraculoDocumentReviewRequestV1Schema, type OraculoDocumentReviewStateV1, ORACULO_PREPARATION_WRITE_SCOPE, oraculoEvidenceLinkV1Schema, oraculoPreparationWriteV1Schema, oraculoPreparationUpdateV1Schema,
} from "@eiah/contracts";
import { TenantPolicyStore } from "@eiah/core/policy/TenantPolicyStore";
import { prismaGlobal } from "@repo/db";
import { asyncHandler, createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { hasLogisticaMemberCapability, resolveLogisticaContextAccess } from "../services/logistica/control/logisticaContextAccess";
import { documentReviewBindingHash } from "../services/logistica/oraculo/documentReview";
import { inspectPreparationEvidence, PreparationEvidenceError } from "../services/logistica/oraculo/evidence";
import { OraculoPreparationRepository, PreparationConflictError, PreparationIntegrityError } from "../services/logistica/oraculo/preparationRepository";
import { decisionCoverage, deriveDecisionStates, PreparationDecisionError, provisionalDecisionEligibilityEnabled } from "../services/logistica/oraculo/humanDecision";

export const oraculoPreparationRouter = createGovernedRouter();
const base = "/logistica/oraculo/preparations";
oraculoPreparationRouter.use(base, enforceTenant);
oraculoPreparationRouter.use(base, asyncHandler(async (req: TenantAwareRequest, res, next) => {
  if (!req.authContext?.userId) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
  const context = await resolveLogisticaContextAccess(prismaGlobal, req.authContext);
  if (!context.allowed) return res.status(403).json({ ok: false, error: { code: "ORACULO_CONTEXT_DENIED", reasonCode: "ORACULO_CONTEXT_DENIED", reason: context.reason } });
  const policy = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(req.authContext.tenantId, req.authContext.workspaceId, ORACULO_PREPARATION_WRITE_SCOPE);
  // Escrita = acesso ao contexto + uso integral + política exata do workspace + capacidade EXPLÍCITA de escrita no vínculo do próprio membro.
  const writeAllowed = context.usage === "full" && policy.allowed && await hasLogisticaMemberCapability(prismaGlobal, req.authContext, ORACULO_PREPARATION_WRITE_SCOPE);
  if (req.method !== "GET" && !writeAllowed) return res.status(403).json({ ok: false, error: { code: "ORACULO_PREPARATION_WRITE_DENIED", reasonCode: "ORACULO_PREPARATION_WRITE_DENIED" } });
  res.locals.preparationWriteAllowed = writeAllowed;
  return next();
}));
// Identificadores vindos do cliente são só ponteiros: formato inválido nunca chega ao banco (evita 500) e responde como inexistente.
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;
for (const name of ["id", "documentId"] as const) {
  oraculoPreparationRouter.param(name, (_req, res, next, value) => {
    if (!OPAQUE_ID.test(String(value))) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    return next();
  });
}
function repository(req: TenantAwareRequest) {
  return new OraculoPreparationRepository(req.prisma!, req.authContext!);
}
function failure(res: import("express").Response, error: unknown) {
  if (error instanceof PreparationEvidenceError) {
    const code = error.status === 404 ? "NOT_FOUND" : error.status === 400 || error.subreason === "already_linked" ? "ORACULO_PREPARATION_INPUT_INVALID" : "ORACULO_PREPARATION_INTEGRITY_VIOLATION";
    return res.status(error.status).json({ ok: false, error: { code, ...(code === "NOT_FOUND" ? {} : { reasonCode: code }), subreason: error.subreason } });
  }
  if (error instanceof PreparationDecisionError) return res.status(error.status).json({ ok: false, error: { code: error.code, reasonCode: error.code, subreason: error.subreason } });
  if (error instanceof PreparationConflictError) return res.status(409).json({ ok: false, error: { code: "ORACULO_PREPARATION_REVISION_CONFLICT", reasonCode: "ORACULO_PREPARATION_REVISION_CONFLICT" } });
  if (error instanceof PreparationIntegrityError) return res.status(409).json({ ok: false, error: { code: "ORACULO_PREPARATION_INTEGRITY_VIOLATION", reasonCode: "ORACULO_PREPARATION_INTEGRITY_VIOLATION" } });
  throw error;
}
oraculoPreparationRouter.get(base, async (req: TenantAwareRequest, res) => {
  try { return res.json({ ok: true, data: { items: await repository(req).list(), writeAllowed: res.locals.preparationWriteAllowed } }); }
  catch (error) { return failure(res, error); }
});
// FD-E2E-005 — caixa de pendências (registrada ANTES de `/:id`). Só lê os casos do tenant/workspace autenticado (repositório escopado, 100 mais
// recentes) e só mostra "aguardando você" a quem pode decidir pela mesma elegibilidade da decisão. Não cria nada; não notifica ninguém.
const INBOX_MAX_ITEMS = 50;
oraculoPreparationRouter.get(`${base}/decision-inbox`, async (req: TenantAwareRequest, res) => {
  try {
    const me = req.authContext!.userId!;
    const writeAllowed = res.locals.preparationWriteAllowed === true;
    const eligibility = await decisionEligibility(req, writeAllowed);
    const cases = await repository(req).list();
    const item = (record: (typeof cases)[number], state: ReturnType<typeof deriveDecisionStates>[number]) => ({
      caseId: record.caseId, requestId: state.request.id, status: state.status, basisCurrent: state.basisCurrent,
      basedOnRevision: state.request.basedOnRevision, currentRevision: record.revision, requestedAt: state.request.requestedAt,
      triggers: state.request.triggers, ...(state.request.note ? { note: state.request.note } : {}),
      ...(state.decision ? { decision: { value: state.decision.decision, note: state.decision.note, decidedAt: state.decision.decidedAt } } : {}),
    });
    const all = cases.flatMap((record) => deriveDecisionStates(record).map((state) => ({ record, state })));
    const byDate = (a: { state: { request: { requestedAt: string } } }, b: { state: { request: { requestedAt: string } } }) => b.state.request.requestedAt.localeCompare(a.state.request.requestedAt);
    const awaitingYou = eligibility.decideAllowed
      ? all.filter(({ state }) => state.status === "pending" && state.request.requestedBy !== me).sort(byDate).slice(0, INBOX_MAX_ITEMS).map(({ record, state }) => item(record, state)) : [];
    const yours = all.filter(({ state }) => state.request.requestedBy === me).sort(byDate).slice(0, INBOX_MAX_ITEMS).map(({ record, state }) => item(record, state));
    return res.json({ ok: true, data: {
      awaitingYou, yours,
      eligibility: { canDecide: eligibility.decideAllowed, reason: eligibility.decideBlockedReason },
      limits: { casesScanned: cases.length, maxCases: 100 },
      operationalAuthorization: "not_granted",
    } });
  } catch (error) { return failure(res, error); }
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
  return policy.allowed && await hasLogisticaMemberCapability(prismaGlobal, req.authContext!, ORACULO_CONTENT_REVIEW_SCOPE);
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

// ───────── J17 — decisão humana do caso (FD-E2E-004) ─────────
// Sem fila, aviso ou atribuição: a solicitação é um evento do próprio caso e quem decide é um membro ativo, diferente de quem pediu, com a
// política exata de conferência humana do workspace. Pedir ou decidir NÃO autoriza execução, aceite, responsabilidade, custos nem transmissão.
async function decisionEligibility(req: TenantAwareRequest, writeAllowed: boolean) {
  const { tenantId, workspaceId, userId } = req.authContext!;
  const policy = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(tenantId, workspaceId, ORACULO_DECISION_SCOPE);
  // Só leitura: nunca cria vínculo. Há decisor possível se existe OUTRO membro ativo COM a capacidade explícita e a política do workspace permite.
  const others = await prismaGlobal.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND status='active' AND user_id <> ${userId!} AND permissions @> ${JSON.stringify([ORACULO_DECISION_SCOPE])}::jsonb`;
  // A política do workspace sozinha NÃO é designação: sem a elegibilidade provisória (só dev/test) ninguém é apresentado como decisor.
  // A capacidade de decidir também precisa constar, de forma explícita, no vínculo de quem decide (e dos outros decisores possíveis, acima).
  const designated = policy.allowed && await hasLogisticaMemberCapability(prismaGlobal, req.authContext!, ORACULO_DECISION_SCOPE) && provisionalDecisionEligibilityEnabled();
  const decideBlockedReason = !writeAllowed ? "read_only" as const : !policy.allowed ? "policy_absent" as const : !designated ? "not_designated" as const : null;
  return { policyAllowed: policy.allowed, deciderAvailable: designated && (others[0]?.n ?? 0) > 0, decideAllowed: writeAllowed && designated, decideBlockedReason };
}
oraculoPreparationRouter.get(`${base}/:id/decisions`, async (req: TenantAwareRequest, res) => {
  try {
    const value = await repository(req).get(req.params.id);
    if (!value) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    const me = req.authContext!.userId!;
    const writeAllowed = res.locals.preparationWriteAllowed === true;
    const eligibility = await decisionEligibility(req, writeAllowed);
    const states = deriveDecisionStates(value);
    const triggers = deriveOraculoDecisionTriggers(value);
    const coverage = decisionCoverage(value);
    const requestBlockedReason = !writeAllowed ? "read_only" : !triggers.length ? "no_decision_needed" : coverage !== "none" && coverage !== "obsolete" ? "already_requested"
      : !eligibility.deciderAvailable ? "no_eligible_decider" : null;
    return res.json({ ok: true, data: {
      caseId: value.caseId, revision: value.revision, coverage, triggers,
      requests: states.map(({ request, decision, status, basisCurrent }) => ({
        id: request.id, status, basisCurrent, basedOnRevision: request.basedOnRevision, requestedAt: request.requestedAt, requestedByYou: request.requestedBy === me,
        triggers: request.triggers, ...(request.note ? { note: request.note } : {}),
        ...(decision ? { decision: { id: decision.id, value: decision.decision, note: decision.note, decidedAt: decision.decidedAt, decidedByYou: decision.decidedBy === me, basedOnRevision: decision.basedOnRevision } } : {}),
      })),
      eligibility: { requestAllowed: requestBlockedReason === null, requestBlockedReason, deciderAvailable: eligibility.deciderAvailable, decideAllowed: eligibility.decideAllowed, decideBlockedReason: eligibility.decideBlockedReason },
      operationalAuthorization: "not_granted",
    } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.post(`${base}/:id/decision-requests`, async (req: TenantAwareRequest, res) => {
  const parsed = oraculoDecisionRequestInputV1Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "ORACULO_PREPARATION_INPUT_INVALID", reasonCode: "ORACULO_PREPARATION_INPUT_INVALID" } });
  try {
    const current = await repository(req).get(req.params.id);
    if (!current) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    if (!deriveOraculoDecisionTriggers(current).length) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "no_decision_needed");
    const eligibility = await decisionEligibility(req, res.locals.preparationWriteAllowed === true);
    // Sem responsável elegível não há para quem encaminhar: bloqueio explícito, nada é gravado.
    if (!eligibility.deciderAvailable) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "no_eligible_decider");
    const value = await repository(req).requestDecision(req.params.id, parsed.data, req.authContext!.userId!);
    return value ? res.status(201).json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
oraculoPreparationRouter.post(`${base}/:id/decisions`, async (req: TenantAwareRequest, res) => {
  const eligibility = await decisionEligibility(req, res.locals.preparationWriteAllowed === true);
  if (!eligibility.decideAllowed) return res.status(403).json({ ok: false, error: { code: "ORACULO_DECISION_DENIED", reasonCode: "ORACULO_DECISION_DENIED", subreason: eligibility.decideBlockedReason === "not_designated" ? "decision_not_designated" : "decision_policy_denied" } });
  const parsed = oraculoDecisionInputV1Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "ORACULO_PREPARATION_INPUT_INVALID", reasonCode: "ORACULO_PREPARATION_INPUT_INVALID" } });
  try {
    const value = await repository(req).recordDecision(req.params.id, parsed.data, req.authContext!.userId!);
    return value ? res.status(201).json({ ok: true, data: value }) : res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  } catch (error) { return failure(res, error); }
});
