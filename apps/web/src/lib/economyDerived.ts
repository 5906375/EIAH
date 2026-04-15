import type { ShadowExecutionContract } from "./api";

export function countShadowExecutionsByStage(items: ShadowExecutionContract[]) {
  return items.reduce<Record<ShadowExecutionContract["currentStage"], number>>(
    (acc, item) => {
      acc[item.currentStage] += 1;
      return acc;
    },
    {
      sandbox: 0,
      preview: 0,
      approval: 0,
      promotion: 0,
      production: 0,
    }
  );
}
