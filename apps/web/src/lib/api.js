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
    if (typeof window === "undefined")
        return undefined;
    try {
        const existing = window.localStorage.getItem(PROFILE_GROUP_KEY);
        if (existing && existing.trim())
            return existing;
        const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `pg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(PROFILE_GROUP_KEY, generated);
        return generated;
    }
    catch {
        return undefined;
    }
}
export class ApiError extends Error {
    constructor(status, message, body) {
        super(`HTTP ${status} ${message}`);
        this.status = status;
        this.body = body;
    }
}
async function http(path, init) {
    const tenantId = cachedSession.tenantId;
    const workspaceId = cachedSession.workspaceId;
    const headers = new Headers(init?.headers);
    const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (!bodyIsFormData && init?.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    if (tenantId) {
        if (!headers.has("x-eiah-tenant"))
            headers.set("x-eiah-tenant", tenantId);
        if (!headers.has("x-tenant-id"))
            headers.set("x-tenant-id", tenantId);
    }
    if (workspaceId) {
        if (!headers.has("x-eiah-workspace"))
            headers.set("x-eiah-workspace", workspaceId);
        if (!headers.has("x-workspace-id"))
            headers.set("x-workspace-id", workspaceId);
    }
    const profileGroupId = getProfileGroupId();
    if (profileGroupId && !headers.has("x-profile-group")) {
        headers.set("x-profile-group", profileGroupId);
    }
    const requestInit = {
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
        let body;
        if (contentType.includes("application/json")) {
            body = await res.json().catch(() => undefined);
        }
        else {
            body = await res.text().catch(() => "");
        }
        let message = res.statusText || "Request failed";
        if (body && typeof body === "object") {
            const payload = body;
            const errorContent = payload.error;
            if (typeof errorContent === "string") {
                message = errorContent;
            }
            else if (errorContent &&
                typeof errorContent === "object" &&
                typeof errorContent.message === "string") {
                message = errorContent.message;
            }
        }
        else if (typeof body === "string" && body.trim().length > 0) {
            message = body.trim();
        }
        throw new ApiError(res.status, message, body);
    }
    if (res.status === 204) {
        return undefined;
    }
    return res.json();
}
/** Agents */
export async function apiListAgents() {
    return http(`/agents`, { method: "GET" });
}
/** Runs */
export async function apiListRuns(params) {
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
    return http(`/runs${qs}`, { method: "GET" });
}
export async function apiGetRun(id) {
    return http(`/runs/${id}`, { method: "GET" });
}
export async function apiCreateRun(body) {
    const payload = {
        agent: body.agent,
        prompt: body.prompt,
        metadata: body.metadata,
    };
    if (body.workspaceId) {
        payload.projectId = body.workspaceId;
    }
    return http(`/runs`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
/** Billing */
export async function apiEstimateCost(body) {
    const payload = {
        agent: body.agent,
        inputBytes: body.inputBytes,
        tools: body.tools,
        projectId: body.workspaceId,
    };
    return http(`/billing/estimate`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
export async function apiChargeUsage(body) {
    const payload = {
        runId: body.runId,
        costCents: body.costCents,
        projectId: body.workspaceId,
    };
    return http(`/billing/charge`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
export async function apiGetQuota(workspaceId) {
    const qs = `?projectId=${encodeURIComponent(workspaceId)}`;
    return http(`/plans/quotas${qs}`, { method: "GET" });
}
export async function apiSimulatePlan(spec) {
    return http(`/plans/simulate`, {
        method: "POST",
        body: JSON.stringify(spec),
    });
}
export async function apiCreatePlan(spec, options) {
    const payload = { ...spec };
    if (options?.idempotencyKey) {
        payload.idempotencyKey = options.idempotencyKey;
    }
    return http(`/plans`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
export async function apiListRunEvents(runId, params) {
    const query = new URLSearchParams();
    if (params?.cursor) query.append("cursor", params.cursor);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return http(`/runs/${runId}/events${qs}`, {
        method: "GET",
    });
}
export async function apiUploadDocuments(formData, agentSlug) {
    const qs = new URLSearchParams({ agentSlug });
    return http(`/uploads?${qs.toString()}`, {
        method: "POST",
        body: formData,
    });
}
