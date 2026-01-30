import crypto from "node:crypto";
import { PrismaClient } from "@repo/db";

export type TrustScoreReport = {
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
};

type WeightedSignal = {
  key: string;
  label: string;
  value: number; // 0–1
  weight: number; // 0–1
};

/**
 * Função principal — versão fortalecida
 * Calcula score ponderado por workspace e registra relatório
 */
export async function evaluateTrustScore(
  prisma: PrismaClient,
  tenantId: string,
  workspaceId: string
): Promise<TrustScoreReport> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // === 1️⃣ Buscar pesos configuráveis ===
  // (pode ser lido de uma tabela workspaceConfig JSON ou usar defaults)
  const weights = {
    violations: 0.35,
    blocks: 0.25,
    intents: 0.15,
    errorRate: 0.15,
    successRate: 0.10,
  };

  // === 2️⃣ Coletar métricas ===
  const ledgerScope = { tenantId, run: { workspaceId } };
  const [violations, blocks, intents, totalRuns, errorRuns] = await Promise.all([
    prisma.guardrailLedger.count({
      where: {
        ...ledgerScope,
        actionType: { startsWith: "violation" },
        timestamp: { gte: sevenDaysAgo },
      },
    }),
    prisma.guardrailLedger.count({
      where: {
        ...ledgerScope,
        actionType: { startsWith: "blocked" },
        timestamp: { gte: sevenDaysAgo },
      },
    }),
    prisma.guardrailLedger.count({
      where: {
        ...ledgerScope,
        actionType: "intent.validation",
        timestamp: { gte: sevenDaysAgo },
      },
    }),
    prisma.run.count({ where: { tenantId, workspaceId } }),
    prisma.run.count({ where: { tenantId, workspaceId, status: "error" } }),
  ]);

  const successRate = totalRuns > 0 ? (totalRuns - errorRuns) / totalRuns : 1;
  const errorRate = totalRuns > 0 ? errorRuns / totalRuns : 0;

  // === 3️⃣ Normalizar valores para 0–1 ===
  const normalize = (v: number, max = 50) => Math.min(v / max, 1);
  const signals: WeightedSignal[] = [
    { key: "violations", label: "Violations", value: 1 - normalize(violations, 10), weight: weights.violations },
    { key: "blocks", label: "Blocked Actions", value: 1 - normalize(blocks, 10), weight: weights.blocks },
    { key: "intents", label: "Intent Volume", value: 1 - normalize(intents, 100), weight: weights.intents },
    { key: "errorRate", label: "Error Rate", value: 1 - errorRate, weight: weights.errorRate },
    { key: "successRate", label: "Success Rate", value: successRate, weight: weights.successRate },
  ];

  // === 4️⃣ Calcular score ponderado ===
  const totalWeight = signals.reduce((acc, s) => acc + s.weight, 0);
  const weightedScore = Math.round(
    (signals.reduce((acc, s) => acc + s.value * s.weight, 0) / totalWeight) * 100
  );

  // === 5️⃣ Determinar nível e motivos ===
  const level = weightedScore >= 70 ? "high" : weightedScore >= 40 ? "medium" : "low";
  const reasons = signals.map(
    (s) => `${s.label}: ${(s.value * 100).toFixed(1)}% (w=${s.weight})`
  );

  const report: TrustScoreReport = { score: weightedScore, level, reasons };

  const criticalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        event: "trust.report.generated",
        tenantId,
        workspaceId,
        timestamp: now.toISOString(),
        report,
      })
    )
    .digest("hex");

  // === 6️⃣ Registrar no GuardrailLedger ===
  await prisma.guardrailLedger.create({
    data: {
      tenantId,
      actionType: "trust.report.generated",
      timestamp: now,
      criticalHash,
      trustScore: weightedScore,
    },
  });

  return report;
}

/**
 * Verifica se score é suficiente para permitir execução
 */
export function trustScoreAllowsExecution(
  report: TrustScoreReport,
  threshold = 40
) {
  return report.score >= threshold;
}
