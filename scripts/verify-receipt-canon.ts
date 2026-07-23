import fs from "node:fs";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

export type ReceiptCanonVerification = {
  ok: boolean;
  state: "real" | "blocked" | "historical_simulated" | "unknown";
  errors: string[];
  verified: {
    txId: string | null;
    runId: string | null;
    bundleHash: string | null;
    requiredReceipts: string[];
    receiptCount: number;
    reasonCodes: string[];
  };
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    args.set(key, value);
    if (value !== "true") index += 1;
  }
  return args;
}

function fail(message: string, details?: JsonObject): never {
  console.error(JSON.stringify({ ok: false, message, details }, null, 2));
  process.exit(1);
}

function readJsonFile(file: string): JsonObject {
  if (!fs.existsSync(file)) {
    fail("ledger_file_not_found", { file });
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as JsonObject;
  } catch (error) {
    fail("ledger_file_invalid_json", { file, error: error instanceof Error ? error.message : String(error) });
  }
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function verifyReceiptCanonPayload(
  payload: JsonObject,
  strict = false,
  bundleDoc?: JsonObject | null
): ReceiptCanonVerification {
  const errors: string[] = [];
  const run = asObject(payload.run);
  const txId = typeof payload.txId === "string" ? payload.txId : null;
  const runId =
    run && typeof run.id === "string"
      ? run.id
      : typeof payload.runId === "string"
        ? payload.runId
        : null;

  const invariant = asObject(payload.invariant);
  if (!invariant || invariant.status !== "ok") errors.push("invariant.status must be ok");
  if (!invariant || invariant.txIdToRunId !== true) errors.push("invariant.txIdToRunId must be true");
  if (!invariant || invariant.runIdToBundleHash !== true) errors.push("invariant.runIdToBundleHash must be true");

  const receiptCanon = asObject(payload.receiptCanon);
  if (!receiptCanon) errors.push("receiptCanon missing");
  if (receiptCanon?.specVersion !== "receipt.canon.v1") {
    errors.push("receiptCanon.specVersion must be receipt.canon.v1");
  }

  const receipts = Array.isArray(receiptCanon?.receipts) ? (receiptCanon.receipts as JsonObject[]) : [];
  const requiredReceipts = [
    "PoUReceipt",
    "TrustSnapshotReceipt",
    "ApprovalReceipt",
    "DelegationReceipt",
    "TxLinkReceipt",
  ];
  for (const receiptType of requiredReceipts) {
    if (!receipts.some((item) => item.receiptType === receiptType)) {
      errors.push(`missing required receipt: ${receiptType}`);
    }
  }

  const executionReceipt = receipts.find((item) => item.receiptType === "ExecutionStateReceipt") ?? null;
  const state =
    executionReceipt?.state === "real" ||
    executionReceipt?.state === "blocked" ||
    executionReceipt?.state === "historical_simulated"
      ? executionReceipt.state
      : "unknown";
  const executionReasonCodes = stringArray(executionReceipt?.reasonCodes);

  if (state === "unknown") {
    if (payload.ok !== true) {
      errors.push("blocked or simulated evidence requires ExecutionStateReceipt");
    }
  } else if (state === "real") {
    if (payload.ok !== true) errors.push("real execution requires payload.ok=true");
    if (executionReasonCodes.length > 0) errors.push("real execution must not carry execution reasonCodes");
  } else if (state === "blocked") {
    if (payload.ok !== false) errors.push("blocked execution requires payload.ok=false");
    if (executionReasonCodes.length === 0) errors.push("blocked execution requires an explicit reasonCode");
    const responseReasonCodes = stringArray(asObject(payload.error)?.reasonCodes);
    for (const reasonCode of executionReasonCodes) {
      if (!responseReasonCodes.includes(reasonCode)) {
        errors.push(`blocked reasonCode not exposed by response: ${reasonCode}`);
      }
    }
  } else {
    errors.push("SIMULATED_OUTPUT_IN_CRITICAL_CHAIN");
  }

  const txLink = receipts.find((item) => item.receiptType === "TxLinkReceipt") ?? null;
  const bundleHash =
    run && typeof run.bundleHash === "string"
      ? run.bundleHash
      : txLink && typeof txLink.bundleHash === "string"
        ? txLink.bundleHash
        : null;
  if (!txLink) {
    errors.push("TxLinkReceipt missing");
  } else {
    if (txId && txLink.txId !== txId) errors.push("TxLinkReceipt.txId mismatch");
    if (runId && txLink.runId !== runId) errors.push("TxLinkReceipt.runId mismatch");
    if (bundleHash && txLink.bundleHash !== bundleHash) errors.push("TxLinkReceipt.bundleHash mismatch");
  }

  if (bundleDoc && bundleHash) {
    const bundleDocHash = typeof bundleDoc.bundleHash === "string" ? bundleDoc.bundleHash : null;
    if (!bundleDocHash) {
      errors.push("bundle document missing bundleHash");
    } else if (bundleDocHash !== bundleHash) {
      errors.push("bundleHash mismatch between ledger and bundle document");
    }
    const files = asObject(bundleDoc.files);
    const manifest = asObject(bundleDoc.manifest) ?? asObject(files?.["manifest.json"]);
    const bundleExecution = asObject(manifest?.execution);
    if (!bundleExecution && state !== "unknown") {
      errors.push("bundle manifest execution marker missing");
    } else if (bundleExecution) {
      if (bundleExecution.state !== state) errors.push("execution state mismatch between receipt and bundle");
      const bundleReasonCodes = stringArray(bundleExecution.reasonCodes);
      for (const reasonCode of executionReasonCodes) {
        if (!bundleReasonCodes.includes(reasonCode)) {
          errors.push(`execution reasonCode missing from bundle manifest: ${reasonCode}`);
        }
      }
    }
  }

  for (const receipt of receipts) {
    if (typeof receipt.runId !== "string") errors.push(`${String(receipt.receiptType)}.runId missing`);
    if (typeof receipt.timestamp !== "string") errors.push(`${String(receipt.receiptType)}.timestamp missing`);
    if (typeof receipt.hash !== "string") errors.push(`${String(receipt.receiptType)}.hash missing`);
    if (!asObject(receipt.actor)) errors.push(`${String(receipt.receiptType)}.actor missing`);
    if (!asObject(receipt.policy)) errors.push(`${String(receipt.receiptType)}.policy missing`);
  }

  if (strict) {
    for (const receipt of receipts) {
      if (Array.isArray(receipt.reasonCodes)) {
        const invalid = (receipt.reasonCodes as unknown[]).some((code) => typeof code !== "string");
        if (invalid) errors.push(`${String(receipt.receiptType)}.reasonCodes has non-string values`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    state,
    errors,
    verified: {
      txId,
      runId,
      bundleHash,
      requiredReceipts,
      receiptCount: receipts.length,
      reasonCodes: executionReasonCodes,
    },
  };
}

async function fetchLedger(url: string, token?: string, tenant?: string, workspace?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers["x-eiah-tenant"] = tenant;
  if (workspace) headers["x-eiah-workspace"] = workspace;

  const response = await fetch(url, { headers });
  const text = await response.text();
  let json: JsonObject | null = null;
  try {
    json = JSON.parse(text) as JsonObject;
  } catch {
    fail("ledger_response_not_json", { status: response.status, bodyPreview: text.slice(0, 200) });
  }
  const governedFailure =
    response.status === 409 &&
    asObject(json?.error)?.code === "RECEIPT_CANON_INCONSISTENT" &&
    Boolean(json?.receiptCanon);
  if (!response.ok && !governedFailure) {
    fail("ledger_request_failed", { status: response.status, body: json });
  }
  return json as JsonObject;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const strict = args.get("strict") === "true";
  const ledgerFile = args.get("ledger");
  const bundleFile = args.get("bundle");
  const url = args.get("url");

  if (!ledgerFile && !url) {
    fail("usage", {
      examples: [
        "node --import tsx scripts/verify-receipt-canon.ts --ledger ops/evidence/latest/ledger.json --strict",
        "node --import tsx scripts/verify-receipt-canon.ts --url http://localhost:8080/api/ledger/<txId> --token <bearer> --strict",
      ],
    });
  }

  const payload = ledgerFile
    ? readJsonFile(ledgerFile)
    : await fetchLedger(url!, args.get("token"), args.get("tenant"), args.get("workspace"));
  const bundleDoc = bundleFile ? readJsonFile(bundleFile) : null;
  const verification = verifyReceiptCanonPayload(payload, strict, bundleDoc);
  if (!verification.ok) {
    fail("receipt_canon_verification_failed", { errors: verification.errors, state: verification.state });
  }
  console.log(JSON.stringify(verification, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void main();
}
