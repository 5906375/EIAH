# F0.53 — layer B rollback reference acceptance criteria

## Data
2026-07-13

## Objetivo
Criar uma evidência documental/audit-only para a F0.53: critérios objetivos de aceitação para `rollbackReference` em uma futura validação controlada da Camada B.

Esta etapa consolida F0.47, F0.48, F0.49, F0.50, F0.51 e F0.52 em critérios verificáveis para determinar se um `rollbackReference` futuro é válido, executável, auditável e indexável.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.52
- F0.52 presente no histórico recente de `main`
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
- executa rollback real;
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
- `ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md`

## Consolidação F0.47 -> F0.53

F0.47 registrou que a Camada B ainda não está pronta para publish real e depende de trilha separada, conservadora e auditável.

F0.48 elevou `rollback` a pré-condição fail-closed mínima por superfície.

F0.49 incorporou `rollbackReference` ao checklist obrigatório para qualquer gate futuro.

F0.50 passou a exigir que cenários negativos controlados referenciem rollback específico e rastreável.

F0.51 definiu que a futura validação `no-side-effect` continua inválida se não houver owners, escopo e rollback auditáveis.

F0.52 incorporou `rollbackReference` como campo mínimo obrigatório de `receipt`/`bundle`.

F0.53 fecha este ciclo documental definindo o que fará um `rollbackReference` futuro ser aceito como válido, executável, auditável e indexável.

## Definição operacional de `rollbackReference`

Para a Camada B, `rollbackReference` é a referência documental/operacional mínima que aponta para o procedimento de reversão aplicável à superfície avaliada, sem executar rollback real nesta etapa.

O objetivo não é provar que o rollback já ocorreu. O objetivo é provar que:

- a reversão foi pensada por superfície;
- a referência é concreta, localizável e estável;
- a equipe consegue auditá-la antes de qualquer passo produtivo;
- a ausência ou ambiguidade dessa referência deve bloquear a promoção em modo fail-closed.

## Critérios objetivos de aceitação

### R1 — deve existir

Aceitação:

- `rollbackReference` não pode estar ausente;
- `rollbackReference` não pode ser vazio;
- `rollbackReference` deve apontar para um artefato ou instrução concreta.

Falha:

- ausência ou valor vazio deve ser tratado como `ROLLBACK_REFERENCE_REQUIRED`.

### R2 — deve ser surface-scoped

Aceitação:

- a referência deve identificar explicitamente a superfície alvo:
  - `cli`
  - `api`
  - `workers`
  - `multi_surface`
- a reversão não pode depender de descrição genérica não vinculada à superfície.

Falha:

- referência genérica ou não vinculada à superfície deve ser tratada como `ROLLBACK_NOT_SURFACE_SCOPED`.

### R3 — deve ser auditável

Aceitação:

- a referência deve permitir localizar o procedimento de reversão sem inferência ad hoc;
- o artefato referenciado deve ser inspecionável por revisão documental;
- a relação entre cenário, superfície e reversão deve ser legível em evidência.

Falha:

- se a referência não puder ser auditada por terceiro, ela não é aceitável.

### R4 — deve ser verificável antes de qualquer boundary externo

Aceitação:

- a validação do `rollbackReference` deve ocorrer antes de qualquer publish, login, push ou uso operacional de secret;
- a falta de referência válida deve bloquear o fluxo no ponto inicial de governança.

Falha:

- qualquer validação tardia do rollbackReference invalida o desenho fail-closed.

### R5 — deve ser compatível com `reasonCode`

Aceitação:

- a ausência ou invalidez da referência deve se refletir em `reasonCode` explícito;
- o receipt/bundle futuro deve registrar o `reasonCode` correspondente e o `abortStage`.

Falha:

- ausência de `reasonCode` específico ou abort opaco invalida a aceitação.

### R6 — deve ser compatível com `receipt`/`bundle`

Aceitação:

- o `rollbackReference` deve estar presente no futuro `receipt`;
- o `rollbackReference` deve estar presente no futuro `bundle`;
- ambos devem apontar para a mesma semântica de reversão.

Falha:

- divergência entre receipt e bundle invalida a evidência.

### R7 — deve ser indexável

Aceitação:

- a referência deve apontar para caminho ou artefato indexável no repositório ou para runbook/artefato explicitamente rastreável pela governança definida;
- a referência não pode depender de memória tácita, mensagem solta ou decisão oral.

Falha:

- referência não indexável ou não rastreável não é aceitável.

### R8 — deve ser compatível com decisão conservadora

Aceitação:

- a existência do `rollbackReference` não autoriza promoção;
- a referência serve como pré-condição documental mínima, não como permissão executiva.

Falha:

- qualquer leitura que trate `rollbackReference` como autorização de release deve ser rejeitada.

## Campos mínimos associados ao `rollbackReference`

Uma futura evidência que pretenda validar `rollbackReference` deve registrar, no mínimo:

- `surface`
- `rollbackReference`
- `rollbackScope`
- `rollbackReferenceValid`
- `expectedReasonCode`
- `observedReasonCode`
- `abortStage`
- `decision`

## Invariantes mínimos

Um `rollbackReference` só pode ser aceito na Camada B se os seguintes invariantes permanecerem verdadeiros:

1. `rollbackReference` existe
2. `rollbackReference` é legível
3. `rollbackReference` é surface-scoped
4. `rollbackReference` é auditável
5. `rollbackReference` é verificável antes de qualquer boundary externo
6. `rollbackReference` está refletido de forma consistente em `receipt` e `bundle`
7. sua ausência ou invalidez produz fail-closed explícito
8. sua presença não é tratada como autorização para execução produtiva

## Condições de rejeição imediata

Um futuro `rollbackReference` deve ser rejeitado como insuficiente se ocorrer qualquer uma das situações abaixo:

- referência ausente;
- referência vazia;
- referência genérica;
- referência sem superfície explícita;
- referência não auditável;
- referência não rastreável;
- referência sem correspondência com `reasonCode`;
- referência ausente em `receipt` ou `bundle`;
- referência usada como justificativa para promoção produtiva.

## Relação com F0.48–F0.52

Os critérios desta F0.53 devem permanecer coerentes, no mínimo, com:

- `ROLLBACK_REFERENCE_REQUIRED`
- `ROLLBACK_NOT_SURFACE_SCOPED`
- os critérios fail-closed de F0.48
- o checklist de F0.49
- o plano de negative dry-run de F0.50
- os critérios `no-side-effect` de F0.51
- o contrato de `receipt`/`bundle` de F0.52

## Exemplo de leitura auditável esperada

Uma futura evidência aceitável deve permitir afirmar, sem inferência adicional:

- qual superfície está em análise;
- qual é a referência de reversão associada;
- se a referência é válida ou inválida;
- em que ponto o fluxo aborta quando a referência falha;
- qual `reasonCode` representa essa falha;
- que nenhum boundary externo foi cruzado antes da verificação;
- que a decisão final continua conservadora.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma futura etapa separada e autorizada que produza evidência compatível com estes critérios, sem alterar a conclusão vigente.

Esta F0.53 não cria rollback real, não cria gate, não cria workflow e não autoriza execução produtiva.

Leitura correta após F0.53:

- a Camada B continua não autorizada para execução produtiva;
- `release.yml` produtivo continua intocado;
- futuras validações da Camada B já têm critérios mínimos para aceitar ou rejeitar `rollbackReference`;
- ausência desses critérios deve manter o status como parcial e não autorizável.

## Comandos executados

```bash
git status --short
git log --oneline -8
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
ls -la ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
ls -la ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|Camada B\|rollback\|receipt\|bundle\|dry-run\|no-side-effect\|fail-closed\|reasonCode" docs/EVIDENCE_INDEX.md
grep -n "rollback\|receipt\|bundle\|abort\|reasonCode\|no-side-effect\|fail-closed\|Camada B" ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md
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
  "sizeChars": 175990,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 482
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
?? ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
