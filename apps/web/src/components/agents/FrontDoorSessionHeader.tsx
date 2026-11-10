import type { ReactNode } from "react";
import type { AppSessionState } from "@/state/sessionStore";
import { conversationDomainLabel } from "./conversationDomainLabel";

/** Apresentação do domínio já resolvido na sessão, sem seletor ou decisão de acesso. */
export default function FrontDoorSessionHeader({
  activeDomain,
  children,
}: {
  activeDomain: AppSessionState["activeDomain"];
  children: ReactNode;
}) {
  const verticalLabel = conversationDomainLabel(activeDomain);
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr),minmax(0,1.5fr)] items-end gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-3">
      <div className="space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Vertical ativa</p>
        <p className="text-sm font-semibold text-foreground">{verticalLabel}</p>
        <p className="text-xs text-muted-foreground">Conversa ativa · {verticalLabel}</p>
      </div>
      {children}
    </div>
  );
}
