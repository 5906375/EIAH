import crypto from "node:crypto";
import type { VerticalAccessContractV1 } from "../../types/verticalEntitlementGateContract";
import { resolveVerticalAccess } from "../products/verticalAccessResolver";
import {
  evaluateChatVerticalHandoffV2,
  projectChatVerticalHandoffV2ForSurface,
  verticalRegistryV1Schema,
  type ChatVerticalHandoffV2,
  type VerticalCapabilityMode,
  type VerticalHandoffReasonCode,
  type VerticalRegistryV1,
} from "../../types/chatVerticalHandoffV2Contract";

/**
 * Composição pura do registry operacional (`vertical.registry.v1`) e do
 * handoff (`chat.vertical_handoff.v2`) do front door, a partir de fatos já
 * lidos do workspace. O handoff passa sempre pelo avaliador fail-closed do
 * contrato (ADR-010, etapas B e C).
 */

type Decision = "allowed" | "denied" | "not_required" | "not_evaluated";

export const IMOB_CHAT_PERMISSION = "imob.chat.use";

/** Capacidades que o IMOB oferece dentro da conversa do front door. */
export const IMOB_FRONT_DOOR_CAPABILITIES: Array<{ id: string; allowedModes: VerticalCapabilityMode[] }> = [
  { id: "crm.forms", allowedModes: ["requires_write"] },
  { id: "knowledge.search", allowedModes: ["read_only"] },
  { id: "inventory.preview", allowedModes: ["read_only"] },
  // P11: leitura do caso e das necessidades transversais (ex.: recomendação de Marketing) pelo Front Door, sem escrita.
  { id: "crm.case.consult", allowedModes: ["read_only"] },
];

export const IMOB_CASE_CONSULT_CAPABILITY = "crm.case.consult";

/**
 * Capacidades que a Logística & Comex anuncia no registry do front door: só a consulta de contexto. A jornada de preparação,
 * evidências, conferência e decisão humana acontece na conversa (cartão `logisticaJourney`), mas NÃO é capacidade anunciada aqui;
 * o cockpit é ferramenta opcional. Declarar não
 * concede nada: o acesso continua dependendo de instalação, liberação, vínculo ativo e da política `log.context.read`.
 */
export const LOGISTICA_FRONT_DOOR_CAPABILITIES: Array<{ id: string; allowedModes: VerticalCapabilityMode[] }> = [
  { id: "oraculo.context", allowedModes: ["read_only"] },
];

/** Passo 1: reusable access descriptor only. Existing composition/handoff is
 * unchanged; no runtime consumer uses the new resolver yet.
 */
export const IMOB_VERTICAL_ACCESS_CONTRACT_V1: VerticalAccessContractV1 = {
  version: "vertical.access.v1",
  verticalId: "imob",
  productId: "IMOB",
  installationRequired: true,
  entitlementKey: "IMOB_ACTIVE_INSTALLATION",
  workspacePermission: IMOB_CHAT_PERMISSION,
  // Front-door capability selection has no case stage. Case-scoped callers
  // must declare required and supply the existing stage permission decision.
  stagePolicy: "not_required",
  revocationPolicy: "resolved_usage",
  capabilities: IMOB_FRONT_DOOR_CAPABILITIES.map((capability) => ({
    id: capability.id,
    allowedModes: capability.allowedModes.filter(
      (mode): mode is "read_only" | "requires_write" => mode === "read_only" || mode === "requires_write",
    ),
  })),
};

export type VerticalRegistryFacts = {
  scope: { tenantId: string; workspaceId: string };
  logistica?: { installationStatus: "missing" | "inactive" | "active"; contextAllowed: boolean };
  imob: {
    installationStatus: "missing" | "inactive" | "active";
    entitled: boolean;
    agentsReady: boolean;
    userCanUse: boolean;
    /** Uso permitido pela liberação EIAH (ADR-011 §2.5). Ausente = sem restrição da liberação. */
    usage?: "full" | "read_only" | "blocked";
  };
};

/** Somente leitura: só as capacidades e modos de consulta continuam oferecidos na conversa. */
function capabilitiesForUsage(usage: "full" | "read_only" | "blocked") {
  const copies = IMOB_FRONT_DOOR_CAPABILITIES.map((capability) => ({ ...capability, allowedModes: [...capability.allowedModes] }));
  if (usage !== "read_only") return copies;
  return copies
    .map((capability) => ({ ...capability, allowedModes: capability.allowedModes.filter((mode) => mode === "read_only") }))
    .filter((capability) => capability.allowedModes.length > 0);
}

/** `policy` é opcional: ausente = `not_required` (IMOB e core não têm política própria no handoff). */
export type VerticalGovernance = Record<string, { rbac: Decision; entitlement: Decision; policy?: Decision }>;

/**
 * O IMOB está INSTALADO e HABILITADO no workspace? Mesma regra do registry de verticais (`status: "enabled"`): instalação ativa, direito de uso,
 * agentes provisionados e liberação EIAH não bloqueada. Fonte única: o handoff e as APIs operacionais do IMOB (AUTHZ-IMOB-INSTALLATION-001) a reutilizam.
 */
export function isImobVerticalEnabled(imob: Pick<VerticalRegistryFacts["imob"], "installationStatus" | "entitled" | "agentsReady" | "usage">): boolean {
  return imob.installationStatus === "active" && imob.entitled && imob.agentsReady && (imob.usage ?? "full") !== "blocked";
}

/** Composição pura (testável) do registry a partir dos fatos lidos do banco. */
export function composeVerticalRegistry(facts: VerticalRegistryFacts): { registry: VerticalRegistryV1; governance: VerticalGovernance } {
  const usage = facts.imob.usage ?? "full";
  const imobEnabled = isImobVerticalEnabled(facts.imob);
  const verticals: VerticalRegistryV1["verticals"] = [
    {
      id: "core",
      label: "EIAH",
      status: "enabled",
      capabilities: [{ id: "help.answer", allowedModes: ["read_only"] }],
      entitlement: { required: false, key: null },
      rbac: { requiredRoles: [] },
      policyGates: [],
      rolloutStage: "operationalized",
    },
  ];
  if (facts.imob.installationStatus !== "missing") {
    verticals.push({
      id: "imob",
      label: "IMOB",
      status: imobEnabled ? "enabled" : "disabled",
      capabilities: capabilitiesForUsage(usage),
      entitlement: { required: true, key: "REAL_ESTATE_CORE" },
      rbac: { requiredRoles: [] },
      policyGates: [IMOB_CHAT_PERMISSION],
      rolloutStage: "installed_surface",
    });
  }
  const logistica = facts.logistica && facts.logistica.installationStatus !== "missing" ? facts.logistica : null;
  if (logistica) {
    verticals.push({
      id: "log", label: "Logística & Comex",
      status: logistica.contextAllowed ? "enabled" : "disabled",
      // A capacidade só é declarada com o contexto autorizado; negada, a entrada permanece idêntica à versão anterior
      // (mesmo `registryVersion`, logo propostas de ativação pendentes continuam válidas).
      capabilities: logistica.contextAllowed ? LOGISTICA_FRONT_DOOR_CAPABILITIES.map((capability) => ({ ...capability, allowedModes: [...capability.allowedModes] })) : [],
      entitlement: { required: true, key: "LOGISTICA_ACTIVE_INSTALLATION" },
      rbac: { requiredRoles: [] }, policyGates: ["log.context.read"], rolloutStage: "context_only",
    });
  }
  const registryVersion = `vr1-${crypto.createHash("sha256").update(JSON.stringify(verticals)).digest("hex").slice(0, 12)}`;
  const registry = verticalRegistryV1Schema.parse({
    version: "vertical.registry.v1",
    registryVersion,
    scope: facts.scope,
    verticals,
  });
  return {
    registry,
    governance: {
      core: { rbac: "not_required", entitlement: "not_required" },
      imob: {
        rbac: facts.imob.userCanUse ? "allowed" : "denied",
        entitlement: facts.imob.entitled ? "allowed" : "denied",
      },
      // Logística não usa papel: `contextAllowed` já resume instalação ativa, liberação, vínculo ativo e a política exata
      // `log.context.read`, calculados no servidor (`resolveLogisticaContextAccess`). Sem entrada no registry, não há decisão.
      ...(logistica ? {
        log: {
          rbac: "not_required" as const,
          entitlement: logistica.contextAllowed ? "allowed" as const : "denied" as const,
          policy: logistica.contextAllowed ? "allowed" as const : "denied" as const,
        },
      } : {}),
    },
  };
}

/** O que a superfície recebe: sem tenant/workspace. */
export function projectVerticalRegistryForSurface(registry: VerticalRegistryV1) {
  return {
    version: registry.version,
    registryVersion: registry.registryVersion,
    verticals: registry.verticals.map((vertical) => ({
      id: vertical.id,
      label: vertical.label,
      status: vertical.status,
      capabilities: vertical.capabilities,
      rolloutStage: vertical.rolloutStage,
    })),
  };
}

export type VerticalHandoffRequest = {
  verticalId: string;
  capabilityId: string;
  mode: VerticalCapabilityMode;
  refs?: { conversationId?: string; threadId?: string };
};

export type VerticalHandoffResult =
  | { ok: true; handoff: ReturnType<typeof projectChatVerticalHandoffV2ForSurface> }
  | { ok: false; reasonCode: VerticalHandoffReasonCode };

/** Handoff operacional: governança preenchida pelo servidor e avaliada pelo contrato. */
export function buildAndEvaluateVerticalHandoff(
  composed: { registry: VerticalRegistryV1; governance: VerticalGovernance },
  request: VerticalHandoffRequest,
  handoffId: string,
): VerticalHandoffResult {
  const decisions = composed.governance[request.verticalId] ?? { rbac: "not_evaluated" as const, entitlement: "not_evaluated" as const };
  const vertical = composed.registry.verticals.find((entry) => entry.id === request.verticalId);
  const refs = Object.fromEntries(
    Object.entries(request.refs ?? {}).filter(([, value]) => typeof value === "string" && value.length > 0),
  );
  const candidate = {
    version: "chat.vertical_handoff.v2",
    handoffId,
    vertical: { id: request.verticalId, registryVersion: composed.registry.registryVersion },
    capability: { id: request.capabilityId, mode: request.mode },
    refs,
    governance: {
      tenantId: composed.registry.scope.tenantId,
      workspaceId: composed.registry.scope.workspaceId,
      scope: `${request.verticalId}:${request.capabilityId}`,
      registry: { decision: vertical ? "allowed" : "denied" },
      rbac: { decision: decisions.rbac },
      entitlement: { decision: decisions.entitlement },
      policy: { decision: decisions.policy ?? "not_required" },
      hitl: { status: request.mode === "critical_action" ? "required" : "not_required" },
    },
    presentation: { source: "operational", variant: "chat_card" },
    outcome: "allowed",
    reasonCode: "VERTICAL_HANDOFF_ALLOWED",
  } satisfies Record<string, unknown>;
  const evaluation = evaluateChatVerticalHandoffV2(composed.registry, candidate);
  if (!evaluation.ok) return { ok: false, reasonCode: evaluation.reasonCode };
  return { ok: true, handoff: projectChatVerticalHandoffV2ForSurface(evaluation.handoff as ChatVerticalHandoffV2) };
}

/**
 * Fatos do `vertical.access.v1` derivados dos MESMOS fatos de servidor que compõem o registry (nenhuma leitura nova).
 * Instalação ausente vira `null`; sem usuário identificado a permissão já vem negada em `userCanUse`.
 */
export function buildImobVerticalAccessFacts(facts: VerticalRegistryFacts) {
  return {
    scope: facts.scope,
    verticalId: "imob",
    installation: facts.imob.installationStatus === "missing"
      ? null
      : { tenantId: facts.scope.tenantId, workspaceId: facts.scope.workspaceId, product: "IMOB", status: facts.imob.installationStatus },
    workspacePermission: { key: IMOB_CHAT_PERMISSION, allowed: facts.imob.userCanUse },
    stagePermission: null,
    usage: facts.imob.usage ?? "full",
  };
}

export type ImobFrontDoorCapabilityAccess = { allowed: boolean; reasonCode: string };

/**
 * Acesso somente leitura do Front Door a uma capability do IMOB (P11). Fail-closed: exige o handoff `chat.vertical_handoff.v2`
 * E o `vertical.access.v1`, ambos sobre fatos do servidor. Não avalia autorização de actions nem concede nada.
 */
export function evaluateImobFrontDoorCapabilityAccess(
  facts: VerticalRegistryFacts,
  capabilityId: string,
  handoffId: string,
): ImobFrontDoorCapabilityAccess {
  const composed = composeVerticalRegistry(facts);
  const handoff = buildAndEvaluateVerticalHandoff(composed, { verticalId: "imob", capabilityId, mode: "read_only" }, handoffId);
  if (!handoff.ok) return { allowed: false, reasonCode: handoff.reasonCode };
  const access = resolveVerticalAccess([IMOB_VERTICAL_ACCESS_CONTRACT_V1], {
    scope: facts.scope, verticalId: "imob", capabilityId, mode: "read_only",
  }, buildImobVerticalAccessFacts(facts));
  return { allowed: access.allowed, reasonCode: access.reasonCode };
}
