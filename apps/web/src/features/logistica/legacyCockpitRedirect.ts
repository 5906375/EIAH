import { logisticaFrontDoorHref, parseLogisticaCaseRef, PRE_DUIMP_FRONT_DOOR_HREF } from "@/components/agents/logisticaCaseContextEngine";

/**
 * EIAH-FD-001 — as URLs legadas `/app/logistica`, `/app/logistica/pre-duimp` e qualquer subcaminho NÃO têm interface operacional: sempre
 * redirecionam ao Front Door (sem chave de ambiente, sem exceção "opcional"). Só um parâmetro de continuidade expressamente suportado
 * (`?case=` com formato válido; o SERVIDOR valida o caso ao abrir) é preservado — nada mais da URL, nenhuma permissão, nenhum parâmetro arbitrário.
 */
export type LogisticaLegacyEntry = "cockpit" | "pre_duimp";

export function resolveLogisticaLegacyRedirect(input: { search: string; entry?: LogisticaLegacyEntry }): string {
  return input.entry === "pre_duimp" ? PRE_DUIMP_FRONT_DOOR_HREF : logisticaFrontDoorHref(parseLogisticaCaseRef(input.search));
}
