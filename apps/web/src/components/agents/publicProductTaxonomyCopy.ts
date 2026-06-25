import {
  getPublicProductTaxonomyEntryByPublicName,
  listPublicProductTaxonomyByClass,
  publicProductTaxonomyVerticalRoadmapOrder,
  type PublicProductTaxonomyEntry,
} from "@eiah/core/taxonomy/publicProductTaxonomy";

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

function isPublicDecisionEntry(entry: PublicProductTaxonomyEntry) {
  return entry.visibility !== "internal";
}

function formatStatusLabel(entry: PublicProductTaxonomyEntry) {
  switch (entry.commercialStatus) {
    case "pilot":
      return "piloto";
    case "preview":
      return "preview";
    case "available":
      return "disponivel";
    default:
      return entry.commercialStatus;
  }
}

export function buildPublicTaxonomySummaryLine() {
  const assistant = getPublicProductTaxonomyEntryByPublicName("EIAH");
  const specialists = listPublicProductTaxonomyByClass("specialist")
    .filter(isPublicDecisionEntry)
    .map((entry) => entry.publicName);
  const verticals = listPublicProductTaxonomyByClass("vertical")
    .filter(isPublicDecisionEntry)
    .map((entry) => `${entry.publicName} (${formatStatusLabel(entry)})`);
  const surfaces = listPublicProductTaxonomyByClass("operational_surface")
    .filter((entry) => isPublicDecisionEntry(entry) && ["Billing", "Economy", "RunViewer"].includes(entry.publicName))
    .map((entry) => entry.publicName);

  return [
    `${assistant?.publicName ?? "EIAH"} como assistente principal/front door.`,
    `Especialistas publicos: ${formatList(specialists)}.`,
    `Verticais: ${formatList(verticals)}.`,
    `Areas operacionais: ${formatList(surfaces)}.`,
  ].join(" ");
}

export function buildPublicTaxonomyCatalogLine() {
  const domainSpecialists = ["J_360", "FinNexus", "Guardian", "AADV", "DeFi One", "On-chain Monitor", "Risk Analyzer"];
  const businessSpecialists = ["MKT", "Pitch", "I_BC"];
  return [
    `Use a taxonomia publica com clareza: EIAH como assistente principal; ${formatList(domainSpecialists)} como especialistas de dominio; ${formatList(businessSpecialists)} como especialistas de negocio; IMOB e LEGAL como verticais; Billing, Economy e RunViewer como areas operacionais.`,
    "Flow Orchestrator, Diarias, NFT PY e Image NFT Diarias ficam como componentes internos e nao como nomes publicos principais.",
  ].join(" ");
}

export function buildPublicTaxonomyBoundaryLine() {
  return "`IMOB_CRM` e componentes `IMOB_*` permanecem internos e nao entram como nome publico principal.";
}

export function buildPublicTaxonomyRoadmapLine() {
  return `Ordem oficial das proximas frentes verticais: ${publicProductTaxonomyVerticalRoadmapOrder.join(" -> ")}.`;
}

export function buildImobIsVerticalReply() {
  const imob = getPublicProductTaxonomyEntryByPublicName("IMOB");
  return [
    "**IMOB na taxonomia publica**",
    "",
    `\`IMOB\` e tratado como ${imob?.taxonomyClass ?? "vertical"}, nao como agente solto do catalogo.`,
    "Na pratica, ele funciona como contexto de vertical da jornada imobiliaria dentro do EIAH.",
    "",
    buildPublicTaxonomyRoadmapLine(),
  ].join("\n");
}

export function buildBillingIsOperationalSurfaceReply() {
  const billing = getPublicProductTaxonomyEntryByPublicName("Billing");
  return [
    "**Billing na taxonomia publica**",
    "",
    `\`Billing\` e ${billing?.taxonomyClass === "operational_surface" ? "uma area operacional" : billing?.taxonomyClass}, nao um agente.`,
    "Ele organiza custo, uso, quotas e reconciliacao do tenant/workspace.",
    "",
    "Se a necessidade for profundidade de dominio financeiro, o especialista correto continua sendo o `FinNexus`.",
  ].join("\n");
}

export function buildImobCrmInternalReply() {
  return [
    "**IMOB_CRM na taxonomia publica**",
    "",
    "`IMOB_CRM` e componente interno da vertical IMOB.",
    "Ele nao deve aparecer como nome publico principal de produto, agente ou vertical.",
    "",
    buildPublicTaxonomyBoundaryLine(),
  ].join("\n");
}
