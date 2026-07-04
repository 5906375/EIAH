# Audit criticality by content — 2026-07-02

## Data

- `2026-07-02`

## Allowlist validada

- `scripts/checkP1CriticalChain.ts`
- `scripts/checkP1ReconciliationRecurring.ts`
- `docs/EVIDENCE_INDEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `packages/core/src/queue/workerOwnershipLease.ts`
- `packages/core/src/config/redis.ts`

## Marcadores mínimos por arquivo

- `scripts/checkP1CriticalChain.ts`
  Marcadores equivalentes usados:
  - `approvalStatus RunApprovalStatus`
  - `approval.policy.v1`
  - `failClosedEvidence`
- `scripts/checkP1ReconciliationRecurring.ts`
  Marcadores usados:
  - `auditGap`
  - `duplicateSideEffects`
- `docs/EVIDENCE_INDEX.md`
  Marcadores usados:
  - `# EVIDENCE INDEX`
  - `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
  Marcador usado:
  - `Data de referência desta revisão`
- `packages/core/src/queue/workerOwnershipLease.ts`
  Marcadores equivalentes usados:
  - `ttlMs`
  - `ownerId`
  - `resolveLeaseKey`
- `packages/core/src/config/redis.ts`
  Marcadores usados:
  - `requireRedisUrl`
  - `REDIS_URL_REQUIRED`
  - `Localhost fallback is forbidden in runtime.`

## Saída real do gate

Comando executado:

```bash
pnpm audit:criticality
```

Saída real:

```text
> eiah-builder@ audit:criticality /home/jusall/projects/EIAH_BUILDER
> pnpm exec tsx scripts/auditCriticalityCoverage.ts --out artifacts/criticality-coverage.json --allowlist scripts/criticality-allowlist.txt

[audit:criticality] OK — 6 allowlisted file(s) verified with content markers.
[audit:criticality] output written to: artifacts/criticality-coverage.json
```

Artefato gerado:

```json
{
  "ok": true,
  "check": "audit:criticality",
  "allowlist": "scripts/criticality-allowlist.txt",
  "allowlistedCount": 6,
  "existingCount": 6,
  "missingCount": 0,
  "missing": [],
  "contentRulesCount": 6,
  "invalidContentCount": 0,
  "invalidContent": [],
  "validatedFiles": [
    {
      "file": "scripts/checkP1CriticalChain.ts",
      "markers": [
        "approvalStatus RunApprovalStatus",
        "approval.policy.v1",
        "failClosedEvidence"
      ],
      "minBytes": 64
    },
    {
      "file": "scripts/checkP1ReconciliationRecurring.ts",
      "markers": [
        "auditGap",
        "duplicateSideEffects"
      ],
      "minBytes": 64
    },
    {
      "file": "docs/EVIDENCE_INDEX.md",
      "markers": [
        "# EVIDENCE INDEX",
        "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md"
      ],
      "minBytes": 64
    },
    {
      "file": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
      "markers": [
        "Data de referência desta revisão"
      ],
      "minBytes": 64
    },
    {
      "file": "packages/core/src/queue/workerOwnershipLease.ts",
      "markers": [
        "ttlMs",
        "ownerId",
        "resolveLeaseKey"
      ],
      "minBytes": 64
    },
    {
      "file": "packages/core/src/config/redis.ts",
      "markers": [
        "requireRedisUrl",
        "REDIS_URL_REQUIRED",
        "Localhost fallback is forbidden in runtime."
      ],
      "minBytes": 32
    }
  ],
  "generatedAt": "2026-07-02T12:25:26.370Z"
}
```

## Teste específico do script

- não foi criado teste específico adicional
- o próprio gate foi executado contra o estado atual do repositório e produziu artefato com os marcadores validados

## Saída real de check:evidence-index

```bash
pnpm check:evidence-index
```

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 117837,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 347
}
```

## Observação operacional

- o comando `pnpm audit:criticality` precisou ser executado fora do sandbox porque `tsx` falhava ao abrir seu pipe IPC local (`listen EPERM` em `/tmp/tsx-*/*.pipe`)
- o gate em si passou no estado atual do repositório
