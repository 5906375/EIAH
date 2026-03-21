import { buildImobDriveSearchUrl, readImobDriveSyncSnapshot } from "./imobDriveSync";

export type ImobKnowledgeSourceType = "drive" | "upload" | "web" | "internal_doc";

export type ImobKnowledgeSearchFilters = {
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  documentType?: string | null;
  operationType?: string | null;
  tags?: string[] | null;
};

export type ImobKnowledgeSearchParams = {
  tenantId: string;
  workspaceId: string;
  query: string;
  filters?: ImobKnowledgeSearchFilters;
};

export type ImobKnowledgeSearchItem = {
  id: string;
  tenantId: string;
  workspaceId: string;
  sourceType: ImobKnowledgeSourceType;
  externalId: string;
  driveFileId?: string | null;
  title: string;
  href: string;
  mimeType: string;
  region: string;
  segment: "locacao" | "venda" | "ambos";
  documentType: string;
  operationType: string;
  tags: string[];
  metadataJson: Record<string, unknown>;
  contentText?: string | null;
  vectorEmbedding?: number[] | null;
  updatedAt: string;
};

export type ImobKnowledgeSearchResult = {
  query: string;
  appliedFilters: ImobKnowledgeSearchFilters;
  total: number;
  items: Array<
    Pick<
      ImobKnowledgeSearchItem,
      | "id"
      | "sourceType"
      | "title"
      | "href"
      | "mimeType"
      | "region"
      | "segment"
      | "documentType"
      | "operationType"
      | "tags"
      | "updatedAt"
    > & {
      snippet: string;
    }
  >;
};

type SeedDocument = Omit<ImobKnowledgeSearchItem, "tenantId" | "workspaceId">;

const SEED_DOCUMENTS: SeedDocument[] = [
  {
    id: "doc-locacao-proposta-sp",
    sourceType: "drive",
    externalId: "drive-proposta-locacao-sp",
    title: "Modelo de proposta de locação - São Paulo",
    href: buildImobDriveSearchUrl("Modelo de proposta de locação São Paulo"),
    mimeType: "application/pdf",
    region: "São Paulo",
    segment: "locacao",
    documentType: "proposta",
    operationType: "locacao",
    tags: ["proposta", "locacao", "sao paulo", "modelo"],
    metadataJson: { folder: "propostas/locacao", source: "drive" },
    contentText:
      "Modelo base de proposta de locação residencial em São Paulo com condições comerciais, garantias e próximos passos.",
    updatedAt: "2026-03-21T12:00:00.000Z",
  },
  {
    id: "doc-contrato-locacao-sc",
    sourceType: "drive",
    externalId: "drive-contrato-locacao-sc",
    title: "Checklist contratual de locação - Santa Catarina",
    href: buildImobDriveSearchUrl("Checklist contratual de locação Santa Catarina"),
    mimeType: "application/pdf",
    region: "Santa Catarina",
    segment: "locacao",
    documentType: "checklist",
    operationType: "locacao",
    tags: ["contrato", "checklist", "locacao", "santa catarina"],
    metadataJson: { folder: "contratos/locacao", source: "drive" },
    contentText:
      "Checklist para conferência de documentação, garantia locatícia e cláusulas críticas em contratos de locação.",
    updatedAt: "2026-03-21T12:00:00.000Z",
  },
  {
    id: "doc-captacao-venda-br",
    sourceType: "internal_doc",
    externalId: "internal-captacao-venda-br",
    title: "Playbook de captação para venda residencial",
    href: "/app/imob/chat?doc=internal-captacao-venda-br",
    mimeType: "text/plain",
    region: "Brasil",
    segment: "venda",
    documentType: "playbook",
    operationType: "captacao",
    tags: ["captacao", "venda", "residencial", "playbook"],
    metadataJson: { folder: "playbooks/captacao", source: "internal_doc" },
    contentText:
      "Fluxo de captação para venda: qualificação do imóvel, documentação inicial, anúncio e organização do próximo passo comercial.",
    updatedAt: "2026-03-21T12:00:00.000Z",
  },
  {
    id: "doc-venda-rj-proposta",
    sourceType: "web",
    externalId: "web-venda-rj-proposta",
    title: "Guia de proposta e negociação para venda - Rio de Janeiro",
    href: "https://conteudo.imob.example/rj/proposta-venda",
    mimeType: "text/html",
    region: "Rio de Janeiro",
    segment: "venda",
    documentType: "guia",
    operationType: "negociacao",
    tags: ["venda", "proposta", "negociacao", "rio de janeiro"],
    metadataJson: { source: "web", folder: "guias/venda" },
    contentText:
      "Guia com estrutura de proposta, contraproposta e checklist de negociação para venda de imóveis no Rio de Janeiro.",
    updatedAt: "2026-03-21T12:00:00.000Z",
  },
  {
    id: "doc-cidade-regiao-template",
    sourceType: "upload",
    externalId: "upload-cidade-regiao-template",
    title: "Template de busca por cidade e região",
    href: "/app/imob/chat?doc=upload-cidade-regiao-template",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    region: "Brasil",
    segment: "ambos",
    documentType: "template",
    operationType: "captacao",
    tags: ["cidade", "regiao", "template", "pesquisa"],
    metadataJson: { source: "upload", folder: "templates/pesquisa" },
    contentText:
      "Template operacional para filtrar acervo por cidade, região, segmento, tipo documental e operação imobiliária.",
    updatedAt: "2026-03-21T12:00:00.000Z",
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildScopedDocuments(params: { tenantId: string; workspaceId: string }) {
  return SEED_DOCUMENTS.map((item) => ({
    ...item,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  }));
}

function matchesFilters(item: ImobKnowledgeSearchItem, filters: ImobKnowledgeSearchFilters) {
  if (filters.region && filters.region !== "Brasil" && normalizeText(item.region) !== normalizeText(filters.region)) {
    return false;
  }
  if (filters.segment && filters.segment !== "ambos" && item.segment !== "ambos" && item.segment !== filters.segment) {
    return false;
  }
  if (filters.documentType && normalizeText(item.documentType) !== normalizeText(filters.documentType)) {
    return false;
  }
  if (filters.operationType && normalizeText(item.operationType) !== normalizeText(filters.operationType)) {
    return false;
  }
  if (filters.tags && filters.tags.length > 0) {
    const tagSet = new Set(item.tags.map((tag) => normalizeText(tag)));
    const hasAnyTag = filters.tags.some((tag) => tagSet.has(normalizeText(tag)));
    if (!hasAnyTag) return false;
  }
  return true;
}

function scoreItem(item: ImobKnowledgeSearchItem, tokens: string[]) {
  if (tokens.length === 0) return 1;
  const haystack = [
    item.title,
    item.region,
    item.segment,
    item.documentType,
    item.operationType,
    item.tags.join(" "),
    item.contentText ?? "",
  ]
    .map((part) => normalizeText(part))
    .join(" ");
  return tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
}

function buildSnippet(item: ImobKnowledgeSearchItem, query: string) {
  const source = item.contentText ?? `${item.title}. ${item.documentType}. ${item.operationType}.`;
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return source.slice(0, 180);
  const index = normalizeText(source).indexOf(normalizedQuery);
  if (index < 0) return source.slice(0, 180);
  return source.slice(Math.max(0, index - 20), index + 160);
}

export async function searchImobKnowledge(params: ImobKnowledgeSearchParams): Promise<ImobKnowledgeSearchResult> {
  const filters = params.filters ?? {};
  const query = params.query.trim();
  const tokens = tokenize(query);
  const seededDocuments = buildScopedDocuments({ tenantId: params.tenantId, workspaceId: params.workspaceId });
  const driveSnapshot = await readImobDriveSyncSnapshot();
  const driveDocuments: ImobKnowledgeSearchItem[] =
    driveSnapshot?.documents
      .filter((item) => item.tenantId === params.tenantId && item.workspaceId === params.workspaceId)
      .map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        workspaceId: item.workspaceId,
        sourceType: item.sourceType,
        externalId: item.externalId,
        driveFileId: item.driveFileId,
        title: item.title,
        href: item.href,
        mimeType: item.mimeType,
        region: item.region,
        segment: item.segment,
        documentType: item.documentType,
        operationType: item.operationType,
        tags: item.tags,
        metadataJson: item.metadataJson,
        contentText: null,
        vectorEmbedding: null,
        updatedAt: item.updatedAt,
      })) ?? [];
  const documents = [...driveDocuments, ...seededDocuments];

  const filtered = documents
    .filter((item) => item.tenantId === params.tenantId && item.workspaceId === params.workspaceId)
    .filter((item) => matchesFilters(item, filters))
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .slice(0, 8)
    .map(({ item }) => ({
      id: item.id,
      sourceType: item.sourceType,
      title: item.title,
      href: item.href,
      mimeType: item.mimeType,
      region: item.region,
      segment: item.segment,
      documentType: item.documentType,
      operationType: item.operationType,
      tags: item.tags,
      updatedAt: item.updatedAt,
      snippet: buildSnippet(item, query),
    }));

  return {
    query,
    appliedFilters: filters,
    total: filtered.length,
    items: filtered,
  };
}
