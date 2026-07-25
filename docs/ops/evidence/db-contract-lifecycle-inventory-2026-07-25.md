# DB contract lifecycle — inventory 2026-07-25

| Campo | Valor |
| --- | --- |
| Política | `docs/architecture/db-contract-lifecycle-v1.md` |
| Entrega | `1 de N — inventário + política, não-destrutiva` |
| Baseline | `main@c0e77cd451feeea909e3479afb61b3233e2132f5` |
| Status | `Parcial` |
| Escopo operacional | leitura local do repositório |

## Boundary and method

- Worktree clean before execution.
- The canonical evidence directory was confirmed as `docs/ops/evidence/`: it
  contains the tracked #390 evidence, is explicitly unignored for Markdown and
  passes the repository evidence/link checks.
- Search scope: `apps/**`, `packages/**`, `scripts/**`, `docs/**` and historical
  migrations.
- Full search used `--no-ignore` so tracked migration/schema paths were not lost.
- Runtime search accepted only canonical `.ts` source and excluded `dist`,
  generated Prisma client, migrations, schema, dump and incidental `.js` under
  `src`.
- Results contain file names/counts only. No data row or SQL fragment was copied.
- Negative grep is classified only as an incomplete signal.

## Inventory

| Objeto | Tipo | Domínio | Sensível | Lifecycle | Classificação do achado | EvidenceRef | Owner | AssumptionRef | Decisão/Pendência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RunStatus.awaiting_approval` | enum value | approval | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-RUNSTATUS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: d203b8e23c9428fae3b77783619ee979e876129254ac9d4981c8c4d87d9407c3 }` | `apps/api/src/services/imob/orchestrator/` | — | Sustentar compatibilidade do valor histórico. |
| `ApprovalDecision` | enum | approval | sim | `needs-human-decision` | `suspeita` | `{ artifactId: DBCL-GREP-APPROVALDECISION-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: b3ec1d7f8f27dc9f8578353aa78b791eebb860f84b3c58e9633cc79710c5f52c }` | não atribuído ao contrato DB | — | O nome aparece no runtime como conceito IMOB/receipt, mas não há uso canônico de `ApprovalRecord`; decidir integração ou suporte legado. |
| `PoUFailureReason` | enum | proof_of_usage / PoU | sim | `needs-human-decision` | `suspeita` | `{ artifactId: DBCL-GREP-POUFAILURE-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 58defc380288b60d0aa91eec8f3ede37848cfdcf6accbd6cbe8d0ccc9060f410 }` | não atribuído ao contrato DB | — | Grep runtime negativo; decidir integração ao PoU canônico ou suporte legado. |
| `PoUStatus` | enum | proof_of_usage / PoU | sim | `needs-human-decision` | `suspeita` | `{ artifactId: DBCL-GREP-POUSTATUS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 58defc380288b60d0aa91eec8f3ede37848cfdcf6accbd6cbe8d0ccc9060f410 }` | não atribuído ao contrato DB | — | Grep runtime negativo; decidir integração ao PoU canônico ou suporte legado. |
| `AgentInstall` / `agent_installs` | model/table | agent installs + tenant/workspace | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-AGENTINSTALLS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 2a094e9d3084b98a364e640aa736ba1a7ef08f4f6d28fa404020c2d755a09c26 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `AgentReputation` / `agent_reputation` | model/table | reputation | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-AGENTREPUTATION-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: f0b42ca63495fdec2e801da6aadfdb8aa3d2e3a02d9988c5b60ee0977401d5c9 }` | `apps/api/src/services/reputationDisputes.ts` | — | Sustentar contrato raw SQL e modelo Prisma alinhados. |
| `AgentReputationEvent` / `agent_reputation_events` | model/table | reputation | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-AGENTREPUTATIONEVENTS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: fe63a2784cab3a68cfabe9bb6bba05d98473c52e7ead642ed6f9398cd2f6ff8c }` | `apps/api/src/services/reputationDisputes.ts` | — | Sustentar journal raw SQL e modelo Prisma alinhados. |
| `ApprovalRecord` / `approval_records` | model/table | approval | sim | `needs-human-decision` | `suspeita` | `{ artifactId: DBCL-GREP-APPROVALRECORDS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: f9395c70c2378c66be56a5bd9f6793ce9adf34cc894dff0ea4ea1c4622391a43 }` | não atribuído ao contrato DB | — | Grep runtime canônico negativo; decidir integração ou suporte legado. |
| `BillingDispute` / `billing_disputes` | model/table | economy / billing + reputation | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-BILLINGDISPUTES-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 14b6b7185fbab8ab2dddd681b00f4eb9e30adb112f951e2e37285218d0a0b27e }` | `apps/api/src/services/reputationDisputes.ts` | — | Sustentar contrato raw SQL e modelo Prisma alinhados. |
| `BillingWebhookEvent` / `billing_webhook_events` | model/table | economy / billing | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-BILLINGWEBHOOK-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 0ec5ffb12bd241a4ad0c15618ace6c1d6a90ee3d05459440de08e28c655d8537 }` | `apps/api/src/services/paymentIntents.ts` | — | Sustentar idempotência raw SQL e modelo Prisma alinhados. |
| `ConnectorInstance` / `connector_instances` | model/table | connectors + tenant/workspace | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-CONNECTORS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `PaymentIntent` / `payment_intents` | model/table | economy / billing | sim | `active` | `confirmado` | `{ artifactId: DBCL-GREP-PAYMENTINTENTS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 0bed45169d09bd8a886bff21d060ba04b453198ca0ff5674c804d3f40ba658da }` | `apps/api/src/services/paymentIntents.ts` | — | Sustentar contrato raw SQL, rotas e modelo Prisma alinhados. |
| `ProofOfUsage` / `proof_of_usage` | model/table | proof_of_usage / PoU | sim | `needs-human-decision` | `suspeita` | `{ artifactId: DBCL-GREP-PROOFOFUSAGE-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 5f0bbe348e0a221060863198e7cb4d07e289c3c5c7ea8a3f35d75ac68be90fd6 }` | `apps/api/src/services/pouService.ts` (conceito; custódia DB não atribuída) | — | O runtime retorna estrutura vazia e ainda declara schema sem modelo; decidir wiring ou suporte legado. |
| `RolePermission` / `role_permissions` | model/table | RBAC | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-ROLEPERMISSIONS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 759c5a3305d02b743b6efff8470a67ce53efe2ab2be23ef546476684ab15c7c7 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `RunExecutionLock` / `run_execution_locks` | model/table | execution locks + tenant/workspace | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-EXECUTIONLOCKS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `TenantMembership` / `tenant_memberships` | model/table | RBAC + tenant/workspace | sim | `legacy-supported` | `confirmado` | `{ artifactId: DBCL-GREP-TENANTMEMBERSHIPS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: bee039955acac925bc659ca3e7c9efda5d9b6caad969526e8b4d92b09dfbc011 }` | `apps/api/prisma_legacy/seed.ts` | — | Uso positivo em seed explicitamente legado; decidir owner e sunset antes de deprecar. |
| `TenantCustomRole` / `tenant_role_customs` | model/table | RBAC + tenant/workspace | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-TENANTROLES-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `WalletIdentity` / `wallet_identities` | model/table | wallet + tenant/workspace | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-GREP-WALLETS-20260725, location: docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md#grep-ledger, hash: 711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748 }` | DB governance (inferido) | `AR-001` | Grep runtime negativo; atribuir owner e decidir suporte. |
| `apps/api/backup-20251031-103132.sql` | raw SQL dump | reputation + retenção | sim | `needs-human-decision` | `estimativa` | `{ artifactId: DBCL-BOUNDARY-BACKUP-20260725, location: apps/api/backup-20251031-103132.sql@8bc46b3b93ec9808432617299d9d872ea78867e4, hash: 8e0f2e64a198876c20708d34b05bf9f8662c55e69ff4e5cab8e932e2cbaf3228 }` | DB governance/security (inferido) | `AR-002` | Decidir explicitamente: congelar hash e remover em entrega aprovada, ou reter sob política formal. |

## assumptionRegister

| AssumptionRef | Assunção | Motivo | Risco se falso | Como validar depois |
| --- | --- | --- | --- | --- |
| `AR-001` | DB governance é o custodiante provisório dos contratos presentes apenas em schema/migrations. | Nenhum import, FK de domínio ou uso runtime nomeado atribui owner determinístico. | A decisão pode ignorar consumidor/owner fora do grep literal. | Registrar owner humano e revisar SQL dinâmico, jobs, seeds e telemetria antes de mudar lifecycle. |
| `AR-002` | DB governance/security é o custodiante provisório do dump raw SQL versionado. | Não foi localizada política de retenção/owner determinística; o conteúdo não foi aberto nesta execução. | Remoção ou retenção indevida pode quebrar auditoria ou ampliar exposição. | Decisão humana de retenção, classificação de dados, necessidade legal e destino do hash. |

## Grep ledger

Exact full-search command, executed once per pattern below:

```bash
rg --no-ignore -l -i -e "$PATTERN" apps packages scripts docs \
  --glob '!**/node_modules/**' --glob '!**/.git/**' \
  --glob '!**/dist/**' --glob '!packages/db/src/generated/**' | sort
```

Exact canonical-runtime command, executed once per pattern:

```bash
rg -l -i -e "$PATTERN" apps packages scripts --glob '*.ts' \
  --glob '!**/dist/**' --glob '!packages/db/src/generated/**' \
  --glob '!packages/db/prisma/migrations/**' \
  --glob '!packages/db/prisma/schema.prisma' \
  --glob '!apps/api/backup-20251031-103132.sql' | sort
```

Each hash below covers the exact labeled full and runtime file lists captured in
`/tmp`; only file names were captured. `runtime TS signal` is the exact count and
sanitized interpretation used for lifecycle. Generic concept/name collisions do
not prove use of the corresponding DB contract.

| ArtifactId | Pattern | Full files | Runtime TS signal | Capture SHA-256 |
| --- | --- | ---: | --- | --- |
| `DBCL-GREP-RUNSTATUS-20260725` | `awaiting_approval` | 10 | 4 files: IMOB mission graph/types/compat resolver + focused test | `d203b8e23c9428fae3b77783619ee979e876129254ac9d4981c8c4d87d9407c3` |
| `DBCL-GREP-APPROVALDECISION-20260725` | `ApprovalDecision` | 20 | 16 files; concept/name collision, no canonical `approvalRecord` operation | `b3ec1d7f8f27dc9f8578353aa78b791eebb860f84b3c58e9633cc79710c5f52c` |
| `DBCL-GREP-POUFAILURE-20260725` | `PoUFailureReason` | 3 | 0 files | `58defc380288b60d0aa91eec8f3ede37848cfdcf6accbd6cbe8d0ccc9060f410` |
| `DBCL-GREP-POUSTATUS-20260725` | `PoUStatus` | 3 | 0 files | `58defc380288b60d0aa91eec8f3ede37848cfdcf6accbd6cbe8d0ccc9060f410` |
| `DBCL-GREP-AGENTINSTALLS-20260725` | `agent_installs\|AgentInstall` | 5 | 0 files | `2a094e9d3084b98a364e640aa736ba1a7ef08f4f6d28fa404020c2d755a09c26` |
| `DBCL-GREP-AGENTREPUTATION-20260725` | `agent_reputation\|AgentReputation` | 8 | 3 files: billing route, runtime service, evidence generator | `f0b42ca63495fdec2e801da6aadfdb8aa3d2e3a02d9988c5b60ee0977401d5c9` |
| `DBCL-GREP-AGENTREPUTATIONEVENTS-20260725` | `agent_reputation_events\|AgentReputationEvent` | 5 | 2 files: runtime service + evidence generator | `fe63a2784cab3a68cfabe9bb6bba05d98473c52e7ead642ed6f9398cd2f6ff8c` |
| `DBCL-GREP-APPROVALRECORDS-20260725` | `approval_records\|ApprovalRecord` | 5 | 0 files | `f9395c70c2378c66be56a5bd9f6793ce9adf34cc894dff0ea4ea1c4622391a43` |
| `DBCL-GREP-BILLINGDISPUTES-20260725` | `billing_disputes\|BillingDispute` | 6 | 3 files: billing route, runtime service, focused test | `14b6b7185fbab8ab2dddd681b00f4eb9e30adb112f951e2e37285218d0a0b27e` |
| `DBCL-GREP-BILLINGWEBHOOK-20260725` | `billing_webhook_events\|BillingWebhookEvent` | 4 | 1 file: runtime payment service | `0ec5ffb12bd241a4ad0c15618ace6c1d6a90ee3d05459440de08e28c655d8537` |
| `DBCL-GREP-CONNECTORS-20260725` | `connector_instances\|ConnectorInstance` | 4 | 0 files | `711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748` |
| `DBCL-GREP-PAYMENTINTENTS-20260725` | `payment_intents\|PaymentIntent` | 20 | 11 files: route/service/tests/web/check/evidence generator | `0bed45169d09bd8a886bff21d060ba04b453198ca0ff5674c804d3f40ba658da` |
| `DBCL-GREP-PROOFOFUSAGE-20260725` | `proof_of_usage\|ProofOfUsage` | 9 | 2 files: explicit unavailable reason + empty resolver/comment | `5f0bbe348e0a221060863198e7cb4d07e289c3c5c7ea8a3f35d75ac68be90fd6` |
| `DBCL-GREP-ROLEPERMISSIONS-20260725` | `role_permissions\|RolePermission` | 5 | 0 files | `759c5a3305d02b743b6efff8470a67ce53efe2ab2be23ef546476684ab15c7c7` |
| `DBCL-GREP-EXECUTIONLOCKS-20260725` | `run_execution_locks\|RunExecutionLock` | 4 | 0 files | `711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748` |
| `DBCL-GREP-TENANTMEMBERSHIPS-20260725` | `tenant_memberships\|TenantMembership` | 5 | 1 file: `apps/api/prisma_legacy/seed.ts` | `bee039955acac925bc659ca3e7c9efda5d9b6caad969526e8b4d92b09dfbc011` |
| `DBCL-GREP-TENANTROLES-20260725` | `tenant_role_customs\|TenantCustomRole` | 4 | 0 files | `711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748` |
| `DBCL-GREP-WALLETS-20260725` | `wallet_identities\|WalletIdentity` | 4 | 0 files | `711a21eef69713e443357aee31e5190fc80c5e8304305891b12bc150ef366748` |

## Boundary dump evidence

Commands executed without displaying file content:

```bash
sha256sum apps/api/backup-20251031-103132.sql
wc -c apps/api/backup-20251031-103132.sql
rg -i -c 'trust.?score.?token|tokeniza' apps/api/backup-20251031-103132.sql
```

Result:

```text
sha256: 8e0f2e64a198876c20708d34b05bf9f8662c55e69ff4e5cab8e932e2cbaf3228
bytes: 97449
masked legacy trust-token marker lines: 1
```

No dump content was printed or copied.

## Outcome

- Inventory rows: 19.
- `active/confirmado`: 6.
- `legacy-supported/confirmado`: 1.
- `needs-human-decision/suspeita`: 5.
- `needs-human-decision/estimativa`: 7.
- `deprecated`: 0.
- `candidate-removal`: 0.
- Destructive DDL/migrations: 0.
- Staging/production evidence: not collected and not claimed.
