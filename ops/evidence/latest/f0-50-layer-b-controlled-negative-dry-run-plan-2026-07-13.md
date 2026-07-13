# F0.50 — layer B controlled negative dry-run plan

## Data
2026-07-13

## Objetivo
Criar uma evidência documental/audit-only para a F0.50: plano de controlled negative dry-run futuro da Camada B.

Esta etapa consolida F0.47, F0.48 e F0.49 em um plano verificável de cenários negativos futuros, reasonCodes esperados, critérios fail-closed e evidência futura mínima, sem implementar workflow, sem automação e sem qualquer side effect externo.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.49
- F0.49 presente no histórico recente de `main`
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

## Consolidação documental F0.47 -> F0.50

F0.47 confirmou que a Camada B tem readiness documental crescente, mas ainda não tem autorização para publish real.

F0.48 mapeou os negative paths, os critérios fail-closed e os reasonCodes mínimos para bloquear promoção inadequada.

F0.49 converteu esse material em um checklist mínimo para qualquer gate futuro.

F0.50 acrescenta o próximo nível documental: um plano controlado de future negative dry-run, isto é, uma trilha futura de validações negativas deliberadas e sem side effects, desenhada para provar que os bloqueios da Camada B continuam íntegros antes de qualquer discussão sobre execução produtiva.

## Princípio do controlled negative dry-run

O future controlled negative dry-run da Camada B deve:

- ser manual ou controlado por etapa futura dedicada;
- permanecer sem publish real;
- permanecer sem uso de `secrets` produtivos;
- permanecer sem registry login;
- permanecer sem push para GHCR/Docker;
- permanecer sem `tags/releases`;
- falhar fechado ao primeiro pré-requisito ausente;
- produzir evidência auditável por cenário negativo exercitado.

## Matriz de cenários negativos futuros

### CN-01 — versão alvo ausente ou inválida

- Falha simulada futura:
  - `target_version` ausente, malformada ou incompatível com promoção controlada
- ReasonCode esperado:
  - `RELEASE_VERSION_INVALID`
- Critério fail-closed:
  - abortar antes de qualquer preparação de publish, login ou seleção final de superfície
- Evidência futura mínima:
  - log do valor recusado
  - confirmação explícita de zero side effects externos

### CN-02 — superfície de promoção ausente ou ambígua

- Falha simulada futura:
  - ausência de escolha explícita entre `cli`, `api`, `workers` ou `multi_surface`
- ReasonCode esperado:
  - `RELEASE_SURFACE_UNSPECIFIED`
- Critério fail-closed:
  - abortar antes de qualquer plano candidato de promoção
- Evidência futura mínima:
  - saída do gate recusando a superfície ausente ou divergente

### CN-03 — owner técnico ausente

- Falha simulada futura:
  - promoção proposta sem owner técnico rastreável
- ReasonCode esperado:
  - `TECHNICAL_OWNER_REQUIRED`
- Critério fail-closed:
  - impedir qualquer avanço que dependa de autorização operacional
- Evidência futura mínima:
  - recusa explícita com o campo ausente identificado

### CN-04 — owner operacional ausente

- Falha simulada futura:
  - janela operacional sem owner de execução/monitoramento
- ReasonCode esperado:
  - `OPERATIONAL_OWNER_REQUIRED`
- Critério fail-closed:
  - bloquear a etapa antes de qualquer boundary de secret
- Evidência futura mínima:
  - recusa do cenário sem owner operacional

### CN-05 — janela operacional ausente ou inválida

- Falha simulada futura:
  - ausência de janela auditável ou formato incompatível
- ReasonCode esperado:
  - `OPERATIONAL_WINDOW_INVALID`
- Critério fail-closed:
  - impedir toda promoção controlada fora de janela válida
- Evidência futura mínima:
  - saída recusando ausência ou formato inválido

### CN-06 — rollback ausente ou genérico

- Falha simulada futura:
  - `rollback_reference` ausente ou rollback sem escopo por superfície
- ReasonCodes esperados:
  - `ROLLBACK_REFERENCE_REQUIRED`
  - `ROLLBACK_NOT_SURFACE_SCOPED`
- Critério fail-closed:
  - impedir qualquer passo real ou pseudo-real de promoção
- Evidência futura mínima:
  - prova de bloqueio por ausência de runbook ou referência específica

### CN-07 — boundary de secrets não aprovado

- Falha simulada futura:
  - tentativa de aproximar `NPM_TOKEN` ou `REGISTRY_PAT` sem autorização dedicada
- ReasonCode esperado:
  - `SECRET_BOUNDARY_NOT_APPROVED`
- Critério fail-closed:
  - abortar antes de ler, injetar ou propagar qualquer secret
- Evidência futura mínima:
  - log que comprove o abort antes de consumo de secret

### CN-08 — login em registry/GHCR não autorizado

- Falha simulada futura:
  - tentativa de autenticação externa fora da fase permitida
- ReasonCode esperado:
  - `REGISTRY_LOGIN_NOT_AUTHORIZED`
- Critério fail-closed:
  - zero autenticação externa
- Evidência futura mínima:
  - recusa explícita anterior a qualquer `docker/login-action` ou equivalente

### CN-09 — publish CLI sem imutabilidade/idempotência

- Falha simulada futura:
  - versão reaproveitável ou política de publish ambígua
- ReasonCode esperado:
  - `CLI_PUBLISH_NOT_IDEMPOTENT`
- Critério fail-closed:
  - não permitir sequer a aproximação final de publish
- Evidência futura mínima:
  - recusa com explicação de ambiguidade de versão ou retry

### CN-10 — promoção de `latest` sem política explícita

- Falha simulada futura:
  - uso de `latest` sem regra de precedência, rollback e evidência associada
- ReasonCode esperado:
  - `LATEST_TAG_PROMOTION_BLOCKED`
- Critério fail-closed:
  - bloquear `latest` enquanto não houver política explícita
- Evidência futura mínima:
  - log de recusa específico para `latest`

### CN-11 — retry sem reaprovação governada

- Falha simulada futura:
  - rerun manual ou automático sem política explícita de reaprovação
- ReasonCode esperado:
  - `RETRY_POLICY_MISSING`
- Critério fail-closed:
  - impedir retry que possa duplicar side effects
- Evidência futura mínima:
  - prova de recusa do rerun sem nova aprovação

### CN-12 — `tags/releases` sem gate dedicado

- Falha simulada futura:
  - tentativa de usar `tags` ou `releases` como atalho de promoção produtiva
- ReasonCode esperado:
  - `TAG_PROMOTION_NOT_AUTHORIZED`
- Critério fail-closed:
  - bloquear qualquer promoção dependente de tag/release
- Evidência futura mínima:
  - recusa anterior a qualquer criação de tag ou release

### CN-13 — confusão entre readiness verde e release produtivo

- Falha simulada futura:
  - tratamento indevido de readiness/preflight/gate verde como autorização para publish
- ReasonCode esperado:
  - `READINESS_NOT_EQUIVALENT_TO_RELEASE`
- Critério fail-closed:
  - impedir a equivalência entre trilha sem side effects e promoção produtiva
- Evidência futura mínima:
  - registro explícito da recusa dessa equivalência

## Critérios fail-closed transversais

Qualquer controlled negative dry-run futuro da Camada B deve ser considerado inválido se não provar, ao mesmo tempo:

- zero publish real;
- zero uso de `secrets` produtivos;
- zero registry login;
- zero push de imagem;
- zero `tags/releases`;
- zero side effects externos;
- bloqueio explícito por `reasonCode`;
- evidência auditável do ponto exato de abort;
- superfície e owners rastreáveis no cenário exercitado.

## HITL e governança humana

Mesmo sendo uma etapa futura de negative dry-run, a trilha deve continuar subordinada a decisão humana explícita.

Leitura conservadora:

- HITL aqui significa autorização documental e operacional de execução do cenário negativo, não autorização para publish;
- ausência de owner técnico ou operacional invalida o exercício;
- ausência de boundary explícito de `secrets` invalida o exercício;
- ausência de rollback por superfície invalida o exercício.

## Evidência futura mínima por ciclo negativo

Cada futuro cenário negativo da Camada B deve registrar, no mínimo:

1. data e commit avaliados;
2. superfície alvo;
3. cenário negativo exercitado;
4. `reasonCode` esperado;
5. `reasonCode` observado;
6. ponto de abort;
7. prova de fail-closed;
8. prova de zero side effects externos;
9. owner técnico;
10. owner operacional;
11. status do rollback correspondente;
12. decisão conservadora final.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma etapa futura, separada e autorizada, capaz de exercitar cenários negativos controlados da Camada B sem side effects externos.

Esta F0.50 não cria esse gate, não o automatiza e não altera a conclusão vigente:

- a Camada B continua não autorizada para execução produtiva;
- `release.yml` produtivo permanece intocado;
- readiness documental não equivale a release real.

## Comandos executados

```bash
git status --short
git log --oneline -8
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
grep -n "F0.47\|F0.48\|F0.49\|Camada B\|negative\|fail-closed\|reasonCode\|readiness\|publish\|secrets\|GHCR\|tags\|rollback" docs/EVIDENCE_INDEX.md
grep -n "Camada B\|não autorizada\|publish\|secrets\|rollback\|readiness" ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
grep -n "negative\|fail-closed\|reasonCode\|Camada B\|publish\|secrets\|registry\|GHCR\|tags\|rollback" ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
grep -n "readiness\|gate futuro\|Camada B\|fail-closed\|HITL\|secrets\|registry\|rollback\|negative paths" ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
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
  "sizeChars": 174153,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 479
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
?? ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
