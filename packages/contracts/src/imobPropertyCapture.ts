import { z } from "zod";

/** IMOB owns the pending property form. Interpretation only edits this draft; save remains an explicit form action. */
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
  unavailable: "Não consegui interpretar sua mensagem agora. O cadastro e o formulário foram preservados, sem gravar o imóvel. Tente enviar novamente.",
  timeout: "A interpretação demorou mais que o limite. O cadastro e o formulário foram preservados, sem gravar o imóvel. Tente enviar novamente.",
  invalid: "Recebi uma interpretação inválida. O cadastro e o formulário foram preservados, sem gravar o imóvel. Tente enviar novamente.",
} as const);

// Existing editable form fields only. IDs, attachments and authorization never come from the model.
export const IMOB_PROPERTY_CAPTURE_FIELDS = ["propertyType", "goal", "unitLabel", "occupancy", "city", "address", "neighborhood", "cep", "areaM2", "bedrooms", "bathrooms", "garageSpots"] as const;
export type ImobPropertyCaptureField = typeof IMOB_PROPERTY_CAPTURE_FIELDS[number];
const draftShape = Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.map((key) => [key, z.string().max(600).optional()])) as Record<ImobPropertyCaptureField, z.ZodOptional<z.ZodString>>;
export const imobPropertyCaptureDraftSchema = z.object(draftShape).strict();
export type ImobPropertyCaptureDraft = z.infer<typeof imobPropertyCaptureDraftSchema>;
export const imobPropertyCaptureRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  operation: z.literal("property.create"),
  step: z.literal("editing_form"),
  draft: imobPropertyCaptureDraftSchema,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }).strict()).max(6),
}).strict();
export type ImobPropertyCaptureRequest = z.infer<typeof imobPropertyCaptureRequestSchema>;
export const imobPropertyCaptureResultSchema = z.object({
  outcome: z.enum(["updated", "answered", "clarify", "leave", "unavailable", "timeout", "invalid"]),
  patch: imobPropertyCaptureDraftSchema,
  content: z.string().min(1).max(2400),
}).strict();
export type ImobPropertyCaptureResult = z.infer<typeof imobPropertyCaptureResultSchema>;
