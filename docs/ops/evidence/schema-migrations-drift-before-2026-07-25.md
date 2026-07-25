# Prisma schema x historical migrations — drift inventory

Date: 2026-07-25
Scope: local ephemeral PostgreSQL only
Status: local evidence; no staging/production claim

## Execution boundary

- Baseline: `main` at `dae6d4469672b3506465b3e6c672f20f31ef16a8`.
- Worktree was clean before the audit.
- Image: `pgvector/pgvector:pg16`.
- Database: disposable local container with dummy credentials.
- Applied history: 25 migrations; `prisma migrate status` returned `Database schema is up to date!`.
- No `.env` was read, changed or staged.
- No remote database was accessed.
- `prisma db pull --print` was used for inspection only; its output was not copied blindly into the repository.

Commands used, with the dummy connection value omitted:

```text
pnpm -C packages/db prisma migrate deploy
pnpm -C packages/db prisma migrate status
pnpm -C packages/db prisma db pull --print
pnpm -C packages/db prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --script
```

## Before inventory

The migrated database-to-schema diff had 325 lines and SHA-256:

```text
1e8c8f1754511eaf756c26544d085080237d5e838e60724b13518f013e267645
```

Sanitized operation summary:

| Operation class | Count | Classification |
| --- | ---: | --- |
| `DropTable` | 14 | Unsafe; rejected. Tables were modeled instead. |
| `DropEnum` | 3 | Unsafe; rejected. Enums were modeled instead. |
| `AlterEnum` | 1 | Historical value absent from the schema; modeled. |
| `DropForeignKey` | 27 | Existing migration metadata; represented, not executed. |
| `AddForeignKey` | 10 | Existing migration metadata; represented, not executed. |
| `AlterTable` | 13 | Existing `updated_at` defaults; represented, not executed. |
| `RenameIndex` | 37 | Existing physical names retained through Prisma `map`. |

## Object classification and disposition

No object was classified for removal in this run. Sensitive billing, economy,
approval, tenant and workspace contracts were kept fail-safe and additive.

| Migrated object | Classification | Evidence/consumer signal | Safe disposition |
| --- | --- | --- | --- |
| `RunStatus.awaiting_approval` | keep and model | Historical migration `20260213141438` | Added existing enum value to Prisma. |
| `ApprovalDecision` | keep and model | `approval_records`; approval consumers | Added enum unchanged. |
| `PoUFailureReason` | keep and model | `proof_of_usage`; evidence bundle gap | Added enum unchanged. |
| `PoUStatus` | keep and model | `proof_of_usage` | Added enum unchanged. |
| `agent_reputation` | keep and model | `reputationDisputes.ts`; P3 evidence generator | Added mapped model and physical indexes. |
| `agent_reputation_events` | keep and model | `reputationDisputes.ts`; P3 journal evidence | Added mapped model. |
| `billing_disputes` | keep and model | `reputationDisputes.ts` | Added mapped model and physical indexes. |
| `payment_intents` | keep and model | Economy routes/evidence generator | Added mapped model, existing FKs and indexes. |
| `billing_webhook_events` | keep and model | Billing webhook idempotency contract | Added mapped model, FK and indexes. |
| `approval_records` | keep and model | Historical approval contract | Added mapped model and enum. |
| `proof_of_usage` | keep and model | Receipt/evidence contract | Added mapped model and enums. |
| `tenant_memberships` | legacy/deprecated but representable | Historical RBAC migration; tenant-sensitive | Added mapped model and existing relations. |
| `tenant_role_customs` | legacy/deprecated but representable | Historical custom-role migration | Added mapped model and existing relations. |
| `role_permissions` | legacy/deprecated but representable | Historical custom-role migration | Added mapped model and cascade relation. |
| `wallet_identities` | legacy/deprecated but representable | Historical wallet identity migration | Added mapped model and existing relations. |
| `connector_instances` | legacy/deprecated but representable | Historical connector migration | Added mapped model and existing relations. |
| `agent_installs` | legacy/deprecated but representable | Historical agent installation migration | Added mapped model and existing relations. |
| `run_execution_locks` | legacy/deprecated but representable | Historical execution-lock migration | Added mapped model and existing unique key. |
| Existing FK actions | keep and model | Applied migration catalog | Added explicit `onDelete` only where physical DDL requires it. |
| Existing index names | keep and model | Applied migration catalog | Added Prisma `map`; no index was renamed. |
| Existing `updated_at` defaults | keep and model | Applied migration catalog | Preserved DB default together with Prisma `@updatedAt`. |

## After result

After the manual schema reconciliation, the same database-to-schema command
returned:

```text
-- This is an empty migration.
```

The six-line command capture has SHA-256:

```text
4b7749a65678c410ca78c26d744307c4f98ed4dc52fc0877a23c4d94c67dbb6c
```

This proves local equivalence between the applied migration history and the
edited `schema.prisma` for the audited toolchain and ephemeral database. It
does not prove a GitHub Actions run or any staging/production state.

## Destructive decisions and residual risk

- Destructive DDL proposed: none.
- Human decision required for removal: none in this reconciliation.
- Future removal/deprecation must be a separate, explicitly approved migration.
- Several historical tables are still consumed through raw SQL. Modeling them
  does not migrate those consumers to Prisma and does not change runtime paths.
- Remote CI remains to be observed after a separately authorized push.
