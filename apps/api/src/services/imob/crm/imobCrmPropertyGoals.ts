export type ImobCrmPropertyGoal = "venda" | "locacao" | "aluguel_por_temporada";

type ImobCrmPropertyGoalOption = {
  value: ImobCrmPropertyGoal;
  label: string;
  aliases: string[];
};

export const IMOB_CRM_PROPERTY_GOAL_OPTIONS: ImobCrmPropertyGoalOption[] = [
  {
    value: "venda",
    label: "Venda",
    aliases: ["venda", "vender", "comprar", "compra", "compra e venda"],
  },
  {
    value: "locacao",
    label: "Locação",
    aliases: ["locacao", "locação", "aluguel", "alugar", "locar"],
  },
  {
    value: "aluguel_por_temporada",
    label: "Aluguel por temporada",
    aliases: ["temporada", "aluguel por temporada", "locacao por temporada", "locação por temporada", "seasonal rental"],
  },
];

function normalizeGoalText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeImobCrmPropertyGoal(value: string | null | undefined): ImobCrmPropertyGoal | null {
  if (!value) return null;
  const normalized = normalizeGoalText(value);
  for (const option of IMOB_CRM_PROPERTY_GOAL_OPTIONS) {
    if (option.aliases.some((alias) => normalizeGoalText(alias) === normalized)) {
      return option.value;
    }
  }
  if (normalized.includes("temporada")) return "aluguel_por_temporada";
  if (normalized.includes("loca") || normalized.includes("alug")) return "locacao";
  if (normalized.includes("vend") || normalized.includes("compr")) return "venda";
  return null;
}

export function getImobCrmPropertyGoalLabel(value: string | null | undefined) {
  const normalized = normalizeImobCrmPropertyGoal(value);
  if (!normalized) return null;
  return IMOB_CRM_PROPERTY_GOAL_OPTIONS.find((option) => option.value === normalized)?.label ?? null;
}

