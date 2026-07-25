# DB contract lifecycle — decisions evidence 2026-07-25

| Campo | Valor |
| --- | --- |
| Entrega | `2 de N — resolução fail-closed das pendências da entrega 1` |
| Baseline | `main@f7738ce6ad24ceead6b29bb7e93a4fd8ade83583` |
| Política | `docs/architecture/db-contract-lifecycle-v1.md` (`Proposta`) |
| Registro de decisões | `docs/architecture/db-contract-lifecycle-decisions-v1.md` |
| Status | `Proposta` |
| Escopo operacional | leitura local do repositório; sem staging/produção |

## Preflight e método

- Branch `main`, HEAD e `origin/main` iguais a
  `f7738ce6ad24ceead6b29bb7e93a4fd8ade83583`.
- Worktree limpo antes da coleta.
- A ordem executada foi dump (`AR-002`) → owners (`AR-001`) →
  wiring-vs-legado.
- Buscas runtime aceitaram fonte `.ts` canônica e excluíram `dist`, Prisma
  gerado, migrations, schema e dump.
- A auditoria adicional cobriu nomes de Prisma client, escritas SQL, SQL
  unsafe/dinâmico, jobs, workers, seeds e telemetria.
- Schema/migration isolados não foram tratados como uso runtime positivo.
- Somente nomes de arquivos, contagens e trechos de código canônico sem dados
  foram inspecionados. Nenhuma linha do dump foi exibida.

## Tabela de transições propostas

| Objeto | Lifecycle (entrega 1) | Lifecycle proposto | Gate satisfeito? | EvidenceRef (uso positivo) | Owner registrado | AssumptionRef | Decisão humana pendente |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AgentInstall` / `agent_installs` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-01` | Nomear custodiante e decidir wiring futuro, suporte legado ou sunset futuro. |
| `ConnectorInstance` / `connector_instances` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-02` | Nomear custodiante e decidir wiring futuro, suporte legado ou sunset futuro. |
| `RolePermission` / `role_permissions` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-03` | Nomear custodiante e reconciliar o contrato com o RBAC canônico. |
| `RunExecutionLock` / `run_execution_locks` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-04` | Nomear custodiante e decidir relação com lease/lock runtime canônico. |
| `TenantCustomRole` / `tenant_role_customs` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-05` | Nomear custodiante e reconciliar o contrato com roles tenant canônicas. |
| `WalletIdentity` / `wallet_identities` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-001-06` | Nomear custodiante e decidir wiring, suporte legado ou sunset futuro. |
| `apps/api/backup-20251031-103132.sql` | `needs-human-decision` | `needs-human-decision` | não | `{ artifactId: DBCL2-BOUNDARY-BACKUP-20260725, location: apps/api/backup-20251031-103132.sql@f7738ce6ad24ceead6b29bb7e93a4fd8ade83583, hash: 8e0f2e64a198876c20708d34b05bf9f8662c55e69ff4e5cab8e932e2cbaf3228 }` (fronteira, não uso runtime) | não | `AR-002` | Escolher rota 1 com aprovação explícita ou rota 2 com política formal suficiente. |
| `ApprovalDecision` | `needs-human-decision` | `needs-human-decision` | não | —; 16 arquivos são colisões de conceito/nome, não uso do enum DB | não | `AR-003-01` | Escolher wiring DB ou suporte legado e registrar owner. |
| `ApprovalRecord` / `approval_records` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-003-02` | Escolher wiring DB ou suporte legado, mapear consumidor e registrar owner. |
| `PoUFailureReason` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-003-03` | Owner PoU deve ratificar wiring ou suporte legado. |
| `PoUStatus` | `needs-human-decision` | `needs-human-decision` | não | —; busca canônica positiva = 0 | não | `AR-003-04` | Owner PoU deve ratificar wiring ou suporte legado. |
| `ProofOfUsage` / `proof_of_usage` | `needs-human-decision` | `needs-human-decision` | não | `{ artifactId: DBCL2-POU-CONFLICT-20260725, location: apps/api/src/services/pouService.ts@f7738ce6ad24ceead6b29bb7e93a4fd8ade83583, hash: 541258dcd5e6f7845b8ad034f5f1d741cfc825ffccc597aa33d760a2096493ea }` (conflito positivo; não prova uso DB) | não | `AR-003-05` | Ratificar wiring recomendado, suporte legado ou sunset futuro; registrar owner. |

Nenhum lifecycle difere da entrega 1 porque nenhum gate reuniu uso positivo e
owner registrado.

## Registro de decisão do dump (AR-002)

| Rota escolhida (`rota-1` / `rota-2` / `defer-with-blocker`) | Aprovação humana | Bloqueio pendente (se defer) | Evidência/plano | Ação nesta entrega | Ação diferida |
| --- | --- | --- | --- | --- | --- |
| `defer-with-blocker` | ausente/não fornecida | Faltam aprovação explícita para `rota-1` e política formal específica suficiente para `rota-2`; decisão requerida de DB governance/security com legal/privacy. | Hash SHA-256 congelado acima; 1 linha com marcador legado de token de confiança, descrito de forma mascarada; dump limpo no `git status`. | Revalidar hash/contagem sem abrir conteúdo e manter arquivo intocado. | Escolher rota; se `rota-1`, remover em commit separado; se houver indício de segredo vivo, avaliar/rotacionar em frente independente. |

## Wiring-vs-legado

| Objeto | Resultado evidenciado | Disposição |
| --- | --- | --- |
| `ApprovalDecision` | O nome aparece em fluxos IMOB/receipt, mas não há operação canônica `approvalRecord`. | Colisão nome-vs-contrato; `defer`, sem promoção. |
| `ApprovalRecord` / `approval_records` | Zero arquivos TypeScript canônicos com tabela/modelo/client. | `defer`; decisão humana entre wiring e legado. |
| `PoUFailureReason` | Presente em schema/migration e ausente do runtime TypeScript canônico. | `defer`; decisão conjunta do owner PoU. |
| `PoUStatus` | Presente em schema/migration e ausente do runtime TypeScript canônico. | `defer`; decisão conjunta do owner PoU. |
| `ProofOfUsage` / `proof_of_usage` | `schema.prisma` declara o modelo, mas `pouService.ts` retorna vazio e `evidenceBundle.ts` publica estado indisponível. | Contrato meio-morto confirmado; wiring recomendado, sem implementação ou promoção. |

## Ledger de coleta sanitizada

### AR-001 — uso positivo

Comando executado uma vez para cada um dos seis padrões
`tabela|Modelo|prismaClient`:

```bash
rg -l -i -e "$PATTERN" apps packages scripts --glob '*.ts' \
  --glob '!**/dist/**' --glob '!packages/db/src/generated/**' \
  --glob '!packages/db/prisma/migrations/**' \
  --glob '!packages/db/prisma/schema.prisma' \
  --glob '!apps/api/backup-20251031-103132.sql' | sort
```

Resultado rotulado: `AgentInstall=0`, `ConnectorInstance=0`,
`RolePermission=0`, `RunExecutionLock=0`, `TenantCustomRole=0`,
`WalletIdentity=0`.

Hash SHA-256 da captura rotulada:
`76d08112908c8606e5c91d009d854fc0c0d503662bc79a6ec3249df121946d0b`.

A busca por `INSERT`/`UPDATE`/`DELETE` desses identificadores em `.sql`/`.ts`
fora do dump também retornou zero. As migrations
`20260120000000_bootstrap_missing_tables` e `20260213141438` são os únicos
arquivos de migration com os identificadores; isso materializa contrato, não
uso runtime.

A revisão de call sites `$queryRawUnsafe`/`$executeRawUnsafe` encontrou SQL
estático de outros domínios e nenhum identificador AR-001. Sinais amplos como
“role + permission”, “tenant + role” e “run + lock” foram tratados como
colisões conceituais, nunca como uso do contrato DB.

### Wiring-vs-legado

O mesmo comando, com os cinco padrões da Trilha C, produziu a captura:
`ApprovalDecision=16`, `ApprovalRecord=0`, `PoUFailureReason=0`,
`PoUStatus=0`, `ProofOfUsage=2`.

Hash SHA-256 da captura rotulada:
`de112c2f71272b22ab7bbef8f9264a8b9253ae55be981b6a124f526cee59fce0`.

Os 16 hits de `ApprovalDecision` são conceitos IMOB/receipt. Os dois hits de
`ProofOfUsage` são o comentário de indisponibilidade em `pouService.ts` e o
reason sanitizado de indisponibilidade em `evidenceBundle.ts`.

### Hashes de fontes canônicas

| Fonte | SHA-256 | Uso na conclusão |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma` | `aa34ee881077af5d9f26239cf123d2f749e234fa1e8d5e23aef60087d1dd0e55` | Declara os cinco contratos da Trilha C; não prova wiring runtime. |
| `packages/db/prisma/migrations/20260120000000_bootstrap_missing_tables/migration.sql` | `eb9ad9cee8383cfb1c863853dd7ac2a0362d10380ff11a34953c75d3e9cf120e` | Materializa tabelas históricas. |
| `packages/db/prisma/migrations/20260213141438/migration.sql` | `61a5e709c9fe0f1e6c1da00f099a29a52598daf0dca5bdf7477b71dc5f56ba09` | Materializa enums/tipos históricos. |
| `apps/api/src/services/pouService.ts` | `541258dcd5e6f7845b8ad034f5f1d741cfc825ffccc597aa33d760a2096493ea` | Retorna resolução PoU vazia e declara o modelo indisponível. |
| `apps/api/src/services/evidenceBundle.ts` | `1faeb48143e9de07ec9805100696984fc1a331ca91f4be2a53ad4e9755c7efb8` | Publica PoU indisponível no bundle. |
| `apps/api/src/services/receiptCanonService.ts` | `b1ad3e6b42b2d4eff78e7126dba121fbf4970090acb245bd3cf0fa845b89e30d` | Usa conceito de decisão de approval, não `ApprovalRecord`. |
| `apps/api/src/services/imob/imobPilotApprovalRuntime.ts` | `64dc0f051655c2f2d81bdfcb4a156fb61995878c6955fd56193f7f1fce96976d` | Usa conceito IMOB de approval, não o contrato DB inventariado. |

## assumptionRegister

| AssumptionRef | Assunção/Decisão | Autor + data | Motivo | Risco se falso | Como validar depois |
| --- | --- | --- | --- | --- | --- |
| `AR-001-01` | Owner de `AgentInstall` não atribuído; placeholder anterior não vira fato. | Sem autor humano · `2026-07-25` | Zero uso positivo canônico. | Consumidor fora do escopo de busca pode existir. | Owner humano + revisão de arquitetura de installs. |
| `AR-001-02` | Owner de `ConnectorInstance` não atribuído. | Sem autor humano · `2026-07-25` | Zero uso positivo canônico. | Integração externa não nomeada pode existir. | Owner humano + mapa de connectors/jobs. |
| `AR-001-03` | Owner de `RolePermission` não atribuído. | Sem autor humano · `2026-07-25` | Zero uso positivo do contrato DB. | RBAC pode depender dele por caminho indireto. | Owner RBAC + prova nomeada do contrato. |
| `AR-001-04` | Owner de `RunExecutionLock` não atribuído. | Sem autor humano · `2026-07-25` | Zero uso positivo do contrato DB. | Lock externo/dinâmico pode existir. | Owner de execução + mapa de lease/lock. |
| `AR-001-05` | Owner de `TenantCustomRole` não atribuído. | Sem autor humano · `2026-07-25` | Zero uso positivo do contrato DB. | Roles tenant podem ter consumidor indireto. | Owner RBAC/tenant + prova nomeada. |
| `AR-001-06` | Owner de `WalletIdentity` não atribuído. | Sem autor humano · `2026-07-25` | Zero uso positivo canônico. | Binding wallet externo pode existir. | Owner identity/wallet + mapa de bindings. |
| `AR-002` | `defer-with-blocker`; dump fica intocado. | Sem aprovação humana · `2026-07-25` | Pré-requisitos de rota 1 e rota 2 ausentes. | Retenção amplia exposição ou remoção futura perde evidência. | Aprovação de remoção ou política formal de retenção. |
| `AR-003-01` | Hits de `ApprovalDecision` não provam o enum DB. | Executor governado (não humano) · `2026-07-25` | Colisão conceitual reproduzida. | Um binding indireto pode ter sido omitido. | Owner approval + operação DB nomeada. |
| `AR-003-02` | `ApprovalRecord` permanece sem wiring confirmado. | Executor governado (não humano) · `2026-07-25` | Zero uso positivo canônico. | Consumidor externo pode existir. | Decisão humana + consumidor versionado. |
| `AR-003-03` | `PoUFailureReason` deve ser decidido com o contrato PoU. | Executor governado (não humano) · `2026-07-25` | Só schema/migration sustentam o enum. | Runtime pode depender do tipo por caminho não nomeado. | Owner PoU + import/operação canônica. |
| `AR-003-04` | `PoUStatus` deve ser decidido com o contrato PoU. | Executor governado (não humano) · `2026-07-25` | Só schema/migration sustentam o enum. | Runtime pode depender do tipo por caminho não nomeado. | Owner PoU + import/operação canônica. |
| `AR-003-05` | Wiring de `ProofOfUsage` é recomendado, mas não ratificado. | Executor governado (não humano) · `2026-07-25` | Conflito positivo schema-vs-runtime vazio. | O contrato pode ser legado ou destinado a sunset. | Decisão humana do owner PoU e implementação futura separada. |

Nenhuma promoção de owner virou fato: não há entrada com autor humano.

## Outcome

- Pendências de entrada: 12.
- `active` promovidos: 0.
- `legacy-supported` promovidos: 0.
- Permanecem `needs-human-decision`: 12.
- `candidate-removal`: 0.
- Dump: `defer-with-blocker`, intacto.
- Schema/migrations/runtime alterados: 0.
- Staging/produção: não observados e não declarados.
- Política/frente: `Proposta`.
