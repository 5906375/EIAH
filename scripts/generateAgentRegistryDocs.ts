import fs from "node:fs";
import path from "node:path";

import { agentProfiles } from "../packages/core/src/actions/agents/registry.ts";
import type { AgentProfileSeed } from "../packages/core/src/actions/agents/types.ts";

const generatedAt = new Date().toISOString();
const catalog = [...agentProfiles].sort((a, b) => a.agent.localeCompare(b.agent));

function buildCatalogMarkdown(items: AgentProfileSeed[]) {
  const lines = [
    "# Agent Registry Catalog",
    "",
    `> Gerado automaticamente em \`${generatedAt}\` a partir de \`packages/core/src/actions/agents/registry.ts\` e dos perfis canônicos em \`packages/core/src/actions/agents/*.ts\`.`,
    "",
    "| agent id | modelo | llm usage | conflict resolution | deterministic sources | fallback | tools |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of items) {
    lines.push(
      `| \`${item.agent}\` | \`${item.model ?? "unknown"}\` | \`${item.knowledgePolicy?.llmUsageMode ?? "open_reasoning_restricted"}\` | \`${item.knowledgePolicy?.conflictResolution ?? "human_review"}\` | \`${item.knowledgePolicy?.deterministicSources.length ?? 0}\` | \`${item.knowledgePolicy?.fallbackPolicy ?? "human_review"}\` | \`${item.tools?.length ?? 0}\` |`,
    );
  }

  lines.push("", "## Fonte canônica", "", "- `packages/core/src/actions/agents/registry.ts`", "- `packages/core/src/actions/agents/*.ts`");
  return `${lines.join("\n")}\n`;
}

function buildExampleForAgent(item: AgentProfileSeed) {
  const sources = item.knowledgePolicy?.deterministicSources ?? [];
  const primarySources = sources.filter((source) => source.authorityLevel === "primary").map((source) => source.sourceId);
  const heading = `## ${item.agent} — ${item.name}`;
  const prompt = `**Prompt exemplo**\n> Preciso de ajuda com ${item.description?.toLowerCase() ?? "a operação do agente"}.`;
  const response = [
    "**Resposta esperada**",
    `- Modelo: \`${item.model ?? "unknown"}\``,
    `- Uso de LLM: \`${item.knowledgePolicy?.llmUsageMode ?? "open_reasoning_restricted"}\``,
    `- Resolução de conflito: \`${item.knowledgePolicy?.conflictResolution ?? "human_review"}\``,
    `- Fallback: \`${item.knowledgePolicy?.fallbackPolicy ?? "human_review"}\``,
    `- Fontes primárias: ${primarySources.length > 0 ? primarySources.join(", ") : "não declaradas"}`,
    `- Proveniência: \`${item.knowledgePolicy?.provenancePolicy ?? "recommended"}\``,
    `- Mascaramento: \`${item.knowledgePolicy?.maskingPolicy ?? "conditional"}\``,
    `- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.`,
  ].join("\n");

  return [heading, "", prompt, "", response].join("\n");
}

function buildExamplesMarkdown(items: AgentProfileSeed[]) {
  const lines = [
    "# Agent Response Examples",
    "",
    `> Gerado automaticamente em \`${generatedAt}\` a partir do registry canônico de agentes.`,
    "",
    "Os exemplos abaixo são contratos exemplificativos de operação e grounding, não transcripts reais de execução.",
    "",
  ];

  for (const item of items) {
    lines.push(buildExampleForAgent(item), "");
  }

  return `${lines.join("\n")}\n`;
}

function buildEvidenceJson(items: AgentProfileSeed[]) {
  return JSON.stringify(
    {
      ok: true,
      generatedAt,
      source: {
        registry: "packages/core/src/actions/agents/registry.ts",
        profiles: "packages/core/src/actions/agents/*.ts",
      },
      agents: items.map((item) => ({
        id: item.agent,
        model: item.model ?? "unknown",
        llmUsageMode: item.knowledgePolicy?.llmUsageMode ?? "open_reasoning_restricted",
        deterministicSources: item.knowledgePolicy?.deterministicSources.map((source) => source.sourceId) ?? [],
      })),
    },
    null,
    2,
  );
}

const outputs = [
  {
    file: path.resolve("docs/ops/agent-registry-catalog.md"),
    content: buildCatalogMarkdown(catalog),
  },
  {
    file: path.resolve("docs/ops/agent-response-examples.md"),
    content: buildExamplesMarkdown(catalog),
  },
  {
    file: path.resolve("ops/evidence/latest/agent-registry-docs-2026-03-16.json"),
    content: buildEvidenceJson(catalog),
  },
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output.file), { recursive: true });
  fs.writeFileSync(output.file, output.content, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedAt,
      files: outputs.map((output) => path.relative(process.cwd(), output.file)),
      agents: catalog.length,
    },
    null,
    2,
  ),
);
