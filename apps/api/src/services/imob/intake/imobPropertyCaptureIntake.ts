import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { IMOB_PROPERTY_CAPTURE_FIELDS, IMOB_PROPERTY_CAPTURE_POLICY as policy,
  imobPropertyCaptureRequestSchema, type ImobPropertyCaptureRequest, type ImobPropertyCaptureResult,
  type ImobPropertyCaptureDraft, type ImobPropertyCaptureProposal } from "@eiah/contracts";
import { imobPropertyCreateSchema } from "../../../routes/imobCrmSchemas";
import { buildPropertyCreateForm } from "../imobTurnResolver";
import { imobDraftReviewRef } from "../crm/imobProposalReviewContinuity";
import type { ImobPresentationForm } from "../imobConversationContract";
import { IMOB_PROPERTY_CAPTURE_SYSTEM_PROMPT } from "../imobAgentContract";
import { isLLMProviderError, type LLMFailureDiagnostic } from "@eiah/core/llm/LLMProviderError";

const interpretationSchema = z.object({
  intent: z.enum(["continue", "clarify", "confirm_changes", "reject_changes", "pause", "resume", "change_subject"]),
  confidence: z.number().min(0).max(1),
  changes: z.array(z.object({ field: z.enum(IMOB_PROPERTY_CAPTURE_FIELDS), value: z.string().max(600),
    evidence: z.string().trim().min(1).max(2000), correction: z.boolean() }).strict()).max(IMOB_PROPERTY_CAPTURE_FIELDS.length),
  proposalRef: z.string().max(200).nullable().optional(),
  question: z.string().max(400).nullable().optional(),
  topics: z.array(z.string().max(80)).max(10).optional(),
  unsupported: z.array(z.string().max(80)).max(5).optional(),
}).strict();

const form: ImobPresentationForm = buildPropertyCreateForm();
const labels: Record<string, string> = Object.fromEntries(form.fields.map(({ name, label }) => [name, label]));
const required = form.fields.filter((field) => field.required).map((field) => field.name);
const limits: Record<string, number> = { unitLabel: 80, cep: 9 };
const numericFields = new Set(["areaM2", "bedrooms", "bathrooms", "garageSpots"]);

/** Scalar and catalog validation only; never interprets user language. Partial drafts are valid. */
function validField(field: string, value: string) {
  if (!value) return true;
  const definition = form.fields.find((item) => item.name === field);
  if (!definition) return false;
  if (definition.type === "select") return definition.options?.some((option) => option.value === value) ?? false;
  if (field === "cep") return /^\d{5}-?\d{3}$/.test(value);
  if (field in limits) return value.length <= limits[field];
  if (numericFields.has(field) && !/^\d+$/.test(value)) return false;
  return imobPropertyCreateSchema.partial().safeParse({ [field]: numericFields.has(field) ? Number(value) : value }).success;
}

export type ImobPropertyCaptureDiagnostic = {
  stage: "request_schema" | "provider_unavailable" | "provider_timeout" | "json_parse" | "model_schema" | "field_validation" | "evidence_mismatch" | "proposal_stale" | "accepted";
  outcome: ImobPropertyCaptureResult["outcome"];
  providerFailure?: Readonly<LLMFailureDiagnostic>;
};
export type ImobPropertyCaptureDeps = {
  interpret: (prompts: { systemPrompt: string; userPrompt: string }) => Promise<string>;
  /** Derived by the route from authenticated server facts, never from the request. */
  scope?: { tenantId: string; workspaceId: string; userId?: string | null };
  observe?: (diagnostic: ImobPropertyCaptureDiagnostic) => void;
  timeoutMs?: number;
};

const draftTuple = (draft: ImobPropertyCaptureDraft) => IMOB_PROPERTY_CAPTURE_FIELDS.map((field) => draft[field] ?? "");
const draftRef = (draft: ImobPropertyCaptureDraft) => createHash("sha256").update(JSON.stringify(draftTuple(draft))).digest("hex");
function proposalRef(proposal: ImobPropertyCaptureProposal, scope: ImobPropertyCaptureDeps["scope"]) {
  const nonce = /^q:([0-9a-f-]{36}):/.exec(proposal.ref)?.[1];
  return nonce ? imobDraftReviewRef(nonce, [scope?.tenantId ?? "", scope?.workspaceId ?? "", scope?.userId ?? null,
    proposal.version, proposal.origin, proposal.draftRef, draftTuple(proposal.baseDraft), IMOB_PROPERTY_CAPTURE_FIELDS.map((field) => [field, Object.hasOwn(proposal.changes, field), proposal.changes[field] ?? null])]) : null;
}
function currentProposal(current: ImobPropertyCaptureRequest, scope: ImobPropertyCaptureDeps["scope"]) {
  const proposal = current.pendingProposal;
  if (!proposal || !current.origin || JSON.stringify(proposal.origin) !== JSON.stringify(current.origin)
    || draftRef(current.draft) !== proposal.draftRef || draftRef(proposal.baseDraft) !== proposal.draftRef
    || proposal.ref !== proposalRef(proposal, scope) || !Object.keys(proposal.changes).length
    || !Object.entries(proposal.changes).every(([field, value]) => validField(field, value!))) return null;
  return proposal;
}
const displayValue = (field: string, value: string) => !value ? "vazio" : form.fields.find((item) => item.name === field)?.options?.find((option) => option.value === value)?.label ?? value;
function guidance(draft: ImobPropertyCaptureDraft) {
  const missing = required.filter((field) => !draft[field as keyof typeof draft]?.trim());
  return missing.length ? `Ainda falta informar: ${missing.map((field) => labels[field]).join(", ")}. Pode me contar ${labels[missing[0]]} ou fornecer outros dados na ordem que preferir.`
    : "Os campos obrigatórios estão preenchidos. Revise o formulário e confirme a gravação separadamente pelo botão Salvar cadastro.";
}
function describeChanges(proposal: ImobPropertyCaptureProposal) {
  return Object.entries(proposal.changes).map(([field, value]) => {
    const previous = proposal.baseDraft[field as keyof ImobPropertyCaptureDraft]?.trim();
    return previous ? `Substituir ${labels[field]}: ${displayValue(field, previous)} por ${displayValue(field, value!)}`
      : `Incluir ${labels[field]}: ${displayValue(field, value!)}`;
  }).join("; ");
}

export async function interpretImobPropertyCapture(request: ImobPropertyCaptureRequest, deps: ImobPropertyCaptureDeps): Promise<ImobPropertyCaptureResult> {
  const checked = imobPropertyCaptureRequestSchema.safeParse(request);
  const emit = (stage: ImobPropertyCaptureDiagnostic["stage"], result: ImobPropertyCaptureResult, providerFailure?: Readonly<LLMFailureDiagnostic>) => {
    // Observability must never convert a safe response into a transport failure or include raw prompts/output.
    try { deps.observe?.({ stage, outcome: result.outcome, ...(providerFailure ? { providerFailure } : {}) }); } catch { /* best effort */ }
    return result;
  };
  if (!checked.success) return emit("request_schema", { outcome: "invalid", patch: {}, content: policy.invalid });
  const current = checked.data;
  const pending = currentProposal(current, deps.scope);
  const stale = Boolean(current.pendingProposal && !pending);
  const result = (outcome: ImobPropertyCaptureResult["outcome"], content: string, proposal = pending): ImobPropertyCaptureResult => ({ outcome, content, patch: {}, proposal });
  const failure = (outcome: "invalid" | "timeout" | "unavailable", stage: ImobPropertyCaptureDiagnostic["stage"]) => emit(stage, result(outcome, policy[outcome]));
  const filledFields = form.fields.filter((field) => current.draft[field.name as keyof typeof current.draft]?.trim()
    || (!IMOB_PROPERTY_CAPTURE_FIELDS.includes(field.name as typeof IMOB_PROPERTY_CAPTURE_FIELDS[number]) && current.providedFields?.includes(field.name))).map((field) => field.name);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = Symbol("timeout");
  let raw: string;
  try {
    raw = await Promise.race([
      deps.interpret({ systemPrompt: IMOB_PROPERTY_CAPTURE_SYSTEM_PROMPT, userPrompt: JSON.stringify({
        vertical: "IMOB", operation: current.operation, step: pending ? "review_draft_changes" : current.step,
        contextState: current.contextState ?? "active", draft: current.draft, history: current.history,
        pendingProposal: pending ? { ref: pending.ref, version: pending.version, changes: pending.changes } : null,
        fields: form.fields.map(({ name, label, required, placeholder, options }) => ({ name, label, required: Boolean(required), placeholder, options })),
        filledFields, missingFields: required.filter((field) => !filledFields.includes(field)), message: current.message,
      }) }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeout), deps.timeoutMs ?? policy.timeoutMs); }),
    ]);
  } catch (error) {
    return error === timeout ? failure("timeout", "provider_timeout")
      : emit("provider_unavailable", result("unavailable", policy.unavailable), isLLMProviderError(error) ? error.diagnostic : undefined);
  }
  finally { if (timer) clearTimeout(timer); }
  let json: unknown;
  try { json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { return failure("invalid", "json_parse"); }
  const validated = interpretationSchema.safeParse(json);
  if (!validated.success) return failure("invalid", "model_schema");
  const parsed = validated.data;
  if (parsed.topics?.some((field) => !(field in labels))) return failure("invalid", "field_validation");
  if (parsed.confidence < policy.minimumConfidence || parsed.intent === "clarify") return emit("accepted", result("clarify",
    `${parsed.question?.trim() || "Sua resposta se refere a quais dados ou alterações deste imóvel?"} Mantive o formulário${pending ? " e a proposta pendente" : ""}; nada foi alterado ou gravado.`));
  if (parsed.intent === "change_subject" || parsed.intent === "pause") return emit("accepted", result("leave",
    "Certo, pausei o cadastro para mudar de assunto. O formulário, o rascunho e eventuais alterações propostas foram preservados, sem gravar o imóvel. Você pode retomar com suas palavras."));
  if (parsed.intent === "confirm_changes") {
    if (!pending || !deps.scope?.tenantId || !deps.scope.workspaceId || parsed.proposalRef !== pending.ref
      || parsed.changes.length || current.contextState === "paused") return emit("proposal_stale", result("clarify",
      "Não há uma proposta vigente e inequívoca para esta confirmação. Nenhum campo mudou. Retome o cadastro ou informe as alterações para eu apresentar uma nova proposta.", pending));
    return emit("accepted", { outcome: "updated", patch: { ...pending.changes }, proposal: null, confirmedProposalRef: pending.ref,
      content: `Apliquei somente as alterações confirmadas ao rascunho. O imóvel ainda não foi salvo. ${guidance({ ...current.draft, ...pending.changes })}` });
  }
  if (parsed.intent === "reject_changes") return emit("accepted", result("rejected",
    `Desconsiderei a proposta de alterações. Nenhum campo foi alterado e o cadastro continua aberto. ${guidance(current.draft)} Nada foi gravado.`, null));
  if (current.contextState === "paused" && parsed.intent !== "resume") return emit("accepted", result("leave",
    "O cadastro permanece pausado, com o rascunho preservado; nenhuma alteração foi aplicada."));
  const patch: ImobPropertyCaptureDraft = {};
  const seen = new Set<string>();
  for (const change of parsed.changes) {
    if (seen.has(change.field) || !validField(change.field, change.value)) return failure("invalid", "field_validation");
    if (!current.message.includes(change.evidence)) return failure("invalid", "evidence_mismatch");
    seen.add(change.field);
    const previous = pending?.changes[change.field]?.trim() || current.draft[change.field]?.trim();
    if (previous && previous !== change.value.trim() && !change.correction) return emit("accepted", result("clarify",
      `Você quer substituir ${labels[change.field]} (${displayValue(change.field, previous)}) por ${displayValue(change.field, change.value)}? Mantive todos os dados e a proposta enquanto você esclarece.`));
    patch[change.field] = change.value.trim();
  }
  if (Object.keys(patch).length) {
    if (!current.origin) return emit("proposal_stale", result("clarify", "Reabra o cadastro nesta conversa para revisar as alterações com segurança. Nenhum campo foi alterado.", null));
    const changes = { ...pending?.changes, ...patch };
    for (const field of IMOB_PROPERTY_CAPTURE_FIELDS) if (changes[field] === (current.draft[field] ?? "")) delete changes[field];
    if (Object.keys(changes).length) {
      const proposal: ImobPropertyCaptureProposal = { version: 1, ref: `q:${randomUUID()}:`, draftRef: draftRef(current.draft),
        origin: current.origin, baseDraft: { ...current.draft }, changes };
      proposal.ref = proposalRef(proposal, deps.scope)!;
      return emit("accepted", result("proposed", `Entendi os dados. Posso aplicar estas alterações ao rascunho? ${describeChanges(proposal)}. ${guidance(current.draft)} O formulário ainda não mudou; confirmar esta proposta não salva o imóvel.`, proposal));
    }
    return emit("accepted", result(parsed.intent === "resume" ? "resumed" : "answered",
      `As alterações informadas correspondem aos dados atuais; não restou diferença para aplicar. Descartei a proposta anterior por inteiro. ${guidance(current.draft)} Nenhum campo mudou e nada foi gravado.`, null));
  }
  const answers = (parsed.topics ?? []).map((name) => {
    const field = form.fields.find((item) => item.name === name)!;
    return `${field.label}: ${field.required ? "obrigatório" : "opcional"}.${field.placeholder ? ` ${field.placeholder}` : ""}`;
  });
  return emit(stale ? "proposal_stale" : "accepted", result(parsed.intent === "resume" ? "resumed" : "answered", [
    parsed.intent === "resume" ? "Retomei o mesmo cadastro, preservando seus dados." : "Continuamos no cadastro deste imóvel.",
    ...answers, guidance(current.draft),
    ...(pending ? [`A proposta continua pendente: ${describeChanges(pending)}. Deseja aplicá-la ao rascunho?`] : []),
    ...(stale ? ["A proposta anterior ficou desatualizada e foi descartada por inteiro. Informe o que deseja alterar para uma nova revisão."] : []),
    ...(parsed.unsupported?.length ? [`O formulário atual não possui campo para: ${parsed.unsupported.join(", ")}. Não armazenei esses dados.`] : []),
    "Nada foi gravado.",
  ].join(" ")));
}
