export type PricingPlanId = "solo" | "starter" | "growth" | "scale";

export type PricingPlan = {
  id: PricingPlanId;
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  overageRunCents: number;
  extraUserCents: number;
  includes: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "solo",
    label: "Solo",
    basePriceCents: 49_000,
    includedUsers: 3,
    includedRuns: 1_500,
    overageRunCents: 35,
    extraUserCents: 3_900,
    includes: [
      "3 usuários inclusos para operação enxuta",
      "1.500 runs/mês para atendimento e follow-up",
      "Trilha auditável por run com evidência exportável",
      "Governança base: intent + trust + guardrails",
      "Ideal para corretor autônomo ou micro-time",
      "Suporte padrão em horário comercial",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    basePriceCents: 149_000,
    includedUsers: 10,
    includedRuns: 5_000,
    overageRunCents: 30,
    extraUserCents: 3_900,
    includes: [
      "10 usuários inclusos no tenant/workspace",
      "5.000 runs/mês com trilha auditável por run",
      "Governança base: intent + trust score + guardrails",
      "Evidência exportável (JSON/PDF/HTML) por execução",
      "Chat operacional + dashboard de processos",
      "Suporte padrão em horário comercial",
    ],
  },
  {
    id: "growth",
    label: "Growth",
    basePriceCents: 399_000,
    includedUsers: 25,
    includedRuns: 25_000,
    overageRunCents: 22,
    extraUserCents: 2_900,
    includes: [
      "25 usuários inclusos no tenant/workspace",
      "25.000 runs/mês com PoU + Trust Gate",
      "Aprovação humana e policies autoaplicáveis",
      "Auditoria pública por txId com vínculo canônico",
      "Interop A2A (discovery/negotiate/execute) pronta para operação",
      "Suporte prioritário para operação B2B",
    ],
  },
  {
    id: "scale",
    label: "Scale",
    basePriceCents: 990_000,
    includedUsers: 100,
    includedRuns: 100_000,
    overageRunCents: 15,
    extraUserCents: 1_900,
    includes: [
      "100 usuários inclusos no tenant/workspace",
      "100.000 runs/mês para operação crítica em escala",
      "Economy avançada: PoU-gated payment + disputas auditáveis",
      "Settlement provider com reconciliação e idempotência",
      "Command center por vertical e rollout controlado",
      "Suporte enterprise com acompanhamento dedicado",
    ],
  },
];

/**
 * Calculates the total monthly cost for a given plan, user count, and run count.
 * Overage is charged per extra run and per extra user beyond the included quota.
 */
export function quotePlan(
  plan: PricingPlan,
  users: number,
  runs: number,
): PricingPlan & { totalCents: number } {
  const runOverage = Math.max(0, runs - plan.includedRuns);
  const userOverage = Math.max(0, users - plan.includedUsers);
  const totalCents =
    plan.basePriceCents + runOverage * plan.overageRunCents + userOverage * plan.extraUserCents;
  return { ...plan, totalCents };
}
