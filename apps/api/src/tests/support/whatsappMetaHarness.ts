import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
import type { MetaLabMetric } from "../../services/whatsappMetaAdapter";

// Preloaded before test imports. No server, external dependency, .env loading or real credential.
const attempts = { network: 0 };
function denied(): never {
  attempts.network++;
  throw new Error("META_LAB_NETWORK_FORBIDDEN");
}
// Preserve both Node's declaration surface and the runtime promisify hook.
const deniedDns = Object.assign(() => denied(), {
  __promisify__: async () => denied(),
  [promisify.custom]: async () => denied(),
});
export function installMetaLabIsolation() {
  http.request = denied; http.get = denied;
  https.request = denied; https.get = denied;
  net.connect = denied; net.createConnection = denied;
  net.Socket.prototype.connect = denied;
  net.Server.prototype.listen = denied;
  tls.connect = denied;
  dns.lookup = deniedDns; dns.resolve = deniedDns;
  dns.promises.lookup = denied; dns.promises.resolve = denied;
  globalThis.fetch = denied;
  syncBuiltinESMExports();
  process.env.NODE_ENV = "test";
  // Fictitious settings for the unchanged legacy suite; connections remain forbidden.
  process.env.DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic";
  process.env.SHADOW_DATABASE_URL = process.env.DATABASE_URL;
  process.env.VITEST_DATABASE_URL = process.env.DATABASE_URL;
  process.env.VITEST_SHADOW_DATABASE_URL = process.env.DATABASE_URL;
  for (const key of ["REDIS_URL", "RUN_EVENTS_REDIS_URL", "RUN_QUEUE_REDIS_URL", "ACTION_QUEUE_REDIS_URL",
    "QUEUE_REDIS_URL", "BULLMQ_REDIS_URL", "MEMORY_REDIS_URL", "MAINTENANCE_QUEUE_REDIS_URL", "KILL_SWITCH_REDIS_URL", "VITEST_REDIS_URL"]) {
    process.env[key] = "redis://127.0.0.1:1/0";
  }
}
installMetaLabIsolation();

export function metaLabNetworkAttempts() { return attempts.network; }
export function createMetaLabObservations() {
  const metrics: MetaLabMetric[] = [];
  return { metrics, observe: (metric: MetaLabMetric) => { metrics.push({ ...metric }); } };
}
