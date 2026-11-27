import { z } from "zod";

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
export const imobPropertyCaptureResultSchema = z.object({
  outcome: z.enum(["proposed", "updated", "rejected", "answered", "clarify", "leave", "resumed", "unavailable", "timeout", "invalid"]),
  patch: imobPropertyCaptureDraftSchema,
  proposal: imobPropertyCaptureProposalSchema.nullable().optional(),
  confirmedProposalRef: z.string().max(200).optional(),
  content: z.string().min(1).max(2400),
}).strict();
export type ImobPropertyCaptureResult = z.infer<typeof imobPropertyCaptureResultSchema>;
