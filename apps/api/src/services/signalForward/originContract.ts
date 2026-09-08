// Validação da origem e derivação do fingerprint no servidor.
//
// IMPORTANTE — "contrato Radar": não existe hoje, em nenhum lugar deste
// repositório, um agente ou contrato ratificado chamado "Radar" (busca
// exaustiva nesta unidade: nenhuma ocorrência real de um agente "radar" em
// apps/api/src/services/agents.ts nem em packages/core/src). Não invento essa
// validação — aplico apenas os invariantes estruturais mínimos e genéricos
// que QUALQUER origem precisa satisfazer para ser encaminhada com segurança
// (estado terminal de sucesso + resposta estruturada). Quando um contrato
// Radar real existir, esta validação deve ser reconciliada com ele, não
// substituída silenciosamente.
import crypto from "node:crypto";
import type { Run, TransactableClient } from "@repo/db";

export class SignalForwardOriginError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`signal_forward_origin_invalid:${reasonCode}`);
    this.name = "SignalForwardOriginError";
  }
}

const REQUIRED_ORIGIN_STATUS = "success" as const;

// Exportada deliberadamente: é a fonte única de verdade tanto para o cálculo
// do fingerprint (abaixo) quanto para o valor persistido em
// SignalForwardRequest.fingerprintVersion (signalForwardingService.ts) — usar
// a mesma constante nos dois pontos evita que a versão persistida divirja da
// versão realmente usada no cálculo.
export const FINGERPRINT_CONTRACT_VERSION = "signal-forward-fingerprint.v1";

/**
 * Lê a origem ESCOPADA por tenant/workspace (nunca por id isolado) e valida
 * o mínimo estrutural exigido para encaminhamento. Retorna a mesma
 * mensagem/reasonCode tanto para "não existe" quanto para "existe em outro
 * tenant/workspace" — não expõe se um run de outro tenant existe.
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
