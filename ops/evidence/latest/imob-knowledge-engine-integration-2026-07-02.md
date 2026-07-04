# IMOB Knowledge Engine Integration - 2026-07-02

## Data

- 2026-07-02

## Arquivos lidos

- `IA_EIAH.md`
- `CLAUDE.md`
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `knowledge/imob/README.md`
- `knowledge/imob/manifest.v1.json`
- `knowledge/imob/categories/playbooks/captacao-basics.v1.json`
- `knowledge/imob/categories/checklists/locacao-checklist.v1.json`
- `knowledge/imob/categories/templates/briefing-visita.v1.json`
- `knowledge/imob/categories/policies/atendimento-inicial.v1.json`
- `knowledge/imob/categories/glossary/termos-operacionais.v1.json`
- `apps/api/src/services/imob/imobKnowledgeBaseLoader.ts`
- `apps/api/src/tests/imob-knowledge-base-loader.test.ts`
- `apps/api/src/services/imob/imobKnowledgeSearch.ts`
- `apps/api/src/services/knowledgeGate.ts`
- `apps/api/src/tests/imob.knowledge.search.contract.test.ts`
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`

## Arquivos criados ou alterados

- `apps/api/src/services/imob/imobKnowledgeEngine.ts`
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/tests/imob-knowledge-engine-integration.test.ts`

## Ponto engine-side integrado

- Integração aditiva no branch `search_knowledge` de `apps/api/src/services/imob/imobTurnResolver.ts`.
- O resolver agora consulta `resolveImobKnowledgeContext(...)`, que reaproveita o loader do PR-11.
- O retorno carrega `knowledgeContext` governado e auditável sem depender do `ChatAgentLauncher`.

## Exemplos de intenção -> entry

- captação -> `imob.playbook.captacao-basics.v1`
- locação/documentos -> `imob.checklist.locacao-checklist.v1`
- visita/briefing -> `imob.template.briefing-visita.v1`
- atendimento inicial/triagem -> `imob.policy.atendimento-inicial.v1`
- glossário/termos -> `imob.glossary.termos-operacionais.v1`

## Prova de tratamento de temas sensíveis

- preço/valuation passam a gerar `knowledgeContext.mode = human_review_required`
- contrato final passa a bloquear uso automático de finalização por `blockedAutomaticUses`
- o contexto preserva `requiresHumanReview`, `disallowedUses`, `source`, `lastUpdated` e `provenance`
- a apresentação engine-side degrada para orientação segura, sem decisão automática proibida

## Confirmação de não alteração do ChatAgentLauncher

- nenhum arquivo em `apps/web` foi alterado
- nenhuma referência a `ChatAgentLauncher` foi adicionada no adapter engine-side
- nenhuma regra cognitiva nova foi movida para o launcher

## Confirmação de sem UX ampla

- não houve mudança estrutural de UI
- a alteração ficou restrita ao payload engine-side (`knowledgeContext`) e a copy segura do branch `search_knowledge` quando o tema é sensível

## Teste específico da integração engine-side

Comando:

```bash
node --import tsx --test apps/api/src/tests/imob-knowledge-engine-integration.test.ts
```

Saída real:

```text
TAP version 13
# Subtest: apps/api/src/tests/imob-knowledge-engine-integration.test.ts
ok 1 - apps/api/src/tests/imob-knowledge-engine-integration.test.ts
  ---
  duration_ms: 299.845811
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
# duration_ms 306.273526
```

Cobertura verificada pelo teste:

- captação -> playbook
- locação/documentos -> checklist
- visita -> briefing
- atendimento/triagem -> policy
- glossário -> glossary
- preço/valuation -> sem decisão automática + human review
- contrato final -> sem finalização automática
- provenance/source presentes
- KB ausente -> erro controlado
- `ChatAgentLauncher` não alterado

## Teste do loader impactado

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
  duration_ms: 250.218394
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
# duration_ms 256.701123
```

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
  "sizeChars": 123755,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 359
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

## Gaps pendentes

- o consumo segue restrito ao branch `search_knowledge`; ainda não há rollout controlado `shadow -> pilot -> small`
- não há busca vetorial, ingestão automática ou sync pipeline novo
- a UI ainda não expõe `knowledgeContext` de forma dedicada; o payload permanece principalmente governança/back-end

## Status conservador

- `evidenciado` para a integração engine-side governada, o tratamento sensível, os testes focados, o reuso do loader e a evidência indexável
