# IMOB Knowledge Pilot Readiness - 2026-07-02

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
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json`
- `scripts/runImobKnowledgeShadow.ts`
- `apps/api/src/services/imob/imobKnowledgeEngine.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`

## Arquivos criados ou alterados

- `docs/ops/imob-knowledge-pilot-readiness.md`

## Resumo da evidência herdada do shadow

Estado herdado do shadow run:

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

Leitura conservadora:

- o shadow run ficou verde;
- a integracao engine-side esta apta para readiness documental de `pilot`;
- isso nao significa ativacao do `pilot` neste PR.

## Critérios de elegibilidade definidos

- `tenantId` explicitamente listado;
- `workspaceId` explicitamente listado;
- IMOB instalado e entitlement valido;
- owner operacional definido;
- owner tecnico definido;
- trilha de revisao humana definida para temas sensiveis;
- estrategia de evidencia por tenant/workspace definida antes da ativacao.

## Gates definidos

Gates de entrada:

- shadow run verde;
- `provenanceCoverage = 100%`;
- `knowledgeContextErrorRate = 0`;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- `userFacingRegressionCount = 0`;
- tenant/workspace listados;
- entitlement/scope validados;
- rollback documentado;
- owners definidos;
- revisao humana definida.

Gates de permanencia:

- `provenanceCoverage = 100%`;
- `knowledgeContextErrorRate = 0`;
- `userFacingRegressionCount = 0`;
- nenhum tema sensivel sem revisao humana;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- evidencia por tenant/workspace em cada ciclo.

## Rollback definido

- voltar para `shadow-only`;
- desabilitar a KB;
- manter `search_knowledge` sem `knowledgeContext`;
- aplicar fail-closed no tenant/workspace afetado.

Gatilhos:

- queda de provenance;
- erro de `knowledgeContext`;
- regressao user-facing;
- uso indevido em preco, valuation, contrato, aprovacao ou decisao financeira;
- falha de entitlement/scope;
- ausencia de evidencia por tenant/workspace;
- alteracao indevida em `ChatAgentLauncher` ou `apps/web`.

## Confirmações obrigatórias

- `pilot` nao foi ativado neste PR;
- `small` nao foi ativado neste PR;
- `ChatAgentLauncher` nao foi alterado;
- `apps/web` nao foi alterado.

## Checks executados

### `pnpm check:imob-knowledge-shadow`

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

### `pnpm check:imob-knowledge-base`

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
(Use `node --trace-warnings ...` to show where the warning was created)
```

### `pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 125156,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 363
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

## Status conservador

- pacote documental de `pilot readiness`: `evidenciado`
- `pilot` operacional: `parcial`
- `small`: `proposta`
