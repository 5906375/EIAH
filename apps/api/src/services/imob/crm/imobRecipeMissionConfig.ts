import type { ImobMissionContext } from "../imobConversationContract";

export type ImobRecipeMissionInput = {
  recipeId: string;
  agentId: string;
  status?: string | null;
  tags?: string[] | null;
};

function normalizeTag(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_");
}

export function resolveImobRecipeMissionContext(
  recipe: ImobRecipeMissionInput | null | undefined,
): ImobMissionContext | null {
  if (!recipe || recipe.status !== "homologated") return null;
  const tags = new Set((recipe.tags ?? []).map(normalizeTag));
  const isImobRecipe = recipe.agentId === "IMOB" || tags.has("imob");
  if (!isImobRecipe) return null;

  if (
    tags.has("capture_seasonal_property")
    || tags.has("temporada")
    || tags.has("aluguel_por_temporada")
    || tags.has("locacao_temporada")
  ) {
    return {
      mission: "capture_seasonal_property",
      defaultGoal: "aluguel_por_temporada",
      recipeId: recipe.recipeId,
      startedFromMessage: null,
      lockedUntilExplicitChange: true,
    };
  }

  if (tags.has("capture_sale_property") || tags.has("venda")) {
    return {
      mission: "capture_sale_property",
      defaultGoal: "venda",
      recipeId: recipe.recipeId,
      startedFromMessage: null,
      lockedUntilExplicitChange: false,
    };
  }

  if (tags.has("capture_rental_property") || tags.has("locacao") || tags.has("locacao_anual")) {
    return {
      mission: "capture_rental_property",
      defaultGoal: "locacao",
      recipeId: recipe.recipeId,
      startedFromMessage: null,
      lockedUntilExplicitChange: false,
    };
  }

  return null;
}
