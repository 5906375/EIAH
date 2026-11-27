import { createHash } from "node:crypto";

import { buildPreDuimpContextContract, type TenantWorkspaceScope } from "./preDuimpContextContract";
import { isKnownPreDuimpAction } from "../services/logistica/control/preDuimpActionCatalog";

// Contrato puro de replay/idempotencia para o PRE_DUIMP (roadmap v8.1
// §15, criterio 5). Politica pura: nenhuma persistencia, nenhum
// armazenamento, nenhum efeito externo, nenhuma chamada de rede/DB.
// Classificacao: politica pura implementada; persistencia e
// atomicidade pendentes do corte de integracao.
//
// Separa claramente:
// - PreDuimpReplayRequest: transportavel/nao confiavel (action,
//   context, idempotencyKey opcional — este ultimo tratado APENAS
//   como seletor/correlation token; nunca influencia a decisao por si
//   so, mesmo que coincida com algo);
// - PreDuimpReplayServerAuthoritySource / PreDuimpReplayServerAuthority:
//   estado conhecido, resolvido no servidor (branded por unique
//   symbol nao exportado, so construivel via
//   resolvePreDuimpReplayServerAuthority), seguindo a mesma separacao
//   de autoridade aplicada no cut 3 (preDuimpActionCatalog.ts);
// - evaluatePreDuimpReplay(): decisao pura, sincrona, nunca confia em
//   nada vindo apenas do payload do cliente.
//
// A resolucao real de estado previo (store/Redis/DB, atomicidade de
// leitura+escrita) fica inteiramente para um corte de integracao
// futuro. knownExecution, abaixo, e sempre fornecido pelo chamador —
// nenhuma busca e implementada aqui.

export type PreDuimpReplayRequest = {
  action: string;
  context: unknown;
  idempotencyKey?: string;
};

export type PreDuimpReplayKnownExecutionStatus = "in_progress" | "completed";

export type PreDuimpReplayKnownExecution = {
  tenantId: string;
  workspaceId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  fingerprint: string;
  status: PreDuimpReplayKnownExecutionStatus;
};

export type PreDuimpReplayServerAuthoritySource = {
  requester: TenantWorkspaceScope;
  knownExecution: PreDuimpReplayKnownExecution | null;
};

// Brand por unique symbol, nao exportado: nenhum codigo fora deste
// modulo consegue construir estruturalmente um
// PreDuimpReplayServerAuthority. A UNICA forma de obter uma instancia
// valida e chamar resolvePreDuimpReplayServerAuthority() abaixo — um
// objeto literal equivalente a PreDuimpReplayServerAuthoritySource nao
// satisfaz o tipo branded. Mesma higiene de compilacao do cut 3/4 —
// nao substitui enforcement real no servidor.
const PRE_DUIMP_REPLAY_AUTHORITY_BRAND = Symbol("PreDuimpReplayServerAuthority");

export type PreDuimpReplayServerAuthority = Readonly<
  PreDuimpReplayServerAuthoritySource & {
    [PRE_DUIMP_REPLAY_AUTHORITY_BRAND]: true;
  }
>;

export function resolvePreDuimpReplayServerAuthority(
  input: PreDuimpReplayServerAuthoritySource,
): PreDuimpReplayServerAuthority {
  return {
    ...input,
    [PRE_DUIMP_REPLAY_AUTHORITY_BRAND]: true,
  };
}

export type PreDuimpReplayDecisionKind =
  | "first_execution"
  | "safe_replay"
  | "in_progress"
  | "conflict"
  | "invalid";

export type PreDuimpReplaySubreason =
  | "in_progress"
  | "fingerprint_conflict"
  | "tenant_mismatch"
  | "workspace_mismatch"
  | "action_mismatch"
  | "resource_mismatch"
  | "invalid_key";

export type PreDuimpCanonicalReplayIdentity = {
  tenantId: string;
  workspaceId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  fingerprint: string;
};

export type PreDuimpReplayDecision =
  | { decision: "invalid"; canonicalIdentity: null; subreason?: PreDuimpReplaySubreason }
  | {
      decision: Exclude<PreDuimpReplayDecisionKind, "invalid">;
      canonicalIdentity: PreDuimpCanonicalReplayIdentity;
      subreason?: PreDuimpReplaySubreason;
    };

// Fingerprint deterministico derivado exclusivamente do contexto ja
// validado (PreDuimpContextContract) — nunca do idempotencyKey
// transportado. Duas chamadas com o mesmo contexto validado produzem
// sempre o mesmo fingerprint; qualquer diferenca de conteudo produz um
// fingerprint diferente.
function computeDeterministicFingerprint(context: {
  tenantId: string;
  workspaceId: string;
  verticalId: string;
  recordType: string;
  recordId: string;
  mode: string;
  externalTransmissionAllowed: boolean;
}): string {
  const canonical = JSON.stringify({
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    verticalId: context.verticalId,
    recordType: context.recordType,
    recordId: context.recordId,
    mode: context.mode,
    externalTransmissionAllowed: context.externalTransmissionAllowed,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// Decisao pura de replay/idempotencia. Sincrona; nao produz nenhum
// evento/publicacao/status/efeito; nao acessa DB/Redis/rede.
// serverAuthority.knownExecution e a UNICA fonte de estado previo
// considerada — request.idempotencyKey nunca autoriza nem influencia
// a decisao por si so, mesmo que coincida com algo.
export function evaluatePreDuimpReplay(
  request: PreDuimpReplayRequest,
  serverAuthority: PreDuimpReplayServerAuthority,
): PreDuimpReplayDecision {
  if (request.idempotencyKey !== undefined && request.idempotencyKey.trim().length === 0) {
    return { decision: "invalid", canonicalIdentity: null, subreason: "invalid_key" };
  }

  if (!isKnownPreDuimpAction(request.action)) {
    return { decision: "invalid", canonicalIdentity: null };
  }

  let context;
  try {
    context = buildPreDuimpContextContract(request.context);
  } catch {
    return { decision: "invalid", canonicalIdentity: null };
  }

  if (
    context.tenantId !== serverAuthority.requester.tenantId ||
    context.workspaceId !== serverAuthority.requester.workspaceId
  ) {
    return { decision: "invalid", canonicalIdentity: null };
  }

  const fingerprint = computeDeterministicFingerprint(context);
  const canonicalIdentity: PreDuimpCanonicalReplayIdentity = {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    action: request.action,
    resourceType: context.recordType,
    resourceId: context.recordId,
    fingerprint,
  };

  const known = serverAuthority.knownExecution;

  if (!known) {
    return { decision: "first_execution", canonicalIdentity };
  }

  if (known.tenantId !== canonicalIdentity.tenantId) {
    return { decision: "conflict", canonicalIdentity, subreason: "tenant_mismatch" };
  }
  if (known.workspaceId !== canonicalIdentity.workspaceId) {
    return { decision: "conflict", canonicalIdentity, subreason: "workspace_mismatch" };
  }
  if (known.action !== canonicalIdentity.action) {
    return { decision: "conflict", canonicalIdentity, subreason: "action_mismatch" };
  }
  if (known.resourceType !== canonicalIdentity.resourceType || known.resourceId !== canonicalIdentity.resourceId) {
    return { decision: "conflict", canonicalIdentity, subreason: "resource_mismatch" };
  }
  if (known.fingerprint !== canonicalIdentity.fingerprint) {
    return { decision: "conflict", canonicalIdentity, subreason: "fingerprint_conflict" };
  }

  if (known.status === "in_progress") {
    return { decision: "in_progress", canonicalIdentity, subreason: "in_progress" };
  }

  return { decision: "safe_replay", canonicalIdentity };
}

// Mapeamento de decisao para reason code canonico. first_execution e
// safe_replay sao desfechos de prosseguimento (nenhum reason code).
// in_progress, conflict e invalid sao desfechos de bloqueio, todos sob
// o mesmo codigo canonico PRE_DUIMP_REPLAY_REJECTED — o subreason (na
// decisao) carrega o diagnostico especifico, evitando inflacao do
// catalogo com um codigo por subcaso.
export function preDuimpReplayReasonCodeFor(
  decision: PreDuimpReplayDecisionKind,
): "PRE_DUIMP_REPLAY_REJECTED" | null {
  switch (decision) {
    case "first_execution":
    case "safe_replay":
      return null;
    case "in_progress":
    case "conflict":
    case "invalid":
      return "PRE_DUIMP_REPLAY_REJECTED";
  }
}
