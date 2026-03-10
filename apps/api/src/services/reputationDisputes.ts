import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";

export type DisputeStatus = "open" | "under_review" | "resolved" | "rejected";

type ReputationRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  agent_id: string;
  completed_runs: number;
  disputes_total: number;
  dispute_rate: number;
  trust_score: number;
  verified_receipts: number;
  created_at: Date;
  updated_at: Date;
};

const DEFAULT_TRUST_SCORE = 100;

function toReputationDTO(row: ReputationRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    completedRuns: Number(row.completed_runs),
    disputesTotal: Number(row.disputes_total),
    disputeRate: Number(row.dispute_rate),
    trustScore: Number(row.trust_score),
    verifiedReceipts: Number(row.verified_receipts),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function ensureReputationDisputeTables(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "agent_reputation" (
      "id" TEXT PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "agent_id" TEXT NOT NULL,
      "completed_runs" INTEGER NOT NULL DEFAULT 0,
      "disputes_total" INTEGER NOT NULL DEFAULT 0,
      "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "trust_score" INTEGER NOT NULL DEFAULT 100,
      "verified_receipts" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "agent_reputation_tenant_workspace_agent_unique"
      ON "agent_reputation"("tenant_id","workspace_id","agent_id");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "agent_reputation_tenant_workspace_idx"
      ON "agent_reputation"("tenant_id","workspace_id");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "billing_disputes" (
      "id" TEXT PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "payment_intent_id" TEXT NOT NULL,
      "run_id" TEXT NOT NULL,
      "agent_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'open',
      "reason" TEXT,
      "resolution" TEXT,
      "created_by_user_id" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closed_at" TIMESTAMP(3)
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "billing_disputes_tenant_workspace_status_idx"
      ON "billing_disputes"("tenant_id","workspace_id","status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "billing_disputes_payment_intent_idx"
      ON "billing_disputes"("payment_intent_id");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "agent_reputation_events" (
      "id" TEXT PRIMARY KEY,
      "event_key" TEXT NOT NULL UNIQUE,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "agent_id" TEXT NOT NULL,
      "event_type" TEXT NOT NULL,
      "payload" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function ensureSnapshot(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; agentId: string }
) {
  await ensureReputationDisputeTables(prisma);
  const id = `rep_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO "agent_reputation" (
        "id","tenant_id","workspace_id","agent_id","completed_runs","disputes_total","dispute_rate","trust_score","verified_receipts"
      ) VALUES ($1,$2,$3,$4,0,0,0,$5,0)
      ON CONFLICT ("tenant_id","workspace_id","agent_id")
      DO UPDATE SET "updated_at"=CURRENT_TIMESTAMP
      RETURNING *;
    `,
    id,
    params.tenantId,
    params.workspaceId,
    params.agentId,
    DEFAULT_TRUST_SCORE
  )) as ReputationRow[];
  return toReputationDTO(rows[0]);
}

async function registerEvent(
  prisma: PrismaClient,
  params: {
    eventKey: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    eventType: string;
    payload?: Record<string, unknown> | null;
  }
) {
  const id = `rpe_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO "agent_reputation_events" (
        "id","event_key","tenant_id","workspace_id","agent_id","event_type","payload"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT ("event_key")
      DO NOTHING
      RETURNING "id";
    `,
    id,
    params.eventKey,
    params.tenantId,
    params.workspaceId,
    params.agentId,
    params.eventType,
    JSON.stringify(params.payload ?? {})
  )) as { id: string }[];
  return Boolean(rows[0]?.id);
}

async function refreshDisputeRate(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; agentId: string }
) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE "agent_reputation"
      SET
        "dispute_rate"=CASE
          WHEN "completed_runs" <= 0 THEN 0
          ELSE ROUND(("disputes_total"::numeric / "completed_runs"::numeric)::numeric, 6)
        END,
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=$1 AND "workspace_id"=$2 AND "agent_id"=$3;
    `,
    params.tenantId,
    params.workspaceId,
    params.agentId
  );
}

export async function getAgentReputation(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; agentId: string }
) {
  await ensureSnapshot(prisma, params);
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "agent_reputation"
      WHERE "tenant_id"=$1 AND "workspace_id"=$2 AND "agent_id"=$3
      LIMIT 1;
    `,
    params.tenantId,
    params.workspaceId,
    params.agentId
  )) as ReputationRow[];
  return rows[0] ? toReputationDTO(rows[0]) : null;
}

export async function listAgentReputations(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string }
) {
  await ensureReputationDisputeTables(prisma);
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "agent_reputation"
      WHERE "tenant_id"=$1 AND "workspace_id"=$2
      ORDER BY "trust_score" DESC, "verified_receipts" DESC, "updated_at" DESC
      LIMIT 200;
    `,
    params.tenantId,
    params.workspaceId
  )) as ReputationRow[];
  return rows.map(toReputationDTO);
}

export async function applyReceiptFinalizedEvent(
  prisma: PrismaClient,
  params: {
    eventKey: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    verifiedReceipt?: boolean;
    trustScoreDelta?: number;
    payload?: Record<string, unknown> | null;
  }
) {
  await ensureSnapshot(prisma, params);
  const firstTime = await registerEvent(prisma, {
    eventKey: params.eventKey,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    eventType: "receipt.finalized",
    payload: params.payload,
  });
  if (!firstTime) {
    return { applied: false };
  }

  const verifiedIncrement = params.verifiedReceipt === false ? 0 : 1;
  const trustDelta = Number.isFinite(params.trustScoreDelta ?? NaN)
    ? Math.trunc(Number(params.trustScoreDelta))
    : 1;

  await prisma.$executeRawUnsafe(
    `
      UPDATE "agent_reputation"
      SET
        "completed_runs"="completed_runs"+1,
        "verified_receipts"="verified_receipts"+$4,
        "trust_score"=GREATEST(0, LEAST(200, "trust_score"+$5)),
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=$1 AND "workspace_id"=$2 AND "agent_id"=$3;
    `,
    params.tenantId,
    params.workspaceId,
    params.agentId,
    verifiedIncrement,
    trustDelta
  );

  await refreshDisputeRate(prisma, params);
  const current = await getAgentReputation(prisma, params);
  return { applied: true, current };
}

export async function applyDisputeClosedEvent(
  prisma: PrismaClient,
  params: {
    eventKey: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    outcome: "resolved" | "rejected";
    payload?: Record<string, unknown> | null;
  }
) {
  await ensureSnapshot(prisma, params);
  const firstTime = await registerEvent(prisma, {
    eventKey: params.eventKey,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    eventType: "dispute.closed",
    payload: {
      outcome: params.outcome,
      ...(params.payload ?? {}),
    },
  });
  if (!firstTime) {
    return { applied: false };
  }

  const trustDelta = params.outcome === "resolved" ? -2 : 1;
  await prisma.$executeRawUnsafe(
    `
      UPDATE "agent_reputation"
      SET
        "disputes_total"="disputes_total"+1,
        "trust_score"=GREATEST(0, LEAST(200, "trust_score"+$4)),
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "tenant_id"=$1 AND "workspace_id"=$2 AND "agent_id"=$3;
    `,
    params.tenantId,
    params.workspaceId,
    params.agentId,
    trustDelta
  );

  await refreshDisputeRate(prisma, params);
  const current = await getAgentReputation(prisma, params);
  return { applied: true, current };
}

const ALLOWED_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["under_review"],
  under_review: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
};

export function canTransitionDispute(from: DisputeStatus, to: DisputeStatus) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createBillingDispute(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    paymentIntentId: string;
    runId: string;
    agentId: string;
    reason?: string | null;
    createdByUserId?: string | null;
  }
) {
  await ensureReputationDisputeTables(prisma);
  const id = `dsp_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO "billing_disputes" (
        "id","tenant_id","workspace_id","payment_intent_id","run_id","agent_id","status","reason","created_by_user_id"
      ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8)
      RETURNING *;
    `,
    id,
    params.tenantId,
    params.workspaceId,
    params.paymentIntentId,
    params.runId,
    params.agentId,
    params.reason ?? null,
    params.createdByUserId ?? null
  )) as any[];
  return rows[0] ?? null;
}

export async function getBillingDispute(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; disputeId: string }
) {
  await ensureReputationDisputeTables(prisma);
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "billing_disputes"
      WHERE "id"=$1 AND "tenant_id"=$2 AND "workspace_id"=$3
      LIMIT 1;
    `,
    params.disputeId,
    params.tenantId,
    params.workspaceId
  )) as any[];
  return rows[0] ?? null;
}

export async function listBillingDisputes(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; status?: DisputeStatus | null }
) {
  await ensureReputationDisputeTables(prisma);
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "billing_disputes"
      WHERE "tenant_id"=$1
        AND "workspace_id"=$2
        AND ($3::text IS NULL OR "status"=$3::text)
      ORDER BY "created_at" DESC
      LIMIT 200;
    `,
    params.tenantId,
    params.workspaceId,
    params.status ?? null
  )) as any[];
  return rows;
}

export async function transitionBillingDispute(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    disputeId: string;
    toStatus: DisputeStatus;
    resolution?: string | null;
  }
) {
  const existing = await getBillingDispute(prisma, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    disputeId: params.disputeId,
  });
  if (!existing) return { error: "NOT_FOUND" as const };

  const from = String(existing.status) as DisputeStatus;
  if (!canTransitionDispute(from, params.toStatus)) {
    return {
      error: "INVALID_TRANSITION" as const,
      from,
      to: params.toStatus,
    };
  }

  const isClosed = params.toStatus === "resolved" || params.toStatus === "rejected";
  const rows = (await prisma.$queryRawUnsafe(
    `
      UPDATE "billing_disputes"
      SET
        "status"=$4,
        "resolution"=COALESCE($5, "resolution"),
        "closed_at"=CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE "closed_at" END,
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=$1 AND "tenant_id"=$2 AND "workspace_id"=$3
      RETURNING *;
    `,
    params.disputeId,
    params.tenantId,
    params.workspaceId,
    params.toStatus,
    params.resolution ?? null,
    isClosed
  )) as any[];
  const updated = rows[0] ?? null;

  if (updated && isClosed) {
    await applyDisputeClosedEvent(prisma, {
      eventKey: `dispute.closed:${updated.id}:${params.toStatus}`,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: String(updated.agent_id),
      outcome: params.toStatus,
      payload: {
        disputeId: String(updated.id),
        paymentIntentId: String(updated.payment_intent_id),
        runId: String(updated.run_id),
      },
    });
  }

  return { data: updated };
}

