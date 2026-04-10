export type ImobPropertyGoal = "venda" | "locacao" | "aluguel_por_temporada";

export const IMOB_PROPERTY_GOAL_OPTIONS: Array<{
  value: ImobPropertyGoal;
  label: string;
}> = [
  { value: "venda", label: "Venda" },
  { value: "locacao", label: "Locação" },
  { value: "aluguel_por_temporada", label: "Aluguel por temporada" },
];

export function getImobPropertyGoalLabel(value: string | null | undefined) {
  return IMOB_PROPERTY_GOAL_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

