"use strict";

const SUPPORTED_SCHEMAS = new Set(["eiah.governed-session-evidence.v1", "eiah.governed-session-evidence.v2", "eiah.governed-session-evidence.v3"]);
const byId = (id) => document.getElementById(id);

function showReason(code, message) {
  const reason = byId("receiptReason");
  reason.textContent = `${code} · ${message}`;
  reason.classList.add("show");
}

function clearReason() {
  byId("receiptReason").textContent = "";
  byId("receiptReason").classList.remove("show");
}

function formatDate(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(date);
  return `${formatted} (UTC-03:00)`;
}

function coveragePercent(bundle) {
  const topics = Array.isArray(bundle.agendaCoverage) ? bundle.agendaCoverage : [];
  if (!topics.length) return 0;
  return Math.round((topics.filter((topic) => topic.covered).length / topics.length) * 100);
}

function normalizedParticipants(bundle) {
  if (Array.isArray(bundle.guestProfiles) && bundle.guestProfiles.length) {
    return bundle.guestProfiles.map((profile) => ({ ref: profile.profileRef, alias: profile.alias, role: profile.role }));
  }
  const legacyRef = bundle.manifest?.participantRef;
  return legacyRef ? [{ ref: legacyRef, alias: legacyRef, role: "participant" }] : [];
}

function consentCount(bundle) {
  if (Array.isArray(bundle.consents)) return bundle.consents.length;
  return bundle.consent ? 1 : 0;
}

function validateBundle(bundle) {
  if (!bundle || typeof bundle !== "object") throw new Error("EVIDENCE_JSON_INVALID");
  if (!SUPPORTED_SCHEMAS.has(bundle.schemaVersion)) throw new Error("EVIDENCE_SCHEMA_UNSUPPORTED");
  if (!bundle.manifest?.sessionId || !bundle.manifest?.tenantId || !bundle.manifest?.workspaceId || !bundle.manifest?.userId) throw new Error("EVIDENCE_CONTEXT_REQUIRED");
  if (!bundle.manifest?.finalizedAt || bundle.humanValidation?.confirmed !== true) throw new Error("EVIDENCE_NOT_FINALIZED");
  if (!/^[a-f0-9]{64}$/.test(bundle.integrity?.bundleHash || "") || !/^[a-f0-9]{64}$/.test(bundle.integrity?.lastEventHash || "")) throw new Error("EVIDENCE_INTEGRITY_REQUIRED");
}

function reasonMessage(code) {
  const messages = {
    EVIDENCE_JSON_INVALID: "O arquivo não contém um JSON válido.",
    EVIDENCE_SCHEMA_UNSUPPORTED: "O schema desta evidência não é suportado pelo gerador.",
    EVIDENCE_CONTEXT_REQUIRED: "Faltam identificadores obrigatórios da sessão.",
    EVIDENCE_NOT_FINALIZED: "O bundle não registra finalização e validação humana.",
    EVIDENCE_INTEGRITY_REQUIRED: "Os hashes obrigatórios não foram encontrados ou são inválidos.",
    EVIDENCE_FILE_READ_FAILED: "Não foi possível ler o arquivo selecionado."
  };
  return messages[code] || "Não foi possível gerar o recibo.";
}

function setText(id, value) {
  byId(id).textContent = value ?? "—";
}

function renderParticipants(participants) {
  const container = byId("participants");
  container.replaceChildren();
  for (const participant of participants) {
    const item = document.createElement("div");
    const identity = document.createElement("strong"); identity.textContent = participant.alias;
    const meta = document.createElement("span"); meta.textContent = `${participant.role} · ${participant.ref}`;
    item.append(identity, meta); container.append(item);
  }
}

function renderReceipt(bundle) {
  const manifest = bundle.manifest;
  const participants = normalizedParticipants(bundle);
  const bundleHash = bundle.integrity.bundleHash;
  setText("receiptId", `RCP-${manifest.sessionId}-${bundleHash.slice(0, 12).toUpperCase()}`);
  setText("sessionId", manifest.sessionId);
  setText("vertical", manifest.vertical);
  setText("sessionTitle", manifest.title);
  setText("tenantId", manifest.tenantId);
  setText("workspaceId", manifest.workspaceId);
  setText("startedAt", formatDate(manifest.startedAt));
  setText("finalizedAt", formatDate(manifest.finalizedAt));
  setText("agendaVersion", manifest.agendaVersion);
  setText("riskTier", manifest.riskTier);
  setText("participantCount", String(participants.length));
  setText("consentCount", String(consentCount(bundle)));
  setText("segmentCount", String(bundle.transcriptSegments?.length || 0));
  setText("coveragePercent", `${coveragePercent(bundle)}%`);
  setText("eventCount", String(bundle.eventChain?.length || 0));
  setText("humanValidation", bundle.humanValidation?.confirmed ? "Sim" : "Não");
  setText("bundleHash", bundleHash);
  setText("lastEventHash", bundle.integrity.lastEventHash);
  setText("confirmedSummary", bundle.humanValidation.summary);
  setText("schemaVersion", bundle.schemaVersion);
  setText("protocolVersion", bundle.protocolVersion);
  setText("generatedAt", formatDate(new Date().toISOString()));
  renderParticipants(participants);
  byId("receipt").classList.remove("hidden");
  byId("printActions").classList.remove("hidden");
}

async function loadEvidence(file) {
  clearReason();
  byId("receipt").classList.add("hidden");
  byId("printActions").classList.add("hidden");
  try {
    if (!file) throw new Error("EVIDENCE_FILE_REQUIRED");
    const bundle = JSON.parse(await file.text());
    validateBundle(bundle);
    renderReceipt(bundle);
  } catch (error) {
    const code = error instanceof SyntaxError ? "EVIDENCE_JSON_INVALID" : (error.message || "EVIDENCE_FILE_READ_FAILED");
    showReason(code, reasonMessage(code));
  }
}

byId("evidenceFile").addEventListener("change", (event) => loadEvidence(event.target.files?.[0]));
byId("printBtn").addEventListener("click", () => globalThis.print());
