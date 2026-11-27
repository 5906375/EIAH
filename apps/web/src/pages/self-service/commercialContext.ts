// Contexto comercial do Self-service (P10-D): chegada por um link do caso IMOB e distinção entre quem pode CONTRATAR e
// quem só CONSULTA. A autoridade vem do SERVIDOR (`GET /commercial-authority/status`); parâmetros de URL só dizem qual
// agente destacar e para onde voltar, e nunca valem como permissão. A API reaplica a autoridade em toda assinatura.

export type CommercialAuthorityView =
  | { status: "loading" }
  | { status: "unknown" }
  | { status: "consult_only" }
  | { status: "holder"; validUntil: string | null; limits: { allowedScopes: string[]; maxValidityDays: number } | null };

export const COMMERCIAL_AUTHORITY_LOADING: CommercialAuthorityView = { status: "loading" };

/** Resposta do servidor => visão. Ausente, malformada ou com erro => "unknown" (fail-closed: sem controle de contratação). */
export function resolveCommercialAuthorityView(response: unknown): CommercialAuthorityView {
  const body = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  if (!body || body.ok !== true || !("holder" in body)) return { status: "unknown" };
  const holder = body.holder;
  if (holder === null) return { status: "consult_only" };
  if (typeof holder !== "object") return { status: "unknown" };
  const record = holder as Record<string, unknown>;
  const limits = record.limits && typeof record.limits === "object" ? (record.limits as Record<string, unknown>) : null;
  const allowedScopes = Array.isArray(limits?.allowedScopes) ? (limits!.allowedScopes as unknown[]).filter((item): item is string => typeof item === "string") : null;
  const maxValidityDays = typeof limits?.maxValidityDays === "number" ? limits.maxValidityDays : null;
  return {
    status: "holder",
    validUntil: typeof record.validUntil === "string" ? record.validUntil : null,
    limits: allowedScopes && maxValidityDays !== null ? { allowedScopes, maxValidityDays } : null,
  };
}

export function canShowSubscribeControl(view: CommercialAuthorityView): boolean {
  return view.status === "holder";
}

/** Retorno aceito: somente o chat IMOB ou o Front Door (/app/chat) deste mesmo app (caminho relativo, sem protocolo nem host). */
export function safeImobReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !(value.startsWith("/app/imob/chat") || /^\/app\/chat(?:[?#]|$)/.test(value))) return null;
  if (value.includes("//") || value.includes("\\") || /[\s<>"']/.test(value)) return null;
  return value;
}

export type CommercialDetailsRequest = {
  /** Item do Marketplace a destacar (somente leitura). */
  itemId: string | null;
  /** O link foi emitido para outro workspace que não o da sessão: não destacar nada. */
  workspaceMismatch: boolean;
  returnTo: string | null;
};

export function parseCommercialDetailsRequest(search: string, sessionWorkspaceId: string | null | undefined): CommercialDetailsRequest {
  const params = new URLSearchParams(search);
  const rawItem = (params.get("marketplaceItem") ?? "").trim();
  const itemId = /^[A-Za-z0-9_-]{1,128}$/.test(rawItem) ? rawItem : null;
  const linkWorkspace = (params.get("workspaceId") ?? "").trim();
  const workspaceMismatch = Boolean(itemId && linkWorkspace && sessionWorkspaceId && linkWorkspace !== sessionWorkspaceId);
  return { itemId, workspaceMismatch, returnTo: safeImobReturnTo(params.get("returnTo")) };
}
