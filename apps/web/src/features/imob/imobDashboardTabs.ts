export type ImobDashboardTab = "funil" | "casos" | "solucoes" | "imoveis" | "parceiros";

export function resolveImobDashboardTab(
  rawTab: string,
  legacySection: string,
  legacyCcOpen: boolean,
): ImobDashboardTab {
  const normalizedTab = rawTab.trim().toLowerCase();
  const normalizedSection = legacySection.trim().toLowerCase();
  const allTabs: readonly ImobDashboardTab[] = ["funil", "casos", "solucoes", "imoveis", "parceiros"];

  if ((allTabs as readonly string[]).includes(normalizedTab)) return normalizedTab as ImobDashboardTab;
  if (normalizedTab === "equipe") return "funil";
  if (normalizedTab === "processos" || normalizedSection === "processos") return "casos";
  if (normalizedTab === "operacional") return "casos";
  if (legacyCcOpen) return "casos";
  if (normalizedSection === "parceiros") return "parceiros";
  if (normalizedSection === "imoveis") return "imoveis";
  return "funil";
}
