import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toPoUResponseV1 } from "../services/pouResponse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../../../../contracts/pou.v1.schema.json");

function loadSchema() {
  const raw = fs.readFileSync(schemaPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadAjv2020() {
  try {
    const mod = await import("ajv/dist/2020");
    return mod.default;
  } catch {
    return null;
  }
}

describe("PoUResponseV1 contract", () => {
  it("validates canonical payload against pou.v1 JSON Schema", async () => {
    const Ajv2020 = await loadAjv2020();
    if (!Ajv2020) {
      return;
    }
    const schema = loadSchema();
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(schema);

    const payload = toPoUResponseV1({
      record: {
        id: "pou-1",
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        runId: "run-1",
        actionId: "action-1",
        status: "PENDING",
        compositeTxId: "tx-1",
        intentHash: "intent-hash",
        paramsHash: "params-hash",
        signatureHash: "signature-hash",
        resultHash: "result-hash",
        trustSnapshot: { score: 0.91 },
        failureReason: null,
        attestationKeyId: null,
        attestationSignature: null,
        canonicalResultRef: null,
        createdAt: new Date("2026-02-18T10:00:00.000Z"),
        finalizedAt: null,
      },
      anchoring: {
        phase4Dependency: "required",
        status: "anchored",
        strength: "strong",
        consistent: true,
        pointers: {
          runCriticalHash: "critical-hash",
          runSclTxId: "scltx-1",
          runTxId: "tx-1",
        },
        checks: {
          hasRunPointers: true,
          sclFoundByTx: true,
          sclFoundByCriticalHash: true,
          hashConsistent: true,
          txConsistent: true,
          signaturePresent: true,
          guardrailLinked: true,
        },
      },
    });

    const ok = validate(payload);
    expect(ok).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
  });

  it("rejects payload with invalid schemaVersion", async () => {
    const Ajv2020 = await loadAjv2020();
    if (!Ajv2020) {
      return;
    }
    const schema = loadSchema();
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(schema);

    const payload = {
      ok: true,
      schemaVersion: "pou.v0",
      data: {
        id: "pou-1",
      },
    };

    const ok = validate(payload);
    expect(ok).toBe(false);
  });
});
