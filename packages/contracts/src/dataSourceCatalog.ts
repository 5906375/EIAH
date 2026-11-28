import { dataSourceV1Schema, type DataSourceV1 } from "./dataSources.js";

/**
 * Catálogo inicial de fontes (metadado puro). Importar este módulo NÃO executa chamadas, NÃO lê segredo,
 * NÃO consulta variável de ambiente e NÃO agenda job. Também não valida no import: a validação é uma função
 * explícita (`validateDataSourceCatalog`), para que um erro de catálogo nunca derrube quem só importa o pacote.
 *
 * Todas as entradas estão em `mapped` e com `authorizationGranted: false`. Estar no catálogo não ativa a fonte,
 * não cria conexão e não concede permissão a ninguém.
 *
 * Nenhuma URL oficial, licença, periodicidade, limite, cobertura ou responsável foi encontrado em arquivo
 * versionado do repositório; por isso esses metadados estão `unknown` e NÃO foram preenchidos de memória.
 * A única informação declarada é a modalidade pretendida, com a base registrada em `DECLARED_BASIS`.
 */
const DECLARED_BASIS = "Instrução do responsável pelo projeto em 2026-11-03 (fonte classe A/C); não confirmado na fonte oficial.";

const unknown = { status: "unknown" } as const;

function entry(
  sourceId: string,
  provider: string,
  purpose: string,
  domain: DataSourceV1["domain"],
  modes: Array<"open_api" | "data_file">,
): DataSourceV1 {
  return {
    schemaVersion: "eiah.data-source.v1",
    sourceId,
    sourceVersion: 1,
    provider,
    purpose,
    domain,
    coverage: unknown,
    supportedAccessModes: { status: "declared", value: modes, basis: DECLARED_BASIS },
    documentation: unknown,
    licenseTerms: unknown,
    usageCondition: "not_assessed",
    expectedUpdateFrequency: unknown,
    knownLimits: unknown,
    steward: unknown,
    lifecycleState: "mapped",
    authorizationGranted: false,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const DATA_SOURCE_CATALOG_V1: readonly DataSourceV1[] = deepFreeze([
  entry("receita.classif.ncm", "Receita Federal — Classif", "Nomenclatura Comum do Mercosul (NCM)", "customs_classification", ["open_api", "data_file"]),
  entry("ibge.localidades", "IBGE", "Localidades (referência geográfica)", "geographic_reference", ["open_api"]),
  entry("bcb.ptax", "Banco Central do Brasil", "Taxa de câmbio PTAX", "exchange_rate", ["open_api"]),
  entry("mdic.comexstat", "MDIC — Comex Stat", "Estatísticas de comércio exterior", "foreign_trade_statistics", ["open_api"]),
]);

/** Fonte desconhecida → `null` (fail-closed para quem consulta). Não indica autorização nem ativação. */
export function findDataSource(sourceId: string, catalog: readonly DataSourceV1[] = DATA_SOURCE_CATALOG_V1): DataSourceV1 | null {
  return catalog.find((source) => source.sourceId === sourceId) ?? null;
}

export type DataSourceCatalogIssue = {
  code: "INVALID_ENTRY" | "DUPLICATE_SOURCE_ID";
  sourceId?: string;
  index: number;
  message: string;
};

export function validateDataSourceCatalog(catalog: readonly unknown[]): { ok: boolean; issues: DataSourceCatalogIssue[] } {
  const issues: DataSourceCatalogIssue[] = [];
  const seen = new Map<string, number>();
  catalog.forEach((candidate, index) => {
    const parsed = dataSourceV1Schema.safeParse(candidate);
    if (!parsed.success) {
      const sourceId = typeof (candidate as { sourceId?: unknown })?.sourceId === "string" ? (candidate as { sourceId: string }).sourceId : undefined;
      issues.push({ code: "INVALID_ENTRY", sourceId, index, message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") });
      return;
    }
    const firstIndex = seen.get(parsed.data.sourceId);
    if (firstIndex !== undefined) {
      issues.push({ code: "DUPLICATE_SOURCE_ID", sourceId: parsed.data.sourceId, index, message: `sourceId já cadastrado na posição ${firstIndex}` });
      return;
    }
    seen.set(parsed.data.sourceId, index);
  });
  return { ok: issues.length === 0, issues };
}
