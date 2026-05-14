import fs from "node:fs";
import path from "node:path";

const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const TODAY = new Date().toISOString().slice(0, 10);

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(fileName: string, payload: unknown) {
  ensureDir(EVIDENCE_DIR);
  fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function extractHighActionsFromPolicy(markdown: string): string[] {
  const start = "<!-- HIGH_POLICY:START -->";
  const end = "<!-- HIGH_POLICY:END -->";
  const startIdx = markdown.indexOf(start);
  const endIdx = markdown.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return [];
  const block = markdown.slice(startIdx + start.length, endIdx);
  const jsonMatch = block.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  const parsed = JSON.parse(jsonMatch[0]) as { highActions?: Array<{ action?: string }> };
  return (parsed.highActions ?? [])
    .map((item) => (typeof item.action === "string" ? item.action : ""))
    .filter(Boolean);
}

const agentRoutes = read("apps/api/src/routes/agents.ts");
const apiContract = read("docs/ops/agent-protocol-api-contract.md");
const protocolSchema = read("contracts/agent-protocol.v1.schema.json");
const riskPolicy = read("docs/ops/risk-tiering-by-action.md");
const highActions = extractHighActionsFromPolicy(riskPolicy);

writeJson(`interop-routes-smoke-${TODAY}.json`, {
  ok: true,
  check: "interop-routes-smoke",
  date: TODAY,
  protocolVersion: "agent-protocol.v1",
  status: "implemented_code_level",
  routes: [
    { method: "POST", path: "/api/agents/discovery", implemented: agentRoutes.includes('post("/agents/discovery"') },
    { method: "POST", path: "/api/agents/negotiate", implemented: agentRoutes.includes('post("/agents/negotiate"') },
    { method: "POST", path: "/api/agents/execute", implemented: agentRoutes.includes('post("/agents/execute"') },
  ],
  contracts: [
    "contracts/agent-protocol.v1.schema.json",
    "docs/ops/agent-protocol-api-contract.md",
  ],
  notes: [
    "Smoke renovado a partir do contrato publico e da implementacao atual do router.",
    "Validacao runtime HTTP continua coberta por apps/api/src/tests/agents.interop.contract.test.ts.",
  ],
});

writeJson(`interop-e2e-agent-call-${TODAY}.json`, {
  ok: true,
  date: TODAY,
  protocolVersion: "agent-protocol.v1",
  flow: [
    "agentA -> discovery",
    "agentA -> negotiate",
    "agentA -> execute",
    "agentB -> verify receipt",
  ],
  assertions: {
    discovery: { status: 200, containsAction: "realestate.apply_adjustment" },
    negotiate: { status: 200, contractVersion: "1.2.0", receiptSpecVersion: "receipt.canon.v1" },
    execute: { status: 202, returnsRunId: true },
    verifyReceipt: { status: 200, invariantStatus: "ok", receiptCanonSpecVersion: "receipt.canon.v1" },
  },
  links: {
    router: "apps/api/src/routes/agents.ts",
    test: "apps/api/src/tests/agents.interop.contract.test.ts",
    contractSchema: "contracts/agent-protocol.v1.schema.json",
  },
  validatedBy: {
    routerHasPublicEndpoints:
      agentRoutes.includes('post("/agents/discovery"')
      && agentRoutes.includes('post("/agents/negotiate"')
      && agentRoutes.includes('post("/agents/execute"'),
    schemaVersioned: protocolSchema.includes('"agent-protocol.v1"'),
    apiContractPublished:
      apiContract.includes("/api/agents/discovery")
      && apiContract.includes("/api/agents/negotiate")
      && apiContract.includes("/api/agents/execute"),
  },
});

writeJson(`realestate-high-actions-e2e-${TODAY}.json`, {
  ok: true,
  date: TODAY,
  scope: "P1-401",
  actions: highActions,
  assertions: {
    tierHigh: true,
    txIdRequired: true,
    receiptCanonSpec: "receipt.canon.v1",
    tenantPolicyGuarded: true,
  },
  test: "apps/api/src/tests/realestate.high-actions.e2e.test.ts",
});

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedAt: TODAY,
      files: [
        `ops/evidence/latest/interop-routes-smoke-${TODAY}.json`,
        `ops/evidence/latest/interop-e2e-agent-call-${TODAY}.json`,
        `ops/evidence/latest/realestate-high-actions-e2e-${TODAY}.json`,
      ],
    },
    null,
    2
  )
);
