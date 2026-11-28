# Front Door — histórico e sequência da conversa v1

## Apresentação e escopo

O painel lateral oferece Nova conversa, contexto de custo/quota/agente, menus IMOB, resumo navegável da sequência atual e conversas IMOB persistidas. A sequência usa somente trechos dos pedidos do usuário na ordem original; clicar leva à mensagem de origem. Não gera interpretação, resultado ou resumo semântico com IA. Não muda contratos de resposta/handoff; o launcher apenas renderiza dados e navegação.

O histórico persistido permanece o histórico IMOB existente. A sequência da conversa atual funciona também nos outros contextos, mas esta alteração não cria persistência geral para todas as verticais. O histórico e suas mutações só aparecem com a autoridade IMOB já confirmada. Cada requisição é autorizada novamente no servidor.

## Contrato HTTP aditivo

Base: `/api/imob/chat/conversations`.

- `GET ?limit=1..100&q=texto`: conversas do titular autenticado e com vínculo ativo no tenant/workspace. Busca sem distinção de caixa/acentos no título e na prévia da última mensagem, antes do limite de saída. Mantém limites de leitura legados (até 300 eventos de criação e 1200 mensagens, titularidade por até 2000 audit runs). Não é busca de texto integral em todo o arquivo.
- A listagem inclui `capabilities: { search: true, rename: true, delete: true }`. Frontends antigos ignoram o campo; frontends novos mantêm renomear/excluir desabilitados se a API não os anunciar, e filtram localmente a lista carregada quando a API antiga ignora `q`.
- `PATCH /:conversationId`, JSON `{ "title": "..." }`: título canônico de 1 a 120 caracteres, sem caracteres de controle, normalizado por trim. HTTP 200 `{ ok, conversationId, title }`; inválido → 400 `INVALID_CONVERSATION_TITLE`.
- `DELETE /:conversationId`, JSON `{ "confirm": true }`: exige confirmação explícita. HTTP 200 `{ ok, conversationId, deleted: true }`; sem confirmação → 400 `CONVERSATION_DELETE_CONFIRMATION_REQUIRED`.
- Os gates de identidade, membership ativa, entitlement e titularidade existentes permanecem. Conversa de outro titular/escopo não é revelada; erros de acesso falham fechados. Não aceita tenant/workspace/ator declarados no corpo como autoridade.

## Exclusão e auditoria

Renomear/excluir não sobrescreve nem apaga `MemoryEvent`. Acrescenta eventos `conversation.renamed` e `conversation.deleted` com `conversationId` e `actorUserId` vindos do contexto autenticado. Um lock transacional por tenant/workspace/conversa serializa as mutações. Qualquer marcador de exclusão torna a conversa invisível na lista e faz o gate dos endpoints de mensagens/threads/entrevista/snapshot/export/escrita devolver 404. Não há restauração ou exclusão física de evidências nesta versão.

Excluir uma conversa não exclui imóveis, proprietários, contratos, documentos, runs ou dados operacionais. A interface explica que a conversa não poderá ser reaberta e que os registros de auditoria são preservados. Cancelar não envia DELETE. Excluir a conversa atualmente aberta inicia uma conversa local nova usando o handler já existente.

## Concorrência e publicação

A troca de usuário/workspace desmonta o histórico; respostas antigas não atualizam o painel. Restauração solicitada busca apenas a conversa selecionada, sem fallback para outra se ela foi excluída; reset/nova conversa invalida respostas de restauração e persistência atrasadas. Isso evita que uma resposta antiga repovoe a conversa atual.

Publicar a API antes do frontend para habilitar todas as ações. Com API anterior, busca local e leitura continuam disponíveis, mas renomear/excluir permanecem indisponíveis. Implantação de API e frontend deve ser autorizada e validada separadamente. Esta tarefa não publica serviços nem modifica banco de staging/produção; testes usam banco descartável local com migrations existentes.
