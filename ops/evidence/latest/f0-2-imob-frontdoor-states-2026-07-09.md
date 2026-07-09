# F0.2 — Estados do front door IMOB

Data: 2026-07-09

Status: parcial/evidenciado

## Escopo

Padronizacao local dos estados visuais do front door IMOB em `apps/web/src/pages/app/imob/chat.tsx`, sem alterar `ChatAgentLauncher.tsx`, backend IMOB, runtime de agentes, WhatsApp/mobile, Prisma, billing/economy, policy backend ou contratos globais.

## Alteracoes evidenciadas

- `apps/web/src/pages/app/imob/chat.tsx`
  - adiciona `ImobFrontdoorStateKind`;
  - adiciona `buildImobFrontdoorStatePresentation(...)`;
  - cobre `loading`, `empty`, `error`, `entitlement` e fallback desconhecido;
  - delega `entitlement` para `normalizeImobAccessGateErrorPresentation(...)` da F0.1;
  - diferencia `ApiError` 401/403 como `entitlement` e demais erros como `error`;
  - renderiza loading/empty do front door com apresentacao padronizada local, sem CTA inventado.
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
  - cobre loading;
  - cobre empty;
  - cobre erro estruturado generico sem CTA;
  - cobre entitlement preservando CTA real do backend;
  - cobre entitlement sem CTA inventado;
  - cobre estado desconhecido fail-closed.

## Preservacao F0.1

- `message` vindo do backend continua preservado para entitlement/access gate.
- `reasonCode` continua discreto em linha do card.
- CTA so e renderizado quando vem do backend em payload estruturado.
- Payload sem CTA nao gera CTA local.
- Payload malformado segue fallback seguro.

## ChatAgentLauncher

Comando:

```bash
git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx
```

Resultado: diff vazio.

## Validacoes executadas

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
```

Resultado:

```text
pass 1
fail 0
```

```bash
pnpm check:chat-launcher-render-only
```

Resultado:

```json
{
  "ok": true,
  "check": "check:chat-launcher-render-only",
  "checkedFile": "apps/web/src/components/agents/ChatAgentLauncher.tsx",
  "violations": []
}
```

```bash
pnpm check:evidence-index
```

Resultado antes da indexacao desta evidencia:

```json
{
  "ok": true,
  "check": "check:evidence-index",
  "refsChecked": 401
}
```

Resultado apos a indexacao desta evidencia:

```json
{
  "ok": true,
  "check": "check:evidence-index",
  "refsChecked": 402
}
```

```bash
pnpm check:docs-link-integrity
```

Resultado:

```json
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

```bash
git diff --check
```

Resultado: sem saida.

```bash
pnpm check:orphan-tests
```

Resultado:

```json
{
  "ok": false,
  "check": "check:orphan-tests",
  "totalTestFiles": 289,
  "orphanCount": 50,
  "blockingOrphanCount": 50
}
```

Observacao: falha estrutural residual fora do escopo desta subcorrecao; `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` ja existia e nao aparece como novo orfao.

## Limitacoes

- Esta evidencia nao declara fechamento operacional global do front door multicanal.
- Esta evidencia nao altera WhatsApp, mobile ou backend.
- Esta evidencia nao promove novas regras cognitivas no `ChatAgentLauncher`.
- `pnpm check:orphan-tests` permanece vermelho por 50 orfaos estruturais preexistentes fora do escopo desta frente.

## Conclusao

A subcorrecao F0.2 esta parcial/evidenciada: os estados locais do front door IMOB foram padronizados no ponto permitido, preservando F0.1 e mantendo `ChatAgentLauncher.tsx` intocado.
