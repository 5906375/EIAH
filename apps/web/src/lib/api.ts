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
  agent: string;
  status: RunStatus;
  request?: unknown;
  response?: unknown;
  costCents?: number;
  startedAt?: string;
  finishedAt?: string;
  meta?: { traceId?: string; tookMs?: number };
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

export type DelegationStatus = "pending_approval" | "active" | "rejected" | "revoked";

export type DelegationPolicy = {
  id: string;
  delegatorId: string;
  delegateeId: string;
  marketplaceId?: string | null;
  scope: "read" | "execute" | "admin";
  trustMin: number;
  validUntil: string;
  policyHash: string;
  signatureHash: string;
  status?: DelegationStatus;
  providerSignatureHash?: string | null;
  decidedAt?: string | null;
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
      if (!current.startsWith("/signup")) {
        window.location.assign(`/signup?next=${encodeURIComponent(current)}`);
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
): Promise<{ ok: boolean; delegationId: string; status?: DelegationStatus }> {
  return http(`/marketplace/${id}/subscribe`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
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

export async function apiListDelegations(params?: {
  role?: "delegator" | "delegatee" | "all";
}): Promise<{ items: DelegationPolicy[] }> {
  const query = new URLSearchParams();
  if (params?.role) query.append("role", params.role);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http(`/delegations${qs}`, { method: "GET" });
}

export async function apiApproveDelegation(id: string, body?: { providerSignatureHash?: string }) {
  return http<{ ok: boolean; item: DelegationPolicy }>(`/delegations/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiRejectDelegation(id: string, body?: { providerSignatureHash?: string }) {
  return http<{ ok: boolean; item: DelegationPolicy }>(`/delegations/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
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

  return http<{ ok: boolean; data: Run }>(`/runs`, {
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
