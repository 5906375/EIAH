# IMOB Contract Intake Result — Integration Plan

## Objetivo

Fechar o gap entre o fim do fluxo de contrato no chat IMOB e a coluna direita de contexto, fazendo o frontend persistir/renderizar `contract_intake_result` somente a partir de payload estruturado emitido pelo backend.

Regra de arquitetura aplicada:

1. definir/confirmar o contrato do resultado;
2. implementar a emissão no backend/engine;
3. deixar o launcher/chat apenas anexar e renderizar o payload resolvido.

## Escopo

- Vertical IMOB apenas.
- Sem mover regra cognitiva nova para `ChatAgentLauncher`.
- Sem atualizar `docs/EVIDENCE_INDEX.md` nesta etapa.
- Sem inventar `runId` artificial.

## Dependência estrutural

O widget `contract_intake_result` exige `runId` real. Hoje `POST /api/imob/contracts/generate` gera preview + evidência, mas não cria `run` por conta própria. Portanto:

- se o fluxo já trouxer `runId` real, o backend pode devolver o widget completo;
- se o fluxo ainda não trouxer `runId`, o fechamento da lateral direita permanece parcial;
- a integração completa depende de propagar o `runId` vindo do fluxo real de confirmação do intake.

## Ordem de implementação

### [x] Lote 1 — contrato e resposta do backend

Mudança:
- Confirmar `contract_intake_result` no contrato IMOB do backend.
- Fazer `/imob/contracts/generate` devolver `widget` estruturado quando houver `runId` válido.

Arquivo:
- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobAgentContract.ts`
- `apps/api/src/routes/imob.ts`
- `apps/web/src/lib/api.ts`

Risco:
- Médio.

Dependência:
- `runId` precisa ser real e scoped por `tenantId/workspaceId`.

Teste:
- Unitário/contrato.

### [x] Lote 2 — anexar widget no chat IMOB

Mudança:
- Passar `runId` real para `apiGenerateImobContract`.
- Anexar `widget` na mensagem final em `chat.tsx`.
- Persistir o widget no histórico via metadata já existente.

Arquivo:
- `apps/web/src/pages/app/imob/chat.tsx`

Risco:
- Médio.

Dependência:
- Lote 1 concluído.

Teste:
- Unitário + validação manual no chat.

### [x] Lote 3 — reconhecer contexto resolvido na lateral

Mudança:
- Manter `extractImobWorkbenchIntakeContext()` como fonte de leitura.
- Ajustar labels visuais para estágio concluído do contrato.

Arquivo:
- `apps/web/src/features/imob/imobWorkbenchContext.ts`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobContractIntakeResultCard.tsx`

Risco:
- Baixo.

Dependência:
- Lote 2 concluído.

Teste:
- Unitário/SSR + validação visual.

### [x] Lote 4 — cobertura de testes

Mudança:
- Cobrir persistência do widget em metadata de mensagem.
- Cobrir labels de estágio concluído.

Arquivo:
- `apps/api/src/tests/imob.chat.persistence.contract.test.ts`
- `apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx`
- `apps/web/src/features/imob/imobWorkbenchContext.test.ts` já cobre leitura de `contract_intake_result` e foi mantido sem mudança

Risco:
- Baixo.

Dependência:
- Lotes 1 a 3 concluídos.

Teste:
- Unitário obrigatório.

### [ ] Lote 5 — validação manual

Mudança:
- Rodar o fluxo no chat IMOB até mensagem final de contrato gerado.
- Confirmar que a lateral direita sai de `empty` para `ready`.

Arquivo:
- sem alteração de código

Risco:
- Baixo.

Dependência:
- Ambiente local com fluxo real disponível.

Teste:
- Visual/manual obrigatório.

## Checklist executável

- [x] Documentar o fluxo em `.md`
- [x] Confirmar contrato `contract_intake_result` na camada backend
- [x] Devolver `widget` no endpoint `/imob/contracts/generate` quando houver `runId` scoped
- [x] Aceitar `runId` opcional no client `apiGenerateImobContract`
- [x] Anexar `widget` na mensagem final do `chat.tsx` quando o backend o devolver
- [x] Humanizar estágio `contract_generated` no card e na lateral
- [x] Cobrir persistência de widget no backend
- [x] Cobrir label de estágio concluído no frontend
- [ ] Validar fluxo real no chat IMOB
- [ ] Verificar se o `runId` do draft confirmado já está chegando ao fluxo de geração

## Critério de pronto desta etapa

Esta etapa fica `parcial` se:

- o backend devolver o widget corretamente;
- o chat persistir/renderizar o widget;
- mas o fluxo real ainda não propagar `runId` até a geração final em todos os cenários.

Esta etapa só fica `completa` quando:

- o `runId` real chegar ao fim do fluxo;
- a lateral direita reconhecer o contrato gerado como contexto resolvido;
- a validação manual confirmar o comportamento no chat IMOB.
