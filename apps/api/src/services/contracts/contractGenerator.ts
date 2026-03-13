import crypto from "node:crypto";
import { composeClauses } from "./clauseComposer";
import { numberClauses } from "./contractNumbering";
import type { ComposedClause, ContractSchema, ContractType, LegalReviewResult } from "./types";

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

function renderTemplate(template: string, answers: Record<string, unknown>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey).trim();
    const value = normalizeAnswerValue(answers[key]);
    return value || "N/A";
  });
}

export const CONTRACT_SCHEMAS_V1: Record<ContractType, ContractSchema> = {
  locacao: {
    contractType: "locacao",
    version: "1.0",
    legalBase: ["Lei do Inquilinato 8.245/91", "Codigo Civil Brasileiro"],
    clauses: ["property_object", "rent_payment", "guarantor", "termination_default", "lgpd"],
    graph: {
      start: "landlord_name",
      nodes: {
        landlord_name: { fieldId: "landlord_name", next: "landlord_document" },
        landlord_document: { fieldId: "landlord_document", next: "tenant_name" },
        tenant_name: { fieldId: "tenant_name", next: "tenant_document" },
        tenant_document: { fieldId: "tenant_document", next: "property_address" },
      },
    },
  },
  compra_venda: {
    contractType: "compra_venda",
    version: "1.0",
    legalBase: ["Codigo Civil Brasileiro"],
    clauses: ["property_object", "termination_default", "lgpd"],
  },
  administracao: {
    contractType: "administracao",
    version: "1.0",
    legalBase: ["Codigo Civil Brasileiro"],
    clauses: ["property_object", "termination_default", "lgpd"],
  },
  temporada: {
    contractType: "temporada",
    version: "1.0",
    legalBase: ["Lei do Inquilinato 8.245/91"],
    clauses: ["property_object", "rent_payment", "termination_default", "lgpd"],
  },
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

export function generateContractText(schema: ContractSchema, answers: Record<string, unknown>) {
  const clauses = composeClauses(schema, answers);
  const numbered = numberClauses(clauses);
  const rendered = numbered.map((clause) => ({
    ...clause,
    renderedText: renderTemplate(clause.template, answers).trim(),
  }));
  const contractText = rendered
    .map((clause) => `CLAUSULA ${clause.number} — ${clause.title}\n\n${clause.renderedText}`)
    .join("\n\n");

  return {
    contractText,
    clauses: rendered,
  };
}

export function generateContractPreview(input: {
  contractType: ContractType;
  answers: Record<string, unknown>;
  legalVersion?: string | null;
}) {
  const schema = CONTRACT_SCHEMAS_V1[input.contractType];
  const { contractText, clauses } = generateContractText(schema, input.answers);
  const review = legalReview(input.answers);
  const legalVersion = input.legalVersion?.trim() || "BR_LEGAL_2026_01";
  const hash = crypto.createHash("sha256").update(contractText).digest("hex");

  return {
    schemaVersion: schema.version,
    legalVersion,
    legalBase: schema.legalBase,
    graph: schema.graph ?? null,
    clauses: clauses.map((item: ComposedClause) => ({
      id: item.id,
      number: item.number,
      title: item.title,
      category: item.category,
      legalBase: item.legalBase ?? [],
    })),
    review,
    contractText,
    hash: `sha256:${hash}`,
  };
}
