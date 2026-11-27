import { z } from "zod";
import { instant, knownOrUnknown, sha256Hex, stableId, text, uniqueArray } from "./dataSourcePrimitives.js";

/**
 * Vínculo futuro fornecedor × canal × tenant/workspace e evento de entrada (Oráculo SC, etapa 2 — SEM execução).
 *
 * Um canal (p.ex. WhatsApp) é só um meio de comunicação: a presença de uma mensagem NÃO comprova identidade, veracidade
 * nem autorização. Este módulo não recebe, baixa nem processa mensagens ou anexos, não escolhe provedor de WhatsApp e
 * não habilita envio. Capacidades declaradas são declarações; nenhuma concede permissão.
 */

/** Escopo obrigatório: canais de fornecedor são sempre de um tenant/workspace. */
const tenantWorkspaceScope = z.object({ kind: z.literal("tenant_workspace"), tenantId: text, workspaceId: text }).strict();

export const SUPPLIER_CHANNELS = ["whatsapp"] as const;
export const supplierChannelSchema = z.enum(SUPPLIER_CHANNELS);

export const SUPPLIER_DECLARED_CAPABILITIES = ["receive", "query", "request_update", "propose_case_change", "execute_action"] as const;

// Referência opaca do remetente: nunca o telefone/e-mail em claro (PII).
// Telefone = só dígitos e pontuação de telefone com 7+ dígitos (cobre "+55 11 99999-9999", "(11) 99999-9999"); e-mail = contém "@".
const looksLikePhone = (v: string) => /^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 7;
const externalSenderRef = text.refine((v) => !looksLikePhone(v) && !v.includes("@"), "referência do remetente não pode ser telefone/e-mail em claro");

export const senderVerificationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unverified") }).strict(),
  z.object({ status: z.literal("verification_pending"), requestedAt: instant }).strict(),
  z.object({
    status: z.literal("verified"),
    method: z.enum(["manual_callback", "documented_registration", "channel_provider_attestation"]),
    verifiedBy: text,
    verifiedAt: instant,
    evidenceRef: text,
  }).strict(),
  z.object({ status: z.literal("failed"), checkedAt: instant, reason: text }).strict(),
]);

export const senderIdentityV1Schema = z.object({ externalSenderRef, verification: senderVerificationSchema }).strict();

export const supplierChannelLinkV1Schema = z.object({
  schemaVersion: z.literal("eiah.supplier-channel-link.v1"),
  linkId: stableId,
  scope: tenantWorkspaceScope,
  /** Referencia o cadastro único do fornecedor; vários vínculos (canais/remetentes) NÃO duplicam o fornecedor. */
  supplier: z.discriminatedUnion("status", [
    z.object({ status: z.literal("resolved"), providerId: stableId }).strict(),
    z.object({ status: z.literal("unresolved") }).strict(),
  ]),
  channel: supplierChannelSchema,
  /** Conexão `channel_message` associada, quando existir. */
  connectionId: stableId.optional(),
  senderIdentity: senderIdentityV1Schema,
  /** DECLARADAS. Nenhuma concede autorização; o Core decide a cada acesso/ação. */
  declaredCapabilities: uniqueArray(z.enum(SUPPLIER_DECLARED_CAPABILITIES), 0, SUPPLIER_DECLARED_CAPABILITIES.length, "capacidades"),
  /** Envio não habilitado e provedor de transporte não escolhido (decisão inexistente). */
  outbound: z.literal("not_enabled"),
  transportProvider: z.literal("not_selected"),
  grantsAuthorization: z.literal(false),
}).strict();
export type SupplierChannelLinkV1 = z.infer<typeof supplierChannelLinkV1Schema>;

// --- Evento de entrada ---------------------------------------------------------------------------------------
/** Associação ao caso: resolvida, pendente ou ambígua. Ambígua carrega os candidatos e nunca escolhe um. */
export const caseAssociationV1Schema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    caseRef: z.object({ caseId: text, caseType: text }).strict(),
    resolvedBy: z.object({ kind: z.enum(["human", "system"]), ref: text }).strict(),
    basis: text,
  }).strict(),
  z.object({ status: z.literal("pending") }).strict(),
  z.object({ status: z.literal("ambiguous"), candidateCaseIds: uniqueArray(text, 2, 20, "casos candidatos") }).strict(),
]);

/** Anexo apenas REFERENCIADO: o que o remetente declarou, sem receber, baixar nem processar. */
export const attachmentReferenceV1Schema = z.object({
  attachmentRef: text,
  declaredMediaType: text.optional(),
  declaredByteLength: z.number().int().nonnegative().optional(),
  declaredSha256: sha256Hex.optional(),
  handling: z.literal("referenced_only"),
}).strict();

export const channelInboundEventV1Schema = z.object({
  schemaVersion: z.literal("eiah.channel-inbound-event.v1"),
  eventId: text,
  scope: tenantWorkspaceScope,
  channel: supplierChannelSchema,
  /** Identificador do evento no canal (chave de deduplicação). Opaco. */
  externalEventRef: text,
  linkRef: z.discriminatedUnion("status", [
    z.object({ status: z.literal("matched"), linkId: stableId }).strict(),
    z.object({ status: z.literal("unmatched") }).strict(),
  ]),
  sender: senderIdentityV1Schema,
  receivedAt: instant,
  sentAt: knownOrUnknown(instant),
  caseAssociation: caseAssociationV1Schema,
  messageContent: z.discriminatedUnion("status", [
    z.object({ status: z.literal("not_captured") }).strict(),
    z.object({ status: z.literal("referenced"), contentRef: text, sha256: sha256Hex }).strict(),
  ]),
  attachments: z.array(attachmentReferenceV1Schema).max(20),
  /** Referências a evidências de origem v2 (a evidência NÃO é embutida aqui). */
  evidenceRefs: z.array(z.object({ evidenceId: text, contentSha256: sha256Hex }).strict()).max(20),
  grantsAuthorization: z.literal(false),
}).strict().superRefine((e, ctx) => {
  const refs = e.attachments.map((a) => a.attachmentRef);
  if (new Set(refs).size !== refs.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["attachments"], message: "anexo duplicado" });
});
export type ChannelInboundEventV1 = z.infer<typeof channelInboundEventV1Schema>;

/** Isolamento: o evento só pode referenciar um vínculo do MESMO tenant/workspace. */
export function checkInboundEventAgainstLink(event: ChannelInboundEventV1, link: SupplierChannelLinkV1): Array<"LINK_ID_MISMATCH" | "SCOPE_MISMATCH" | "CHANNEL_MISMATCH" | "SENDER_MISMATCH"> {
  const issues: Array<"LINK_ID_MISMATCH" | "SCOPE_MISMATCH" | "CHANNEL_MISMATCH" | "SENDER_MISMATCH"> = [];
  if (event.linkRef.status !== "matched" || event.linkRef.linkId !== link.linkId) issues.push("LINK_ID_MISMATCH");
  if (event.scope.tenantId !== link.scope.tenantId || event.scope.workspaceId !== link.scope.workspaceId) issues.push("SCOPE_MISMATCH");
  if (event.channel !== link.channel) issues.push("CHANNEL_MISMATCH");
  if (event.sender.externalSenderRef !== link.senderIdentity.externalSenderRef) issues.push("SENDER_MISMATCH");
  return issues;
}
