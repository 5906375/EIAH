import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnvFile(envPath: string) {
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadDotEnv() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  loadDotEnvFile(resolve(repoRoot, ".env.cli"));
  loadDotEnvFile(resolve(repoRoot, ".env"));
}

loadDotEnv();

const pkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf-8")
) as { name: string; version?: string };

type CommandHandler = (args: string[]) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  help: () => {
    console.log(`${pkg.name} v${pkg.version ?? "0.0.0"}`);
    console.log("Uso: eiah <comando> [opções]");
    console.log("\nPrincipais comandos:");
    console.log("  tokens:issue      Cria um token de API para um tenant/workspace (requer EIAH_ADMIN_TOKEN)");
    console.log("  queue:drain       Limpa filas (run/action) ou DLQs via API Ops");
    console.log("  runs:trigger      Stub para disparar runs manualmente");
    console.log("  billing:reconcile Reconciliador financeiro e auditoria de ledger");
    console.log("  memory:sync       Enfileira job de sincronização de memória para um agente");
    console.log("  knowledge:backfill Reindexa embeddings/conhecimento para um agente");
    console.log("  --version, -v     Exibe versão da CLI");
  },
  version: () => {
    console.log(pkg.version ?? "0.0.0");
  },
  "runs:trigger": async (args) => {
    console.log("runs:trigger ainda não está conectado. Args recebidos:", args.join(" "));
    console.log(
      "Integre aqui chamadas autenticadas para POST /api/runs ou utilize o SDK @eiah/core conforme o roadmap."
    );
  },

  // 🔧 substituição iniciada — implementação real do billing:reconcile
  "billing:reconcile": async () => {
    console.log("📊 Iniciando rotina de reconciliação financeira...");

    try {
      // Importes dinâmicos para manter startup leve
      const { prismaGlobal } = await import("@repo/db");
      const fs = await import("fs/promises");
      const prisma = prismaGlobal;

      // 1️⃣ Coleta dados relevantes (best-effort: DB pode estar com schema antigo)
      const runEvents = await (async () => {
        try {
          return await prisma.runEvent.findMany({
            select: { runId: true, type: true, criticalHash: true, sclTxId: true, createdAt: true },
          });
        } catch {
          return await prisma.runEvent.findMany({
            select: { runId: true, type: true, createdAt: true },
          });
        }
      })();
      const ledgers = await prisma.sclLedger.findMany({
        select: { runId: true, criticalHash: true, txId: true, createdAt: true },
      });
      const payments = await (async () => {
        try {
          return await prisma.paymentTx.findMany({
            select: {
              id: true,
              externalId: true,
              amountCents: true,
              provider: true,
              status: true,
              createdAt: true,
            },
          });
        } catch {
          return [];
        }
      })();

      const ledgerByRunId = new Map(ledgers.map((entry) => [entry.runId, entry]));
      const paymentByExternalId = new Map(payments.map((tx) => [tx.externalId, tx]));

      const runIds = Array.from(new Set([...runEvents.map((ev) => ev.runId), ...ledgers.map((l) => l.runId)]));

      // 2️⃣ Correlação entre RunEvent, SclLedger e PaymentTx (best-effort)
      const results = runIds.map((runId) => {
        const latest = runEvents
          .filter((ev) => ev.runId === runId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        const runHash =
          latest && "criticalHash" in latest
            ? ((latest as { criticalHash?: string | null }).criticalHash ?? null)
            : null;
        const runSclTxId =
          latest && "sclTxId" in latest ? ((latest as { sclTxId?: string | null }).sclTxId ?? null) : null;
        const scl = ledgerByRunId.get(runId);
        const payment = scl ? paymentByExternalId.get(scl.txId) ?? null : null;

        const matchedHash = runHash && scl ? scl.criticalHash === runHash : null;
        const matchedTx = runSclTxId && scl ? scl.txId === runSclTxId : null;
        const matched = matchedHash === true && matchedTx === true;

        return {
          runId,
          runHash,
          runSclTxId,
          sclTxId: scl?.txId ?? null,
          sclHash: scl?.criticalHash ?? null,
          paymentTxId: payment?.id ?? null,
          paymentExternalId: payment?.externalId ?? null,
          matchedHash,
          matchedTx,
          matched,
        };
      });

      // 3️⃣ Geração de relatório (auditpack.json)
      const mismatches = results.filter((r) => r.matched !== true);
      const audit = {
        generatedAt: new Date().toISOString(),
        totalRuns: runIds.length,
        totalEvents: runEvents.length,
        totalSclLedger: ledgers.length,
        totalPayments: payments.length,
        mismatches,
      };

      await fs.writeFile("auditpack.json", JSON.stringify(audit, null, 2));

      // 4️⃣ Log no GuardrailLedger / GuardrailAuditLedger (best-effort)
      try {
        const tenantIdForAudit = await (async () => {
          try {
            const anyTenant = await prisma.tenant.findFirst({ select: { id: true } });
            return anyTenant?.id ?? null;
          } catch {
            return null;
          }
        })();

        if (!tenantIdForAudit) {
          throw new Error("Nenhum tenant encontrado para registrar auditoria (FK tenant_id).");
        }

        await prisma.guardrailLedger.upsert({
          where: {
            tenantId_actionType_idempotencyKey: {
              tenantId: tenantIdForAudit,
              actionType: "billing.reconcile",
              idempotencyKey: audit.generatedAt,
            },
          },
          create: {
            tenantId: tenantIdForAudit,
            actionType: "billing.reconcile",
            idempotencyKey: audit.generatedAt,
            usageCount: 1,
          },
          update: { usageCount: { increment: 1 } },
        });

        await prisma.guardrailAuditLedger.create({
          data: {
            tenantId: tenantIdForAudit,
            eventType: "billing.reconcile",
            severity: mismatches.length ? "warn" : "info",
            message: mismatches.length
              ? `Inconsistências detectadas (${mismatches.length})`
              : "Reconcile OK",
            metadata: audit,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `⚠️ GuardrailLedger/GuardrailAuditLedger não disponíveis — auditoria não registrada no banco. (${message})`
        );
      }

      // 5️⃣ Resultado final
      console.log(`✅ ${results.length} runs verificados.`);
      if (mismatches.length > 0) {
        console.log(`⚠️ ${mismatches.length} divergências encontradas (detalhes em auditpack.json).`);
      } else {
        console.log("Tudo consistente. Nenhuma divergência detectada.");
      }

      await prisma.$disconnect();
    } catch (error) {
      console.error("❌ Erro durante reconciliação:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  },
  // 🔧 fim da substituição

  "tokens:issue": async (args) => {
    const parsed = parseArgs(args);
    const tenantId = (parsed.flags["tenant-id"] ?? parsed.flags.tenant ?? parsed.positionals[0]) as
      | string
      | undefined;
    const workspaceId = (
      parsed.flags["workspace-id"] ??
      parsed.flags.workspace ??
      parsed.positionals[1]
    ) as string | undefined;
    const userEmail = (parsed.flags["user-email"] ?? parsed.flags.email ?? parsed.positionals[2]) as
      | string
      | undefined;
    const description = parsed.flags.description as string | undefined;

    if (!tenantId || !workspaceId) {
      console.error("Informe tenant e workspace: eiah tokens:issue --tenant-id T --workspace-id W [--user-email U]");
      process.exitCode = 1;
      return;
    }

    const payload = {
      tenantId,
      workspaceId,
      userEmail,
      description,
    };

    const tokenResponse = await callOpsApi("/tokens", payload);
    console.log("Token criado com sucesso:");
    console.log(JSON.stringify(tokenResponse, null, 2));
  },
  "queue:drain": async (args) => {
    const parsed = parseArgs(args);
    const queue = (parsed.flags.queue ?? parsed.positionals[0] ?? "run") as "run" | "action";
    const targetFlag = parsed.flags.target ?? (parsed.flags.dlq ? "dlq" : undefined);
    const target = (targetFlag ?? parsed.positionals[1] ?? "main") as "main" | "dlq";
    const includeDelayed =
      typeof parsed.flags["include-delayed"] === "boolean"
        ? (parsed.flags["include-delayed"] as boolean)
        : parsed.flags["skip-delayed"] === true
          ? false
          : true;

    const result = await callOpsApi("/queues/drain", {
      queue,
      target,
      includeDelayed,
    });

    console.log(
      `Drained ${result.drained} jobs from ${queue} queue (${target}) – pending now:`,
      result.after
    );
  },
  "memory:sync": async (args) => {
    const parsed = parseArgs(args);
    const scope = extractScope(parsed);
    if (!scope) {
      console.error("Informe --tenant-id, --workspace-id e --agent-id para executar memory:sync");
      process.exitCode = 1;
      return;
    }
    const maxShort = parsed.flags["max-short-term"]
      ? Number(parsed.flags["max-short-term"])
      : undefined;
    const { enqueueMemorySyncJob } = await import("@eiah/core");
    await enqueueMemorySyncJob({
      scope,
      maxShortTermRecords: Number.isFinite(maxShort) ? maxShort : undefined,
    });
    console.log(
      `Job memory:sync enfileirada para tenant=${scope.tenantId} workspace=${scope.workspaceId} agent=${scope.agentId}`
    );
  },
  "knowledge:backfill": async (args) => {
    const parsed = parseArgs(args);
    const scope = extractScope(parsed);
    if (!scope) {
      console.error(
        "Informe --tenant-id, --workspace-id e --agent-id para executar knowledge:backfill"
      );
      process.exitCode = 1;
      return;
    }
    const topKRaw = parsed.flags["top-k"];
    const topK = typeof topKRaw === "string" ? Number(topKRaw) : undefined;
    const { enqueueKnowledgeBackfillJob } = await import("@eiah/core");
    await enqueueKnowledgeBackfillJob({
      scope,
      topK: Number.isFinite(topK) ? topK : undefined,
    });
    console.log(
      `Job knowledge:backfill enfileirada para tenant=${scope.tenantId} workspace=${scope.workspaceId} agent=${scope.agentId}`
    );
  },
};

const argv = (() => {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  return args;
})();

const [rawCommand, ...rest] = argv;
const resolved = normalizeCommand(rawCommand);

if (!resolved.known && rawCommand) {
  console.error(`Comando desconhecido: ${rawCommand}`);
}

try {
  await commands[resolved.name](rest);
} catch (error) {
  console.error("Falha ao executar comando:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

if (!resolved.known && rawCommand) {
  process.exitCode = 1;
}

function normalizeCommand(value?: string): { name: keyof typeof commands; known: boolean } {
  if (!value || value === "help" || value === "--help" || value === "-h") {
    return { name: "help", known: true };
  }

  if (value === "--version" || value === "-v") {
    return { name: "version", known: true };
  }

  if ((commands as Record<string, CommandHandler>)[value]) {
    return { name: value as keyof typeof commands, known: true };
  }

  return { name: "help", known: false };
}

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (!current.startsWith("-")) {
      positionals.push(current);
      continue;
    }

    if (current.startsWith("--no-")) {
      const key = current.slice(5);
      flags[key] = false;
      continue;
    }

    const [rawKey, valueFromEq] = current.replace(/^--/, "").split("=", 2);
    const next = args[i + 1];
    if (valueFromEq !== undefined) {
      flags[rawKey] = valueFromEq;
      continue;
    }

    if (next && !next.startsWith("-")) {
      flags[rawKey] = next;
      i += 1;
    } else {
      flags[rawKey] = true;
    }
  }

  return { positionals, flags };
}

type Scope = { tenantId: string; workspaceId: string; agentId: string };

function extractScope(parsed: ParsedArgs): Scope | null {
  const tenantId = (parsed.flags["tenant-id"] ?? parsed.flags.tenant) as string | undefined;
  const workspaceId = (parsed.flags["workspace-id"] ?? parsed.flags.workspace) as string | undefined;
  const agentId =
    (parsed.flags["agent-id"] ?? parsed.flags.agent ?? parsed.flags["agent-slug"]) as
    | string
    | undefined;

  if (!tenantId || !workspaceId || !agentId) {
    return null;
  }

  return { tenantId, workspaceId, agentId };
}

const apiBase = (process.env.EIAH_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function callOpsApi(path: string, body: Record<string, unknown>) {
  const adminToken = process.env.EIAH_ADMIN_TOKEN ?? process.env.ADMIN_API_TOKEN;
  if (!adminToken) {
    throw new Error("Configure a variável EIAH_ADMIN_TOKEN para utilizar comandos operacionais.");
  }

  const response = await fetch(`${apiBase}/api/ops${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-eiah-admin-token": adminToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ops API responded with ${response.status}: ${text}`);
  }

  return response.json();
}
