// Validação da origem e derivação do fingerprint no servidor.
//
// D5 estrutural (implementado nesta unidade, ver CONSULTATION_ORIGIN_AUTHZ_v2.md
// seção 9 — "Aprovação de contrato técnico", 2026-09-11): o único `agentKey`
// aceito como produtor de origem é exatamente "radar" (comparação exata, sem
// trim/lowercase/heurística/alias), e o `response` desse Run deve satisfazer
// integralmente o contrato `RadarSignalResultV1` (radarSignalResultValidator.ts).
// D5-A (allowlist) e D5-B (validador de conteúdo) juntos — nenhuma implementação
// parcial isolada é declarada aqui. Isto NÃO implementa D4, D6, TTL, resolução
// autorizada do sujeito, outbox, publicação em fila ou chamada ao LLM — nenhum
// desses efeitos é produzido por este módulo.
import crypto from "node:crypto";
import type { Run, TransactableClient } from "@repo/db";
import { validateRadarSignalResult } from "./radarSignalResultValidator";

export class SignalForwardOriginError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`signal_forward_origin_invalid:${reasonCode}`);
    this.name = "SignalForwardOriginError";
  }
}

const REQUIRED_ORIGIN_STATUS = "success" as const;

// D5 — único produtor de origem ratificado. Comparação sempre exata contra
// este literal; nenhuma variação de caixa/espaço, alias ou consulta a agentes
// dinâmicos amplia esta lista.
export const RATIFIED_RADAR_AGENT_KEY = "radar" as const;

// Exportada deliberadamente: é a fonte única de verdade tanto para o cálculo
// do fingerprint (abaixo) quanto para o valor persistido em
// SignalForwardRequest.fingerprintVersion (signalForwardingService.ts) — usar
// a mesma constante nos dois pontos evita que a versão persistida divirja da
// versão realmente usada no cálculo.
export const FINGERPRINT_CONTRACT_VERSION = "signal-forward-fingerprint.v1";

/**
 * Lê a origem ESCOPADA por tenant/workspace (nunca por id isolado) e valida,
 * nesta ordem: existência no escopo; estado terminal de sucesso; `response`
 * estruturado; produtor exatamente "radar" (D5-A); e o contrato de conteúdo
 * `RadarSignalResultV1` completo (D5-B). Retorna a mesma mensagem/reasonCode
 * tanto para "não existe" quanto para "existe em outro tenant/workspace" —
 * não expõe se um run de outro tenant existe.
 */
export async function readAndValidateOrigin(
  client: TransactableClient,
  params: { tenantId: string; workspaceId: string; sourceRunId: string }
): Promise<Run> {
  const sourceRun = await client.run.findFirst({
    where: { id: params.sourceRunId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });

  if (!sourceRun) {
    // Mesmo reasonCode para "não existe" e "existe em outro tenant/workspace" —
    // não há como o chamador distinguir os dois casos pela resposta.
    throw new SignalForwardOriginError("source_run_not_found_in_scope");
  }

  if (sourceRun.status !== REQUIRED_ORIGIN_STATUS) {
    throw new SignalForwardOriginError("source_run_not_in_required_state", {
      status: sourceRun.status,
    });
  }

  const response = sourceRun.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new SignalForwardOriginError("source_run_missing_structured_response");
  }

  // D5-A — identidade exata do produtor, depois do escopo/estado já
  // confirmados acima, antes de qualquer validação detalhada de conteúdo.
  if (sourceRun.agent !== RATIFIED_RADAR_AGENT_KEY) {
    throw new SignalForwardOriginError("source_agent_not_ratified", { agent: sourceRun.agent });
  }

  // D5-B — contrato de conteúdo completo (RadarSignalResultV1). Validação
  // pura, sem I/O: não resolve subjectId, não verifica classificação
  // semântica, não busca URLs. Lança SignalForwardOriginError na primeira
  // violação encontrada; não normaliza nem modifica `response`.
  validateRadarSignalResult(response);

  return sourceRun;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
  );
  return `{${entries.join(",")}}`;
}

/**
 * Snapshot imutável do conteúdo efetivamente usado (o response validado da
 * origem) — preservado à parte do hash, não substituído por ele.
 */
export function buildOriginSnapshot(sourceRun: Run): Record<string, unknown> {
  return sourceRun.response as Record<string, unknown>;
}

/**
 * Fingerprint determinístico, sem timestamps/campos voláteis, calculado a
 * partir da origem validada (não do que o chamador afirma). contractVersion
 * versiona o próprio algoritmo — uma mudança futura na forma de calcular deve
 * incrementá-lo para não colidir com fingerprints antigos.
 */
export function computeRequestFingerprint(params: {
  sourceRunId: string;
  destinationAgent: string;
  originSnapshot: Record<string, unknown>;
}): string {
  const normalized = {
    contractVersion: FINGERPRINT_CONTRACT_VERSION,
    sourceRunId: params.sourceRunId,
    destinationAgent: params.destinationAgent.trim().toLowerCase(),
    originSnapshot: params.originSnapshot,
  };
  return crypto.createHash("sha256").update(stableStringify(normalized)).digest("hex");
}
