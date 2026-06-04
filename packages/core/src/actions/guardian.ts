import path from "node:path";
import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  getGuardianEdgeProtectionArtifactPaths,
  getGuardianEnvironmentSegregationArtifactPaths,
  getGuardianGoLiveArtifactPaths,
  guardianPathExists,
  readGuardianFileIfExists,
  resolveGuardianRepoRoot,
} from "./guardianChecklistTools";

const guardianChecklistInputSchema = z.object({
  requestType: z.string().optional(),
  objective: z.string().optional(),
  evidence: z.string().optional(),
  notes: z.string().optional(),
  piiSignals: z.string().optional(),
  finops: z.string().optional(),
});

const guardianChecklistStepOutputSchema = z.object({
  step: z.string(),
  status: z.enum(["verified", "warning", "missing", "degraded"]),
  reasonCode: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  findings: z.array(z.string()),
  nextAction: z.string().nullable().optional(),
  verifiedAt: z.string(),
  details: z.record(z.unknown()).optional(),
});

type GuardianChecklistInput = z.infer<typeof guardianChecklistInputSchema>;

function buildStepOutput(input: z.infer<typeof guardianChecklistStepOutputSchema>) {
  return guardianChecklistStepOutputSchema.parse(input);
}

async function checkRuntimeHealth() {
  const baseUrl = process.env.GUARDIAN_RUNTIME_HEALTH_URL?.trim() || "http://127.0.0.1:8080/api/health";
  const verifiedAt = new Date().toISOString();

  try {
    const response = await fetch(baseUrl, { method: "GET" });
    const body = (await response.json()) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "unhealthy";
    const dependencies =
      body.dependencies && typeof body.dependencies === "object"
        ? (body.dependencies as Record<string, unknown>)
        : {};
    const database = typeof dependencies.database === "string" ? dependencies.database : "disconnected";
    const agentRuntime =
      typeof dependencies.agentRuntime === "string" ? dependencies.agentRuntime : "error";
    const healthy = response.ok && status === "healthy" && database === "connected" && agentRuntime === "ready";

    return buildStepOutput({
      step: "runtime_health",
      status: healthy ? "verified" : status === "degraded" ? "degraded" : "missing",
      reasonCode: healthy ? "runtime_health_verified" : `runtime_health_${status}`,
      summary: healthy
        ? "Contrato público de health respondeu com banco conectado e runtime pronto."
        : "Health público não confirmou prontidão completa de banco e runtime.",
      evidenceRefs: ["/api/health", "ops/evidence/latest/domain-go-live/api-health-response.json"],
      findings: [`status=${status}`, `database=${database}`, `agentRuntime=${agentRuntime}`],
      nextAction: healthy ? null : "Validar /api/health e dependências antes de avançar o go-live.",
      verifiedAt,
      details: { url: baseUrl, status, database, agentRuntime },
    });
  } catch (error) {
    return buildStepOutput({
      step: "runtime_health",
      status: "missing",
      reasonCode: "runtime_health_unreachable",
      summary: "Não foi possível consultar o contrato público de health em runtime.",
      evidenceRefs: ["/api/health"],
      findings: [error instanceof Error ? error.message : String(error)],
      nextAction: "Restabelecer a rota /api/health antes de promover o fluxo.",
      verifiedAt,
      details: { url: baseUrl },
    });
  }
}

async function checkGoLiveArtifacts() {
  const root = resolveGuardianRepoRoot();
  const verifiedAt = new Date().toISOString();
  const artifacts = getGuardianGoLiveArtifactPaths(root);
  const checks = await Promise.all(
    artifacts.map(async (artifact) => ({
      ...artifact,
      exists: await guardianPathExists(artifact.absolutePath),
    }))
  );
  const missing = checks.filter((item) => !item.exists);
  const evidenceRefs = checks.filter((item) => item.exists).map((item) => item.relativePath);

  return buildStepOutput({
    step: "go_live_artifacts",
    status: missing.length === 0 ? "verified" : "warning",
    reasonCode: missing.length === 0 ? "go_live_artifacts_verified" : "go_live_artifacts_partial",
    summary:
      missing.length === 0
        ? "Artefatos canônicos de go-live controlado estão presentes no repositório."
        : "Parte dos artefatos canônicos de go-live controlado está ausente.",
    evidenceRefs,
    findings:
      missing.length === 0
        ? checks.map((item) => `ok:${item.relativePath}`)
        : missing.map((item) => `missing:${item.relativePath}`),
    nextAction:
      missing.length === 0
        ? null
        : "Restaurar as evidências e documentação canônicas antes de declarar GO.",
    verifiedAt,
    details: {
      checkedPaths: checks.map((item) => ({
        path: item.relativePath,
        exists: item.exists,
      })),
    },
  });
}

async function checkEnvironmentSegregation() {
  const root = resolveGuardianRepoRoot();
  const verifiedAt = new Date().toISOString();
  const artifacts = getGuardianEnvironmentSegregationArtifactPaths(root);
  const checks = await Promise.all(
    artifacts.map(async (artifact) => ({
      ...artifact,
      exists: await guardianPathExists(artifact.absolutePath),
      content: await readGuardianFileIfExists(artifact.absolutePath),
    }))
  );

  const dnsSnapshot = checks.find((item) => item.relativePath.endsWith("dns-cloudflare-snapshot.md"));
  const stagingSmoke = checks.find((item) => item.relativePath.endsWith("staging-dns-tls-smoke.md"));
  const productionSmoke = checks.find((item) => item.relativePath.endsWith("production-dns-tls-smoke.md"));

  const hasDnsSnapshot = Boolean(dnsSnapshot?.exists);
  const hasStaging = Boolean(stagingSmoke?.exists);
  const hasProduction = Boolean(productionSmoke?.exists);
  const productionMentionsStaging =
    typeof productionSmoke?.content === "string" && /app\.staging|api\.staging|staging/i.test(productionSmoke.content);
  const stagingMentionsProduction =
    typeof stagingSmoke?.content === "string" && /app\.eiah|api\.eiah|produção|producao/i.test(stagingSmoke.content);
  const verified = hasDnsSnapshot && hasStaging && hasProduction && !productionMentionsStaging;

  return buildStepOutput({
    step: "environment_segregation",
    status: verified ? "verified" : hasDnsSnapshot || hasStaging || hasProduction ? "warning" : "missing",
    reasonCode: verified ? "environment_segregation_verified" : "environment_segregation_incomplete",
    summary: verified
      ? "Evidências de staging e produção indicam segregação operacional entre app e API."
      : "As evidências de segregação entre staging e produção ainda estão incompletas ou inconclusivas.",
    evidenceRefs: checks.filter((item) => item.exists).map((item) => item.relativePath),
    findings: [
      `dns_snapshot=${hasDnsSnapshot}`,
      `staging_smoke=${hasStaging}`,
      `production_smoke=${hasProduction}`,
      `production_mentions_staging=${productionMentionsStaging}`,
      `staging_mentions_production=${stagingMentionsProduction}`,
    ],
    nextAction: verified
      ? null
      : "Capturar ou revisar as evidências de DNS/TLS por ambiente antes de aprovar a segregação operacional.",
    verifiedAt,
  });
}

async function checkRollbackReadiness() {
  const root = resolveGuardianRepoRoot();
  const verifiedAt = new Date().toISOString();
  const rollbackPath = path.join(root, "ops/evidence/latest/domain-go-live/rollback-plan.md");
  const rollbackContent = await readGuardianFileIfExists(rollbackPath);
  const hasRollback = typeof rollbackContent === "string" && rollbackContent.trim().length > 0;

  return buildStepOutput({
    step: "rollback_readiness",
    status: hasRollback ? "verified" : "missing",
    reasonCode: hasRollback ? "rollback_plan_verified" : "rollback_plan_missing",
    summary: hasRollback
      ? "Plano de rollback documentado e disponível para o go-live controlado."
      : "Plano de rollback não foi encontrado no pacote canônico de evidências.",
    evidenceRefs: hasRollback ? ["ops/evidence/latest/domain-go-live/rollback-plan.md"] : [],
    findings: hasRollback ? ["rollback_plan_present"] : ["rollback_plan_absent"],
    nextAction: hasRollback ? null : "Documentar rollback antes de seguir para produção.",
    verifiedAt,
  });
}

async function checkGoLivePolicy() {
  const root = resolveGuardianRepoRoot();
  const verifiedAt = new Date().toISOString();
  const adrPath = path.join(root, "docs/adr/ADR-001-domain-runtime-stack.md");
  const policyEvidencePath = path.join(
    root,
    "ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"
  );
  const adrContent = await readGuardianFileIfExists(adrPath);
  const hasAdr =
    typeof adrContent === "string" &&
    adrContent.includes("Cloudflare") &&
    adrContent.includes("Vercel") &&
    adrContent.includes("Render");
  const hasFailClosedEvidence = await guardianPathExists(policyEvidencePath);
  const verified = hasAdr && hasFailClosedEvidence;

  return buildStepOutput({
    step: "policy_guardrails",
    status: verified ? "verified" : "warning",
    reasonCode: verified ? "policy_guardrails_verified" : "policy_guardrails_incomplete",
    summary: verified
      ? "ADR de stack oficial e evidência fail-closed estão consistentes para o fluxo."
      : "Falta consistência entre ADR oficial e pacote fail-closed do go-live.",
    evidenceRefs: [
      ...(hasAdr ? ["docs/adr/ADR-001-domain-runtime-stack.md"] : []),
      ...(hasFailClosedEvidence ? ["ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"] : []),
    ],
    findings: [
      `adr_stack_official=${hasAdr}`,
      `fail_closed_evidence=${hasFailClosedEvidence}`,
    ],
    nextAction: verified
      ? null
      : "Fechar drift entre ADR/stack oficial e evidência fail-closed antes do parecer final.",
    verifiedAt,
  });
}

async function checkEdgeProtection() {
  const root = resolveGuardianRepoRoot();
  const verifiedAt = new Date().toISOString();
  const artifacts = getGuardianEdgeProtectionArtifactPaths(root);
  const checks = await Promise.all(
    artifacts.map(async (artifact) => ({
      ...artifact,
      exists: await guardianPathExists(artifact.absolutePath),
      content: await readGuardianFileIfExists(artifact.absolutePath),
    }))
  );

  const productionSmoke = checks.find((item) => item.relativePath.endsWith("production-dns-tls-smoke.md"));
  const wafEvidence = checks.find((item) => item.relativePath.endsWith("waf-rate-limit-evidence.md"));
  const failClosed = checks.find((item) => item.relativePath.endsWith("tenant-policy-fail-closed-403.md"));

  const productionContent = productionSmoke?.content ?? "";
  const wafContent = wafEvidence?.content ?? "";
  const hasWaf = Boolean(wafEvidence?.exists) || /waf/i.test(String(productionContent));
  const hasRateLimit = /rate limit|rate-limit/i.test(`${productionContent}\n${wafContent}`);
  const hasFailClosedEvidence = Boolean(failClosed?.exists);
  const verified = hasWaf && hasRateLimit && hasFailClosedEvidence;

  return buildStepOutput({
    step: "edge_protection",
    status: verified ? "verified" : hasWaf || hasRateLimit || hasFailClosedEvidence ? "warning" : "missing",
    reasonCode: verified ? "edge_protection_verified" : "edge_protection_incomplete",
    summary: verified
      ? "WAF, rate limit e evidência fail-closed estão consistentes para a borda pública."
      : "A proteção de borda ainda não comprovou WAF, rate limit e fail-closed suficientes.",
    evidenceRefs: checks.filter((item) => item.exists).map((item) => item.relativePath),
    findings: [
      `waf_configured=${hasWaf}`,
      `rate_limit_configured=${hasRateLimit}`,
      `fail_closed_evidence=${hasFailClosedEvidence}`,
    ],
    nextAction: verified
      ? null
      : "Completar a evidência de WAF/rate limit e fail-closed antes do parecer final de exposição pública.",
    verifiedAt,
  });
}

export function registerGuardianActions() {
  registerAction({
    name: "guardian.checkEnvironmentSegregation",
    description: "Verifica evidências de segregação entre staging e produção no go-live controlado.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkEnvironmentSegregation(),
    }),
  });

  registerAction({
    name: "guardian.checkRuntimeHealth",
    description: "Verifica o contrato público de health usado no go-live controlado.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkRuntimeHealth(),
    }),
  });

  registerAction({
    name: "guardian.checkGoLiveArtifacts",
    description: "Confere se artefatos canônicos de domain/go-live estão presentes.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkGoLiveArtifacts(),
    }),
  });

  registerAction({
    name: "guardian.checkRollbackReadiness",
    description: "Valida a presença do plano de rollback exigido para produção.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkRollbackReadiness(),
    }),
  });

  registerAction({
    name: "guardian.checkGoLivePolicy",
    description: "Valida ADR e evidência fail-closed exigidas no fluxo de go-live.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkGoLivePolicy(),
    }),
  });

  registerAction({
    name: "guardian.checkEdgeProtection",
    description: "Valida evidências de WAF, rate limiting e fail-closed na borda pública.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: guardianChecklistInputSchema,
      output: guardianChecklistStepOutputSchema,
    },
    handler: async () => ({
      status: "success",
      output: await checkEdgeProtection(),
    }),
  });
}
