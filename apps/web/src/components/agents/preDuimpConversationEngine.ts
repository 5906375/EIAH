import { PRE_DUIMP_ACCESS_DENIAL_REASON_CODES, type PreDuimpAccessDenialReasonCode } from "@/lib/api";
import { isPreDuimpAccessAllowed, parsePreDuimpShadowCapability, type PreDuimpAccessState } from "@/features/logistica/preDuimp";

/**
 * FD-PREDUIMP-001 — o Pré-DUIMP abre NA conversa do Front Door (cartão renderizado pelo launcher). O engine só reconhece o pedido
 * (vocabulário controlado) e resolve a apresentação do acesso; as capacidades são as que já existem (criar contexto em modo shadow; revisão
 * HITL e replay indisponíveis). Reconhecer NÃO concede acesso: o servidor decide (`capabilities.preDuimpShadow`), fail-closed. Não reconhece
 * operações aduaneiras reais (registrar, enviar, transmitir, Siscomex, desembaraço): essas frases não abrem nada.
 */
const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

const REQUEST = /^(?:quero|preciso|gostaria de|vamos) (?:preparar|criar|abrir|iniciar|consultar|ver) (?:(?:um|o|meu|minha|a|novo|nova) )*(?:contexto )?(?:de )?(?:pre duimp|duimp)(?: (?:shadow|governado|governada))?$/;
const DIRECT = /^(?:abrir|iniciar|preparar) (?:o )?pre duimp$/;
const FORBIDDEN = /imob|siscomex|portal unico|transmit|registr|enviar|envio|desembaraco|liberacao|real\b/;

export function isPreDuimpEntryRequest(input: string): boolean {
  const spoken = normalize(input);
  const text = spoken.replace(/[.!]+$/, "").trim();
  if (!text || spoken.endsWith("?") || FORBIDDEN.test(text)) return false;
  return REQUEST.test(text) || DIRECT.test(text);
}

export const PRE_DUIMP_CARD_TITLE = "Pré-DUIMP — modo shadow";
export const PRE_DUIMP_CARD_NOTICE = "Nenhuma transmissão ao Siscomex/Portal Único. O contexto é preparado internamente e validado pelo servidor; nenhuma operação aduaneira real é executada.";
export const PRE_DUIMP_AVAILABILITY = [
  { key: "create", title: "Criação de contexto", text: "Disponível exclusivamente em modo shadow.", enabled: true },
  { key: "review", title: "Revisão", text: "Aprovação HITL persistida ainda não está habilitada neste ambiente.", enabled: false },
  { key: "replay", title: "Replay", text: "Replay e idempotência persistidos ainda estão em preparação.", enabled: false },
] as const;

const DENIAL_MESSAGES: Record<PreDuimpAccessDenialReasonCode, string> = {
  PRE_DUIMP_RUNTIME_DISABLED: "O runtime shadow do Pré-DUIMP está desabilitado neste ambiente.",
  PRE_DUIMP_INSTALLATION_MISSING: "Logística & Comex ainda não está instalada neste workspace.",
  PRE_DUIMP_INSTALLATION_INACTIVE: "A instalação de Logística & Comex está inativa neste workspace.",
  PRE_DUIMP_INSTALLATION_INVALID: "A instalação de Logística & Comex não pertence a este workspace.",
  PRE_DUIMP_PILOT_GRANT_MISSING: "Este workspace não integra o piloto do Pré-DUIMP.",
  PRE_DUIMP_PILOT_GRANT_DISABLED: "O acesso do workspace ao piloto do Pré-DUIMP está desabilitado.",
  PRE_DUIMP_ACTION_POLICY_DENIED: "Sua identidade não tem a permissão específica para criar um contexto Pré-DUIMP.",
  PRE_DUIMP_ACCESS_UNAVAILABLE: "Não foi possível confirmar o acesso ao Pré-DUIMP agora. Nada foi executado.",
};

export type PreDuimpCardView =
  | { status: "checking" }
  | { status: "available" }
  | { status: "blocked"; reasonCode: PreDuimpAccessDenialReasonCode | "PRE_DUIMP_FRONTEND_DISABLED" | "PRE_DUIMP_ACCESS_UNVERIFIED"; message: string };

/** Fail-closed: sem a chave global do front-end, sem leitura válida da capacidade do servidor ou com `allowed:false`, nada é oferecido. */
export function resolvePreDuimpCardView(frontendEnabled: boolean, access: PreDuimpAccessState): PreDuimpCardView {
  if (!frontendEnabled) return { status: "blocked", reasonCode: "PRE_DUIMP_FRONTEND_DISABLED", message: "O Pré-DUIMP está desabilitado neste ambiente." };
  if (access.status === "idle" || access.status === "loading") return { status: "checking" };
  const capability = parsePreDuimpShadowCapability(access.capability);
  if (access.status !== "ready" || !capability) return { status: "blocked", reasonCode: "PRE_DUIMP_ACCESS_UNVERIFIED", message: "Não foi possível confirmar o acesso ao Pré-DUIMP agora. Nada foi executado." };
  if (isPreDuimpAccessAllowed(frontendEnabled, access)) return { status: "available" };
  const reason = capability.reasonCode;
  return { status: "blocked", reasonCode: reason ?? "PRE_DUIMP_ACCESS_UNAVAILABLE", message: DENIAL_MESSAGES[reason ?? "PRE_DUIMP_ACCESS_UNAVAILABLE"] };
}
export const PRE_DUIMP_DENIAL_REASON_CODES = PRE_DUIMP_ACCESS_DENIAL_REASON_CODES;

export function attachPreDuimpCardToSnapshot<S extends { preDuimpCard?: boolean | null }>(snapshot: S, decision: { preDuimpCard?: boolean } | null | undefined): S {
  return decision?.preDuimpCard ? { ...snapshot, preDuimpCard: true } : snapshot;
}
