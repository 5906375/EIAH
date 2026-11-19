import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@repo/db";
import {
  IMOB_PROPERTY_CAPTURE_FIELDS, IMOB_PROPERTY_CAPTURE_POLICY as capturePolicy, IMOB_PROPERTY_GUIDED_POLICY as policy,
  imobPropertyCaptureDraftSchema, imobPropertyCaptureOriginSchema, imobPropertyCaptureProposalSchema,
  imobPropertyGuidedStateSchema, imobPropertyGuidedErrors, imobPropertyGuidedFieldError,
  type ImobPropertyCaptureRequest, type ImobPropertyCaptureResult, type ImobPropertyGuidedState,
} from "@eiah/contracts";
import type { ImobPresentationForm } from "../imobConversationContract";
import { buildPropertyCreateForm } from "../imobTurnResolver";
import { PROPERTY_CAPTURE_SESSION, PropertyCaptureActiveError, openPropertyCapture, propertyCaptureSessionWhere, withPropertyCaptureLock, type PropertyCaptureScope } from "../imobChatConversationManagement";
import { interpretImobPropertyCapture, type ImobPropertyCaptureDeps } from "./imobPropertyCaptureIntake";

const definition: ImobPresentationForm = buildPropertyCreateForm();
const fields = definition.fields;
const persistedSchema = z.object({
  actorUserId: z.string(), sessionRef: z.string().uuid(), origin: imobPropertyCaptureOriginSchema,
  revision: z.number().int().nonnegative(), phase: imobPropertyGuidedStateSchema.shape.phase,
  status: imobPropertyGuidedStateSchema.shape.status, interpretation: imobPropertyGuidedStateSchema.shape.interpretation,
  skipped: z.array(z.string()), focus: z.string().nullable(),
  draft: imobPropertyCaptureDraftSchema.extend({ ownerId: z.string().max(80).optional() }),
  pending: imobPropertyCaptureProposalSchema.nullable(),
});
type Session = z.infer<typeof persistedSchema>;
type Row = { id: string; metadata: Prisma.JsonValue | null };
export type PropertyGuidedDeps = ImobPropertyCaptureDeps & { prisma: PrismaClient; scope: PropertyCaptureScope };
const isOpen = (session: Session) => session.status === "active" || session.status === "paused";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameOrigin = (a: Session["origin"], b: Session["origin"]) => a.formId === b.formId && a.contextRef === b.contextRef
  && a.threadId === b.threadId && a.caseId === b.caseId;
const modelDraft = (draft: Session["draft"]) => Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.map((field) => [field, draft[field] ?? ""]));
const currentField = (session: Session) => session.focus ?? fields.find((field) => !session.skipped.includes(field.name)
  && (!session.draft[field.name as keyof Session["draft"]]?.trim()
    || imobPropertyGuidedFieldError(field, session.draft[field.name as keyof Session["draft"]] ?? "")))?.name ?? null;
const metadata = (session: Session): Prisma.InputJsonValue => JSON.parse(JSON.stringify(session));
async function rows(tx: Prisma.TransactionClient, scope: PropertyCaptureScope) {
  return tx.memoryEvent.findMany({ where: propertyCaptureSessionWhere(scope), orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, metadata: true } });
}
function sessions(found: Row[]) {
  return found.map((row) => ({ row, parsed: persistedSchema.safeParse(row.metadata) }))
    .flatMap(({ row, parsed }) => parsed.success ? [{ row, session: parsed.data }] : []);
}
async function store(tx: Prisma.TransactionClient, session: Session) {
  await tx.memoryEvent.update({ where: { id: session.sessionRef }, data: { metadata: metadata(session) } });
}
function present(session: Session, content: string, extra: Partial<ImobPropertyCaptureResult> = {}): ImobPropertyCaptureResult {
  const current = currentField(session);
  if (session.phase === "collecting" && !current) session.phase = "review";
  const errors = imobPropertyGuidedErrors(fields, session.draft, session.skipped);
  const active = session.status === "active";
  const question = fields.find((field) => field.name === current);
  const replies = !active ? session.status === "paused" ? [capturePolicy.resumeReply, policy.cancelReply] : []
    : session.pending ? [capturePolicy.confirmReply, capturePolicy.rejectReply, policy.reviewReply]
    : session.phase === "start" ? [policy.collectReply, policy.reviewReply, policy.cancelReply]
    : session.phase === "review" ? [capturePolicy.pauseReply, policy.cancelReply]
    : [policy.skipReply, policy.reviewReply, capturePolicy.pauseReply];
  return { outcome: "answered", patch: {}, proposal: session.pending, ...extra,
    content: [content, active && session.phase === "collecting" && !session.pending && question
      ? `${question.label}${question.required ? " (obrigatório)" : " (opcional)"}: ${question.type === "select" ? "selecione uma opção ou informe seu nome." : "informe o valor deste campo."}` : "",
    active && session.phase === "review" ? `Revise o formulário antes de salvar.${Object.keys(errors).length ? ` Pendências: ${Object.keys(errors).map((key) => fields.find((field) => field.name === key)?.label).join(", ")}.` : ""}` : ""].filter(Boolean).join(" "),
    guided: { sessionRef: session.sessionRef, revision: session.revision, phase: session.phase, status: session.status,
      interpretation: session.interpretation, skipped: session.skipped, currentField: active && session.phase === "collecting" ? current : null,
      errors, quickReplies: replies, showFullForm: active && session.phase === "review", ...extra.guided },
  };
}
const invalid = (): ImobPropertyCaptureResult => ({ outcome: "clarify", patch: {}, proposal: null,
  content: "Esta sessão ou revisão não está vigente. Sincronize ou inicie um novo cadastro explicitamente. Nenhum dado foi alterado." });

/** IMOB engine: admission is committed before interpret() can dispatch. No transaction spans a provider call. */
export async function resolveImobPropertyGuidedCapture(request: ImobPropertyCaptureRequest, deps: PropertyGuidedDeps): Promise<ImobPropertyCaptureResult> {
  const command = request.guided;
  // Closing a session names it by its server-issued reference; it needs neither the lost origin nor the latest draft revision.
  const closeRef = command && (command.action === "cancel" || command.action === "pause") ? command.sessionRef : undefined;
  if (!command || (!request.origin && !closeRef)) return invalid();
  let admission: { session: Session; admitted: boolean; result: ImobPropertyCaptureResult; conflict?: Session };
  try {
    admission = await withPropertyCaptureLock(deps.prisma, deps.scope, async (tx) => {
      const found = sessions(await rows(tx, deps.scope));
      let session = found.find((item) => item.session.sessionRef === command.sessionRef)?.session;
      if (closeRef) {
        // Authenticated scope is already enforced by the query. Only the named session can change; request draft/origin are ignored,
        // and a session that is already terminal is reported as persisted (idempotent), never reopened or replaced.
        const target = session;
        if (!target) return { session: session!, admitted: false, result: invalid() };
        if (!isOpen(target)) return { session: target, admitted: false, result: present(target, "Esta sessão já foi encerrada; nenhuma alteração foi feita.", { proposal: null }) };
        if (command.action === "cancel") { target.status = "cancelled"; target.pending = null; }
        else if (target.status === "active") target.status = "paused";
        else return { session: target, admitted: false, result: present(target, "O cadastro já está pausado.") };
        target.revision++;
        const result = present(target, command.action === "cancel" ? "Cadastro cancelado. Nada foi salvo."
          : "Cadastro pausado; dados, campos pulados e consumo preservados.");
        await store(tx, target);
        return { session: target, admitted: false, result };
      }
      if (command.action === "cancel" && !command.sessionRef) {
        const existing = found.find((item) => sameOrigin(item.session.origin, request.origin!))?.session;
        if (existing) {
          if (!isOpen(existing)) return { session: existing, admitted: false, result: present(existing, "Esta sessão já foi encerrada.") };
          existing.status = "cancelled"; existing.pending = null; existing.revision++;
          await store(tx, existing);
          return { session: existing, admitted: false, result: present(existing, "Abertura cancelada. Nada foi salvo.") };
        }
        // A cancellation can arrive before the opening request. Its terminal record prevents the delayed start from creating a session.
        const cancelled: Session = { actorUserId: deps.scope.userId!, sessionRef: randomUUID(), origin: request.origin!, revision: 0,
          phase: "start", status: "cancelled", interpretation: "declined", skipped: [], focus: null, draft: {}, pending: null };
        await tx.memoryEvent.create({ data: { id: cancelled.sessionRef, tenantId: deps.scope.tenantId, workspaceId: deps.scope.workspaceId,
          agentId: "imob-chat", key: PROPERTY_CAPTURE_SESSION, content: "Controle de coleta de imóvel", metadata: metadata(cancelled) } });
        const other = found.some((item) => isOpen(item.session));
        return { session: cancelled, admitted: false, result: present(cancelled, other
          ? "Abertura cancelada. Outro cadastro pendente deste usuário não foi alterado; cancele-o pelo aviso de cadastro pendente. Nada foi salvo."
          : "Abertura cancelada. Nada foi salvo.") };
      }
      const recovery = !command.sessionRef && ["collect", "review", "focus", "set", "sync", "resume"].includes(command.action);
      if (command.action === "start" || recovery) {
        // Repeated start/formId changes do not grant another admission while a capture is open.
        const open = found.find((item) => isOpen(item.session));
        if (open) {
          // Another origin cannot adopt, renew or replace it. The conflict names the server-owned session so the client can offer the explicit,
          // authorized recovery (cancel by reference); nothing is changed here.
          if (!sameOrigin(open.session.origin, request.origin!)) return { session: open.session, admitted: false, result: invalid(), conflict: open.session };
          return { session: open.session, admitted: false, result: present(open.session, policy.opening, { patch: modelDraft(open.session.draft),
            guided: { synchronized: true, fieldPatch: { name: "ownerId", value: open.session.draft.ownerId ?? "" } } as ImobPropertyGuidedState }) };
        }
        const ended = found.find((item) => sameOrigin(item.session.origin, request.origin!))?.session;
        if (ended) return { session: ended, admitted: false, result: present(ended, "Esta abertura já foi encerrada. Inicie um novo cadastro explicitamente.") };
        session = { actorUserId: deps.scope.userId!, sessionRef: randomUUID(), origin: request.origin!, revision: 0,
          phase: recovery ? "collecting" : "start", status: "active", interpretation: recovery ? "declined" : "available",
          skipped: recovery ? command.fallbackView?.skipped ?? [] : [], focus: null, draft: { ...request.draft, ...(command.ownerId ? { ownerId: command.ownerId } : {}) }, pending: null };
        await tx.memoryEvent.create({ data: { id: session.sessionRef, tenantId: deps.scope.tenantId, workspaceId: deps.scope.workspaceId,
          agentId: "imob-chat", key: PROPERTY_CAPTURE_SESSION, content: "Controle de coleta de imóvel", metadata: metadata(session) } });
        if (!recovery) return { session, admitted: false, result: present(session, policy.opening) };
      }
      if (!session || !sameOrigin(session.origin, request.origin!)) return { session: session!, admitted: false, result: invalid() };
      if (!isOpen(session)) return { session, admitted: false, result: present(session,
        "Esta sessão já foi encerrada. Inicie um novo cadastro explicitamente; nenhum campo foi alterado.", { proposal: null }) };
      // Stale snapshots may read current state but can never overwrite it or re-authorize interpretation.
      if (command.revision !== session.revision) return { session, admitted: false, result: present(session,
        "O cadastro foi atualizado. Sincronizei a versão atual; repita sua escolha.", { patch: modelDraft(session.draft), proposal: session.pending,
          guided: { synchronized: true, fieldPatch: { name: "ownerId", value: session.draft.ownerId ?? "" } } as ImobPropertyGuidedState }) };
      const targetField = currentField(session);
      const supplied = { ...request.draft, ...(command.ownerId !== undefined ? { ownerId: command.ownerId } : {}) };
      // Edits in the review form invalidate the complete pending proposal, including edit/undo revisions.
      if (!same(modelDraft(session.draft), modelDraft(supplied)) || !same(session.origin, request.origin)) session.pending = null;
      if (session.phase === "review" || command.action === "sync" || command.action === "interpret") session.draft = supplied;
      session.origin = request.origin!;
      const action = command.action;
      if (["collect", "review", "focus", "set", "skip"].includes(action) && session.interpretation === "available") session.interpretation = "declined";
      let content = "Continuamos no mesmo cadastro. Nada foi salvo.";
      let fieldPatch: ImobPropertyGuidedState["fieldPatch"];
      let patch: ImobPropertyCaptureResult["patch"] = {};
      let confirmedProposalRef: string | undefined;
      let admitted = false;
      if (action === "cancel") { session.status = "cancelled"; session.pending = null; content = "Cadastro cancelado. Nada foi salvo."; }
      else if (action === "pause") { session.status = "paused"; content = "Cadastro pausado; dados, campos pulados e consumo preservados."; }
      else if (action === "resume") { session.status = "active"; content = "Retomei o mesmo cadastro."; }
      else if (session.status === "paused" && action !== "sync") content = "Retome o cadastro para continuar.";
      else if (action === "interpret") {
        if (session.interpretation === "available" && session.phase === "start") {
          session.interpretation = "consumed"; session.phase = "collecting"; admitted = true;
        } else content = policy.exhausted;
      } else if (action === "collect") {
        if (session.interpretation === "available") session.interpretation = "declined";
        session.phase = "collecting";
      } else if (action === "review") { if (session.interpretation === "available") session.interpretation = "declined"; session.phase = "review"; session.focus = null; session.pending = null; }
      else if (action === "confirm") {
        const pending = session.pending;
        if (pending && request.pendingProposal && same(pending, request.pendingProposal) && same(pending.origin, request.origin)
          && same(modelDraft(pending.baseDraft), modelDraft(session.draft))) {
          patch = pending.changes; session.draft = { ...session.draft, ...patch };
          session.skipped = session.skipped.filter((key) => !(key in patch));
          confirmedProposalRef = pending.ref; session.pending = null;
          content = "Apliquei somente os dados confirmados ao rascunho. O imóvel ainda não foi salvo.";
        } else { session.pending = null; content = "Não há uma proposta vigente para confirmar. Escolha um campo para continuar."; }
      } else if (action === "reject") session.pending = null;
      else if (action === "focus") {
        if (fields.some((field) => field.name === command.field)) {
          session.focus = command.field!; session.skipped = session.skipped.filter((key) => key !== command.field);
          session.phase = "collecting"; session.pending = null;
        } else content = "Selecione o campo que deseja corrigir ou retomar.";
      } else if (action === "skip") {
        const field = currentField(session);
        if (field) session.skipped = [...new Set([...session.skipped, field])];
        session.focus = null; session.pending = null; session.phase = "collecting";
        content = "Campo pulado sem inventar valor. Obrigatórios continuam pendentes para salvar.";
      } else if (action === "set") {
        const field = fields.find((field) => field.name === targetField);
        if (!field || (command.field && field.name !== command.field)) content = "Responda somente ao campo solicitado ou selecione outro campo para corrigir.";
        else {
          const value = (command.value ?? request.message).trim();
          let error = !value ? "Informe um valor ou pule o campo." : imobPropertyGuidedFieldError(field, value);
          if (!error && field.name === "ownerId" && !await tx.imobOwner.findFirst({ where: { id: value, tenantId: deps.scope.tenantId,
            workspaceId: deps.scope.workspaceId, status: { not: "archived" } }, select: { id: true } })) error = "Selecione um proprietário deste workspace.";
          if (error) content = `${field.label}: ${error} Corrija ou escolha Pular este campo.`;
          else {
            session.draft[field.name as keyof Session["draft"]] = value;
            if (field.name === "ownerId") fieldPatch = { name: field.name, value };
            else patch = { [field.name]: value };
            session.skipped = session.skipped.filter((key) => key !== field.name);
            session.focus = null; session.pending = null; session.phase = "collecting";
          }
        }
      }
      session.revision += 1;
      const result = present(session, content, { patch, confirmedProposalRef,
        ...(fieldPatch ? { guided: { fieldPatch } as ImobPropertyGuidedState } : {}) });
      await store(tx, session);
      return { session, admitted, result };
    });
  } catch {
    return unavailableGuidedCollection(request);

  }
  if (admission.conflict) throw new PropertyCaptureActiveError({ sessionRef: admission.conflict.sessionRef, status: admission.conflict.status === "paused" ? "paused" : "active" });
  if (!admission.admitted) return admission.result;
  const session = admission.session;
  // Context the interpretation was built on. Only a change to it (not a bare revision bump) makes the proposal incompatible.
  const base = { origin: session.origin, draft: modelDraft(session.draft), skipped: [...session.skipped], focus: session.focus, phase: session.phase };
  const interpreted = await interpretImobPropertyCapture({ ...request, guided: undefined, pendingProposal: null }, deps);
  try {
    return await withPropertyCaptureLock(deps.prisma, deps.scope, async (tx) => {
      const now = sessions(await rows(tx, deps.scope)).find((item) => item.session.sessionRef === session.sessionRef)?.session;
      if (!now || !isOpen(now) || now.status !== "active") return invalid();
      const compatible = !now.pending && same(now.origin, base.origin) && same(modelDraft(now.draft), base.draft)
        && same(now.skipped, base.skipped) && now.focus === base.focus && now.phase === base.phase;
      if (!compatible) return present(now, "O cadastro mudou enquanto a interpretação era feita; descartei a proposta para não aplicar dados incompatíveis. "
        + `${policy.exhausted}`, { outcome: "clarify", patch: {}, proposal: null });
      const validProposal = interpreted.proposal && Object.entries(interpreted.proposal.changes).every(([key, value]) => {
        const field = fields.find((field) => field.name === key);
        return field && !imobPropertyGuidedFieldError(field, value ?? "");
      });
      now.pending = interpreted.outcome === "proposed" && validProposal ? interpreted.proposal ?? null : null;
      now.revision += 1;
      const content = now.pending ? interpreted.content : policy.exhausted;
      const result = present(now, content, { outcome: interpreted.outcome === "proposed" && !now.pending ? "invalid" : interpreted.outcome, patch: {}, proposal: now.pending });
      await store(tx, now);
      return result;
    });
  } catch { return { ...admission.result, outcome: "unavailable", proposal: null, content: policy.unavailable }; }
}

/** Degraded presentation/data only. Client view never grants admission or persistence authority. */
function unavailableGuidedCollection(request: ImobPropertyCaptureRequest): ImobPropertyCaptureResult {
  const command = request.guided!;
  const previous = command.fallbackView;
  const session: Session = { actorUserId: "unavailable", sessionRef: command.sessionRef ?? randomUUID(), origin: request.origin!,
    revision: command.revision ?? 0, phase: previous?.phase ?? "collecting", status: "active", interpretation: "blocked",
    skipped: previous?.skipped ?? [], focus: previous?.currentField ?? null,
    draft: { ...request.draft, ...(command.ownerId ? { ownerId: command.ownerId } : {}) }, pending: null };
  let patch: ImobPropertyCaptureResult["patch"] = {};
  let content: string = policy.unavailable;
  if (command.action === "review") { session.phase = "review"; session.focus = null; }
  if (command.action === "collect") session.phase = "collecting";
  if (command.action === "pause" || command.action === "cancel") {
    session.status = "paused"; content = "Seus dados estão preservados. O servidor está indisponível para confirmar o encerramento da sessão. Retome e tente cancelar novamente.";
  }
  if (command.action === "focus" && fields.some((field) => field.name === command.field)) {
    session.focus = command.field!; session.phase = "collecting"; session.skipped = session.skipped.filter((key) => key !== command.field);
  }
  if (command.action === "skip") {
    const field = currentField(session);
    if (field) session.skipped = [...new Set([...session.skipped, field])];
    session.focus = null;
  }
  if (command.action === "set") {
    const field = fields.find((field) => field.name === currentField(session));
    const value = (command.value ?? request.message).trim();
    if (!field || field.name === "ownerId") content += " A seleção de proprietário será validada quando o servidor estiver disponível.";
    else {
      const error = !value ? "Informe um valor ou pule o campo." : imobPropertyGuidedFieldError(field, value);
      if (error) content += ` ${field.label}: ${error}`;
      else { patch = { [field.name]: value }; session.draft = { ...session.draft, ...patch }; session.focus = null; }
    }
  }
  const result = present(session, content, { patch });
  result.guided!.sessionRef = command.sessionRef ?? null;
  return result;
}

/** Same create handler/service; server facts select validation even if client removes or tampers with guided metadata. */
export async function withGuidedPropertySave<T extends { status: string }>(prisma: PrismaClient, scope: PropertyCaptureScope,
  input: Record<string, unknown>, create: (client: PrismaClient) => Promise<T>): Promise<T | { status: "guided_invalid"; errors: Record<string, string> }> {
  if (!scope.userId) return create(prisma); // Legacy non-user consumers cannot own a guided session.
  const supplied = (input.metadata as { propertyCaptureSessionRef?: unknown } | null | undefined)?.propertyCaptureSessionRef;
  // Legacy/batch saves with no guided session open (nor claimed) keep their previous non-transactional path: no lock, no extra transaction.
  // A session opened after this check only means the legacy save happened first; it cannot bypass an open session's validation.
  if (typeof supplied !== "string" && !await openPropertyCapture(prisma, scope, true)) return create(prisma);
  return withPropertyCaptureLock(prisma, scope, async (tx) => {
    const found = sessions(await rows(tx, scope));
    const meta = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {};
    const suppliedRef = typeof meta.propertyCaptureSessionRef === "string" ? meta.propertyCaptureSessionRef : null;
    const open = found.filter((item) => isOpen(item.session));
    const selected = found.find((item) => item.session.sessionRef === suppliedRef)?.session;
    if (suppliedRef || open.length) {
      if (!selected || selected.status !== "active" || selected.phase !== "review" || !isOpen(selected)) {
        return { status: "guided_invalid", errors: { _form: "Reabra a revisão vigente deste cadastro antes de salvar." } };
      }
      const values: Record<string, string> = Object.fromEntries(fields.map((field) => [field.name, String(input[field.name] ?? "")]));
      values.unitLabel = typeof meta.externalPropertyRef === "string" ? meta.externalPropertyRef : "";
      values.cep = typeof meta.cep === "string" ? meta.cep : "";
      const occupancy = meta.occupancy && typeof meta.occupancy === "object" ? meta.occupancy as Record<string, unknown> : {};
      values.occupancy = typeof occupancy.value === "string" ? occupancy.value : "";
      // Review edits may fill a previously skipped required field; its actual value is authoritative at explicit save.
      const errors = imobPropertyGuidedErrors(fields, values, selected.skipped.filter((key) => values[key] === (selected.draft[key as keyof typeof selected.draft] ?? "")));
      if (Object.keys(errors).length) return { status: "guided_invalid", errors };
    }
    const created = await create(tx as PrismaClient);
    if (selected && created.status !== "owner_not_found") { selected.status = "saved"; selected.pending = null; selected.revision++; await store(tx, selected); }
    return created;
  });
}
