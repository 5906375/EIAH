import assert from "node:assert/strict";
import test from "node:test";
import { buildGuardianStructuredOutput } from "../workers/runWorkerGuardianOutput";

test("buildGuardianStructuredOutput derives fail-closed decision and evidence table", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-1",
    runStatus: "success",
    costCents: null,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        piiSignals: "sem ofuscação de PII",
        environment: "prod",
      },
    },
    outputs: [
      {
        stepId: "step-1",
        data: {
          step: "runtime_health",
          status: "verified",
          summary: "Health responde 200.",
          evidenceRefs: ["/api/health"],
          findings: ["database=connected"],
        },
      },
      {
        stepId: "step-2",
        data: {
          step: "rollback_readiness",
          status: "missing",
          summary: "Rollback ausente.",
          nextAction: "Documentar rollback antes do go-live.",
          evidenceRefs: [],
          findings: [],
        },
      },
    ],
    snapshot: {
      model: "gpt-4.1",
      traceId: "trace-1",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.guardianDecision, "NO-GO");
  assert.equal(report?.reasonCode, "PII_DETECTED_ABORT_FLOW");
  assert.equal(report?.evidenceStatus, "missing");
  assert.equal(report?.finopsStatus, "not_calculated");
  assert.equal(report?.checklist.length, 4);
  assert.match(report?.summary ?? "", /bloqueou o avanço/i);
  assert.equal(
    report?.checklist.some((item) => item.item === "go_live_artifacts" && item.collectedEvidence === "não coletada"),
    true
  );
});

test("buildGuardianStructuredOutput materializes missing runtime health as checklist item and blocking issue", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-3",
    runStatus: "success",
    costCents: null,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        piiSignals: "dados ofuscados",
      },
    },
    outputs: [],
    snapshot: null,
  });

  assert.ok(report);
  assert.equal(report?.reasonCode, "HEALTHCHECK_MISSING");
  const runtimeHealth = report?.checklist.find((item) => item.item === "runtime_health");
  assert.ok(runtimeHealth);
  assert.equal(runtimeHealth?.status, "missing");
  assert.equal(runtimeHealth?.blocking, true);
  assert.match(runtimeHealth?.expectedEvidence ?? "", /\/api\/health/i);
  assert.match(report?.summary ?? "", /faltou a evidência obrigatória do healthcheck/i);
  assert.equal(report?.blockingIssues.some((item) => item.code === "HEALTHCHECK_MISSING"), true);
});

test("buildGuardianStructuredOutput preserves GO when evidence is complete", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-2",
    runStatus: "success",
    costCents: 42,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        piiSignals: "dados ofuscados",
      },
    },
    outputs: [
      {
        stepId: "step-1",
        data: {
          step: "runtime_health",
          status: "verified",
          summary: "Health responde 200.",
          evidenceRefs: ["/api/health"],
          findings: ["database=connected"],
        },
      },
      {
        stepId: "step-2",
        data: {
          step: "rollback_readiness",
          status: "verified",
          summary: "Rollback presente.",
          evidenceRefs: ["docs/runbook.md"],
          findings: [],
        },
      },
      {
        stepId: "step-3",
        data: {
          step: "policy_guardrails",
          status: "verified",
          summary: "403 fail-closed validado.",
          evidenceRefs: ["logs/403-proof.txt"],
          findings: ["fail_closed_evidence=true"],
        },
      },
      {
        stepId: "step-4",
        data: {
          step: "go_live_artifacts",
          status: "verified",
          summary: "Bundle de evidências presente.",
          evidenceRefs: ["ops/evidence/latest/go-live.md"],
          findings: [],
        },
      },
    ],
    snapshot: {
      usage: {
        totalTokens: 300,
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.guardianDecision, "GO");
  assert.equal(report?.reasonCode, "GO_READY");
  assert.equal(report?.evidenceStatus, "complete");
  assert.equal(report?.finopsStatus, "calculated");
  assert.equal(report?.riskLevel, "high");
  assert.match(report?.summary ?? "", /pode avançar/i);
  assert.equal(report?.checklist.every((item) => typeof item.sha256 === "string" && item.sha256.length === 64), true);
});

test("buildGuardianStructuredOutput reads step data from action output envelope", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-4",
    runStatus: "success",
    costCents: 0,
    txId: "tx-guardian-4",
    criticalHash: "critical-guardian-4",
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        piiSignals: "",
      },
      governanceContext: {
        tenantIdPresent: true,
        workspaceIdPresent: true,
        rbacEvaluated: true,
        entitlementEvaluated: true,
        trustScoreEvaluated: true,
        trustScore: 0.97,
        trustLevel: "high",
        costGuardEvaluated: true,
        policyDecision: "allowed",
        reasonCode: null,
      },
    },
    outputs: [
      {
        stepId: "step-1",
        data: {
          ok: true,
          action: "guardian.checkRuntimeHealth",
          output: {
            step: "runtime_health",
            status: "verified",
            summary: "Contrato público de health respondeu com banco conectado e runtime pronto.",
            evidenceRefs: ["/api/health", "ops/evidence/latest/domain-go-live/api-health-response.json"],
            findings: ["status=healthy", "database=connected", "agentRuntime=ready"],
          },
        },
      },
      {
        stepId: "step-2",
        data: {
          ok: true,
          action: "guardian.checkGoLiveArtifacts",
          output: {
            step: "go_live_artifacts",
            status: "verified",
            summary: "Artefatos canônicos de go-live controlado estão presentes no repositório.",
            evidenceRefs: ["docs/adr/ADR-001-domain-runtime-stack.md"],
            findings: ["ok:docs/adr/ADR-001-domain-runtime-stack.md"],
          },
        },
      },
      {
        stepId: "step-3",
        data: {
          ok: true,
          action: "guardian.checkRollbackReadiness",
          output: {
            step: "rollback_readiness",
            status: "verified",
            summary: "Plano de rollback documentado e disponível para o go-live controlado.",
            evidenceRefs: ["ops/evidence/latest/domain-go-live/rollback-plan.md"],
            findings: ["rollback_plan_present"],
          },
        },
      },
      {
        stepId: "step-4",
        data: {
          ok: true,
          action: "guardian.checkGoLivePolicy",
          output: {
            step: "policy_guardrails",
            status: "verified",
            summary: "ADR de stack oficial e evidência fail-closed estão consistentes para o fluxo.",
            evidenceRefs: ["ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"],
            findings: ["adr_stack_official=true", "fail_closed_evidence=true"],
          },
        },
      },
    ],
    snapshot: {
      traceId: "trace-4",
      usage: {
        totalTokens: 0,
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.guardianDecision, "GO");
  assert.equal(report?.reasonCode, "GO_READY");
  assert.equal(report?.evidenceStatus, "complete");
  assert.equal(report?.checklist.every((item) => item.status === "complete"), true);
  assert.equal(report?.finopsStatus, "not_reported");
  assert.equal(report?.finops.estimatedCost, null);
  assert.equal(report?.finops.currency, null);
  assert.equal(report?.auditTrail.receiptId, "tx-guardian-4");
  assert.equal(report?.auditTrail.verifyUrl, "/api/ledger/tx-guardian-4");
  assert.equal(report?.auditTrail.evidenceBundleId, "/api/runs/run-4/bundle");
  assert.equal(report?.governance?.rbacEvaluated, true);
  assert.equal(report?.governance?.entitlementEvaluated, true);
  assert.equal(report?.governance?.trustScoreEvaluated, true);
  assert.equal(report?.governance?.costGuardEvaluated, true);
  assert.equal(report?.governance?.policyDecision, "allowed");
  assert.equal(report?.governance?.trustLevel, "high");
  assert.equal(report?.governance?.trustScore, 0.97);
  assert.match(report?.summary ?? "", /pode avançar/i);
});

test("buildGuardianStructuredOutput treats staged recipe plans as plan overview instead of final go-live gate", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-5",
    runStatus: "success",
    costCents: 0,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.plano_principal_web",
        piiSignals: "",
      },
      linkedRecipe: {
        id: "recipe-main",
        title: "Go-live Controlado EIAH Web — Plano Principal",
        stageExecution: {
          mode: "plan",
          activeStepId: null,
          activeStepTitle: null,
        },
        content: {
          mode: "staged",
          steps: [
            {
              id: "step-1",
              title: "Segregação entre staging e produção",
              objective: "Separar ambientes",
              checks: ["produção não consome staging"],
              evidence: ["snapshot de env vars"],
              blocking: true,
            },
            {
              id: "step-2",
              title: "Health, fail-closed e policy mínima",
              objective: "Validar API",
              checks: ["/api/health sem erro"],
              evidence: ["resposta válida de /api/health"],
              blocking: true,
            },
          ],
          expectedOutcome: "Mostrar o que falta e quando o plano está pronto para rerun.",
        },
      },
    },
    outputs: [],
    snapshot: null,
  });

  assert.ok(report);
  assert.equal(report?.evaluationScope, "plan_overview");
  assert.equal(report?.reasonCode, "PLAN_EVIDENCE_INCOMPLETE");
  assert.equal(report?.guardianDecision, "NO-GO");
  assert.equal(report?.globalDecision, "NO-GO");
  assert.equal(report?.riskLevel, "critical");
  assert.equal(report?.coverageMatrix.length, 3);
  assert.match(report?.coverageMatrix[0]?.whatRunAnswered ?? "", /NO-GO/);
  assert.match(report?.coverageMatrix[2]?.whatRunAnswered ?? "", /Recipe_Orchestrator/i);
  assert.match(report?.summary ?? "", /plano principal/i);
  assert.equal(report?.checklist[0]?.item, "Segregação entre staging e produção");
});

test("buildGuardianStructuredOutput reconciles guardian signals into structured recipe steps", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-6",
    runStatus: "success",
    costCents: 0,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.plano_principal_web",
        piiSignals: "",
      },
      linkedRecipe: {
        id: "recipe-main",
        title: "Go-live Controlado EIAH Web — Plano Principal",
        stageExecution: {
          mode: "plan",
          activeStepId: null,
          activeStepTitle: null,
        },
        content: {
          mode: "staged",
          steps: [
            {
              id: "step-1",
              title: "Segregação entre staging e produção",
              objective: "Separar ambientes",
              checks: ["produção não consome staging"],
              evidence: ["snapshot de env vars"],
              blocking: true,
            },
            {
              id: "step-2",
              title: "Health, fail-closed e policy mínima",
              objective: "Validar API",
              checks: ["/api/health sem erro", "403 fail-closed sem contexto válido"],
              evidence: ["resposta válida de /api/health"],
              blocking: true,
            },
            {
              id: "step-3",
              title: "WAF, rate limit e exposição pública",
              objective: "Validar proteção de borda",
              checks: ["WAF ativo nas rotas públicas críticas"],
              evidence: ["evidência de WAF"],
              blocking: true,
            },
            {
              id: "step-4",
              title: "Rollback e evidências finais",
              objective: "Validar rollback executável",
              checks: ["rollback documentado para frontend e API"],
              evidence: ["plano de rollback", "bundle probatório final"],
              blocking: true,
            },
          ],
          expectedOutcome: "Mostrar o que falta e quando o plano está pronto para rerun.",
        },
      },
    },
    outputs: [
      {
        stepId: "step-guardian-1",
        data: {
          output: {
            step: "runtime_health",
            status: "verified",
            summary: "Health respondeu 200 com banco conectado.",
            evidenceRefs: ["/api/health"],
            findings: ["database=connected"],
          },
        },
      },
      {
        stepId: "step-guardian-2",
        data: {
          output: {
            step: "policy_guardrails",
            status: "verified",
            summary: "Fail-closed 403 e guardrails de borda validados.",
            evidenceRefs: ["logs/403-proof.txt", "ops/evidence/latest/waf-proof.md"],
            findings: ["fail_closed_evidence=true", "waf_configured=true"],
          },
        },
      },
      {
        stepId: "step-guardian-3",
        data: {
          output: {
            step: "rollback_readiness",
            status: "verified",
            summary: "Rollback documentado e disponível.",
            evidenceRefs: ["ops/evidence/latest/domain-go-live/rollback-plan.md"],
            findings: ["rollback_plan_present"],
          },
        },
      },
      {
        stepId: "step-guardian-4",
        data: {
          output: {
            step: "go_live_artifacts",
            status: "verified",
            summary: "Bundle probatório final disponível.",
            evidenceRefs: ["ops/evidence/latest/domain-go-live/go-live-bundle.md"],
            findings: ["bundle_present=true"],
          },
        },
      },
    ],
    snapshot: null,
  });

  assert.ok(report);
  assert.equal(report?.evaluationScope, "plan_overview");
  assert.equal(report?.reasonCode, "PLAN_EVIDENCE_INCOMPLETE");
  assert.equal(report?.guardianDecision, "NO-GO");
  assert.equal(report?.checklist.find((item) => item.item === "Segregação entre staging e produção")?.status, "missing");
  assert.equal(report?.checklist.find((item) => item.item === "Health, fail-closed e policy mínima")?.status, "complete");
  assert.equal(report?.checklist.find((item) => item.item === "WAF, rate limit e exposição pública")?.status, "missing");
  assert.equal(report?.checklist.find((item) => item.item === "Rollback e evidências finais")?.status, "complete");
  assert.equal(report?.checklist.find((item) => item.item === "Health, fail-closed e policy mínima")?.sha256?.length, 64);
  assert.equal(
    report?.checklist.find((item) => item.item === "Health, fail-closed e policy mínima")?.collectedEvidence,
    "Health: /api/health | Policy: logs/403-proof.txt · ops/evidence/latest/waf-proof.md"
  );
  assert.equal(
    report?.checklist.find((item) => item.item === "WAF, rate limit e exposição pública")?.collectedEvidence,
    "não coletada"
  );
  assert.equal(
    report?.checklist.find((item) => item.item === "Rollback e evidências finais")?.collectedEvidence,
    "Rollback: ops/evidence/latest/domain-go-live/rollback-plan.md | Bundle final: ops/evidence/latest/domain-go-live/go-live-bundle.md"
  );
  assert.match(report?.summary ?? "", /Segregação entre staging e produção/i);
});

test("buildGuardianStructuredOutput dedupes next steps for complete staged plan", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-7",
    runStatus: "success",
    costCents: 100,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.plano_principal_web",
        piiSignals: "",
      },
      linkedRecipe: {
        id: "recipe-main",
        title: "Go-live Controlado EIAH Web — Plano Principal",
        stageExecution: {
          mode: "plan",
          activeStepId: null,
          activeStepTitle: null,
        },
        content: {
          mode: "staged",
          steps: [
            {
              id: "step-1",
              title: "Segregação entre staging e produção",
              objective: "Separar ambientes",
              checks: ["produção não consome staging"],
              evidence: ["snapshot de env vars"],
              blocking: true,
            },
            {
              id: "step-2",
              title: "Health, fail-closed e policy mínima",
              objective: "Validar API",
              checks: ["/api/health sem erro", "403 fail-closed sem contexto válido"],
              evidence: ["resposta válida de /api/health"],
              blocking: true,
            },
          ],
        },
      },
    },
    outputs: [
      {
        stepId: "step-guardian-1",
        data: {
          output: {
            step: "environment_segregation",
            status: "verified",
            summary: "Segregação comprovada.",
            evidenceRefs: ["ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md"],
            findings: ["dns_snapshot=true"],
          },
        },
      },
      {
        stepId: "step-guardian-2",
        data: {
          output: {
            step: "runtime_health",
            status: "verified",
            summary: "Health respondeu 200 com banco conectado.",
            evidenceRefs: ["/api/health"],
            findings: ["database=connected"],
          },
        },
      },
      {
        stepId: "step-guardian-3",
        data: {
          output: {
            step: "policy_guardrails",
            status: "verified",
            summary: "Fail-closed validado.",
            evidenceRefs: ["logs/403-proof.txt"],
            findings: ["fail_closed_evidence=true"],
          },
        },
      },
    ],
    snapshot: {
      usage: {
        totalTokens: 10,
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.guardianDecision, "GO");
  assert.equal(report?.riskLevel, "critical");
  assert.deepEqual(report?.nextSteps, [
    "Registrar o receipt final do run.",
    "Promover o fluxo somente após conferência do verify_url.",
    "Monitorar health e rollback no pós-go-live imediato.",
  ]);
});

test("buildGuardianStructuredOutput marks finops as not_calculated when only partial usage or cost is available", () => {
  const report = buildGuardianStructuredOutput({
    agent: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-8",
    runStatus: "success",
    costCents: 25,
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        piiSignals: "dados ofuscados",
      },
    },
    outputs: [
      {
        stepId: "step-1",
        data: {
          step: "runtime_health",
          status: "verified",
          summary: "Health responde 200.",
          evidenceRefs: ["/api/health"],
          findings: ["database=connected"],
        },
      },
      {
        stepId: "step-2",
        data: {
          step: "rollback_readiness",
          status: "verified",
          summary: "Rollback presente.",
          evidenceRefs: ["docs/runbook.md"],
          findings: [],
        },
      },
      {
        stepId: "step-3",
        data: {
          step: "policy_guardrails",
          status: "verified",
          summary: "403 fail-closed validado.",
          evidenceRefs: ["logs/403-proof.txt"],
          findings: ["fail_closed_evidence=true"],
        },
      },
      {
        stepId: "step-4",
        data: {
          step: "go_live_artifacts",
          status: "verified",
          summary: "Bundle de evidências presente.",
          evidenceRefs: ["ops/evidence/latest/go-live.md"],
          findings: [],
        },
      },
    ],
    snapshot: {
      usage: {
        totalTokens: 0,
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.finopsStatus, "not_calculated");
  assert.equal(report?.finops.estimatedCost, 0.25);
  assert.equal(report?.finops.totalTokens, null);
});
