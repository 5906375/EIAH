# PR1a.1 — kill switch fail-closed temporário do intake IMOB

Data da execução: 2026-08-13  
Escopo: correção incremental e validação local em `fix/assignment-fail-closed`  
HEAD preservado: `9f618e49d31f635a850cc6bd7941f1bedf1566b2`

## Resultado evidenciado

A contenção estática inicial foi substituída por um kill switch canônico no pacote `@eiah/core`, com chave Redis por `capabilityId + tenantId + workspaceId`. A capacidade só abre com valor explícito `enabled`; ausência, valor inválido ou falha do backend resulta em bloqueio. O estado interino padrão permanece desabilitado e upload/confirm preservam `503 + VERTICAL_CAPABILITY_NOT_AVAILABLE + retryable=false` antes de multipart, storage, draft, run ou enqueue.

O contrato do agente declara `kill_switch_controlled`, `defaultEnabled=false`, scope `tenant_workspace` e `failMode=closed`. O engine/API resolve a decisão e o launcher não foi alterado. O worker consulta o mesmo scope: quando habilitado executa o handler anterior; quando bloqueado audita e lança `UnrecoverableError`.

## Precondições confirmadas antes da correção

```text
pwd: /home/jusall/projects/EIAH_BUILDER
branch: fix/assignment-fail-closed
HEAD: 9f618e49d31f635a850cc6bd7941f1bedf1566b2
diff local PR1a.1: presente
commit/push/PR nesta execução: nenhum
```

Não houve `reset`, `checkout`, `stash`, rebase ou reescrita do commit existente.

## Política para jobs já enfileirados

- A fila continua com `attempts=3` e `removeOnFail=false`.
- Bloqueio da capability usa `UnrecoverableError`; a própria decisão de retry do BullMQ foi exercitada e retornou `shouldRetry=false`, `retryDelay=0`. Um job BullMQ real com três tentativas configuradas falhou uma única vez, permaneceu em `failed` e só completou após habilitação explícita e `job.retry()` manual.
- Não há retry automático, scheduler de redrive, endpoint administrativo ou reconciliador nesta contenção.
- Após PR1c, o operador deve primeiro habilitar a flag do tenant/workspace e só então executar redrive explícito e controlado dos jobs `failed`. As suítes habilitadas provam que o handler anterior volta a processar casos/eventos após a abertura da flag.

## Gates executados nesta rodada

| Gate | Resultado |
|---|---|
| `pnpm --filter @eiah/core typecheck` | PASS |
| `pnpm --filter @eiah/core build` | PASS |
| `imob-agent-contract.test.ts` | PASS |
| `pnpm test:imob-intake:kill-switch` | PASS — 5/5: dois endpoints sem mutações, isolamento entre tenants, backend fail-closed, política de retry e redrive BullMQ real |
| `pnpm test:imob-intake:all` | PASS — 6/6 arquivos: masking, extractor, DOCX, classifier, draft e pipeline |
| `pnpm test:imob-intake:lifecycle` | PASS — 6/6: consume/scope, `UploadedDocument`, guards pending/running |
| `pnpm test:imob-intake:confirm` | PASS — 6/6: upload/confirm, run success, enqueue e worker |
| `pnpm test:imob-intake:rc` | PASS — 3/3: upload→confirm→worker, caso/evento, HTML/DOCX/PDF e `piiMasked` |
| `pnpm test:imob-intake:e2e` | PASS — 13/13: casos/eventos, idempotência, status/simulated e PII não persistida |
| `pnpm test:imob-intake:export` | PASS — 13/13: formatos, auth, scope, PII e hashes |
| `pnpm test:imob-intake:renderer` | PASS |

Os gates integrados usaram PostgreSQL/Redis locais autenticados. As URLs especializadas de fila foram alinhadas ao mesmo Redis de teste porque o ambiente do host continha overrides antigos sem autenticação; nenhum segredo foi impresso.

## Build amplo e baseline

`pnpm --filter @eiah/api build` permanece vermelho por erros fora do diff desta contenção:

- `src/routes/governance.ts`: `errorCode` e `response` ausentes no tipo selecionado de `Run`;
- `src/services/securityRelaxationFlags.ts`: `ProcessEnv` importado de `node:process`;
- `src/workers/runWorker.ts`: chamada com dois argumentos para assinatura de um;
- `src/workers/runWorkerFailureEvidence.ts`: fonte de `packages/mcp-runner` fora do `rootDir`.

Nenhum erro do build foi reportado nos arquivos do kill switch/intake. O build amplo não é declarado verde.

## Limites

- Não implementa reserve/commit, outbox transacional, reconciliador ou `Idempotency-Key`.
- Não adiciona mecanismo remoto de administração da flag; a escrita canônica é uma função de core e a operação continua controlada.
- Exports históricos permanecem disponíveis e somente leitura.
- `ChatAgentLauncher` não foi alterado.
- Sem commit, push, PR ou alteração de ruleset.

## Classificação

`PARCIAL`: os comportamentos exigidos da contenção PR1a.1 estão evidenciados localmente, mas o build amplo da API permanece vermelho por baseline. O intake permanece `NO-GO` por padrão até PR1c e abertura explícita por tenant/workspace.
