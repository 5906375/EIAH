import type { AppSessionState } from "@/state/sessionStore";

/** Rótulo visual do domínio já resolvido na sessão. */
export function conversationDomainLabel(activeDomain: AppSessionState["activeDomain"]) {
  return activeDomain === "imob" ? "IMOB" : "EIAH";
}
