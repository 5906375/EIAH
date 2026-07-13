# F0.51 — layer B no-side-effect acceptance criteria

## Data
2026-07-13

## Objetivo
Criar uma evidência documental/audit-only para a F0.51: critérios de aceitação de no-side-effect para uma futura validação controlada da Camada B.

Esta etapa consolida F0.47, F0.48, F0.49 e F0.50 em critérios objetivos para provar ausência de side effects externos antes de qualquer futuro dry-run controlado, sem implementar workflow, sem criar automação e sem alterar qualquer superfície produtiva.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.50
- F0.50 presente no histórico recente de `main`
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

## Consolidação F0.47 -> F0.51

F0.47 estabeleceu que a Camada B possui readiness documental crescente, mas ainda não tem autorização para publish real.

F0.48 mapeou os negative paths, os critérios fail-closed e os `reasonCodes` mínimos para recusar promoção inadequada.

F0.49 converteu isso em um checklist mínimo para um gate futuro.

F0.50 transformou esse material em um plano de future controlled negative dry-run sem side effects externos.

F0.51 acrescenta o critério de aceitação objetivo que um futuro exercício controlado deverá satisfazer para ser legitimamente classificado como `no-side-effect`.

## Definição operacional de no-side-effect

Para a Camada B, `no-side-effect` significa que uma futura validação controlada:

- não publica pacote;
- não autentica em registry;
- não faz push para GHCR/Docker;
- não cria `tag` ou `release`;
- não consome `secret` produtivo para execução externa;
- não materializa mutação externa irreversível;
- aborta cedo e de forma auditável quando um pré-requisito crítico falta;
- deixa trilha verificável de que a recusa ocorreu antes de qualquer boundary externo.

## Critérios objetivos de aceitação

### A1 — zero publish real

Aceitação:

- nenhum passo do exercício pode executar `npm publish` ou `pnpm publish`;
- nenhum artefato pode ser promovido a registry externo;
- o log da etapa deve permitir afirmar `publish_attempted=false`.

Falha:

- qualquer indício de execução real de publish invalida o exercício como `no-side-effect`.

### A2 — zero registry login

Aceitação:

- nenhum passo pode executar `docker/login-action`, `docker login` ou equivalente;
- o log da etapa deve permitir afirmar `registry_login_attempted=false`.

Falha:

- qualquer autenticação externa invalida o exercício.

### A3 — zero GHCR/Docker push

Aceitação:

- nenhum passo pode fazer push de imagem;
- o exercício deve permitir afirmar `image_push_attempted=false`.

Falha:

- qualquer promoção real de imagem invalida a classificação.

### A4 — zero `tags/releases`

Aceitação:

- nenhum passo pode criar `tag`;
- nenhum passo pode abrir `release`;
- o log deve permitir afirmar `tag_or_release_attempted=false`.

Falha:

- qualquer mutação de `tag`/`release` invalida o exercício.

### A5 — zero uso operacional de `secrets` produtivos

Aceitação:

- o exercício deve abortar antes de consumir `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `REGISTRY_PAT` ou segredo equivalente em boundary externo;
- a trilha deve permitir afirmar `secret_boundary_crossed=false`.

Falha:

- qualquer consumo operacional de secret produtivo invalida o exercício.

### A6 — abort precoce e auditável

Aceitação:

- a recusa deve ocorrer antes do primeiro boundary externo;
- o ponto de abort deve estar identificado;
- o `reasonCode` deve estar explícito;
- o cenário deve ser reconstituível por log/evidência.

Falha:

- abort tardio, opaco ou sem `reasonCode` invalida o exercício.

### A7 — fail-closed verificável

Aceitação:

- a ausência de versão, superfície, owners, janela, rollback ou boundary de secrets deve resultar em bloqueio explícito;
- o bloqueio deve aderir aos `reasonCodes` já consolidados em F0.48/F0.50.

Falha:

- qualquer fallback permissivo ou comportamento ambíguo invalida o exercício.

### A8 — zero equivalência indevida entre readiness e release

Aceitação:

- a trilha deve afirmar explicitamente que readiness/preflight/gate sem side effects não equivalem a promoção produtiva;
- o cenário deve poder registrar `readiness_not_equivalent_to_release=true`.

Falha:

- qualquer inferência de que verde documental autoriza publish invalida o exercício.

### A9 — escopo e owners rastreáveis

Aceitação:

- a superfície do cenário deve estar explícita (`cli`, `api`, `workers` ou `multi_surface`);
- owner técnico e owner operacional devem estar informados;
- a janela operacional e a referência de rollback devem estar presentes ou, se ausentes, produzir o bloqueio esperado.

Falha:

- cenário sem escopo, owners ou rollback rastreáveis não atende `no-side-effect` verificável.

### A10 — evidência mínima reexecutável

Aceitação:

- o futuro exercício deve gerar evidência suficiente para reconstituir:
  - cenário;
  - expectativa;
  - `reasonCode`;
  - ponto de abort;
  - prova de zero side effects externos.

Falha:

- se a evidência não permitir auditoria posterior, a classificação `no-side-effect` não deve ser aceita.

## Matriz de provas mínimas esperadas

Uma futura validação controlada só poderá ser considerada aceita como `no-side-effect` se produzir, no mínimo:

1. `scenarioId` explícito;
2. superfície alvo;
3. `reasonCode` esperado;
4. `reasonCode` observado;
5. `abortStage` explícito;
6. `publish_attempted=false`;
7. `registry_login_attempted=false`;
8. `image_push_attempted=false`;
9. `tag_or_release_attempted=false`;
10. `secret_boundary_crossed=false`;
11. owner técnico;
12. owner operacional;
13. referência de rollback aplicável;
14. decisão conservadora final.

## Relação com os `reasonCodes` já consolidados

Os critérios de aceitação acima devem continuar aderentes, no mínimo, a:

- `RELEASE_VERSION_INVALID`
- `RELEASE_SURFACE_UNSPECIFIED`
- `TECHNICAL_OWNER_REQUIRED`
- `OPERATIONAL_OWNER_REQUIRED`
- `OPERATIONAL_WINDOW_INVALID`
- `ROLLBACK_REFERENCE_REQUIRED`
- `SECRET_BOUNDARY_NOT_APPROVED`
- `REGISTRY_LOGIN_NOT_AUTHORIZED`
- `CLI_PUBLISH_NOT_IDEMPOTENT`
- `LATEST_TAG_PROMOTION_BLOCKED`
- `RETRY_POLICY_MISSING`
- `ROLLBACK_NOT_SURFACE_SCOPED`
- `TAG_PROMOTION_NOT_AUTHORIZED`
- `READINESS_NOT_EQUIVALENT_TO_RELEASE`

## Condições de rejeição imediata

Um futuro dry-run controlado da Camada B deve ser rejeitado como `no-side-effect` se qualquer uma das condições abaixo ocorrer:

- publish executado;
- login em registry executado;
- push de imagem executado;
- `tag` ou `release` criada;
- uso operacional de secret produtivo;
- ausência de `reasonCode` explícito;
- ausência de ponto de abort;
- ausência de prova de zero side effects externos;
- cenário sem owners ou sem rollback rastreável;
- equivalência indevida entre readiness verde e release produtivo.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma futura etapa separada e autorizada que prove esses critérios de aceitação sem alterar a conclusão vigente.

Esta F0.51 não cria o dry-run, não cria gate, não cria workflow e não autoriza execução produtiva.

Leitura correta após F0.51:

- a Camada B continua não autorizada para execução produtiva;
- `release.yml` produtivo continua intocado;
- `no-side-effect` agora possui critérios objetivos mínimos para futura validação controlada;
- qualquer falha em atender esses critérios deverá manter o status como parcial e não autorizável.

## Comandos executados

```bash
git status --short
git log --oneline -8
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
ls -la ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|Camada B\|negative\|fail-closed\|reasonCode\|dry-run\|publish\|secrets\|GHCR\|tags\|rollback" docs/EVIDENCE_INDEX.md
grep -n "side effect\|publish\|secrets\|registry\|GHCR\|Docker\|tags\|release\|fail-closed\|reasonCode\|Camada B" ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
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
  "sizeChars": 174807,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 480
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
?? ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
