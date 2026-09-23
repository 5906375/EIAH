# Oráculo CI1 — local synthetic persistence

Status: implemented synthetic slice; G3/G5 remain open. No routes, workers, real authorities, physical effects or deployment are connected. CI1 is not operational activation.

## Boundary and trust

`evaluateS1` keeps its conservative public pure behavior (always applied=false and HITL held). `evaluateResolvedS1` is an internal pure rules function; eligibility is not an authorization token. `transactionExecutor.ts` resolves the snapshot, E1 and A1 from controlled storage, and invokes the SQL finalizer on the same dedicated connection/transaction. No caller body can supply a positive authority flag or persisted approval. Synthetic token references are established by the test authenticator, not real bearer credentials. The database trusts this application identity association and does not prove correctness of a compromised executor (FC01/IT boundary).

Global SHARE then tenant UPDATE fences coordinate scoped operations; global authority changes take the global UPDATE lock. Authority is reread after locks under READ COMMITTED. The approach serializes work within a tenant intentionally. There is no reader bootstrap or global Prisma client. Four restricted logins have separate capabilities: executor, approver, authority writer and reader. The NOLOGIN owner/provisioner is unavailable to runtime. Each finalization needs a consumed-once context bound to pg_backend_pid() and txid_current(); a string/GUC alone is insufficient.

The SQL migration is additive and transactional, with no PUBLIC EXECUTE or runtime grants by default. Models are represented in the main Prisma schema; special checks/partial indexes and routine grants remain SQL-owned. ApprovalRecord defaults to LEGACY and no historical row is promoted. Runtime storage uses controlled functions only, not ORM delegates; tenantGuard is not claimed to protect raw SQL.

E1 uses normalized declared sets before persistence. A1 is immutable per scoped HD and includes the complete generic decision plus the synthetic reviewer token/binding. The reviewer is revalidated at execution. Three complete C3 records are persisted for an eligible result; every C5 evaluationRef resolves to its scoped immutable C3, with A1 references when applicable. C3, audit materials, assessment and C5 commit atomically with the visit transition. Intents, results and negative assessments are not deleted or overwritten; no TTL cleanup or tombstone expiry is implemented.

## Important limitation: negative result mapping

There is no activation of ORACULO_* reason codes. Negative assessments (including missing/rejected/expired review and conflicts) are durably held without C5. Tracking is PROCESSING without result; this is an internal pending-mapper state, not a promise of a running worker. The same intent remains immutable even if authority/material changes. A new intent is needed for a new evaluation. Completing final negative C5 and public recovery semantics requires the ratified mapper and transport work. Only successful protected simulations reach FINAL with result. Do not declare the complete negative-result contract implemented.

## Reproduce locally

Prerequisites: installed workspace dependencies, Docker available, local postgres:16 image. No install/pull is performed. Use Node 22 with tsx. Run from repository root with DATABASE_URL, SHADOW_DATABASE_URL and PG* connection variables absent:

```bash
env -u DATABASE_URL -u SHADOW_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD node --import tsx apps/api/scripts/validateOraculoS1Integrated.ts
node node_modules/typescript/bin/tsc -p tsconfig.oraculo-ci1.json --noEmit
pnpm test:oraculo-s1
```

The harness refuses inherited connections, resolves the local image ID, creates a unique labelled container, publishes an ephemeral loopback port, uses tmpfs rather than existing volumes, verifies PostgreSQL 16 and empty database, and creates only synthetic data. A marker prevents tests from targeting another database. The harness applies the exact CI1 migration over a minimal legacy ApprovalRecord fixture, not the full historic migration chain. It uses distinct login connections and saves results/hashes under ops/evidence/latest/oraculo-ci1-validation/<runId>/results.json. It verifies container identity before removing only that container. Local passwords are ephemeral and omitted from evidence.

Schema/client validation (from packages/db) uses an explicit schema-only configuration that cannot connect to the current database:

```bash
node node_modules/prisma/build/index.js validate --config prisma.oraculo-ci1.config.ts
node node_modules/prisma/build/index.js generate --config prisma.oraculo-ci1.config.ts
```

Do not replace these commands with migrate:dev, migrate:deploy or the shared development Compose. Generation is local only. This run does not prove application of all migrations against an existing installation.

## Validation scope and remaining work

Tests cover basic and HITL positive flow, persisted rejection/hold, material replacement, invalid approval window, reviewer changes, real session expiry, identity/scope forgery, immutable HI replay, observation identity, DML/DDL/role bypass, transaction/connection binding, concurrent intentions, tenant/global revocation locks, rollback after each final write, lost commit response and recovery from another connection, audit material preservation, IN/OUT proof and legacy exclusion. Loss of commit response is injected at the client boundary after a real PostgreSQL commit; it is not a network partition or server crash test.

Operational writers and administration outside this dedicated instance remain unintegrated. Authentication transport, external source adapters, negative reason mapper, complete historic-migration rehearsal, retention operations, runtime role provisioning outside the harness and full CI/rollout remain pending. No production readiness, general authority coverage or G3/G5 closure is implied by green local tests.

The initial S1/CI1 work was preserved in 2b1cdf4 on wip/oraculo-s1-preserve-20260922. This isolated worktree applies it over 7cf108b0d68383d2d50cc0beb31f6fac6f03eae9 without changing main. Historical S1 evidence refers to its original file hashes; new evidence must identify the current tree.
