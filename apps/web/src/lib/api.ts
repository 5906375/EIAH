// Cliente minimalista com tipos e helpers.
// Ajuste BASE_URL e a forma de obter token/header do projeto.

import { clearSession, getSession, subscribeSession } from "@/state/sessionStore";

export const BASE_URL = import.meta.env.VITE_API_URL || "https://dev.api.eiah.ai/api";
const PROFILE_GROUP_KEY = "eiah_profile_group";

let cachedSession = getSession();
subscribeSession((next) => {
  cachedSession = next;
});

function getProfileGroupId() {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.localStorage.getItem(PROFILE_GROUP_KEY);
    if (existing && existing.trim()) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(PROFILE_GROUP_KEY, generated);
    return generated;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(`HTTP ${status} ${message}`);
    this.status = status;
    this.body = body;
  }
}

export type RunStatus =
  | "pending"
  | "awaiting_approval"
  | "running"
  | "success"
  | "error"
  | "blocked";

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

export type ApprovalDecision = "APPROVED" | "REJECTED";

export type ApprovalRecord = {
  id: string;
  runId: string;
  attempt: number;
  tenantId: string;
  approverId: string;
  decision: ApprovalDecision;
  reason?: string | null;
  policyId?: string | null;
  policyVersion: string;
  requiredMinTrust?: number | null;
  approverTrust: number;
  intentHash: string;
  planHash: string;
  idempotencyKey?: string | null;
  payloadHash: string;
  sclSignature?: string | null;
  createdAt: string;
};

export type PendingApproval = {
  runId: string;
  status: "awaiting_approval";
  reason?: string | null;
  requiredApprovals: number;
  criticality: "low" | "medium" | "high" | "critical" | "unknown";
  createdAt?: string | null;
  requestedBy?: string | null;
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
  proofs?: Array<{
    id: string;
    actionId: string;
    status: string;
    compositeTxId?: string | null;
    trustSnapshot?: unknown;
    createdAt?: string;
    finalizedAt?: string | null;
  }>;
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

export type MembershipStatus =
  | "INVITED"
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "DISABLED";

export type TenantMember = {
  id: string;
  tenantId: string;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  role: "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER";
  status: MembershipStatus;
  customRoleId?: string | null;
  customRoleName?: string | null;
  createdAt?: string;
};

export type CustomRole = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  permissions?: string[];
  createdAt?: string;
};

export type ConnectorInstance = {
  id: string;
  tenantId: string;
  workspaceId: string;
  provider: string;
  allowedResources?: unknown;
  limits?: unknown;
  vaultSecretRef?: string | null;
  status: "DRAFT" | "ACTIVE" | "DISABLED";
  createdAt?: string;
  updatedAt?: string;
};

export type AgentInstall = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "DISABLED";
  createdAt?: string;
  updatedAt?: string;
};

export type UploadedDocumentInfo = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
};

export type UserProfile = {
  id: string;
  groupId: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  cep?: string | null;
  company?: string | null;
  role?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  token?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
  const tenantId = cachedSession.tenantId;
  const workspaceId = cachedSession.workspaceId;

  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!bodyIsFormData && init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (tenantId) {
    if (!headers.has("x-eiah-tenant")) headers.set("x-eiah-tenant", tenantId);
    if (!headers.has("x-tenant-id")) headers.set("x-tenant-id", tenantId);
  }

  if (workspaceId) {
    if (!headers.has("x-eiah-workspace")) headers.set("x-eiah-workspace", workspaceId);
    if (!headers.has("x-workspace-id")) headers.set("x-workspace-id", workspaceId);
  }

  const profileGroupId = getProfileGroupId();
  if (profileGroupId && !headers.has("x-profile-group")) {
    headers.set("x-profile-group", profileGroupId);
  }

  const requestInit: RequestInit = {
    ...init,
    headers,
    credentials: "include",
  };

  const res = await fetch(`${BASE_URL}${path}`, requestInit);

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      clearSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
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

export async function apiListProfiles(): Promise<{ items: UserProfile[] }> {
  return http(`/profiles`, { method: "GET" });
}

export async function apiCreateProfile(payload: Partial<UserProfile>) {
  return http<{ ok: boolean; item?: UserProfile; error?: unknown }>(`/profiles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateProfile(id: string, payload: Partial<UserProfile>) {
  return http<{ ok: boolean; item?: UserProfile; error?: unknown }>(`/profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteProfile(id: string) {
  return http<{ ok: boolean; error?: unknown }>(`/profiles/${id}`, {
    method: "DELETE",
  });
}

export async function apiActivateProfile(id: string) {
  return http<{ ok: boolean; data?: { activeProfileId: string; tenantId: string; workspaceId?: string | null }; error?: unknown }>(
    `/profiles/${id}/activate`,
    { method: "POST" }
  );
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

export async function apiCreateMarketplaceItem(body: {
  type: "agent" | "action";
  name: string;
  version: string;
  description?: string;
  trustScore?: number;
  isPublic?: boolean;
}): Promise<{ ok: boolean; item?: MarketplaceItem; error?: unknown }> {
  return http(`/marketplace`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiListConnectors(workspaceId?: string): Promise<{ items: ConnectorInstance[] }> {
  const target = workspaceId ?? cachedSession.workspaceId;
  return http(`/workspaces/${encodeURIComponent(target)}/connectors`);
}

export async function apiListAgentInstalls(workspaceId?: string): Promise<{ items: AgentInstall[] }> {
  const target = workspaceId ?? cachedSession.workspaceId;
  return http(`/workspaces/${encodeURIComponent(target)}/agent-installs`);
}

export async function apiInstallAgent(
  workspaceId: string,
  body: { agentId: string; version?: string; config?: unknown }
) {
  return http<{ ok: boolean; data?: AgentInstall; error?: unknown }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/agents/install`,
    {
      method: "POST",
      body: JSON.stringify({
        agentId: body.agentId,
        version: body.version ?? "latest",
        config: body.config ?? {},
      }),
    }
  );
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
  password?: string;
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

export async function apiListTenantMembers(tenantId: string): Promise<{ items: TenantMember[] }> {
  return http(`/tenants/${encodeURIComponent(tenantId)}/members`, { method: "GET" });
}

export async function apiInviteTenantMember(
  tenantId: string,
  body: { email: string; role: "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER" }
) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/invite`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function apiUpdateTenantMember(
  tenantId: string,
  memberId: string,
  body: {
    role?: "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER";
    status?: MembershipStatus;
    customRoleId?: string | null;
  }
) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

export async function apiApproveTenantMember(tenantId: string, memberId: string) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}/approve`,
    { method: "POST" }
  );
}

export async function apiRejectTenantMember(tenantId: string, memberId: string) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}/reject`,
    { method: "POST" }
  );
}

export async function apiSuspendTenantMember(tenantId: string, memberId: string) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}/suspend`,
    { method: "POST" }
  );
}

export async function apiActivateTenantMember(tenantId: string, memberId: string) {
  return http<{ ok: boolean; data?: TenantMember; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(memberId)}/activate`,
    { method: "POST" }
  );
}

export async function apiListCustomRoles(tenantId: string): Promise<{ items: CustomRole[] }> {
  return http(`/tenants/${encodeURIComponent(tenantId)}/roles`, { method: "GET" });
}

export async function apiCreateCustomRole(
  tenantId: string,
  body: { name: string; description?: string | null; permissions?: string[] }
) {
  return http<{ ok: boolean; data?: CustomRole; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/roles`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function apiUpdateCustomRole(
  tenantId: string,
  roleId: string,
  body: { name?: string; description?: string | null; permissions?: string[] }
) {
  return http<{ ok: boolean; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/roles/${encodeURIComponent(roleId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

export async function apiDeleteCustomRole(tenantId: string, roleId: string) {
  return http<{ ok: boolean; error?: unknown }>(
    `/tenants/${encodeURIComponent(tenantId)}/roles/${encodeURIComponent(roleId)}`,
    { method: "DELETE" }
  );
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

export async function apiListRunsGlobal(params: {
  agent?: string;
  status?: RunStatus;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  tenantId?: string;
  workspaceId?: string;
}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  });
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ items: Run[]; total: number }>(`/runs/global${qs}`, { method: "GET" });
}

export async function apiGetRun(id: string): Promise<Run> {
  return http<Run>(`/runs/${id}`, { method: "GET" });
}

export async function apiApproveRun(
  id: string,
  body?: {
    parentRunId?: string | null;
    decision?: "APPROVED" | "REJECTED";
    reason?: string | null;
    idempotency_key?: string;
  }
) {
  return http<{
    ok: boolean;
    event: RunEvent;
    decisionReceiptHash?: string;
    runState?: { policy?: string; targetStatus?: RunStatus };
  }>(`/runs/${id}/approve`, {
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

export type GovernanceOverview = {
  ok: boolean;
  intent: {
    runId: string;
    createdAt: string;
    intent: string | null;
    actions: string[];
  } | null;
  judge: {
    total: number;
    flagged: number;
    clean: number;
    avgScore: number | null;
    lastSeen: string | null;
    topFlags: Array<{ flag: string; count: number }>;
  };
};

export async function apiGetGovernanceOverview(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<GovernanceOverview>(`/governance/overview${qs}`, { method: "GET" });
}

export async function apiListPendingApprovals(params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; items: PendingApproval[] }>(
    `/governance/pending-approvals${qs}`,
    { method: "GET" }
  );
}

export type IntegrityReport = {
  ok: boolean;
  summary: {
    checkedGuardrail: number;
    checkedScl: number;
    missingInScl: number;
    missingInGuardrail: number;
    mismatchedTx: number;
    matchRatio: number;
  };
  rows: Array<{
    runId: string;
    actionId: string;
    criticality: "low" | "medium" | "high" | "critical" | "unknown";
    status: "missing_in_scl" | "missing_in_guardrail" | "hash_mismatch";
    lastSeen: string;
    intentHash: string;
    payloadHash: string;
    policyHash: string | null;
    signatureHash: string | null;
    txId: string | null;
  }>;
};

export async function apiGetIntegrityReport(params?: { since?: string; until?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.since) query.append("since", params.since);
  if (params?.until) query.append("until", params.until);
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<IntegrityReport>(`/ledger/integrity/report${qs}`, { method: "GET" });
}

export type CockpitQueueSnapshot = {
  approvals: {
    total: number;
    items: PendingApproval[];
  };
  reconcile: {
    pending: number;
    sample: Array<{
      kind: "missing_in_scl" | "missing_in_guardrail" | "mismatched_tx";
      referenceId: string;
      runId: string | null;
      actionType: string | null;
      txId: string | null;
    }>;
  };
  expiringDelegations: {
    total: number;
    windowDays: number;
    items: Array<{
      id: string;
      delegatorId: string;
      delegateeId: string;
      marketplaceId: string | null;
      scope: string;
      trustMin: number;
      status: string;
      validUntil: string;
      hoursToExpire: number;
    }>;
  };
  whatsappFailures: {
    total: number;
    items: Array<{
      messageId: string;
      to: string;
      status: string;
      sentAt: string;
      updatedAt: string;
    }>;
  };
};

export async function apiGetCockpitQueues(params?: { limit?: number; expiringWindowDays?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", String(params.limit));
  if (params?.expiringWindowDays) query.append("expiringWindowDays", String(params.expiringWindowDays));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; data: CockpitQueueSnapshot }>(`/cockpit/queues${qs}`, {
    method: "GET",
  });
}

export async function apiRealEstateDryRun(body: {
  period: string;
  nth?: number;
  reminderOffset?: number;
  leases: Array<{
    tenantId: string;
    workspaceId: string;
    leaseId: string;
    period: string;
    dueRule?: "BUSINESS_DAY_NTH=6";
    reminderOffsetBusinessDays?: number;
    rentAmount: number;
    condoBaseAmount: number;
    condoAdjustmentAmount?: number;
    evidenceRefs?: string[];
    tenantName?: string;
    tenantEmail?: string;
    tenantDocument?: string;
  }>;
}) {
  return http<{
    ok: boolean;
    policyDecision?: { decision?: string; reason?: string | null; blocked?: boolean; mode?: string };
    preview?: unknown;
    planHash?: string;
    diffHash?: string;
    idempotencyKey?: string | null;
  }>(`/realestate/dry-run`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "idempotency-key": `dryrun_${Date.now()}`,
    },
  });
}

export async function apiRealEstateApplyAdjustment(body: {
  period: string;
  runId: string;
  adjustmentAmount: number;
  lease: {
    tenantId: string;
    workspaceId: string;
    leaseId: string;
    period: string;
    dueRule?: "BUSINESS_DAY_NTH=6";
    reminderOffsetBusinessDays?: number;
    rentAmount: number;
    condoBaseAmount: number;
    condoAdjustmentAmount?: number;
    evidenceRefs?: string[];
    tenantName?: string;
    tenantEmail?: string;
    tenantDocument?: string;
  };
  approval?: {
    approved?: boolean;
    approverId?: string;
    reason?: string;
  };
}) {
  return http<{
    ok: boolean;
    result?: unknown;
    ledger?: { txId?: string; criticalHash?: string };
  }>(`/realestate/apply-adjustment`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "idempotency-key": `re_apply_${Date.now()}`,
    },
  });
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

export async function apiListRunApprovals(runId: string) {
  return http<{ ok: boolean; items: ApprovalRecord[]; currentPlanHash?: string | null }>(
    `/runs/${runId}/approvals`,
    { method: "GET" }
  );
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

export type WorkspaceListItem = {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
};

export async function apiListWorkspaces(params?: { tenantId?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.tenantId) query.append("tenantId", params.tenantId);
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return http<{ ok: boolean; items: WorkspaceListItem[] }>(`/workspaces${qs}`, {
    method: "GET",
  });
}

export type AuthMeResponse = {
  ok: boolean;
  data: {
    role: string;
    roles: string[];
    permissions: string[];
    allowedTenants: string[];
    allowedWorkspaces: string[];
    scope: "global" | "tenant";
    tenantId: string;
    workspaceId: string;
    userId: string | null;
    identityType?: "password" | "wallet" | "api_token";
    activeProfileId?: string | null;
    tenantRole?: string | null;
    membershipStatus?: string | null;
    memberships?: Array<{
      tenantId: string;
      role: string;
      status: string;
    }>;
    profiles?: Array<{
      id: string;
      fullName?: string | null;
      role?: string | null;
      tenantId?: string | null;
      workspaceId?: string | null;
    }>;
  };
};

export async function apiGetAuthMe() {
  const separator = "/auth/me".includes("?") ? "&" : "?";
  return http<AuthMeResponse>(`/auth/me${separator}ts=${Date.now()}`, { method: "GET" });
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
  throw new ApiError(400, "Session token flow deprecated; use /auth/login");
}

export async function apiAuthLogin(payload: { email: string; password: string; profileId?: string | null }) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => undefined)
      : await res.text().catch(() => undefined);
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json();
}

export async function apiAuthLogout() {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => undefined)
      : await res.text().catch(() => undefined);
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json();
}

export async function apiAuthSelectProfile(profileId: string) {
  return http<{ ok: boolean; data?: { tenantId: string; workspaceId: string | null; userId: string } }>(
    `/auth/select-profile`,
    {
      method: "POST",
      body: JSON.stringify({ profileId }),
    }
  );
}

export async function apiAuthSiweNonce(address: string) {
  return http<{ ok: boolean; data: { nonce: string; expiresAt: string } }>(`/auth/siwe/nonce`, {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export async function apiAuthSiweVerify(payload: { message: string; signature: string }) {
  return http<{ ok: boolean; data?: { userId: string; tenantId: string; workspaceId: string | null } }>(
    `/auth/siwe/verify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
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
