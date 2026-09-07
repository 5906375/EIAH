# ADR-002 v2-r3 — Validação documental executada

- Status: validação parcial; links e testes do validador passaram, mas o validador do índice falha em duas referências preexistentes a dependências não instaladas. Arquitetura PROPOSTA.
- Base: `11805d1934573281e2787c2442b546c172b76947`.
- Coleta UTC: `2026-09-05T15:41:41.282830+00:00`.
- Agente executor: Codex.
- Node: `v22.17.1`; loader TSX da instalação local existente. Não houve instalação, build ou alteração de dependências no worktree original.
- Conteúdo do ADR identificado por SHA-256: `13f6c01d3fb5fc739d0cc1b2a844a302a2bd7cbcdc1810f746109c20885e4431`.
- As verificações nativas de links cobrem seus alvos canônicos preexistentes; a conferência adicional verificou os links dos três documentos novos.
- Falha de base: antes de alterar o índice, seu git hash-object era igual a HEAD:docs/EVIDENCE_INDEX.md. O validador retornou duas referências ausentes: packages/core/node_modules/@eiah e packages/db/node_modules. A inclusão deste registro não corrige essa dependência ambiental nem mascara o resultado.
- Conferência adicional: 9 links internos válidos; 6 referências de seção acompanhadas de nota explicativa; oito caminhos POST observados correspondem à matriz; hash do registro corresponde ao ADR.
- Checkout estrutural: HEAD, status e hashes dos arquivos pendentes preservados durante a preparação.
- Não comprova autorização operacional, execução de handlers Guardian, testes de worker, ratificação humana ou liberação de piloto. CI de runner limpo será observado no PR.

## Resultados brutos dos comandos

### node --version

Exit code: 0.

```text
v22.17.1
```

### node --import /home/jusall/projects/EIAH_BUILDER/node_modules/tsx/dist/loader.mjs scripts/checkDocsLinkIntegrity.ts

Exit code: 0.

```text
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 23,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md",
    "docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/chat-vertical-handoff-v2-shadow.md",
    "docs/architecture/chat-vertical-handoff-v2.md",
    "docs/architecture/chat-vertical-imob-preflight-playbook.md",
    "docs/architecture/db-contract-lifecycle-decisions-v1.md",
    "docs/architecture/db-contract-lifecycle-v1.md",
    "docs/architecture/existing-structure-preflight.md",
    "docs/architecture/fase-3-dividas-documentadas-closure.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/mcp-contract-v1.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/vertical-context-imob.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
```

### node --import /home/jusall/projects/EIAH_BUILDER/node_modules/tsx/dist/loader.mjs --test scripts/tests/checkEvidenceIndex.test.ts

Exit code: 0.

```text
TAP version 13
# Subtest: rejects local and temporary evidenceRef locations
ok 1 - rejects local and temporary evidenceRef locations
  ---
  duration_ms: 1.231883
  type: 'test'
  ...
# Subtest: allows repository paths, commit anchors, and remote HTTP artifacts
ok 2 - allows repository paths, commit anchors, and remote HTTP artifacts
  ---
  duration_ms: 0.181489
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 201.135777
```

### node --import /home/jusall/projects/EIAH_BUILDER/node_modules/tsx/dist/loader.mjs scripts/checkEvidenceIndex.ts

Exit code: 1.

```text
{
  "ok": false,
  "check": "check:evidence-index",
  "message": "EVIDENCE_INDEX has missing file references",
  "details": {
    "missingCount": 2,
    "missingRefs": [
      "packages/core/node_modules/@eiah",
      "packages/db/node_modules"
    ]
  }
}
```

## Evidence Index após inclusão desta evidência

```text
{
  "ok": false,
  "check": "check:evidence-index",
  "message": "EVIDENCE_INDEX has missing file references",
  "details": {
    "missingCount": 2,
    "missingRefs": [
      "packages/core/node_modules/@eiah",
      "packages/db/node_modules"
    ]
  }
}
```
