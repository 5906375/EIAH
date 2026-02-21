import { prismaGlobal } from "@repo/db";
import type { WhatsAppDeliveryReceipt, WhatsAppStore, WhatsAppTemplatePayload } from "./index";

let ensurePromise: Promise<void> | null = null;

async function ensureTables() {
  await prismaGlobal.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS whatsapp_opt_in (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      phone_e164 TEXT NOT NULL,
      opted_in BOOLEAN NOT NULL DEFAULT true,
      source TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP NULL
    );
  `);
  await prismaGlobal.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_opt_in_lookup ON whatsapp_opt_in (tenant_id, workspace_id, phone_e164, created_at DESC);`
  );

  await prismaGlobal.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS whatsapp_message_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      phone_e164 TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      context_json JSONB NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      provider_payload_json JSONB NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await prismaGlobal.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_message_lookup ON whatsapp_message_log (tenant_id, workspace_id, phone_e164, sent_at DESC);`
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function ensureReady() {
  if (!ensurePromise) {
    ensurePromise = ensureTables();
  }
  await ensurePromise;
}

export function createPrismaWhatsAppStore(): WhatsAppStore & {
  upsertOptIn(params: {
    tenantId: string;
    workspaceId: string;
    to: string;
    optedIn: boolean;
    source?: string;
  }): Promise<void>;
  persistDeliveryReceiptByMessageId(params: {
    messageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    raw?: unknown;
  }): Promise<void>;
} {
  return {
    async hasOptIn(params) {
      await ensureReady();
      const phone = normalizePhone(params.to);
      const rows = await prismaGlobal.$queryRawUnsafe<
        Array<{ opted_in: boolean; revoked_at: Date | null }>
      >(
        `
          SELECT opted_in, revoked_at
          FROM whatsapp_opt_in
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND phone_e164 = $3
          ORDER BY created_at DESC
          LIMIT 1
        `,
        params.tenantId,
        params.workspaceId,
        phone
      );
      const current = rows[0];
      if (!current) return false;
      return current.opted_in === true && current.revoked_at === null;
    },

    async persistOutboundMessage(params: {
      tenantId: string;
      workspaceId: string;
      messageId: string;
      to: string;
      payload: WhatsAppTemplatePayload;
      context?: Record<string, unknown>;
    }) {
      await ensureReady();
      await prismaGlobal.$executeRawUnsafe(
        `
          INSERT INTO whatsapp_message_log (
            id, tenant_id, workspace_id, message_id, phone_e164, payload_json, context_json, status, provider_payload_json, sent_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, NOW(), NOW())
          ON CONFLICT (message_id) DO UPDATE
          SET payload_json = EXCLUDED.payload_json,
              context_json = EXCLUDED.context_json,
              updated_at = NOW()
        `,
        `wamlog_${params.messageId}`,
        params.tenantId,
        params.workspaceId,
        params.messageId,
        normalizePhone(params.to),
        JSON.stringify(params.payload),
        JSON.stringify(params.context ?? null),
        "sent",
        JSON.stringify({ provider: "stub" })
      );
    },

    async persistDeliveryReceipt(receipt: WhatsAppDeliveryReceipt) {
      await ensureReady();
      await prismaGlobal.$executeRawUnsafe(
        `
          UPDATE whatsapp_message_log
          SET status = $1,
              provider_payload_json = $2::jsonb,
              updated_at = NOW()
          WHERE message_id = $3
            AND tenant_id = $4
            AND workspace_id = $5
        `,
        receipt.status,
        JSON.stringify(receipt.raw ?? null),
        receipt.messageId,
        receipt.tenantId,
        receipt.workspaceId
      );
    },

    async persistDeliveryReceiptByMessageId(params: {
      messageId: string;
      status: "sent" | "delivered" | "read" | "failed";
      timestamp: string;
      raw?: unknown;
    }) {
      await ensureReady();
      await prismaGlobal.$executeRawUnsafe(
        `
          UPDATE whatsapp_message_log
          SET status = $1,
              provider_payload_json = $2::jsonb,
              updated_at = NOW()
          WHERE message_id = $3
        `,
        params.status,
        JSON.stringify({ timestamp: params.timestamp, raw: params.raw ?? null }),
        params.messageId
      );
    },

    async upsertOptIn(params: {
      tenantId: string;
      workspaceId: string;
      to: string;
      optedIn: boolean;
      source?: string;
    }) {
      await ensureReady();
      const now = new Date().toISOString();
      await prismaGlobal.$executeRawUnsafe(
        `
          INSERT INTO whatsapp_opt_in (
            id, tenant_id, workspace_id, phone_e164, opted_in, source, created_at, revoked_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
        `,
        `waopt_${params.tenantId}_${params.workspaceId}_${normalizePhone(params.to)}_${Date.now()}`,
        params.tenantId,
        params.workspaceId,
        normalizePhone(params.to),
        params.optedIn,
        params.source ?? "manual",
        params.optedIn ? null : now
      );
    },
  };
}
