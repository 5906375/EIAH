import fs from "node:fs";
import path from "node:path";

const CHECK = "check:w4-non-regression";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) fail("missing file", { file });
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

const root = process.cwd();

const kpiFile = path.join(root, "ops/evidence/latest/w4-non-regression-kpis.json");
const sessionRouteFile = path.join(root, "apps/api/src/routes/session.ts");
const marketplaceRouteFile = path.join(root, "apps/api/src/routes/marketplace.ts");
const templateFile = path.join(root, "ops/verticals/template/vertical-template.md");
const onboardingFile = path.join(root, "ops/verticals/vertical-onboarding-checklist.md");

const kpi = readJson<{
  kpis?: {
    moduleActivationSuccessRatePct?: number;
    moduleActivationP95Seconds?: number;
    timeToFirstRunP95Minutes?: number;
    receiptCoveragePct?: number;
    crossTenantAuthFailures?: number;
    duplicateSideEffects?: number;
  };
  gates?: {
    hardMetricsGo?: boolean;
    nonRegressionGo?: boolean;
  };
  evidenceRefs?: string[];
}>(kpiFile);

if (!fs.existsSync(sessionRouteFile)) fail("missing session route", { sessionRouteFile });
if (!fs.existsSync(marketplaceRouteFile)) fail("missing marketplace route", { marketplaceRouteFile });
if (!fs.existsSync(templateFile)) fail("missing vertical template", { templateFile });
if (!fs.existsSync(onboardingFile)) fail("missing onboarding checklist", { onboardingFile });

const sessionSource = fs.readFileSync(sessionRouteFile, "utf8");
const marketplaceSource = fs.readFileSync(marketplaceRouteFile, "utf8");

const requiredSessionTokens = ["IMOB_INSTALLED", "productInstallations"];
const missingSessionTokens = requiredSessionTokens.filter((token) => !sessionSource.includes(token));
if (missingSessionTokens.length > 0) {
  fail("session context missing required W4 tokens", { missingSessionTokens });
}

const requiredMarketplaceTokens = [
  '/marketplace/installations/activate',
  '/marketplace/installations',
  'tenant_product_installations',
];
const missingMarketplaceTokens = requiredMarketplaceTokens.filter((token) => !marketplaceSource.includes(token));
if (missingMarketplaceTokens.length > 0) {
  fail("marketplace routes missing required W4 tokens", { missingMarketplaceTokens });
}

const metrics = kpi.kpis ?? {};
const gates = kpi.gates ?? {};

const rules = {
  moduleActivationSuccessRatePct: (metrics.moduleActivationSuccessRatePct ?? 0) >= 95,
  moduleActivationP95Seconds: (metrics.moduleActivationP95Seconds ?? Infinity) <= 120,
  timeToFirstRunP95Minutes: (metrics.timeToFirstRunP95Minutes ?? Infinity) <= 30,
  receiptCoveragePct: (metrics.receiptCoveragePct ?? 0) >= 99,
  crossTenantAuthFailures: (metrics.crossTenantAuthFailures ?? 9999) === 0,
  duplicateSideEffects: (metrics.duplicateSideEffects ?? 9999) === 0,
  hardMetricsGo: gates.hardMetricsGo === true,
  nonRegressionGo: gates.nonRegressionGo === true,
};

const failedRules = Object.entries(rules)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

if (failedRules.length > 0) {
  fail("w4 non-regression gates failed", {
    failedRules,
    metrics,
    gates,
    kpiFile: path.relative(root, kpiFile),
  });
}

const evidenceRefs = kpi.evidenceRefs ?? [];
const missingEvidenceRefs = evidenceRefs.filter((ref) => !fs.existsSync(path.join(root, ref)));
if (missingEvidenceRefs.length > 0) {
  fail("missing evidence references", { missingEvidenceRefs });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      gates,
      metrics,
      template: path.relative(root, templateFile),
      onboarding: path.relative(root, onboardingFile),
      evidenceRefs,
    },
    null,
    2
  )
);
