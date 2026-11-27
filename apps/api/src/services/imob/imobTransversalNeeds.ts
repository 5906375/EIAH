// Necessidades TRANSVERSAIS declaradas pela vertical IMOB: capacidades de outros domínios que uma operação imobiliária
// pode precisar (ex.: campanha de divulgação). A vertical declara por domínio + capacidade e o gatilho é ESTRUTURAL
// (fluxo, rascunho e oportunidade do estado operacional). Nada aqui lê texto do usuário nem lista expressões.
// A resolução de quem atende a necessidade fica em `services/capabilityDiscovery.ts` (somente leitura).

import type { CapabilityNeed } from "../capabilityDiscovery";

export type ImobTransversalNeedDeclaration = CapabilityNeed & Readonly<{
  appliesWhen: Readonly<{
    /** Fluxos operacionais do caso (`ImobCaseContext.flow`) que implicam a necessidade. */
    flows: readonly string[];
    /** Rascunhos do estado operacional cuja presença implica a necessidade. */
    operationalDrafts: readonly string[];
    /** Ações recomendadas da oportunidade de market scan que implicam a necessidade. */
    marketScanRecommendedActions: readonly string[];
  }>;
}>;

export const IMOB_TRANSVERSAL_NEEDS: readonly ImobTransversalNeedDeclaration[] = [
  {
    needId: "imob.listing.promotion",
    domain: "marketing",
    capability: "campaign",
    label: "Campanha de divulgação do imóvel",
    appliesWhen: {
      flows: ["listing.activate"],
      operationalDrafts: ["campaignDraft"],
      marketScanRecommendedActions: ["campanha"],
    },
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Necessidade declarada pelo próprio turno (interpretação estruturada), por domínio + capacidade. */
export type ImobTurnDeclaredNeed = Readonly<{ domain: string; capability: string; label?: string }>;

/**
 * Necessidades que se aplicam ao caso. Por sinais ESTRUTURAIS do caso (fluxo, rascunho, oportunidade) e, quando o turno
 * declara uma necessidade (`turnNeeds`, vinda da interpretação estruturada do turno), por ela também: o turno é um sinal
 * estruturado do usuário, não texto lido aqui. Entrada ausente ou malformada => nenhuma.
 */
export function resolveImobTransversalNeeds(input: {
  caseContext?: { flow?: unknown } | null;
  operational?: unknown;
  turnNeeds?: readonly ImobTurnDeclaredNeed[] | null;
}): CapabilityNeed[] {
  const caseFlow = typeof input?.caseContext?.flow === "string" ? input.caseContext.flow : null;
  const operational = asRecord(input?.operational);
  const operationalFlow = typeof operational?.flow === "string" ? operational.flow : null;
  const recommended = asRecord(operational?.marketScanOpportunity)?.recommendedAction;

  const fromTurn: CapabilityNeed[] = (Array.isArray(input?.turnNeeds) ? input.turnNeeds : [])
    .filter((need) => typeof need?.domain === "string" && typeof need?.capability === "string")
    .map((need) => {
      const declared = IMOB_TRANSVERSAL_NEEDS.find((entry) => entry.domain === need.domain && entry.capability === need.capability);
      return declared
        ? { needId: declared.needId, domain: declared.domain, capability: declared.capability, ...(declared.label ? { label: declared.label } : {}) }
        : { needId: `imob.turn.${need.domain}.${need.capability}`, domain: need.domain, capability: need.capability, ...(need.label ? { label: need.label } : {}) };
    });

  const structural = IMOB_TRANSVERSAL_NEEDS
    .filter((declaration) => {
      const { flows, operationalDrafts, marketScanRecommendedActions } = declaration.appliesWhen;
      return (caseFlow !== null && flows.includes(caseFlow))
        || (operationalFlow !== null && flows.includes(operationalFlow))
        || operationalDrafts.some((draft) => asRecord(operational?.[draft]) !== null)
        || (typeof recommended === "string" && marketScanRecommendedActions.includes(recommended));
    })
    .map(({ needId, domain, capability, label }) => ({ needId, domain, capability, ...(label ? { label } : {}) }));

  const seen = new Set<string>();
  return [...structural, ...fromTurn].filter((need) => (seen.has(need.needId) ? false : (seen.add(need.needId), true)));
}
