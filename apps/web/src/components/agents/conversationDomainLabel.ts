import type { AppSessionState } from "@/state/sessionStore";

/** Rótulo visual do domínio já resolvido na sessão. */
export function conversationDomainLabel(activeDomain: AppSessionState["activeDomain"]) {
  if (activeDomain === "logistica") return "Logística & Comex";
  return activeDomain === "imob" ? "IMOB" : "EIAH";
}
