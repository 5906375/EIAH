# IMOB Knowledge Loader Shadow - 2026-07-02

## Data

- 2026-07-02

## Arquivos lidos

- `CLAUDE.md`
- `CODEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `knowledge/imob/README.md`
- `knowledge/imob/manifest.v1.json`
- `knowledge/imob/schema/imob-knowledge-entry.v1.schema.json`
- `knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json`
- `knowledge/imob/categories/playbooks/captacao-basics.v1.json`
- `knowledge/imob/categories/checklists/locacao-checklist.v1.json`
- `knowledge/imob/categories/templates/briefing-visita.v1.json`
- `knowledge/imob/categories/policies/atendimento-inicial.v1.json`
- `knowledge/imob/categories/glossary/termos-operacionais.v1.json`
- `scripts/checkImobKnowledgeBase.ts`
- `apps/api/src/services/imob/imobKnowledgeSearch.ts`
- `apps/api/src/services/knowledgeGate.ts`
- `apps/api/src/tests/imob.knowledge.search.contract.test.ts`

## Arquivos criados ou alterados

- `apps/api/src/services/imob/imobKnowledgeBaseLoader.ts`
- `apps/api/src/tests/imob-knowledge-base-loader.test.ts`
- `scripts/checkImobKnowledgeBase.ts`

## Comportamento do loader

- Carrega a KB IMOB a partir de `knowledge/imob/manifest.v1.json`.
- Resolve paths de manifesto, schemas e entries sem fallback implícito.
- Valida fail-closed manifesto e entries antes de devolver o resultado.
- Preserva os campos de governança de cada entry:
  - `source`
  - `lastUpdated`
  - `riskLevel`
  - `requiresHumanReview`
  - `allowedScopes`
  - `disallowedUses`
- Rejeita manifesto ausente/inválido e entry ausente/inválida com erro explícito `ImobKnowledgeBaseLoaderError`.

## Shadow mode

- O loader expõe snapshot auditável por `buildImobKnowledgeBaseShadowSnapshot(...)`.
- O snapshot retorna `shadowMode: true`, resumo por categoria e metadados governados.
- O snapshot não injeta `userFacingResponse` nem altera payload final de UX/chat.

## Confirmacao de nao alteracao de UX/launcher

- Nenhum import ou edição em `ChatAgentLauncher`.
- Nenhuma alteração em `apps/web`.
- Nenhum consumo automático da KB no runtime de resposta final.
- O uso no PR ficou restrito ao loader engine-side, teste focado e reutilização do check documental da KB.

## Teste focado do loader

Comando:

```bash
node --import tsx --test apps/api/src/tests/imob-knowledge-base-loader.test.ts
```

Saída real:

```text
TAP version 13
# Subtest: apps/api/src/tests/imob-knowledge-base-loader.test.ts
ok 1 - apps/api/src/tests/imob-knowledge-base-loader.test.ts
  ---
  duration_ms: 386.609813
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 400.908255
```

Cobertura verificada pelo teste:

- loader carrega as 5 entries seed válidas;
- preserva `riskLevel`, `requiresHumanReview`, `allowedScopes` e `disallowedUses`;
- falha fechado se o manifesto estiver ausente ou inválido;
- falha fechado se uma entry listada não existir;
- shadow mode retorna resultado auditável sem alterar resposta final;
- o código do loader não referencia `ChatAgentLauncher`.

## Check da KB IMOB

Comando:

```bash
pnpm check:imob-knowledge-base
```

Saída real:

```text
> eiah-builder@ check:imob-knowledge-base /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkImobKnowledgeBase.ts

(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
{
  "ok": true,
  "check": "check:imob-knowledge-base",
  "kbRoot": "knowledge/imob",
  "manifest": "knowledge/imob/manifest.v1.json",
  "entryCount": 5,
  "categories": [
    "playbooks",
    "policies",
    "templates",
    "glossary",
    "checklists"
  ],
  "filesValidated": [
    "knowledge/imob/categories/checklists/locacao-checklist.v1.json",
    "knowledge/imob/categories/glossary/termos-operacionais.v1.json",
    "knowledge/imob/categories/playbooks/captacao-basics.v1.json",
    "knowledge/imob/categories/policies/atendimento-inicial.v1.json",
    "knowledge/imob/categories/templates/briefing-visita.v1.json"
  ],
  "schemas": [
    "knowledge/imob/schema/imob-knowledge-entry.v1.schema.json",
    "knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json"
  ]
}
```

## Checks documentais

Comandos:

```bash
pnpm check:docs-link-integrity
pnpm check:evidence-index
```

Saídas reais:

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
(Use `node --trace-warnings ...` to show where the warning was created)

> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 123287,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 358
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

## Gaps pendentes

- O loader ainda opera apenas em shadow mode; não há integração governada no engine de resposta final neste PR.
- Não há busca vetorial, ingestão automática ou seleção runtime por policy neste passo.
- A KB continua dependente do manifesto seed atual; expansão de conteúdo e integração governada ficam para PR posterior.

## Status conservador

- `evidenciado` para loader determinístico, shadow snapshot, teste focado e check da KB reaproveitado.
- A integração governada via engine continua fora deste PR.
