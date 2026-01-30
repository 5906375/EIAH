import crypto from "node:crypto";
import { prismaGlobal } from "@repo/db";
import { recordGuardrailAudit, recordGuardrailLedger } from "../services/guardrailLedgerStore";
import { SignerManager } from "../security/signerManager";
import { normalizeAndMaskResponse, type JsonValue } from "./dataAdapter";

export type LegacyApiProtocol = "rest" | "graphql" | "soap";

export type LegacyApiCallParams = {
  tenantId: string;
  workspaceId: string;
  system: string;
  protocol: LegacyApiProtocol;
  runId?: string | null;
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export type LegacyApiCallResult = {
  ok: boolean;
  status: number;
  masked: JsonValue | string | null;
  rawText?: string;
  requestHash: string;
  responseHash: string;
  signature?: { signature: string; algorithm: string; keyId: string } | null;
};

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function normalizeHeaders(headers?: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export async function callLegacyApi(params: LegacyApiCallParams): Promise<LegacyApiCallResult> {
  const timeoutMs = params.timeoutMs ?? 8_000;
  const method = (params.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(params.headers);

  const requestDescriptor = {
    v: 1,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    system: params.system,
    protocol: params.protocol,
    method,
    url: params.url,
    headers: Object.keys(headers).sort().reduce<Record<string, string>>((acc, key) => {
      acc[key] = headers[key]!;
      return acc;
    }, {}),
    body: params.body ?? null,
  };

  const requestHash = sha256Hex(stableJson(requestDescriptor));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();

  try {
    const requestBody = (() => {
      if (params.protocol === "graphql") {
        if (isPlainObject(params.body) && typeof params.body.query === "string") {
          return JSON.stringify(params.body);
        }
        return JSON.stringify({ query: String(params.body ?? ""), variables: null });
      }
      if (params.protocol === "soap") {
        return typeof params.body === "string" ? params.body : String(params.body ?? "");
      }
      return params.body === undefined ? undefined : JSON.stringify(params.body);
    })();

    const contentType =
      params.protocol === "soap"
        ? "text/xml"
        : params.protocol === "graphql"
          ? "application/json"
          : requestBody
            ? "application/json"
            : undefined;

    const finalHeaders: Record<string, string> = {
      ...headers,
    };
    if (contentType && !finalHeaders["content-type"]) {
      finalHeaders["content-type"] = contentType;
    }

    const response = await fetch(params.url, {
      method,
      headers: finalHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => "");
    const responseHash = sha256Hex(rawText);

    const masked: JsonValue | string | null = (() => {
      if (!rawText) return null;
      try {
        const parsed = JSON.parse(rawText);
        return normalizeAndMaskResponse(parsed);
      } catch {
        return normalizeAndMaskResponse(rawText) as string;
      }
    })();

    let signature: LegacyApiCallResult["signature"] = null;
    try {
      const signer = SignerManager.fromEnv();
      const signed = await signer.signCriticalHash({
        hashHex: sha256Hex(
          stableJson({
            v: 1,
            requestHash,
            responseHash,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            system: params.system,
          })
        ),
        context: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          runId: params.runId ?? undefined,
          actionHash: requestHash,
          tenantHash: sha256Hex(params.tenantId),
          nonce: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          riskLevel: "medium",
        },
      });
      signature = {
        signature: signed.signature,
        algorithm: signed.algorithm,
        keyId: signed.keyId,
      };
    } catch {
      signature = null;
    }

    const idempotencyKey = `legacy_api_call:${params.system}:${params.workspaceId}:${requestHash}:${responseHash}`;

    await recordGuardrailLedger({
      prisma: prismaGlobal,
      tenantId: params.tenantId,
      actionType: "legacy_api_call",
      idempotencyKey,
      usageCount: 1,
    }).catch(() => undefined);

    await recordGuardrailAudit({
      prisma: prismaGlobal,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "legacy_api_call",
      severity: response.ok ? "info" : "warn",
      message: response.ok ? "Legacy API call succeeded" : `Legacy API call failed (${response.status})`,
      metadata: {
        system: params.system,
        protocol: params.protocol,
        method,
        url: params.url,
        tookMs: Date.now() - startedAt,
        requestHash,
        responseHash,
        status: response.status,
        ok: response.ok,
        signature,
      },
    }).catch(() => undefined);

    return {
      ok: response.ok,
      status: response.status,
      masked,
      rawText,
      requestHash,
      responseHash,
      signature,
    };
  } finally {
    clearTimeout(timer);
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
