export type ContractType =
  | "locacao"
  | "compra_venda"
  | "administracao"
  | "temporada";

export type ContractFieldType =
  | "text"
  | "currency"
  | "number"
  | "choice"
  | "date"
  | "boolean"
  | "percentage"
  | "cpf"
  | "cnpj"
  | "address";

export type ContractField = {
  id: string;

  label: string;

  question: string;

  type: ContractFieldType;

  required?: boolean;

  options?: { id: string; label: string }[];

  placeholder?: string;

  helpText?: string;

  group?:
  | "parties"
  | "property"
  | "financial"
  | "dates"
  | "guarantee"
  | "legal";

  validation?: {
    min?: number;
    max?: number;
    regex?: string;
  };

  dependsOn?: {
    field: string;
    value: any;
  };

  pii?: "LOW" | "MEDIUM" | "HIGH";
};

export type ContractSchema = {
  contractType: ContractType;

  version: string;

  legalBase: string[];

  fields: ContractField[];

  clauses?: string[];

  graph?: ContractGraph;
};

export type Clause = {
  id: string;
  title: string;
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

export const CONTRACT_TYPE_OPTIONS: Array<{
  id: ContractType;
  label: string;
  aliases: string[];
}> = [
    {
      id: "locacao",
      label: "Locação",
      aliases: ["1", "locacao", "aluguel", "alugar"],
    },
    {
      id: "compra_venda",
      label: "Compra e Venda",
      aliases: ["2", "compra", "venda", "compra e venda"],
    },
    {
      id: "administracao",
      label: "Administração",
      aliases: ["3", "administracao", "gestao", "gestao de imovel"],
    },
    {
      id: "temporada",
      label: "Temporada",
      aliases: ["4", "temporada", "short stay"],
    },
  ];

export const LOCACAO_GRAPH: ContractGraph = {
  start: "landlord_name",
  nodes: {
    landlord_name: { fieldId: "landlord_name", next: "landlord_document" },
    landlord_document: { fieldId: "landlord_document", next: "tenant_name" },
    tenant_name: { fieldId: "tenant_name", next: "tenant_document" },
    tenant_document: { fieldId: "tenant_document", next: "property_address" },
    property_address: { fieldId: "property_address", next: "property_type" },
    property_type: { fieldId: "property_type", next: "property_registry" },
    property_registry: { fieldId: "property_registry", next: "duration_months" },
    duration_months: { fieldId: "duration_months", next: "rent_value" },
    rent_value: { fieldId: "rent_value", next: "due_date" },
    due_date: { fieldId: "due_date", next: "adjustment_index" },
    adjustment_index: { fieldId: "adjustment_index", next: "guarantee_type" },
    guarantee_type: {
      fieldId: "guarantee_type",
      condition: {
        field: "guarantee_type",
        value: "Fiador",
        next: "guarantor_name",
      },
      next: "lgpd_consent",
    },
    guarantor_name: { fieldId: "guarantor_name", next: "lgpd_consent" },
    lgpd_consent: { fieldId: "lgpd_consent" },
  },
};

export const LOCACAO_SCHEMA: ContractSchema = {
  contractType: "locacao",

  version: "1.0",

  legalBase: [
    "Lei do Inquilinato 8.245/91",
    "Código Civil Brasileiro",
  ],
  clauses: ["property_use", "rent_value", "rent_adjustment", "guarantor", "lgpd"],
  graph: LOCACAO_GRAPH,

  fields: [
    {
      id: "landlord_name",
      label: "Nome do locador",
      question: "Qual o nome completo do locador?",
      type: "text",
      required: true,
      group: "parties",
      pii: "HIGH",
    },

    {
      id: "landlord_document",
      label: "CPF/CNPJ do locador",
      question: "Qual o CPF ou CNPJ do locador?",
      type: "text",
      required: true,
      group: "parties",
      pii: "HIGH",
    },

    {
      id: "tenant_name",
      label: "Nome do locatário",
      question: "Qual o nome completo do locatário?",
      type: "text",
      required: true,
      group: "parties",
      pii: "HIGH",
    },

    {
      id: "tenant_document",
      label: "CPF do locatário",
      question: "Qual o CPF do locatário?",
      type: "cpf",
      required: true,
      group: "parties",
      pii: "HIGH",
    },

    {
      id: "property_address",
      label: "Endereço do imóvel",
      question: "Qual o endereço completo do imóvel?",
      type: "address",
      required: true,
      group: "property",
    },

    {
      id: "property_type",
      label: "Tipo de imóvel",
      question: "Qual o tipo do imóvel?",
      type: "choice",
      options: [
        { id: "residencial", label: "Residencial" },
        { id: "comercial", label: "Comercial" },
      ],
      group: "property",
    },

    {
      id: "property_registry",
      label: "Matrícula do imóvel",
      question: "Qual a matrícula do imóvel? (se houver)",
      type: "text",
      group: "property",
    },

    {
      id: "duration_months",
      label: "Prazo do contrato",
      question: "Qual o prazo do contrato em meses?",
      type: "number",
      required: true,
      group: "dates",
    },

    {
      id: "rent_value",
      label: "Valor do aluguel",
      question: "Qual o valor mensal do aluguel em reais?",
      type: "currency",
      required: true,
      group: "financial",
    },

    {
      id: "due_date",
      label: "Data de vencimento",
      question: "Qual a data de vencimento? (DD/MM/AAAA)",
      type: "date",
      required: true,
      group: "dates",
    },

    {
      id: "adjustment_index",
      label: "Índice de reajuste",
      question: "Qual o índice de reajuste anual?",
      type: "choice",
      options: [
        { id: "ipca", label: "IPCA" },
        { id: "igpm", label: "IGP-M" },
        { id: "fixed", label: "Sem reajuste" },
      ],
      group: "financial",
    },

    {
      id: "guarantee_type",
      label: "Tipo de garantia",
      question: "Qual o tipo de garantia locatícia?",
      type: "choice",
      options: [
        { id: "caucao", label: "Caução" },
        { id: "fiador", label: "Fiador" },
        { id: "seguro_fianca", label: "Seguro fiança" },
      ],
      group: "guarantee",
    },

    {
      id: "guarantor_name",
      label: "Nome do fiador",
      question: "Qual o nome do fiador?",
      type: "text",
      group: "guarantee",
      dependsOn: {
        field: "guarantee_type",
        value: "fiador",
      },
    },

    {
      id: "lgpd_consent",
      label: "Consentimento LGPD",
      question:
        "As partes concordam com o tratamento de dados conforme a LGPD?",
      type: "boolean",
      group: "legal",
      required: true,
    },
  ],
};

export const CONTRACT_SCHEMAS: Record<ContractType, ContractSchema> = {
  locacao: LOCACAO_SCHEMA,

  compra_venda: {
    contractType: "compra_venda",
    version: "1.0",
    legalBase: ["Código Civil Brasileiro"],
    fields: [
      {
        id: "seller_name",
        label: "Nome do vendedor",
        question: "Qual o nome completo do vendedor?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "seller_document",
        label: "CPF/CNPJ do vendedor",
        question: "Qual o CPF/CNPJ do vendedor?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "buyer_name",
        label: "Nome do comprador",
        question: "Qual o nome completo do comprador?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "buyer_document",
        label: "CPF/CNPJ do comprador",
        question: "Qual o CPF/CNPJ do comprador?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "property_address",
        label: "Endereço do imóvel",
        question: "Qual o endereço completo do imóvel?",
        type: "address",
        required: true,
        group: "property",
      },
      {
        id: "sale_value",
        label: "Valor da venda",
        question: "Qual o valor da venda em reais?",
        type: "currency",
        required: true,
        group: "financial",
      },
      {
        id: "down_payment",
        label: "Sinal",
        question: "Qual o valor do sinal em reais? (0 se não houver)",
        type: "currency",
        group: "financial",
      },
      {
        id: "payment_method",
        label: "Forma de pagamento",
        question: "Qual a forma de pagamento?",
        type: "text",
        required: true,
        group: "financial",
      },
      {
        id: "deed_date",
        label: "Data da escritura",
        question: "Qual a data prevista da escritura? (DD/MM/AAAA)",
        type: "date",
        required: true,
        group: "dates",
      },
    ],
  },

  administracao: {
    contractType: "administracao",
    version: "1.0",
    legalBase: ["Código Civil Brasileiro"],
    fields: [
      {
        id: "owner_name",
        label: "Nome do proprietário",
        question: "Qual o nome completo do proprietário?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "owner_document",
        label: "CPF/CNPJ do proprietário",
        question: "Qual o CPF/CNPJ do proprietário?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "manager_name",
        label: "Administradora responsável",
        question: "Qual o nome da administradora/corretor responsável?",
        type: "text",
        required: true,
        group: "parties",
      },
      {
        id: "property_address",
        label: "Endereço do imóvel",
        question: "Qual o endereço completo do imóvel?",
        type: "address",
        required: true,
        group: "property",
      },
      {
        id: "fee_percent",
        label: "Taxa de administração",
        question: "Qual o percentual de administração (%)?",
        type: "percentage",
        required: true,
        group: "financial",
      },
      {
        id: "contract_months",
        label: "Prazo contratual",
        question: "Qual o prazo contratual em meses?",
        type: "number",
        required: true,
        group: "dates",
      },
    ],
  },

  temporada: {
    contractType: "temporada",
    version: "1.0",
    legalBase: ["Lei do Inquilinato 8.245/91"],
    fields: [
      {
        id: "host_name",
        label: "Nome do locador/anfitrião",
        question: "Qual o nome completo do locador/anfitrião?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "guest_name",
        label: "Nome do locatário/hóspede",
        question: "Qual o nome completo do locatário/hóspede?",
        type: "text",
        required: true,
        group: "parties",
        pii: "HIGH",
      },
      {
        id: "property_address",
        label: "Endereço do imóvel",
        question: "Qual o endereço completo do imóvel?",
        type: "address",
        required: true,
        group: "property",
      },
      {
        id: "checkin_date",
        label: "Data de check-in",
        question: "Qual a data de check-in? (DD/MM/AAAA)",
        type: "date",
        required: true,
        group: "dates",
      },
      {
        id: "checkout_date",
        label: "Data de check-out",
        question: "Qual a data de check-out? (DD/MM/AAAA)",
        type: "date",
        required: true,
        group: "dates",
      },
      {
        id: "total_value",
        label: "Valor total",
        question: "Qual o valor total em reais?",
        type: "currency",
        required: true,
        group: "financial",
      },
      {
        id: "deposit_value",
        label: "Caução/depósito",
        question: "Qual o valor de caução/depósito? (R$)",
        type: "currency",
        group: "guarantee",
      },
    ],
  },
};

export const CLAUSE_LIBRARY: Record<string, Clause> = {
  property_use: {
    id: "property_use",
    title: "Objeto da locacao",
    legalBase: ["Lei 8.245/91 art 22"],
    template:
      "O LOCADOR da em locacao ao LOCATARIO o imovel localizado em {{property_address}}, destinado ao uso {{property_type}}.",
    variables: ["property_address", "property_type"],
  },
  rent_value: {
    id: "rent_value",
    title: "Valor do aluguel",
    template:
      "O aluguel mensal sera de R$ {{rent_value}}, com vencimento na data {{due_date}}.",
    variables: ["rent_value", "due_date"],
  },
  rent_adjustment: {
    id: "rent_adjustment",
    title: "Reajuste anual",
    template: "O aluguel sera reajustado anualmente pelo indice {{adjustment_index}}.",
    variables: ["adjustment_index"],
  },
  guarantor: {
    id: "guarantor",
    title: "Garantia com fiador",
    template:
      "O presente contrato possui como fiador {{guarantor_name}}, com responsabilidade solidaria pelas obrigacoes assumidas.",
    variables: ["guarantor_name"],
    condition: {
      field: "guarantee_type",
      value: "Fiador",
    },
  },
  lgpd: {
    id: "lgpd",
    title: "Protecao de dados",
    template:
      "As partes autorizam o tratamento de dados pessoais em conformidade com a Lei 13.709/2018 (LGPD).",
  },
};

function normalizeAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return String(value).trim();
}

function readNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const source = normalizeAnswerValue(value);
  if (!source) return null;
  const parsed = Number(source.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function templateReplace(template: string, answers: Record<string, unknown>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey).trim();
    return normalizeAnswerValue(answers[key]);
  });
}

export function generateContractText(schema: ContractSchema, answers: Record<string, unknown>) {
  if (!schema.clauses || schema.clauses.length === 0) return "";

  const resolvedClauses = schema.clauses
    .map((id) => CLAUSE_LIBRARY[id])
    .filter((clause): clause is Clause => Boolean(clause))
    .filter((clause) => {
      if (!clause.condition) return true;
      const current = answers[clause.condition.field];
      return normalizeAnswerValue(current).toLowerCase() === normalizeAnswerValue(clause.condition.value).toLowerCase();
    })
    .map((clause) => {
      const text = templateReplace(clause.template, answers).trim();
      if (!text) return "";
      return text;
    })
    .filter((item) => item.length > 0);

  return resolvedClauses.join("\n\n");
}

export type LegalReviewResult = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
};

export function legalReview(answers: Record<string, unknown>): LegalReviewResult {
  const warnings: string[] = [];

  const depositValue = readNumeric(answers.deposit_value);
  const rentValue = readNumeric(answers.rent_value);
  if (depositValue !== null && rentValue !== null && rentValue > 0 && depositValue > rentValue * 3) {
    warnings.push("Caucao excede limite de referencia de 3 alugueis.");
  }

  const durationMonths = readNumeric(answers.duration_months);
  if (durationMonths !== null && durationMonths > 60) {
    warnings.push("Prazo contratual elevado; recomenda-se revisao juridica.");
  }

  const hasLandlord = normalizeAnswerValue(answers.landlord_name).length > 0;
  const hasTenant = normalizeAnswerValue(answers.tenant_name).length > 0;
  if (!hasLandlord || !hasTenant) {
    warnings.push("Dados das partes incompletos para validacao juridica minima.");
  }

  const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
    warnings.length >= 3 ? "HIGH" : warnings.length > 0 ? "MEDIUM" : "LOW";

  return {
    riskLevel,
    warnings,
  };
}
