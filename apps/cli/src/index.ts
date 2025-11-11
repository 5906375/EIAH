#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    console.log("  billing:reconcile Stub de reconciliação financeira");
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
  "billing:reconcile": async () => {
    console.log("billing:reconcile ainda não está conectado.");
    console.log("Use este stub para disparar scripts de reconciliação quando o BillingEngine estiver pronto.");
  },
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
};

const [, , rawCommand, ...rest] = process.argv;
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
