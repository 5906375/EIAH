import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "ops/contracts/settlement-provider-contract.v1.json");
const routePath = path.join(root, "apps/api/src/routes/billing.ts");
const providersPath = path.join(root, "apps/api/src/services/settlementProviders.ts");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(
    JSON.stringify(
      {
        ok: false,
        check: "check:settlement-contract-drift",
        message,
        ...(details ?? {}),
      },
      null,
      2
    )
  );
  process.exit(1);
}

if (!fs.existsSync(contractPath)) {
  fail("missing settlement contract", { contractPath });
}
if (!fs.existsSync(routePath)) {
  fail("missing billing routes file", { routePath });
}
if (!fs.existsSync(providersPath)) {
  fail("missing settlement provider service", { providersPath });
}

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
  version?: string;
  providers?: string[];
  endpoints?: string[];
};
const routeSource = fs.readFileSync(routePath, "utf8");
const providerSource = fs.readFileSync(providersPath, "utf8");

if (contract.version !== "1.0.0") {
  fail("unsupported settlement contract version", { expected: "1.0.0", got: contract.version });
}

const expectedProviders = new Set(contract.providers ?? []);
const declaredProvidersMatch = providerSource.match(/SETTLEMENT_PROVIDER_IDS\s*=\s*\[(.*?)\]\s*as const/s);
if (!declaredProvidersMatch) {
  fail("unable to parse SETTLEMENT_PROVIDER_IDS");
}
const declaredProviders = declaredProvidersMatch[1]
  .split(",")
  .map((item) => item.trim().replace(/['"`]/g, ""))
  .filter(Boolean);

for (const provider of expectedProviders) {
  if (!declaredProviders.includes(provider)) {
    fail("provider missing from runtime adapter list", { provider, declaredProviders });
  }
}

const expectedEndpoints = contract.endpoints ?? [];
for (const endpoint of expectedEndpoints) {
  if (!routeSource.includes(endpoint)) {
    fail("endpoint missing from billing routes", { endpoint });
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: "check:settlement-contract-drift",
      contractPath,
      providers: declaredProviders,
      endpoints: expectedEndpoints,
    },
    null,
    2
  )
);
