import { z } from "zod";
import { looksLikeMultipleUnits, parseCanonicalImobUnits } from "./imobAssetDestination.js";

/** IMOB owns the pending form. Interpretation proposes; contextual confirmation edits; save is separate. */
export const IMOB_PROPERTY_CAPTURE_POLICY = Object.freeze({
  owner: "IMOB",
  operation: "property.create",
  step: "editing_form",
  minimumConfidence: 0.8,
  timeoutMs: 20_000,
  clientTimeoutMs: 30_000,
  placeholder: "Conte mais sobre este imóvel, faça uma pergunta ou corrija um dado",
  pausedPlaceholder: "Conte o novo assunto ou retome o cadastro do imóvel",
  pauseReply: "Mudar de assunto",
  resumeReply: "Continuar cadastro do imóvel",
  questionReply: "O que falta para cadastrar este imóvel?",
  confirmReply: "Quero aplicar essas alterações ao rascunho",
  rejectReply: "Prefiro manter os dados como estão",
  confirmationPlaceholder: "Revise as alterações, tire dúvidas ou diga se deseja aplicá-las ao rascunho",
  unavailable: "A assistência por IA está indisponível neste momento. Seu formulário, rascunho e eventuais alterações propostas foram mantidos; nenhuma alteração foi aplicada e o imóvel não foi salvo. Você pode continuar preenchendo manualmente ou retomar depois.",
  timeout: "A interpretação demorou mais que o limite. O cadastro e o formulário foram preservados, sem gravar o imóvel. Tente enviar novamente.",
  invalid: "Recebi uma interpretação inválida. O cadastro e o formulário foram preservados, sem gravar o imóvel. Tente enviar novamente.",
} as const);

// Existing editable form fields only. IDs, attachments and authorization never come from the model.
export const IMOB_PROPERTY_CAPTURE_FIELDS = ["propertyType", "goal", "unitLabel", "occupancy", "city", "address", "neighborhood", "cep", "areaM2", "bedrooms", "bathrooms", "garageSpots"] as const;
export type ImobPropertyCaptureField = typeof IMOB_PROPERTY_CAPTURE_FIELDS[number];
const draftShape = Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.map((key) => [key, z.string().max(600).optional()])) as Record<ImobPropertyCaptureField, z.ZodOptional<z.ZodString>>;
export const imobPropertyCaptureDraftSchema = z.object(draftShape).strict();
export type ImobPropertyCaptureDraft = z.infer<typeof imobPropertyCaptureDraftSchema>;
// Adapts the existing conversational-review descriptor (ref/contextRef/draftRef) to an unsaved form.
// It is correlation and integrity data, never a persistence/authorization credential.
export const imobPropertyCaptureOriginSchema = z.object({
  formId: z.string().min(1).max(200), contextRef: z.string().min(1).max(240),
  draftVersion: z.number().int().nonnegative(),
  threadId: z.string().max(200).nullable(), caseId: z.string().max(200).nullable(),
}).strict();
export const imobPropertyCaptureProposalSchema = z.object({
  version: z.literal(1), ref: z.string().min(1).max(200), draftRef: z.string().length(64),
  origin: imobPropertyCaptureOriginSchema,
  baseDraft: imobPropertyCaptureDraftSchema, changes: imobPropertyCaptureDraftSchema,
}).strict();
export type ImobPropertyCaptureProposal = z.infer<typeof imobPropertyCaptureProposalSchema>;
export const imobPropertyCaptureRequestSchema = z.object({
  guided: z.object({
    action: z.enum(["start", "sync", "interpret", "collect", "set", "skip", "focus", "review", "pause", "resume", "cancel", "confirm", "reject"]),
    sessionRef: z.string().uuid().optional(), revision: z.number().int().nonnegative().optional(),
    ownerId: z.string().max(80).optional(),
    fallbackView: z.object({ phase: z.enum(["start", "collecting", "review"]), skipped: z.array(z.string().max(80)).max(20), currentField: z.string().max(80).nullable() }).strict().optional(),
    field: z.string().max(80).optional(), value: z.string().max(600).optional(),
  }).strict().optional(),
  message: z.string().trim().min(1).max(2000),
  operation: z.literal("property.create"),
  step: z.literal("editing_form"),
  draft: imobPropertyCaptureDraftSchema,
  origin: imobPropertyCaptureOriginSchema.optional(),
  contextState: z.enum(["active", "paused"]).optional(),
  pendingProposal: imobPropertyCaptureProposalSchema.nullable().optional(),
  providedFields: z.array(z.string().max(80)).max(40).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }).strict()).max(6),
}).strict();
export type ImobPropertyCaptureRequest = z.infer<typeof imobPropertyCaptureRequestSchema>;
/** Additive IMOB contract; the full existing form remains the definition of question order/options. */
export const IMOB_PROPERTY_GUIDED_POLICY = Object.freeze({
  owner: "IMOB", startReply: "Cadastrar imóvel", collectReply: "Continuar sem IA",
  skipReply: "Pular este campo", reviewReply: "Revisar cadastro", cancelReply: "Cancelar cadastro do imóvel",
  opening: "Vamos cadastrar um imóvel, um campo por vez. Se quiser, descreva os dados iniciais para uma interpretação por IA, ou escolha Continuar sem IA. Nada será salvo antes da revisão e da sua ação no botão Salvar cadastro.",
  initialPlaceholder: "Descreva os dados iniciais ou escolha Continuar sem IA",
  collectingPlaceholder: "Responda ao campo solicitado, pule ou revise o cadastro",
  reviewPlaceholder: "Revise os campos; use Salvar cadastro para gravar",
  exhausted: "A interpretação inicial já foi utilizada ou dispensada. Seguimos sem IA: responda ao campo solicitado ou escolha uma opção. Você pode pular, corrigir, pausar ou revisar.",
  unavailable: "Não foi possível autorizar a interpretação inicial. Continue sem IA; seus dados foram preservados.",
} as const);
export const imobPropertyGuidedStateSchema = z.object({
  sessionRef: z.string().uuid().nullable(), revision: z.number().int().nonnegative(),
  phase: z.enum(["start", "collecting", "review"]), status: z.enum(["active", "paused", "cancelled", "saved"]),
  skipped: z.array(z.string().max(80)).max(20), interpretation: z.enum(["available", "consumed", "declined", "blocked"]),
  synchronized: z.boolean().optional(),
  fieldPatch: z.object({ name: z.string(), value: z.string() }).strict().optional(),
  currentField: z.string().max(80).nullable(), errors: z.record(z.string()),
  quickReplies: z.array(z.string()), showFullForm: z.boolean(),
}).strict();
export type ImobPropertyGuidedState = z.infer<typeof imobPropertyGuidedStateSchema>;
export const IMOB_PROPERTY_GUIDED_REQUIRED = ["propertyType", "city", "address"] as const;
type CaptureDefinition = { name: string; label: string; type: string; options?: Array<{ value: string; label: string }>; optionsSource?: string };
const countLimits: Record<string, number> = { areaM2: 100000, bedrooms: 50, bathrooms: 50, garageSpots: 100 };
/** Canonical single-field validation, shared by guided client, intake and server save. No semantic parsing. */
export function imobPropertyGuidedFieldError(field: CaptureDefinition, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (field.type === "select" && !field.optionsSource && !field.options?.some((item) => item.value === raw)) return "Selecione uma opção válida.";
  if (field.name in countLimits && (!/^\d+$/.test(raw) || Number(raw) > countLimits[field.name])) return `Informe um inteiro entre 0 e ${countLimits[field.name]}.`;
  const max = ({ unitLabel: 80, address: 240, city: 120, neighborhood: 120 } as Record<string, number>)[field.name] ?? 600;
  if (raw.length > max) return `Use até ${max} caracteres.`;
  if (field.name === "address" && raw.length < 5) return "Informe o endereço completo (mínimo de 5 caracteres).";
  if (field.name === "cep" && !/^\d{5}-?\d{3}$/.test(raw)) return "Informe um CEP com 8 dígitos.";
  if (field.name === "unitLabel" && (looksLikeMultipleUnits(raw) || (parseCanonicalImobUnits(raw)?.units.length ?? 0) > 1)) return "Este cadastro aceita uma única unidade. Informe somente sua identificação.";
  return null;
}
export function imobPropertyGuidedErrors(fields: CaptureDefinition[], values: Record<string, string | undefined>, skipped: string[] = []) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if ((IMOB_PROPERTY_GUIDED_REQUIRED as readonly string[]).includes(field.name) && (!values[field.name]?.trim() || skipped.includes(field.name))) {
      errors[field.name] = "Informe este campo obrigatório antes de salvar.";
    } else {
      const error = imobPropertyGuidedFieldError(field, values[field.name] ?? "");
      if (error) errors[field.name] = error;
    }
  }
  return errors;
}
export const imobPropertyCaptureResultSchema = z.object({
  guided: imobPropertyGuidedStateSchema.optional(),
  outcome: z.enum(["proposed", "updated", "rejected", "answered", "clarify", "leave", "resumed", "unavailable", "timeout", "invalid"]),
  patch: imobPropertyCaptureDraftSchema,
  proposal: imobPropertyCaptureProposalSchema.nullable().optional(),
  confirmedProposalRef: z.string().max(200).optional(),
  content: z.string().min(1).max(2400),
}).strict();
export type ImobPropertyCaptureResult = z.infer<typeof imobPropertyCaptureResultSchema>;

/** Exact contextual controls and canonical field values; free descriptions are interpreted only in the initial opt-in step. */
export function resolveImobPropertyGuidedCommand(input: string, state: ImobPropertyGuidedState,
  fields: Array<{ name: string; label: string; type: string; options?: Array<{ value: string; label: string }> }>, pending: boolean) {
  const fold = (text: string) => text.trim().normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
  const key = fold(input);
  const p = IMOB_PROPERTY_GUIDED_POLICY;
  const c = IMOB_PROPERTY_CAPTURE_POLICY;
  const commands: Array<[string, NonNullable<ImobPropertyCaptureRequest["guided"]>["action"]]> = [
    [p.collectReply, "collect"], [p.skipReply, "skip"], [p.reviewReply, "review"], [p.cancelReply, "cancel"],
    [c.pauseReply, "pause"], [c.resumeReply, "resume"], [c.confirmReply, "confirm"], [c.rejectReply, "reject"], [c.questionReply, "review"],
  ];
  for (const [label, action] of commands) if (key === fold(label)) return { action };
  if (pending && ["sim", "pode aplicar", "confirmo"].includes(key)) return { action: "confirm" as const };
  if (pending && ["nao", "nao aplicar"].includes(key)) return { action: "reject" as const };
  for (const field of fields) if ([`corrigir ${fold(field.label)}`, `retomar ${fold(field.label)}`].includes(key)) return { action: "focus" as const, field: field.name };
  if (state.status === "paused" || pending || state.phase === "review") return { action: "sync" as const };
  if (state.phase === "start" && state.interpretation === "available") return { action: "interpret" as const };
  const field = fields.find((field) => field.name === state.currentField);
  const option = field?.options?.find((option) => fold(option.label) === key || fold(option.value) === key);
  return { action: "set" as const, field: state.currentField ?? undefined, value: option?.value ?? input };
}
