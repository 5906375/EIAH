# F0.55 — layer B promotion preconditions decision matrix

## Data
2026-07-13

## Objetivo
Consolidar F0.47, F0.48, F0.49, F0.50, F0.51, F0.52, F0.53 e F0.54 em uma matriz única de decisão com as pré-condições mínimas que precisam existir antes de qualquer futura promoção controlada da Camada B.

## Escopo e decisão conservadora
Esta etapa é estritamente documental e audit-only.

Não implementa workflow.
Não cria automação.
Não altera `release.yml`.
Não altera workflows.
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
- F0.54 já está mergeada em `main`.
- `docs/EVIDENCE_INDEX.md` estava consistente antes do diff.
- `pnpm check:evidence-index` passou antes do diff.
- `pnpm check:w4-non-regression` passou antes do diff.
- `release.yml` produtivo permanece intocado.
- A Camada B continua explicitamente não autorizada para execução produtiva.

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

## Consolidação da cadeia F0.47–F0.54
F0.47 fixou que readiness documental não equivale a autorização executiva da Camada B.

F0.48 mapeou negative paths esperados e reasonCodes fail-closed.

F0.49 organizou o checklist mínimo de gate futuro.

F0.50 consolidou cenários de controlled negative dry-run futuro.

F0.51 definiu critérios objetivos de `no-side-effect`.

F0.52 formalizou o contrato mínimo de evidência `receipt`/`bundle`.

F0.53 tornou `rollbackReference` um requisito objetivo, verificável e surface-scoped.

F0.54 definiu os critérios mínimos de evidência HITL, incluindo owners, `operationalWindow`, vínculo com `reasonCode`, `receipt`, `bundle` e `rollbackReference`.

F0.55 consolida tudo isso em uma matriz única de decisão de promoção.

## Matriz de decisão de pré-condições mínimas da Camada B

| Pré-condição | Evidência mínima que deve existir | Sinal de rejeição | Decisão exigida |
| --- | --- | --- | --- |
| Base de readiness documental | F0.47 existente e coerente com `release.yml` ainda intocado | readiness tratado como autorização de publish | rejeitar promoção |
| Negative paths mapeados | F0.48 com falhas esperadas, fail-closed e `reasonCodes` sugeridos | cenários negativos ausentes ou sem fail-closed | rejeitar promoção |
| Checklist de gate futuro | F0.49 com owners, janela, rollback e boundary de `secrets` | checklist incompleto ou ambíguo | rejeitar promoção |
| Plano de dry-run negativo controlado | F0.50 com cenários negativos futuros e evidência mínima por ciclo | dry-run futuro sem escopo ou sem cenário negativo explícito | rejeitar promoção |
| Critérios de `no-side-effect` | F0.51 exigindo zero publish, zero login em registry, zero GHCR/Docker push, zero tags/releases e zero boundary externo cruzado | qualquer side effect externo observado ou aceitável por policy | rejeitar promoção |
| Contrato de `receipt` e `bundle` | F0.52 com campos mínimos de rastreabilidade por superfície, owners, `reasonCode`, abort stage e prova de `no-side-effect` | `receipt`/`bundle` ausentes, incompletos ou sem vínculo com a execução | rejeitar promoção |
| `rollbackReference` válido | F0.53 com referência existente, verificável, surface-scoped e compatível com `reasonCode`, `receipt` e `bundle` | referência inexistente, genérica ou não auditável | rejeitar promoção |
| Evidência HITL válida | F0.54 com aprovador identificável, surface-scope, owners explícitos, `operationalWindow` e vínculo com `rollbackReference`, `reasonCode`, `receipt` e `bundle` | approval implícita, fora da janela, sem owner ou sem vínculo com rollback | rejeitar promoção |
| Owners explícitos por superfície | owner técnico e owner operacional ligados à superfície candidata | owner ausente, genérico ou sem superfície definida | rejeitar promoção |
| `operationalWindow` explícita | janela operacional documentada e vinculada à aprovação/gate | janela ausente, implícita ou fora da evidência | rejeitar promoção |
| Surface scoping explícito | escopo por `cli`, `api`, `workers` ou `multi_surface` claramente definido | promoção genérica sem superfície delimitada | rejeitar promoção |
| `reasonCode` e abort stage | mapeamento verificável entre cenário, `reasonCode`, abort stage e fail-closed | falha sem classificação auditável ou sem ponto de abort | rejeitar promoção |
| Boundary de `secrets` preservado | prova auditável de zero consumo operacional de `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `REGISTRY_PAT` ou boundary equivalente | uso real ou tentativa não controlada de secrets produtivos | rejeitar promoção |
| Zero side effects externos | prova auditável de zero publish, zero registry login, zero GHCR/Docker push, zero tags/releases | qualquer publish, login, push, tag ou release observado | rejeitar promoção |
| `release.yml` produtivo ainda protegido | `release.yml` sem diff e sem aproximação direta para publish real | alteração direta em `release.yml` ou suposição de equivalência com preflight/gates | rejeitar promoção |

## Invariantes de decisão
As seguintes condições precisam permanecer verdadeiras antes de qualquer futura promoção controlada:

1. `releaseAuthorized = false` enquanto faltar qualquer pré-condição acima.
2. `publishAttempted = false`.
3. `rollbackExecuted = false` nesta cadeia documental.
4. `registryLoginAttempted = false`.
5. `imagePushAttempted = false`.
6. `tagOrReleaseAttempted = false`.
7. `secretBoundaryCrossed = false`.
8. `externalSideEffectsDetected = false`.
9. `failClosed = true` para cenários negativos e pré-condições ausentes.
10. `release.yml` produtivo permanece intocado.

## Critério de promoção futura
Uma futura promoção controlada da Camada B só pode ser discutida se todas as pré-condições da matriz estiverem simultaneamente satisfeitas por evidência real, indexável, surface-scoped e compatível entre si.

Se qualquer uma falhar, a decisão correta continua sendo:
- não promover;
- abortar antes de cruzar boundary externo;
- registrar `reasonCode` coerente;
- manter a Camada B fora de execução produtiva.

## Resultado desta F0.55
- a cadeia F0.47–F0.54 agora está consolidada em uma matriz única de decisão;
- a Camada B continua não autorizada para execução produtiva;
- nenhuma hipótese de publish real foi introduzida;
- `release.yml` continua intocado;
- esta etapa apenas fortalece a governança documental antes de qualquer discussão futura de promoção controlada.

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
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|F0.53\|F0.54\|Camada B\|readiness\|negative\|dry-run\|no-side-effect\|receipt\|bundle\|rollback\|HITL\|approval\|reasonCode\|fail-closed" docs/EVIDENCE_INDEX.md
grep -n "HITL\|approval\|owner\|surface\|scope\|operationalWindow\|rollback\|receipt\|bundle\|reasonCode\|fail-closed\|Camada B" ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md
pnpm check:evidence-index
pnpm check:w4-non-regression
```

## Saídas reais observadas antes do diff

### `git log --oneline -8`
```text
5a5292c Merge pull request #256 from 5906375/f0-54-layer-b-hitl-approval-evidence-criteria
4195157 docs(ci): document layer b HITL approval evidence criteria
3e4a729 Merge pull request #255 from 5906375/f0-53-layer-b-rollback-reference-acceptance-criteria
3cd1fa1 docs(ci): document layer b rollback reference acceptance criteria
45ab039 Merge pull request #254 from 5906375/f0-52-layer-b-receipt-bundle-evidence-contract
07d2692 docs(ci): document layer b receipt bundle evidence contract
2a54c09 Merge pull request #253 from 5906375/f0-51-layer-b-no-side-effect-acceptance-criteria
117ba41 docs(ci): document layer b no-side-effect acceptance criteria
```

### `pnpm check:evidence-index`
```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 176566,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 483
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
- `apps/**`, `packages/**` e `scripts/**` não foram alterados;
- `ChatAgentLauncher`, engine, runtime e contratos não foram alterados;
- a mudança desta F0.55 é estritamente documental.

## Status
Status: parcial/evidenciado
