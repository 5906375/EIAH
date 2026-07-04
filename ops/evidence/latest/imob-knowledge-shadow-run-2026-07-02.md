# IMOB Knowledge Shadow Run - 2026-07-02

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
- `docs/ops/imob-knowledge-rollout-shadow-pilot-small.md`
- `apps/api/src/services/imob/imobKnowledgeEngine.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/imobKnowledgeBaseLoader.ts`
- `knowledge/imob/manifest.v1.json`
- `apps/api/src/tests/imob-knowledge-engine-integration.test.ts`
- `apps/api/src/tests/imob-knowledge-base-loader.test.ts`

## Arquivos criados ou alterados

- `scripts/runImobKnowledgeShadow.ts`
- `package.json`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json`

## Cenários executados

- captação
- locação/documentos
- visita/briefing
- atendimento inicial/triagem
- glossário/termos
- preço/valuation
- contrato final
- aprovação/decisão financeira
- pergunta sem match esperado
- entitlement/scope negado

## Runner/check do shadow

Comando:

```bash
pnpm check:imob-knowledge-shadow
```

Artefato JSON gerado:

- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json`

Saída real:

```text
> eiah-builder@ check:imob-knowledge-shadow /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/runImobKnowledgeShadow.ts --out ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json

{
  "ok": true,
  "check": "check:imob-knowledge-shadow",
  "generatedAt": "2026-07-02",
  "totalScenarios": 10,
  "matchedScenarios": 8,
  "noMatchScenarios": 1,
  "sensitiveScenarios": 3,
  "metrics": {
    "kbMatchRate": 0.8,
    "kbNoMatchRate": 0.1,
    "sensitiveBlockRate": 1,
    "humanReviewRequiredRate": 1,
    "provenanceCoverage": 1,
    "entitlementDeniedRate": 0.1,
    "knowledgeContextErrorRate": 0,
    "userFacingRegressionCount": 0,
    "auditGap": 0,
    "duplicateSideEffects": 0
  },
  "gates": {
    "provenanceCoverage100": true,
    "knowledgeContextErrorRateZero": true,
    "auditGapZero": true,
    "duplicateSideEffectsZero": true,
    "userFacingRegressionCountZero": true,
    "sensitiveNoAutomaticDecision": true,
    "chatAgentLauncherUntouched": true,
    "rollbackDocumented": true
  }
}
```

## Métricas calculadas

- `kbMatchRate = 0.8`
- `kbNoMatchRate = 0.1`
- `sensitiveBlockRate = 1`
- `humanReviewRequiredRate = 1`
- `provenanceCoverage = 1`
- `entitlementDeniedRate = 0.1`
- `knowledgeContextErrorRate = 0`
- `userFacingRegressionCount = 0`
- `auditGap = 0`
- `duplicateSideEffects = 0`

## Gates avaliados

- `provenanceCoverage = 100%` para matches: `pass`
- `knowledgeContextErrorRate = 0`: `pass`
- `auditGap = 0`: `pass`
- `duplicateSideEffects = 0`: `pass`
- `userFacingRegressionCount = 0`: `pass`
- nenhum tema sensível respondido como decisão automática: `pass`
- `ChatAgentLauncher` inalterado: `pass`
- rollback documentado/referenciado: `pass`

Resultado geral do shadow:

- `verde`

## Confirmação de não alteração de ChatAgentLauncher/apps/web

- nenhum arquivo em `apps/web` foi alterado
- nenhuma alteração em `ChatAgentLauncher`
- nenhuma mudança de UX foi introduzida neste PR

## Confirmação de não ativação de pilot/small

- nenhum tenant/workspace foi promovido para `pilot`
- nenhum tenant/workspace foi promovido para `small`
- o shadow run permaneceu estritamente controlado e determinístico

## Teste de integração engine-side da KB

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
  duration_ms: 369.708632
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
# duration_ms 379.377829
```

## Teste do loader

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
  duration_ms: 299.559441
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
# duration_ms 308.648251
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
  "sizeChars": 124651,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 362
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

## Riscos residuais

- o shadow verde ainda nao substitui um `pilot` com observabilidade por tenant/workspace real
- `kbNoMatchRate = 0.1` mostra um caso sem match governado; isso nao e falha do runner, mas indica necessidade futura de observar lacunas de cobertura do acervo
- a instrumentacao continua em runner controlado; ainda nao ha ciclo operacional recorrente automatizado

## Recomendação conservadora

- autorizável preparar `pilot` controlado
- não autoriza ativação automática de `pilot`
- manter promoção condicionada a evidência por tenant/workspace e revisão humana dos casos sensíveis

## Status conservador

- shadow run: `evidenciado`
- prontidão para pilot: `parcial`
- pilot/small executados: `proposta`
