# F0.3 — IMOB front door UX/rendering evidence

## Data

2026-07-09

## Objetivo

Consolidar evidencia visual/UX de que os estados F0.1/F0.2 aparecem corretamente na renderizacao do front door IMOB.

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`
- `ops/evidence/latest/f0-3-imob-frontdoor-ux-rendering-2026-07-09.md`
- `docs/EVIDENCE_INDEX.md`

## Estrategia de prova

Foi adotado snapshot textual deterministico no teste focado existente `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`.

Motivo:

- nao foi adicionada dependencia DOM pesada;
- o teste existente ja esta coberto pelo comando focado exigido;
- evita criar novo arquivo de teste que poderia aumentar a divida de `check:orphan-tests`;
- o renderer de teste serializa somente a surface que a UI renderiza: `message`, `card.type`, `card.title`, `card.lines`, `card.ctas` e `risk.reason`;
- nao cria regra nova de runtime nem CTA local.

## Estados comprovados

- entitlement com CTA real;
- entitlement sem CTA inventado;
- loading;
- empty;
- erro generico seguro;
- fallback desconhecido fail-closed.

## Prova de UX

### Entitlement com CTA real

Fixture sanitizada:

```json
{
  "error": {
    "message": "IMOB ainda não está instalado neste workspace.",
    "reasonCode": "IMOB_NOT_INSTALLED",
    "cta": {
      "type": "link",
      "label": "Instalar IMOB",
      "target": "/app/marketplace/imob"
    }
  }
}
```

Snapshot textual comprovado no teste:

```text
message:IMOB ainda não está instalado neste workspace.
card.line:Código: IMOB_NOT_INSTALLED
cta.label:Instalar IMOB
cta.href:/app/marketplace/imob
```

Confirmacao: mensagem, reasonCode e CTA real vindo do backend aparecem.

### Entitlement sem CTA

Fixture sanitizada:

```json
{
  "error": {
    "message": "Você não possui permissão para usar este recurso do IMOB neste workspace.",
    "reasonCode": "IMOB_PERMISSION_DENIED"
  }
}
```

Snapshot textual comprovado no teste:

```text
message:Você não possui permissão...
card.line:Código: IMOB_PERMISSION_DENIED
```

Confirmacao: nao aparece `cta.label:` nem `Instalar IMOB`.

### Loading

Snapshot textual comprovado no teste:

```text
message:Carregando o contexto IMOB...
card.title:Contexto IMOB em carregamento
```

Confirmacao: nao aparece CTA sensivel nem CTA de instalacao.

### Empty

Snapshot textual comprovado no teste:

```text
message:Ainda não há uma conversa IMOB iniciada neste workspace.
card.title:Front door IMOB pronto
```

Confirmacao: nao aparece CTA de entitlement inventado nem `IMOB_NOT_INSTALLED`.

### Erro generico seguro

Fixture sanitizada:

```json
{
  "error": {
    "message": "Falha temporária ao consultar o contexto IMOB.",
    "reasonCode": "IMOB_CONTEXT_QUERY_FAILED",
    "details": {
      "stack": "Error: sensitive stack should not render",
      "token": "secret-token-should-not-render"
    }
  }
}
```

Snapshot textual comprovado no teste:

```text
message:Falha temporária ao consultar o contexto IMOB.
card.line:Código: IMOB_CONTEXT_QUERY_FAILED
```

Confirmacao: nao aparece stack trace, token, payload sensivel nem CTA.

### Fallback desconhecido

Snapshot textual comprovado no teste:

```text
message:Não foi possível determinar o próximo estado do atendimento IMOB.
card.line:O atendimento foi pausado em modo fail-closed.
risk.reason:IMOB_FRONTDOOR_UNKNOWN_STATE
```

Confirmacao: fallback e fail-closed e nao contem CTA sensivel.

## Prova de governanca

- fail-closed preservado;
- CTA vem do backend no estado de entitlement com CTA;
- ausencia de CTA inventado comprovada nos estados sem CTA;
- sem retry automatico;
- sem bypass de entitlement;
- sem alteracao de policy/backend;
- sem alteracao de `ChatAgentLauncher.tsx`;
- sem dados reais/PII nas fixtures;
- sem alteracao em Prisma, migrations, WhatsApp, mobile, billing/economy, settlement ou provider mode.

## Testes executados

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | PASS | TAP `pass 1 / fail 0`; inclui prova textual deterministica F0.3 no arquivo existente. |

## Checks executados

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | PASS | `pass 1 / fail 0`. |
| `pnpm check:chat-launcher-render-only` | PASS | `ok:true`, `violations:[]`. |
| `pnpm check:evidence-index` | PASS | Antes da indexacao F0.3: `ok:true`, `refsChecked:402`. |
| `pnpm check:evidence-index` | PASS | Apos a indexacao F0.3: `ok:true`, `refsChecked:403`. |
| `pnpm check:docs-link-integrity` | PASS | `ok:true`, `filesChecked:15`. |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | PASS | Diff vazio. |
| `git diff --check` | PASS | Sem saida. |
| `pnpm check:orphan-tests` | FAIL residual | `blockingOrphanCount:50`; divida estrutural preexistente fora do escopo; nenhum novo arquivo de teste foi criado e `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` nao aparece como orfao. |

## Lacunas remanescentes

### P0

- Sem pendencia P0 introduzida por F0.3.
- `check:orphan-tests` permanece vermelho por divida estrutural de 50 orfaos ja existente no repositorio, sem novo orfao criado por F0.3.

### P1

- F0.3 nao altera governanca/execucao critica; apenas evidencia renderizacao local dos estados F0.1/F0.2.

### P2

- Auditoria/interop multicanal continuam fora do escopo.

### P3

- Billing/economy/settlement fora do escopo e intocados.

### P4

- Front door IMOB fica parcial/evidenciado para UX/renderizacao dos estados F0.1/F0.2; nao fecha F0 global, mobile ou WhatsApp.

## Status

Status: parcial/evidenciado
