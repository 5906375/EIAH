import { z } from "zod";
import { IMOB_PROPERTY_CAPTURE_FIELDS, IMOB_PROPERTY_CAPTURE_POLICY as policy,
  imobPropertyCaptureRequestSchema, type ImobPropertyCaptureRequest, type ImobPropertyCaptureResult } from "@eiah/contracts";
import { imobPropertyCreateSchema } from "../../../routes/imobCrmSchemas";
import { buildPropertyCreateForm } from "../imobTurnResolver";
import type { ImobPresentationForm } from "../imobConversationContract";

import { IMOB_PROPERTY_CAPTURE_SYSTEM_PROMPT } from "../imobAgentContract";

const interpretationSchema = z.object({
  intent: z.enum(["continue", "clarify", "change_subject"]),
  confidence: z.number().min(0).max(1),
  changes: z.array(z.object({ field: z.enum(IMOB_PROPERTY_CAPTURE_FIELDS), value: z.string().max(600),
    evidence: z.string().trim().min(1).max(2000), correction: z.boolean() }).strict()).max(IMOB_PROPERTY_CAPTURE_FIELDS.length),
  question: z.string().max(400).optional(),
  unsupported: z.array(z.string().max(80)).max(5).optional(),
}).strict();

const form: ImobPresentationForm = buildPropertyCreateForm();
const labels: Record<string, string> = Object.fromEntries(form.fields.map(({ name, label }) => [name, label]));
const required = form.fields.filter((field) => field.required).map((field) => field.name);
const limits: Record<string, number> = { unitLabel: 80, cep: 9 };
const numericFields = new Set(["areaM2", "bedrooms", "bathrooms", "garageSpots"]);

/** Server schemas protect scalar invariants; the exact catalog protects select values. Never interprets user language. */
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

export type ImobPropertyCaptureDeps = {
  /** Injected by the governed route after server-side access checks. No model SDK/fetch in this intake. */
  interpret: (prompts: { systemPrompt: string; userPrompt: string }) => Promise<string>;
  timeoutMs?: number;
};

export async function interpretImobPropertyCapture(request: ImobPropertyCaptureRequest, deps: ImobPropertyCaptureDeps): Promise<ImobPropertyCaptureResult> {
  const checked = imobPropertyCaptureRequestSchema.safeParse(request);
  const failure = (outcome: "invalid" | "timeout" | "unavailable"): ImobPropertyCaptureResult => ({ outcome, patch: {}, content: policy[outcome] });
  if (!checked.success) return failure("invalid");
  const current = checked.data;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = Symbol("timeout");
  let raw: string;
  try {
    raw = await Promise.race([
      deps.interpret({ systemPrompt: IMOB_PROPERTY_CAPTURE_SYSTEM_PROMPT, userPrompt: JSON.stringify({
        vertical: "IMOB", operation: current.operation, step: current.step, draft: current.draft, history: current.history,
        fields: labels, required,
        options: Object.fromEntries(form.fields.filter((field) => field.options?.length).map((field) => [field.name, field.options])), message: current.message,
      }) }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeout), deps.timeoutMs ?? policy.timeoutMs); }),
    ]);
  } catch (error) { return failure(error === timeout ? "timeout" : "unavailable"); }
  finally { if (timer) clearTimeout(timer); }
  let parsed: z.infer<typeof interpretationSchema>;
  try { parsed = interpretationSchema.parse(JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))); }
  catch { return failure("invalid"); }
  if (parsed.confidence < policy.minimumConfidence || parsed.intent === "clarify") return { outcome: "clarify", patch: {},
    content: parsed.question?.trim() || "Sua mensagem se refere a qual dado deste imóvel? Mantive o cadastro e todos os campos; esclareça antes de eu alterar o rascunho." };
  if (parsed.intent === "change_subject") return { outcome: "leave", patch: {},
    content: "Certo, pausei o cadastro para mudar de assunto. O formulário e o rascunho foram preservados, sem gravar o imóvel. Conte o novo assunto ou use Continuar cadastro do imóvel." };
  const patch: ImobPropertyCaptureResult["patch"] = {};
  const seen = new Set<string>();
  for (const change of parsed.changes) {
    if (seen.has(change.field) || !current.message.includes(change.evidence) || !validField(change.field, change.value)) return failure("invalid");
    seen.add(change.field);
    const previous = current.draft[change.field]?.trim();
    if (previous && previous !== change.value.trim() && !change.correction) return { outcome: "clarify", patch: {},
      content: `Você quer substituir ${labels[change.field]} (${previous}) por ${change.value || "um campo vazio"}? Mantive todos os dados enquanto você esclarece.` };
    patch[change.field] = change.value.trim();
  }
  const next = { ...current.draft, ...patch };
  const missing = required.filter((field) => !next[field as keyof typeof next]?.trim());
  const guidance = missing.length ? `Para cadastrar, ainda falta informar: ${missing.map((field) => labels[field]).join(", ")}.`
    : "Os campos obrigatórios estão preenchidos. Confira os dados e use Salvar cadastro no formulário quando quiser gravar.";
  return { outcome: parsed.changes.length ? "updated" : "answered", patch, content: [
    parsed.changes.length ? `Atualizei apenas o rascunho: ${parsed.changes.map(({ field }) => labels[field]).join(", ")}.` : "Continuamos no cadastro deste imóvel.",
    guidance, `Campos opcionais: ${form.fields.filter((field) => !field.required).map((field) => field.label).join(", ")}. Nada foi gravado.`,
    ...(parsed.unsupported?.length ? [`O formulário atual não possui campo para: ${parsed.unsupported.join(", ")}. Não armazenei esses dados.`] : []),
  ].join(" ") };
}
