import { z } from "zod";

export const publicTaxonomyClassSchema = z.enum([
  "assistant_main",
  "specialist",
  "vertical",
  "operational_surface",
  "internal_component",
]);

export const publicTaxonomyVisibilitySchema = z.enum([
  "public",
  "preview",
  "internal",
]);

export const commercialStatusSchema = z.enum([
  "available",
  "pilot",
  "preview",
  "internal_only",
  "proposal",
  "not_public",
]);

export const verticalRoadmapOrderSchema = z.tuple([
  z.literal("LEGAL"),
  z.literal("MKT"),
  z.literal("Financeiro"),
  z.literal("URBAN"),
  z.literal("Logística"),
]);

export const publicProductTaxonomyEntrySchema = z.object({
  technicalId: z.string().min(1),
  publicName: z.string().min(1),
  taxonomyClass: publicTaxonomyClassSchema,
  visibility: publicTaxonomyVisibilitySchema,
  commercialStatus: commercialStatusSchema,
  approvedAliases: z.array(z.string().min(1)).default([]),
  forbiddenLabels: z.array(z.string().min(1)).default([]),
  allowedClaims: z.array(z.string().min(1)).default([]),
  forbiddenClaims: z.array(z.string().min(1)).default([]),
  sourceOfTruth: z.array(z.string().min(1)).default([]),
  runtimeRefs: z.array(z.string().min(1)).default([]),
  rolloutGates: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});

export const publicProductTaxonomyContractSchema = z.object({
  version: z.literal("1.0.0"),
  sourceOfTruth: z.array(z.string().min(1)).min(1),
  reservedInternalPrefixes: z.array(z.string().min(1)).min(1),
  verticalRoadmapOrder: verticalRoadmapOrderSchema,
  entries: z.array(publicProductTaxonomyEntrySchema).min(1),
});

export type PublicTaxonomyClass = z.infer<typeof publicTaxonomyClassSchema>;
export type PublicTaxonomyVisibility = z.infer<typeof publicTaxonomyVisibilitySchema>;
export type CommercialStatus = z.infer<typeof commercialStatusSchema>;
export type PublicProductTaxonomyEntry = z.infer<typeof publicProductTaxonomyEntrySchema>;
export type PublicProductTaxonomyContract = z.infer<typeof publicProductTaxonomyContractSchema>;
export type VerticalRoadmapOrder = z.infer<typeof verticalRoadmapOrderSchema>;

const contractSeed: PublicProductTaxonomyContract = {
  version: "1.0.0",
  sourceOfTruth: [
    "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
    "docs/architecture/public-product-taxonomy-policy.md",
    "apps/api/src/types/publicProductTaxonomyContract.ts",
  ],
  reservedInternalPrefixes: ["IMOB_"],
  verticalRoadmapOrder: ["LEGAL", "MKT", "Financeiro", "URBAN", "Logística"],
  entries: [
    {
      technicalId: "eiah",
      publicName: "EIAH",
      taxonomyClass: "assistant_main",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["EIAH Core", "assistente EIAH"],
      forbiddenLabels: [],
      allowedClaims: [
        "assistente principal",
        "front door da plataforma",
        "triagem, orientacao e handoff",
      ],
      forbiddenClaims: [
        "vertical",
        "area operacional",
      ],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "packages/core/src/actions/agents/eiahAction.ts",
      ],
      runtimeRefs: [
        "packages/core/src/actions/agents/eiahAction.ts",
        "apps/web/src/components/agents/platformHelpResolver.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "j360",
      publicName: "J_360",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Jurídico"],
      forbiddenLabels: [],
      allowedClaims: [
        "especialista juridico",
        "contratos, clausulas e risco juridico",
      ],
      forbiddenClaims: ["vertical", "assistente principal"],
      sourceOfTruth: [
        "packages/core/src/actions/agents/j360Action.ts",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "packages/core/src/actions/agents/j360Action.ts",
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "fin-nexus",
      publicName: "FinNexus",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Fin Nexus"],
      forbiddenLabels: [],
      allowedClaims: ["especialista financeiro", "pagamentos e conciliacao"],
      forbiddenClaims: ["vertical", "billing surface"],
      sourceOfTruth: [
        "packages/core/src/actions/agents/finNexusAction.ts",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "packages/core/src/actions/agents/finNexusAction.ts",
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "guardian",
      publicName: "Guardian",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["especialista em evidencias e verificabilidade"],
      forbiddenClaims: ["vertical", "surface de billing"],
      sourceOfTruth: [
        "packages/core/src/actions/agents/guardianAction.ts",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "packages/core/src/actions/agents/guardianAction.ts",
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "aadv",
      publicName: "AADV",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["especialista de consolidacao executiva"],
      forbiddenClaims: ["vertical", "surface operacional"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "defi-one",
      publicName: "DeFi One",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["DeFi_1"],
      forbiddenLabels: [],
      allowedClaims: ["especialista em simulacao DeFi"],
      forbiddenClaims: ["vertical", "surface operacional"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "onchain-monitor",
      publicName: "On-chain Monitor",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Onchain Monitor"],
      forbiddenLabels: [],
      allowedClaims: ["especialista em monitoramento on-chain"],
      forbiddenClaims: ["vertical", "assistente principal"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "risk-analyzer",
      publicName: "Risk Analyzer",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["especialista em leitura de risco"],
      forbiddenClaims: ["vertical", "assistente principal"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "MKT",
      publicName: "MKT",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Marketing GPS"],
      forbiddenLabels: [],
      allowedClaims: ["especialista de negocio para marketing"],
      forbiddenClaims: ["assistente principal", "promocao automatica a vertical"],
      sourceOfTruth: [
        "packages/core/src/actions/agents/mktAction.ts",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "packages/core/src/actions/agents/mktAction.ts",
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
      notes:
        "No runtime atual MKT aparece como especialista. Isso nao substitui a ordem publica da futura frente vertical MKT no roadmap.",
    },
    {
      technicalId: "pitch",
      publicName: "Pitch",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["especialista de negocio para narrativa comercial"],
      forbiddenClaims: ["vertical", "assistente principal"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "i_bc",
      publicName: "I_BC",
      taxonomyClass: "specialist",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["I_BC GPS", "IBC"],
      forbiddenLabels: [],
      allowedClaims: ["especialista de negocio para inteligencia comercial"],
      forbiddenClaims: ["vertical", "assistente principal"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/specialistExplainCatalog.ts",
      ],
      rolloutGates: ["check:chat-agent-onboarding"],
    },
    {
      technicalId: "IMOB",
      publicName: "IMOB",
      taxonomyClass: "vertical",
      visibility: "public",
      commercialStatus: "pilot",
      approvedAliases: ["vertical IMOB"],
      forbiddenLabels: [],
      allowedClaims: [
        "vertical imobiliaria",
        "contexto operacional imobiliario",
      ],
      forbiddenClaims: ["agente solto do catalogo", "subagente publico"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "docs/architecture/vertical-context-imob.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/imobContextResolver.ts",
        "apps/web/src/pages/app/imob/chat.tsx",
      ],
      rolloutGates: [
        "check:p4-trackp-rollout",
        "check:imob-chat-telemetry",
      ],
    },
    {
      technicalId: "LEGAL",
      publicName: "LEGAL",
      taxonomyClass: "vertical",
      visibility: "preview",
      commercialStatus: "preview",
      approvedAliases: ["vertical LEGAL"],
      forbiddenLabels: [],
      allowedClaims: [
        "vertical juridica em preview",
        "contexto juridico controlado",
      ],
      forbiddenClaims: ["vertical plenamente operacional", "available"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "docs/architecture/vertical-context-legal.md",
      ],
      runtimeRefs: [
        "apps/web/src/components/agents/legalContextResolver.ts",
      ],
      rolloutGates: ["preview_only"],
    },
    {
      technicalId: "billing",
      publicName: "Billing",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Billing & Quotas", "Controle financeiro"],
      forbiddenLabels: ["Agente Billing"],
      allowedClaims: ["area operacional", "custo, uso, quotas e reconciliacao"],
      forbiddenClaims: ["agente", "especialista"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "apps/web/src/pages/app/billing/index.tsx",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/billing/index.tsx",
        "apps/web/src/components/agents/helpDictionary.pages.ts",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "economy",
      publicName: "Economy",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: ["Agente Economy"],
      allowedClaims: ["area operacional", "impacto e oportunidades"],
      forbiddenClaims: ["agente", "especialista"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "apps/web/src/pages/app/economy/index.tsx",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/economy/index.tsx",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "run_viewer",
      publicName: "RunViewer",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["viewer de run"],
      forbiddenLabels: ["Agente RunViewer"],
      allowedClaims: ["surface operacional de investigacao"],
      forbiddenClaims: ["agente", "especialista"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
        "apps/web/src/components/runs/RunViewer.tsx",
      ],
      runtimeRefs: [
        "apps/web/src/components/runs/RunViewer.tsx",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "runs",
      publicName: "Runs",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: ["Agente Runs"],
      allowedClaims: ["area operacional", "execucao e acompanhamento"],
      forbiddenClaims: ["especialista", "vertical"],
      sourceOfTruth: [
        "apps/web/src/pages/app/runs/index.tsx",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/runs/index.tsx",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "marketplace",
      publicName: "Marketplace",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: [],
      forbiddenLabels: ["Agente Marketplace"],
      allowedClaims: ["area operacional", "ativacao de capacidades"],
      forbiddenClaims: ["especialista", "assistente principal"],
      sourceOfTruth: [
        "apps/web/src/pages/app/marketplace/index.tsx",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/marketplace/index.tsx",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "self_service",
      publicName: "Self-service",
      taxonomyClass: "operational_surface",
      visibility: "public",
      commercialStatus: "available",
      approvedAliases: ["Self service"],
      forbiddenLabels: ["Agente Self-service"],
      allowedClaims: ["area operacional", "fluxos guiados"],
      forbiddenClaims: ["especialista", "vertical"],
      sourceOfTruth: [
        "apps/web/src/pages/self-service/index.tsx",
      ],
      runtimeRefs: [
        "apps/web/src/pages/self-service/index.tsx",
      ],
      rolloutGates: ["check:frontend-duplication"],
    },
    {
      technicalId: "IMOB_CRM",
      publicName: "IMOB_CRM",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "internal_only",
      approvedAliases: [],
      forbiddenLabels: ["produto IMOB_CRM"],
      allowedClaims: ["componente interno da vertical IMOB"],
      forbiddenClaims: ["nome publico principal", "agente publico", "vertical publica"],
      sourceOfTruth: [
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      ],
      runtimeRefs: [
        "apps/api/src/tests/imob-crm-turn-engine.test.ts",
      ],
      rolloutGates: ["internal_only"],
    },
    {
      technicalId: "flow-orchestrator",
      publicName: "Flow Orchestrator",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "internal_only",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["componente operacional interno"],
      forbiddenClaims: ["assistente principal", "vertical publica"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/agents/index.tsx",
      ],
      rolloutGates: ["internal_only"],
    },
    {
      technicalId: "diarias",
      publicName: "Diarias",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "internal_only",
      approvedAliases: ["Diarias GPS"],
      forbiddenLabels: [],
      allowedClaims: ["componente operacional interno"],
      forbiddenClaims: ["assistente principal", "vertical publica"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/agents/index.tsx",
      ],
      rolloutGates: ["internal_only"],
    },
    {
      technicalId: "nft-py",
      publicName: "NFT PY",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "internal_only",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["componente operacional interno"],
      forbiddenClaims: ["assistente principal", "vertical publica"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/agents/index.tsx",
      ],
      rolloutGates: ["internal_only"],
    },
    {
      technicalId: "image-nft-diarias",
      publicName: "Image NFT Diarias",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "internal_only",
      approvedAliases: [],
      forbiddenLabels: [],
      allowedClaims: ["componente operacional interno"],
      forbiddenClaims: ["assistente principal", "vertical publica"],
      sourceOfTruth: [
        "docs/ops/agent-registry-catalog.md",
      ],
      runtimeRefs: [
        "apps/web/src/pages/app/agents/index.tsx",
      ],
      rolloutGates: ["internal_only"],
    },
    {
      technicalId: "VERA",
      publicName: "VERA",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "proposal",
      approvedAliases: [],
      forbiddenLabels: ["VERA available"],
      allowedClaims: ["proposta nao verificada"],
      forbiddenClaims: ["available", "produto validado"],
      sourceOfTruth: [],
      runtimeRefs: [],
      rolloutGates: ["missing_canonical_source", "missing_evidence"],
      notes:
        "Nao promover para available sem fonte canônica e evidencia indexavel.",
    },
    {
      technicalId: "revenue",
      publicName: "Revenue",
      taxonomyClass: "internal_component",
      visibility: "internal",
      commercialStatus: "proposal",
      approvedAliases: [],
      forbiddenLabels: ["Revenue available"],
      allowedClaims: ["proposta nao verificada"],
      forbiddenClaims: ["available", "produto validado"],
      sourceOfTruth: [],
      runtimeRefs: [],
      rolloutGates: ["missing_canonical_source", "missing_evidence"],
      notes:
        "Nao promover para available sem fonte canônica e evidencia indexavel.",
    },
  ],
};

function normalizeTaxonomyLookup(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function assertPublicProductTaxonomyContract(contract: PublicProductTaxonomyContract) {
  const seenTechnicalIds = new Set<string>();
  const seenPublicNames = new Set<string>();

  for (const entry of contract.entries) {
    const normalizedTechnicalId = normalizeTaxonomyLookup(entry.technicalId);
    const normalizedPublicName = normalizeTaxonomyLookup(entry.publicName);
    if (seenTechnicalIds.has(normalizedTechnicalId)) {
      throw new Error(`duplicate technicalId in public taxonomy: ${entry.technicalId}`);
    }
    if (seenPublicNames.has(normalizedPublicName)) {
      throw new Error(`duplicate publicName in public taxonomy: ${entry.publicName}`);
    }
    seenTechnicalIds.add(normalizedTechnicalId);
    seenPublicNames.add(normalizedPublicName);

    if (entry.commercialStatus === "available" && entry.sourceOfTruth.length === 0) {
      throw new Error(`available entry without sourceOfTruth: ${entry.publicName}`);
    }
  }

  const requiredEntries = {
    EIAH: {
      taxonomyClass: "assistant_main",
      commercialStatus: "available",
    },
    IMOB: {
      taxonomyClass: "vertical",
    },
    LEGAL: {
      taxonomyClass: "vertical",
      commercialStatus: "preview",
      visibility: "preview",
    },
    Billing: {
      taxonomyClass: "operational_surface",
    },
    Economy: {
      taxonomyClass: "operational_surface",
    },
    RunViewer: {
      taxonomyClass: "operational_surface",
    },
    IMOB_CRM: {
      taxonomyClass: "internal_component",
      commercialStatus: "internal_only",
    },
    VERA: {
      commercialStatus: "proposal",
    },
    Revenue: {
      commercialStatus: "proposal",
    },
  } as const;

  for (const [publicName, expected] of Object.entries(requiredEntries)) {
    const entry = contract.entries.find((item) => item.publicName === publicName);
    if (!entry) throw new Error(`missing required public taxonomy entry: ${publicName}`);
    for (const [key, value] of Object.entries(expected)) {
      if ((entry as Record<string, unknown>)[key] !== value) {
        throw new Error(`invalid ${key} for ${publicName}: expected ${value}, got ${(entry as Record<string, unknown>)[key]}`);
      }
    }
  }

  const exactOrder = ["LEGAL", "MKT", "Financeiro", "URBAN", "Logística"].join("|");
  if (contract.verticalRoadmapOrder.join("|") !== exactOrder) {
    throw new Error(`invalid verticalRoadmapOrder: ${contract.verticalRoadmapOrder.join(" -> ")}`);
  }
}

export const publicProductTaxonomyContract = publicProductTaxonomyContractSchema.parse(contractSeed);

assertPublicProductTaxonomyContract(publicProductTaxonomyContract);

export const publicProductTaxonomyEntries = publicProductTaxonomyContract.entries;
export const publicProductTaxonomySourceOfTruth = publicProductTaxonomyContract.sourceOfTruth;
export const publicProductTaxonomyVerticalRoadmapOrder = publicProductTaxonomyContract.verticalRoadmapOrder;
export const publicProductTaxonomyReservedInternalPrefixes = publicProductTaxonomyContract.reservedInternalPrefixes;

export function getPublicProductTaxonomyEntryByTechnicalId(technicalId: string) {
  const lookup = normalizeTaxonomyLookup(technicalId);
  return publicProductTaxonomyEntries.find((entry) => normalizeTaxonomyLookup(entry.technicalId) === lookup) ?? null;
}

export function getPublicProductTaxonomyEntryByPublicName(publicName: string) {
  const lookup = normalizeTaxonomyLookup(publicName);
  return publicProductTaxonomyEntries.find((entry) => normalizeTaxonomyLookup(entry.publicName) === lookup) ?? null;
}

export function getPublicProductTaxonomyEntryByAnyName(value: string) {
  const lookup = normalizeTaxonomyLookup(value);
  for (const entry of publicProductTaxonomyEntries) {
    if (normalizeTaxonomyLookup(entry.technicalId) === lookup) return entry;
    if (normalizeTaxonomyLookup(entry.publicName) === lookup) return entry;
    if (entry.approvedAliases.some((alias) => normalizeTaxonomyLookup(alias) === lookup)) return entry;
  }
  return null;
}

export function listPublicProductTaxonomyByClass(taxonomyClass: PublicTaxonomyClass) {
  return publicProductTaxonomyEntries.filter((entry) => entry.taxonomyClass === taxonomyClass);
}

export function listPublicProductTaxonomyByVisibility(visibility: PublicTaxonomyVisibility) {
  return publicProductTaxonomyEntries.filter((entry) => entry.visibility === visibility);
}

export function listPublicPrimaryEntries() {
  return publicProductTaxonomyEntries.filter((entry) => entry.visibility !== "internal");
}

export function isPubliclyAvailableProduct(entry: PublicProductTaxonomyEntry) {
  return entry.commercialStatus === "available" || entry.commercialStatus === "pilot";
}
