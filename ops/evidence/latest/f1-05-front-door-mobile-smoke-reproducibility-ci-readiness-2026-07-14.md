# F1.5 — Front Door Mobile Smoke Reproducibility / CI-readiness Decision

## Resumo
- Objetivo: avaliar a reprodutibilidade do smoke F1.4 e decidir se ele está pronto para promoção futura ao CI.
- Escopo: auditoria documental + 3 execuções locais reais do smoke F1.4, sem alteração em CI, workflow, `package.json` ou `pnpm-lock.yaml`.
- Status: parcial/evidenciado
- Não conectado ao CI nesta etapa.
- Não declara DONE amplo.

## Contexto F1.0-F1.4
- F1.0: baseline mobile/render-only do front door IMOB.
- F1.1: validação por breakpoints e reaproveitamento de evidências históricas.
- F1.2: prova direta de `360x740`.
- F1.3: decisão documental de valor para um smoke recorrente pequeno.
- F1.4: implementação mínima de `scripts/smoke-f1-4-front-door-mobile.mjs` com JSON determinístico em quatro viewports.
- Gap remanescente: o smoke passou localmente, mas o repositório ainda não formaliza Playwright como dependência/runner de CI.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`
- `ops/evidence/latest/f1-01-front-door-mobile-snapshots-render-only-2026-07-14.md`
- `ops/evidence/latest/f1-02-front-door-360px-direct-snapshot-render-only-2026-07-14.md`
- `ops/evidence/latest/f1-03-front-door-mobile-recurring-visual-gate-proposal-2026-07-14.md`
- `ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `scripts/smoke-9-3-2.mjs`
- `scripts/smoke-9-4-1.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`

## Auditoria Playwright

| Item | Resultado | Implicação |
|---|---|---|
| `package.json` | sem `playwright` | Não há dependência formal do runner/browser no repositório. |
| `pnpm-lock.yaml` | sem `playwright` | O lockfile não prova reprodutibilidade do smoke via instalação normal do repo. |
| `scripts/smoke-9-*` | importam Playwright por path absoluto em `~/.npm/_npx/...` | O padrão histórico de smoke é local/ad hoc, não CI-ready. |
| `scripts/smoke-f1-4-*` | tenta `import("playwright")` e faz fallback para `~/.npm/_npx` | Melhor que o hardcode absoluto histórico, mas ainda dependente de cache local fora do grafo de dependências. |
| workflows | não executam smoke Playwright do front door | Não há pipeline pronta para esse smoke. |
| fallback `~/.npm/_npx` | usado como caminho de compatibilidade local | Boa reprodutibilidade local controlada, mas insuficiente para promoção direta ao CI. |

## Execuções locais

| Execução | Comando | Exit code | ok | Viewports | Runner/import | Observações |
|---|---|---:|---:|---:|---|---|
| 1 | `node scripts/smoke-f1-4-front-door-mobile.mjs` | 0 | true | 4 | fallback local controlado | Passou em `360x740`, `390x844`, `768x1024`, `1024x768`. |
| 2 | `node scripts/smoke-f1-4-front-door-mobile.mjs` | 0 | true | 4 | fallback local controlado | Repetição idêntica, sem divergência de JSON. |
| 3 | `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173 node scripts/smoke-f1-4-front-door-mobile.mjs` | 0 | true | 4 | fallback local controlado | Passou com base URL explícita; sem mudança comportamental. |

## Resultado consolidado
- total execuções: 3
- sucessos: 3
- falhas: 0
- flakiness observada: nenhuma nas três execuções reais
- fallback usado: sim
- CI-readiness: **não pronto para promoção direta ao CI**

## Decisão
Escolha:
1. Manter manual/local por enquanto.
2. Abrir F1.6 para normalizar Playwright/runner.

Justificativa:
- o smoke F1.4 se mostrou reproduzível localmente em 3/3 execuções, com JSON estável e sem flakiness observada;
- porém, a reprodutibilidade ainda depende de fallback para `~/.npm/_npx`, porque `playwright` não está formalizado em `package.json` nem em `pnpm-lock.yaml`;
- isso significa que o smoke é **reprodutível localmente**, mas **não CI-ready** no estado atual do repositório;
- a próxima etapa correta é uma F1.6 separada para normalizar Playwright/runner/dependência antes de qualquer promoção ao CI.

## Decisão de CI
- CI não alterado.
- Workflow não alterado.
- Package scripts não alterados.
- `package.json`/`pnpm-lock.yaml` não alterados.
- Promoção ao CI, se houver, deve ser etapa separada.

## Prova de isolamento
- Sem alteração em `ChatAgentLauncher`.
- Sem alteração em engine.
- Sem alteração em runtime.
- Sem alteração em APIs/contracts.
- Sem alteração em `apps/**`.
- Sem alteração em `packages/**`.
- Sem alteração em workflows.
- Sem alteração em `package.json`/`pnpm-lock.yaml`.
- Sem dependência nova.
- Sem side effects externos.

## Checks executados

### 3 execuções do smoke F1.4
Resultado consolidado:

```json
{
  "runs": 3,
  "successes": 3,
  "failures": 0,
  "flakinessObserved": false,
  "fallbackUsed": true,
  "viewportsPerRun": 4
}
```

### `pnpm check:evidence-index`
```json
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 184651,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 495
}
```

### `pnpm check:docs-link-integrity`
```json
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

### `pnpm check:w4-non-regression`
```json
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

### `git diff --check`
- sem saída

### `git diff -- .github/workflows package.json pnpm-lock.yaml apps packages scripts`
- sem saída nesta etapa
- nenhuma alteração nova em `scripts/**` foi introduzida pela F1.5

## Riscos remanescentes
- Smoke ainda não está no CI.
- Playwright continua dependente de fallback local.
- Reprodutibilidade fora da máquina local ainda exige normalização.
- Não é DONE amplo.

## Conclusão
- Status final: parcial/evidenciado
- Próxima ação recomendada: abrir uma F1.6 separada para normalizar Playwright/runner/dependência antes de qualquer PR de promoção ao CI.
- Não declara DONE amplo.
