# F0.57 — layer B controlled validation PR entry criteria

## Data
2026-07-13

## Objetivo
Consolidar critérios objetivos de entrada para abrir um futuro PR dedicado de validação controlada da Camada B, ainda sem workflow novo, sem execução real, sem publish e sem qualquer side effect externo.

## Escopo e limite desta etapa
Esta etapa é estritamente documental e audit-only.

Não implementa workflow.
Não cria automação.
Não altera `release.yml`.
Não executa publish.
Não executa rollback real.
Não implementa HITL real.
Não usa secrets produtivos.
Não faz registry login.
Não faz Docker/GHCR push.
Não cria tags/releases.
Não gera side effects externos.
Não autoriza a Camada B para execução produtiva.

## Pré-condições confirmadas
- F0.56 está mergeada em `main`.
- `docs/EVIDENCE_INDEX.md` estava consistente antes do diff.
- `pnpm check:evidence-index` passou antes do diff.
- `pnpm check:w4-non-regression` passou antes do diff.
- `release.yml` produtivo permanece intocado.
- A Camada B continua classificada como `CANDIDATE_CONTROLLED_VALIDATION=true`, `PARTIAL=true`, `PRODUCTION_NOT_AUTHORIZED=true` e `BLOCKED=true`.

## Arquivos e evidências lidos
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
- `ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-55-layer-b-promotion-preconditions-decision-matrix-2026-07-13.md`
- `ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md`

## Objetivo normativo da F0.57
F0.57 não abre o PR futuro.

F0.57 define apenas quando esse futuro PR dedicado pode ser aberto sem drift documental e sem confundir readiness documental com autorização operacional.

## Critérios objetivos de entrada para o futuro PR dedicado

### E1 — Escopo explicitamente restrito
O futuro PR deve declarar de forma inequívoca:
- que é de validação controlada;
- que não é de publish real;
- que não é de rollback real;
- que não é de HITL real;
- que não usa secrets produtivos;
- que não cruza boundary externo;
- que não altera `release.yml`.

Se o PR proposto não começar por essa delimitação, ele não deve ser aberto.

### E2 — Base documental F0.47–F0.56 íntegra
Antes de abrir o futuro PR, precisam existir e continuar coerentes:
- F0.47 readiness audit;
- F0.48 negative-path audit;
- F0.49 future gate checklist;
- F0.50 controlled negative dry-run plan;
- F0.51 `no-side-effect` acceptance criteria;
- F0.52 `receipt`/`bundle` evidence contract;
- F0.53 `rollbackReference` acceptance criteria;
- F0.54 HITL approval evidence criteria;
- F0.55 promotion preconditions decision matrix;
- F0.56 readiness closure.

Se qualquer uma dessas peças estiver ausente, desatualizada ou contraditória, o PR futuro não deve ser aberto.

### E3 — Problema do PR futuro deve ser único e verificável
O futuro PR deve declarar um objetivo único e estreito.

Exemplos aceitáveis:
- validar apenas um gate documental/manual;
- validar apenas a montagem de evidência futura sem side effects;
- validar apenas um runner dry-run sem boundary externo.

Exemplos proibidos:
- misturar validação controlada com publish real;
- misturar validação controlada com migração direta de `release.yml`;
- misturar validação controlada com múltiplas superfícies sem delimitação.

### E4 — Superfície alvo explicitamente delimitada
O futuro PR deve declarar a superfície alvo como uma destas:
- `cli`
- `api`
- `workers`
- `multi_surface`

Se usar `multi_surface`, precisa justificar por que uma superfície única não é suficiente.

Sem surface scoping explícito, o PR futuro não deve ser aberto.

### E5 — Boundary de no-side-effect explicitado
O futuro PR deve afirmar, antes de qualquer diff, que continua valendo:
- `publishAttempted = false`
- `rollbackExecuted = false`
- `hitlExecuted = false`
- `secretBoundaryCrossed = false`
- `registryLoginAttempted = false`
- `ghcrOrDockerPushAttempted = false`
- `tagOrReleaseAttempted = false`
- `externalSideEffectsDetected = false`

Se o PR futuro não preservar esses invariantes, ele não é um PR de validação controlada.

### E6 — Owners e janela operacional como pré-requisito documental
Mesmo sem HITL real, o futuro PR deve declarar qual seria o modelo documental mínimo de:
- owner técnico;
- owner operacional;
- `operationalWindow`;
- rationale de abertura do PR.

Sem esse enquadramento, o PR futuro permanece documentalmente imaturo.

### E7 — `reasonCode` e fail-closed como requisito de desenho
O futuro PR deve declarar:
- quais negative paths continuam esperados;
- quais `reasonCodes` ou classes equivalentes serão usados;
- em que ponto ocorre o abort;
- como o fluxo falha em modo fail-closed se uma pré-condição não existir.

Sem isso, o PR futuro não deve ser aberto.

### E8 — Compatibilidade com `receipt`/`bundle`
Se o futuro PR tocar evidência de execução simulada ou de tentativa controlada, ele deve manter compatibilidade explícita com o contrato definido em F0.52.

Se não houver plano para preservar a semântica de `receipt`/`bundle`, o PR futuro não deve ser aberto.

### E9 — Compatibilidade com `rollbackReference`
Se o futuro PR tocar abort/rollback simulado, ele deve declarar como a futura referência de rollback será tratada sem executar rollback real.

Se `rollbackReference` ficar implícito, genérico ou fora de superfície, o PR futuro não deve ser aberto.

### E10 — Compatibilidade com approval HITL sem executar HITL real
O futuro PR não pode implementar HITL real, mas deve manter compatibilidade com os critérios documentados em F0.54.

Isso implica:
- não mascarar ausência de approval;
- não tratar aprovação implícita como suficiente;
- não degradar a exigência de owner, `operationalWindow`, `reasonCode`, `receipt`, `bundle` e `rollbackReference`.

### E11 — Prova de isolamento obrigatória
O futuro PR deve prever checks de isolamento que provem ausência de alteração em:
- `.github/workflows/release.yml`
- workflows produtivos existentes fora do escopo autorizado;
- `package.json`
- `pnpm-lock.yaml`
- `apps/**`
- `packages/**`
- `scripts/**`, salvo se o próprio PR futuro autorizar explicitamente algum script novo ou ajuste mínimo

Sem prova de isolamento, o PR futuro não deve ser aberto.

### E12 — Status conservador obrigatório
O futuro PR deve nascer com status esperado `parcial/evidenciado` ou `parcial`, nunca como fechamento da Camada B.

É proibido abrir o PR futuro com linguagem que implique:
- readiness produtivo;
- publish readiness final;
- release path fechado;
- autorização de secrets;
- autorização de side effects externos.

## Checklist de entrada mínimo
Um futuro PR dedicado de validação controlada da Camada B só pode ser aberto se todas as respostas abaixo forem `sim`:

1. O escopo está explicitamente limitado a validação controlada sem side effects?
2. A cadeia F0.47–F0.56 continua íntegra e indexada?
3. O objetivo do PR é único, estreito e verificável?
4. A superfície alvo está explicitamente declarada?
5. Os invariantes de `no-side-effect` continuam explícitos?
6. Owners e `operationalWindow` estão ao menos definidos como moldura documental?
7. `reasonCode`, abort e fail-closed estão definidos?
8. Compatibilidade com `receipt`/`bundle` está preservada?
9. Compatibilidade com `rollbackReference` está preservada?
10. Compatibilidade com approval HITL está preservada sem implementar HITL real?
11. O PR futuro já nasce com prova de isolamento planejada?
12. O status esperado permanece conservador?

Se qualquer resposta for `não`, a abertura do PR futuro deve ser adiada.

## Decisão documental da F0.57
Conclusão:

- a Camada B está documentalmente madura para definir critérios de entrada de um futuro PR dedicado;
- esses critérios agora estão explícitos e auditáveis;
- isso não autoriza abrir automaticamente o PR futuro sem nova decisão;
- isso não autoriza execução produtiva, publish real, rollback real, HITL real, uso de secrets produtivos ou side effects externos.

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
ls -la ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-55-layer-b-promotion-preconditions-decision-matrix-2026-07-13.md
ls -la ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|F0.53\|F0.54\|F0.55\|F0.56\|Camada B\|controlled validation\|entry criteria\|BLOCKED\|PRODUCTION_NOT_AUTHORIZED\|CANDIDATE_CONTROLLED_VALIDATION" docs/EVIDENCE_INDEX.md
grep -n "CANDIDATE_CONTROLLED_VALIDATION\|PRODUCTION_NOT_AUTHORIZED\|BLOCKED\|PARTIAL\|Camada B\|future validation\|secrets\|publish\|rollback\|HITL" ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md
pnpm check:evidence-index
pnpm check:w4-non-regression
```

## Saídas reais observadas antes do diff

### `git log --oneline -8`
```text
1f16c58 Merge pull request #258 from 5906375/f0-56-layer-b-controlled-validation-readiness-closure
6f62d78 docs(ci): document layer b controlled validation readiness closure
f1677fa Merge pull request #257 from 5906375/f0-55-layer-b-promotion-preconditions-decision-matrix
215e5cf docs(ci): document layer b promotion preconditions decision matrix
5a5292c Merge pull request #256 from 5906375/f0-54-layer-b-hitl-approval-evidence-criteria
4195157 docs(ci): document layer b HITL approval evidence criteria
3e4a729 Merge pull request #255 from 5906375/f0-53-layer-b-rollback-reference-acceptance-criteria
3cd1fa1 docs(ci): document layer b rollback reference acceptance criteria
```

### `pnpm check:evidence-index`
```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 177922,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 485
}
```

### `pnpm check:w4-non-regression`
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
  }
}
```

## Prova de isolamento
- nenhum workflow foi alterado;
- `release.yml` não foi alterado;
- `package.json` e `pnpm-lock.yaml` não foram alterados;
- `apps/**`, `packages/**`, `scripts/**`, runtime, engine, contratos, schema Prisma, migrations e `ChatAgentLauncher` não foram alterados;
- a mudança desta F0.57 é estritamente documental.

## Status
Status: parcial/evidenciado
