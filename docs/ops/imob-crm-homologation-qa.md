# IMOB_CRM: Documento de Produto e QA para Homologação

## Objetivo

Este documento define o comportamento esperado do agente `IMOB_CRM` na experiência do usuário, os cenários prioritários de validação em homologação e os critérios mínimos para considerar o agente apto para rollout controlado.

O foco é validar:

- coerência com a arquitetura `agent-driven`;
- comportamento conversacional esperado para a vertical IMOB;
- preservação de funcionalidades existentes;
- ausência de dependência indevida do `ChatAgentLauncher` para regras de negócio;
- cobertura funcional do fluxo operacional e comercial do CRM;
- redução progressiva do fallback legado.

## Escopo

Este documento cobre o agente `IMOB_CRM` nos fluxos:

- consulta comercial de caso;
- CRUD operacional de `owner`, `property`, `lead` e `case`;
- atualização conversacional;
- leitura contextual do caso;
- resolução de pendências documentais;
- deduplicação de cadastro;
- processamento em lote;
- fallback legado residual.

Não cobre:

- regras genéricas de UI fora do contexto IMOB;
- comportamento de outros agentes da plataforma;
- rollout em produção.

## Princípios de Produto

Na experiência do usuário, o `IMOB_CRM` deve:

- atuar como continuidade natural do chat do IMOB;
- parecer um especialista da vertical, não um bot isolado;
- responder com intenção resolvida, não com detalhe técnico de backend;
- usar o contexto do caso e da thread antes de pedir dados novamente;
- expor pendências, bloqueios e próximo passo de forma objetiva;
- manter quick replies poucas, úteis e válidas como input;
- não depender do `ChatAgentLauncher` para inventar regra de resposta.

## Comportamento Esperado por Jornada

### 1. Captação de proprietário

Objetivo:
- cadastrar ou atualizar proprietário sem criar duplicidade desnecessária.

Entrada típica:
- usuário informa nome, telefone, e-mail, documento;
- usuário corrige um dado existente;
- usuário anexa arquivo ligado ao proprietário;
- usuário pede consulta de proprietário já mencionado antes na conversa.

Leitura esperada do agente:
- extrair os campos relevantes do texto ou do contexto da thread;
- verificar se já existe proprietário compatível por nome, documento, telefone ou referência anterior;
- usar o contexto do caso atual antes de assumir criação de novo cadastro.

Decisão esperada:
- se existir um proprietário compatível, priorizar atualização ou reconciliação;
- se houver ambiguidade entre mais de um proprietário, pedir clarificação objetiva;
- se faltar informação mínima para avançar, expor pendência objetiva;
- se houver informação suficiente, registrar ou atualizar o proprietário.

Saída esperada:
- confirmação curta quando o update for aplicado;
- aviso de dedupe quando um cadastro existente for reaproveitado;
- lista objetiva do que ainda falta;
- indicação do próximo passo comercial ou operacional.

Pendências mais prováveis:
- documento ausente;
- telefone ausente;
- e-mail ausente;
- vínculo com imóvel ainda não definido.

Critérios de QA:
- não criar duplicidade silenciosa;
- não perder contexto do proprietário já mencionado na thread;
- não pedir novamente dado já informado no mesmo fluxo;
- responder com nome do proprietário correto e estado atualizado.

### 2. Captação de imóvel

Objetivo:
- cadastrar ou atualizar imóvel com contexto operacional mínimo.

Entrada típica:
- usuário cadastra um imóvel único;
- usuário envia múltiplas linhas para cadastro em lote;
- usuário corrige cidade, preço, endereço ou finalidade;
- usuário vincula imóvel a um proprietário.

Leitura esperada do agente:
- separar tipo, finalidade, cidade, endereço, preço e identificadores de referência;
- detectar se o texto representa item único ou lote;
- tentar localizar imóvel compatível por endereço, referência, cidade ou contexto atual.

Decisão esperada:
- se o imóvel já existir, reconciliar antes de criar novo cadastro;
- se houver dados suficientes, criar ou atualizar o imóvel;
- se faltarem dados críticos, expor claramente as pendências;
- se o usuário estiver em lote, processar item a item.

Saída esperada:
- confirmação da criação ou atualização;
- resumo consolidado em cenário de lote;
- pendências objetivas quando faltarem preço, endereço ou proprietário;
- próximo passo sugerido para avanço do caso.

Pendências mais prováveis:
- preço não informado;
- endereço incompleto;
- cidade ausente;
- proprietário não vinculado;
- finalidade não identificada.

Critérios de QA:
- não cadastrar duplicado por pequena variação textual de endereço;
- tratar lote sem quebrar a conversa em múltiplas respostas independentes;
- manter a ordem dos itens no resumo final;
- explicitar claramente o que ficou pendente por imóvel.

### 3. Qualificação de lead

Objetivo:
- estruturar o lead para avanço comercial.

Entrada típica:
- usuário informa nome do lead, objetivo, cidade, orçamento, telefone, e-mail;
- usuário complementa um lead já existente;
- usuário pergunta o que falta para o lead avançar.

Leitura esperada do agente:
- identificar se o lead já existe no contexto atual;
- captar dados de qualificação comercial e contato;
- relacionar o lead ao caso corrente quando aplicável.

Decisão esperada:
- se o lead já existir, atualizar campos pendentes ou corrigidos;
- se não existir e houver informação suficiente, criar contexto do lead;
- se faltarem dados de qualificação, informar pendências;
- se os dados estiverem completos, sinalizar pronto para avançar.

Saída esperada:
- confirmação de criação ou atualização;
- pendências de qualificação em formato curto;
- indicação de próximo movimento comercial;
- consistência entre lead consultado e lead atualizado.

Pendências mais prováveis:
- orçamento;
- cidade de interesse;
- telefone;
- e-mail;
- objetivo de compra, locação ou venda.

Critérios de QA:
- o agente não deve trocar um lead por outro com nome parecido;
- o estado do lead deve refletir o último dado informado;
- a resposta deve indicar com clareza se o lead está apto a avançar ou não;
- o próximo passo deve estar alinhado à qualificação capturada.

### 4. Leitura comercial do caso

Objetivo:
- responder status, bloqueios e próximo passo de um caso.

Entrada típica:
- usuário pergunta status do caso;
- usuário pergunta o que falta;
- usuário pergunta qual o bloqueio atual;
- usuário pergunta qual o próximo passo.

Leitura esperada do agente:
- montar `caseContext` a partir do caso persistido, lead, owner, property e histórico útil;
- identificar jornada, momento comercial e eventuais bloqueios;
- evitar responder de forma genérica se o caso tiver contexto suficiente.

Decisão esperada:
- se houver contexto de caso suficiente, responder de forma consultiva;
- se o caso estiver incompleto, explicitar a principal pendência;
- se não houver bloqueio, dizer isso claramente;
- se houver recomendação objetiva, apontar próximo movimento.

Saída esperada:
- resposta curta com:
  - momento comercial;
  - pendência principal;
  - bloqueio atual;
  - próximo movimento.

Critérios de QA:
- a resposta deve ser aderente ao caso correto;
- o resumo não pode contradizer o estado persistido;
- pendência principal e próximo movimento precisam ser coerentes entre si;
- a linguagem deve ser consultiva, não técnica.

### 5. Atualização operacional

Objetivo:
- editar dados de `owner`, `property`, `lead` ou `case` por linguagem natural.

Entrada típica:
- usuário pede para editar telefone, cidade, documento, preço, e-mail ou endereço;
- usuário pede exclusão ou arquivamento;
- usuário pede correção de dado cadastral incorreto.

Leitura esperada do agente:
- identificar corretamente qual entidade será alterada;
- identificar qual campo será alterado;
- usar contexto anterior quando o usuário não repetir a entidade inteira.

Decisão esperada:
- se houver dados suficientes, aplicar a atualização;
- se a ação for destrutiva, pedir confirmação;
- se a entidade estiver ambígua, pedir clarificação objetiva;
- se não houver dado suficiente para editar, apontar exatamente o que falta.

Saída esperada:
- confirmação de update aplicado;
- confirmação pendente em exclusões;
- mensagem curta indicando campo alterado;
- estado resultante ou pendência remanescente.

Critérios de QA:
- não atualizar a entidade errada;
- não excluir sem confirmação explícita;
- refletir corretamente o valor final persistido;
- manter a conversa contextual sem exigir repetição desnecessária.

### 6. Documento e validação

Objetivo:
- usar anexos para resolver pendências documentais e de CRM.

Entrada típica:
- usuário anexa documento do proprietário;
- usuário envia um documento para um caso em aberto;
- usuário pede aplicação de sugestão extraída do documento.

Leitura esperada do agente:
- validar o documento contra `case` e `owner` relacionados;
- identificar se o anexo resolve uma pendência concreta;
- produzir sugestão de CRM quando o documento trouxer dado novo ou corrigido.

Decisão esperada:
- se o documento resolver pendência, atualizar o estado correspondente;
- se surgir sugestão de CRM, oferecer caminhos claros para incluir, editar ou descartar;
- se o vínculo do documento estiver ambíguo, pedir esclarecimento curto.

Saída esperada:
- indicação do que foi identificado no documento;
- explicação objetiva do impacto no caso ou proprietário;
- sugestão de CRM com ação clara;
- atualização do status quando aplicável.

Critérios de QA:
- o anexo deve produzir efeito compreensível;
- a sugestão de CRM não deve ser vaga;
- o usuário deve entender se o documento foi apenas registrado ou realmente aproveitado;
- o caso e o owner corretos devem ser afetados.

### 7. Revisão de lote

Objetivo:
- processar várias entradas de CRM em um único turno.

Entrada típica:
- usuário envia várias linhas de imóveis;
- usuário envia várias linhas de cadastros mistos;
- usuário pede revisão do resultado de um lote.

Leitura esperada do agente:
- detectar a natureza em lote da mensagem;
- separar os itens;
- processar cada item com o mesmo padrão de validação usado no fluxo unitário.

Decisão esperada:
- tratar item a item;
- criar, atualizar, ignorar ou marcar pendência conforme cada caso;
- manter consolidado o resultado final do lote.

Saída esperada:
- resumo consolidado do que foi feito;
- indicação do que ficou pendente;
- resultado escaneável, preferencialmente enumerado;
- sem perda da ordem lógica dos itens processados.

Critérios de QA:
- nenhum item deve desaparecer silenciosamente do retorno;
- o total processado deve bater com o total recebido;
- itens inválidos devem aparecer como pendentes ou ignorados de forma explícita;
- a resposta final deve ser útil para próxima ação operacional.

## Exemplos Reais de Diálogo

### 1. Consulta de caso

Usuário:
`qual status desse caso?`

Resposta esperada:
`Lead Carlos Silva para compra em Itapema. Momento comercial: Lead com dados pendentes. Jornada: Qualificação.`

`Pendência principal: faixa de orçamento.`

`Bloqueio atual: nenhum bloqueio comercial registrado.`

`Próximo movimento: qualificar o interesse do lead Carlos Silva e vincular um imóvel aderente.`

### 2. Atualização de proprietário

Usuário:
`documento do proprietário João da Silva 12345678901`

Resposta esperada:
`Documento do proprietário João da Silva atualizado com sucesso.`

`Pendências atuais: sem pendências.`

`Próximo passo: vincular o proprietário ao próximo imóvel ou etapa documental.`

### 3. Atualização de lead

Usuário:
`cidade de interesse do lead Maria Balneário Camboriú`

Resposta esperada:
`Cadastro do lead Maria atualizado com sucesso.`

`Pendências atuais: faixa de orçamento.`

`Para seguir com Maria, ainda preciso de: faixa de orçamento.`

### 4. Consulta de proprietário

Usuário:
`consultar proprietário João da Silva`

Resposta esperada:
`Proprietário João da Silva`

`Telefone: 47999998888`

`E-mail: joao@email.com`

`Status: pronto para revisão`

`Pendências: sem pendências`

### 5. Lista de imóveis

Usuário:
`listar imóveis em Itajaí`

Resposta esperada:
`Encontrei 3 imóvel(is) no CRM operacional do IMOB.`

`Resumo atual: Rua X, 120 (pronto para revisão) | Imóvel ABC123 (com dados pendentes) | Rua Y, 45 (pronto para revisão).`

`Próximo passo: abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais.`

### 6. Exclusão com confirmação

Usuário:
`excluir imóvel abc123`

Resposta esperada:
`Confirme a exclusão do imóvel Imóvel ABC123 para arquivar esse cadastro.`

Usuário:
`confirmar exclusão do imóvel abc123`

Resposta esperada:
`Imóvel arquivado com sucesso.`

### 7. Lote

Usuário:
`apartamento | venda | Itapema | Rua 1, 100`

`casa | locação | Itajaí | Rua 2, 45`

Resposta esperada:
`Processei 2 operação(ões) deste lote no IMOB.`

`1. Imóvel de venda em Itapema criado com pendências mínimas.`

`2. Imóvel de locação em Itajaí criado com pendências mínimas.`

## Checklist de UX para Validação

### Continuidade e posicionamento do agente

- o agente entra como continuidade da conversa, sem parecer troca brusca de bot;
- o usuário percebe o agente como especialista da vertical IMOB;
- o `ChatAgentLauncher` apenas renderiza o resultado resolvido;
- nenhuma regra nova de comportamento aparenta nascer na UI.

### Qualidade da resposta

- a resposta vem resolvida no domínio IMOB, e não genérica;
- quando existir `caseContext`, ele é usado;
- o agente evita pedir novamente dados já presentes na thread ou no caso;
- pendências são curtas e objetivas;
- bloqueios são explícitos quando existirem;
- o próximo passo é acionável.

### Operacional

- listagens são curtas e escaneáveis;
- consultas retornam ficha útil e contextualizada;
- updates aplicam ou deixam claro o que falta;
- exclusões pedem confirmação;
- dedupe evita criar cadastro duplicado silenciosamente.

### Documento e CRM suggestion

- anexos tentam resolver pendência real antes de apenas registrar upload;
- sugestões de CRM deixam claro se a ação é incluir, editar ou descartar;
- o usuário entende o impacto do documento no estado do caso.

### Lote

- o agente processa lote sem fragmentar a resposta;
- o resumo final deixa claro quantos itens foram processados;
- cada item relevante do lote tem desfecho compreensível.

### UX e launcher

- quick replies são poucas, úteis e válidas como input;
- `defaultNextStep` não vira chip automaticamente;
- o launcher não injeta UX genérica fora do contrato do agente.

### Legado e fallback

- os módulos novos resolvem os fluxos principais antes do legado;
- o fallback legado é residual ou inexistente;
- a telemetria `crm_legacy_fallback_invoked` tende a zero.

## Camada de Evidência e Confiabilidade (Busca -> Validação -> Citação)

Objetivo:
- garantir respostas comerciais e técnicas sustentadas por prova rastreável;
- aumentar confiança do cliente sem expor detalhe técnico no chat;
- manter o chat IMOB em linguagem de negócio, deixando detalhe técnico no Command Center.

### Escopo funcional

Essa camada deve ser acionada quando a resposta envolver:
- justificativa de preço, valorização, liquidez ou cenário de mercado;
- viabilidade técnica, documental ou jurídica de imóvel/caso;
- afirmação crítica que impacte decisão comercial.

Não deve ser usada para:
- mensagens operacionais simples de cadastro sem afirmação crítica;
- respostas de navegação de fluxo (menu, próximo passo, confirmação curta).

### Política de fontes e prioridade

Prioridade obrigatória de fontes:
1. fontes oficiais e índices estruturados (ex.: FIPEZAP, IBGE, BACEN, prefeitura/SEPLAN);
2. documentos internos validados (CRM, dossiê, comprovante, base corporativa versionada);
3. portais especializados e notícias setoriais como contexto complementar.

Regras:
- notícia não substitui dado oficial ou documento do ativo;
- toda evidência precisa de recência e origem explícitas;
- se houver conflito entre fontes, prevalece a de maior prioridade e melhor recência.

### Regra de execução no agente

Pipeline obrigatório:
1. `Busca`: coletar evidências elegíveis para a pergunta do usuário;
2. `Validação`: checar aderência ao caso/imóvel, recência e confiabilidade;
3. `Citação`: responder no chat de forma curta e registrar fonte no Command Center.

Regra de segurança:
- sem evidência suficiente, o agente não deve afirmar como fato;
- deve responder com ressalva operacional e próximo passo de confirmação.

### Padrão de resposta no chat IMOB

No chat:
- resposta curta, humana e orientada a negócio;
- no máximo uma conclusão principal por mensagem;
- incluir próximo passo acionável quando aplicável.

No Command Center (dossiê/comprovante):
- fonte, trecho de prova, timestamp e contexto do caso;
- trilha auditável da evidência usada na resposta.

Templates recomendados:
- evidência alta: `Com base nas evidências atuais, o cenário indica X. Próximo passo: Y.`
- evidência parcial: `Há indícios de X. Vou confirmar o ponto crítico e retorno com comprovante.`
- evidência inconclusiva: `Ainda não há evidência suficiente para confirmar com segurança. Próximo passo: validar com o time responsável.`

### Critérios de aceite QA (homologação)

Para aprovação desta camada:
- toda afirmação crítica deve ter evidência rastreável;
- chat não deve exibir IDs técnicos, logs ou termos internos de backend;
- dossiê/comprovante deve refletir a mesma decisão apresentada no chat;
- sem promessa de conclusão quando a evidência estiver parcial ou inconclusiva;
- priorização de fonte deve seguir a ordem oficial > interno validado > portal.

### Matriz de homologação da camada de evidência

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-EVD-001 | Caso com imóvel ativo e dados de mercado disponíveis | `esse preço está acima do mercado?` | Resposta consultiva curta com conclusão e próximo passo | Nenhuma mutação indevida no cadastro; apenas leitura contextual do caso | `imob_evidence_lookup_started`, `imob_evidence_cited`, sem `imob_truth_check_blocked` | Print do chat + dossiê/comprovante com fonte e recência registradas | Pendente |
| IMOB-CRM-EVD-002 | Caso com documentação técnica parcial | `esse imóvel é tecnicamente viável para venda agora?` | Resposta com ressalva quando faltar prova crítica | Estado do caso permanece sem fechamento prematuro | `imob_truth_check_partial_evidence` | Print do chat com ressalva + dossiê mostrando lacuna objetiva | Pendente |
| IMOB-CRM-EVD-003 | Fontes oficiais e notícia com informação divergente | `vi uma notícia dizendo que valorizou mais de 20%, procede?` | Agente prioriza fonte oficial e trata notícia como complementar | Nenhuma persistência incorreta por fonte de baixa prioridade | `imob_evidence_source_rank_applied` | Evidência de ranking aplicado no dossiê + resposta coerente no chat | Pendente |
| IMOB-CRM-EVD-004 | Evidência insuficiente para afirmação forte | `pode garantir que esse imóvel não terá bloqueio jurídico?` | Agente não garante; responde com limite e ação de validação | Nenhuma marcação de status “aprovado” sem prova | `imob_truth_check_blocked` | Print do chat sem promessa + comprovante com bloqueio de confiança | Pendente |
| IMOB-CRM-EVD-005 | Caso com resposta comercial já emitida | `me mostra a prova disso` | Chat direciona para evidência sem poluir UX; prova disponível no Command Center | Nenhuma alteração indevida no CRM | `imob_evidence_artifact_opened` | Registro de acesso ao artefato + fonte visível no dossiê/comprovante | Pendente |
| IMOB-CRM-EVD-006 | Fluxo de captação em andamento sem afirmação crítica | `cadastrar imóvel` | Fluxo segue normal, sem acionar camada de evidência desnecessariamente | Cadastro e pendências seguem comportamento padrão do fluxo | Sem `imob_evidence_lookup_started` neste turno | Print do chat comprovando resposta operacional direta | Pendente |

### Telemetria obrigatória da camada

Monitorar em homologação:
- `% de respostas críticas com evidência citada`;
- `% de respostas bloqueadas por evidência insuficiente`;
- tempo médio para responder com evidência válida;
- `% de divergência entre chat e dossiê/comprovante`;
- `% de respostas com detalhe técnico indevido no chat`.

## Checklist Funcional de Homologação

Executar pelo menos um cenário válido para cada item:

- criar proprietário;
- consultar proprietário;
- atualizar proprietário;
- arquivar proprietário;
- criar imóvel;
- listar imóveis;
- consultar imóvel;
- atualizar imóvel;
- arquivar imóvel;
- criar lead;
- listar leads;
- consultar lead;
- atualizar lead;
- consultar status de caso;
- atualizar caso por linguagem natural;
- enviar documento e validar sugestão CRM;
- executar lote com múltiplos itens;
- validar caso com dados incompletos;
- validar caso com dados já persistidos na thread;
- validar cenário com potencial duplicidade.

## Matriz de Homologação

Esta matriz converte o comportamento esperado do `IMOB_CRM` em cenários executáveis para QA em homologação.

Colunas:

- `ID do cenário`: identificador estável para execução e registro;
- `pré-condição`: estado mínimo necessário antes do teste;
- `input do usuário`: mensagem realista no chat IMOB;
- `resultado esperado`: resposta e efeito de negócio esperados;
- `resultado persistido esperado no CRM`: estado que deve ficar gravado após a ação;
- `telemetria esperada`: sinais observáveis que ajudam a validar o fluxo;
- `evidência a capturar pelo QA`: prova objetiva para auditoria da execução;
- `status QA`: campo para preenchimento do time.

### Proprietário

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-OWN-001 | Não existe proprietário compatível no workspace | `cadastrar proprietário João da Silva telefone 47999998888 email joao@email.com cpf 12345678901` | Proprietário criado com confirmação objetiva; resposta informa sucesso e próximas pendências, se houver | Novo `owner` gravado com nome, telefone, e-mail e documento informados | Sem `crm_legacy_fallback_invoked` | Captura da resposta no chat e registro do proprietário criado no CRM | Pendente |
| IMOB-CRM-OWN-002 | Existe proprietário João da Silva com mesmo CPF | `cadastrar proprietário João da Silva cpf 12345678901` | Agente evita duplicidade; reaproveita cadastro existente ou informa reconciliação | Nenhum novo `owner` duplicado criado; cadastro existente permanece como referência única | Sem duplicidade nova; sem `crm_legacy_fallback_invoked` | Captura da resposta e evidência de que a contagem de proprietários com o CPF não aumentou | Pendente |
| IMOB-CRM-OWN-003 | Existe proprietário com nome igual e sem documento confirmado | `atualizar telefone do proprietário João da Silva para 47911112222` | Agente atualiza o proprietário correto ou pede clarificação objetiva se houver ambiguidade | Telefone alterado somente no `owner` correto, sem impactar outro registro | Sem update em entidade errada; fallback legado residual ou ausente | Captura da resposta e consulta do cadastro após a atualização | Pendente |
| IMOB-CRM-OWN-004 | Existe proprietário com telefone e e-mail, mas sem documento | `o cpf do João da Silva é 12345678901` | Documento atualizado; pendência documental removida, se for o caso | Documento persistido no `owner`; pendência correspondente removida do estado do caso quando aplicável | Sem `crm_legacy_fallback_invoked` | Captura da resposta, cadastro do proprietário atualizado e estado da pendência antes/depois | Pendente |
| IMOB-CRM-OWN-005 | Existe proprietário em contexto recente da thread | `qual o e-mail dele mesmo?` | Agente usa contexto da thread e retorna o proprietário correto sem pedir identificação novamente | Nenhuma alteração de persistência; somente leitura correta do `owner` contextual | Sem perda de contexto; sem fallback legado em fluxo comum | Captura da resposta e prova do proprietário referenciado no contexto da thread | Pendente |
| IMOB-CRM-OWN-006 | Existe proprietário ativo | `excluir proprietário João da Silva` | Agente pede confirmação antes de arquivar | Nenhuma alteração persistida antes da confirmação | Sem arquivamento antes da confirmação | Captura da resposta de confirmação pendente e consulta provando que o registro ainda está ativo | Pendente |
| IMOB-CRM-OWN-007 | Cenário anterior em aberto aguardando confirmação | `confirmar exclusão do proprietário João da Silva` | Proprietário arquivado com confirmação explícita | `Owner` marcado como arquivado/inativo conforme regra atual do CRM | Evento destrutivo só após confirmação; sem entidade errada | Captura da resposta e evidência do estado arquivado no CRM | Pendente |

### Imóvel

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-PROP-001 | Não existe imóvel compatível | `cadastrar apartamento para venda em Itapema na Rua 1, 100` | Imóvel criado com resposta objetiva; pendências remanescentes ficam claras | Novo `property` criado com tipo, finalidade, cidade e endereço identificados | Sem `crm_legacy_fallback_invoked` | Captura da resposta e consulta do imóvel criado no CRM | Pendente |
| IMOB-CRM-PROP-002 | Existe proprietário João da Silva | `cadastrar apartamento para venda em Itapema na Rua 1, 100 no nome de João da Silva` | Imóvel criado e vinculado ao proprietário correto | Novo `property` persistido com vínculo ao `owner` correto | Sem vínculo incorreto; sem fallback legado em fluxo comum | Captura da resposta e evidência do vínculo imóvel-proprietário no CRM | Pendente |
| IMOB-CRM-PROP-003 | Existe imóvel já cadastrado com mesmo endereço | `cadastrar apartamento para venda em Itapema na Rua 1, 100` | Agente tenta reconciliar em vez de criar duplicado | Nenhum novo `property` duplicado criado; registro existente permanece como referência principal | Sem duplicidade nova; sem perda do imóvel existente | Captura da resposta e prova de que a contagem de imóveis equivalentes não aumentou | Pendente |
| IMOB-CRM-PROP-004 | Existe imóvel com cidade preenchida e sem preço | `o preço desse imóvel é 850 mil` | Agente atualiza o imóvel correto com o valor informado | Campo de preço atualizado no imóvel certo | Sem update em imóvel errado; thread/contexto preservado | Captura da resposta e consulta do imóvel após atualização | Pendente |
| IMOB-CRM-PROP-005 | Existe imóvel ativo | `listar imóveis em Itapema` | Lista curta, escaneável e contextualizada, com resumo útil dos imóveis | Nenhuma alteração persistida; leitura correta dos imóveis filtrados | Sem resposta genérica; sem legado para fluxo comum | Captura da resposta e evidência da lista correspondente no CRM | Pendente |
| IMOB-CRM-PROP-006 | Existe imóvel ativo identificado pelo contexto atual | `corrige a cidade para Porto Belo` | Cidade do imóvel atual é atualizada corretamente | Campo de cidade alterado apenas no imóvel em contexto | Sem troca de entidade; sem criação de imóvel novo | Captura da resposta e consulta do cadastro após alteração | Pendente |
| IMOB-CRM-PROP-007 | Existe imóvel ativo | `excluir imóvel abc123` | Agente pede confirmação antes de arquivar | Nenhuma alteração persistida antes da confirmação | Sem exclusão imediata | Captura da resposta e prova de que o imóvel ainda está ativo | Pendente |
| IMOB-CRM-PROP-008 | Confirmação pendente da exclusão do imóvel | `confirmar exclusão do imóvel abc123` | Imóvel arquivado com confirmação explícita | `Property` marcado como arquivado/inativo conforme regra atual do CRM | Ação destrutiva só após confirmação | Captura da resposta e evidência do estado arquivado do imóvel | Pendente |

### Lead

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-LEAD-001 | Não existe lead compatível | `cadastrar lead Maria quer comprar em Balneário Camboriú telefone 47999990000` | Lead criado com pendências de qualificação objetivas | Novo `lead` persistido com dados disponíveis e pendências remanescentes identificáveis | Sem `crm_legacy_fallback_invoked` | Captura da resposta e consulta do lead criado | Pendente |
| IMOB-CRM-LEAD-002 | Existe lead Maria sem orçamento | `o orçamento da Maria é 900 mil` | Lead atualizado; pendência de orçamento removida | Campo de orçamento atualizado no `lead` correto | Sem update em lead errado; sem fallback legado em fluxo comum | Captura da resposta e evidência do orçamento no CRM após update | Pendente |
| IMOB-CRM-LEAD-003 | Existe lead Maria em contexto atual | `o que falta para esse lead avançar?` | Agente responde pendências de qualificação e próximo passo | Nenhuma alteração persistida; leitura correta do estado do `lead` | Resposta coerente com estado persistido | Captura da resposta e verificação do estado de qualificação do lead | Pendente |
| IMOB-CRM-LEAD-004 | Existe lead qualificado parcialmente | `cidade de interesse da Maria é Itapema e email maria@email.com` | Lead atualizado com múltiplos campos no mesmo turno | Campos de cidade e e-mail persistidos no mesmo `lead` | Sem perda de dados anteriores; sem ambiguidade | Captura da resposta e consulta do lead após update composto | Pendente |
| IMOB-CRM-LEAD-005 | Existe mais de um lead com nome parecido | `atualizar telefone da Maria para 47911110000` | Agente pede clarificação objetiva ou resolve pelo contexto correto | Nenhum `lead` incorreto alterado; ou telefone atualizado apenas no registro correto | Sem update em lead incorreto | Captura da resposta e verificação dos leads com nome semelhante | Pendente |
| IMOB-CRM-LEAD-006 | Existe lead plenamente qualificado | `esse lead já está pronto para avançar?` | Agente indica status de prontidão e próximo movimento comercial | Nenhuma alteração persistida; leitura coerente da prontidão do `lead` e/ou do caso | Resposta coerente com dados atuais do lead | Captura da resposta e comparação com o estado atual do lead/caso | Pendente |

### Caso / Status

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-CASE-001 | Existe caso com lead associado e pendência de orçamento | `qual status desse caso?` | Resposta curta com momento comercial, pendência principal, bloqueio atual e próximo movimento | Nenhuma alteração persistida; leitura coerente do `caseContext` atual | `caseContext` coerente; sem legado em fluxo comum | Captura da resposta e comparação com o estado atual do caso no CRM | Pendente |
| IMOB-CRM-CASE-002 | Existe caso sem bloqueio comercial | `qual o bloqueio atual?` | Agente responde explicitamente que não há bloqueio, se esse for o estado correto | Nenhuma alteração persistida; bloqueio refletido corretamente como ausente | Sem contradição com estado persistido | Captura da resposta e evidência do caso sem bloqueio no CRM | Pendente |
| IMOB-CRM-CASE-003 | Existe caso com pendência documental | `o que falta para fechar esse caso?` | Agente aponta a pendência principal e a próxima ação recomendada | Nenhuma alteração persistida; pendência principal permanece coerente com o caso | Resposta consultiva, não técnica | Captura da resposta e consulta do caso com a pendência correspondente | Pendente |
| IMOB-CRM-CASE-004 | Existe caso com owner, lead e property vinculados | `qual o próximo passo aqui?` | Agente responde com recomendação aderente à jornada atual do caso | Nenhuma alteração persistida; recomendação coerente com owner, lead, property e estágio atual | Sem genericidade; sem fallback legado em fluxo comum | Captura da resposta e evidência do estágio/jornada atual do caso | Pendente |
| IMOB-CRM-CASE-005 | Existe mais de um caso recente na mesma thread | `me atualiza o status` | Agente usa contexto correto ou pede clarificação curta | Nenhuma alteração persistida; nenhum caso incorreto é usado como base da resposta | Sem responder sobre caso errado | Captura da resposta e rastreio do caso efetivamente usado no contexto | Pendente |

### Documento

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-DOC-001 | Existe owner com pendência documental e caso ativo | Usuário anexa documento do proprietário | Agente tenta validar o documento contra owner/case corretos | Documento associado ao `owner` e/ou `case` correto, sem vínculo indevido | Sem associação errada; sem fallback legado em fluxo comum | Captura da resposta e evidência do anexo vinculado corretamente | Pendente |
| IMOB-CRM-DOC-002 | Documento resolve uma pendência conhecida | Usuário anexa documento do proprietário | Resposta indica que a pendência foi resolvida e o status atualizado | Pendência documental removida; estado do caso ou owner atualizado conforme a regra | Estado do caso refletido corretamente após anexo | Captura da resposta e comparação do estado antes/depois da pendência | Pendente |
| IMOB-CRM-DOC-003 | Documento contém dado novo relevante para CRM | Usuário anexa documento e pede análise | Agente oferece sugestão de CRM com caminho claro para incluir, editar ou descartar | Sugestão de CRM registrada de forma coerente com o dado extraído do documento | Sugestão de CRM explícita e compreensível | Captura da resposta e evidência da sugestão apresentada ao usuário | Pendente |
| IMOB-CRM-DOC-004 | Existe sugestão de CRM pendente | `aplicar essa sugestão` | Agente aplica a sugestão correta e confirma impacto no cadastro | Dado sugerido passa a constar no cadastro correto; sugestão deixa de ficar pendente | Sem aplicar sugestão errada; sem ambiguidade | Captura da resposta e verificação do cadastro após aplicação da sugestão | Pendente |
| IMOB-CRM-DOC-005 | Documento com vínculo ambíguo entre owner/case | Usuário anexa documento genérico | Agente pede clarificação objetiva antes de aplicar qualquer update | Nenhuma alteração persistida até que o vínculo seja esclarecido | Sem alteração indevida | Captura da resposta e prova de que nenhum cadastro foi alterado | Pendente |

### Lote

| ID do cenário | Pré-condição | Input do usuário | Resultado esperado | Resultado persistido esperado no CRM | Telemetria esperada | Evidência a capturar pelo QA | Status QA |
|---|---|---|---|---|---|---|---|
| IMOB-CRM-BATCH-001 | Não há imóveis equivalentes cadastrados | `apartamento | venda | Itapema | Rua 1, 100` `casa | locação | Itajaí | Rua 2, 45` | Agente processa ambos os itens e devolve resumo consolidado enumerado | Dois `properties` novos persistidos, um para cada item válido do lote | Sem perda de item; sem fallback legado em fluxo comum | Captura da resposta consolidada e consulta dos dois registros criados | Pendente |
| IMOB-CRM-BATCH-002 | Um item do lote já existe e outro é novo | `apartamento | venda | Itapema | Rua 1, 100` `casa | locação | Itajaí | Rua 2, 45` | Agente reconcilia o item existente e cria apenas o novo | Apenas um novo `property` criado; item já existente não gera duplicidade | Sem duplicidade nova; resumo distingue cada resultado | Captura da resposta e prova de reconciliação do item existente mais criação do novo | Pendente |
| IMOB-CRM-BATCH-003 | Lote contém um item válido e um incompleto | `apartamento | venda | Itapema | Rua 1, 100` `casa | locação | |` | Agente processa o item válido e marca o outro como pendente com explicação objetiva | Apenas o item válido é persistido; item incompleto não gera cadastro indevido | Total processado e pendente coerentes | Captura da resposta e comparação entre total recebido e total persistido | Pendente |
| IMOB-CRM-BATCH-004 | Lote com múltiplos itens na mesma mensagem | Usuário envia 3 ou mais linhas de imóveis | Resposta final consolida todos os itens e mantém ordem lógica | Persistência coerente com o desfecho de cada item, sem omissões silenciosas | Nenhum item some silenciosamente do retorno | Captura da resposta final e checklist item a item comparando entrada e persistência | Pendente |

## Critérios de Priorização da Matriz

Prioridade operacional recomendada para homologação:

1. `Proprietário`
2. `Imóvel`
3. `Lead`
4. `Caso / Status`
5. `Documento`
6. `Lote`

Racional:

- `proprietário` e `imóvel` afetam diretamente a base operacional da vertical;
- `lead` afeta avanço comercial e conversão;
- `caso/status` valida leitura consultiva e coerência do contexto;
- `documento` valida aproveitamento real de anexos;
- `lote` valida escala operacional e robustez do fluxo.

## Critérios de Saída para Homologação

O agente pode ser considerado apto para rollout controlado quando:

- os cenários críticos acima passam sem regressão funcional;
- a experiência permanece coerente com a vertical IMOB;
- não há dependência nova do `ChatAgentLauncher` para regra de negócio;
- o contrato, o engine e a exposição HTTP permanecem consistentes;
- a cobertura principal do CRM operacional está nos módulos novos;
- a telemetria `crm_legacy_fallback_invoked` está zerada ou residual;
- o fallback legado não aparece como requisito para fluxos comuns.

## Observabilidade Recomendada

Durante a homologação, observar:

- incidência de `crm_legacy_fallback_invoked`;
- frequência de respostas bloqueadas por falta de contexto;
- duplicidade de cadastro não desejada;
- falhas em documento e sugestão CRM;
- divergência entre resposta conversacional e estado persistido;
- pedidos de clarificação excessivos;
- qualquer sinal de regra surgindo no launcher em vez do agente.

## Resultado Esperado para Produto

Ao final da homologação, o `IMOB_CRM` deve estar validado como:

- especialista operacional e comercial da vertical IMOB;
- agente consistente com a arquitetura `agent-driven`;
- camada de negócio separada da UI;
- fluxo pronto para operar com o legado apenas como resguardo temporário ou já sem necessidade dele.
