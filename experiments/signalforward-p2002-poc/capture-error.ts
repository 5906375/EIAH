// Script de captura de evidência — NÃO faz parte do produto.
// Objetivo: observar a forma REAL de um erro P2002 emitido por
// @prisma/client@7.2.0 + @prisma/adapter-pg@7.2.0 contra Postgres 16.11
// descartável, para violações em DUAS constraints distintas:
//   1. a constraint da chave idempotente (SignalForwardRequest)
//   2. uma constraint não relacionada (OtherUniqueFixture)
// Nenhuma credencial, URL de conexão ou variável de ambiente é impressa.

import { PrismaClient, Prisma } from "./prisma/generated/client/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

function sanitize(error: unknown) {
  const typed = error as Prisma.PrismaClientKnownRequestError;
  return {
    errorConstructorName: typed?.constructor?.name,
    isPrismaClientKnownRequestError: typed instanceof Prisma.PrismaClientKnownRequestError,
    code: typed?.code,
    metaKeys: typed?.meta ? Object.keys(typed.meta) : null,
    meta: typed?.meta ?? null,
    // mensagem pode conter nomes de coluna/tabela (não sensível), nunca segredos
    message: typed?.message,
  };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.POC_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const tenantId = "poc-tenant-1";
  const workspaceId = "poc-workspace-1";

  console.log("=== Cenário 1: violação da chave idempotente (SignalForwardRequest) ===");
  await prisma.signalForwardRequest.create({
    data: {
      tenantId, workspaceId,
      sourceRunId: "poc-source-run-1",
      destinationAgent: "mkt",
      idempotencyKey: "poc-key-1",
      requestFingerprint: "poc-fp-1",
    },
  });

  try {
    await prisma.signalForwardRequest.create({
      data: {
        tenantId, workspaceId,
        sourceRunId: "poc-source-run-1-duplicate-attempt",
        destinationAgent: "mkt",
        idempotencyKey: "poc-key-1",
        requestFingerprint: "poc-fp-1-different",
      },
    });
    console.log("ERRO: esperava violação, nenhuma ocorreu");
  } catch (e) {
    console.log(JSON.stringify(sanitize(e), null, 2));
  }

  console.log("\n=== Cenário 2: violação de OUTRA constraint (OtherUniqueFixture) ===");
  await prisma.otherUniqueFixture.create({
    data: { tenantId, externalRef: "poc-ext-ref-1" },
  });

  try {
    await prisma.otherUniqueFixture.create({
      data: { tenantId, externalRef: "poc-ext-ref-1" },
    });
    console.log("ERRO: esperava violação, nenhuma ocorreu");
  } catch (e) {
    console.log(JSON.stringify(sanitize(e), null, 2));
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("FALHA NO SCRIPT DE CAPTURA:", e);
  process.exitCode = 1;
});
