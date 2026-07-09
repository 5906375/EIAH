# F0.5 — IMOB front door CI gate

## Data

2026-07-09

## Objetivo

Transformar a evidencia F0.4 em protecao automatizada recorrente no CI, criando um gate dedicado para regressao do front door IMOB.

## Escopo

Esta etapa cria um check dedicado em `package.json` e integra um job especifico no workflow `CI Monorepo`, sem alterar `ChatAgentLauncher`, `apps/web/src/pages/app/imob/chat.tsx`, backend, policy, Prisma, migrations, WhatsApp, mobile, billing/economy ou runtime amplo.

## Arquivos alterados

- `package.json`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f0-5-imob-frontdoor-ci-gate-2026-07-09.md`
- `docs/EVIDENCE_INDEX.md`

## Script criado

Script novo na raiz:

```json
"check:imob-frontdoor-regression": "TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts && pnpm check:chat-launcher-render-only && pnpm check:evidence-index && pnpm check:docs-link-integrity"
```

Comandos cobertos pelo gate:

1. `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
2. `pnpm check:chat-launcher-render-only`
3. `pnpm check:evidence-index`
4. `pnpm check:docs-link-integrity`

Observacao:

- `pnpm check:orphan-tests` fica fora do gate por divida preexistente conhecida.
- `git diff --check` nao foi incluido no gate composto porque o job de CI roda em workspace limpo e esse comando nao agrega a mesma protecao recorrente que os quatro checks alvo desta frente.

## Workflow/step CI integrado

Job novo em `.github/workflows/ci.yml`:

- job: `imob_frontdoor_regression`
- name: `ImobFrontdoorRegression`
- trigger: `pull_request` via workflow `CI Monorepo`
- step final:

```yaml
- name: Run IMOB front door regression gate
  run: pnpm check:imob-frontdoor-regression
```

O job reutiliza o setup padrao ja adotado por outros gates do workflow:

- `actions/checkout@v4`
- `pnpm/action-setup@v4`
- `actions/setup-node@v4` com Node `22`
- `pnpm install --frozen-lockfile --ignore-scripts`

## Evidencias base consolidadas

- F0.1: `ops/evidence/latest/f0-1-imob-entitlement-error-rendering-2026-07-09.md`
- F0.2: `ops/evidence/latest/f0-2-imob-frontdoor-states-2026-07-09.md`
- F0.3: `ops/evidence/latest/f0-3-imob-frontdoor-ux-rendering-2026-07-09.md`
- F0.4: `ops/evidence/latest/f0-4-imob-frontdoor-regression-checklist-2026-07-09.md`

## Resultados dos checks locais

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `pnpm check:imob-frontdoor-regression` | PASS | Executou o teste focado IMOB + `check:chat-launcher-render-only` + `check:evidence-index` + `check:docs-link-integrity`. |
| `pnpm check:evidence-index` | PASS | Antes da indexacao F0.5: `ok:true`, `refsChecked:404`. |
| `pnpm check:evidence-index` | PASS | Apos a indexacao F0.5: `ok:true`, `refsChecked:405`. |
| `pnpm check:docs-link-integrity` | PASS | `ok:true`, `filesChecked:15`. |
| `pnpm check:chat-launcher-render-only` | PASS | `ok:true`, `violations:[]`. |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | Sem alteracao. |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | Sem alteracao neste PR. |
| `git diff --check` | PASS | Sem saida. |
| `pnpm check:orphan-tests` | FAIL residual | `blockingOrphanCount:50`; divida estrutural preexistente, explicitamente fora do gate. |

## Prova de nao-regressao

- O teste focado IMOB agora esta encapsulado em um check dedicado e recorrente.
- `check:chat-launcher-render-only` faz parte do gate.
- `check:evidence-index` faz parte do gate.
- `check:docs-link-integrity` faz parte do gate.
- `ChatAgentLauncher` permaneceu sem diff.
- `apps/web/src/pages/app/imob/chat.tsx` permaneceu sem diff.
- O gate automatiza, em CI de `pull_request`, a protecao consolidada anteriormente em F0.4.

## Prova de governanca

- fail-closed preservado;
- sem CTA inventado;
- sem bypass de entitlement;
- sem retry automatico;
- sem alteracao de backend/policy;
- sem PII;
- `check:orphan-tests` mantido fora do gate por divida preexistente conhecida, sem relaxar a protecao especifica desta frente.

## Lacunas remanescentes

### P0

- Nenhuma pendencia documental introduzida por F0.5.
- `check:orphan-tests` permanece vermelho fora do gate por 50 orfaos estruturais preexistentes.

### P1

- F0.5 nao altera governanca/execucao critica do runtime; apenas adiciona automacao recorrente de regressao para a surface IMOB.

### P2

- Auditoria/interop multicanal seguem fora do escopo.

### P3

- Billing/economy/settlement continuam fora do escopo e intocados.

### P4

- O front door IMOB ganha gate recorrente de regressao, mas F0 global nao esta fechado.
- Mobile e WhatsApp continuam fora deste escopo.

## Status

Status: parcial/evidenciado
