// Radar Social — contrato do resolvedor de acesso individual à entidade.
//
// Só a INTERFACE entra nesta unidade (docs/architecture/radar-social-construction-plan-v1.md,
// Atualização 1.9, "RadarEntityAccessResolver: contrato obrigatório, sem
// implementação de produção nesta unidade"). Nenhuma implementação real
// existe hoje — ausência ou falha do resolvedor BLOQUEIA toda operação que
// dependa de acesso individual a uma entidade já existente, sem exceção e
// sem fallback permissivo. Substitutos controlados (sempre autoriza, sempre
// nega, outcome fixo) ficam exclusivamente em __tests__/ — nenhum caminho de
// produção monta ou importa um substituto.
//
// Política ratificada (v1.9): leitura da entidade concede leitura dos
// materiais e histórico vinculados a ela, inclusive fornecidos por outros
// usuários autorizados. Por isso o resolvedor opera sobre a ENTIDADE, nunca
// sobre o material individual — não existe ACL por material nesta unidade.
// Escrita (receber/corrigir material) e gestão (alterar/desativar entidade)
// exigem permissões distintas da leitura (radarKnownEntityService.ts /
// radarMaterialService.ts combinam este resolvedor com checkScopePermission
// + TenantMembership — nenhum dos dois substitui o outro).

// Erro de autorização de OPERAÇÃO (membership, vínculo workspace-tenant,
// checkScopePermission) — distinto de RadarEntityAccessOutcome acima, que é
// o resultado do resolvedor de acesso INDIVIDUAL a uma entidade específica.
// Ambos os controles são exigidos e nenhum substitui o outro (Atualização
// 1.6 do plano: "checkScopePermission não substitui membership ou acesso
// individual").
export class RadarSocialAuthorizationError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_social_authorization_denied:${reasonCode}`);
    this.name = "RadarSocialAuthorizationError";
  }
}

export interface RadarEntityAccessInput {
  // authContext.userId — identidade confiável, nunca lida do corpo.
  confirmedIdentity: string;
  tenantId: string;
  workspaceId: string;
  entityId: string;
  // "read" cobre entidade + materiais/histórico herdados (política acima).
  // "write" cobre receber/corrigir material sob a entidade. "manage" cobre
  // alterar/desativar a própria entidade. "analyze" (Atualização 1.16/1.18
  // do plano) cobre solicitar/executar uma análise sobre a entidade — usado
  // por radarAnalysisRequestService.ts/radarAnalysisAttemptService.ts, sem
  // alterar o significado nem o comportamento dos três valores anteriores.
  // Um resolvedor real pode aplicar política distinta por operação; nesta
  // unidade, todo substituto de teste ignora este campo (outcome fixo ou
  // sempre autorizado).
  operation: "read" | "write" | "manage" | "analyze";
}

export const RADAR_ENTITY_ACCESS_OUTCOMES = [
  "authorized",
  "entity_not_found",
  "entity_out_of_scope",
  "access_denied",
  "resolver_unavailable",
  "resolution_failed",
] as const;
export type RadarEntityAccessOutcome = (typeof RADAR_ENTITY_ACCESS_OUTCOMES)[number];

export type RadarEntityAccessResolver = (
  input: RadarEntityAccessInput
) => Promise<RadarEntityAccessOutcome>;

// Todo outcome != "authorized" bloqueia a operação de item único, fail-closed,
// sem exceção. Em listagens, radarKnownEntityService.ts/radarMaterialService.ts
// tratam "access_denied" (e as variantes de escopo/entidade abaixo) como
// motivo para EXCLUIR o item da página; já "resolver_unavailable" e
// "resolution_failed" são falhas operacionais do próprio resolvedor e
// SEMPRE derrubam a operação inteira (mesmo em listagem) — nunca uma lista
// vazia "bem-sucedida" por engano.
export function reasonCodeForRadarEntityAccessOutcome(outcome: RadarEntityAccessOutcome): string | null {
  if (outcome === "authorized") return null;
  return `radar_entity_access_${outcome}`;
}

// Outcomes que, numa listagem, apenas excluem o item (nunca abortam a
// operação inteira). resolver_unavailable/resolution_failed ficam de fora
// desta lista deliberadamente — ver reasonCodeForRadarEntityAccessOutcome.
export const RADAR_ENTITY_ACCESS_ITEM_FILTERABLE_OUTCOMES: readonly RadarEntityAccessOutcome[] = [
  "entity_not_found",
  "entity_out_of_scope",
  "access_denied",
];

export function isRadarEntityAccessOperationFailure(outcome: RadarEntityAccessOutcome): boolean {
  return outcome === "resolver_unavailable" || outcome === "resolution_failed";
}
