// Cliente minimalista com tipos e helpers.
// Ajuste BASE_URL e a forma de obter token/header do projeto.

import { getSession, subscribeSession } from "@/state/sessionStore";

export const BASE_URL = import.meta.env.VITE_API_URL || "https://dev.api.eiah.ai/api";

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
  error?: { code?: string; message?: string; details?: unknown };
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

export type ImobContractInterviewState = {
  contractType: "locacao" | "compra_venda" | "administracao" | "temporada" | null;
  currentStep: number;
  answers: Record<string, unknown>;
  status: "collecting" | "review" | "generating" | "generated";
  runId?: string;
  updatedAt: string;
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
  title: string;
  sourcePath: string;
  score: number;
  snippet: string;
};

export type EiahHelpQueryResult = {
  seededNow: boolean;
  indexedDocs: number;
  indexedChunks: number;
  hits: EiahHelpQueryHit[];
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

export async function apiGetTenantBillingSummary(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; data: TenantBillingSummary }>(`/billing/tenant/summary${qs}`, {
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

export async function apiCreateHelpdeskSession(payload: HelpdeskSessionCreatePayload) {
  return http<{ ok: boolean; data: { id: string } }>(`/helpdesk/session`, {
    method: "POST",
    body: JSON.stringify(payload),
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




export async function apiReplayRun(id: string) {
  const res = await fetch(`/api/runs/${id}/replay`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Replay failed: ${res.status}`);
  }
  return res.json();
}
