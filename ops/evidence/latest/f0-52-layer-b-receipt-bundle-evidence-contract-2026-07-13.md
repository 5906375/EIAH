# F0.52 — layer B receipt/bundle evidence contract

## Data
2026-07-13

## Objetivo
Criar uma evidência documental/audit-only para a F0.52: contrato mínimo de evidência receipt/bundle para uma futura validação controlada da Camada B.

Esta etapa consolida F0.47, F0.48, F0.49, F0.50 e F0.51 em um contrato documental de evidência auditável, definindo os campos mínimos que um receipt/bundle futuro deverá conter para provar execução controlada, fail-closed, no-side-effect e rastreabilidade.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.51
- F0.51 presente no histórico recente de `main`
- `docs/EVIDENCE_INDEX.md` consistente
- `pnpm check:evidence-index` passando
- `pnpm check:w4-non-regression` passando
- a Camada B continua não autorizada para execução produtiva

## Escopo desta etapa

Esta etapa é audit-only/documental.

Não:

- implementa workflow;
- cria automação;
- altera `release.yml`;
- executa publish;
- usa `secrets` produtivos;
- faz registry login;
- faz Docker/GHCR push;
- cria tags/releases;
- autoriza a Camada B para execução produtiva.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md`
- `ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md`
- `ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md`
- `ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md`
- `ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md`

## Consolidação F0.47 -> F0.52

F0.47 confirmou que a Camada B ainda não está pronta para publish real e que a separação Camada A/Camada B permanece obrigatória.

F0.48 mapeou os negative paths e os `reasonCodes` mínimos para falha fechada.

F0.49 formalizou os critérios mínimos de readiness para qualquer gate futuro.

F0.50 descreveu um plano de controlled negative dry-run sem side effects externos.

F0.51 definiu critérios objetivos para classificar um futuro exercício como `no-side-effect`.

F0.52 acrescenta o contrato documental mínimo que uma futura evidência receipt/bundle deverá conter para sustentar auditoria, rastreabilidade e prova de fail-closed sem ambiguidade.

## Propósito do contrato de receipt/bundle

O objetivo do futuro receipt/bundle da Camada B não é provar publish real. O objetivo é provar, de forma auditável, que:

- o cenário foi controlado;
- a superfície foi explicitada;
- a tentativa foi fail-closed quando aplicável;
- nenhum boundary externo foi cruzado;
- nenhum side effect externo ocorreu;
- os owners, a janela e o rollback estavam rastreáveis;
- a decisão final permaneceu conservadora.

## Contrato mínimo do receipt

Um futuro `receipt` da Camada B deverá conter, no mínimo, os seguintes campos:

### 1. Identificação do exercício

- `receiptVersion`
- `scenarioId`
- `scenarioType`
- `executionMode`
- `createdAt`
- `commitSha`
- `branch`

Requisito:
- identificar univocamente qual cenário foi exercitado e em qual estado do repositório.

### 2. Escopo da superfície

- `surface`
- `targetVersion`
- `releaseIntent`
- `releaseAuthorized`

Requisito:
- deixar explícito que a superfície (`cli`, `api`, `workers` ou `multi_surface`) estava definida e que a execução produtiva continuava não autorizada.

### 3. Governança humana

- `technicalOwner`
- `operationalOwner`
- `operationalWindow`
- `rollbackReference`
- `hitlDecision`

Requisito:
- garantir rastreabilidade de responsabilidade e decisão humana.

### 4. Fail-closed e reason codes

- `expectedReasonCode`
- `observedReasonCode`
- `abortStage`
- `failClosed`
- `readinessNotEquivalentToRelease`

Requisito:
- provar onde o fluxo abortou, com qual razão e com qual leitura conservadora.

### 5. Prova de no-side-effect

- `publishAttempted`
- `registryLoginAttempted`
- `imagePushAttempted`
- `tagOrReleaseAttempted`
- `secretBoundaryCrossed`
- `externalSideEffectsDetected`

Requisito:
- todos os campos acima devem permanecer `false` para que o cenário seja classificado como `no-side-effect`.

### 6. Estado final do cenário

- `outcome`
- `decision`
- `notes`

Requisito:
- registrar se o cenário foi corretamente bloqueado e qual decisão conservadora decorre dele.

## Contrato mínimo do bundle

Um futuro `bundle` da Camada B deverá conter, no mínimo, os seguintes blocos:

### B1. Metadados do bundle

- `bundleVersion`
- `bundleCreatedAt`
- `bundleHash`
- `receiptRef`

### B2. Inputs do cenário

- parâmetros do cenário exercitado;
- superfície alvo;
- versão alvo;
- owners declarados;
- janela operacional declarada;
- referência de rollback declarada.

### B3. Saídas observadas

- `expectedReasonCode`
- `observedReasonCode`
- `abortStage`
- `failClosed`
- `decision`

### B4. Provas de no-side-effect

- evidência de `publishAttempted=false`
- evidência de `registryLoginAttempted=false`
- evidência de `imagePushAttempted=false`
- evidência de `tagOrReleaseAttempted=false`
- evidência de `secretBoundaryCrossed=false`
- evidência de `externalSideEffectsDetected=false`

### B5. Trilha de integridade

- resumo de logs relevantes;
- referência ao receipt;
- referência aos `reasonCodes`;
- referência ao checklist/critério aplicável;
- referência à decisão final.

## Invariantes mínimos obrigatórios

Para qualquer futuro receipt/bundle da Camada B, os seguintes invariantes devem permanecer verdadeiros:

1. `releaseAuthorized=false`
2. `publishAttempted=false`
3. `registryLoginAttempted=false`
4. `imagePushAttempted=false`
5. `tagOrReleaseAttempted=false`
6. `secretBoundaryCrossed=false`
7. `externalSideEffectsDetected=false`
8. `failClosed=true` quando o cenário for negativo
9. `readinessNotEquivalentToRelease=true`

Se qualquer um desses invariantes falhar, a evidência não deve ser aceita como prova de execução controlada da Camada B.

## Campos cuja ausência invalida a evidência

Um futuro receipt/bundle deve ser rejeitado como insuficiente se faltar qualquer um dos seguintes elementos:

- `scenarioId`
- `surface`
- `targetVersion`
- `technicalOwner`
- `operationalOwner`
- `rollbackReference`
- `expectedReasonCode`
- `observedReasonCode`
- `abortStage`
- `publishAttempted`
- `registryLoginAttempted`
- `imagePushAttempted`
- `tagOrReleaseAttempted`
- `secretBoundaryCrossed`
- `externalSideEffectsDetected`
- `decision`

## Relação com F0.48–F0.51

Este contrato documental deve permanecer compatível, no mínimo, com:

- os `reasonCodes` consolidados em F0.48;
- o checklist de readiness de F0.49;
- o plano de negative dry-run controlado de F0.50;
- os critérios de aceitação `no-side-effect` de F0.51.

## Exemplo de leitura auditável esperada

Uma futura evidência aceitável deve permitir afirmar, sem inferência extra:

- qual cenário foi exercitado;
- quem autorizou o exercício;
- qual superfície estava em análise;
- em que ponto o fluxo abortou;
- por qual `reasonCode`;
- que nenhum publish ocorreu;
- que nenhum login em registry ocorreu;
- que nenhum push de imagem ocorreu;
- que nenhuma `tag`/`release` foi criada;
- que nenhum `secret` produtivo cruzou boundary operacional;
- que a conclusão final permaneceu conservadora.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma futura etapa separada e autorizada que produza receipt/bundle compatíveis com este contrato, sem alterar a conclusão vigente.

Esta F0.52 não cria o receipt, não cria o bundle, não cria gate, não cria workflow e não autoriza execução produtiva.

Leitura correta após F0.52:

- a Camada B continua não autorizada para execução produtiva;
- `release.yml` produtivo continua intocado;
- futuras evidências da Camada B já têm contrato mínimo documental para receipt/bundle;
- ausência desses campos mínimos deve manter o status como parcial e não autorizável.

## Comandos executados

```bash
git status --short
git log --oneline -8
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
ls -la ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
ls -la ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|Camada B\|receipt\|bundle\|dry-run\|no-side-effect\|fail-closed\|reasonCode\|publish\|secrets\|GHCR\|tags" docs/EVIDENCE_INDEX.md
grep -n "receipt\|bundle\|side effect\|publish\|secrets\|registry\|GHCR\|Docker\|tags\|release\|fail-closed\|reasonCode\|Camada B" ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md
pnpm check:evidence-index
pnpm check:w4-non-regression
git diff --check
git diff -- .github/workflows/release.yml
git diff -- .github/workflows/release-activation-rollback-gate.yml
git diff -- .github/workflows/release-publish-preflight.yml
git diff -- .github/workflows/release-node22-readiness.yml
git diff -- .github/workflows/release-node22-validation-build-dry-run.yml
git diff -- package.json
git diff -- pnpm-lock.yaml
git diff -- apps
git diff -- packages
git diff -- scripts
git status --short
git diff --stat
```

## Resultados reais dos checks

`pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 175400,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 481
}
(node:14) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

`pnpm check:w4-non-regression`

```text
> eiah-builder@ check:w4-non-regression /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkW4NonRegression.ts

{
  "ok": true,
  "check": "check:w4-non-regression",
  "gates": {
    "hardMetricsGo": true,
    "nonRegressionGo": true,
    "reasons": []
  },
  "metrics": {
    "moduleActivationSuccessRatePct": 100,
    "moduleActivationP95Seconds": 8,
    "timeToFirstRunP95Minutes": 14,
    "receiptCoveragePct": 100,
    "crossTenantAuthFailures": 0,
    "duplicateSideEffects": 0
  },
  "template": "ops/verticals/template/vertical-template.md",
  "onboarding": "ops/verticals/vertical-onboarding-checklist.md",
  "evidenceRefs": [
    "ops/evidence/latest/interop-e2e-agent-call-2026-05-14.json",
    "ops/evidence/latest/pou-gated-payment-e2e-2026-07-13.json",
    "ops/evidence/latest/realestate-high-actions-e2e-2026-05-14.json",
    "ops/evidence/latest/realestate-commission-settlement-e2e-2026-07-13.json"
  ]
}
(node:14) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

`git diff --check`

```text
sem saída
```

## Prova de isolamento

Os diffs abaixo devem permanecer sem saída:

- `git diff -- .github/workflows/release.yml`
- `git diff -- .github/workflows/release-activation-rollback-gate.yml`
- `git diff -- .github/workflows/release-publish-preflight.yml`
- `git diff -- .github/workflows/release-node22-readiness.yml`
- `git diff -- .github/workflows/release-node22-validation-build-dry-run.yml`
- `git diff -- package.json`
- `git diff -- pnpm-lock.yaml`
- `git diff -- apps`
- `git diff -- packages`
- `git diff -- scripts`

`git status --short` após o diff

```text
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
