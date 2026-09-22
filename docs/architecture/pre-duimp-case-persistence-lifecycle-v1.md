# PRE-DUIMP-CASE-04 — persistência e lifecycle governados

Status: IMPLEMENTAÇÃO LOCAL VALIDADA; PRE-DUIMP AINDA PARCIAL AVANÇADO

Data do discovery: 2026-09-09

Atualização de implementação: 2026-09-11

> Nota de rastreabilidade: as seções 0 a 16 preservam a fotografia do desenho
> anterior à autorização da migration e do repository. A seção 17 registra o
> estado as built e substitui aquelas seções somente quanto ao status atual.

## 0. Governança aplicada

A precedência é:

1. ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md;
2. AGENTS.md;
3. docs/architecture/agent-chat-runtime.md;
4. docs/EVIDENCE_INDEX.md;
5. IA_EIAH.md.

Este documento materializa somente o desenho da PRE-DUIMP-CASE-04. Não altera
schema Prisma, migration, banco, API, frontend, workers, containers, feature
flags ou Evidence Index.

Continuam invariantes:

~~~text
suggestion != authority
readiness != authorization
prepare != submit
regulatory_rule != corporate_policy
~~~

PRE-DUIMP permanece read-only/discovery, fail-closed e sem integração ao
Siscomex/Portal Único.

## 1. Resultado executivo

Semáforo do desenho: AMARELO.

- contratos Zod/TypeScript: CONFIRMADO;
- persistência genérica governada: AUSENTE;
- lifecycle PRE-DUIMP persistido: AUSENTE;
- padrão transacional reutilizável: PARCIAL;
- concorrência otimista por revisão: AUSENTE;
- tenant guard para o futuro modelo: AUSENTE;
- migration: NÃO AUTORIZADA;
- runtime de caso: NÃO AUTORIZADO nesta etapa.

A decisão é criar futuramente um agregado genérico GovernedCase, com uma
projeção atual mutável por compare-and-swap e revisões append-only. ImobCase não
será reutilizado nem migrado. Run.caseId não receberá foreign key para o novo
agregado.

## 2. Inventário comprovado

| Item | Status | Evidência | Lacuna ou decisão |
|---|---|---|---|
| Run possui caseId | CONFIRMADO | packages/db/prisma/schema.prisma:216-268 | campo é String opcional, indexado e sem foreign key |
| RunEvent é run-bound | CONFIRMADO | packages/db/prisma/schema.prisma:289-307 | não pode representar evento de caso sem Run |
| ImobCase existe | CONFIRMADO | packages/db/prisma/schema.prisma:992-1027 | vertical-específico, sem revision ou snapshot hash |
| ImobCaseEvent existe | CONFIRMADO | packages/db/prisma/schema.prisma:1065-1086 | acoplado por FK a ImobCase |
| ApprovalRecord existe | CONFIRMADO | packages/db/prisma/schema.prisma:1141-1151 | não tem binding suficiente para autoridade PRE-DUIMP |
| criação caso+evento em transação | CONFIRMADO | apps/api/src/services/imob/crm/imobCrmMutationService.ts:656-702 | padrão reutilizável, mas sem compare-and-swap |
| update caso+evento em transação | CONFIRMADO | apps/api/src/services/imob/crm/imobCrmMutationService.ts:725-851 | update por id após leitura, sem expectedRevision |
| consultas IMOB escopadas | CONFIRMADO | apps/api/src/services/imob/crm/imobCrmRepository.ts:55-97 | disciplina está na aplicação |
| Prisma client por scope | CONFIRMADO | packages/db/src/client.ts:64-85 | deve ser obrigatório no novo repository |
| tenantGuard possui allowlist | CONFIRMADO | packages/db/src/middleware/tenantGuard.ts:12-22 | novos modelos precisam ser adicionados explicitamente |
| trigger append-only existente | CONFIRMADO | packages/db/prisma/migrations/20260119133736_add_immutable_trigger_to_ledger/migration.sql:1-13 | padrão pode ser adaptado às revisões |
| GovernedCase persistido | AUSENTE | packages/db/prisma/schema.prisma | requer migration aprovada |

## 3. Decisões de ownership

### 3.1 Agregado

GovernedCase será o owner genérico da identidade, scope, revisão, lifecycle,
subject, domainState e snapshot atual validado.

Para a primeira implementação:

- somente caseType log.pre_duimp será aceito pelo repository PRE-DUIMP;
- a tabela poderá ser genérica, mas não habilita automaticamente outra vertical;
- todo snapshot deverá passar por preDuimpCaseV1Schema antes de gravar;
- ids, tenantId e workspaceId serão resolvidos server-side;
- payload de cliente nunca poderá definir scope, revisão, lifecycle ou hash.

### 3.2 Revisões

GovernedCaseRevision será o owner do histórico imutável. Cada criação ou
transição bem-sucedida produzirá exatamente uma nova revisão na mesma
transação da projeção atual.

Revisões:

- nunca são atualizadas;
- nunca são apagadas por fluxo normal;
- preservam snapshot integral, hash, transição e ator;
- têm unicidade por caseId + revision;
- permanecem case-bound e scope-bound.

### 3.3 Limites com componentes futuros

- HumanAuthorityDecisionV1 pode aparecer no snapshot como projeção, mas a fonte
  de autoridade somente será definida em PRE-DUIMP-AUTHORITY-05.
- runRefs, receiptRefs, evidenceRefs e eventRefs permanecem vazios ou projeções
  não autoritativas até PRE-DUIMP-EVIDENCE-06.
- nenhuma tabela de approval paralela será criada em CASE-04.
- nenhum adapter de fonte será criado em CASE-04.

## 4. Modelo Prisma proposto

O bloco abaixo é desenho, não migration executável.

~~~prisma
enum GovernedCaseLifecycle {
  DISCOVERY
  ASSESSING
  AWAITING_REVIEW
  READY
  BLOCKED
  CLOSED
}

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

  tenant        Tenant                @relation(fields: [tenantId], references: [id])
  workspace     Workspace             @relation(fields: [workspaceId], references: [id])
  revisions     GovernedCaseRevision[]

  @@unique([id, tenantId, workspaceId], map: "governed_cases_id_scope_key")
  @@index([tenantId, workspaceId, caseType, lifecycle, updatedAt],
    map: "governed_cases_scope_type_lifecycle_updated_idx")
  @@map("governed_cases")
}

model GovernedCaseRevision {
  id             String                @id @default(cuid())
  caseId         String                @map("case_id")
  tenantId       String                @map("tenant_id")
  workspaceId    String                @map("workspace_id")
  revision       Int
  schemaVersion  String                @map("schema_version")
  lifecycle      GovernedCaseLifecycle
  snapshot       Json
  snapshotHash   String                @map("snapshot_hash")
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
  @@index([tenantId, workspaceId, caseId, createdAt],
    map: "governed_case_revisions_scope_case_created_idx")
  @@map("governed_case_revisions")
}
~~~

Antes de uma migration, este desenho ainda deverá passar por prisma format,
prisma validate e revisão do SQL gerado. Nomes de constraints deverão permanecer
determinísticos.

## 5. Por que não reutilizar ImobCase

ImobCase modela relações próprias do domínio imobiliário: ownerId, propertyId,
leadId, externalDealId, flow, stage e status. Ele não possui caseType,
schemaVersion, revision, snapshotHash ou histórico de revisões.

Reutilizá-lo produziria:

- acoplamento de Logística & Comex à vertical IMOB;
- strings livres onde o contrato exige lifecycle fechado;
- risco de misturar relações e dados entre verticais;
- impossibilidade de comparar snapshot e revisão de forma determinística.

Decisão: preservar ImobCase sem alteração e não criar herança implícita.

## 6. Relação com Run

Run.caseId é hoje uma String opcional sem FK. Ela pode referenciar casos de
domínios diferentes. Adicionar uma FK para governed_cases quebraria essa
semântica e poderia tornar dados existentes inválidos.

CASE-04 não alterará Run.

Uma ligação física futura deverá escolher, em task própria, entre:

1. nova coluna governedCaseId em Run; ou
2. tabela de associação case-bound/run-bound com constraints de scope.

Até essa decisão, runRefs no snapshot são referências imutáveis validadas em
aplicação, não foreign keys e não autoridade.

## 7. Lifecycle formal

Transições permitidas:

| Origem | Destinos permitidos | Condição mínima |
|---|---|---|
| criação | DISCOVERY | snapshot inicial válido, gate BLOCK por não avaliado |
| DISCOVERY | ASSESSING, BLOCKED, CLOSED | scope e expectedRevision válidos |
| ASSESSING | DISCOVERY, BLOCKED, AWAITING_REVIEW, READY, CLOSED | avaliadores concluídos ou nova coleta requerida |
| BLOCKED | DISCOVERY, ASSESSING, CLOSED | nova fonte/correção explícita ou encerramento |
| AWAITING_REVIEW | ASSESSING, BLOCKED, READY, CLOSED | decisão vinculada ou reavaliação |
| READY | DISCOVERY, ASSESSING, BLOCKED, CLOSED | qualquer mudança de input invalida prontidão |
| CLOSED | nenhum | terminal |

Restrições:

- não existe salto DISCOVERY para READY;
- não existe salto BLOCKED para READY sem ASSESSING;
- READY exige gate outcome READY;
- AWAITING_REVIEW exige gate outcome REVIEW;
- BLOCK não é autorização e pode acompanhar DISCOVERY, ASSESSING ou BLOCKED;
- mudança em fatos, provenance, regra, policy, risco ou authority invalida o
  gate anterior e retorna o caso a ASSESSING ou BLOCKED;
- CLOSED não apaga dados nem revisões;
- reabertura não existe em V1.

## 8. Concorrência e atomicidade

Toda escrita receberá expectedRevision server-side e obedecerá:

~~~text
1. carregar por id + tenantId + workspaceId;
2. rejeitar se não encontrado no scope;
3. validar transição;
4. construir snapshot revision + 1;
5. validar o snapshot com preDuimpCaseV1Schema;
6. canonicalizar e calcular snapshotHash;
7. iniciar transação;
8. updateMany da projeção com id + scope + revision esperada;
9. exigir count = 1; caso contrário, lançar conflito;
10. inserir a revisão append-only;
11. commit;
12. retornar snapshot persistido.
~~~

Se qualquer passo falhar, nenhuma projeção nem revisão poderá permanecer
gravada. O resultado de conflito será explícito e não provocará retry
automático de mutação.

Não usar:

- update por id sem scope;
- last-write-wins;
- upsert para transição;
- hash calculado a partir de JSON.stringify não canônico;
- evento, ledger ou evidence fora da mesma fronteira transacional quando forem
  exigidos por tasks futuras.

## 9. Hash e canonicalização

snapshotHash será sha256 lowercase com prefixo sha256:. O algoritmo deverá:

- ordenar chaves recursivamente;
- preservar a ordem normativa de arrays;
- rejeitar undefined, NaN, Infinity e valores fora de JsonValueV1;
- incluir schemaVersion, revision, scope e gate;
- ser coberto por vetores de teste determinísticos.

O hash da projeção atual deverá ser idêntico ao hash da revisão correspondente.
snapshotHash não substitui gateDecision.inputHash.

## 10. Isolamento multi-tenant

Os modelos GovernedCase e GovernedCaseRevision deverão ser adicionados ao
MODEL_GUARD_MODE como tenant+workspace.

Além do middleware:

- repository aceitará Scope obrigatório;
- leituras usarão id + tenantId + workspaceId;
- criação ignorará qualquer scope transportado;
- atualização usará id + tenantId + workspaceId + expectedRevision;
- relação de revisão usará FK composta caseId + tenantId + workspaceId;
- testes negativos cobrirão tenant e workspace divergentes;
- prismaGlobal não será usado no request path.

## 11. Imutabilidade e deleção

A migration proposta deverá criar trigger para bloquear UPDATE e DELETE em
governed_case_revisions, seguindo o padrão comprovado do guardrail ledger.

GovernedCase não será apagado por fluxo da aplicação. Encerramento é transição
para CLOSED e cria nova revisão.

ON DELETE RESTRICT será usado entre caso e revisões. Cascade não será usado
para histórico governado.

## 12. Repository futuro

Caminho proposto:

~~~text
apps/api/src/services/logistica/preDuimpGovernedCaseRepository.ts
~~~

Superfície V1:

~~~ts
type GovernedCaseWriteResultV1 =
  | { status: "created"; case: PreDuimpCaseV1 }
  | { status: "updated"; case: PreDuimpCaseV1 }
  | { status: "not_found" }
  | { status: "revision_conflict"; currentRevision: number }
  | { status: "transition_denied"; reasonCode: string }
  | { status: "invalid_snapshot"; reasonCode: string };

interface PreDuimpGovernedCaseRepositoryV1 {
  create(scope, initialCase): Promise<GovernedCaseWriteResultV1>;
  get(scope, caseId): Promise<PreDuimpCaseV1 | null>;
  list(scope, filters): Promise<readonly PreDuimpCaseV1[]>;
  transition(scope, command): Promise<GovernedCaseWriteResultV1>;
  listRevisions(scope, caseId): Promise<readonly PreDuimpCaseV1[]>;
}
~~~

Não haverá delete, submit, transmit, approve, retry automático ou adapter.

## 13. Migration futura — pacote de aprovação

Nenhuma migration foi criada. Antes de solicitar autorização, a próxima
iteração deverá apresentar:

1. diff exato de schema.prisma;
2. SQL integral da migration aditiva;
3. alterações exatas em Tenant, Workspace e tenantGuard;
4. estratégia de rollback;
5. impacto em ambientes existentes;
6. confirmação de que ImobCase, Run e ApprovalRecord permanecem intactos;
7. testes unitários e de integração planejados;
8. comandos que exigirão DATABASE_URL;
9. confirmação de zero integração externa.

O usuário deverá autorizar explicitamente o schema, a migration e os testes
com banco antes da execução.

## 14. Testes planejados após aprovação

Testes puros:

- matriz completa de transição;
- canonicalização/hash determinísticos;
- snapshot inválido rejeitado;
- READY não autoriza ação;
- CLOSED é terminal.

Testes de integração com banco:

- criação grava projeção e revisão 1 atomicamente;
- transição grava exatamente uma nova revisão;
- falha na revisão reverte atualização da projeção;
- expectedRevision divergente não escreve;
- isolamento cross-tenant e cross-workspace;
- trigger bloqueia update/delete de revisão;
- fechamento retém histórico;
- nenhum Run, approval, receipt ou evidence é criado implicitamente.

## 15. Riscos bloqueantes

1. O tenantGuard é allowlist e não protegerá modelos novos automaticamente.
2. Run.caseId é polimórfico e não suporta FK segura para GovernedCase.
3. O repositório atual não apresenta canonicalizador JSON genérico comprovado.
4. ApprovalRecord não pode ser promovido a autoridade nesta task.
5. A migration precisa preservar bancos existentes e não pode alterar ImobCase.
6. Eventos/evidence atômicos dependem da decisão de PRE-DUIMP-EVIDENCE-06.

## 16. Decisão e próximo gate

Decisão de design:

- PRESERVAR ImobCase, ImobCaseEvent, Run, RunEvent e ApprovalRecord;
- REUTILIZAR o padrão de transação e o padrão de trigger append-only;
- ESTENDER tenantGuard somente após migration aprovada;
- CRIAR GovernedCase e GovernedCaseRevision somente após aprovação explícita;
- ADIAR authority, evidence, Run binding e adapters para suas tasks próprias.

Status:

PRE-DUIMP-CASE-04: PARCIAL — desenho de persistência e lifecycle documentado;
schema Prisma, migration, repository e validação com banco permanecem
deliberadamente não executados.

## 17. Estado as built — PRE-DUIMP-CASE-04B

Em 2026-09-11, a camada interna de aplicação da persistência foi implementada
e validada localmente. O status histórico acima permanece registrado, mas não
representa mais o estado executável.

Fundação reaproveitada:

- `GovernedCase` e `GovernedCaseRevision`, criados pela migration local
  `20260909200000_pre_duimp_governed_cases_v1`;
- proteção tenant+workspace já existente no `tenantGuard`;
- `PreDuimpCaseV1` como fronteira canônica de validação;
- `getPrismaForTenant` como única fábrica do cliente usado pela implementação
  produtiva;
- padrão transacional existente, sem reutilizar ou alterar `ImobCase`.

Arquivos de aplicação criados:

- `apps/api/src/services/logistica/preDuimpGovernedCaseCanonicalization.ts`;
- `apps/api/src/services/logistica/preDuimpGovernedCaseLifecycle.ts`;
- `apps/api/src/services/logistica/preDuimpGovernedCaseRepository.ts`.

Cobertura criada:

- `preDuimpGovernedCaseCanonicalization.test.ts`;
- `preDuimpGovernedCaseLifecycle.test.ts`;
- `preDuimpGovernedCaseRepository.integration.test.ts`.

Garantias implementadas e comprovadas:

- canonicalização recursiva com chaves ordenadas e arrays preservados;
- rejeição de `undefined`, `NaN`, `Infinity` e valores fora de JSON V1;
- `snapshotHash` SHA-256 lowercase com prefixo `sha256:`;
- matriz fail-closed completa do lifecycle e `CLOSED` terminal;
- criação do caso e da revisão 1 na mesma transação;
- transição com compare-and-swap por `expectedRevision` e sem retry automático;
- uma revisão append-only por mudança persistida;
- validação de integridade entre projeção, snapshot, revisão e hash;
- isolamento obrigatório por tenant e workspace;
- rollback da projeção quando a inserção da revisão falha;
- zero criação implícita de `Run`, `RunEvent` ou `ApprovalRecord`;
- zero chamada de rede durante os testes do repository;
- `READY` preservado como prontidão, com `readinessOnly=true`,
  `authorizationState=NOT_REQUESTED` e transmissão externa desabilitada.

Gates executados nesta implementação:

- testes puros de canonicalização e lifecycle: 11/11 PASS;
- build TypeScript da API: PASS;
- `check:orphan-tests`: PASS, sem órfão novo ou bloqueante;
- testes frontend acionados pelo orphan gate: 30/30 PASS;
- testes PostgreSQL do repository: 3/3 PASS.

O teste PostgreSQL da fundação
`packages/db/src/__tests__/governedCasePersistence.integration.test.ts` foi
registrado como gate bloqueante explícito no `package.json`; ele deixa de ser
classificado apenas como cobertura informativa pelo orphan gate.

Limites preservados:

- nenhuma rota HTTP ou integração com o front door foi criada nesta task;
- nenhum frontend foi alterado;
- `Run`, `ApprovalRecord`, receipts, evidence e eventos não foram vinculados;
- nenhuma aprovação humana ou autorização de execução foi criada;
- nenhum adapter, credencial, chamada ou transmissão ao Siscomex/Portal Único;
- nenhum deploy, Evidence Index, staging ou commit.

Status atualizado:

`PRE-DUIMP-CASE-04B`: IMPLEMENTADO E VALIDADO LOCALMENTE dentro do escopo de
repository e lifecycle. `PRE-DUIMP`: PARCIAL AVANÇADO, porque authority/HITL,
evidence/receipts/eventos, fontes read-only e revalidação posterior de runtime
permanecem em tasks separadas.
