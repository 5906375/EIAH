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
  createdAt: string;
  userId?: string | null;
};

export type Agent = {
  id: string;
  name: string;
  description?: string;
  pricing?: { perRunCents?: number; perMBcents?: number };
  profile?: { model: string; systemPrompt: string; tools?: unknown };
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
  if (tenantId && !headers.has("x-tenant-id")) headers.set("x-tenant-id", tenantId);
  if (workspaceId && !headers.has("x-workspace-id")) headers.set("x-workspace-id", workspaceId);

  const requestInit: RequestInit = {
    ...init,
    headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, requestInit);

  if (!res.ok) {
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

export async function apiCreateRun(body: {
  agent: string;
  prompt: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}) {
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

export async function apiListRunEvents(runId: string) {
  return http<{ items: RunEvent[] }>(`/runs/${runId}/events`, {
    method: "GET",
  });
}
export async function apiUploadDocuments(formData: FormData, agentSlug: string) {
  const qs = new URLSearchParams({ agentSlug });
  return http<{ ok: boolean; data: UploadedDocumentInfo[] }>(`/uploads?${qs.toString()}`, {
    method: "POST",
    body: formData,
  });
}




