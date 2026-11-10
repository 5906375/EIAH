import type { ReactNode } from "react";
import type { AppSessionState } from "@/state/sessionStore";
import { conversationDomainLabel } from "./conversationDomainLabel";

/** Apresentação do domínio já resolvido na sessão, sem seletor ou decisão de acesso. */
export default function FrontDoorSessionHeader({
  activeDomain,
  status,
  children,
}: {
  activeDomain: AppSessionState["activeDomain"];
  status?: ReactNode;
  children: ReactNode;
}) {
  const verticalLabel = conversationDomainLabel(activeDomain);
  return (
    <header className="relative z-10 mb-3 flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-4 gap-y-2 sm:basis-0">
        <h3 className="text-lg font-semibold text-foreground sm:text-xl">Chat ativo · {verticalLabel}</h3>
        {status}
      </div>
      <div className="ml-auto flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
        {children}
      </div>
    </header>
  );
}
