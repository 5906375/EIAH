import pg from "pg";
import { createNamedClient, waitFor, observeConnectionState, resetFixtures } from "./tests/helpers.ts";
import { forwardSignalToMkt } from "./service.ts";

async function main() {
  const clientA = createNamedClient("poc-tx-a");
  const clientB = createNamedClient("poc-tx-b");
  const observerPool = new pg.Pool({ connectionString: process.env.POC_DATABASE_URL });

  await resetFixtures(clientA.prisma);

  const input = {
    tenantId: "poc-tenant-conc", workspaceId: "poc-workspace-conc",
    requestedByUserId: "poc-user-1", sourceRunId: "poc-source-run-conc",
    destinationAgent: "mkt", idempotencyKey: "poc-key-concurrent",
    requestFingerprint: "poc-fp-concurrent",
  };

  let releaseA: () => void;
  const gate = new Promise<void>((resolve) => { releaseA = resolve; });

  const promiseA = forwardSignalToMkt(clientA.prisma, input, { afterInsert: () => gate });

  await waitFor(async () => {
    const s = await observeConnectionState(observerPool, "poc-tx-a");
    console.log("A state:", s);
    return s.state === "idle in transaction";
  }, { timeoutMs: 3000, intervalMs: 100, label: "A idle in transaction" });

  console.log(">>> starting B");
  const promiseB = forwardSignalToMkt(clientB.prisma, input);

  await waitFor(async () => {
    const s = await observeConnectionState(observerPool, "poc-tx-b");
    console.log("B state:", s);
    return s.waitEventType === "Lock";
  }, { timeoutMs: 3000, intervalMs: 100, label: "B blocked" });

  console.log(">>> releasing A");
  releaseA!();

  const resA = await promiseA.catch((e) => ({ error: String(e), stack: (e as Error)?.stack }));
  console.log("resultA:", resA);

  // checar diretamente o estado do banco logo após A resolver, antes de B
  const rows = await clientA.pool.query(`select tenant_id, workspace_id, destination_agent, idempotency_key, destination_run_id, status from signal_forward_requests_poc`);
  console.log("rows after A commit:", rows.rows);

  const resB = await promiseB.catch((e) => ({ error: String(e), stack: (e as Error)?.stack }));
  console.log("resultB:", resB);

  await clientA.close();
  await clientB.close();
  await observerPool.end();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
