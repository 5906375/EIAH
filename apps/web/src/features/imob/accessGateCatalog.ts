import type { ImobAccessGateState } from "@/state/sessionStore";

type GateCatalogEntry = {
  title: string;
  fallbackBody: string;
};

const IMOB_GATE_CATALOG: Record<
  NonNullable<ImobAccessGateState["reasonCode"]>,
  GateCatalogEntry
> = {
  IMOB_ENTITLEMENT_MISSING: {
    title: "Acesso indisponível",
    fallbackBody:
      "IMOB não está habilitado neste workspace. É necessária uma instalação ativa para acessar a Central Operacional.",
  },
  IMOB_INSTALLATION_INACTIVE: {
    title: "Instalação inativa",
    fallbackBody:
      "A instalação do IMOB neste workspace não está ativa. Reative a instalação para acessar a Central Operacional.",
  },
  IMOB_PERMISSION_DENIED: {
    title: "Acesso restrito",
    fallbackBody:
      "Você não possui permissão para acessar a Central Operacional do IMOB neste workspace.",
  },
};

export function resolveImobAccessGateCopy(gate: Partial<ImobAccessGateState> | null | undefined) {
  const reasonCode = gate?.reasonCode ?? "IMOB_ENTITLEMENT_MISSING";
  const catalog = IMOB_GATE_CATALOG[reasonCode];
  return {
    title: catalog.title,
    body: gate?.message?.trim() || catalog.fallbackBody,
  };
}
