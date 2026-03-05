import fs from "node:fs";

type JsonObject = Record<string, unknown>;

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

function assertReceiptCanon(payload: JsonObject, strict = false, bundleDoc?: JsonObject | null) {
  const errors: string[] = [];

  const ok = payload.ok;
  if (ok !== true) errors.push("payload.ok must be true");

  const run = (payload.run ?? null) as JsonObject | null;
  const txId = typeof payload.txId === "string" ? payload.txId : null;
  const bundleHash = run && typeof run.bundleHash === "string" ? run.bundleHash : null;
  const runId = run && typeof run.id === "string" ? run.id : null;

  const invariant = (payload.invariant ?? null) as JsonObject | null;
  if (!invariant || invariant.status !== "ok") errors.push("invariant.status must be ok");
  if (!invariant || invariant.txIdToRunId !== true) errors.push("invariant.txIdToRunId must be true");
  if (!invariant || invariant.runIdToBundleHash !== true) errors.push("invariant.runIdToBundleHash must be true");

  const receiptCanon = (payload.receiptCanon ?? null) as JsonObject | null;
  if (!receiptCanon) errors.push("receiptCanon missing");
  if (receiptCanon?.specVersion !== "receipt.canon.v1") errors.push("receiptCanon.specVersion must be receipt.canon.v1");

  const receipts = Array.isArray(receiptCanon?.receipts) ? (receiptCanon?.receipts as JsonObject[]) : [];
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

  const txLink = receipts.find((item) => item.receiptType === "TxLinkReceipt") ?? null;
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
  }

  for (const receipt of receipts) {
    if (typeof receipt.runId !== "string") errors.push(`${String(receipt.receiptType)}.runId missing`);
    if (typeof receipt.timestamp !== "string") errors.push(`${String(receipt.receiptType)}.timestamp missing`);
    if (typeof receipt.hash !== "string") errors.push(`${String(receipt.receiptType)}.hash missing`);
    if (!receipt.actor || typeof receipt.actor !== "object") errors.push(`${String(receipt.receiptType)}.actor missing`);
    if (!receipt.policy || typeof receipt.policy !== "object") errors.push(`${String(receipt.receiptType)}.policy missing`);
  }

  if (strict) {
    for (const receipt of receipts) {
      if (Array.isArray(receipt.reasonCodes) && receipt.reasonCodes.length > 0) {
        const invalid = (receipt.reasonCodes as unknown[]).some((code) => typeof code !== "string");
        if (invalid) errors.push(`${String(receipt.receiptType)}.reasonCodes has non-string values`);
      }
    }
  }

  if (errors.length > 0) {
    fail("receipt_canon_verification_failed", {
      errors,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        verified: {
          txId,
          runId,
          bundleHash,
          requiredReceipts,
          receiptCount: receipts.length,
        },
      },
      null,
      2
    )
  );
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
  if (!response.ok) {
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
        "node --experimental-strip-types scripts/verify-receipt-canon.ts --ledger ops/evidence/latest/ledger.json --strict",
        "node --experimental-strip-types scripts/verify-receipt-canon.ts --url http://localhost:8080/api/ledger/<txId> --token <bearer> --strict",
      ],
    });
  }

  const payload = ledgerFile
    ? readJsonFile(ledgerFile)
    : await fetchLedger(url!, args.get("token"), args.get("tenant"), args.get("workspace"));

  const bundleDoc = bundleFile ? readJsonFile(bundleFile) : null;
  assertReceiptCanon(payload, strict, bundleDoc);
}

void main();
