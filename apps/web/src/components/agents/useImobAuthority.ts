import { useEffect, useMemo, useState } from "react";
import { apiRequestChatVerticalHandoff, type ChatVerticalHandoffResult } from "@/lib/api";
import { isImobSurfaceAvailable } from "@/lib/entitlements";
import type { AppSessionState } from "@/state/sessionStore";

/**
 * AUTHZ-IMOB-HANDOFF-001 — selecionar o IMOB no Front Door não concede autoridade sobre ele. A barra de ações e os cartões do IMOB só
 * aparecem depois que o CORE confirma a autoridade (handoff para o IMOB, que é somente leitura no servidor e fail-closed). O cliente
 * não decide autoridade: só espera o veredito do servidor e, sem ele, não oferece operação. Troca de usuário/workspace/tenant invalida o veredito.
 */
type Verdict = { scope: string; allowed: boolean };

type MessageWithHandoff = { presentationSnapshot?: { verticalHandoff?: ChatVerticalHandoffResult | null } | null };

/** Último veredito de handoff PARA o IMOB nas mensagens (true=permitido, false=bloqueado, null=nenhum). Outras verticais não contam. */
export function resolveImobHandoffVerdict(messages: MessageWithHandoff[]): boolean | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const handoff = messages[index]?.presentationSnapshot?.verticalHandoff;
    if (!handoff) continue;
    if (handoff.ok) {
      if (handoff.handoff.vertical.id === "imob") return true;
      continue;
    }
    if (handoff.verticalId === undefined || handoff.verticalId === "imob") return false;
  }
  return null;
}

export function useImobAuthority(params: { session: AppSessionState; scope: string; messages: MessageWithHandoff[] }): boolean {
  const { session, scope, messages } = params;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const fromMessages = useMemo(() => resolveImobHandoffVerdict(messages), [messages]);
  const surfaceAvailable = isImobSurfaceAvailable(session);
  useEffect(() => {
    if (fromMessages !== null) setVerdict({ scope, allowed: fromMessages });
  }, [fromMessages, scope]);
  useEffect(() => {
    if (!surfaceAvailable || verdict?.scope === scope || fromMessages !== null) return;
    let cancelled = false;
    void apiRequestChatVerticalHandoff({ verticalId: "imob", capabilityId: "knowledge.search", mode: "read_only" })
      .then((response) => { if (!cancelled) setVerdict({ scope, allowed: response.data.ok === true }); })
      .catch(() => { if (!cancelled) setVerdict({ scope, allowed: false }); });
    return () => { cancelled = true; };
  }, [surfaceAvailable, scope, verdict?.scope, fromMessages]);
  return verdict?.scope === scope && verdict.allowed;
}
