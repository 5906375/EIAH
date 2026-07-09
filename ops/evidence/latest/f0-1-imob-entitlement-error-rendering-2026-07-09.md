# F0.1 — IMOB entitlement/access gate structured error rendering

## Data

2026-07-09

## Objetivo

Renderizar erro estruturado de entitlement/access gate no chat IMOB preservando `message`, `reasonCode` e CTA reais do backend.

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
- `ops/evidence/latest/f0-1-imob-entitlement-error-rendering-2026-07-09.md`
- `docs/EVIDENCE_INDEX.md`

## Contrato de erro confirmado

Origem do erro no backend:

- `apps/api/src/services/imob/imobAccessGate.ts:24` define o payload `ImobAccessGateError`.
- `apps/api/src/services/imob/imobAccessGate.ts:26` define `reasonCode`.
- `apps/api/src/services/imob/imobAccessGate.ts:27` define `message`.
- `apps/api/src/services/imob/imobAccessGate.ts:35` a `apps/api/src/services/imob/imobAccessGate.ts:39` definem CTA com `type`, `label` e `target`.
- `apps/api/src/services/imob/imobAccessGate.ts:40` a `apps/api/src/services/imob/imobAccessGate.ts:44` definem `details`.
- `apps/api/src/services/imob/imobAccessGate.ts:146` a `apps/api/src/services/imob/imobAccessGate.ts:176` montam o erro via `buildImobAccessGateError`.
- `apps/api/src/services/imob/imobAccessGate.ts:179` a `apps/api/src/services/imob/imobAccessGate.ts:186` serializam HTTP 403 como `{ ok: false, error: ... }`.

Exemplo sanitizado do payload real:

```json
{
  "ok": false,
  "error": {
    "code": "IMOB_ACCESS_DENIED",
    "reasonCode": "IMOB_ENTITLEMENT_MISSING",
    "message": "IMOB não está habilitado neste workspace. É necessária uma instalação ativa para usar este recurso.",
    "traceId": "trace-redacted",
    "product": "IMOB",
    "capability": "KNOWLEDGE_SEARCH",
    "scope": {
      "tenantId": "tenant-redacted",
      "workspaceId": "workspace-redacted"
    },
    "cta": {
      "type": "INSTALL",
      "label": "Instalar IMOB",
      "target": "/app/marketplace/imob"
    },
    "details": {
      "entitlementRequired": "IMOB_ACTIVE_INSTALLATION",
      "installationStatus": "missing"
    }
  }
}
```

## Antes

- `apps/web/src/lib/api.ts:37` a `apps/web/src/lib/api.ts:45` já preservava `ApiError.status` e `ApiError.body`.
- `apps/web/src/lib/api.ts:976` a `apps/web/src/lib/api.ts:1003` já extraía JSON e lançava `ApiError` com body preservado.
- O chat IMOB perdia a apresentação do payload em catches locais, usando textos genéricos ou copy derivada do estado de sessão, em vez de `error.body.error`.

## Depois

- `apps/web/src/pages/app/imob/chat.tsx:837` a `apps/web/src/pages/app/imob/chat.tsx:860` extraem `message`, `reasonCode` e CTA real de `ApiError.body.error`.
- `apps/web/src/pages/app/imob/chat.tsx:863` a `apps/web/src/pages/app/imob/chat.tsx:887` normalizam o erro para apresentação local sem decidir permissão e sem inventar CTA.
- `apps/web/src/pages/app/imob/chat.tsx:3367` a `apps/web/src/pages/app/imob/chat.tsx:3380` usam a apresentação estruturada no erro de `resolve-turn`.
- `apps/web/src/pages/app/imob/chat.tsx:3432` a `apps/web/src/pages/app/imob/chat.tsx:3454` usam a apresentação estruturada ao criar conversa operacional.
- `apps/web/src/pages/app/imob/chat.tsx:3730` a `apps/web/src/pages/app/imob/chat.tsx:3751` usam a apresentação estruturada em falha 403 de knowledge search.

Comportamento:

- `message` do backend vira texto principal.
- `reasonCode` aparece de forma discreta como `Código: ...`.
- CTA é renderizado somente se o backend enviar `cta.label` e `cta.target`/`href`/`url`.
- Sem CTA válido, nenhum botão é inventado.
- Sem `message`, o fallback seguro é `Não foi possível concluir esta ação neste workspace.`
- `details` não é renderizado para usuário comum.

## Prova de governança

- Fail-closed preservado: o patch só renderiza o erro negado pelo backend.
- CTA vem do backend: não há mapeamento local `reasonCode -> CTA`.
- Frontend não transforma erro em permissão.
- Sem retry automático.
- Sem bypass de entitlement.
- Sem alteração de policy backend.
- Sem alteração em `ChatAgentLauncher.tsx`.

## Testes executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `node --import tsx --test apps/web/src/pages/app/imob/chat.accessGateError.test.ts` | FAIL | Primeira tentativa falhou por alias `@/` sem `TSX_TSCONFIG_PATH`; o arquivo novo foi removido e os casos foram movidos para teste já coberto. |
| `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.accessGateError.test.ts` | PASS | Execução temporária antes de mover os casos para `chat.assistantDedupe.test.ts`; `pass 1 / fail 0`. |
| `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | PASS | Teste final focado e já referenciado no CI; `pass 1 / fail 0`. |

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:chat-launcher-render-only` | PASS | `ok=true`, `violations=[]`. |
| `pnpm check:evidence-index` | PASS | `ok=true`, `refsChecked=401`. |
| `pnpm check:docs-link-integrity` | PASS | `ok=true`, `filesChecked=15`. |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | PASS | saída vazia; sem alteração. |
| `git diff --check` | PASS | saída vazia. |
| `pnpm check:orphan-tests` | FAIL residual | Falha por 50 órfãos preexistentes; o teste novo não aparece na lista após mover os casos para `chat.assistantDedupe.test.ts`. |

## Lacunas remanescentes

### P0

- Nenhuma lacuna P0 introduzida por esta etapa.

### P1

- `pnpm check:orphan-tests` continua falhando por órfãos preexistentes fora deste escopo.

### P2

- Sem alteração de receipt/ledger/interop nesta etapa.

### P3

- Billing/economy fora do escopo.

### P4

- F0.1 fica evidenciado como subcorreção; não declara F0 global fechado.

## Status

Status: parcial/evidenciado
