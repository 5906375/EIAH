import type { Run } from "@/lib/api";

/** * --- Helpers Existentes ---
 */
export const formatAgentLabel = (agent: string) => {
  const normalized = agent.trim().toLowerCase();
  if (normalized === "eiah") return "EIAH";
  return agent;
};

export const getAgentInitials = (agent: string) => {
  const label = formatAgentLabel(agent);
  const compact = label.replace(/[^a-zA-Z0-9]/g, "");
  return (compact.slice(0, 2) || label.slice(0, 2) || "AI").toUpperCase();
};

export const formatRunId = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

export const centsToBRL = (cents?: number) => {
  if (cents === undefined) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
};

export const extractDuration = (run: Run) => {
  if (run.meta?.tookMs !== undefined) return run.meta.tookMs;
  if (run.startedAt && run.finishedAt) {
    const started = new Date(run.startedAt).getTime();
    const finished = new Date(run.finishedAt).getTime();
    if (!Number.isNaN(started) && !Number.isNaN(finished)) {
      return Math.max(0, finished - started);
    }
  }
  return undefined;
};

export const formatDuration = (ms?: number) => {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0).replace(".", ",")} s`;
  return `${(ms / 60000).toFixed(1).replace(".", ",")} min`;
};

export const formatTrace = (traceId?: string) => {
  if (!traceId) return null;
  return traceId.length > 12 ? `Trace ${traceId.slice(0, 4)}…${traceId.slice(-4)}` : `Trace ${traceId}`;
};

export const formatClockTime = (iso?: string) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return null;
  }
};

/** * --- Novo Parser Inteligente (EIAH UI/UX) ---
 */

export type ExtractedRec = {
  key?: string;
  tatica?: string;
  prioridade?: number | string;
  rationale?: string;
  proximos_passos?: string;
  adopted?: boolean;
};

export type ExtractedDoc = {
  definicao?: string;
  principais_funcionalidades?: string[];
  melhores_praticas?: string[];
  proximos_passos?: string[];
  limitacoes?: string[];
};

export type ExtractedResult = {
  metaJson: any | null;
  recs: ExtractedRec[];
  doc: ExtractedDoc | null;
  docMarkdown: string;
  technicalRaw: string;
  runId: string;
};

export function sanitizeAssistantContent(content: string): string {
  if (!content) return "";
  return content.replace(/```json\n?|```/g, "").trim();
}

function buildDocMarkdownFromStructured(doc: ExtractedDoc | null): string {
  if (!doc) return "";
  const bullets = (title: string, items?: string[]) =>
    items?.length ? `\n### ${title}\n${items.map((x) => `- ${x}`).join("\n")}\n` : "";

  return [
    doc.definicao ? `## Documentação Resumida\n\n${doc.definicao}\n` : "",
    bullets("Principais Funcionalidades", doc.principais_funcionalidades),
    bullets("Melhores Práticas", doc.melhores_praticas),
    bullets("Próximos Passos", doc.proximos_passos),
    bullets("Limitações", doc.limitacoes),
  ].join("\n").trim();
}

export function extractDocAndRecs(resultString: unknown): ExtractedResult {
  const raw = typeof resultString === "string" ? resultString.trim() : "";
  const result: ExtractedResult = {
    metaJson: null,
    recs: [],
    doc: null,
    docMarkdown: "",
    technicalRaw: "",
    runId: ""
  };

  if (!raw) return result;

  const divider = "\n---\n";
  let jsonPart = raw;
  let humanPart = "";

  if (raw.includes(divider)) {
    const parts = raw.split(divider);
    jsonPart = parts[0]?.trim() ?? "";
    humanPart = parts.slice(1).join(divider).trim();
  }

  try {
    const jsonMatch = jsonPart.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      result.metaJson = parsed;
      result.recs = Array.isArray(parsed.recomendacoes) ? parsed.recomendacoes : [];
      result.doc = parsed.documentacao_agent_orchestrator || null;
      result.runId = parsed.run_id || "";
      result.technicalRaw = JSON.stringify(parsed, null, 2);
    }
  } catch (e) {
    result.technicalRaw = jsonPart;
  }

  // Define o que o usuário vai ler no chat
  result.docMarkdown =
    humanPart ||
    buildDocMarkdownFromStructured(result.doc) ||
    result.metaJson?.message ||
    (jsonPart.startsWith('{') ? "" : jsonPart);

  if (!result.docMarkdown && result.recs.length > 0) {
    const primary = result.recs[0];
    const paragraph = primary.rationale || primary.tatica || primary.key || "";
    const stepsRaw = primary.proximos_passos || "";
    const steps = stepsRaw
      .split(/\d+\.\s+|;\s+/)
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, 4);
    const stepsBlock = steps.length > 0 ? `\n\nProximos passos:\n${steps.map((s) => `- ${s}`).join("\n")}` : "";
    result.docMarkdown = `${paragraph}${stepsBlock}`.trim();
  }

  return result;
}
