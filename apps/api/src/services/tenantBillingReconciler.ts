import { createLogger } from "@eiah/core";
import { prismaGlobal } from "@repo/db";
import { reconcileTenantQuotaUsageBatch } from "./tenantBilling";

const logger = createLogger({ component: "tenant-billing-reconciler" });

let timer: NodeJS.Timeout | null = null;
let running = false;

function isEnabled() {
  const raw = (process.env.TENANT_BILLING_V2_RECONCILE_ENABLED ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseIntervalMs() {
  const parsed = Number(process.env.TENANT_BILLING_V2_RECONCILE_INTERVAL_MS ?? "300000");
  if (!Number.isFinite(parsed) || parsed < 30_000) return 300_000;
  return Math.trunc(parsed);
}

function parseLimitPerTick() {
  const parsed = Number(process.env.TENANT_BILLING_V2_RECONCILE_LIMIT_PER_TICK ?? "200");
  if (!Number.isFinite(parsed) || parsed < 1) return 200;
  return Math.trunc(parsed);
}

async function runTick() {
  if (running) return;
  running = true;
  try {
    const startedAt = Date.now();
    const result = await reconcileTenantQuotaUsageBatch(prismaGlobal, {
      limit: parseLimitPerTick(),
      apply: true,
      source: "scheduler",
    });

    logger.info(
      {
        mode: "scheduler",
        tenantsProcessed: result.totals.tenantsProcessed,
        divergences: result.totals.divergences,
        unavailable: result.totals.unavailable,
        durationMs: Date.now() - startedAt,
      },
      "tenant.billing.reconcile.tick"
    );
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      "tenant.billing.reconcile.tick_failed"
    );
  } finally {
    running = false;
  }
}

export function startTenantBillingReconciler() {
  if (timer || !isEnabled()) return;

  const intervalMs = parseIntervalMs();
  timer = setInterval(() => {
    void runTick();
  }, intervalMs);

  logger.info(
    {
      enabled: true,
      intervalMs,
      limitPerTick: parseLimitPerTick(),
    },
    "tenant.billing.reconciler.started"
  );

  // Warm-up inicial sem esperar o primeiro intervalo.
  setTimeout(() => {
    void runTick();
  }, 10_000);
}

export function stopTenantBillingReconciler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info({ enabled: false }, "tenant.billing.reconciler.stopped");
}

