# F0.4 — IMOB front door regression checklist

## Data

2026-07-09

## Objetivo

Consolidar evidencia de nao-regressao dos pacotes F0.1, F0.2 e F0.3 do front door IMOB.

## Escopo

Este PR e documental/evidencial. Nao altera comportamento, backend, policy, runtime amplo ou `ChatAgentLauncher`.

## Evidencias consolidadas

- F0.1: `ops/evidence/latest/f0-1-imob-entitlement-error-rendering-2026-07-09.md`
- F0.2: `ops/evidence/latest/f0-2-imob-frontdoor-states-2026-07-09.md`
- F0.3: `ops/evidence/latest/f0-3-imob-frontdoor-ux-rendering-2026-07-09.md`

## Provas executadas

- Teste focado IMOB: `PASS`, TAP `pass 1 / fail 0`.
- `check:chat-launcher-render-only`: `PASS`, `ok:true`, `violations:[]`.
- `check:evidence-index`: `PASS`, `ok:true`, `refsChecked:403` antes da indexacao F0.4.
- `check:docs-link-integrity`: `PASS`, `ok:true`, `filesChecked:15`.
- `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx`: vazio.
- `git diff -- apps/web/src/pages/app/imob/chat.tsx`: vazio.
- `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`: vazio.
- `git diff --check`: sem saida.

## Resultado consolidado

- F0.1 continua preservando `message`, `reasonCode` e CTA real vindo do backend para entitlement/access gate.
- F0.2 continua preservando os estados `loading`, `empty`, `error`, `entitlement` e fallback seguro.
- F0.3 continua provando UX/rendering por snapshot textual deterministico no teste focado existente.
- `ChatAgentLauncher` permanece render-only e sem diff.
- `apps/web/src/pages/app/imob/chat.tsx` permanece sem diff nesta etapa F0.4.
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` permanece sem diff nesta etapa F0.4.
- Evidence Index permanece integro nos checks executados antes da indexacao F0.4.

## Prova de governanca

- Fail-closed preservado.
- Sem CTA inventado.
- Sem bypass de entitlement.
- Sem retry automatico.
- Sem alteracao de backend/policy.
- Sem PII.
- Sem drift documental detectado pelos checks executados.
- Sem alteracao em Prisma, migrations, WhatsApp, mobile, billing/economy, settlement, provider mode ou runtime amplo de agentes.

## Checks executados

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | PASS | TAP `pass 1 / fail 0`. |
| `pnpm check:chat-launcher-render-only` | PASS | `ok:true`, `violations:[]`. |
| `pnpm check:evidence-index` | PASS | Antes da indexacao F0.4: `ok:true`, `refsChecked:403`. |
| `pnpm check:evidence-index` | PASS | Apos a indexacao F0.4: `ok:true`, `refsChecked:404`. |
| `pnpm check:docs-link-integrity` | PASS | `ok:true`, `filesChecked:15`. |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | Sem alteracao. |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | Sem alteracao F0.4. |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | Sem alteracao F0.4. |
| `git diff --check` | PASS | Sem saida. |
| `pnpm check:orphan-tests` | FAIL residual | `blockingOrphanCount:50`; divida estrutural preexistente fora do escopo, nao tratada como regressao F0.4. |

## Lacunas remanescentes

### P0

- Nenhuma pendencia documental/CI introduzida por F0.4.
- `check:orphan-tests` permanece vermelho por 50 orfaos estruturais preexistentes fora deste escopo.

### P1

- F0.4 nao altera governanca/execucao critica; apenas consolida nao-regressao documental/evidencial.

### P2

- Auditoria/interop multicanal continuam fora do escopo.

### P3

- Billing/economy/settlement fora do escopo e intocados.

### P4

- Front door IMOB fica parcial/evidenciado para nao-regressao F0.1/F0.2/F0.3.
- F0 global, mobile e WhatsApp nao estao fechados por esta evidencia.

## Status

Status: parcial/evidenciado
