import assert from "node:assert/strict";
import test from "node:test";
import type { ZodTypeAny } from "zod";
import {
  channelInboundEventV1Schema as eventSchema,
  checkInboundEventAgainstLink,
  dataProviderV1Schema as providerSchema,
  originEvidenceV2Schema as evidenceSchema,
  supplierChannelLinkV1Schema as linkSchema,
  validateDataSourceRegistryV2,
} from "../src/index.js";

const T0 = "2026-11-03T12:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const ok = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, true, `deveria ser válido ${label}`);
const bad = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, false, `deveria ser inválido ${label}`);
const SCOPE_A = { kind: "tenant_workspace", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" };
const SENDER_REF = "sender-ref-synthetic-0001"; // referência opaca; nunca o telefone

const link = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.supplier-channel-link.v1", linkId: "synthetic.link-1", scope: SCOPE_A,
  supplier: { status: "resolved", providerId: "synthetic-provider" }, channel: "whatsapp",
  senderIdentity: { externalSenderRef: SENDER_REF, verification: { status: "unverified" } },
  declaredCapabilities: ["receive"], outbound: "not_enabled", transportProvider: "not_selected", grantsAuthorization: false, ...over,
});
const event = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.channel-inbound-event.v1", eventId: "evt-1", scope: SCOPE_A, channel: "whatsapp", externalEventRef: "ext-event-synthetic-1",
  linkRef: { status: "matched", linkId: "synthetic.link-1" },
  sender: { externalSenderRef: SENDER_REF, verification: { status: "unverified" } },
  receivedAt: T0, sentAt: { status: "unknown" }, caseAssociation: { status: "pending" }, messageContent: { status: "not_captured" },
  attachments: [], evidenceRefs: [], grantsAuthorization: false, ...over,
});

// ---------------------------------------------------------------------------------------------------------
test("vínculo fornecedor×canal×tenant: um fornecedor, vários vínculos, sem duplicar cadastro", () => {
  ok(linkSchema, link());
  ok(linkSchema, link({ supplier: { status: "unresolved" } }), "fornecedor ainda não resolvido");
  ok(linkSchema, link({ connectionId: "synthetic.conn-1" }), "associado a uma conexão channel_message");
  // dois remetentes (duas pessoas) do MESMO fornecedor: dois vínculos, um único cadastro de fornecedor
  const l1 = linkSchema.parse(link({ linkId: "synthetic.link-1" }));
  const l2 = linkSchema.parse(link({ linkId: "synthetic.link-2", senderIdentity: { externalSenderRef: "sender-ref-synthetic-0002", verification: { status: "unverified" } } }));
  assert.equal(l1.supplier.status === "resolved" && l1.supplier.providerId, l2.supplier.status === "resolved" && l2.supplier.providerId);
  const registry = { providers: [{ schemaVersion: "eiah.data-provider.v1", providerId: "synthetic-provider", displayName: "Synthetic", scope: SCOPE_A, categories: { status: "declared", value: ["shipping_line"], basis: "synthetic" }, nature: { status: "unknown" }, authorizationGranted: false }], platforms: [], sources: [] };
  assert.deepEqual(validateDataSourceRegistryV2(registry), { ok: true, issues: [] });
  assert.equal(registry.providers.length, 1, "mais de um vínculo não gera mais de um fornecedor");
  ok(providerSchema, registry.providers[0]);
  bad(linkSchema, link({ providers: [] }), "o vínculo não embute fornecedor");
  bad(linkSchema, link({ supplier: { status: "resolved" } }), "resolved exige providerId");
  bad(linkSchema, link({ supplier: { status: "resolved", providerId: "Synthetic Provider!" } }));
});

test("vínculo: escopo tenant/workspace obrigatório; capacidades declaradas não concedem nada; envio e provedor não escolhidos", () => {
  bad(linkSchema, link({ scope: { kind: "shared" } }), "canal de fornecedor nunca é compartilhado");
  bad(linkSchema, link({ scope: { kind: "tenant_workspace", tenantId: "t" } }));
  bad(linkSchema, link({ scope: undefined }));
  ok(linkSchema, link({ declaredCapabilities: [] }), "nenhuma capacidade declarada");
  ok(linkSchema, link({ declaredCapabilities: ["receive", "query", "request_update", "propose_case_change", "execute_action"] }), "todas declaradas");
  const everything = linkSchema.parse(link({ declaredCapabilities: ["receive", "query", "request_update", "propose_case_change", "execute_action"] }));
  assert.equal(everything.grantsAuthorization, false, "declarar execute_action não autoriza executar");
  assert.equal(everything.outbound, "not_enabled");
  assert.equal(everything.transportProvider, "not_selected");
  bad(linkSchema, link({ declaredCapabilities: ["receive", "receive"] }), "duplicada");
  bad(linkSchema, link({ declaredCapabilities: ["broadcast"] }), "fora do vocabulário");
  bad(linkSchema, link({ grantsAuthorization: true }));
  bad(linkSchema, link({ outbound: "enabled" }), "mensagens de saída não estão ativadas");
  bad(linkSchema, link({ transportProvider: "meta-cloud-api" }), "não escolher provedor de WhatsApp sem decisão");
  bad(linkSchema, link({ transportProvider: undefined }));
  bad(linkSchema, link({ channel: "sms" }), "só o canal já preparado");
  bad(linkSchema, link({ channel: "telegram" }));
});

test("identidade do remetente: referência opaca e estado de verificação; presença no canal não prova identidade", () => {
  for (const ref of ["+5511999999999", "5511999999999", "(11) 99999-9999", "11 99999 9999", "pessoa@example.invalid", "+55 11 99999-9999"]) {
    bad(linkSchema, link({ senderIdentity: { externalSenderRef: ref, verification: { status: "unverified" } } }), `PII em claro: ${ref}`);
  }
  ok(linkSchema, link({ senderIdentity: { externalSenderRef: "h-3f9a1c7e5b2d4a68", verification: { status: "unverified" } } }), "hash/referência opaca");
  const verifs = [
    { status: "unverified" },
    { status: "verification_pending", requestedAt: T0 },
    { status: "verified", method: "manual_callback", verifiedBy: "synthetic-user", verifiedAt: T0, evidenceRef: "synthetic-evidence-1" },
    { status: "failed", checkedAt: T0, reason: "synthetic" },
  ];
  for (const verification of verifs) ok(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF, verification } }), String(verification.status));
  bad(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF, verification: { status: "verified", method: "manual_callback", verifiedAt: T0, evidenceRef: "e" } } }), "quem verificou é obrigatório");
  bad(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF, verification: { status: "verified", method: "manual_callback", verifiedBy: "u", verifiedAt: T0 } } }), "evidência da verificação obrigatória");
  bad(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF, verification: { status: "verified", method: "trust_me", verifiedBy: "u", verifiedAt: T0, evidenceRef: "e" } } }));
  bad(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF } }), "estado de verificação obrigatório");
  bad(linkSchema, link({ senderIdentity: { externalSenderRef: SENDER_REF, verification: { status: "verified" }, phone: "+5511999999999" } }));
  // vínculo não verificado é um registro válido e, ainda assim, não concede nada
  const unverified = linkSchema.parse(link());
  assert.equal(unverified.senderIdentity.verification.status, "unverified");
  assert.equal(unverified.grantsAuthorization, false);
});

// ---------------------------------------------------------------------------------------------------------
test("evento de entrada: associação ao caso resolvida, pendente ou ambígua — ambígua nunca escolhe", () => {
  ok(eventSchema, event(), "pendente");
  ok(eventSchema, event({ caseAssociation: { status: "resolved", caseRef: { caseId: "case-synthetic-1", caseType: "SYNTHETIC_CASE" }, resolvedBy: { kind: "human", ref: "synthetic-user" }, basis: "referência informada" } }), "resolvida por humano");
  ok(eventSchema, event({ caseAssociation: { status: "resolved", caseRef: { caseId: "case-synthetic-1", caseType: "SYNTHETIC_CASE" }, resolvedBy: { kind: "system", ref: "synthetic-rule-1" }, basis: "regra declarada" } }), "resolvida por regra, com base registrada");
  ok(eventSchema, event({ caseAssociation: { status: "ambiguous", candidateCaseIds: ["case-1", "case-2"] } }), "ambígua");
  bad(eventSchema, event({ caseAssociation: { status: "ambiguous", candidateCaseIds: ["case-1"] } }), "ambígua com um candidato não é ambígua");
  bad(eventSchema, event({ caseAssociation: { status: "ambiguous", candidateCaseIds: ["case-1", "case-1"] } }), "candidatos duplicados");
  bad(eventSchema, event({ caseAssociation: { status: "ambiguous", candidateCaseIds: ["case-1", "case-2"], chosenCaseId: "case-1" } }), "ambígua não escolhe");
  bad(eventSchema, event({ caseAssociation: { status: "ambiguous", caseRef: { caseId: "case-1", caseType: "X" }, candidateCaseIds: ["case-1", "case-2"] } }), "ambígua não carrega caso resolvido");
  bad(eventSchema, event({ caseAssociation: { status: "pending", caseRef: { caseId: "case-1", caseType: "X" } } }), "pendente não carrega caso");
  bad(eventSchema, event({ caseAssociation: { status: "resolved", caseRef: { caseId: "case-1", caseType: "X" } } }), "resolvida exige quem e base");
  bad(eventSchema, event({ caseAssociation: { status: "resolved", caseRef: { caseId: "case-1", caseType: "X" }, resolvedBy: { kind: "robot", ref: "r" }, basis: "b" } }));
  bad(eventSchema, event({ caseAssociation: { status: "guessed" } }));
  bad(eventSchema, event({ caseAssociation: undefined }), "estado de associação obrigatório");
  bad(eventSchema, event({ caseMutationApplied: false }), "o evento não altera o caso");
});

test("evento: referência externa, escopo, sem efeitos; mensagem e anexos apenas referenciados", () => {
  const { externalEventRef: _e, ...noRef } = event() as Record<string, unknown>;
  void _e;
  bad(eventSchema, noRef, "referência externa do evento obrigatória");
  bad(eventSchema, event({ scope: { kind: "shared" } }), "evento sempre num tenant/workspace");
  bad(eventSchema, event({ grantsAuthorization: true }));
  ok(eventSchema, event({ linkRef: { status: "unmatched" } }), "remetente sem vínculo cadastrado");
  bad(eventSchema, event({ linkRef: { status: "matched" } }));
  ok(eventSchema, event({ sentAt: { status: "known", value: T0 } }));
  bad(eventSchema, event({ sentAt: T0 }), "data crua fora da representação explícita");
  bad(eventSchema, event({ receivedAt: "ontem" }));
  ok(eventSchema, event({ sender: { externalSenderRef: SENDER_REF, verification: { status: "unverified" } } }), "remetente não verificado ainda gera um registro");
  bad(eventSchema, event({ sender: { externalSenderRef: "+5511999999999", verification: { status: "unverified" } } }), "telefone em claro");
  // mensagem
  ok(eventSchema, event({ messageContent: { status: "referenced", contentRef: "storage:synthetic/m1", sha256: SHA_A } }));
  bad(eventSchema, event({ messageContent: { status: "referenced", contentRef: "storage:synthetic/m1" } }), "referência sem hash");
  bad(eventSchema, event({ messageContent: { status: "captured", text: "olá" } }), "o texto da mensagem não é embutido");
  bad(eventSchema, event({ body: "olá" }));
  // anexos
  const attachment = (over: Record<string, unknown> = {}) => ({ attachmentRef: "att-ref-synthetic-1", declaredMediaType: "application/pdf", declaredByteLength: 1234, declaredSha256: SHA_B, handling: "referenced_only", ...over });
  ok(eventSchema, event({ attachments: [attachment()] }), "anexo referenciado");
  ok(eventSchema, event({ attachments: [attachment({ declaredMediaType: undefined, declaredByteLength: undefined, declaredSha256: undefined })] }), "só a referência");
  for (const handling of ["downloaded", "processed", "stored", "scanned"]) bad(eventSchema, event({ attachments: [attachment({ handling })] }), `handling ${handling}`);
  for (const extra of ["content", "bytes", "url", "base64", "data"]) bad(eventSchema, event({ attachments: [attachment({ [extra]: "x" })] }), `anexo com ${extra}`);
  bad(eventSchema, event({ attachments: [attachment(), attachment()] }), "anexo duplicado");
  bad(eventSchema, event({ attachments: [attachment({ declaredSha256: "XYZ" })] }));
  bad(eventSchema, event({ attachments: Array.from({ length: 21 }, (_, i) => attachment({ attachmentRef: `att-ref-${i}` })) }), "limite de anexos referenciados");
});

test("evento ↔ vínculo: isolamento por tenant/workspace e coerência de remetente", () => {
  const l = linkSchema.parse(link());
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event()), l), []);
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event({ scope: { ...SCOPE_A, tenantId: "tenant-synthetic-B" } })), l), ["SCOPE_MISMATCH"], "outro tenant");
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event({ scope: { ...SCOPE_A, workspaceId: "workspace-synthetic-A2" } })), l), ["SCOPE_MISMATCH"], "outro workspace");
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event({ linkRef: { status: "matched", linkId: "synthetic.link-9" } })), l), ["LINK_ID_MISMATCH"]);
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event({ linkRef: { status: "unmatched" } })), l), ["LINK_ID_MISMATCH"]);
  assert.deepEqual(checkInboundEventAgainstLink(eventSchema.parse(event({ sender: { externalSenderRef: "sender-ref-synthetic-9999", verification: { status: "unverified" } } })), l), ["SENDER_MISMATCH"]);
});

test("evento referencia evidência de origem v2 sem embuti-la; origem (fornecedor) ≠ validação ≠ autorização", () => {
  const ev = evidenceSchema.parse({
    schemaVersion: "eiah.origin-evidence.v2", evidenceId: "ev-msg-1",
    origin: { kind: "supplier_declared", supplierRef: "synthetic-provider", receivedAt: T0, messageRef: "ext-event-synthetic-1" },
    integrity: { status: "hashed", sha256: SHA_A }, authenticity: { status: "none_available" }, currency: { status: "not_assessed" },
    validation: { status: "not_validated" }, approval: { status: "not_requested" }, authorization: { status: "not_evaluated" }, grantsAuthorization: false,
  });
  ok(eventSchema, event({ evidenceRefs: [{ evidenceId: ev.evidenceId, contentSha256: ev.integrity.status === "hashed" ? ev.integrity.sha256 : SHA_B }] }));
  bad(eventSchema, event({ evidenceRefs: [ev] }), "evidência não é embutida no evento");
  assert.equal(ev.origin.kind, "supplier_declared", "informação declarada pelo fornecedor");
  assert.equal(ev.validation.status, "not_validated", "recebida ≠ validada");
  assert.equal(ev.authorization.status, "not_evaluated");
  assert.equal(ev.authenticity.status, "none_available", "WhatsApp não comprova autoria nem veracidade");
});
