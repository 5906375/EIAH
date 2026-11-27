import { createHash } from "node:crypto";
import { z } from "zod";
import type { AdapterCall, SourceAdapter, SourceAdapterRegistryPort } from "../../services/logistica/oraculo/sourceQuery/types";

/**
 * ADAPTADOR SINTÉTICO — SOMENTE TESTE.
 * Não é um fornecedor, não representa nenhuma fonte real, não faz rede, não lê ambiente e não está registrado em nenhum catálogo.
 * Marcado `synthetic: true`: o serviço o recusa (`ADAPTER_SYNTHETIC_NOT_ALLOWED`) a menos que seja criado com `allowSyntheticAdapters: true`.
 * O comportamento é escolhido pelo parâmetro `code` (4 dígitos) para exercitar cada resultado possível.
 */
export const SYNTHETIC_SOURCE_ID = "synthetic.test-source";
export const SYNTHETIC_OPERATION = "synthetic_lookup";
export const SYNTHETIC_PURPOSE = "synthetic_test";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const canonicalSha256 = (value: unknown) => sha256(canonicalJson(value));

export type SyntheticSourceAdapter = SourceAdapter & { readonly calls: AdapterCall[] };

export function createSyntheticSourceAdapter(): SyntheticSourceAdapter {
  const calls: AdapterCall[] = [];
  const dates = { referenceDate: { status: "known" as const, value: "2026-11-03" }, publishedAt: { status: "unknown" as const }, validFrom: { status: "unknown" as const }, validUntil: { status: "unknown" as const } };
  const original = (code: string) => ({ sha256: sha256(`synthetic-raw:${code}`), byteLength: 32, mediaType: "application/json", storage: { status: "not_preserved" as const } });
  const success = (code: string, extra: Record<string, unknown> = {}, outputSha256?: string) => {
    const records = [{ externalId: { status: "known" as const, value: `SYN-${code}` }, data: { code, label: "synthetic" } }];
    return {
      outcome: "success", records, original: original(code),
      transformation: { transformId: "synthetic.normalizer", transformVersion: "1", inputSha256: sha256(`synthetic-raw:${code}`), outputSha256: outputSha256 ?? canonicalSha256(records), deterministic: true },
      dates, warnings: [], ...extra,
    };
  };
  return {
    calls,
    descriptor: {
      adapterId: "synthetic.test-only.adapter",
      sourceId: SYNTHETIC_SOURCE_ID,
      mode: "open_api",
      publisherStatus: "unknown",
      synthetic: true,
      operations: {
        [SYNTHETIC_OPERATION]: {
          paramsSchema: z.object({ code: z.string().regex(/^\d{4}$/) }).strict(),
          allowedPurposes: [SYNTHETIC_PURPOSE],
          contentSchemaVersion: "synthetic.lookup.v1",
        },
      },
    },
    async execute(call) {
      calls.push(call);
      const code = String((call.params as { code?: unknown }).code);
      switch (code) {
        case "0001": return { outcome: "empty", emptyReason: "no_matching_records", original: original(code), dates, warnings: [] };
        case "0002": return { outcome: "failure", error: { code: "source_unavailable", message: "fonte sintética indisponível", retryable: true }, dates, warnings: [] };
        case "0003": throw new Error("secret-token=abc123 vazou da exceção interna");
        case "0004": return success(code, { suggestedChanges: [{ fieldPath: "context.port", operation: "set", proposedValue: "synthetic-port" }] });
        case "0005": return success(code, {}, "f".repeat(64));
        case "0006": return { garbage: true };
        case "0007": return new Promise(() => undefined);
        case "0008": return success(code, { suggestedChanges: [{ fieldPath: "context.port", operation: "set", proposedValue: "x" }] });
        case "0009": return { outcome: "not_modified", basedOn: { previousResultId: "res-previous", previousContentSha256: "a".repeat(64) }, dates, warnings: [] };
        case "0010": return { outcome: "failure", error: { code: "unauthorized", message: "falhou com api_key=abc123", retryable: false }, dates, warnings: [] };
        default: return success(code);
      }
    },
  };
}

export function syntheticAdapterRegistry(adapter: SourceAdapter): SourceAdapterRegistryPort {
  return { find: (sourceId, mode) => (adapter.descriptor.sourceId === sourceId && adapter.descriptor.mode === mode ? adapter : null) };
}
