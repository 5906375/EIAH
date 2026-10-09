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
    <div className="flex w-full flex-wrap items-start gap-4 sm:w-auto">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Vertical ativa</p>
        <p className="text-sm font-semibold text-foreground">{verticalLabel}</p>
        <p className="text-xs text-muted-foreground">Conversa ativa · {verticalLabel}</p>
      </div>
      {children}
    </div>
  );
}
