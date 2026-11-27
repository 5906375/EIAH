# Piloto de temporada do IMOB

Base `d5ad280677be0a163abe845c9dccaa9a9d29e01d`. Execução em Chromium na prévia local com o apartamento fictício de Meia Praia.

| Verificação | Resultado observado |
| --- | --- |
| Pedido pelo site | A consulta da vitrine preencheu entrada, saída e hóspedes no pedido. Depois do envio, o protocolo exibiu o status Aguardando confirmação. |
| Recebimento e check-in | Na visão da equipe em outra aba do mesmo navegador, o mesmo protocolo apresentou as datas e o total estimado. A equipe confirmou a disponibilidade e registrou um check-in simulado. O histórico do pedido preservou as três transições. |
| Acompanhamento | Ao recarregar o link do hóspede, o protocolo e o total foram preservados e o status passou a Check-in registrado. |
| Navegação entre vitrine e equipe | Em Chromium, o botão Abrir visão da equipe, na consulta de datas, abriu diretamente os pedidos de temporada. O link Voltar à vitrine de temporada voltou ao filtro de temporada sem enviar um pedido. |
| Datas sobrepostas | Um segundo pedido para o mesmo imóvel e período entrou na fila. A confirmação foi rejeitada. Após a equipe marcar o período como indisponível, o mesmo status apareceu no acompanhamento do hóspede. |
| Validação de pacote | `node --check` nos módulos alterados e `wrangler deploy --dry-run --config apps/site/wrangler.jsonc` passaram. O Wrangler reconheceu 98 arquivos estáticos. |

O teste usa IndexedDB por origem. A visão da equipe é a demonstração e o registro fica no mesmo navegador. A validação não cobre criação de caso no workspace autenticado, disponibilidade em calendário externo ou check-in de uma hospedagem real.
