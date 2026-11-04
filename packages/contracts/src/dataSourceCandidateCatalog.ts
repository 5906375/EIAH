import { DATA_SOURCE_CATALOG_V1 } from "./dataSourceCatalog.js";
import {
  upgradeDataSourceV1ToV2,
  type DataPlatformV1,
  type DataProviderV1,
  type DataSourceRegistryV2,
  type DataSourceV2,
} from "./dataSourceModel.js";

/**
 * Catálogo candidato v2 (metadado puro). Importá-lo NÃO faz chamada, NÃO lê ambiente/segredo e NÃO agenda job; também não
 * se valida no import (use `validateDataSourceRegistryV2`). Todas as fontes estão em `mapped` e `authorizationGranted: false`.
 *
 * O que é afirmado aqui vem EXCLUSIVAMENTE da instrução do responsável pelo projeto (2026-11-03) e está marcado `declared`
 * (= a confirmar). Todo o resto está `unknown`: nada foi preenchido de memória nem por consulta à rede.
 * Não há fornecedor privado, parceiro, conexão, credencial ou canal cadastrado.
 */
const BASIS = "Instrução do responsável pelo projeto em 2026-11-03; não confirmado em fonte oficial.";
const UNKNOWN = { status: "unknown" } as const;
const declared = <T>(value: T) => ({ status: "declared", value, basis: BASIS }) as const;

function provider(
  providerId: string,
  displayName: string,
  category: "public_body" | "international_organization",
  nature: "public_sector" | "international_public",
): DataProviderV1 {
  return {
    schemaVersion: "eiah.data-provider.v1",
    providerId,
    displayName,
    scope: { kind: "shared" },
    categories: declared([category]),
    nature: declared(nature),
    authorizationGranted: false,
  };
}

/** Fornecedores citados pela instrução. UN Comtrade e LexML NÃO têm fornecedor cadastrado: o responsável está a confirmar. */
const providers: DataProviderV1[] = [
  provider("receita-federal", "Receita Federal", "public_body", "public_sector"),
  provider("ibge", "IBGE", "public_body", "public_sector"),
  provider("banco-central", "Banco Central do Brasil", "public_body", "public_sector"),
  provider("mdic", "MDIC", "public_body", "public_sector"),
  provider("imprensa-nacional", "Imprensa Nacional", "public_body", "public_sector"),
  provider("antaq", "ANTAQ", "public_body", "public_sector"),
  provider("omc", "OMC", "international_organization", "international_public"),
];

/** Portal Único é PLATAFORMA (não organização, não fonte). Operadores e módulos estão por identificar. */
const platforms: DataPlatformV1[] = [
  {
    schemaVersion: "eiah.data-platform.v1",
    platformId: "siscomex.portal-unico",
    displayName: "Portal Único Siscomex",
    scope: { kind: "shared" },
    operators: UNKNOWN,
    modules: UNKNOWN,
    mappingState: "mapped",
    authorizationGranted: false,
  },
];

const responsible = (providerId: string) => declared([{ providerId, role: "institutional_responsible" as const }]);

/** As 4 fontes iniciais são PRESERVADAS por migração explícita do v1 (identidade, versão, finalidade e fatos intactos). */
const INITIAL: ReadonlyArray<{ sourceId: string; name: string; providerId: string }> = [
  { sourceId: "receita.classif.ncm", name: "Receita Federal/Classif — NCM", providerId: "receita-federal" },
  { sourceId: "ibge.localidades", name: "IBGE — Localidades", providerId: "ibge" },
  { sourceId: "bcb.ptax", name: "Banco Central — PTAX", providerId: "banco-central" },
  { sourceId: "mdic.comexstat", name: "MDIC — Comex Stat", providerId: "mdic" },
];

const preserved: DataSourceV2[] = INITIAL.map(({ sourceId, name, providerId }) => {
  const v1 = DATA_SOURCE_CATALOG_V1.find((s) => s.sourceId === sourceId);
  if (!v1) throw new Error(`catálogo v1 não contém ${sourceId}`);
  const result = upgradeDataSourceV1ToV2(v1, { name, responsibleParties: responsible(providerId) });
  if (!result.ok) throw new Error(`migração v1→v2 recusada para ${sourceId}: ${result.field}`);
  return result.source;
});

function candidate(input: {
  sourceId: string;
  name: string;
  purpose: string;
  domain: DataSourceV2["domain"];
  responsibleParties?: DataSourceV2["responsibleParties"];
  granularity?: DataSourceV2["granularity"];
}): DataSourceV2 {
  return {
    schemaVersion: "eiah.data-source.v2",
    sourceId: input.sourceId,
    sourceVersion: 1,
    name: input.name,
    scope: { kind: "shared" },
    purpose: input.purpose,
    domain: input.domain,
    granularity: input.granularity ?? UNKNOWN,
    responsibleParties: input.responsibleParties ?? UNKNOWN,
    coverage: UNKNOWN,
    informationKinds: UNKNOWN,
    candidateAccessModes: UNKNOWN,
    confirmedAccessModes: UNKNOWN,
    documentation: UNKNOWN,
    authentication: UNKNOWN,
    licenseTerms: UNKNOWN,
    reuseConditions: UNKNOWN,
    usageCondition: "not_assessed",
    limits: UNKNOWN,
    costs: UNKNOWN,
    expectedUpdateFrequency: UNKNOWN,
    steward: UNKNOWN,
    lifecycleState: "mapped",
    authorizationGranted: false,
  };
}

/** Candidatos: modalidades, cobertura, documentação, licença etc. ficam `unknown` — nenhuma modalidade foi forçada. */
const candidates: DataSourceV2[] = [
  candidate({ sourceId: "lexml.service-to-confirm", name: "LexML (serviço e responsável institucional a confirmar)", purpose: "Fonte candidata de texto normativo; finalidade operacional a definir", domain: "legal_normative" }),
  candidate({ sourceId: "imprensa-nacional.dou-inlabs", name: "Imprensa Nacional — DOU/INLABS", purpose: "Fonte candidata de publicações do Diário Oficial; finalidade operacional a definir", domain: "legal_normative", responsibleParties: responsible("imprensa-nacional") }),
  candidate({ sourceId: "antaq.datasets-to-select", name: "ANTAQ — conjuntos de dados a selecionar", purpose: "Conjunto candidato; os dados específicos ainda não foram selecionados", domain: "port_logistics", responsibleParties: responsible("antaq"), granularity: declared("collection_to_select" as const) }),
  candidate({ sourceId: "un.comtrade.service-to-confirm", name: "UN Comtrade (serviço e responsável institucional a confirmar)", purpose: "Fonte candidata de estatística de comércio exterior; serviço a confirmar", domain: "foreign_trade_statistics" }),
  candidate({ sourceId: "omc.data-services-to-select", name: "OMC — serviços de dados a selecionar", purpose: "Conjunto candidato; os serviços de dados ainda não foram selecionados", domain: "other", responsibleParties: responsible("omc"), granularity: declared("collection_to_select" as const) }),
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const DATA_SOURCE_REGISTRY_V2: DataSourceRegistryV2 = deepFreeze({
  providers,
  platforms,
  sources: [...preserved, ...candidates],
});
