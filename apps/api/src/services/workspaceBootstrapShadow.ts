import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { isMissingRelation, type WorkspaceSwitchShadowRecorder } from "./workspaceSwitchAuthorization";

// `@repo/db` e o gravador do ledger são carregados sob demanda: a classificação pura roda (e é testada) sem banco nem client Prisma.
const loadPrisma = async () => (await import("@repo/db")).prismaGlobal;

/**
 * EIAH-AUTHZ-G2.2 — SOMBRA do bootstrap de membership (somente observação).
 *
 * Estritamente observacional. Registra, no ponto central do bootstrap (`workspaceResponsibility.ts`), o que o comportamento
 * LEGADO acabou de fazer (vínculo criado em leitura / promoção do único membro a Founder) e o que a política FUTURA proposta
 * (G2.1 §6) faria no lugar. Nunca decide, nunca concede, nunca cria nem altera vínculo, papel, designação ou política, e nunca
 * altera a resposta da rota: a função de bootstrap continua sendo a original; este módulo só LÊ (evidências) e grava UM evento
 * observacional no ledger. O evento NÃO é decisão operacional nem autorização — registra uma diferença.
 *
 * Desligado por padrão e só liga com variável explícita em ambiente local (`NODE_ENV` development|test). Não há extensão a
 * staging neste gate: a separação de ambientes por `APP_ENV` não foi comprovada (ver relatório G2.2 §6).
 * Falha de observabilidade (consulta ou ledger) nunca altera a resposta: o evento deixa de existir, com aviso em log.
 */
export const WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY = "EIAH_WORKSPACE_BOOTSTRAP_SHADOW_ENABLED" as const;
export const WORKSPACE_BOOTSTRAP_POLICY_VERSION = "workspace-bootstrap-authz/1" as const;
export const WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE = "workspace.bootstrap.shadow_observation" as const;

/** Papel de menor privilégio da política futura proposta (a decidir em G3a: `corretor` vs `assistente`). */
export const WORKSPACE_BOOTSTRAP_LEAST_PRIVILEGE_ROLE = "corretor" as const;

/** Mesma lista usada por `promoteSoleWorkspaceMemberIfNeeded`. */
const PRIVILEGED_ROLE_KEYS = ["founder", "admin", "gestor", "desenvolvedor", "developer"] as const;

/** Liga somente com `"true"` explícito E em ambiente local (`NODE_ENV` development|test). Nunca em produção/staging. */
export function isWorkspaceBootstrapShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY] !== "true") return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export type WorkspaceBootstrapEntryPoint = "management_summary" | "actor_role_authority";
export type WorkspaceBootstrapRoleSource = "first_member" | "legacy_assignment" | "profile_role" | "default";

/**
 * Reproduz, sem efeitos, a ordem de precedência de `bootstrapWorkspaceMembership` para dizer DE ONDE veio o papel:
 * workspace sem membros ⇒ gestor; atribuição legada; `eiah_user_profiles.role` (autodeclarado); padrão (corretor).
 * O resultado deve coincidir com o papel realmente atribuído (o observador registra se coincidiu).
 */
export function classifyBootstrapRole(input: {
  roleKeys: readonly string[];
  workspaceHasMembers: boolean;
  legacyRoleKey: string | null;
  profileRoleKey: string | null;
}): { roleKey: string; source: WorkspaceBootstrapRoleSource } {
  const has = (key: string | null) => (key ? input.roleKeys.includes(key) : false);
  if (!input.workspaceHasMembers && has("gestor")) return { roleKey: "gestor", source: "first_member" };
  if (input.legacyRoleKey && has(input.legacyRoleKey)) return { roleKey: input.legacyRoleKey, source: "legacy_assignment" };
  if (input.profileRoleKey && has(input.profileRoleKey)) return { roleKey: input.profileRoleKey, source: "profile_role" };
  return { roleKey: has("corretor") ? "corretor" : input.roleKeys[0] ?? "corretor", source: "default" };
}

export function isPrivilegedBootstrapRole(roleKey: string | null | undefined): boolean {
  return PRIVILEGED_ROLE_KEYS.includes(String(roleKey ?? "").trim().toLowerCase() as (typeof PRIVILEGED_ROLE_KEYS)[number]);
}

/** Evidências de admissão que NÃO dependem de papel nem de perfil (classes de G2.1 §7; enraizamento NÃO avaliado aqui). */
export type IndependentAdmissionEvidence = {
  creatorLedger: boolean;
  productActivator: boolean;
  acceptedInvitation: boolean;
  legacyAssignment: boolean;
};

export type WorkspaceBootstrapEvidenceReaders = {
  readEvidence(scope: { tenantId: string; workspaceId: string; userId: string }): Promise<IndependentAdmissionEvidence>;
};

async function existsRow(run: () => Promise<Array<unknown>>): Promise<boolean> {
  try {
    return (await run()).length > 0;
  } catch (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
}

export const defaultWorkspaceBootstrapEvidenceReaders: WorkspaceBootstrapEvidenceReaders = {
  async readEvidence({ tenantId, workspaceId, userId }) {
    const prisma = await loadPrisma();
    const [creatorLedger, productActivator, acceptedInvitation, legacyAssignment] = await Promise.all([
      existsRow(() => prisma.$queryRaw<Array<unknown>>`
        SELECT 1 FROM guardrail_audit_ledger
        WHERE event_type = 'tenant.onboarded' AND tenant_id = ${tenantId} AND workspace_id = ${workspaceId}
          AND metadata->>'userId' = ${userId} LIMIT 1`),
      existsRow(() => prisma.$queryRaw<Array<unknown>>`
        SELECT 1 FROM tenant_product_installations
        WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId} AND activated_by_user_id = ${userId} LIMIT 1`),
      existsRow(() => prisma.$queryRaw<Array<unknown>>`
        SELECT 1 FROM eiah_workspace_invitations
        WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId} AND accepted_by_user_id = ${userId} AND status = 'accepted' LIMIT 1`),
      existsRow(() => prisma.$queryRaw<Array<unknown>>`
        SELECT 1 FROM eiah_workspace_role_assignments
        WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId} AND user_id = ${userId} LIMIT 1`),
    ]);
    return { creatorLedger, productActivator, acceptedInvitation, legacyAssignment };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Origem da chamada: contexto por requisição, ligado SOMENTE quando a sombra está ligada (middleware único em requestLogger).
// ---------------------------------------------------------------------------------------------------------------------

type RequestLike = { method?: string; baseUrl?: string; route?: { path?: unknown } };
type RequestOriginStore = { req: RequestLike; traceId?: string };
const requestOriginStorage = new AsyncLocalStorage<RequestOriginStore>();

/** Executa `next` dentro do contexto da requisição. Só chamado com a sombra ligada; desligada, a cadeia não muda. */
export function runWithRequestOrigin<T>(store: RequestOriginStore, next: () => T): T {
  return requestOriginStorage.run(store, next);
}

const OPAQUE_TRACE = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Rota (padrão do roteador, nunca a URL crua: sem ids, query nem token) e identificador de correlação existente da requisição. */
export function currentRequestOrigin(): { method: string; route: string; traceId: string | null } | null {
  const store = requestOriginStorage.getStore();
  if (!store) return null;
  const path = typeof store.req.route?.path === "string" ? store.req.route.path : null;
  const route = path !== null ? `${store.req.baseUrl ?? ""}${path}`.slice(0, 200) : "unmatched";
  const traceId = typeof store.traceId === "string" && OPAQUE_TRACE.test(store.traceId) ? store.traceId : null;
  return { method: String(store.req.method ?? "").toUpperCase().slice(0, 10), route, traceId };
}

// ---------------------------------------------------------------------------------------------------------------------

export type WorkspaceBootstrapObservationInput =
  | {
      observation: "membership_bootstrap";
      entryPoint?: WorkspaceBootstrapEntryPoint;
      tenantId: string;
      workspaceId: string;
      userId: string;
      roleKeys: readonly string[];
      workspaceHasMembers: boolean;
      legacyRoleKey: string | null;
      profileRoleKey: string | null;
      assignedRoleKey: string;
      assignedPermissions: readonly string[];
    }
  | {
      observation: "sole_member_promotion";
      entryPoint?: WorkspaceBootstrapEntryPoint;
      tenantId: string;
      workspaceId: string;
      userId: string;
      previousRoleKey: string;
      promotedRoleKey: string;
      promotedPermissions: readonly string[];
      activeMemberCount: number;
    };

/** Monta a comparação legado × política futura (função pura; sem dados pessoais, sem texto do perfil, sem credenciais). */
export function buildBootstrapComparison(
  input: WorkspaceBootstrapObservationInput,
  evidence: IndependentAdmissionEvidence | null,
) {
  const hasIndependentEvidence = evidence
    ? evidence.creatorLedger || evidence.productActivator || evidence.acceptedInvitation || evidence.legacyAssignment
    : null;
  if (input.observation === "membership_bootstrap") {
    const classified = classifyBootstrapRole(input);
    const futureRoleKey = input.legacyRoleKey && input.roleKeys.includes(input.legacyRoleKey)
      ? input.legacyRoleKey
      : WORKSPACE_BOOTSTRAP_LEAST_PRIVILEGE_ROLE;
    const profileRoleInCatalog = Boolean(input.profileRoleKey && input.roleKeys.includes(input.profileRoleKey));
    return {
      observation: input.observation,
      legacy: {
        action: "membership_created_on_read" as const,
        assignedRoleKey: input.assignedRoleKey,
        roleSource: classified.source,
        classifierConsistent: classified.roleKey === input.assignedRoleKey,
        privilegedRole: isPrivilegedBootstrapRole(input.assignedRoleKey),
        grantsProductsActivate: input.assignedPermissions.includes("products.activate"),
        grantsManageMembers: input.assignedPermissions.includes("workspace.manage_members") || input.assignedPermissions.includes("workspace.manage_roles"),
        profileRoleUsed: classified.source === "profile_role",
        profileRolePresent: Boolean(input.profileRoleKey),
        profileRoleInCatalog,
        profileRolePrivilegedInCatalog: profileRoleInCatalog && isPrivilegedBootstrapRole(input.profileRoleKey),
        firstMemberRuleApplied: classified.source === "first_member",
        workspaceHadMembers: input.workspaceHasMembers,
      },
      futurePolicy: {
        policyVersion: WORKSPACE_BOOTSTRAP_POLICY_VERSION,
        wouldCreateMembershipOnRead: false,
        wouldAssignRoleKey: futureRoleKey,
        wouldPromoteSoleMember: false,
        ignoresProfileRole: true,
        ignoresFirstMemberRule: true,
      },
      difference: {
        membershipCreatedOnRead: true,
        roleDiffers: futureRoleKey !== input.assignedRoleKey,
        privilegeReduction: isPrivilegedBootstrapRole(input.assignedRoleKey) && !isPrivilegedBootstrapRole(futureRoleKey),
        withoutIndependentEvidence: hasIndependentEvidence === null ? null : !hasIndependentEvidence,
      },
      evidence,
      hasIndependentEvidence,
    };
  }
  return {
    observation: input.observation,
    legacy: {
      action: "sole_member_promoted_to_founder" as const,
      previousRoleKey: input.previousRoleKey,
      assignedRoleKey: input.promotedRoleKey,
      roleSource: "sole_member_rule" as const,
      privilegedRole: isPrivilegedBootstrapRole(input.promotedRoleKey),
      grantsProductsActivate: input.promotedPermissions.includes("products.activate"),
      grantsManageMembers: input.promotedPermissions.includes("workspace.manage_members") || input.promotedPermissions.includes("workspace.manage_roles"),
      activeMemberCount: input.activeMemberCount,
    },
    futurePolicy: {
      policyVersion: WORKSPACE_BOOTSTRAP_POLICY_VERSION,
      wouldPromoteSoleMember: false,
      wouldKeepRoleKey: input.previousRoleKey,
    },
    difference: {
      privilegeEscalationByRule: !isPrivilegedBootstrapRole(input.previousRoleKey) && isPrivilegedBootstrapRole(input.promotedRoleKey),
      withoutIndependentEvidence: hasIndependentEvidence === null ? null : !hasIndependentEvidence,
    },
    evidence,
    hasIndependentEvidence,
  };
}

export type ObserveWorkspaceBootstrapParams = {
  input: WorkspaceBootstrapObservationInput;
  env?: NodeJS.ProcessEnv;
  readers?: WorkspaceBootstrapEvidenceReaders;
  record?: WorkspaceSwitchShadowRecorder;
  logger?: { warn?: (...args: unknown[]) => void };
  timeoutMs?: number;
  correlationId?: string;
};

const defaultRecorder: WorkspaceSwitchShadowRecorder = async (event) => {
  const { recordGuardrailAudit } = await import("@eiah/core/services/guardrailLedgerStore");
  await recordGuardrailAudit({ prisma: (await loadPrisma()) as never, ...event });
};

/**
 * Registra UMA observação no ledger depois que a operação legada já terminou. Retorna a comparação ou `null` se
 * desligado/indisponível. NUNCA lança e nunca atrasa a operação além de `timeoutMs`.
 */
export async function observeWorkspaceBootstrapShadow(params: ObserveWorkspaceBootstrapParams) {
  if (!isWorkspaceBootstrapShadowEnabled(params.env)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const { input } = params;
      let evidence: IndependentAdmissionEvidence | null = null;
      try {
        evidence = await (params.readers ?? defaultWorkspaceBootstrapEvidenceReaders).readEvidence({
          tenantId: input.tenantId, workspaceId: input.workspaceId, userId: input.userId,
        });
      } catch {
        // Falha ao ler evidência: registra a observação como "evidência indisponível" (null), nunca como evidência presente.
        evidence = null;
      }
      const comparison = buildBootstrapComparison(input, evidence);
      const origin = currentRequestOrigin();
      await (params.record ?? defaultRecorder)({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        eventType: WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE,
        severity: "info",
        message: "Observação em modo sombra do bootstrap de membership: não é decisão operacional nem concessão.",
        metadata: {
          kind: "shadow_observation",
          operational: false,
          enforced: false,
          policyVersion: WORKSPACE_BOOTSTRAP_POLICY_VERSION,
          correlationId: params.correlationId ?? origin?.traceId ?? crypto.randomUUID(),
          actorUserId: input.userId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          entryPoint: input.entryPoint ?? null,
          origin: origin ? { method: origin.method, route: origin.route } : null,
          ...comparison,
          evidenceNotes: ["invitation_rootedness_not_evaluated", "product_activator_chain_not_evaluated"],
          observedAt: new Date().toISOString(),
        },
      });
      return comparison;
    })();
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), params.timeoutMs ?? 2000); });
    const result = await Promise.race([work, timeout]);
    if (timer) clearTimeout(timer);
    if (!result) params.logger?.warn?.({ event: "workspace_bootstrap.shadow_timeout" }, "workspace_bootstrap.shadow_unavailable");
    work.catch(() => undefined);
    return result;
  } catch (error) {
    if (timer) clearTimeout(timer);
    params.logger?.warn?.({ event: "workspace_bootstrap.shadow_failed", error: String((error as Error)?.message ?? error).slice(0, 120) }, "workspace_bootstrap.shadow_unavailable");
    return null;
  }
}
