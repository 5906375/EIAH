export type ContractType = "locacao" | "compra_venda" | "administracao" | "temporada";

export type ClauseCategory =
  | "property"
  | "payment"
  | "guarantee"
  | "termination"
  | "liability"
  | "data_protection";

export type Clause = {
  id: string;
  title: string;
  category: ClauseCategory;
  template: string;
  legalBase?: string[];
  variables?: string[];
  condition?: {
    field: string;
    value: unknown;
  };
};

export type ContractGraphNode = {
  fieldId: string;
  next?: string;
  condition?: {
    field: string;
    value: unknown;
    next: string;
  };
};

export type ContractGraph = {
  start: string;
  nodes: Record<string, ContractGraphNode>;
};

export type ContractSchema = {
  contractType: ContractType;
  version: string;
  legalBase: string[];
  clauses?: string[];
  graph?: ContractGraph;
};

export type ComposedClause = Clause & {
  number: number;
  renderedText: string;
};

export type LegalReviewResult = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
};
