import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { ApiError, apiCreatePreDuimpContext } from "@/lib/api";
import { buildPreDuimpCreateRequest } from "./preDuimp";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("PRE_DUIMP API client posts the exact envelope through the canonical client", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        ok: true,
        decision: "authorized_shadow",
        action: "log.duimp_context.create",
        mode: "shadow",
        externalTransmissionAllowed: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const request = buildPreDuimpCreateRequest({
    tenantId: "tenant-session",
    workspaceId: "workspace-session",
    recordId: "context-001",
  });
  const response = await apiCreatePreDuimpContext(request);

  assert.match(capturedUrl, /\/logistica\/pre-duimp\/actions$/);
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), request);
  assert.deepEqual(Object.keys(JSON.parse(String(capturedInit?.body))), ["action", "context"]);
  assert.equal(response.decision, "authorized_shadow");
});

test("PRE_DUIMP API client preserves canonical HTTP errors as ApiError", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "PRE_DUIMP_SCOPE_DENIED",
          reasonCode: "PRE_DUIMP_SCOPE_DENIED",
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );

  await assert.rejects(
    () =>
      apiCreatePreDuimpContext(
        buildPreDuimpCreateRequest({
          tenantId: "tenant-session",
          workspaceId: "workspace-session",
          recordId: "context-001",
        }),
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      (error.body as { error?: { reasonCode?: string } }).error?.reasonCode ===
        "PRE_DUIMP_SCOPE_DENIED",
  );
});
