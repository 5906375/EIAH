/**
 * TenantPolicyStore — EIAH_BUILDER
 * -----------------------------------------
 * Fonte única de policies por tenant/workspace.
 * Consolida JSON (config inicial) + DB (TenantActionPolicy)
 * com cache Redis e eventos de invalidation.
 */

import fs from "node:fs";
import { prismaGlobal } from "@repo/db";
import Redis from "ioredis";
import type { TenantActionConfig } from "../src/actions/registry/TenantActionResolver";
import type { ActionDefinition } from "../src/actions/registry/VersionedActionRegistry";

const redis = new Redis();
const POLICY_TTL = 300; // 5min

type TenantPolicyJson = Record<
  string,
  {
    version: string;
    overrides?: Record<string, unknown>;
  }
>;

export class TenantPolicyStore {
  private static instance: TenantPolicyStore;
  private jsonPolicies = new Map<string, TenantActionConfig>();

  private constructor() {
    this.loadFromJson();
  }

  static getInstance() {
    if (!TenantPolicyStore.instance) {
      TenantPolicyStore.instance = new TenantPolicyStore();
    }
    return TenantPolicyStore.instance;
  }

  /** Carrega policies do arquivo local (config inicial) */
  private loadFromJson() {
    const fileUrl = new URL("../../../apps/api/src/actions/tenantActionPolicy.json", import.meta.url);
    if (!fs.existsSync(fileUrl)) return;

    const data = fs.readFileSync(fileUrl, "utf8");
    const json = JSON.parse(data) as TenantPolicyJson;

    for (const tenantId of Object.keys(json)) {
      const entry = json[tenantId];
      if (!entry) continue;
      this.jsonPolicies.set(tenantId, {
        tenantId,
        version: entry.version,
        overrides: (entry.overrides as Record<string, ActionDefinition> | undefined) ?? {},
      });
    }
  }

  /**
   * Retorna se o tenant/workspace pode executar o "scope".
   * Obs: aqui "scope" representa o identificador consultado em TenantActionPolicy.actionName.
   */
  async isScopeAllowed(tenantId: string, workspaceId: string, scope: string): Promise<boolean> {
    const cacheKey = `policy:${tenantId}:${workspaceId}:${scope}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached === "1";

    const dbPolicy =
      (await prismaGlobal.tenantActionPolicy.findFirst({
        where: { tenantId, workspaceId, actionName: scope },
        select: { allowed: true },
      })) ??
      (await prismaGlobal.tenantActionPolicy.findFirst({
        where: { tenantId, workspaceId: null, actionName: scope },
        select: { allowed: true },
      }));

    const allowed = dbPolicy?.allowed ?? this.fromJsonFallback(tenantId, scope);
    await redis.set(cacheKey, allowed ? "1" : "0", "EX", POLICY_TTL);
    return allowed;
  }

  /** Fallback: consulta JSON (estático) */
  private fromJsonFallback(tenantId: string, scope: string): boolean {
    const policy = this.jsonPolicies.get(tenantId);
    return Boolean(policy?.overrides && scope in policy.overrides);
  }

  /** Invalida cache por tenant (evento) */
  async invalidate(tenantId: string) {
    await redis.publish(`policy:invalidate:${tenantId}`, "1");
  }
}

export async function closeTenantPolicyStoreResources() {
  await redis.quit().catch(() => redis.disconnect());
}
