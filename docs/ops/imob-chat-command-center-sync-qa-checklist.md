# IMOB Chat x Command Center - Checklist de Saúde (P1 QA)

Data de referência: 9 de abril de 2026

## Objetivo

Validar sincronia operacional entre:
- Chat IMOB (mensagem e conclusão)
- Runs (execução e trilha)
- Command Center (dossiê/comprovante e leitura operacional)

## Escopo do checklist

- Correlação por `conversationId + threadId + runId`
- Fechamento de execução com comprovante/recibo
- Consistência de metadados de auditoria (`auditRunId`)
- Consistência de artefatos (`bundlePath`, `receiptPath`)

## Pré-condições

- Ambiente com `api` e `web` ativos
- Workspace de homologação IMOB
- Token válido com acesso ao chat IMOB e command center

## Checklist (OK/ALERTA)

1. Run finaliza com `status=success` e `txId` preenchido
- Esperado: `OK`
- Evidência: payload de run + card final do chat

2. Mensagem final no chat contém `runId`, `txId`, `bundlePath`, `receiptPath`
- Esperado: `OK`
- Evidência: `GET /api/imob/chat/conversations/:conversationId/messages`

3. `completionState` do fechamento é coerente
- Esperado: `success_full` quando houver `txId + bundlePath + receiptPath`
- Esperado: `success_partial` quando faltar artefato obrigatório

4. `auditRunId` não aponta para run antigo sem correlação
- Esperado: `OK`
- Evidência: metadata da conversa e mensagens recentes

5. Snapshot da conversa reflete vínculos reais
- Esperado: `business.linkedRuns >= 1`, `linkedReceipts >= 1`, `linkedBundles >= 1` após fechamento completo
- Evidência: `GET /api/imob/chat/conversations/:conversationId/snapshot`

6. Export da conversa mantém os mesmos links de prova
- Esperado: mensagem exportada com mesmo `runId`, `txId`, `bundlePath`, `receiptPath`
- Evidência: `GET /api/imob/chat/conversations/:conversationId/export?format=json`

7. Mismatch de correlação é bloqueado
- Esperado: `409 RUN_THREAD_MISMATCH` ou `409 RUN_CONVERSATION_MISMATCH`
- Evidência: tentativa controlada com `runId` em thread/conversa errada

8. Não ocorre `run.action.observe.failed` por `agentId is not defined`
- Esperado: `OK`
- Evidência: `run_events` sem esse erro no período de validação

## Critério de aprovação

- Aprovado quando todos os itens críticos (1,2,3,4,5,6,7,8) estiverem `OK`.
- Se qualquer item crítico ficar `ALERTA`, bloquear promoção para produção e abrir correção P0/P1.

## Evidências mínimas para auditoria

- ID do run validado
- Print do card final no chat
- JSON de mensagens da conversa
- JSON de snapshot da conversa
- JSON de export da conversa
- Registro do Command Center (dossiê/comprovante) correspondente

