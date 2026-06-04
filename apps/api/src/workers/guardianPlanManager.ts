import type { OrchestratorInput, OrchestratorPlanStep, PlanManager } from "@eiah/core";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractGuardianForm(metadata: Record<string, unknown>) {
  const form = asRecord(metadata.form);
  if (form) return form;
  const executionInput = asRecord(metadata.executionInput);
  if (executionInput) return executionInput;
  return metadata;
}

function buildGuardianActionStep(
  runId: string,
  suffix: string,
  description: string,
  action: string,
  params: Record<string, unknown>,
  dependsOn?: string[]
): OrchestratorPlanStep {
  return {
    id: `${runId}-${suffix}`,
    description,
    status: "pending",
    action,
    params,
    dependsOn,
  };
}

function buildGuardianSummaryStep(runId: string, dependsOn: string[]): OrchestratorPlanStep {
  return {
    id: `${runId}-guardian-summary`,
    description: "Consolidar parecer probatório final com base nas verificações executadas.",
    status: "pending",
    dependsOn,
  };
}

export function buildGuardianPlan(input: OrchestratorInput): OrchestratorPlanStep[] | null {
  const metadata = asRecord(input.metadata) ?? {};
  const form = extractGuardianForm(metadata);
  const requestType = typeof form.requestType === "string" ? form.requestType.trim() : "";

  if (!requestType) return null;

  if (requestType === "go_live_controlado.plano_principal_web") {
    const params = {
      requestType,
      objective: typeof form.objective === "string" ? form.objective : undefined,
      evidence: typeof form.evidence === "string" ? form.evidence : undefined,
      notes: typeof form.notes === "string" ? form.notes : undefined,
      piiSignals: typeof form.piiSignals === "string" ? form.piiSignals : undefined,
      finops: typeof form.finops === "string" ? form.finops : undefined,
    };

    const steps = [
      buildGuardianActionStep(
        input.runId,
        "guardian-environment-segregation",
        "Validar segregação operacional entre staging e produção para app e API.",
        "guardian.checkEnvironmentSegregation",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-runtime-health",
        "Verificar contrato público de health da stack atual.",
        "guardian.checkRuntimeHealth",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-policy-guardrails",
        "Checar tenant/workspace fail-closed e guardrails mínimos da API.",
        "guardian.checkGoLivePolicy",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-edge-protection",
        "Validar WAF, rate limit e exposição pública controlada.",
        "guardian.checkEdgeProtection",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-rollback-readiness",
        "Validar documentação de rollback antes de permitir avanço.",
        "guardian.checkRollbackReadiness",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-go-live-artifacts",
        "Conferir artefatos canônicos e bundle probatório final do plano principal.",
        "guardian.checkGoLiveArtifacts",
        params
      ),
    ];

    return [
      ...steps,
      buildGuardianSummaryStep(
        input.runId,
        steps.map((step) => step.id)
      ),
    ];
  }

  if (requestType === "go_live_controlado.domain_dns_api_evidencias") {
    const params = {
      requestType,
      objective: typeof form.objective === "string" ? form.objective : undefined,
      evidence: typeof form.evidence === "string" ? form.evidence : undefined,
      notes: typeof form.notes === "string" ? form.notes : undefined,
      piiSignals: typeof form.piiSignals === "string" ? form.piiSignals : undefined,
      finops: typeof form.finops === "string" ? form.finops : undefined,
    };

    const steps = [
      buildGuardianActionStep(
        input.runId,
        "guardian-runtime-health",
        "Verificar contrato público de health da stack atual.",
        "guardian.checkRuntimeHealth",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-go-live-artifacts",
        "Conferir artefatos canônicos de domain/go-live exigidos pela recipe.",
        "guardian.checkGoLiveArtifacts",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-rollback-readiness",
        "Validar documentação de rollback antes de permitir avanço.",
        "guardian.checkRollbackReadiness",
        params
      ),
      buildGuardianActionStep(
        input.runId,
        "guardian-policy-guardrails",
        "Checar ADR de stack oficial e evidência fail-closed do fluxo.",
        "guardian.checkGoLivePolicy",
        params
      ),
    ];

    return [
      ...steps,
      buildGuardianSummaryStep(
        input.runId,
        steps.map((step) => step.id)
      ),
    ];
  }

  return null;
}

export class GuardianPlanManager implements PlanManager {
  async createPlan(input: OrchestratorInput): Promise<OrchestratorPlanStep[]> {
    return buildGuardianPlan(input) ?? [
      {
        id: `${input.runId}-guardian-summary`,
        description: "Executar análise Guardian com síntese final.",
        status: "pending",
      },
    ];
  }
}
