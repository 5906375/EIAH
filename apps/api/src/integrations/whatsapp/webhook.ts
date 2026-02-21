import crypto from "node:crypto";
import type { WhatsAppDeliveryStatus } from "./index";

export type ParsedDeliveryReceipt = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  timestamp: string;
  raw: unknown;
};

type MetaStatusEntry = {
  id?: unknown;
  status?: unknown;
  timestamp?: unknown;
};

function asDeliveryStatus(value: unknown): WhatsAppDeliveryStatus | null {
  if (value === "sent" || value === "delivered" || value === "read" || value === "failed") {
    return value;
  }
  return null;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      return new Date(Number(value) * 1000).toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function parseMetaDeliveryReceipts(payload: unknown): ParsedDeliveryReceipt[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as any)?.entry;
  if (!Array.isArray(entries)) return [];
  const receipts: ParsedDeliveryReceipt[] = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const statusEntry of statuses as MetaStatusEntry[]) {
        const messageId = typeof statusEntry?.id === "string" ? statusEntry.id.trim() : "";
        const status = asDeliveryStatus(statusEntry?.status);
        if (!messageId || !status) continue;
        receipts.push({
          messageId,
          status,
          timestamp: normalizeTimestamp(statusEntry?.timestamp),
          raw: statusEntry,
        });
      }
    }
  }
  return receipts;
}

export function verifyMetaWebhookSignature(params: {
  appSecret?: string;
  rawBody: Buffer | string;
  signatureHeader?: string | null;
}) {
  if (!params.appSecret) return true;
  const signature = (params.signatureHeader ?? "").trim();
  if (!signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", params.appSecret)
    .update(params.rawBody)
    .digest("hex")}`;

  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
