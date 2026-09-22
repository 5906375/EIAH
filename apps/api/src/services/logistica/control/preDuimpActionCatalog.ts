import {
  buildPreDuimpContextContract,
  evaluatePreDuimpEntitlementGate,
  evaluatePreDuimpIsolation,
  type PreDuimpContextContract,
  type PreDuimpEntitlementDenialReason,
  type TenantWorkspaceScope,
} from "../../../types/preDuimpContextContract";
import type { TenantProductInstallationLike } from "../../../types/verticalEntitlementGateContract";
import type { PreDuimpAccessDenialReasonCode } from "../../../types/preDuimpAccessContract";

// Catalogo canonico de Actions do recorte PRE_DUIMP (Comex/DUIMP),
// interno a vertical publica Logistica (roadmap v8.1 secao 15).
//
// Todas as actions deste catalogo operam em modo shadow, sobre fixtures
// sinteticas, sem efeito externo real e sem transmissao ao Portal
// Unico/Siscomex. Qualquer action fora do catalogo, ou que solicite
// modo nao-shadow / transmissao externa, e rejeitada fail-closed.

export const PRE_DUIMP_ACTIONS = [
  "log.duimp_context.create",
  "log.duimp_context.review",
] as const;

export type PreDuimpAction = (typeof PRE_DUIMP_ACTIONS)[number];

const PRE_DUIMP_ACTION_SET = new Set<string>(PRE_DUIMP_ACTIONS);

export function isKnownPreDuimpAction(action: string): action is PreDuimpAction {
  return PRE_DUIMP_ACTION_SET.has(action);
}

// Somente "review" exige aprovacao humana (HITL). "create" e criacao pura
// de registro shadow, sem decisao a proteger.
const PRE_DUIMP_ACTIONS_REQUIRING_HITL = new Set<PreDuimpAction>([
  "log.duimp_context.review",
]);

export type PreDuimpExternalTransmissionSubreason =
  | "mode_not_shadow"
  | "external_transmission_requested";

export type PreDuimpActionReasonCode =
  | "PRE_DUIMP_ACTION_UNKNOWN"
  | "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED"
  | "PRE_DUIMP_ISOLATION_VIOLATION"
  | "PRE_DUIMP_RUNTIME_DISABLED"
  | "PRE_DUIMP_PILOT_ACCESS_DENIED"
  | "PRE_DUIMP_SCOPE_DENIED"
  | "PRE_DUIMP_ENTITLEMENT_DENIED"
  | "PRE_DUIMP_HITL_REQUIRED";

export class PreDuimpActionRejectedError extends Error {
  constructor(
    message: string,
    readonly reasonCode: PreDuimpActionReasonCode,
    readonly context: Record<string, unknown>,
    readonly subreason?:
      | PreDuimpExternalTransmissionSubreason
      | PreDuimpEntitlementDenialReason
      | PreDuimpAccessDenialReasonCode,
  ) {
    super(message);
    this.name = "PreDuimpActionRejectedError";
  }
}

export type PreDuimpHitlApprovalStatus = "approved" | "pending" | "rejected";

export type PreDuimpHitlApproval = {
  approvalId: string;
  tenantId: string;
  workspaceId: string;
  action: string;
  status: PreDuimpHitlApprovalStatus;
  approvedBy: string;
  approvedAt: string;
};

// Request transportavel/nao confiavel: e a UNICA parte deste fluxo que
// pode vir do cliente. Deliberadamente reduzida a action + context —
// nenhum campo de identidade, escopo, instalacao ou aprovacao HITL pode
// viver aqui, para que seja estruturalmente impossivel a um adapter
// futuro (ex.: espalhando req.body) auto-conceder isolamento, scope,
// entitlement ou HITL.
export type PreDuimpAuthorizationRequest = {
  action: string;
  context: unknown;
};

// Forma estrutural (nao brandeada) dos dados de autoridade que um
// chamador server-side ja resolveu e quer transformar em snapshot.
// Contem exatamente os dados que NUNCA podem vir do payload do
// cliente: identidade real do requester, escopos concedidos,
// instalacao/entitlement e aprovacao HITL persistida.
export type PreDuimpServerAuthoritySource = {
  requester: TenantWorkspaceScope;
  runtimeEnabled: boolean;
  pilotAccessAllowed: boolean;
  pilotAccessReasonCode: PreDuimpAccessDenialReasonCode | null;
  grantedScopes: readonly string[];
  installation: TenantProductInstallationLike | null;
  billingPastDue?: boolean;
  gracePeriodActive?: boolean;
  hitlApproval?: PreDuimpHitlApproval | null;
};

// Brand por unique symbol, nao exportado: nenhum codigo fora deste
// modulo consegue construir estruturalmente um
// PreDuimpServerAuthoritySnapshot, porque nao tem acesso ao simbolo. A
// UNICA forma de obter uma instancia valida e chamar
// resolvePreDuimpServerAuthoritySnapshot() abaixo — um objeto literal
// equivalente a PreDuimpServerAuthoritySource NAO satisfaz o tipo
// branded e nao pode ser passado como segundo argumento de
// authorizePreDuimpAction().
//
// Isso e apenas higiene de compilacao dentro deste repositorio — o
// brand NAO substitui enforcement real no servidor. Nesta task ainda
// nao ha sessao/DB/Redis reais; a resolucao real (sessao,
// TenantPolicyStore, tabela de instalacao, tabela de aprovacoes HITL)
// fica para o corte de integracao.
const PRE_DUIMP_SERVER_AUTHORITY_BRAND = Symbol("PreDuimpServerAuthoritySnapshot");

export type PreDuimpServerAuthoritySnapshot = Readonly<
  PreDuimpServerAuthoritySource & {
    [PRE_DUIMP_SERVER_AUTHORITY_BRAND]: true;
  }
>;

// Resolvedor dedicado: unica funcao autorizada a construir um
// PreDuimpServerAuthoritySnapshot. O nome explicita a origem: os
// campos de PreDuimpServerAuthoritySource devem ser montados pelo
// chamador a partir de sessao/policy/instalacao/HITL ja resolvidos no
// servidor — esta funcao NAO faz nenhuma resolucao real (sem
// DB/Redis/rota) nesta task, apenas formaliza o unico ponto de
// entrada sancionado para aplicar o brand. NUNCA deve receber os
// campos brutos de PreDuimpAuthorizationRequest nem nada vindo
// diretamente do payload do cliente/body da requisicao.
export function resolvePreDuimpServerAuthoritySnapshot(
  input: PreDuimpServerAuthoritySource,
): PreDuimpServerAuthoritySnapshot {
  return {
    ...input,
    grantedScopes: [...input.grantedScopes],
    [PRE_DUIMP_SERVER_AUTHORITY_BRAND]: true,
  };
}

// Brand por unique symbol, nao exportado: nenhum codigo fora deste modulo
// consegue construir estruturalmente um PreDuimpResolvedAuthority, porque
// nao tem acesso ao simbolo. A UNICA forma de obter uma instancia valida
// e chamar authorizePreDuimpAction() abaixo.
//
// Isso e apenas higiene de compilacao dentro deste repositorio — o brand
// NAO substitui enforcement real no servidor. Nenhuma integracao futura
// (HTTP, worker, etc.) deve aceitar um objeto authority/resolved pronto
// vindo do cliente (ex.: `body.authority`) como atalho para pular esta
// resolucao.
const PRE_DUIMP_RESOLVED_AUTHORITY_BRAND = Symbol("PreDuimpResolvedAuthority");

export type PreDuimpResolvedAuthority = {
  readonly [PRE_DUIMP_RESOLVED_AUTHORITY_BRAND]: true;
  readonly action: PreDuimpAction;
  readonly context: PreDuimpContextContract;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function assertPreDuimpHitl(
  action: PreDuimpAction,
  context: PreDuimpContextContract,
  approval: PreDuimpHitlApproval | null | undefined,
): void {
  if (!PRE_DUIMP_ACTIONS_REQUIRING_HITL.has(action)) return;

  const satisfied =
    !!approval &&
    approval.approvalId.trim().length > 0 &&
    approval.tenantId === context.tenantId &&
    approval.workspaceId === context.workspaceId &&
    approval.action === action &&
    approval.status === "approved" &&
    approval.approvedBy.trim().length > 0 &&
    approval.approvedAt.trim().length > 0;

  if (!satisfied) {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP HITL approval required and not satisfied for action: ${action}`,
      "PRE_DUIMP_HITL_REQUIRED",
      { action, approvalPresent: Boolean(approval) },
    );
  }
}

// Unica funcao autorizada a construir um PreDuimpResolvedAuthority.
//
// Toma DOIS parametros deliberadamente separados: `request` (bruto,
// nao confiavel, so action+context) e `serverAuthority` (resolvido no
// servidor). Isolamento, scope, entitlement e HITL usam EXCLUSIVAMENTE
// serverAuthority — nunca leem requester/grantedScopes/installation/
// hitlApproval de `request`, mesmo que esses campos estejam
// estruturalmente presentes ali (ex.: um `request` construido a partir
// de req.body inteiro). Nao ha nenhum caminho de codigo aqui que aceite
// um objeto authority/resolved pronto do chamador como atalho.
//
// Ordem fail-closed: action -> bloqueio externo -> parse -> isolamento
// -> runtime -> piloto workspace-exact -> scope -> entitlement -> HITL.
export function authorizePreDuimpAction(
  request: PreDuimpAuthorizationRequest,
  serverAuthority: PreDuimpServerAuthoritySnapshot,
): PreDuimpResolvedAuthority {
  if (!isKnownPreDuimpAction(request.action)) {
    throw new PreDuimpActionRejectedError(
      `Unknown PRE_DUIMP action: ${request.action}`,
      "PRE_DUIMP_ACTION_UNKNOWN",
      { attemptedAction: request.action },
    );
  }

  const raw = asRecord(request.context);

  if (raw && raw.mode !== undefined && raw.mode !== "shadow") {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP context requested a non-shadow mode: ${String(raw.mode)}`,
      "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED",
      { attemptedAction: request.action, mode: raw.mode },
      "mode_not_shadow",
    );
  }

  if (raw && raw.externalTransmissionAllowed === true) {
    throw new PreDuimpActionRejectedError(
      "PRE_DUIMP context requested externalTransmissionAllowed=true",
      "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED",
      { attemptedAction: request.action },
      "external_transmission_requested",
    );
  }

  const context = buildPreDuimpContextContract(request.context);

  const isolation = evaluatePreDuimpIsolation(context, serverAuthority.requester);
  if (!isolation.allowed) {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP isolation violation: ${isolation.reason}`,
      "PRE_DUIMP_ISOLATION_VIOLATION",
      { reason: isolation.reason, requester: serverAuthority.requester },
    );
  }

  if (!serverAuthority.runtimeEnabled) {
    throw new PreDuimpActionRejectedError(
      "PRE_DUIMP runtime shadow is disabled",
      "PRE_DUIMP_RUNTIME_DISABLED",
      { action: request.action },
      "PRE_DUIMP_RUNTIME_DISABLED",
    );
  }

  if (!serverAuthority.pilotAccessAllowed) {
    throw new PreDuimpActionRejectedError(
      "PRE_DUIMP pilot access denied",
      "PRE_DUIMP_PILOT_ACCESS_DENIED",
      { action: request.action },
      serverAuthority.pilotAccessReasonCode ?? "PRE_DUIMP_ACCESS_UNAVAILABLE",
    );
  }

  // Scope (RBAC): checagem pura contra escopos ja concedidos, lidos
  // exclusivamente de serverAuthority. NAO substitui
  // checkScopePermission/TenantPolicyStore real — este catalogo ainda
  // nao expoe rota HTTP; enforcement RBAC vivo (DB/Redis) fica para
  // quando a integracao real existir.
  if (!serverAuthority.grantedScopes.includes(request.action)) {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP scope denied for action: ${request.action}`,
      "PRE_DUIMP_SCOPE_DENIED",
      { action: request.action, requiredScope: request.action },
    );
  }

  const entitlement = evaluatePreDuimpEntitlementGate({
    context,
    installation: serverAuthority.installation,
    billingPastDue: serverAuthority.billingPastDue,
    gracePeriodActive: serverAuthority.gracePeriodActive,
  });
  if (!entitlement.allowed) {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP entitlement denied for action: ${request.action} (${entitlement.reason})`,
      "PRE_DUIMP_ENTITLEMENT_DENIED",
      {
        action: request.action,
        status: entitlement.status,
        gateReason: entitlement.reason === "status_denied" ? entitlement.gateReason : undefined,
      },
      entitlement.reason,
    );
  }

  assertPreDuimpHitl(request.action, context, serverAuthority.hitlApproval);

  return {
    [PRE_DUIMP_RESOLVED_AUTHORITY_BRAND]: true,
    action: request.action,
    context,
  };
}
