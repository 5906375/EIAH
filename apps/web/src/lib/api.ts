// Cliente minimalista com tipos e helpers.
// Ajuste BASE_URL e a forma de obter token/header do projeto.

import { getSession, subscribeSession } from "@/state/sessionStore";

const VITE_ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const BASE_URL = VITE_ENV.VITE_API_URL || "https://dev.api.eiah.ai/api";

let cachedSession = getSession();
subscribeSession((next) => {
  cachedSession = next;
});

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(`HTTP ${status} ${message}`);
    this.status = status;
    this.body = body;
  }
}

export type RunStatus = "pending" | "running" | "success" | "error" | "blocked";

export type Run = {
  id: string;
  workspaceId: string;
  tenantId?: string;
  projectId?: string;
  userId?: string | null;
  caseId?: string | null;
  threadId?: string | null;
  agent: string;
  status: RunStatus;
  request?: unknown;
  response?: unknown;
  costCents?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  txId?: string | null;
  criticalHash?: string | null;
  meta?: { traceId?: string; tookMs?: number };
};

export type ImobFunnelHealth = {
  workspaceId: string;
  module: "imob";
  window: "7d" | "30d";
  generatedAt: string;
  summary: {
    blockedTotal: number;
    pendingApprovals: number;
    pendingLegal: number;
    salesKitPendingReview: number;
    partialSettlements: number;
  };
  byStatus: Array<{
    status: string;
    count: number;
    ageBuckets: { h24: number; h48: number; h72: number; gt72: number };
  }>;
  byReasonCode: Array<{
    reasonCode: string;
    count: number;
    severity: "BLOCK" | "CRITICAL";
  }>;
  topBlockedRuns: Array<{
    runId: string;
    status: string;
    reasonCodes: string[];
    ageHours: number;
    lastUpdatedAt: string;
    txId?: string | null;
    criticalHash?: string | null;
  }>;
  actions: Array<{ actionId: string; label: string; enabled: boolean }>;
};

export type RunEvent = {
  id: string;
  runId: string;
  type: string;
  payload?: unknown;
  criticalHash?: string | null;
  sclTxId?: string | null;
  createdAt: string;
  userId?: string | null;
};

export type GateDecision = "observed" | "allowed" | "blocked" | "error";
export type GateMode = "shadow" | "enforce";
export type Gate = "intent" | "trust" | "judge";

export type GateVerdict = {
  gate: Gate;
  decision: GateDecision;
  mode?: GateMode;
  score?: number;
  threshold?: number;
  reasonCodes?: string[];
  policyVersion?: string;
  model?: string;
  stepId?: string | null;
  createdAt?: string;
};

export type GovernanceSummary = {
  runId: string;
  workspaceId?: string;
  gates: {
    intent?: GateVerdict;
    trust?: GateVerdict;
    judge?: GateVerdict;
  };
  evidence?: { auditEventIds: string[] };
  canCalibrate?: boolean;
};

export type TrustPoint = { t: string; score: number };
export type TrustHistory = { workspaceId: string; window: string; points: TrustPoint[] };

export type Agent = {
  id: string;
  name: string;
  description?: string;
  pricing?: { perRunCents?: number; perMBcents?: number };
  profile?: { model: string; systemPrompt: string; tools?: unknown };
  knowledgePolicy?: {
    deterministicSources: Array<{
      sourceId: string;
      kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
      authorityLevel: "primary" | "secondary" | "advisory";
      required: boolean;
      version: string;
    }>;
    sourcePrecedence: string[];
    conflictResolution: "fail_closed" | "use_primary" | "human_review";
    llmUsageMode:
      | "none"
      | "format_only"
      | "grounded_reasoning"
      | "open_reasoning_restricted"
      | "disallowed_for_critical_execution";
    fallbackPolicy: "block" | "approved_snapshot" | "human_review";
    provenancePolicy: "required" | "recommended" | "none";
    maskingPolicy: "required" | "conditional" | "none";
  };
  governance?: {
    modelPolicy: string;
    toolCapabilities: string[];
    criticality: "low" | "medium" | "high" | "critical";
    approval: string;
    receiptPolicy: string;
    requiredScopes: string[];
  };
  cognitiveProfile?: {
    reasoningMode:
      | "synthesis"
      | "diagnostic"
      | "orchestration"
      | "simulation"
      | "monitoring"
      | "critique"
      | "compliance";
    initiativeLevel: "low" | "medium" | "high";
    ambiguityStrategy: "ask_first" | "infer_conservatively" | "route_to_core";
    confidenceBehavior: "explicit" | "implicit" | "gated";
    memoryStyle: "session_only" | "contextual" | "evidence_anchored";
    decisionPosture: "advisory" | "constrained_action" | "execution_guarded";
    delegationPolicy: "never" | "optional" | "preferred" | "mandatory_for_sensitive";
  };
  uxContract?: {
    primaryUserValue: string;
    responseShape:
      | "brief_answer"
      | "executive_summary"
      | "step_plan"
      | "options_matrix"
      | "risk_brief"
      | "alert_card"
      | "evidence_pack";
    toneProfile: "executive" | "operational" | "analytical" | "commercial" | "supportive";
    interactionPattern: "single_turn" | "guided_flow" | "review_loop" | "monitoring_loop";
    defaultCTA: string;
    maxCognitiveLoad: "low" | "medium" | "high";
    clarificationPolicy: "minimal" | "targeted" | "strict";
    progressExposure: "none" | "light" | "structured";
    trustSignals: string[];
  };
  chatCopy?: {
    whoIAm: string;
    whatIDo: string[];
    whenToUseMe: string[];
    whatINotDo?: string[];
    exampleRequests: string[];
    quickReplies?: string[];
    defaultNextStep?: string;
    blockedMessages?: {
      genericBlocked?: string;
      missingContext?: string;
      missingRequiredSource?: string;
    };
  };
  chatRuntime?: {
    readiness: "ready" | "incomplete";
    resolver: "agent_driven" | "legacy_compatible";
    missingFields: string[];
    hasModeContracts: boolean;
    hasAttachmentIntake: boolean;
    onboardingPolicy: "fail_closed_for_new_agents";
    chatEnabled: boolean;
    catalogVisibility: "visible" | "blocked";
    blockingReason: "missing_minimum_contract" | null;
  };
  attachmentContract?: {
    acceptsAttachments: boolean;
    acceptedAttachmentKinds: string[];
    acceptedMimeTypes?: string[];
    intakeModes: Array<"upload_file" | "paste_text" | "structured_form">;
    analysisModes: Array<
      | "full_review"
      | "partial_review"
      | "clause_review"
      | "risk_scan"
      | "missing_fields"
      | "evidence_validation"
      | "financial_check"
    >;
    defaultAnalysisMode?:
      | "full_review"
      | "partial_review"
      | "clause_review"
      | "risk_scan"
      | "missing_fields"
      | "evidence_validation"
      | "financial_check";
    requiredMetadata?: string[];
    initialPrompts?: string[];
    uploadHelpText?: string;
  };
  participation?: {
    agentId: string;
    status: "active" | "restricted" | "experimental" | "future" | "deprecated";
    visibility: "visible" | "hidden" | "internal_only";
    canBeSuggested: boolean;
    canReceiveHandoff: boolean;
    requiresEntitlement: boolean;
    requiredModules?: string[];
    requiredWorkspaceCapabilities?: string[];
  };
  modeContracts?: Array<{
    mode: "help" | "orchestrator" | "proposal";
    label: string;
    description: string;
    knowledgePolicy?: Agent["knowledgePolicy"];
    cognitiveProfile?: Agent["cognitiveProfile"];
    uxContract?: Agent["uxContract"];
    chatCopy?: Agent["chatCopy"];
  }>;
};

export type AgentProtocolActionContract = {
  action: string;
  version: string;
  tier: "LOW" | "MEDIUM" | "HIGH";
  txIdRequired: boolean;
  inputSchema: Record<string, unknown>;
  receiptSchema: { specVersion: string };
  trustRequirements: {
    minTrustScore: number;
    requiresPoU: boolean;
  };
  defaultAgent: string;
};

export type MarketplaceItem = {
  id: string;
  type: "agent" | "action";
  name: string;
  version: string;
  description?: string | null;
  trustScore?: number | null;
  isPublic: boolean;
  publisherId: string;
  publisherName?: string | null;
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  createdAt: string;
};

export type DelegationPolicy = {
  id: string;
  delegatorId: string;
  delegateeId: string;
  marketplaceId?: string | null;
  marketplaceName?: string | null;
  marketplaceType?: "agent" | "action" | string | null;
  publisherId?: string | null;
  publisherName?: string | null;
  scope: "read" | "execute" | "admin";
  trustMin: number;
  validUntil: string;
  policyHash: string;
  signatureHash: string;
  createdAt: string;
};

export type UploadedDocumentInfo = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
};

export type PlanBranding = {
  brand_name: string;
  logo_url: string;
  primary_color: string;
  email_from: string;
};

export type PlanSpec = {
  plan_id: string;
  name: string;
  amount: number;
  currency: "BRL" | "USD";
  interval: "monthly" | "yearly";
  branding: PlanBranding;
  rules?: string[];
  metadata?: Record<string, unknown>;
  custom_texts?: Record<string, string>;
};

export type NeedMoreInfoField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select";
  placeholder?: string;
  helper?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type NeedMoreInfoPayload = {
  status: "need_more_info";
  title?: string;
  message?: string;
  fields: NeedMoreInfoField[];
};

export type OnboardingResponse = {
  ok: boolean;
  data?: {
    tenantId: string;
    workspaceId: string;
    userId: string;
    token: string | null;
    delegationId?: string | null;
    trustBaseline?: number;
    mode?: "provision" | "register_only";
  };
  error?: { code?: string; message?: string };
};

export type WorkspaceCreateResponse = {
  ok: boolean;
  data?: {
    workspaceId: string;
    name: string;
    createdAt?: string;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type WorkspaceListResponse = {
  ok: boolean;
  data?: {
    currentWorkspaceId: string;
    items: Array<{
      id: string;
      name: string;
      createdAt?: string;
      isCurrent: boolean;
    }>;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type ProfileResponse = {
  ok: boolean;
  data?: {
    fullName: string;
    email: string;
    phone: string;
    cep: string;
    role: string;
    website: string;
    city: string;
    country: string;
    tenant: {
      id: string;
      name: string;
    };
    workspace: {
      id: string;
      name: string;
      roleKey: string;
      roleLabel: string;
      responsibleLabel: string;
      roleOptions: Array<{
        key: string;
        label: string;
        defaultPermissions: string[];
      }>;
      permissions: string[];
      canManageMembers: boolean;
      members: Array<{
        userId: string;
        email: string;
        fullName: string;
        roleKey: string;
        roleLabel: string;
        permissions: string[];
        status: string;
        isCurrentUser: boolean;
        createdAt: string;
      }>;
      invitations: Array<{
        id: string;
        email: string;
        fullName: string;
        roleKey: string;
        roleLabel: string;
        permissions: string[];
        status: string;
        token: string;
        expiresAt: string;
        createdAt: string;
      }>;
    };
    workspaces: Array<{
      id: string;
      name: string;
      createdAt?: string;
      isCurrent: boolean;
    }>;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type WorkspaceInvitationPreviewResponse = {
  ok: boolean;
  data?: {
    token: string;
    tenantId: string;
    tenantName: string;
    workspaceId: string;
    workspaceName: string;
    email: string;
    fullName: string;
    roleKey: string;
    roleLabel: string;
    permissions: string[];
    status: string;
    expiresAt: string;
    expired: boolean;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type WorkspaceInvitationAcceptResponse = {
  ok: boolean;
  data?: {
    token: string;
    tenantId: string;
    workspaceId: string;
    userId: string;
    email: string;
    fullName: string;
    roleKey: string;
    roleLabel: string;
    responsibleLabel: string;
    method: "password" | "token";
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type WorkspaceInvitationCreateResponse = {
  ok: boolean;
  data?: {
    id: string;
    token: string;
    email: string;
    fullName: string;
    roleKey: string;
    roleLabel: string;
    permissions: string[];
    status: string;
    expiresAt: string;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type LegacyLoginResponse = {
  ok: boolean;
  data?: {
    token: string;
    tenantId: string;
    workspaceId: string;
    userId?: string | null;
    method: "password" | "token" | "wallet";
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type WalletChallengeResponse = {
  ok: boolean;
  data?: {
    challengeId: string;
    message: string;
    expiresAt: string;
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type SetLegacyPasswordResponse = {
  ok: boolean;
  data?: {
    email: string;
    method: "token" | "current_password" | "bootstrap" | "email_recovery";
    legacyAuthSource: "db";
  };
  error?: { code?: string; message?: string; details?: unknown };
};

export type SessionContextResponse = {
  ok: boolean;
  data?: {
    tenantId: string;
    workspaceId: string;
    userId?: string | null;
    activeDomain: "core" | "imob";
    availableDomains: Array<"core" | "imob">;
    entitlements: {
      REAL_ESTATE_CORE: boolean;
      EXPORTS_ADDON: boolean;
      BILLING_INSIGHTS_ADDON: boolean;
      IMOB_INSTALLED?: boolean;
    };
    productInstallations?: Array<{
      product: string;
      status: string;
    }>;
    roles: string[];
    branding: {
      brandName: string;
      logoUrl: string | null;
      primaryColor: string;
      workspaceLabel: string;
    };
  };
  error?: {
    code?: string;
    reasonCode?: "IMOB_ENTITLEMENT_MISSING" | "IMOB_INSTALLATION_INACTIVE" | "IMOB_PERMISSION_DENIED";
    message?: string;
    traceId?: string;
    product?: "IMOB";
    capability?: "CENTRAL_OPERACIONAL" | "KNOWLEDGE_SYNC_STATUS" | "KNOWLEDGE_SEARCH";
    scope?: {
      tenantId: string;
      workspaceId: string;
    };
    cta?: {
      type: "INSTALL" | "ACTIVATE" | "CONTACT_ADMIN" | "OPEN_BILLING";
      label: string;
      target: string;
    };
    details?: {
      entitlementRequired?: "IMOB_ACTIVE_INSTALLATION";
      installationStatus?: "missing" | "inactive" | "active";
      stage?: string | null;
    };
  };
};

type CreateRunBody = {
  agent: string;
  prompt: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = cachedSession.token;
  const tenantId = cachedSession.tenantId;
  const workspaceId = cachedSession.workspaceId;

  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!bodyIsFormData && init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);

  if (tenantId) {
    if (!headers.has("x-eiah-tenant")) headers.set("x-eiah-tenant", tenantId);
    if (!headers.has("x-tenant-id")) headers.set("x-tenant-id", tenantId);
  }

  if (workspaceId) {
    if (!headers.has("x-eiah-workspace")) headers.set("x-eiah-workspace", workspaceId);
    if (!headers.has("x-workspace-id")) headers.set("x-workspace-id", workspaceId);
  }

  const requestInit: RequestInit = {
    ...init,
    headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, requestInit);

  if (!res.ok) {
    if (res.status === 401 && !token && typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}`;
      if (!current.startsWith("/access")) {
        window.location.assign(`/access?next=${encodeURIComponent(current)}`);
      }
    }

    const contentType = res.headers.get("content-type") ?? "";
    let body: unknown;

    if (contentType.includes("application/json")) {
      body = await res.json().catch(() => undefined);
    } else {
      body = await res.text().catch(() => "");
    }

    let message = res.statusText || "Request failed";

    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;
      const errorContent = payload.error;

      if (typeof errorContent === "string") {
        message = errorContent;
      } else if (
        errorContent &&
        typeof errorContent === "object" &&
        typeof (errorContent as { message?: unknown }).message === "string"
      ) {
        message = (errorContent as { message: string }).message;
      }
    } else if (typeof body === "string" && body.trim().length > 0) {
      message = body.trim();
    }

    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

/** Agents */
export async function apiListAgents(): Promise<{ items: Agent[] }> {
  return http(`/agents`, { method: "GET" });
}

export async function apiAgentsDiscovery(body: {
  domain?: string;
  actions?: string[];
}): Promise<{
  ok: boolean;
  data: {
    protocolVersion: string;
    domain: string;
    tenantId: string;
    workspaceId: string;
    actions: AgentProtocolActionContract[];
    discoveredAt: string;
  };
}> {
  return http(`/agents/discovery`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAgentsNegotiate(body: {
  domain?: string;
  action: string;
  version?: string;
}): Promise<{
  ok: boolean;
  data: {
    protocolVersion: string;
    domain: string;
    contract: AgentProtocolActionContract;
    execution: { endpoint: string; method: string };
    verification: { endpointTemplate: string; receiptSpecVersion: string };
    negotiatedAt: string;
  };
}> {
  return http(`/agents/negotiate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAgentsExecute(body: {
  domain?: string;
  action: string;
  version?: string;
  input?: Record<string, unknown>;
  prompt?: string;
  metadata?: Record<string, unknown>;
  parentRunId?: string;
}): Promise<{
  ok: boolean;
  data: {
    runId: string;
    status: string;
    action: string;
    version: string;
    parentRunId?: string | null;
    verify: {
      txId: "required" | null;
      ledgerEndpointTemplate: string;
      runBundlePath: string;
    };
  };
}> {
  return http(`/agents/execute`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiListMarketplace(params?: {
  type?: "agent" | "action";
  publisherId?: string;
}): Promise<{ items: MarketplaceItem[] }> {
  const query = new URLSearchParams();
  if (params?.type) query.append("type", params.type);
  if (params?.publisherId) query.append("publisherId", params.publisherId);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http(`/marketplace${qs}`, { method: "GET" });
}

export async function apiSubscribeMarketplace(
  id: string,
  body?: {
    scope?: "read" | "execute" | "admin";
    trustMin?: number;
    validUntil?: string;
    policyHash?: string;
    signatureHash?: string;
  }
): Promise<{ ok: boolean; delegationId: string }> {
  return http(`/marketplace/${id}/subscribe`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiActivateMarketplaceInstallation(body: {
  product: "IMOB";
}): Promise<{
  ok: boolean;
  installation: {
    tenantId: string;
    workspaceId: string;
    product: string;
    status: string;
    activatedAt: string;
    activatedByUserId?: string | null;
  };
  releasedRoutes: string[];
}> {
  return http(`/marketplace/installations/activate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiListMarketplaceInstallations(): Promise<{
  ok: boolean;
  items: Array<{
    tenantId: string;
    workspaceId: string;
    product: string;
    status: string;
    activatedAt: string;
    activatedByUserId?: string | null;
  }>;
}> {
  return http(`/marketplace/installations`, { method: "GET" });
}

export async function apiOnboarding(body: {
  email: string;
  name: string;
  orgName: string;
  marketplaceId?: string;
  mode?: "provision" | "register_only";
}): Promise<OnboardingResponse> {
  return http(`/auth/onboarding`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPreviewWorkspaceInvitation(token: string): Promise<WorkspaceInvitationPreviewResponse> {
  return http(`/auth/workspace-invitations/preview`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function apiAcceptWorkspaceInvitation(body: {
  token: string;
  loginToken?: string;
  email?: string;
  fullName?: string;
  password?: string;
}): Promise<WorkspaceInvitationAcceptResponse> {
  return http(`/auth/workspace-invitations/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiLegacyLogin(body: {
  email?: string;
  password?: string;
  token?: string;
}): Promise<LegacyLoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : await res.text().catch(() => undefined);

  if (!res.ok) {
    let message = res.statusText || "Login failed";
    if (payload && typeof payload === "object") {
      const asObj = payload as { error?: { message?: string } };
      if (asObj.error?.message) message = asObj.error.message;
    } else if (typeof payload === "string" && payload.trim()) {
      message = payload.trim();
    }
    throw new ApiError(res.status, message, payload);
  }

  return payload as LegacyLoginResponse;
}

export async function apiSetLegacyPassword(body: {
  email: string;
  newPassword: string;
  confirmPassword?: string;
  currentPassword?: string;
  token?: string;
}): Promise<SetLegacyPasswordResponse> {
  const res = await fetch(`${BASE_URL}/auth/password/set`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : await res.text().catch(() => undefined);

  if (!res.ok) {
    let message = res.statusText || "Password update failed";
    if (payload && typeof payload === "object") {
      const asObj = payload as { error?: { message?: string } };
      if (asObj.error?.message) message = asObj.error.message;
    } else if (typeof payload === "string" && payload.trim()) {
      message = payload.trim();
    }
    throw new ApiError(res.status, message, payload);
  }

  return payload as SetLegacyPasswordResponse;
}

export async function apiCreateWalletChallenge(body: {
  address: string;
}): Promise<WalletChallengeResponse> {
  const res = await fetch(`${BASE_URL}/auth/wallet/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : await res.text().catch(() => undefined);

  if (!res.ok) {
    let message = res.statusText || "Wallet challenge failed";
    if (payload && typeof payload === "object") {
      const asObj = payload as { error?: { message?: string } };
      if (asObj.error?.message) message = asObj.error.message;
    } else if (typeof payload === "string" && payload.trim()) {
      message = payload.trim();
    }
    throw new ApiError(res.status, message, payload);
  }

  return payload as WalletChallengeResponse;
}

export async function apiWalletLogin(body: {
  address: string;
  challengeId: string;
  signature: string;
}): Promise<LegacyLoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/wallet/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : await res.text().catch(() => undefined);

  if (!res.ok) {
    let message = res.statusText || "Wallet login failed";
    if (payload && typeof payload === "object") {
      const asObj = payload as { error?: { message?: string } };
      if (asObj.error?.message) message = asObj.error.message;
    } else if (typeof payload === "string" && payload.trim()) {
      message = payload.trim();
    }
    throw new ApiError(res.status, message, payload);
  }

  return payload as LegacyLoginResponse;
}

export async function apiListDelegations(params?: {
  role?: "delegator" | "delegatee" | "all";
  workspaceScoped?: boolean;
}): Promise<{ items: DelegationPolicy[] }> {
  const query = new URLSearchParams();
  if (params?.role) query.append("role", params.role);
  if (typeof params?.workspaceScoped === "boolean") {
    query.append("workspaceScoped", String(params.workspaceScoped));
  }
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http(`/delegations${qs}`, { method: "GET" });
}

/** Runs */
export async function apiListRuns(params: {
  agent?: string;
  status?: RunStatus;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  workspaceId?: string;
}) {
  const { workspaceId, ...rest } = params || {};
  const query = new URLSearchParams();
  if (workspaceId) {
    query.append("projectId", workspaceId);
  }
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  });
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ items: Run[]; total: number }>(`/runs${qs}`, { method: "GET" });
}

export async function apiGetRun(id: string): Promise<Run> {
  return http<Run>(`/runs/${id}`, { method: "GET" });
}

export type RunCostBreakdown = {
  run: {
    id: string;
    workspaceId: string;
    caseId?: string | null;
    threadId?: string | null;
    agent: string;
    agentVersion?: string | null;
    status: string;
    costCents: number;
    traceId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  totals: {
    amountCents: number;
    tokens: number;
  };
  estimate: {
    amountCents: number | null;
    available: boolean;
    source: "backend_pricing" | null;
    varianceCents: number | null;
  };
  items: Array<{
    id: string;
    requestId: string;
    traceId?: string | null;
    agent: string;
    agentVersion?: string | null;
    provider: string;
    model: string;
    pricingVersion: string;
    meterType: string;
    requestClass: string;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalTokens: number;
    amountCents: number;
    currency: string;
    estimated: boolean;
    createdAt: string;
  }>;
};

export async function apiGetRunCostBreakdown(id: string) {
  return http<{ ok: boolean; data: RunCostBreakdown }>(`/runs/${encodeURIComponent(id)}/cost-breakdown`, {
    method: "GET",
  });
}

export async function apiGetImobFunnelHealth(params?: {
  workspaceId?: string;
  window?: "7d" | "30d";
}) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.append("workspaceId", params.workspaceId);
  if (params?.window) query.append("window", params.window);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: true; data: ImobFunnelHealth }>(`/imob/command-center/funnel-health${qs}`, {
    method: "GET",
  });
}

export async function apiListImobBlockedRuns(params?: {
  workspaceId?: string;
  status?: string;
  reasonCode?: string;
  minAgeHours?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.append("workspaceId", params.workspaceId);
  if (params?.status) query.append("status", params.status);
  if (params?.reasonCode) query.append("reasonCode", params.reasonCode);
  if (typeof params?.minAgeHours === "number") query.append("minAgeHours", String(params.minAgeHours));
  if (typeof params?.limit === "number") query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: true;
    data: {
      items: Array<{
        runId: string;
        status: string;
        reasonCodes: string[];
        ageHours: number;
        bundleHash: string | null;
        txId: string | null;
        updatedAt: string;
      }>;
      page: { nextCursor: string | null; hasMore: boolean };
      meta: { generatedAt: string; snapshotVersion: string };
    };
  }>(`/imob/command-center/blocked-runs${qs}`, { method: "GET" });
}

export type ImobChatConversation = {
  conversationId: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  lastMessageAt?: string | null;
  lastMessageRole?: "user" | "assistant" | "system" | null;
  lastRunId?: string | null;
  lastTxId?: string | null;
};

export type ImobChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent?: string | null;
  action?: string | null;
  threadId?: string | null;
  threadLabel?: string | null;
  threadStatus?: "active" | "done" | "blocked" | null;
  runId?: string | null;
  txId?: string | null;
  receiptPath?: string | null;
  bundlePath?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type ImobChatThread = {
  threadId: string;
  label: string;
  status: "active" | "done" | "blocked";
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
};

export type ImobContractPreview = {
  contractType: "locacao" | "compra_venda" | "administracao" | "temporada";
  schemaVersion: string;
  legalVersion: string;
  legalBase: string[];
  review: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    warnings: string[];
  };
  hash: string;
  clauses: Array<{
    id: string;
    number: number;
    title: string;
    category: string;
    legalBase: string[];
  }>;
  contractText: string;
  evidence: {
    eventId: string;
    createdAt: string;
  };
};

export type ImobOwner = {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  personType: string;
  status: string;
  pendingItems: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ImobProperty = {
  id: string;
  tenantId: string;
  workspaceId: string;
  ownerId: string | null;
  propertyType: string | null;
  goal: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  garageSpots: number | null;
  askingPriceCents: number | null;
  description: string | null;
  status: string;
  pendingItems: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string } | null;
};

export type ImobLead = {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  goal: string | null;
  targetCity: string | null;
  targetNeighborhood: string | null;
  budgetMaxCents: number | null;
  stage: string;
  temperature: string;
  pendingItems: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ImobCase = {
  id: string;
  tenantId: string;
  workspaceId: string;
  threadId: string | null;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string | null;
  nextStep: string | null;
  blockers: unknown;
  pendingItems: unknown;
  ownerId: string | null;
  propertyId: string | null;
  leadId: string | null;
  externalDealId: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string } | null;
  property?: { id: string; propertyType: string | null; city: string | null; neighborhood: string | null } | null;
  lead?: { id: string; name: string } | null;
  _count?: { events: number };
};

export type ImobContractInterviewState = {
  contractType: "locacao" | "compra_venda" | "administracao" | "temporada" | null;
  currentStep: number;
  answers: Record<string, unknown>;
  status: "collecting" | "review" | "generating" | "generated";
  runId?: string;
  updatedAt: string;
};

export type ImobKnowledgeSearchItem = {
  id: string;
  sourceType: "drive" | "upload" | "web" | "internal_doc";
  title: string;
  href: string;
  mimeType: string;
  region: string;
  segment: "locacao" | "venda" | "ambos";
  documentType: string;
  operationType: string;
  tags: string[];
  updatedAt: string;
  snippet: string;
};

export type ImobSearchSlotState = {
  goal: "locacao" | "venda" | null;
  city: string | null;
  region: string | null;
  neighborhood: string | null;
  budgetMax: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: "apartamento" | "casa" | "studio" | "sala" | "terreno" | "galpao" | null;
};

export type ImobOwnerDraftState = {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerDocument: string | null;
};

export type ImobLeadDraftState = {
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  desiredGoal: "locacao" | "venda" | null;
  desiredCity: string | null;
  budgetMax: number | null;
};

export type ImobPropertyDraftState = {
  propertyId: string | null;
  propertyType: "apartamento" | "casa" | "studio" | "sala" | "terreno" | "galpao" | null;
  goal: "locacao" | "venda" | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
};

export type ImobVisitDraftState = {
  propertyId: string | null;
  visitorName: string | null;
  visitorPhone: string | null;
  preferredDate: string | null;
  preferredWindow: "manha" | "tarde" | "noite" | null;
};

export type ImobListingDraftState = {
  propertyId: string | null;
  listingTitle: string | null;
  publicationChannels: string[];
  askingPrice: number | null;
  publicationGoal: "locacao" | "venda" | null;
};

export type ImobDocumentDraftState = {
  referenceId: string | null;
  subjectType: "owner" | "property" | "lead" | "proposal" | "contract" | null;
  documentTypes: string[];
  deliveryChannel: "upload" | "email" | "whatsapp" | "drive" | null;
};

export type ImobContractDraftState = {
  propertyId: string | null;
  ownerName: string | null;
  counterpartyName: string | null;
  contractType: "rent" | "sale" | "management" | null;
  documentPacketStatus: "pending" | "ready" | null;
  handoffTarget: "LEGAL" | null;
  approvalRequired: boolean;
};

export type ImobDealDraftState = {
  dealId: string | null;
  propertyId: string | null;
  reviewStage: "proposal" | "documentation" | "contract" | "closing" | null;
  blockers: string[];
  handoffTarget: "LEGAL" | "FINANCE" | "IMOB_OPS" | null;
  approvalRequired: boolean;
};

export type ImobCommissionDraftState = {
  dealId: string | null;
  brokerRef: string | null;
  amountCents: number | null;
  settlementStatus: "pending" | "ready" | "paid" | null;
  payoutChannel: "pix" | "ted" | "boleto" | null;
  approvalRequired: boolean;
};

export type ImobProposalDraftState = {
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  propertyId: string | null;
  offerAmount: number | null;
  contractType: "rent" | "sale" | "management" | null;
};

export type ImobOperationalState = {
  flow: "owner.create" | "property.create" | "lead.qualify" | "visit.schedule" | "listing.activate" | "documents.collect" | "proposal.create" | "deal.review" | "contract.prepare" | "commission.settle";
  status: "collecting" | "ready_for_review";
  pendingFields: string[];
  ownerDraft?: ImobOwnerDraftState;
  propertyDraft?: ImobPropertyDraftState;
  leadDraft?: ImobLeadDraftState;
  visitDraft?: ImobVisitDraftState;
  listingDraft?: ImobListingDraftState;
  documentDraft?: ImobDocumentDraftState;
  proposalDraft?: ImobProposalDraftState;
  dealDraft?: ImobDealDraftState;
  contractDraft?: ImobContractDraftState;
  commissionDraft?: ImobCommissionDraftState;
};

export type ImobThreadConversationState = {
  slots: ImobSearchSlotState;
  mode: "consult" | "search" | "execute" | "search_knowledge" | "blocked";
  pendingSlot: "none" | "city" | "budget" | "bedrooms" | "bathrooms" | "propertyType";
  resultOffset: number;
  operational?: ImobOperationalState | null;
};

export type ImobPresentationCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
  action?:
    | "confirm_execution"
    | "reject_execution"
    | "export_contract_pdf"
    | "continue_inventory_search"
    | "apply_attachment_crm_include"
    | "apply_attachment_crm_edit"
    | "apply_attachment_crm_discard"
    | "open_attachment_menu"
    | "send_suggested_message"
    | "print_card";
  nextMessage?: string;
  payload?: Record<string, unknown>;
};

export type ImobPresentationCard = {
  title: string;
  lines: string[];
  ctas?: ImobPresentationCta[];
  actionsLayout?: "inline";
};

export type ImobPresentationFormField = {
  name: string;
  label: string;
  type: "text" | "tel" | "email";
  required?: boolean;
  placeholder?: string;
  value?: string | null;
  helperText?: string;
  allowAttachment?: boolean;
  attachmentLabel?: string;
};

export type ImobPresentationFormAction = {
  id: "cancel" | "submit";
  label: string;
  kind?: "primary" | "secondary" | "neutral";
};

export type ImobPresentationForm = {
  entity: string;
  action: string;
  label: string;
  description?: string;
  subjectId?: string;
  fields: ImobPresentationFormField[];
  actions?: ImobPresentationFormAction[];
};

export type ImobExecutionRequest = {
  intent: "capture" | "match" | "lead" | "visit" | "listing" | "documents" | "proposal" | "deal" | "contract" | "commission" | "adjustment";
  operation:
    | "owner.create"
    | "property.create"
    | "listing.activate"
    | "lead.qualify"
    | "visit.schedule"
    | "documents.collect"
    | "proposal.create"
    | "deal.review"
    | "contract.prepare"
    | "commission.settle"
    | "adjustment.apply";
  action: string;
  prompt: string;
  input: Record<string, unknown>;
};

export type ImobOperationalOwner = "Corretor" | "Jurídico" | "Financeiro" | "Cliente" | "IMOB Ops";

export type ImobCaseContext = {
  caseId: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible?: ImobOperationalOwner | null;
  nextStep?: string | null;
  blocker?: string | null;
  pendingItems?: string[];
  threadId?: string | null;
  updatedAt?: string;
};

export type ImobPresentationConfidence = {
  entity: ImobEntityKey | null;
  source?: "openai" | "parser_fallback";
  action: ImobActionKey | null;
  matchedEntityAlias: string | null;
  matchedActionAlias: string | null;
  entityScore: number;
  actionScore: number;
  pluralityHint: "singular" | "plural" | null;
  canonicalLabel: string | null;
  lowConfidence?: boolean;
};

export type ImobPresentationChoiceStyle = "inline";

export type ImobPresentationMetadata = {
  confidence?: ImobPresentationConfidence;
  choiceStyle?: ImobPresentationChoiceStyle;
};

export type ImobOperationalPresentation = {
  text: string;
  metadata?: ImobPresentationMetadata;
  card?: ImobPresentationCard;
  form?: ImobPresentationForm;
  suggestedNextAction?: string;
  owner?: ImobOperationalOwner;
  nextStep?: string;
  blocker?: string | null;
  pendingFieldLabels?: string[];
  dedupeKey?: string;
};

export type ImobResolveTurnResponse = {
  mode: "consult" | "search" | "execute" | "search_knowledge" | "blocked";
  action: string;
  threadLabel: string;
  conversationState: ImobThreadConversationState;
  presentation: ImobOperationalPresentation;
  executionRequest?: ImobExecutionRequest;
  searchRequest?: {
    query: string;
    region?: string | null;
    segment?: "locacao" | "venda" | "ambos" | null;
    slots?: Partial<ImobSearchSlotState> | null;
    offset?: number;
    limit?: number;
  };
  knowledgeRequest?: {
    query: string;
    filters: {
      region?: string | null;
      segment?: "locacao" | "venda" | "ambos" | null;
      sourceTypes?: Array<"drive" | "upload" | "web" | "internal_doc">;
    };
  };
  entitlements?: {
    REAL_ESTATE_CORE: boolean;
    IMOB_INSTALLED?: boolean;
  };
  caseContext?: ImobCaseContext | null;
};

export type ImobInventorySearchResponse = {
  query: string;
  region: string;
  segment: "locacao" | "venda" | "ambos";
  items: Array<{
    id: string;
    title: string;
    city: string;
    region: string;
    neighborhood?: string;
    segment: "locacao" | "venda";
    priceLabel: string;
    priceAmount?: number | null;
    bedrooms?: number;
    bathrooms?: number;
    propertyType?: string;
  }>;
  total: number;
  offset: number;
  limit: number;
  presentation: {
    text: string;
    card?: ImobPresentationCard;
  };
  tenantId: string;
  workspaceId: string;
  entitlements: {
    REAL_ESTATE_CORE: boolean;
    IMOB_INSTALLED?: boolean;
  };
};

export type ImobKnowledgeSearchResponse = {
  query: string;
  appliedFilters: {
    region?: string | null;
    segment?: "locacao" | "venda" | "ambos" | null;
    documentType?: string | null;
    operationType?: string | null;
    tags?: string[] | null;
    sourceTypes?: Array<"drive" | "upload" | "web" | "internal_doc"> | null;
  };
  total: number;
  items: ImobKnowledgeSearchItem[];
  tenantId: string;
  workspaceId: string;
  entitlements: {
    REAL_ESTATE_CORE: boolean;
    IMOB_INSTALLED?: boolean;
  };
};

export async function apiListImobChatConversations(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: true; items: ImobChatConversation[] }>(`/imob/chat/conversations${qs}`, { method: "GET" });
}

export async function apiCreateImobChatConversation(body?: {
  title?: string;
  metadata?: Record<string, unknown>;
}) {
  return http<{ ok: true; conversation: ImobChatConversation }>(`/imob/chat/conversations`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiListImobChatMessages(conversationId: string, params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: true; items: ImobChatMessage[] }>(`/imob/chat/conversations/${conversationId}/messages${qs}`, {
    method: "GET",
  });
}

export async function apiListImobChatThreads(conversationId: string) {
  return http<{ ok: true; items: ImobChatThread[] }>(
    `/imob/chat/conversations/${conversationId}/threads`,
    { method: "GET" }
  );
}

export async function apiCreateImobChatMessage(
  conversationId: string,
  body: {
    role: "user" | "assistant" | "system";
    content: string;
    intent?: string;
    action?: string;
    threadId?: string;
    threadLabel?: string;
    threadStatus?: "active" | "done" | "blocked";
    runId?: string;
    txId?: string;
    receiptPath?: string;
    bundlePath?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return http<{ ok: true; message: ImobChatMessage }>(`/imob/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGenerateImobContract(body: {
  contractType: "locacao" | "compra_venda" | "administracao" | "temporada";
  answers: Record<string, unknown>;
  conversationId?: string;
  legalVersion?: string;
}) {
  return http<{ ok: true; data: ImobContractPreview }>(`/imob/contracts/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGetImobChatInterviewState(conversationId: string) {
  return http<{
    ok: true;
    state: ImobContractInterviewState | null;
    updatedAt: string | null;
  }>(`/imob/chat/conversations/${conversationId}/interview-state`, {
    method: "GET",
  });
}

export async function apiUpsertImobChatInterviewState(
  conversationId: string,
  body: { state: ImobContractInterviewState }
) {
  return http<{
    ok: true;
    state: ImobContractInterviewState;
    updatedAt: string;
  }>(`/imob/chat/conversations/${conversationId}/interview-state`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiCreateImobChatTelemetry(
  body: {
    conversationId: string;
    event:
      | "message_to_plan_ms"
      | "plan_to_execute_ms"
      | "chat_to_run_link_coverage"
      | "message_persist_success_rate"
      | "ux_interaction";
    value: number;
    metadata?: Record<string, unknown>;
  }
) {
  return http<{ ok: true; telemetry: { id: string; createdAt: string } }>(`/imob/chat/telemetry`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiResolveImobTurn(body: {
  message: string;
  threadLabel?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  threadState?: ImobThreadConversationState | null;
}) {
  return http<{ ok: true; data: ImobResolveTurnResponse }>(`/imob/chat/resolve-turn`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiListImobOwners() {
  return http<{ ok: true; data: { items: ImobOwner[] } }>(`/imob/owners`, {
    method: "GET",
  });
}

export async function apiListImobProperties() {
  return http<{ ok: true; data: { items: ImobProperty[] } }>(`/imob/properties`, {
    method: "GET",
  });
}

export async function apiListImobCases(params?: { flow?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params?.flow) query.append("flow", params.flow);
  if (params?.status) query.append("status", params.status);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: true; data: { items: ImobCase[] } }>(`/imob/cases${qs}`, {
    method: "GET",
  });
}

export async function apiSearchImobInventory(body: {
  query: string;
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  slots?: Partial<ImobSearchSlotState> | null;
  offset?: number;
  limit?: number;
}) {
  return http<{ ok: true; data: ImobInventorySearchResponse }>(`/imob/search/inventory`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiSearchImobKnowledge(body: {
  query: string;
  filters?: {
    region?: string | null;
    segment?: "locacao" | "venda" | "ambos" | null;
    documentType?: string | null;
    operationType?: string | null;
    tags?: string[];
    sourceTypes?: Array<"drive" | "upload" | "web" | "internal_doc">;
  };
}) {
  return http<{ ok: true; data: ImobKnowledgeSearchResponse }>(`/imob/knowledge/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGetImobChatTelemetrySummary(params?: {
  conversationId?: string;
  windowHours?: number;
}) {
  const query = new URLSearchParams();
  if (params?.conversationId) query.append("conversationId", params.conversationId);
  if (typeof params?.windowHours === "number") query.append("windowHours", String(params.windowHours));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: true;
    data: {
      conversationId: string | null;
      windowHours: number;
      generatedAt: string;
      totals: {
        events: number;
        messageToPlanAvgMs: number | null;
        planToExecuteAvgMs: number | null;
        chatToRunCoveragePct: number;
        persistSuccessRatePct: number;
      };
      metrics: Array<{
        event: string;
        count: number;
        avg: number;
        p95: number;
        min: number;
        max: number;
      }>;
    };
  }>(`/imob/chat/telemetry/summary${qs}`, { method: "GET" });
}

export async function apiGetImobChatConversationExport(conversationId: string) {
  return http<{
    ok: true;
    export: {
      generatedAt: string;
      tenantId: string;
      workspaceId: string;
      conversation: {
        conversationId: string;
        title: string;
        status: string;
        createdAt: string;
        messageCount: number;
      };
      links: {
        runsBase: string;
        ledgerBase: string;
      };
      messages: Array<{
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        intent: string | null;
        action: string | null;
        threadId: string | null;
        threadLabel: string | null;
        threadStatus: "active" | "done" | "blocked" | null;
        runId: string | null;
        txId: string | null;
        receiptPath: string | null;
        bundlePath: string | null;
        createdAt: string;
      }>;
      threads: Array<{
        threadId: string;
        label: string;
        status: "active" | "done" | "blocked";
        firstMessageAt: string;
        lastMessageAt: string;
        messageCount: number;
      }>;
      telemetry: {
        totals: {
          messageToPlanAvgMs: number | null;
          planToExecuteAvgMs: number | null;
          chatToRunCoveragePct: number;
          persistSuccessRatePct: number;
        };
        metrics: Array<{
          event: string;
          count: number;
          avg: number;
          p95: number;
          min: number;
          max: number;
        }>;
      };
      audit: {
        hash: string;
        hashAlgo: "sha256";
      };
    };
  }>(`/imob/chat/conversations/${conversationId}/export`, { method: "GET" });
}

export async function apiApproveRun(id: string, body?: { parentRunId?: string | null }) {
  return http<{ ok: boolean; event: RunEvent }>(`/runs/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiAdoptRecommendation(
  runId: string,
  body: { key?: string; tatica?: string; adopted?: boolean }
) {
  return http<{
    ok: boolean;
    updatedResponse: boolean;
    recommendation: { key: string; adopted: boolean; status: string };
    event: RunEvent;
  }>(`/runs/${runId}/recommendations/adopt`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiRejectRecommendation(
  runId: string,
  body: { key?: string; tatica?: string; reason?: string }
) {
  return http<{
    ok: boolean;
    updatedResponse: boolean;
    recommendation: { key: string; adopted: boolean; status: string };
    event: RunEvent;
  }>(`/runs/${runId}/recommendations/reject`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiSubmitRunFeedback(
  runId: string,
  body: { rating: number; tags?: string[] }
) {
  return http<{ ok: boolean; event: RunEvent }>(`/runs/${runId}/feedback`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiGetGovernanceReport(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: boolean;
    items: Array<{
      id: string;
      runId: string;
      agent: string | null;
      type: string;
      createdAt: string;
      ledgerHash: string | null;
      payload: {
        key: string | null;
        tatica: string | null;
        adopted: boolean | null;
        approvedBy: string | null;
        approvedAt: string | null;
        document?: string | null;
        runIds?: string[] | null;
      };
    }>;
  }>(`/governance/report${qs}`, { method: "GET" });
}

export async function apiFinalizeConversation(
  runId: string,
  body: { document: string; runIds?: string[]; policySnapshot?: Record<string, unknown> }
) {
  return http<{ ok: boolean; event: RunEvent }>(`/runs/${runId}/conversation/finalize`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiCreateRun(body: {
  agent: string;
  prompt: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiCreateRunWithHeaders(body);
}

export async function apiCreateRunWithHeaders(
  body: CreateRunBody,
  headers?: HeadersInit
) {
  const payload: Record<string, unknown> = {
    agent: body.agent,
    prompt: body.prompt,
    metadata: body.metadata,
  };

  if (body.workspaceId) {
    payload.projectId = body.workspaceId;
  }

  return http<{
    ok: boolean;
    data: Run;
    warnings?: Array<{
      code: string;
      message: string;
      details?: unknown;
    }>;
  }>(`/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers,
  });
}

/** Billing */
export async function apiEstimateCost(body: {
  agent: string;
  inputBytes: number;
  tools?: string[];
  workspaceId: string;
}) {
  const payload = {
    agent: body.agent,
    inputBytes: body.inputBytes,
    tools: body.tools,
    projectId: body.workspaceId,
  };

  return http<{
    ok: boolean;
    data: { estimateCents: number; currency: string };
  }>(`/billing/estimate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiChargeUsage(body: {
  runId: string;
  workspaceId: string;
  costCents: number;
}) {
  const payload = {
    runId: body.runId,
    costCents: body.costCents,
    projectId: body.workspaceId,
  };

  return http<{ ok: boolean }>(`/billing/charge`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiSettleRealestateCommission(body: {
  runId: string;
  amountCents: number;
  provider?: "stripe" | "crypto" | "bank";
  requestId?: string;
  agentId?: string;
}) {
  return http<{
    ok: boolean;
    data: {
      paymentIntent: unknown;
      settlement: unknown;
      reconciliation: {
        runId: string;
        ledgerEntries: unknown[];
        hasSettlementLedger: boolean;
        duplicateSideEffects: number;
      };
    };
  }>(`/billing/realestate/commission/settle`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGetQuota(workspaceId: string) {
  const qs = `?projectId=${encodeURIComponent(workspaceId)}`;
  return http<{
    ok: boolean;
    data: {
      softLimitCents: number;
      hardLimitCents: number;
      monthUsageCents: number;
      percent: number;
    };
  }>(`/plans/quotas${qs}`, { method: "GET" });
}

export type TenantBillingSummary = {
  tenantId: string;
  cycleStart: string;
  cycleEnd: string;
  account: {
    planCode: string;
    currency: string;
    status: string;
    cycleAnchorDay: number;
  } | null;
  policy: {
    softLimitPct: number;
    hardLimitPct: number;
    monthlyRunsLimit: number | null;
    monthlyCostCentsLimit: number | null;
  } | null;
  plan: {
    code: "solo" | "starter" | "growth" | "scale";
    label: string;
    basePriceCents: number;
    includedUsers: number;
    includedRuns: number;
    includedWorkspaces: number;
    overageRunCents: number;
    extraUserCents: number;
  };
  entitlements: {
    usersActive: number;
    usersOverage: number;
    userOverageCents: number;
    runsIncludedEffective: number;
    runOverage: number;
    runOverageCents: number;
    estimatedInvoiceCents: number;
  };
  totals: {
    runs: number;
    costCents: number;
    currency: string;
  };
  usage: {
    runs: number;
    costCents: number;
    tokens: number;
    storageMb: number;
    updatedAt: string;
  } | null;
  byWorkspace: Array<{
    workspaceId: string;
    workspaceName: string;
    runs: number;
    costCents: number;
  }>;
};

export type BillingPricingQuotePlan = {
  code: "solo" | "starter" | "growth" | "scale";
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  overageRunCents: number;
  extraUserCents: number;
  totalCents: number;
  runOverage: number;
  userOverage: number;
  runOverageCents: number;
  userOverageCents: number;
};

export type BillingPricingQuote = {
  tenantId: string;
  inputs: {
    users: number;
    runs: number;
  };
  formula: string;
  plans: BillingPricingQuotePlan[];
  options: {
    economica: {
      track: "economica";
      candidates: BillingPricingQuotePlan[];
      recommended: BillingPricingQuotePlan | null;
    };
    equilibrio: {
      track: "equilibrio";
      candidates: BillingPricingQuotePlan[];
      recommended: BillingPricingQuotePlan | null;
    };
    escala: {
      track: "escala";
      candidates: BillingPricingQuotePlan[];
      recommended: BillingPricingQuotePlan | null;
      enterprise: {
        code: "enterprise";
        label: string;
        custom: true;
        note: string;
      };
    };
  };
};

export type EiahHelpQueryHit = {
  key: string;
  docId?: string;
  title: string;
  sourcePath: string;
  score: number;
  snippet: string;
  tags?: string[];
  track?: "P0" | "P1" | "P2" | "P3" | "P4";
  status?: "evidenciado" | "parcial" | "proposta" | "canonica";
  sourceFiles?: string[];
};

export type EiahHelpQueryResult = {
  seededNow: boolean;
  indexedDocs: number;
  indexedChunks: number;
  hits: EiahHelpQueryHit[];
  sourcesUsed?: string[];
  docIdsUsed?: string[];
  responseStatus?: "evidenciado" | "parcial" | "proposta" | "canonica";
};

export type TenantBillingWorkspaceItem = {
  workspaceId: string;
  workspaceName: string;
  isActiveWorkspace: boolean;
  grant: {
    enabled: boolean;
    localRunLimit: number | null;
    localCostCentsLimit: number | null;
    updatedAt: string;
  } | null;
  usage: {
    runs: number;
    costCents: number;
  };
};

export type WorkspaceAgentAssignmentItem = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion: string;
  enabled: boolean;
  signedAt: string | null;
  signatureRef: string | null;
};

export type TenantBillingLedgerItem = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  runId: string | null;
  entryType: string;
  amountCents: number;
  currency: string;
  description: string | null;
  requestId: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
};

export type AgentBillingSummaryItem = {
  agent: string;
  agentVersion?: string | null;
  runs: number;
  costCents: number;
  tokens: number;
  byModel?: Array<{
    provider: string;
    model: string;
    runs: number;
    costCents: number;
    tokens: number;
  }>;
};

export type BillingReconciliationRunGap = {
  runId: string;
  workspaceId: string;
  agent: string;
  traceId: string | null;
  runCostCents: number;
  breakdownCostCents: number;
  ledgerCostCents: number;
  issue: "missing_breakdown" | "missing_ledger" | "run_vs_breakdown_mismatch" | "breakdown_vs_ledger_mismatch";
};

export type BillingReconciliationDuplicateCharge = {
  runId: string | null;
  workspaceId: string | null;
  requestId: string | null;
  count: number;
  amountCents: number;
};

export type BillingReconciliationOrphanUsage = {
  runId: string;
  workspaceId: string;
  requestId: string;
  meterType: string;
  amountCents: number;
};

export type BillingReconciliationLedgerGap = {
  ledgerId: string;
  runId: string | null;
  workspaceId: string | null;
  requestId: string | null;
  amountCents: number;
  issue: "missing_workspace" | "ledger_without_run";
};

export type BillingReconciliationSummary = {
  filters: {
    tenantId: string;
    workspaceId: string | null;
    runId: string | null;
    agent: string | null;
    from: string | null;
    to: string | null;
    limit: number;
  };
  totals: {
    runsChecked: number;
    breakdownRows: number;
    ledgerRows: number;
    auditGapCount: number;
    orphanUsageCount: number;
    duplicateChargesCount: number;
    ledgerGapCount: number;
    missingBreakdownCount: number;
    missingLedgerCount: number;
    costMismatchCount: number;
  };
  items: {
    auditGaps: BillingReconciliationRunGap[];
    orphanUsage: BillingReconciliationOrphanUsage[];
    duplicateCharges: BillingReconciliationDuplicateCharge[];
    ledgerGaps: BillingReconciliationLedgerGap[];
  };
};

export async function apiGetTenantBillingSummary(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; data: TenantBillingSummary }>(`/billing/tenant/summary${qs}`, {
    method: "GET",
  });
}

export async function apiGetAgentBillingSummary(params?: {
  workspaceId?: string;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.set("workspaceId", params.workspaceId);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: boolean;
    data: {
      tenantId: string;
      workspaceId: string | null;
      cycleStart: string | null;
      cycleEnd: string | null;
      items: AgentBillingSummaryItem[];
    };
  }>(`/billing/agents/summary${qs}`, {
    method: "GET",
  });
}

export async function apiGetBillingPricingQuote(params: { users: number; runs: number }) {
  const query = new URLSearchParams();
  query.set("users", String(params.users));
  query.set("runs", String(params.runs));
  return http<{ ok: boolean; data: BillingPricingQuote }>(`/billing/pricing/quote?${query.toString()}`, {
    method: "GET",
  });
}

export async function apiQueryEiahHelp(params: { query: string; topK?: number }) {
  const query = new URLSearchParams();
  query.set("q", params.query);
  if (typeof params.topK === "number") query.set("topK", String(params.topK));
  return http<{ ok: boolean; data: EiahHelpQueryResult }>(`/help/eiah/query?${query.toString()}`, {
    method: "GET",
  });
}

export async function apiReindexEiahHelp() {
  return http<{ ok: boolean; data: { seeded: boolean; docs: number; chunks: number } }>(`/help/eiah/reindex`, {
    method: "POST",
  });
}

export type HelpdeskSessionCreatePayload = {
  tenantId: string;
  workspaceId: string;
  runId?: string | null;
  intent: "help" | "proposal" | "product_explain" | "unknown";
  confidence: number;
  fallbackReason?: string | null;
  message: string;
  response: string;
  recommendedPlan?: string | null;
  estimatedValue?: number | null;
  metadata?: Record<string, unknown>;
};

export type HelpdeskUxIssueCategory =
  | "clarification_overuse"
  | "generic_fallback"
  | "too_systemic"
  | "natural_request_not_understood"
  | "unnecessary_run_creation"
  | "healthy_or_inconclusive";

export type HelpdeskSessionExport = {
  workspaceId: string;
  generatedAt: string;
  totalSessions: number;
  totalRunGroups: number;
  summary: Record<string, number>;
  rolloutMetrics?: {
    rolloutStageCounts: Record<string, number>;
    chips: {
      avgShownPerTurn: number;
      quickReplyClicks: number;
      quickReplyClickRate: number;
    };
    clarifications: {
      total: number;
      ratePerTurn: number;
    };
    handoff: {
      offered: number;
      eligible: number;
      successfulRate: number;
    };
    proposal: {
      domains: Record<string, number>;
      stages: Record<string, number>;
      contextRecovered: number;
      contextLost: number;
      contextRecoveryRate: number;
      domainMismatch: number;
    };
    abandonment: {
      estimatedThreads: number;
      estimatedRate: number;
    };
    qualitativeReview: {
      needsReview: number;
      healthySamples: number;
    };
  };
  groups: Array<{
    runId: string;
    agent: string | null;
    status: string | null;
    entries: number;
    lastInteractionAt: string | null;
    uxIssueCategory: HelpdeskUxIssueCategory;
    uxIssueLabel: string;
    interactions: Array<{
      id: string;
      runId: string;
      agent: string | null;
      status: string | null;
      intent: string;
      confidence: number;
      fallbackReason: string | null;
      message: string;
      response: string;
      recommendedPlan: string | null;
      estimatedValue: number | null;
      createdAt: string;
      uxIssueCategory: HelpdeskUxIssueCategory;
    }>;
  }>;
  reportText: string;
};

export async function apiCreateHelpdeskSession(payload: HelpdeskSessionCreatePayload) {
  return http<{ ok: boolean; data: { id: string } }>(`/helpdesk/session`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiListHelpdeskSessions(params?: { workspaceId?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.set("workspaceId", params.workspaceId);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; data: HelpdeskSessionExport }>(`/helpdesk/sessions${qs}`, {
    method: "GET",
  });
}

export async function apiGetTenantBillingUsage(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: boolean;
    data: {
      tenantId: string;
      items: Array<{
        id: string;
        tenantId: string;
        cycleStart: string;
        cycleEnd: string;
        runs: number;
        costCents: number;
        tokens: number;
        storageMb: number;
        updatedAt: string;
      }>;
    };
  }>(`/billing/tenant/usage${qs}`, {
    method: "GET",
  });
}

export async function apiGetTenantBillingWorkspaces() {
  return http<{
    ok: boolean;
    data: {
      tenantId: string;
      cycleStart: string;
      cycleEnd: string;
      items: TenantBillingWorkspaceItem[];
    };
  }>(`/billing/tenant/workspaces`, {
    method: "GET",
  });
}

export async function apiGetWorkspaceAgentAssignments(workspaceId: string) {
  return http<{
    ok: boolean;
    data: {
      tenantId: string;
      workspaceId: string;
      workspaceName: string;
      items: WorkspaceAgentAssignmentItem[];
    };
  }>(`/billing/workspaces/${encodeURIComponent(workspaceId)}/agents`, {
    method: "GET",
  });
}

export async function apiPatchTenantWorkspaceGrant(
  workspaceId: string,
  body: {
    enabled?: boolean;
    localRunLimit?: number;
    localCostCentsLimit?: number;
  }
) {
  return http<{ ok: boolean; data: TenantBillingWorkspaceItem["grant"] }>(
    `/billing/tenant/workspaces/${encodeURIComponent(workspaceId)}/grant`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

export async function apiPatchTenantQuotas(body: {
  softLimitPct?: number;
  hardLimitPct?: number;
  monthlyRunsLimit?: number;
  monthlyCostCentsLimit?: number;
}) {
  return http<{
    ok: boolean;
    data: {
      softLimitPct: number;
      hardLimitPct: number;
      monthlyRunsLimit: number | null;
      monthlyCostCentsLimit: number | null;
    };
  }>(`/billing/tenant/quotas`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiGetTenantBillingLedger(params?: {
  from?: string;
  to?: string;
  type?: string;
  workspaceId?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.type) query.set("type", params.type);
  if (params?.workspaceId) query.set("workspaceId", params.workspaceId);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: boolean;
    data: {
      tenantId: string;
      items: TenantBillingLedgerItem[];
    };
  }>(`/billing/tenant/ledger${qs}`, {
    method: "GET",
  });
}

export async function apiGetBillingReconciliationSummary(params?: {
  workspaceId?: string;
  runId?: string;
  agent?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.set("workspaceId", params.workspaceId);
  if (params?.runId) query.set("runId", params.runId);
  if (params?.agent) query.set("agent", params.agent);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{
    ok: boolean;
    data: BillingReconciliationSummary;
  }>(`/billing/reconciliation/summary${qs}`, {
    method: "GET",
  });
}

export async function apiCreateTenantBillingAdjustment(body: {
  amountCents: number;
  workspaceId?: string;
  runId?: string;
  currency?: string;
  description?: string;
  requestId?: string;
  provider?: string;
  model?: string;
}) {
  return http<{
    ok: boolean;
    data: {
      inserted: boolean;
      ledger: TenantBillingLedgerItem;
      usage: {
        runs: number;
        costCents: number;
        tokens: number;
        storageMb: number;
      };
      cycleStart: string;
      cycleEnd: string;
    };
  }>(`/billing/tenant/adjustment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiSimulatePlan(spec: PlanSpec) {
  return http<{
    ok: boolean;
    data: { spec: PlanSpec; needMoreInfo: NeedMoreInfoPayload | null };
  }>(`/plans/simulate`, {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

export async function apiCreatePlan(spec: PlanSpec, options?: { idempotencyKey?: string }) {
  const payload: Record<string, unknown> = { ...spec };
  if (options?.idempotencyKey) {
    payload.idempotencyKey = options.idempotencyKey;
  }

  return http<{
    ok: boolean;
    data: {
      planId: string;
      jobId: string | number | null;
      idempotencyKey: string;
      needsAdditionalInfo: boolean;
    };
  }>(`/plans`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiListRunEvents(runId: string, params?: { cursor?: string | null }) {
  const query = new URLSearchParams();
  if (params?.cursor) query.append("cursor", params.cursor);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ items: RunEvent[] }>(`/runs/${runId}/events${qs}`, {
    method: "GET",
  });
}

export async function apiGetRunGovernance(runId: string) {
  return http<GovernanceSummary>(`/runs/${runId}/governance`, { method: "GET" });
}

export async function apiGetTrustHistory(workspaceId: string, window: "7d" | "30d" = "30d") {
  const qs = new URLSearchParams({ window });
  return http<TrustHistory>(`/workspaces/${workspaceId}/trust-history?${qs.toString()}`, {
    method: "GET",
  });
}

export async function apiCreateWorkspace(body: { name: string }) {
  return http<WorkspaceCreateResponse>("/workspaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiListWorkspaces() {
  return http<WorkspaceListResponse>("/workspaces", { method: "GET" });
}

export async function apiCreateWorkspaceInvitation(body: {
  email: string;
  fullName?: string;
  roleKey: string;
  permissions?: string[];
}) {
  return http<WorkspaceInvitationCreateResponse>("/profile/workspace-members/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGetProfile() {
  return http<ProfileResponse>("/profile/me", { method: "GET" });
}

export async function apiUpdateProfile(body: {
  fullName?: string;
  email?: string;
  phone?: string;
  cep?: string;
  role?: string;
  website?: string;
  city?: string;
  country?: string;
  tenantName?: string;
  workspaceName?: string;
  workspaceRoleKey?: string;
  workspaceRoleOptions?: Array<{
    label: string;
    permissions?: string[];
  }>;
}) {
  return http<ProfileResponse>("/profile/me", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiCreateCalibration(payload: {
  runId: string;
  stepId?: string;
  gate: Gate;
  label: "false_positive" | "false_negative";
  comment?: string;
}) {
  return http<{ ok: boolean }>(`/governance/calibrations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiCreateSession() {
  const token = cachedSession.token;
  if (!token) {
    throw new ApiError(401, "Missing token for session");
  }

  const res = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    let body: unknown;
    if (contentType.includes("application/json")) {
      body = await res.json().catch(() => undefined);
    } else {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  return res.json();
}

export async function apiDeleteSession() {
  const res = await fetch(`${BASE_URL}/session`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => undefined)
      : await res.text().catch(() => undefined);
    throw new ApiError(res.status, res.statusText || "Session delete failed", body);
  }
  return res.json();
}

export async function apiSwitchWorkspaceSession(workspaceId: string) {
  const token = cachedSession.token;
  if (!token) {
    throw new ApiError(401, "Missing token for workspace switch");
  }
  const res = await fetch(`${BASE_URL}/session/workspace`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => undefined)
      : await res.text().catch(() => undefined);
    throw new ApiError(res.status, res.statusText || "Workspace switch failed", body);
  }
  return res.json() as Promise<{
    ok: boolean;
    data?: {
      token: string;
      tenantId: string;
      workspaceId: string;
      userId?: string | null;
    };
    error?: { code?: string; message?: string; details?: unknown };
  }>;
}

export async function apiGetSessionContext(domain?: "core" | "imob") {
  const query = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  return http<SessionContextResponse>(`/session/context${query}`, { method: "GET" });
}
export async function apiUploadDocuments(formData: FormData, agentSlug: string) {
  const qs = new URLSearchParams({ agentSlug });
  return http<{ ok: boolean; data: UploadedDocumentInfo[] }>(`/uploads?${qs.toString()}`, {
    method: "POST",
    body: formData,
  });
}

export async function apiResolveImobAttachment(input: { caseId?: string | null; threadId?: string | null; documentIds: string[] }) {
  return http<{ ok: boolean; data: { resolved: boolean; caseContext?: ImobCaseContext | null; presentation: ImobOperationalPresentation } }>(`/imob/attachments/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiFetchUploadBlob(path: string) {
  const token = cachedSession.token;
  const tenantId = cachedSession.tenantId;
  const workspaceId = cachedSession.workspaceId;
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (tenantId) {
    headers.set("x-eiah-tenant", tenantId);
    headers.set("x-tenant-id", tenantId);
  }
  if (workspaceId) {
    headers.set("x-eiah-workspace", workspaceId);
    headers.set("x-workspace-id", workspaceId);
  }

  const normalizedPath = path.startsWith("/api/") ? path.slice(4) : path;
  const res = await fetch(`${BASE_URL}${normalizedPath}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => undefined)
      : await res.text().catch(() => undefined);
    throw new ApiError(res.status, res.statusText || "Upload fetch failed", body);
  }

  return {
    blob: await res.blob(),
    contentType: res.headers.get("content-type") ?? undefined,
  };
}

export async function apiApplyImobAttachmentCrmSuggestion(input: {
  caseId?: string | null;
  threadId?: string | null;
  documentIds: string[];
  mode: "include" | "edit" | "discard";
}) {
  return http<{
    ok: boolean;
    data: {
      applied: boolean;
      caseContext?: ImobCaseContext | null;
      presentation: ImobOperationalPresentation;
    };
  }>(`/imob/attachments/crm-suggestion`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiReplayRun(id: string) {
  const res = await fetch(`/api/runs/${id}/replay`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Replay failed: ${res.status}`);
  }
  return res.json();
}
