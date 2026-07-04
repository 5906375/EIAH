# Fase 3 — Dividas Documentadas Closure — 2026-07-02

## Data

- 2026-07-02

## Documentos lidos

- `CLAUDE.md`
- `CODEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/agent-protocol-compatibility-matrix-2026-07-02.md`
- `ops/evidence/latest/chat-runtime-entrypoint-debt-2026-07-02.md`
- `ops/evidence/latest/git-hygiene-tracked-files-2026-07-02.md`
- `ops/evidence/latest/white-label-runtime-gap-2026-07-02.md`
- `docs/ops/agent-protocol-compatibility-matrix.md`
- `docs/architecture/chat-runtime-entrypoint-debt.md`
- `docs/architecture/white-label-runtime-gap.md`
- `docs/architecture/fase-3-dividas-documentadas-closure.md`
- `package.json`
- `.github/workflows/ci.yml`

## PRs consolidados

- PR-6 — Agent Protocol multi-version matrix
- PR-7 — Chat runtime entrypoint debt
- PR-8 — Git hygiene / tracked generated files audit
- PR-9 — White-label runtime gap formalization

## Matriz final de status

| Divida | Camada consolidada | Status |
| --- | --- | --- |
| F-07 / Agent Protocol | matriz/check | `evidenciado` |
| F-07 / Agent Protocol | compatibilidade multi-versao real | `parcial` / `proposta` |
| F-08 / Chat runtime | documentacao/guardrail | `evidenciado` |
| F-08 / Chat runtime | entrypoint unico engine-side | `parcial` |
| F-09 / Git hygiene | audit/guardrail | `evidenciado` |
| F-09 / Git hygiene | limpeza do legado tracked ignored | `parcial` |
| F-10 / White-label runtime | gap formalizado | `evidenciado` |
| F-10 / White-label runtime | capacidades runtime correlatas | `parcial` |
| F-10 / White-label runtime | runtime completo futuro | `proposta` |

## Checks executados e saida real

### `pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 13,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/fase-3-dividas-documentadas-closure.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

### `pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 122323,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 356
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

### Checks/documentos relevantes reconfirmados

- `check:agent-protocol-compat-matrix` existe em `package.json` e esta ligado ao CI
- `check:chat-runtime-entrypoint-debt` existe em `package.json` e esta ligado ao CI
- `check:tracked-ignored-files` existe em `package.json` e esta ligado ao CI
- `check:docs-link-integrity` existe em `package.json` e esta ligado ao CI

## Gaps remanescentes

- `agent-protocol.v2` ainda nao existe como baseline/schema/evidencia publica
- launcher ainda nao consome entrypoint unico engine-side
- tracked ignored legacy ainda exige decisao posterior
- white-label runtime ainda nao tem `partnerId`, routing por parceiro nem segregacao por parceiro

## Decisao conservadora

- nao declarar F-07, F-08, F-09 ou F-10 como totalmente fechadas
- tratar a Fase 3 como fechamento de documentacao, evidencia e guardrails
- manter as capacidades estruturais remanescentes como `parcial` ou `proposta`
