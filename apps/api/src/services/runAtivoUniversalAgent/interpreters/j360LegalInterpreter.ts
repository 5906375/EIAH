import type { J360LegalReport } from "@eiah/core/actions/reporting/j360LegalReportSchema";
import type { RecipeOrchestration } from "@eiah/core/actions/reporting/recipeOrchestrationSchema";
import { J360LegalReportSchema } from "@eiah/core/actions/reporting/j360LegalReportSchema";
import type { ExtractedPdfDocument } from "../../../services/documents/pdfTextExtractor";

type PlainObject = Record<string, unknown>;
type StepCategory = "natureza" | "criterios" | "base" | "reducoes" | "lgpd" | "geral";
type EvidenceRef = J360LegalReport["riskMatrix"][number]["evidenceRefs"][number];

type BuildJ360LegalReportParams = {
  outputText?: string | null;
  rawOutput?: unknown;
  metadata?: Record<string, unknown> | null;
  recipeOrchestration?: RecipeOrchestration | null;
  documentEvidence?: ExtractedPdfDocument | null;
};

type ReportSectionStatus = J360LegalReport["reportSections"][number]["status"];

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") ?? "";
}

function extractJsonCandidate(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)```$/i);
  const content = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return content.slice(firstBrace, lastBrace + 1);
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function splitIntoSections(markdown: string) {
  const sections = new Map<string, string[]>();
  let current = "body";

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = normalizeText(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)?.push(rawLine);
  }

  return sections;
}

function findCaseInsensitiveValue(source: PlainObject, needles: string[]) {
  const entries = Object.entries(source);
  for (const needle of needles) {
    const normalizedNeedle = normalizeText(needle);
    const match = entries.find(([key]) => normalizeText(key).includes(normalizedNeedle));
    if (match) return match[1];
  }
  return undefined;
}

function stringifySectionValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? `- ${item}` : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractStructuredSections(rawOutput: unknown) {
  const candidate =
    typeof rawOutput === "string"
      ? safeParseJson(extractJsonCandidate(rawOutput) ?? rawOutput)
      : rawOutput;
  if (!isPlainObject(candidate)) return null;

  const structured = {
    summary: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Resumo Executivo", "Resumo"])),
    strengths: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Pontos fortes", "Oportunidades"])),
    attentionPoints: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Pontos de atenção", "Riscos", "Insights"])),
    riskMatrix: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Matriz de riscos"])),
    ambiguities: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Inconsistências", "Ambiguidades"])),
    recommendedAdjustments: stringifySectionValue(
      findCaseInsensitiveValue(candidate, ["Recomendações de ajuste", "Recomendacoes de ajuste", "Recomendacoes"])
    ),
    recommendedEvidence: stringifySectionValue(
      findCaseInsensitiveValue(candidate, ["Evidências", "Documentos complementares"])
    ),
    humanQuestions: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Perguntas para validação humana"])),
    conclusion: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Conclusão preliminar", "Conclusao preliminar"])),
    stage: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Estagio Atual", "Estágio Atual"])),
    opportunities: stringifySectionValue(findCaseInsensitiveValue(candidate, ["Oportunidades"])),
  };

  const hasMeaningfulStructuredContent = Object.values(structured).some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  return hasMeaningfulStructuredContent ? structured : null;
}

function stripLeadingJsonEnvelope(input: string) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("{")) return input;
  const candidate = extractJsonCandidate(trimmed);
  if (!candidate) return input;
  const parsed = safeParseJson(candidate);
  if (!isPlainObject(parsed)) return input;
  const remainder = trimmed.slice(candidate.length).trimStart();
  if (!remainder.match(/^#{1,6}\s+/m)) return input;
  return remainder;
}

function sectionText(sections: Map<string, string[]>, needles: string[]) {
  for (const needle of needles) {
    const match = Array.from(sections.keys()).find((key) => key.includes(normalizeText(needle)));
    if (match) {
      return sections
        .get(match)
        ?.join("\n")
        .trim() ?? "";
    }
  }
  return "";
}

function extractList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function dedupeStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function safeArray<T>(value: unknown, mapper: (item: unknown) => T | null) {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter((item): item is T => item !== null);
}

function extractSupportingDocumentNames(metadata?: Record<string, unknown> | null) {
  const fromEntry = (item: unknown) => {
    if (!isPlainObject(item)) return null;
    return typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : null;
  };

  const form = isPlainObject(metadata?.form) ? (metadata?.form as PlainObject) : null;
  const supportingDocs = safeArray(form?.supportingDocs, fromEntry);
  const documents = safeArray(metadata?.documents, fromEntry);

  return dedupeStrings([...supportingDocs, ...documents]);
}

function firstListItem(values: string[]) {
  return values[0] ?? null;
}

function buildWorkspaceBrand(metadata?: Record<string, unknown> | null): J360LegalReport["workspaceBrand"] {
  const candidate = isPlainObject(metadata?.workspaceBrand)
    ? (metadata?.workspaceBrand as PlainObject)
    : null;
  return {
    name:
      (candidate && typeof candidate.name === "string" && candidate.name.trim().length > 0
        ? candidate.name.trim()
        : typeof metadata?.workspaceName === "string" && metadata.workspaceName.trim().length > 0
        ? metadata.workspaceName.trim()
        : typeof metadata?.workspaceId === "string" && metadata.workspaceId.trim().length > 0
        ? metadata.workspaceId.trim()
        : null) ?? null,
    logoUrl: candidate && typeof candidate.logoUrl === "string" && candidate.logoUrl.trim().length > 0 ? candidate.logoUrl.trim() : null,
    primaryColor:
      candidate && typeof candidate.primaryColor === "string" && candidate.primaryColor.trim().length > 0
        ? candidate.primaryColor.trim()
        : null,
    accentColor:
      candidate && typeof candidate.accentColor === "string" && candidate.accentColor.trim().length > 0
        ? candidate.accentColor.trim()
        : null,
  };
}

function inferSectionStatus(summary: string | null): ReportSectionStatus {
  if (!summary || summary.trim().length === 0) return "missing";
  return summary.trim().length < 50 ? "partial" : "available";
}

function buildReportSections(params: {
  report: {
    ementa: string | null;
    relatorioFactual: string | null;
    fundamentos: J360LegalReport["fundamentos"];
    references: J360LegalReport["references"];
    riskMatrix: J360LegalReport["riskMatrix"];
    recommendedAdjustments: string[];
    conclusaoFormal: string | null;
    manualReviewRequired: boolean;
    executiveGuidance: J360LegalReport["executiveGuidance"];
    coverageMatrix: J360LegalReport["coverageMatrix"];
  };
}) {
  const { report } = params;
  return [
    {
      id: "identificacao",
      title: "Identificação do parecer",
      anchor: "identificacao",
      summary: "Dados formais do parecer, interessado, assunto e versão documental.",
      status: "available" as ReportSectionStatus,
    },
    {
      id: "ementa",
      title: "Ementa",
      anchor: "ementa",
      summary: report.ementa,
      status: inferSectionStatus(report.ementa),
    },
    {
      id: "relatorio",
      title: "Relatório",
      anchor: "relatorio",
      summary: report.relatorioFactual,
      status: inferSectionStatus(report.relatorioFactual),
    },
    {
      id: "fundamentacao",
      title: "Fundamentação",
      anchor: "fundamentacao",
      summary: firstListItem(report.fundamentos.map((item) => item.topic)),
      status: report.fundamentos.length > 0 ? "available" : "missing",
    },
    {
      id: "referencias",
      title: "Referências jurídicas consolidadas",
      anchor: "referencias",
      summary: firstListItem([
        ...report.references.cltRefs,
        ...report.references.tstRefs,
        ...report.references.ojRefs,
      ]),
      status:
        report.references.cltRefs.length + report.references.tstRefs.length + report.references.ojRefs.length > 0
          ? "available"
          : "missing",
    },
    {
      id: "riscos",
      title: "Matriz de riscos",
      anchor: "riscos",
      summary: firstListItem(report.riskMatrix.map((item) => item.risk)),
      status: report.riskMatrix.length > 0 ? "available" : "missing",
    },
    {
      id: "recomendacoes",
      title: "Recomendações de ajuste",
      anchor: "recomendacoes",
      summary: firstListItem(report.recommendedAdjustments),
      status: report.recommendedAdjustments.length > 0 ? "available" : "partial",
    },
    {
      id: "conclusao",
      title: "Conclusão",
      anchor: "conclusao",
      summary: report.conclusaoFormal,
      status: inferSectionStatus(report.conclusaoFormal),
    },
    {
      id: "ressalvas",
      title: "Ressalvas e revisão humana",
      anchor: "ressalvas",
      summary: report.manualReviewRequired ? "Revisão jurídica humana recomendada antes do uso final." : "Sem ressalvas humanas adicionais reportadas.",
      status: "available" as ReportSectionStatus,
    },
    {
      id: "encaminhamento",
      title: "Encaminhamento executivo",
      anchor: "encaminhamento",
      summary: firstListItem(report.executiveGuidance.adjustNow),
      status: report.executiveGuidance.adjustNow.length > 0 ? "available" : "partial",
    },
    {
      id: "cobertura",
      title: "Matriz de cobertura do parecer",
      anchor: "cobertura",
      summary: firstListItem(report.coverageMatrix.map((item) => item.whatParecerAsks)),
      status: report.coverageMatrix.length > 0 ? "available" : "missing",
    },
  ];
}

function classifyStepCategory(text: string): StepCategory {
  const normalized = normalizeText(text);
  if (
    normalized.includes("base de calculo") ||
    normalized.includes("faturamento") ||
    normalized.includes("formula") ||
    normalized.includes("salario-base") ||
    normalized.includes("salario base")
  ) {
    return "base";
  }
  if (
    normalized.includes("reduc") ||
    normalized.includes("penalidade") ||
    normalized.includes("transparencia") ||
    normalized.includes("demonstrativo") ||
    normalized.includes("vigencia") ||
    normalized.includes("expectativa de direito") ||
    normalized.includes("revog")
  ) {
    return "reducoes";
  }
  if (
    normalized.includes("criterio") ||
    normalized.includes("habitualidade") ||
    normalized.includes("automatic") ||
    normalized.includes("ordinari") ||
    normalized.includes("desempenho")
  ) {
    return "criterios";
  }
  if (
    normalized.includes("lgpd") ||
    normalized.includes("dados pessoais") ||
    normalized.includes("finalidade") ||
    normalized.includes("controle de acesso") ||
    normalized.includes("matriz de riscos") ||
    normalized.includes("revisao humana") ||
    normalized.includes("revisão humana")
  ) {
    return "lgpd";
  }
  if (
    normalized.includes("premio") ||
    normalized.includes("premiacao") ||
    normalized.includes("natureza juridica") ||
    normalized.includes("verba salarial") ||
    normalized.includes("nao salarial") ||
    normalized.includes("não salarial") ||
    normalized.includes("art. 457") ||
    normalized.includes("art 457")
  ) {
    return "natureza";
  }
  return "geral";
}

function extractEvidenceHints(text: string) {
  const pageMatch = text.match(/\b(?:p(?:ag(?:ina)?)?\.?|page)\s*(\d{1,4})\b/i);
  const sectionMatch = text.match(/\b(?:secao|seção|clausula|cláusula|item)\s+([a-z0-9][a-z0-9.\-/_]*)\b/i);
  return {
    page: pageMatch?.[1] ?? null,
    section: sectionMatch ? sectionMatch[0] : null,
  };
}

function inferRelatedClause(text: string, recipeOrchestration?: RecipeOrchestration | null) {
  const explicitSection = extractEvidenceHints(text).section;
  if (explicitSection) return explicitSection;
  const category = classifyStepCategory(text);
  const matchedStep = recipeOrchestration?.recipeSteps.find((step) => classifyStepCategory(`${step.title} ${step.objective}`) === category);
  return matchedStep?.title ?? null;
}

function extractMeaningfulKeywords(text: string) {
  return dedupeStrings(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !["pode", "gera", "risco", "juridico", "juridica", "antes", "para", "com", "sem"].includes(token))
  );
}

function resolveDocumentMatch(
  item: string,
  documentEvidence: ExtractedPdfDocument | null | undefined,
  recipeOrchestration?: RecipeOrchestration | null
) {
  if (!documentEvidence) return null;
  const category = classifyStepCategory(item);
  const stepClause = inferRelatedClause(item, recipeOrchestration);
  const itemKeywords = extractMeaningfulKeywords(item);
  let bestScore = -1;
  let best: { page: number; section: string | null; excerpt: string } | null = null;

  for (const page of documentEvidence.pages) {
    for (const line of page.lines) {
      const normalizedLine = normalizeText(line);
      const keywordScore = itemKeywords.reduce((acc, token) => acc + (normalizedLine.includes(token) ? 1 : 0), 0);
      const categoryBoost = classifyStepCategory(line) === category ? 2 : 0;
      const section = documentEvidence.sections.find(
        (entry) =>
          entry.page === page.page &&
          (normalizedLine.includes(normalizeText(entry.title)) || normalizeText(entry.title).includes(normalizedLine))
      );
      const sectionBoost =
        stepClause && section && normalizeText(section.title).includes(normalizeText(stepClause)) ? 3 : 0;
      const score = keywordScore + categoryBoost + sectionBoost;
      if (score > bestScore && score > 0) {
        bestScore = score;
        best = {
          page: page.page,
          section: section?.title ?? stepClause,
          excerpt:
            section && normalizedLine.includes(normalizeText(section.title)) && section.excerpt
              ? section.excerpt
              : line,
        };
      }
    }
  }

  if (best) return best;
  const fallbackSection = documentEvidence.sections.find((entry) => classifyStepCategory(entry.title) === category);
  if (fallbackSection) {
    return {
      page: fallbackSection.page,
      section: fallbackSection.title,
      excerpt: fallbackSection.excerpt,
    };
  }
  return null;
}

function buildEvidenceRefs(params: {
  item: string;
  metadata?: Record<string, unknown> | null;
  recipeOrchestration?: RecipeOrchestration | null;
  documentEvidence?: ExtractedPdfDocument | null;
}) {
  const documents = extractSupportingDocumentNames(params.metadata);
  const primaryDocument = documents[0] ?? params.documentEvidence?.document ?? null;
  const sourceStatus: EvidenceRef["sourceStatus"] = primaryDocument ? "provided" : "not_provided";
  const hints = extractEvidenceHints(params.item);
  const matchedEvidence = resolveDocumentMatch(params.item, params.documentEvidence, params.recipeOrchestration);
  const section = hints.section ?? matchedEvidence?.section ?? inferRelatedClause(params.item, params.recipeOrchestration);

  return [
    {
      document: primaryDocument,
      sourceStatus,
      page: hints.page ?? (matchedEvidence ? String(matchedEvidence.page) : null),
      section,
      excerpt: matchedEvidence?.excerpt ?? null,
    } satisfies EvidenceRef,
  ];
}

function dedupeRiskCandidates(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value).replace(/[.:\-–—]+$/g, "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferItemSeverity(item: string, defaultSeverity: J360LegalReport["riskLevel"]) {
  const normalized = normalizeText(item);
  if (
    normalized.includes("critica") ||
    normalized.includes("crítica") ||
    normalized.includes("alto risco") ||
    normalized.includes("passivo relevante")
  ) {
    return "critical" as const;
  }
  if (
    normalized.includes("risco relevante") ||
    normalized.includes("verba salarial") ||
    normalized.includes("penalidade") ||
    normalized.includes("ambig") ||
    normalized.includes("contradit")
  ) {
    return "high" as const;
  }
  if (
    normalized.includes("atencao") ||
    normalized.includes("atenção") ||
    normalized.includes("ressalva") ||
    normalized.includes("habitualidade")
  ) {
    return "medium" as const;
  }
  return defaultSeverity;
}

function buildRiskImpact(item: string) {
  const normalized = normalizeText(item);
  if (normalized.includes("base de calculo") || normalized.includes("contradit") || normalized.includes("ambig")) {
    return "Pode gerar disputa sobre fórmula, questionamento do demonstrativo ao empregado e reforço de passivo trabalhista.";
  }
  if (normalized.includes("verba salarial") || normalized.includes("nao salarial") || normalized.includes("não salarial")) {
    return "Pode levar à integração da premiação ao salário, com reflexos em encargos, férias, 13º e passivo trabalhista.";
  }
  if (normalized.includes("habitualidade") || normalized.includes("ordinari") || normalized.includes("automatic")) {
    return "Pode enfraquecer a tese de desempenho extraordinário e aproximar a política de remuneração variável habitual.";
  }
  if (normalized.includes("penalidade") || normalized.includes("reduc")) {
    return "Pode sustentar leitura de sanção disciplinar indireta, com risco de nulidade ou questionamento judicial.";
  }
  if (normalized.includes("expectativa de direito")) {
    return "Pode criar obrigação percebida pelo empregado e dificultar suspensão, alteração ou revogação futura.";
  }
  if (normalized.includes("lgpd") || normalized.includes("dados pessoais")) {
    return "Pode expor a empresa a tratamento excessivo de dados pessoais ou documentação insuficiente de finalidade e acesso.";
  }
  return "Pode gerar interpretação desfavorável, passivo jurídico ou necessidade de ajuste documental.";
}

function buildRiskMitigation(item: string, recommendedAdjustments: string[]) {
  const normalized = normalizeText(item);
  const match = recommendedAdjustments.find((adjustment) => {
    const normalizedAdjustment = normalizeText(adjustment);
    return (
      (normalized.includes("base de calculo") && normalizedAdjustment.includes("base de calculo")) ||
      (normalized.includes("verba salarial") && normalizedAdjustment.includes("natureza juridica")) ||
      (normalized.includes("habitualidade") && normalizedAdjustment.includes("habitualidade")) ||
      (normalized.includes("reduc") && normalizedAdjustment.includes("reduc")) ||
      (normalized.includes("lgpd") && normalizedAdjustment.includes("lgpd"))
    );
  });
  return match ?? recommendedAdjustments[0] ?? "Revisar redação, reforçar evidências e validar com advogado responsável.";
}

function firstParagraph(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.length > 0) ?? "";
}

function inferLegalDecision(params: {
  text: string;
  riskLevel: J360LegalReport["riskLevel"];
  attentionPoints: string[];
  ambiguities: string[];
  recommendedAdjustments: string[];
}) {
  const normalized = normalizeText(params.text);
  if (
    normalized.includes("nao recomendado sem revisao") ||
    normalized.includes("não recomendado sem revisão") ||
    normalized.includes("nao recomendado") ||
    normalized.includes("não recomendado")
  ) {
    return "NAO_RECOMENDADO_SEM_REVISAO" as const;
  }
  if (params.riskLevel === "critical") {
    return "NAO_RECOMENDADO_SEM_REVISAO" as const;
  }
  if (
    normalized.includes("aprovado com ressalvas") ||
    normalized.includes("revisao humana") ||
    normalized.includes("revisão humana") ||
    normalized.includes("ajustes recomendados") ||
    normalized.includes("ressalvas") ||
    params.riskLevel === "high" ||
    params.riskLevel === "medium" ||
    params.attentionPoints.length > 0 ||
    params.ambiguities.length > 0 ||
    params.recommendedAdjustments.length > 0
  ) {
    return "APROVADO_COM_RESSALVAS" as const;
  }
  return "APROVADO_BAIXO_RISCO" as const;
}

function inferRiskLevel(text: string, recipeOrchestration?: RecipeOrchestration | null) {
  const normalized = normalizeText(text);
  if (normalized.includes("critica") || normalized.includes("crítica")) return "critical" as const;
  if (normalized.includes("alto risco") || normalized.includes("risco alto")) return "high" as const;
  if (normalized.includes("risco medio") || normalized.includes("risco médio")) return "medium" as const;
  return recipeOrchestration?.riskLevel ?? "high";
}

function inferManualReviewRequired(params: {
  text: string;
  decision: J360LegalReport["legalDecision"];
  riskLevel: J360LegalReport["riskLevel"];
  humanValidationQuestions: string[];
  ambiguities: string[];
}) {
  const normalized = normalizeText(params.text);
  if (params.decision !== "APROVADO_BAIXO_RISCO") return true;
  if (params.riskLevel === "high" || params.riskLevel === "critical") return true;
  if (params.humanValidationQuestions.length > 0 || params.ambiguities.length > 0) return true;
  return normalized.includes("revisao humana") || normalized.includes("revisão humana");
}

function scoreStepMatch(text: string, step: RecipeOrchestration["recipeSteps"][number]) {
  const normalizedText = normalizeText(text);
  const candidates = [step.title, step.objective, ...step.checks, ...step.evidence]
    .map((item) => normalizeText(item))
    .filter(Boolean);
  return candidates.reduce((score, candidate) => {
    if (!candidate) return score;
    if (normalizedText.includes(candidate)) return score + 4;
    const candidateTerms = candidate.split(/[^a-z0-9]+/).filter((term) => term.length >= 4);
    return (
      score +
      candidateTerms.reduce((inner, term) => inner + (normalizedText.includes(term) ? 1 : 0), 0)
    );
  }, 0);
}

function findBestStepMatch(
  text: string,
  recipeOrchestration?: RecipeOrchestration | null
) {
  const steps = recipeOrchestration?.recipeSteps ?? [];
  let best: RecipeOrchestration["recipeSteps"][number] | null = null;
  let bestScore = 0;
  for (const step of steps) {
    const score = scoreStepMatch(text, step);
    if (score > bestScore) {
      best = step;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function findBestAdjustmentForRisk(item: string, recommendedAdjustments: string[]) {
  const normalized = normalizeText(item);
  let best: string | null = null;
  let bestScore = 0;
  for (const adjustment of recommendedAdjustments) {
    const normalizedAdjustment = normalizeText(adjustment);
    let score = 0;
    for (const term of normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 4)) {
      if (normalizedAdjustment.includes(term)) score += 1;
    }
    if (
      (normalized.includes("base de calculo") && normalizedAdjustment.includes("base de calculo")) ||
      (normalized.includes("verba salarial") && normalizedAdjustment.includes("natureza")) ||
      (normalized.includes("habitualidade") && normalizedAdjustment.includes("habitualidade")) ||
      (normalized.includes("reduc") && normalizedAdjustment.includes("reduc")) ||
      (normalized.includes("expectativa") && normalizedAdjustment.includes("expectativa"))
    ) {
      score += 3;
    }
    if (score > bestScore) {
      best = adjustment;
      bestScore = score;
    }
  }
  return best;
}

function buildCoverageMatrix(params: {
  recipeOrchestration?: RecipeOrchestration | null;
  riskMatrix: J360LegalReport["riskMatrix"];
  strengths: string[];
  attentionPoints: string[];
  ambiguities: string[];
  recommendedAdjustments: string[];
}) {
  const steps = params.recipeOrchestration?.recipeSteps ?? [];
  if (steps.length === 0) return [];

  return steps.map((step) => ({
    whatParecerAsks: [step.title, step.objective, step.checks[0]].filter(Boolean).join(" — "),
    whatRunAnswered: (() => {
      const category = classifyStepCategory(`${step.title} ${step.objective}`);
      const matchedRisk = params.riskMatrix.find((item) => {
        const bestStep = findBestStepMatch(item.risk, params.recipeOrchestration);
        return bestStep?.id === step.id || classifyStepCategory(item.risk) === category;
      });
      const matchedFindings = dedupeStrings([
        ...params.attentionPoints.filter((item) => classifyStepCategory(item) === category),
        ...params.ambiguities.filter((item) => classifyStepCategory(item) === category),
        ...params.strengths.filter((item) => classifyStepCategory(item) === category),
      ]);
      if (matchedRisk) {
        const evidence = matchedRisk.evidenceRefs[0];
        const evidenceLabel =
          evidence && evidence.sourceStatus === "provided" && evidence.document
            ? `${evidence.document}${evidence.page ? `, p. ${evidence.page}` : ""}${evidence.section ? `, ${evidence.section}` : ""}`
            : null;
        return [
          `Risco identificado: ${matchedRisk.risk}.`,
          `Impacto consolidado: ${matchedRisk.impact}`,
          evidenceLabel ? `Base documental: ${evidenceLabel}.` : null,
        ]
          .filter(Boolean)
          .join(" ");
      }
      return matchedFindings.length > 0
        ? matchedFindings.slice(0, 2).join(" ")
        : `O run consolidou observações e recomendações específicas sobre ${step.title.toLowerCase()}.`;
    })(),
    whatStillNeedsManualReview: (() => {
      const category = classifyStepCategory(`${step.title} ${step.objective}`);
      const matchedRisk = params.riskMatrix.find((item) => {
        const bestStep = findBestStepMatch(item.risk, params.recipeOrchestration);
        return bestStep?.id === step.id || classifyStepCategory(item.risk) === category;
      });
      const matchedAdjustments = params.recommendedAdjustments.filter(
        (item) => classifyStepCategory(item) === category || normalizeText(item).includes(normalizeText(step.title).split(" ")[0] ?? "")
      );
      const bestAdjustment = matchedRisk ? findBestAdjustmentForRisk(matchedRisk.risk, matchedAdjustments) : matchedAdjustments[0];
      if (matchedRisk && bestAdjustment) {
        return `${bestAdjustment} Validar a cláusula final com revisão jurídica humana antes do uso.`;
      }
      return step.blocking || matchedAdjustments.length > 0
        ? matchedAdjustments.slice(0, 2).join(" ") || "Validar a redação final com revisão jurídica humana."
        : null;
    })(),
  }));
}

function buildRiskMatrix(params: {
  attentionPoints: string[];
  ambiguities: string[];
  recommendedAdjustments: string[];
  riskLevel: J360LegalReport["riskLevel"];
  metadata?: Record<string, unknown> | null;
  recipeOrchestration?: RecipeOrchestration | null;
  documentEvidence?: ExtractedPdfDocument | null;
}) {
  const items = dedupeRiskCandidates([...params.attentionPoints, ...params.ambiguities]).slice(0, 6);
  if (items.length === 0) {
    return [
      {
        risk: "Risco jurídico não estruturado explicitamente pelo modelo",
        severity: params.riskLevel,
        relatedClause: null,
        impact: "A análise exige revisão manual para consolidar impacto trabalhista ou contratual.",
        mitigation: params.recommendedAdjustments[0] ?? "Solicitar validação jurídica humana do documento.",
        evidenceRefs: buildEvidenceRefs({
          item: "Risco jurídico não estruturado explicitamente pelo modelo",
          metadata: params.metadata,
          recipeOrchestration: params.recipeOrchestration,
          documentEvidence: params.documentEvidence,
        }),
      },
    ];
  }

  return items.map((item) => {
    const evidenceRefs = buildEvidenceRefs({
      item,
      metadata: params.metadata,
      recipeOrchestration: params.recipeOrchestration,
      documentEvidence: params.documentEvidence,
    });
    const matchedStep = findBestStepMatch(item, params.recipeOrchestration);
    const relatedClause = evidenceRefs[0]?.section ?? matchedStep?.title ?? inferRelatedClause(item, params.recipeOrchestration);
    const documentExcerpt = evidenceRefs[0]?.excerpt;
    const impactBase = buildRiskImpact(item);
    const mitigationBase = buildRiskMitigation(item, params.recommendedAdjustments);
    return {
      risk: item,
      severity: inferItemSeverity(item, params.riskLevel),
      relatedClause,
      impact: documentExcerpt
        ? `${impactBase} Trecho sensível observado: ${documentExcerpt}`
        : impactBase,
      mitigation: relatedClause
        ? `${mitigationBase} Priorizar revisão da cláusula/seção ${relatedClause}.`
        : mitigationBase,
      evidenceRefs,
    };
  });
}

function buildHowToProceedNow(params: {
  recommendedAdjustments: string[];
  recommendedEvidence: string[];
  humanValidationQuestions: string[];
  recipeOrchestration?: RecipeOrchestration | null;
}) {
  const explicit = params.recipeOrchestration?.howToProceedNow ?? [];
  if (explicit.length > 0) return explicit;

  const steps = [
    params.recommendedAdjustments[0],
    params.recommendedAdjustments[1],
    params.recommendedEvidence[0] ? `Separar evidência complementar: ${params.recommendedEvidence[0]}` : null,
    params.humanValidationQuestions[0]
      ? `Levar para validação jurídica humana: ${params.humanValidationQuestions[0]}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return steps.length > 0 ? steps : ["Revisar o documento, ajustar os pontos sensíveis e rerodar a análise."];
}

function getLegalReferencesForCategory(category: StepCategory) {
  switch (category) {
    case "natureza":
      return {
        cltRefs: ["CLT art. 457, §2º", "CLT art. 457, §4º"],
        tstRefs: [],
        ojRefs: [],
      };
    case "criterios":
      return {
        cltRefs: ["CLT art. 457, §4º"],
        tstRefs: [],
        ojRefs: [],
      };
    case "base":
      return {
        cltRefs: ["CLT art. 457", "CLT art. 457, §2º", "CLT art. 457, §4º"],
        tstRefs: [],
        ojRefs: [],
      };
    case "reducoes":
      return {
        cltRefs: ["CLT art. 468"],
        tstRefs: ["Súmula 51 do TST"],
        ojRefs: [],
      };
    case "lgpd":
      return {
        cltRefs: [],
        tstRefs: [],
        ojRefs: [],
      };
    default:
      return {
        cltRefs: ["CLT art. 457"],
        tstRefs: [],
        ojRefs: [],
      };
  }
}

function collectCategoryFindings(params: {
  category: StepCategory;
  strengths: string[];
  attentionPoints: string[];
  ambiguities: string[];
  recommendedAdjustments: string[];
}) {
  return {
    strengths: params.strengths.filter((item) => classifyStepCategory(item) === params.category),
    attentionPoints: params.attentionPoints.filter((item) => classifyStepCategory(item) === params.category),
    ambiguities: params.ambiguities.filter((item) => classifyStepCategory(item) === params.category),
    adjustments: params.recommendedAdjustments.filter((item) => classifyStepCategory(item) === params.category),
  };
}

function buildFundamentos(params: {
  recipeOrchestration?: RecipeOrchestration | null;
  riskMatrix: J360LegalReport["riskMatrix"];
  strengths: string[];
  attentionPoints: string[];
  ambiguities: string[];
  recommendedAdjustments: string[];
  documentEvidence?: ExtractedPdfDocument | null;
}) {
  const steps = params.recipeOrchestration?.recipeSteps ?? [];
  if (steps.length === 0) {
    return params.riskMatrix.slice(0, 4).map((risk) => {
      const category = classifyStepCategory(risk.risk);
      const refs = getLegalReferencesForCategory(category);
      return {
        topic: risk.relatedClause ?? risk.risk,
        analysis: [
          `Achado principal: ${risk.risk}`,
          `Impacto jurídico: ${risk.impact}`,
          `Mitigação sugerida: ${risk.mitigation}`,
        ].join(" "),
        cltRefs: refs.cltRefs,
        tstRefs: refs.tstRefs,
        ojRefs: refs.ojRefs,
        evidenceRefs: risk.evidenceRefs,
      };
    });
  }

  return steps.map((step) => {
    const category = classifyStepCategory(`${step.title} ${step.objective}`);
    const refs = getLegalReferencesForCategory(category);
    const findings = collectCategoryFindings({
      category,
      strengths: params.strengths,
      attentionPoints: params.attentionPoints,
      ambiguities: params.ambiguities,
      recommendedAdjustments: params.recommendedAdjustments,
    });
    const matchedRisks = params.riskMatrix.filter((item) => classifyStepCategory(item.risk) === category);
    const evidenceRefs = dedupeStrings(
      matchedRisks.flatMap((item) =>
        item.evidenceRefs.map(
          (ref) => `${ref.document ?? ""}|${ref.sourceStatus}|${ref.page ?? ""}|${ref.section ?? ""}|${ref.excerpt ?? ""}`
        )
      )
    ).map((serialized) => {
      const [document, sourceStatus, page, section, excerpt] = serialized.split("|");
      return {
        document: document || null,
        sourceStatus: sourceStatus === "provided" ? "provided" : "not_provided",
        page: page || null,
        section: section || null,
        excerpt: excerpt || null,
      } satisfies EvidenceRef;
    });
    const analysisParts = [
      step.objective,
      findings.strengths[0] ? `Ponto favorável observado: ${findings.strengths[0]}` : null,
      matchedRisks[0] ? `Risco principal: ${matchedRisks[0].risk}` : null,
      findings.ambiguities[0] ? `Ambiguidade relevante: ${findings.ambiguities[0]}` : null,
      findings.adjustments[0] ? `Ajuste recomendado: ${findings.adjustments[0]}` : null,
    ].filter((item): item is string => Boolean(item));

    return {
      topic: step.title,
      analysis: analysisParts.join(" "),
      cltRefs: refs.cltRefs,
      tstRefs: refs.tstRefs,
      ojRefs: refs.ojRefs,
      evidenceRefs,
    };
  });
}

function collectReferenceSet(fundamentos: Array<J360LegalReport["fundamentos"][number]>) {
  return {
    cltRefs: dedupeStrings(fundamentos.flatMap((item) => item.cltRefs)),
    tstRefs: dedupeStrings(fundamentos.flatMap((item) => item.tstRefs)),
    ojRefs: dedupeStrings(fundamentos.flatMap((item) => item.ojRefs)),
  };
}

function buildRelatorioFactual(params: {
  analysisScope: string;
  documentEvidence?: ExtractedPdfDocument | null;
  documentName: string | null;
  customerName: string | null;
}) {
  const openingLines = params.documentEvidence?.pages[0]?.lines.slice(0, 4).join(" ") ?? "";
  const client = params.customerName ? `A consulente ${params.customerName}` : "A consulente";
  const documentText = params.documentName ? ` submeteu o documento ${params.documentName}` : " submeteu a minuta em análise";
  const pageSnippet = openingLines ? ` O texto-base do documento inicia com: ${openingLines}` : "";
  return `${client}${documentText} para análise jurídica preliminar. Escopo: ${params.analysisScope}.${pageSnippet}`.trim();
}

function buildEmenta(params: {
  legalDecision: J360LegalReport["legalDecision"];
  riskLevel: J360LegalReport["riskLevel"];
  references: { cltRefs: string[]; tstRefs: string[]; ojRefs: string[] };
}) {
  const decisionLabel =
    params.legalDecision === "NAO_RECOMENDADO_SEM_REVISAO"
      ? "NÃO RECOMENDADO SEM REVISÃO"
      : params.legalDecision === "APROVADO_COM_RESSALVAS"
      ? "APROVADO COM RESSALVAS"
      : "APROVADO PARA USO INTERNO COM BAIXO RISCO";
  const legalRefs = [...params.references.cltRefs.slice(0, 2), ...params.references.tstRefs.slice(0, 1), ...params.references.ojRefs.slice(0, 1)]
    .filter(Boolean)
    .join("; ");
  return `DIREITO DO TRABALHO. POLÍTICA DE PREMIAÇÃO. ${legalRefs || "ANÁLISE PRELIMINAR"} RISCO ${params.riskLevel.toUpperCase()}. ${decisionLabel}.`;
}

function buildConclusaoFormal(params: {
  legalDecision: J360LegalReport["legalDecision"];
  manualReviewRequired: boolean;
  recommendedAdjustments: string[];
  conclusionSection: string;
}) {
  if (params.conclusionSection.trim()) return params.conclusionSection.trim();
  const decisionLabel =
    params.legalDecision === "NAO_RECOMENDADO_SEM_REVISAO"
      ? "não recomendado sem revisão jurídica"
      : params.legalDecision === "APROVADO_COM_RESSALVAS"
      ? "aprovado com ressalvas"
      : "aprovado para uso interno com baixo risco";
  const nextAction = params.recommendedAdjustments[0]
    ? ` Recomenda-se, em especial, ${params.recommendedAdjustments[0].replace(/\.$/, "").toLowerCase()}.`
    : "";
  const humanReview = params.manualReviewRequired
    ? " A revisão jurídica humana permanece necessária antes da aplicação final."
    : "";
  return `Conclui-se que o documento está ${decisionLabel}.${nextAction}${humanReview}`.trim();
}

function buildExecutiveGuidance(params: {
  legalDecision: J360LegalReport["legalDecision"];
  manualReviewRequired: boolean;
  nextBestImplementationAction: string | null;
  recommendedAdjustments: string[];
  riskMatrix: J360LegalReport["riskMatrix"];
  humanValidationQuestions: string[];
  recommendedEvidence: string[];
  coverageMatrix: J360LegalReport["coverageMatrix"];
}) {
  const adjustNow = dedupeStrings(
    [
      params.nextBestImplementationAction,
      ...params.recommendedAdjustments.slice(0, 3),
      ...params.riskMatrix.slice(0, 2).map((item) => item.mitigation),
    ].filter((item): item is string => Boolean(item))
  ).slice(0, 4);

  const dependsOnHumanReview = dedupeStrings(
    [
      ...params.humanValidationQuestions,
      ...params.coverageMatrix.map((item) => item.whatStillNeedsManualReview).filter((item): item is string => Boolean(item)),
      params.manualReviewRequired ? "Consolidar a versão final com advogado trabalhista responsável." : null,
    ].filter((item): item is string => Boolean(item))
  ).slice(0, 4);

  const rerunWhen = dedupeStrings(
    [
      adjustNow[0] ? `Após ajustar: ${adjustNow[0]}` : null,
      params.recommendedEvidence[0] ? `Após anexar evidência complementar: ${params.recommendedEvidence[0]}` : null,
      dependsOnHumanReview[0] ? `Após responder a pendência humana principal: ${dependsOnHumanReview[0]}` : null,
    ].filter((item): item is string => Boolean(item))
  ).slice(0, 4);

  const readyForInternalUseWhen =
    params.legalDecision === "APROVADO_BAIXO_RISCO"
      ? [
          "Quando a minuta final refletir os ajustes menores identificados e permanecer coerente com a prática operacional.",
        ]
      : params.legalDecision === "APROVADO_COM_RESSALVAS"
      ? [
          "Quando os ajustes críticos forem incorporados à minuta final.",
          "Quando a validação jurídica humana final confirmar a redação revisada antes da aplicação interna.",
        ]
      : [
          "Somente após revisão jurídica material da minuta e nova rodada completa de análise.",
        ];

  return {
    adjustNow,
    dependsOnHumanReview,
    rerunWhen,
    readyForInternalUseWhen,
  };
}

export function buildJ360LegalReport(params: BuildJ360LegalReportParams): J360LegalReport {
  const rawStructured = extractStructuredSections(params.rawOutput);
  const sourceText = params.outputText?.trim() || (typeof params.rawOutput === "string" ? params.rawOutput.trim() : "");
  const normalizedSourceText = stripLeadingJsonEnvelope(sourceText);
  const sections = splitIntoSections(normalizedSourceText);
  const summarySection = rawStructured?.summary || sectionText(sections, ["resumo executivo", "resumo"]);
  const strengthsSection =
    rawStructured?.strengths || rawStructured?.opportunities || sectionText(sections, ["pontos fortes", "oportunidades"]);
  const attentionSection =
    rawStructured?.attentionPoints || sectionText(sections, ["pontos de atenção", "riscos", "insights"]);
  const riskMatrixSection = rawStructured?.riskMatrix || sectionText(sections, ["matriz de riscos"]);
  const ambiguitiesSection =
    rawStructured?.ambiguities || sectionText(sections, ["ambiguidades", "inconsistencias", "inconsistências"]);
  const recommendedAdjustmentsSection =
    rawStructured?.recommendedAdjustments ||
    sectionText(sections, ["recomendações de ajuste", "recomendacoes de ajuste", "recomendações"]);
  const recommendedEvidenceSection =
    rawStructured?.recommendedEvidence || sectionText(sections, ["evidências", "documentos complementares"]);
  const humanQuestionsSection =
    rawStructured?.humanQuestions || sectionText(sections, ["perguntas para validação humana", "validação humana"]);
  const conclusionSection =
    rawStructured?.conclusion || sectionText(sections, ["conclusão preliminar", "conclusão"]);
  const bodySection = rawStructured?.stage || sectionText(sections, ["body"]);

  const strengths = extractList(strengthsSection);
  const attentionPoints = extractList(attentionSection);
  const ambiguities = dedupeStrings([
    ...extractList(ambiguitiesSection),
    ...attentionPoints.filter((item) => {
      const normalized = normalizeText(item);
      return normalized.includes("ambig") || normalized.includes("contradit");
    }),
  ]);
  const recommendedAdjustments = extractList(recommendedAdjustmentsSection);
  const recommendedEvidence = extractList(recommendedEvidenceSection);
  const humanValidationQuestions = dedupeStrings([
    ...extractList(humanQuestionsSection),
    ...attentionPoints
      .filter((item) => {
        const normalized = normalizeText(item);
        return (
          normalized.includes("revisao humana") ||
          normalized.includes("revisão humana") ||
          normalized.includes("juridica humana") ||
          normalized.includes("jurídica humana") ||
          (normalized.includes("revisao") && normalized.includes("humana"))
        );
      })
      .map((item) => `Qual validação jurídica humana deve ser feita sobre: ${item}`),
  ]);
  const summary = firstParagraph(summarySection) || firstParagraph(bodySection) || "Análise jurídica preliminar consolidada.";
  const linkedRecipe = isPlainObject(params.metadata?.linkedRecipe)
    ? (params.metadata?.linkedRecipe as PlainObject)
    : null;
  const form = isPlainObject(params.metadata?.form) ? (params.metadata?.form as PlainObject) : null;
  const analysisScope =
    params.recipeOrchestration?.recipeGoal ??
    (linkedRecipe && typeof linkedRecipe.title === "string"
      ? String(linkedRecipe.title)
      : "Análise jurídica documental");
  const riskLevel = inferRiskLevel(`${riskMatrixSection}\n${attentionSection}\n${conclusionSection}`, params.recipeOrchestration);
  const legalDecision = inferLegalDecision({
    text: `${conclusionSection}\n${normalizedSourceText}`,
    riskLevel,
    attentionPoints,
    ambiguities,
    recommendedAdjustments,
  });
  const manualReviewRequired = inferManualReviewRequired({
    text: `${conclusionSection}\n${normalizedSourceText}`,
    decision: legalDecision,
    riskLevel,
    humanValidationQuestions,
    ambiguities,
  });
  const howToProceedNow = buildHowToProceedNow({
    recommendedAdjustments,
    recommendedEvidence,
    humanValidationQuestions,
    recipeOrchestration: params.recipeOrchestration,
  });
  const riskMatrix =
    riskMatrixSection.trim().length > 0
      ? buildRiskMatrix({
          attentionPoints: extractList(riskMatrixSection),
          ambiguities,
          recommendedAdjustments,
          riskLevel,
          metadata: params.metadata,
          recipeOrchestration: params.recipeOrchestration,
          documentEvidence: params.documentEvidence,
        })
      : buildRiskMatrix({
          attentionPoints,
          ambiguities,
          recommendedAdjustments,
          riskLevel,
          metadata: params.metadata,
          recipeOrchestration: params.recipeOrchestration,
          documentEvidence: params.documentEvidence,
        });
  const fundamentos = buildFundamentos({
    recipeOrchestration: params.recipeOrchestration,
    riskMatrix,
    strengths,
    attentionPoints,
    ambiguities,
    recommendedAdjustments,
    documentEvidence: params.documentEvidence,
  });
  const references = collectReferenceSet(fundamentos);
  const relatorioFactual = buildRelatorioFactual({
    analysisScope,
    documentEvidence: params.documentEvidence,
    documentName: params.documentEvidence?.document ?? extractSupportingDocumentNames(params.metadata)[0] ?? null,
    customerName: typeof form?.customerName === "string" ? form.customerName : null,
  });
  const ementa = buildEmenta({
    legalDecision,
    riskLevel,
    references,
  });
  const conclusaoFormal = buildConclusaoFormal({
    legalDecision,
    manualReviewRequired,
    recommendedAdjustments,
    conclusionSection,
  });
  const coverageMatrix = buildCoverageMatrix({
    recipeOrchestration: params.recipeOrchestration,
    riskMatrix,
    strengths,
    attentionPoints,
    ambiguities,
    recommendedAdjustments,
  });
  const nextBestImplementationAction =
    params.recipeOrchestration?.nextBestImplementationAction ??
    recommendedAdjustments[0] ??
    howToProceedNow[0] ??
    null;
  const executiveGuidance = buildExecutiveGuidance({
    legalDecision,
    manualReviewRequired,
    nextBestImplementationAction,
    recommendedAdjustments,
    riskMatrix,
    humanValidationQuestions,
    recommendedEvidence,
    coverageMatrix,
  });
  const documentName = params.documentEvidence?.document ?? extractSupportingDocumentNames(params.metadata)[0] ?? null;
  const workspaceBrand = buildWorkspaceBrand(params.metadata);
  const documentIdentity = {
    documentName,
    generatedAt: new Date().toISOString(),
    reportVersion: "v1",
  } as const;
  const reportSections = buildReportSections({
    report: {
      ementa,
      relatorioFactual,
      fundamentos,
      references,
      riskMatrix,
      recommendedAdjustments,
      conclusaoFormal,
      manualReviewRequired,
      executiveGuidance,
      coverageMatrix,
    },
  });
  const tableOfContents = reportSections.map((section, index) => ({
    id: section.id,
    title: section.title,
    anchor: section.anchor,
    order: index,
  }));

  return J360LegalReportSchema.parse({
    schemaVersion: "j360_legal_report.v1",
    documentType: "politica_trabalhista",
    analysisScope,
    workspaceBrand,
    documentIdentity,
    reportSections,
    tableOfContents,
    header: {
      number: null,
      interessado: typeof form?.customerName === "string" ? form.customerName : null,
      assunto: typeof linkedRecipe?.title === "string" ? linkedRecipe.title : documentName,
    },
    ementa,
    relatorioFactual,
    fundamentos,
    references,
    executiveGuidance,
    jurimetria: {
      riskOfLoss: riskLevel,
      rationale: attentionPoints[0] ?? ambiguities[0] ?? null,
    },
    legalDecision,
    riskLevel,
    summary,
    strengths,
    attentionPoints,
    riskMatrix,
    ambiguities,
    recommendedAdjustments,
    recommendedEvidence,
    humanValidationQuestions,
    manualReviewRequired,
    howToProceedNow,
    nextBestImplementationAction,
    coverageMatrix,
    conclusaoFormal,
  });
}
