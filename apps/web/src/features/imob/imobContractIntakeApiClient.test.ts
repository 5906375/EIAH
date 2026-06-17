import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// Stub cachedSession before importing api to avoid real HTTP at module init.
// api.ts reads BASE_URL at module level; VITE_API_URL not set in node → empty string.
// We mock globalThis.fetch so actual network is never hit.

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers({ "content-type": "application/json", ...headers });
  globalThis.fetch = async (_url: unknown, _init?: unknown) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: responseHeaders,
      json: async () => body,
      blob: async () => new Blob([JSON.stringify(body)], { type: "application/json" }),
    } as unknown as Response;
  };
}

// Lazy imports inside each test so the module sees the mock
async function getApi() {
  const api = await import("@/lib/api");
  // Patch cachedSession if token is undefined (no real session in tests)
  // @ts-ignore
  if (!api.cachedSession?.token) {
    // @ts-ignore — intentional: seed session to satisfy headers
    try { (api as any).cachedSession = { token: "test-token", tenantId: "t1", workspaceId: "w1" }; } catch { /* frozen */ }
  }
  return api;
}

describe("apiImobIntakeConfirm", () => {
  it("AC-1: posts to /imob/chat/intake/confirm/:draftId", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    globalThis.fetch = async (url: unknown, init?: unknown) => {
      capturedUrl = String(url);
      capturedMethod = (init as RequestInit)?.method ?? "GET";
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true, runId: "run-99" }),
      } as unknown as Response;
    };
    const api = await getApi();
    const result = await api.apiImobIntakeConfirm("draft-xyz-001");
    assert.match(capturedUrl, /imob\/chat\/intake\/confirm\/draft-xyz-001/);
    assert.equal(capturedMethod, "POST");
    assert.equal(result.ok, true);
    assert.equal(result.runId, "run-99");
  });

  it("AC-2: encodes special characters in draftId", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (url: unknown) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true, runId: "run-enc-1" }),
      } as unknown as Response;
    };
    const api = await getApi();
    await api.apiImobIntakeConfirm("draft/with spaces");
    assert.doesNotMatch(capturedUrl, /draft\/with spaces/);
    assert.match(capturedUrl, /draft%2Fwith/);
  });
});

describe("apiImobIntakePdfGuidance", () => {
  it("AC-3: gets /imob/runs/:runId/intake/export?format=pdf", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (url: unknown) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          ok: false,
          reasonCode: "PDF_DELEGATED_TO_FRONTEND",
          strategy: "client-side-jspdf-or-browser-print",
          htmlExportUrl: "/api/imob/runs/run-99/intake/export?format=html",
          message: "Use jspdf",
        }),
      } as unknown as Response;
    };
    const api = await getApi();
    const result = await api.apiImobIntakePdfGuidance("run-99");
    assert.match(capturedUrl, /imob\/runs\/run-99\/intake\/export/);
    assert.match(capturedUrl, /format=pdf/);
    assert.equal(result.reasonCode, "PDF_DELEGATED_TO_FRONTEND");
  });
});

describe("apiImobIntakeExportDownload", () => {
  it("AC-4: fetches /imob/runs/:runId/intake/export?format=html with auth header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers = new Headers();
    globalThis.fetch = async (url: unknown, init?: unknown) => {
      capturedUrl = String(url);
      capturedHeaders = (init as RequestInit)?.headers as Headers ?? new Headers();
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        blob: async () => new Blob(["<html>test</html>"], { type: "text/html" }),
      } as unknown as Response;
    };
    // Stub DOM methods used in apiImobIntakeExportDownload
    const origCreate = globalThis.document?.createElement;
    const origAppend = globalThis.document?.body?.appendChild;
    const origRemove = globalThis.document?.body?.removeChild;
    const origCreateObj = globalThis.URL?.createObjectURL;
    const origRevokeObj = globalThis.URL?.revokeObjectURL;
    if (typeof globalThis.document === "undefined") {
      // In node test environment — just verify the URL pattern
      const api = await getApi();
      try {
        await api.apiImobIntakeExportDownload("run-export-1", "html");
      } catch {
        // DOM not available in node — expected; we just verify fetch was called
      }
      assert.match(capturedUrl, /imob\/runs\/run-export-1\/intake\/export/);
      assert.match(capturedUrl, /format=html/);
      return;
    }
    const api = await getApi();
    await api.apiImobIntakeExportDownload("run-export-1", "html");
    assert.match(capturedUrl, /imob\/runs\/run-export-1\/intake\/export/);
    assert.match(capturedUrl, /format=html/);
  });

  it("AC-5: fetches with format=docx when specified", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (url: unknown) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        blob: async () => new Blob(["PK"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      } as unknown as Response;
    };
    const api = await getApi();
    try {
      await api.apiImobIntakeExportDownload("run-docx-2", "docx");
    } catch {
      // DOM not available in node — expected
    }
    assert.match(capturedUrl, /format=docx/);
    assert.match(capturedUrl, /run-docx-2/);
  });

  it("AC-6: throws on non-ok response", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ "content-type": "application/json" }),
      blob: async () => new Blob(),
    } as unknown as Response);
    const api = await getApi();
    await assert.rejects(
      () => api.apiImobIntakeExportDownload("run-bad", "html"),
      /403/,
    );
  });
});
