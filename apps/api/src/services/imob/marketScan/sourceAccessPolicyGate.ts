import type {
  ImobMarketSourceAccessMode,
  ImobSourceAccessDecisionReasonCode,
  ImobSourceAccessDecisionSnapshot,
} from "../imobConversationContract";
import { findMarketSource, type MarketSourceOperation, type MarketSourceRegistryEntry } from "./marketSourceRegistry";
import { publicWebAssistedPolicy } from "./publicWebAssistedPolicy";

export type SourceAccessPolicyInput = {
  sourceId: string;
  requestedMode: ImobMarketSourceAccessMode;
  operation: MarketSourceOperation;
  tenantId?: string | null;
  workspaceId?: string | null;
  hasTenantCredential?: boolean;
  requiresLogin?: boolean;
  hasCaptcha?: boolean;
  behindPaywall?: boolean;
  collectsPii?: boolean;
  bulkCollection?: boolean;
  requestedPages?: number;
  requestedResultsPerSource?: number;
  registry?: readonly MarketSourceRegistryEntry[];
};

function blocked(
  input: Pick<SourceAccessPolicyInput, "sourceId" | "requestedMode">,
  reasonCode: ImobSourceAccessDecisionReasonCode,
  message: string,
): ImobSourceAccessDecisionSnapshot {
  return {
    allowed: false,
    decision: "blocked_fail_closed",
    sourceId: input.sourceId,
    requestedMode: input.requestedMode,
    reasonCode,
    message,
  };
}

function isAuthorizedMode(mode: ImobMarketSourceAccessMode) {
  return (
    mode === "official_api"
    || mode === "partner_feed"
    || mode === "licensed_provider"
    || mode === "internal_crm"
    || mode === "tenant_inventory_import"
  );
}

export function decideSourceAccess(input: SourceAccessPolicyInput): ImobSourceAccessDecisionSnapshot {
  if (!input.tenantId) {
    return blocked(input, "TENANT_SCOPE_REQUIRED", "Market scan bloqueado: tenantId obrigatório.");
  }
  if (!input.workspaceId) {
    return blocked(input, "WORKSPACE_SCOPE_REQUIRED", "Market scan bloqueado: workspaceId obrigatório.");
  }

  const source = findMarketSource(input.sourceId, input.registry);
  if (!source || source.status === "disabled") {
    return blocked(input, "SOURCE_NOT_AUTHORIZED", "Fonte não autorizada para este market scan.");
  }
  if (source.status === "terms_denied" || !source.termsAccepted) {
    return blocked(input, "SOURCE_TERMS_NOT_ACCEPTED", "Termos da fonte não aceitos para este market scan.");
  }
  if (source.accessMode !== input.requestedMode) {
    return blocked(input, "SOURCE_NOT_AUTHORIZED", "Modo solicitado não corresponde ao modo autorizado da fonte.");
  }
  if (!source.allowedOperations.includes(input.operation)) {
    return blocked(input, "OPERATION_NOT_ALLOWED", "Operação não permitida para esta fonte.");
  }
  if (source.requiresTenantCredential && !input.hasTenantCredential) {
    return blocked(input, "TENANT_CREDENTIAL_REQUIRED", "Credencial do tenant obrigatória para esta fonte.");
  }
  if (input.requiresLogin) {
    return blocked(input, "LOGIN_REQUIRED_SOURCE", "Fonte com login obrigatório não pode ser usada neste modo.");
  }
  if (input.hasCaptcha) {
    return blocked(input, "CAPTCHA_BYPASS_BLOCKED", "Fonte com captcha não pode ser usada por automação.");
  }
  if (input.behindPaywall) {
    return blocked(input, "PAYWALL_BYPASS_BLOCKED", "Fonte atrás de paywall não pode ser usada por automação.");
  }
  if (input.collectsPii) {
    return blocked(input, "PII_EXPOSURE_RISK", "Coleta de PII bloqueada para market scan.");
  }
  if (input.bulkCollection) {
    return blocked(input, "BULK_SCRAPING_BLOCKED", "Coleta em massa sem autorização foi bloqueada.");
  }

  if (input.requestedMode === "public_web_assisted") {
    if ((input.requestedPages ?? 0) > publicWebAssistedPolicy.maxPagesPerScan) {
      return blocked(input, "BULK_SCRAPING_BLOCKED", "Leitura pública excede o limite de páginas por scan.");
    }
    if ((input.requestedResultsPerSource ?? 0) > publicWebAssistedPolicy.maxResultsPerSource) {
      return blocked(input, "BULK_SCRAPING_BLOCKED", "Leitura pública excede o limite de resultados por fonte.");
    }
    return {
      allowed: true,
      decision: "allowed_public_assisted",
      sourceId: input.sourceId,
      accessMode: "public_web_assisted",
      confidenceCap: publicWebAssistedPolicy.confidenceCap,
      piiPolicy: "exclude",
      rateLimitProfile: "strict",
      termsMode: "not_required",
    };
  }

  if (input.requestedMode === "manual_input") {
    return {
      allowed: true,
      decision: "allowed_manual",
      sourceId: input.sourceId,
      accessMode: "manual_input",
      confidenceCap: source.confidenceCap,
      piiPolicy: source.piiPolicy,
      rateLimitProfile: source.rateLimitProfile,
      termsMode: "not_required",
    };
  }

  if (isAuthorizedMode(input.requestedMode)) {
    return {
      allowed: true,
      decision: "allowed_authorized",
      sourceId: input.sourceId,
      accessMode: input.requestedMode,
      confidenceCap: source.confidenceCap,
      piiPolicy: source.piiPolicy,
      rateLimitProfile: source.rateLimitProfile,
      termsMode: "accepted",
    };
  }

  return blocked(input, "SOURCE_NOT_AUTHORIZED", "Modo de fonte não autorizado.");
}

