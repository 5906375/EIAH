// Cenário J.
//
// O que este arquivo NÃO testa (e por quê): backfill de linhas realmente
// anteriores à migration. Isso é verificado manualmente, fora da suíte
// automatizada, porque exige aplicar as migrations até a anterior a esta,
// inserir uma linha real sem a coluna existir, só então aplicar a migration
// de fingerprintVersion e observar o UPDATE de backfill — um ciclo de vida
// de migration que o harness de testes atual (banco já totalmente migrado
// antes da suíte rodar) não reproduz sem infraestrutura nova.
//
// Evidência do backfill real (linha pré-existente à coluna, resultado do
// backfill, confirmação de NOT NULL sem default permanente, tentativa de
// inserção nova omitindo o campo, `prisma migrate diff`): ver
// EVIDENCE_20260908_FINGERPRINT_VERSION.md (mesmo diretório, um nível acima
// de __tests__/). Esse documento, não este teste, é a prova do backfill —
// este arquivo NÃO automatiza nem reproduz o ciclo de vida da migration.
//
// O que este arquivo testa automaticamente, e só isso: a consequência direta
// de remover o default — uma gravação nova que omita fingerprintVersion deve
// FALHAR, nunca receber "v1" silenciosamente.
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { computeRequestFingerprint, buildOriginSnapshot } from "../originContract.ts";

test("nova inserção que omite fingerprintVersion falha (sem default no banco, não recebe 'v1' silenciosamente)", async () => {
  const client = createNamedClient("poc-real-j1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-j1");
    const { sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const sourceRun = await client.prisma.run.findUniqueOrThrow({ where: { id: sourceRunId } });
    const originSnapshot = buildOriginSnapshot(sourceRun);
    const requestFingerprint = computeRequestFingerprint({
      sourceRunId, destinationAgent: "mkt", originSnapshot,
    });

    // Tentativa de criação via Prisma Client omitindo fingerprintVersion —
    // o próprio tipo gerado já exige o campo (TypeScript recusaria compilar
    // isso normalmente); aqui forçamos via `as any` para provar o
    // comportamento em runtime/banco, não apenas em tempo de compilação.
    await assert.rejects(
      client.prisma.signalForwardRequest.create({
        data: {
          tenantId, workspaceId, sourceRunId, destinationAgent: "mkt",
          idempotencyKey: "key-j1-missing-version",
          requestFingerprint,
          originSnapshot: originSnapshot as any,
        } as any,
      }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        return /fingerprint_version|fingerprintVersion/i.test(message);
      },
      "deveria falhar por NOT NULL em fingerprint_version, sem receber um valor default"
    );

    const count = await client.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: "key-j1-missing-version" },
    });
    assert.equal(count, 0, "nenhuma linha deveria ter sido criada");
  } finally {
    await client.close();
  }
});
