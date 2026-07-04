# IMOB Knowledge Pilot Activation Gate - 2026-07-02

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
- `docs/ops/imob-knowledge-pilot-readiness.md`
- `ops/evidence/latest/imob-knowledge-pilot-readiness-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json`
- `scripts/runImobKnowledgeShadow.ts`
- `apps/api/src/services/imob/imobKnowledgeEngine.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`

## Arquivos criados ou alterados

- `docs/ops/imob-knowledge-pilot-activation-gate.md`
- `docs/EVIDENCE_INDEX.md`

## Readiness herdado

Evidencia herdada do shadow e da readiness:

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

Conclusao conservadora:

- shadow run verde herdado;
- readiness documental herdada;
- ativacao real continua bloqueada sem `tenant/workspace` e owners reais.

## Tenant/workspace allowlist ou pendencia explicita

- `PENDING_REAL_TENANT_SELECTION`
- nenhum `tenantId` real foi definido neste PR;
- nenhum `workspaceId` real foi definido neste PR;
- a ativacao futura exige allowlist explicita e verificavel.

## Owners ou pendencia explicita

- `PENDING_REAL_OWNER_ASSIGNMENT`
- owner tecnico real nao foi definido neste PR;
- owner operacional real nao foi definido neste PR;
- owner de evidencia real nao foi definido neste PR.

## Gates definidos

Gates minimos para ativacao futura:

- `tenant/workspace` explicitamente listados;
- entitlement/scope validados;
- owner tecnico definido;
- owner operacional definido;
- shadow run verde;
- readiness evidenciado;
- rollback documentado;
- revisao humana definida para sensiveis;
- `provenanceCoverage = 100%`;
- `knowledgeContextErrorRate = 0`;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- `userFacingRegressionCount = 0`;
- `ChatAgentLauncher` e `apps/web` inalterados.

## Rollback definido

Rollback aceito:

- voltar para `shadow-only`;
- desabilitar a KB;
- manter `search_knowledge` sem `knowledgeContext`;
- aplicar fail-closed no `tenant/workspace` afetado.

## Confirmacao de nao ativacao do pilot

- `pilot` nao foi ativado;
- `small` nao foi ativado;
- `ChatAgentLauncher` nao foi alterado;
- `apps/web` nao foi alterado.

## Saidas reais dos checks

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
  "filesChecked": 13
}
```

### `pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 125714,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 364
}
```

## Status conservador

- pacote documental de activation gate: `evidenciado`
- ativacao operacional do `pilot`: `parcial`
- `small`: `proposta`
