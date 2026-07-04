# IMOB Knowledge Rollout Plan - 2026-07-02

## Data

- 2026-07-02

## Documentos e arquivos lidos

- `IA_EIAH.md`
- `CLAUDE.md`
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/imob-knowledge-base-v1-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-loader-shadow-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-engine-integration-2026-07-02.md`
- `apps/api/src/services/imob/imobKnowledgeEngine.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/imobKnowledgeBaseLoader.ts`
- `knowledge/imob/manifest.v1.json`

## Arquivos criados ou alterados

- `docs/ops/imob-knowledge-rollout-shadow-pilot-small.md`

## Resumo do plano

- formaliza a promocao `shadow -> pilot -> small` da IMOB KB sem ativacao real neste PR;
- preserva o modelo `agent-driven`, com engine decidindo e launcher render-only;
- mantem `search_knowledge` como unico ponto de integracao atual;
- exige observabilidade por `tenant/workspace`, provenance completa e degradacao segura para temas sensiveis;
- define rollback explicito para `shadow-only`, `KB disabled` ou `search_knowledge sem knowledgeContext`.

## Gates definidos

Gates para sair de shadow:

- `provenanceCoverage = 100%` para todos os matches;
- `knowledgeContextErrorRate = 0` em ciclo controlado;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- nenhum tema sensivel respondido como decisao automatica;
- `ChatAgentLauncher` sem alteracao;
- rollback documentado.

Gates para sair de pilot:

- nenhuma regressao critica;
- revisao humana dos casos sensiveis;
- logs/evidencias por tenant/workspace;
- rollback validado;
- aprovacao operacional explicita.

## Metricas definidas

- `kbMatchRate`
- `kbNoMatchRate`
- `sensitiveBlockRate`
- `humanReviewRequiredRate`
- `provenanceCoverage`
- `entitlementDeniedRate`
- `knowledgeContextErrorRate`
- `userFacingRegressionCount`
- `auditGap`
- `duplicateSideEffects`

## Rollback definido

- voltar para `shadow-only`;
- desabilitar a KB;
- preservar `search_knowledge` sem `knowledgeContext`;
- aplicar modo seguro fail-closed equivalente se a KB nao puder ser garantida.

## Status conservador

- plano de rollout: `evidenciado`
- shadow/pilot/small executados: nao, permanecem `parcial/proposta`

## Checks executados

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
  "sizeChars": 124180,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 360
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```
