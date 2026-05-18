import type { ImobChatMessage } from "@/lib/api";
import type { ImobResolveTurnResponse } from "@/features/imob/imobApiClient";

export type ChatProofSurface = NonNullable<ImobChatMessage["proof"]>;

function isAuthoritativeCanonicalSnapshot(
  metadata:
    | Pick<NonNullable<ImobResolveTurnResponse["presentation"]["metadata"]>, "canonicalSnapshot">
    | Pick<NonNullable<ImobChatMessage["presentationMetadata"]>, "canonicalSnapshot">
    | null
    | undefined,
) {
  return metadata?.canonicalSnapshot?.authoritative === true;
}

export function resolveTurnPresentationProof(
  presentation: Pick<ImobResolveTurnResponse["presentation"], "proof" | "card" | "metadata"> | null | undefined,
): ChatProofSurface | undefined {
  if (!presentation) return undefined;
  const direct = presentation.proof;
  const cardProof = isAuthoritativeCanonicalSnapshot(presentation.metadata) ? undefined : presentation.card?.proof;
  const source = direct ?? cardProof;
  if (!source) return undefined;
  const runId = source.runId ?? presentation.card?.runId ?? null;
  const txId = source.txId ?? null;
  const receiptPath = source.receiptPath ?? null;
  const bundlePath = source.bundlePath ?? null;
  const verifyUrl = source.verifyUrl ?? receiptPath ?? null;
  const ready = source.ready ?? Boolean(txId && receiptPath && bundlePath);
  const required = source.required ?? Boolean(runId || txId || receiptPath || bundlePath);
  return {
    required,
    ready,
    state: source.state ?? (required ? (ready ? "ready" : "pending") : (ready ? "ready" : "not_required")),
    runId,
    txId,
    receiptPath,
    bundlePath,
    verifyUrl,
  };
}

export function resolveVisibleMessageProof(
  message: Pick<ImobChatMessage, "proof" | "presentationMetadata"> & { card?: { proof?: ChatProofSurface } | null },
): ChatProofSurface | undefined {
  if (isAuthoritativeCanonicalSnapshot(message.presentationMetadata)) {
    return message.proof ?? undefined;
  }
  return message.proof ?? message.card?.proof ?? undefined;
}

export function buildRuntimeExecutionProof(params: {
  runId: string;
  txId?: string | null;
  receiptPath?: string | null;
  bundlePath?: string | null;
}): ChatProofSurface {
  const txId = params.txId ?? null;
  const receiptPath = params.receiptPath ?? null;
  const bundlePath = params.bundlePath ?? null;
  const ready = Boolean(txId && receiptPath && bundlePath);
  return {
    required: true,
    ready,
    state: ready ? "ready" : "pending",
    runId: params.runId,
    txId,
    receiptPath,
    bundlePath,
    verifyUrl: receiptPath,
  };
}
