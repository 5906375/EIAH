# PRE-DUIMP-CASE-04 — pacote de aprovação da migration V1

Status: PROPOSTA NÃO EXECUTADA; AGUARDANDO APROVAÇÃO EXPLÍCITA

Data: 2026-09-09

## 0. Limite deste artefato

Este documento apresenta antecipadamente a alteração proposta. Nenhum bloco
abaixo foi aplicado.

Permanecem inalterados:

- packages/db/prisma/schema.prisma;
- packages/db/prisma/migrations;
- packages/db/src/middleware/tenantGuard.ts;
- client Prisma gerado;
- banco local ou remoto;
- API, frontend, workers e containers;
- Evidence Index.

Este pacote não autoriza execução. A aplicação de schema, migration, geração do
client ou testes com DATABASE_URL exige aprovação explícita posterior.

## 1. Precedência e decisão

A proposta segue:

1. ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md;
2. AGENTS.md;
3. docs/architecture/agent-chat-runtime.md;
4. docs/EVIDENCE_INDEX.md;
5. IA_EIAH.md;
6. docs/architecture/pre-duimp-governed-contracts-ownership-rfc-v1.md;
7. docs/architecture/pre-duimp-case-persistence-lifecycle-v1.md.

Decisão proposta:

- criar GovernedCase e GovernedCaseRevision;
- não reutilizar ImobCase;
- não alterar Run.caseId;
- não estender ApprovalRecord nesta task;
- não criar adapter, submit ou transmissão;
- manter externalTransmissionAllowed igual a false no contrato;
- adicionar ambos os novos modelos ao tenantGuard;
- proteger revisões contra UPDATE e DELETE no PostgreSQL.

## 2. Evidência do estado atual

| Item | Status | Evidência |
|---|---|---|
| GovernedCase no Prisma | AUSENTE | packages/db/prisma/schema.prisma |
| ImobCase vertical-específico | CONFIRMADO | packages/db/prisma/schema.prisma:992-1027 |
| Run.caseId sem FK | CONFIRMADO | packages/db/prisma/schema.prisma:216-268 |
| ApprovalRecord insuficiente | CONFIRMADO | packages/db/prisma/schema.prisma:1141-1151 |
| tenantGuard por allowlist | CONFIRMADO | packages/db/src/middleware/tenantGuard.ts:12-22 |
| transação caso+evento | CONFIRMADO | apps/api/src/services/imob/crm/imobCrmMutationService.ts:656-702 |
| update sem expectedRevision | CONFIRMADO | apps/api/src/services/imob/crm/imobCrmMutationService.ts:725-851 |
| trigger append-only disponível como padrão | CONFIRMADO | packages/db/prisma/migrations/20260119133736_add_immutable_trigger_to_ledger/migration.sql:1-13 |

## 3. Arquivos propostos

Se aprovado, o primeiro corte alterará exatamente:

~~~text
packages/db/prisma/schema.prisma
packages/db/prisma/migrations/20260909200000_pre_duimp_governed_cases_v1/migration.sql
packages/db/src/middleware/tenantGuard.ts
packages/db/src/middleware/tenantGuard.test.ts
packages/db/src/__tests__/governedCasePersistence.integration.test.ts
~~~

O repository de aplicação será um corte posterior da mesma task, depois da
migration validada:

~~~text
apps/api/src/services/logistica/preDuimpGovernedCaseLifecycle.ts
apps/api/src/services/logistica/preDuimpGovernedCaseLifecycle.test.ts
apps/api/src/services/logistica/preDuimpGovernedCaseRepository.ts
apps/api/src/services/logistica/preDuimpGovernedCaseRepository.integration.test.ts
~~~

## 4. Patch Prisma exato proposto

### 4.1 Enum

Inserir após RunApprovalStatus:

~~~diff
 enum RunApprovalStatus {
   not_required
   pending
   approved
   rejected
 }

+enum GovernedCaseLifecycle {
+  DISCOVERY
+  ASSESSING
+  AWAITING_REVIEW
+  READY
+  BLOCKED
+  CLOSED
+}
~~~

### 4.2 Relações em Tenant

Inserir junto às coleções operacionais:

~~~diff
   imobCases                 ImobCase[]
   imobCaseEvents            ImobCaseEvent[]
   imobMarketScanRuns        ImobMarketScanRun[]
+  governedCases             GovernedCase[]
~~~

### 4.3 Relações em Workspace

Inserir junto às coleções operacionais:

~~~diff
   imobCases                 ImobCase[]
   imobCaseEvents            ImobCaseEvent[]
   imobMarketScanRuns        ImobMarketScanRun[]
+  governedCases             GovernedCase[]
~~~

### 4.4 Modelos

Inserir antes de Run:

~~~prisma
model GovernedCase {
  id            String                @id @default(cuid())
  tenantId      String                @map("tenant_id")
  workspaceId   String                @map("workspace_id")
  schemaVersion String                @map("schema_version")
  caseType      String                @map("case_type")
  revision      Int                   @default(1)
  lifecycle     GovernedCaseLifecycle
  subject       Json
  domainState   Json                  @map("domain_state")
  snapshot      Json
  snapshotHash  String                @map("snapshot_hash")
  createdAt     DateTime              @default(now()) @map("created_at")
  updatedAt     DateTime              @default(now()) @updatedAt @map("updated_at")

  tenant    Tenant                   @relation(fields: [tenantId], references: [id])
  workspace Workspace                @relation(fields: [workspaceId], references: [id])
  revisions GovernedCaseRevision[]

  @@unique([id, tenantId, workspaceId], map: "governed_cases_id_scope_key")
  @@index([tenantId, workspaceId, caseType, lifecycle, updatedAt], map: "governed_cases_scope_type_lifecycle_updated_idx")
  @@map("governed_cases")
}

model GovernedCaseRevision {
  id             String                 @id @default(cuid())
  caseId         String                 @map("case_id")
  tenantId       String                 @map("tenant_id")
  workspaceId    String                 @map("workspace_id")
  revision       Int
  schemaVersion  String                 @map("schema_version")
  lifecycle      GovernedCaseLifecycle
  snapshot       Json
  snapshotHash   String                 @map("snapshot_hash")
  fromLifecycle  GovernedCaseLifecycle? @map("from_lifecycle")
  toLifecycle    GovernedCaseLifecycle  @map("to_lifecycle")
  actorType      String                 @map("actor_type")
  actorRef       String?                @map("actor_ref")
  transitionCode String                 @map("transition_code")
  createdAt      DateTime               @default(now()) @map("created_at")

  governedCase GovernedCase @relation(
    fields: [caseId, tenantId, workspaceId],
    references: [id, tenantId, workspaceId],
    onDelete: Restrict
  )

  @@unique([caseId, revision], map: "governed_case_revisions_case_revision_key")
  @@index([tenantId, workspaceId, caseId, createdAt], map: "governed_case_revisions_scope_case_created_idx")
  @@map("governed_case_revisions")
}
~~~

## 5. Patch tenantGuard exato proposto

~~~diff
 const MODEL_GUARD_MODE: Record<string, GuardMode> = {
   Run: "tenant+workspace",
   RunEvent: "tenant+workspace",
+  GovernedCase: "tenant+workspace",
+  GovernedCaseRevision: "tenant+workspace",
   PlanStepRecord: "tenant+workspace",
~~~

Nenhuma operação usando prismaGlobal será autorizada para esses modelos no
request path. O repository deverá receber o client retornado por
getPrismaForTenant.

## 6. SQL integral proposto

Caminho proposto:

~~~text
packages/db/prisma/migrations/20260909200000_pre_duimp_governed_cases_v1/migration.sql
~~~

Conteúdo integral proposto:

~~~sql
CREATE TYPE "GovernedCaseLifecycle" AS ENUM (
  'DISCOVERY',
  'ASSESSING',
  'AWAITING_REVIEW',
  'READY',
  'BLOCKED',
  'CLOSED'
);

CREATE TABLE "governed_cases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "case_type" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "subject" JSONB NOT NULL,
  "domain_state" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "governed_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governed_cases_revision_positive_check"
    CHECK ("revision" > 0),
  CONSTRAINT "governed_cases_snapshot_hash_check"
    CHECK ("snapshot_hash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "governed_cases_schema_version_nonempty_check"
    CHECK (length("schema_version") > 0),
  CONSTRAINT "governed_cases_case_type_nonempty_check"
    CHECK (length("case_type") > 0),
  CONSTRAINT "governed_cases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governed_cases_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "governed_cases_id_scope_key"
  ON "governed_cases"("id", "tenant_id", "workspace_id");

CREATE INDEX "governed_cases_scope_type_lifecycle_updated_idx"
  ON "governed_cases"(
    "tenant_id",
    "workspace_id",
    "case_type",
    "lifecycle",
    "updated_at"
  );

CREATE TABLE "governed_case_revisions" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "from_lifecycle" "GovernedCaseLifecycle",
  "to_lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_ref" TEXT,
  "transition_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "governed_case_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governed_case_revisions_revision_positive_check"
    CHECK ("revision" > 0),
  CONSTRAINT "governed_case_revisions_snapshot_hash_check"
    CHECK ("snapshot_hash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "governed_case_revisions_actor_type_nonempty_check"
    CHECK (length("actor_type") > 0),
  CONSTRAINT "governed_case_revisions_transition_code_nonempty_check"
    CHECK (length("transition_code") > 0),
  CONSTRAINT "governed_case_revisions_case_scope_fkey"
    FOREIGN KEY ("case_id", "tenant_id", "workspace_id")
    REFERENCES "governed_cases"("id", "tenant_id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "governed_case_revisions_case_revision_key"
  ON "governed_case_revisions"("case_id", "revision");

CREATE INDEX "governed_case_revisions_scope_case_created_idx"
  ON "governed_case_revisions"(
    "tenant_id",
    "workspace_id",
    "case_id",
    "created_at"
  );

CREATE OR REPLACE FUNCTION governed_case_revisions_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governed_case_revisions is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governed_case_revisions_append_only
BEFORE UPDATE OR DELETE ON "governed_case_revisions"
FOR EACH ROW EXECUTE FUNCTION governed_case_revisions_append_only();
~~~

## 7. Pré-condições obrigatórias

Antes de gerar ou aplicar:

~~~sql
SELECT to_regclass('public.governed_cases') AS governed_cases;
SELECT to_regclass('public.governed_case_revisions')
  AS governed_case_revisions;
SELECT EXISTS (
  SELECT 1
  FROM pg_type
  WHERE typname = 'GovernedCaseLifecycle'
) AS lifecycle_type_exists;
~~~

Aceite:

- as duas relações retornam NULL;
- lifecycle_type_exists retorna false;
- worktree limpo antes da edição;
- schema Prisma atual valida;
- backup/restore do ambiente-alvo segue o runbook vigente;
- nenhuma execução ocorre contra produção sem task operacional própria.

Se qualquer objeto já existir, parar. Não usar IF NOT EXISTS para mascarar drift.

## 8. Estratégia de rollout

1. aplicar somente em ambiente local dedicado;
2. executar prisma format e prisma validate;
3. revisar o SQL gerado contra este pacote;
4. executar migrate deploy no banco local autorizado;
5. gerar e buildar @repo/db;
6. rodar testes tenantGuard;
7. rodar testes de persistência/atomicidade;
8. confirmar zero alteração em tabelas existentes;
9. manter runtime PRE-DUIMP desligado;
10. publicar evidência somente após resultados reais.

A migration é aditiva. Não há backfill, rename, drop ou alteração de Run,
ImobCase, ImobCaseEvent, ApprovalRecord, ledgers ou dados existentes.

## 9. Rollback

Rollback de produção não deve apagar dados. Após qualquer gravação válida, a
estratégia é interromper o rollout e fazer correção forward.

O SQL destrutivo abaixo só poderá ser usado em ambiente local dedicado quando:

- a migration falhar durante validação;
- ambas as tabelas estiverem confirmadamente vazias;
- não houver consumer ativo;
- o alvo exato tiver sido confirmado;
- houver autorização específica para rollback.

SQL de rollback local proposto:

~~~sql
SELECT COUNT(*) AS governed_cases_count FROM "governed_cases";
SELECT COUNT(*) AS governed_case_revisions_count
FROM "governed_case_revisions";

DROP TRIGGER IF EXISTS governed_case_revisions_append_only
  ON "governed_case_revisions";
DROP FUNCTION IF EXISTS governed_case_revisions_append_only();
DROP TABLE "governed_case_revisions";
DROP TABLE "governed_cases";
DROP TYPE "GovernedCaseLifecycle";
~~~

Resultado diferente de zero em qualquer COUNT bloqueia o rollback destrutivo.

## 10. Testes planejados

### 10.1 tenantGuard puro

Arquivo:

~~~text
packages/db/src/middleware/tenantGuard.test.ts
~~~

Casos novos:

- GovernedCase find injeta tenantId e workspaceId;
- GovernedCaseRevision find injeta tenantId e workspaceId;
- create com scope divergente falha;
- update/updateMany sem scope exato falha;
- delete/deleteMany sem scope exato falha.

### 10.2 Persistência com PostgreSQL

Arquivo:

~~~text
packages/db/src/__tests__/governedCasePersistence.integration.test.ts
~~~

Casos:

- tabelas e enum existem;
- constraints de hash e revisão rejeitam valores inválidos;
- FK composta rejeita revisão cross-case/cross-scope;
- unicidade rejeita duas revisões com mesmo caseId + revision;
- trigger rejeita UPDATE;
- trigger rejeita DELETE;
- ON DELETE RESTRICT preserva histórico.

### 10.3 Lifecycle puro

Arquivo:

~~~text
apps/api/src/services/logistica/preDuimpGovernedCaseLifecycle.test.ts
~~~

Casos:

- matriz completa de transições permitidas;
- CLOSED não possui saída;
- DISCOVERY não promove diretamente a READY;
- BLOCKED não promove diretamente a READY;
- READY volta a ASSESSING quando input muda;
- READY permanece readinessOnly e não gera autorização.

### 10.4 Repository com PostgreSQL

Arquivo:

~~~text
apps/api/src/services/logistica/preDuimpGovernedCaseRepository.integration.test.ts
~~~

Casos:

- create grava projeção e revisão 1 na mesma transação;
- transition incrementa exatamente uma revisão;
- expectedRevision divergente retorna revision_conflict e não escreve;
- falha ao inserir revisão reverte a projeção;
- leitura cross-tenant retorna ausente;
- leitura cross-workspace retorna ausente;
- snapshot inválido não inicia transação;
- nenhuma operação cria Run, approval, receipt, evidence ou evento;
- nenhuma chamada de rede é feita.

## 11. Comandos propostos após aprovação

Estes comandos não foram executados:

~~~text
pnpm --filter @repo/db prisma format
pnpm --filter @repo/db prisma validate
pnpm --filter @repo/db generate
pnpm --filter @repo/db build
pnpm --filter @repo/db test
pnpm check:orphan-tests
git diff --check
~~~

Comandos de migration e integração deverão usar DATABASE_URL de ambiente local
explicitamente autorizado. O valor da URL nunca será impresso.

## 12. Threat model resumido

| Ameaça | Controle obrigatório |
|---|---|
| tenant/workspace vindo do payload | scope construído server-side e tenantGuard |
| escrita perdida concorrente | expectedRevision + updateMany count igual a 1 |
| projeção sem revisão | mesma transação, rollback em qualquer falha |
| adulteração de histórico | trigger append-only + ON DELETE RESTRICT |
| snapshot inválido | Zod antes da transação |
| hash instável | canonicalização determinística versionada |
| READY tratado como autorização | readinessOnly true e authorizationState NOT_REQUESTED |
| acoplamento ao Run polimórfico | Run inalterado, sem FK |
| autoridade falsa | ApprovalRecord inalterado; AUTHORITY-05 separada |
| efeito externo | nenhum adapter, submit, credential ou network call |

## 13. Impacto esperado

Se aprovado e aplicado localmente:

- duas tabelas novas;
- um enum PostgreSQL novo;
- dois índices de negócio e duas constraints/índices de unicidade;
- duas FKs em governed_cases;
- uma FK composta em governed_case_revisions;
- um trigger e uma função append-only;
- nenhum dado preexistente alterado;
- nenhum container necessariamente reiniciado para gerar/validar schema;
- API só será alterada em corte posterior.

## 14. Critérios de parada

Parar imediatamente se:

- schema Prisma não validar;
- SQL gerado divergir materialmente deste pacote;
- algum objeto proposto já existir;
- migration tocar tabela existente;
- tenantGuard não cobrir ambos os modelos;
- teste de isolamento ou atomicidade falhar;
- houver necessidade de alterar Run, ImobCase ou ApprovalRecord;
- qualquer código tentar criar autorização ou transmissão.

Nenhuma correção oportunista será feita sem nova explicação.

## 15. Gate de aprovação

Para autorizar a próxima etapa, a autorização precisa cobrir explicitamente:

1. patch de schema Prisma descrito na seção 4;
2. SQL integral descrito na seção 6;
3. patch do tenantGuard descrito na seção 5;
4. criação dos dois testes do pacote DB;
5. prisma format/validate/generate/build;
6. migration somente em PostgreSQL local dedicado;
7. testes de integração somente contra esse banco local;
8. manutenção de runtime e integrações externas desligados.

Status final deste pacote:

PRE-DUIMP-CASE-04 permanece PARCIAL. O plano está definido, mas nenhuma
persistência, migration ou prova de banco existe até aprovação e execução
controlada.
