# Agent Chat Runtime

## Princípio Arquitetural

O comportamento do chat deve ser orientado pelo agente (`agent-driven`), e não pela interface (`launcher-driven`).

Isso significa que:
- cada agente é o centro nervoso conceitual de si mesmo;
- cada agente define sua própria especialidade, fronteira de atuação, estilo de resposta, política de handoff e comportamento diante de ambiguidade, risco e indisponibilidade;
- o `engine` não cria a identidade do agente, apenas executa tecnicamente o comportamento definido por ele;
- o `launcher` não decide a lógica profunda do agente, apenas apresenta o resultado da decisão.

## Papel de Cada Camada

### 1. Agente

O agente é a fonte de verdade comportamental.

Todo agente, instalado hoje ou introduzido no futuro, deve declarar explicitamente:
- o que faz;
- o que não faz;
- como se apresenta ao usuário;
- quando responde diretamente;
- quando pede clarificação;
- quando encaminha para outro agente;
- para quais especialistas pode fazer handoff;
- como lida com risco, confiança, indisponibilidade e limites de escopo.

Essa regra vale para:
- agentes já instalados;
- agentes futuros;
- agentes premium ou restritos;
- agentes experimentais.

Exemplos:
- `EIAH`: ajuda, navegação, triagem, orquestração leve, encaminhamento e explicação do uso e funcionamento dos agentes da plataforma.
- `Jurídico`: contratos, cláusulas, pareceres, risco jurídico e análise documental.
- `FinNexus`: fluxo financeiro, billing operacional, conciliação e pendências financeiras.
- `DeFi One`: simulação, custo, risco e comparação de cenários DeFi.
- `Guardian`: evidências, integridade, receipts, verify_url e verificabilidade auditável.

### 2. Engine

O `engine` é o executor técnico do comportamento do agente no frontend.

Responsabilidades do engine:
- ler os contratos do agente ativo;
- classificar a intenção do turno;
- consultar participação e disponibilidade dos especialistas;
- decidir entre resposta local, handoff, fallback, bloqueio ou `needs_run`;
- montar quick replies coerentes com o momento da conversa;
- preservar estado conversacional quando o turno seguinte depende de contexto já coletado, como proposta SaaS e handoffs por vertical;
- gerar snapshot de apresentação por mensagem.

O engine deve:
- executar o comportamento do agente;
- respeitar a identidade declarada pelo agente;
- nunca hardcodar especialidade fora do contrato canônico.

### 3. Launcher

O `launcher` é apenas a interface.

No estado atual do runtime, o `ChatAgentLauncher` deve ser tratado como camada `render-first`.

Responsabilidades do launcher:
- capturar a entrada do usuário;
- exibir mensagens;
- controlar o estado visual da conversa;
- renderizar a resposta já decidida;
- lidar com streaming, botões, navegação e componentes de tela.

O launcher não deve:
- decidir qual especialista existe;
- inventar handoff;
- definir quick replies por conta própria;
- concentrar regras cognitivas ou de negócio do agente.
- reconstituir snapshot de comportamento fora dos helpers do `engine`.

## Regra-Mãe

A arquitetura correta deve seguir esta ordem:
- o agente define;
- o engine executa;
- o launcher renderiza.

## Entrada agêntica, linguagem natural e validação determinística

**O usuário se expressa naturalmente; a EIAH interpreta semanticamente.** A EIAH é uma plataforma agêntica: o usuário não deve precisar conhecer sintaxe interna, palavras-chave obrigatórias, ordem de tokens, gramática de parser, regex, nomes internos de actions, contratos técnicos, nomes de campos internos ou formatos artificiais de comando para ter sua intenção ou informação compreendida.

Este é um requisito arquitetural transversal, conforme o Track P do [roadmap canônico](../../ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md#p4--track-p-produto-e-rollout). Não é declaração de que todos os runtimes existentes já o implementam, nem evidência de nova capacidade ou liberação operacional.

**IA interpreta significado e contexto; código determinístico protege invariantes; humano confirma quando a incerteza puder gerar efeito.**

### Fluxo canônico e responsabilidades

`Front Door → agente/vertical → intake contextual/agêntico → interpretação semântica → intenção/slots/draft estruturados → normalização/validação determinística → clarificação/HITL quando necessário → execução governada → resultado no Front Door`

1. O Front Door recebe linguagem humana e contexto, preservando a continuidade da demanda.
2. O agente/vertical é dono da interpretação do domínio, incluindo intenção, entidades, slots, drafts, ambiguidade e política de clarificação.
3. O intake/runtime agêntico transforma a entrada em estrutura de domínio. Provider/model participa pelo runtime e arquitetura central, conforme policy, disponibilidade, contexto, entitlement, escopo e governança vigente; uma tela ou campo não estabelece um caminho cognitivo independente.
4. O engine coordena esse intake, aplica a normalização/validação ao resultado estruturado e executa o comportamento definido no contrato do agente, respeitando os gates vigentes.
5. Parsers, regex, schemas e validadores determinísticos protegem exatidão, formato e invariantes depois da interpretação, quando aplicável. Não substituem compreensão semântica nem conferem autoridade para agir.
6. Launcher e formulários coletam entradas e renderizam estrutura, perguntas e resultados já resolvidos. Não recebem regra cognitiva nova.

### Classes de entrada

A classe depende do significado e da exatidão exigidos pelo conteúdo, não do widget usado. Um campo de texto pode receber um identificador canônico; um formulário também pode conter entradas semânticas ou híbridas.

| Classe | Finalidade e exemplos ilustrativos | Tratamento obrigatório |
| --- | --- | --- |
| Semântica / linguagem natural | Descrição de imóvel ou mercadoria, identificação informal de unidades, observação comercial, pedido de ação, instrução jurídica, condição contratual, contexto logístico, justificativa, descrição de problema e texto livre em chat ou textarea | `linguagem natural → interpretação agêntica → estrutura de domínio → validação determinística`. Aceitar linguagem humana sem exigir gramática interna. |
| Canônica / estruturada | CEP, CPF, CNPJ, e-mail, telefone, datas, valores monetários, quantidades, NCM, matrícula, número de processo, identificadores, hashes, txids, códigos oficiais e referências externas | `valor informado → normalização determinística → validação → confirmação quando aplicável`. Preservar valor verificável; não inventar nem inferir criativamente dados ausentes. |
| Híbrida | Linguagem natural contendo dados estruturáveis, como endereço, unidades e condição de uma operação | Interpretar no intake agêntico, extrair intenção/slots/draft e depois normalizar e validar deterministicamente cada valor canônico. |

Em entradas canônicas, a IA pode extrair valores da informação fornecida, apoiar formatação, sugerir correções e pedir confirmação. A normalização e a validação determinísticas continuam obrigatórias; a IA não flexibiliza invariantes nem transforma uma sugestão em valor verificado.

Exemplo meramente ilustrativo de entrada híbrida: `O imóvel fica na Alvin Bauer 783, aptos 101 a 105, todos para locação.` O intake pode propor endereço, unidades e destinação como estrutura de domínio. Proprietário ou outros dados não informados permanecem ausentes; a interpretação não autoriza inventá-los nem executar um cadastro. O exemplo não define sintaxe obrigatória nem afirma suporte já implementado a essa frase.

### Ambiguidade, disponibilidade e confirmação

- Ambiguidade material ou confiança insuficiente antes de mutação exige clarificação ou confirmação/HITL no próprio Front Door. A regra é definida pelo agente/vertical e executada pelo engine.
- Até resolver a incerteza, não persistir dados de domínio, executar ações externas ou converter silenciosamente o pedido em outra operação. A clarificação deve preservar o contexto original.
- Provider/model indisponível ou negado pela governança exige tratamento de indisponibilidade, bloqueio ou clarificação conforme contrato. Não autoriza trocar a interpretação agêntica por uma gramática obrigatória, baixar invariantes ou persistir uma suposição.
- Confirmação humana não substitui validação canônica, autorização, RBAC, entitlement, escopo, políticas ou demais gates de execução.
- Exemplos de preenchimento, placeholders e helpers são ajuda de UX, nunca contrato obrigatório de linguagem.
- Heurísticas determinísticas podem atuar como safety nets para detectar risco e impedir efeitos; não são a arquitetura principal de compreensão nem comprovação de que uma entrada não sinalizada foi entendida corretamente.

### Anti-padrões

1. Obrigar o usuário a memorizar sintaxe interna ou exigir estrutura técnica de uma frase natural.
2. Transformar regex/parser em interface cognitiva do produto.
3. Usar formulário, placeholder ou helper como substituto do intake agêntico.
4. Fazer fallback silencioso de uma entrada ambígua para uma operação diferente.
5. Persistir dados a partir de interpretação incerta sem clarificação/HITL quando houver efeito material.
6. Duplicar lógica cognitiva no `ChatAgentLauncher` ou criar parser por tela quando o significado pertence ao agente/vertical.
7. Inventar identificadores ou valores canônicos ausentes.
8. Usar IA para flexibilizar invariantes determinísticos.

### Abrangência e verificação

A regra vale para EIAH como Front Door; IMOB, LEGAL, MKT, Financeiro, URBAN e Logística; capacidades internas, agentes, especialistas e verticais futuras; novos formulários, campos de texto livre e fluxos conversacionais. Não há exceção implícita para uma superfície ou vertical futura. Essa abrangência normativa não promove verticais planejadas ou contextuais a operacionais.

Ao implementar ou adaptar uma capacidade, demonstrar:

- entradas semanticamente equivalentes produzindo estrutura de domínio equivalente, sem ambiguidade material;
- valores canônicos preservando exatidão, verificabilidade e normalização;
- ambiguidade material antes de mutação produzindo clarificação/confirmação e zero side effects da operação solicitada;
- parser/regex sem assumir o papel de contrato público de linguagem;
- interpretação pertencente ao agente/vertical e launcher/formulário limitados à coleta e renderização.

## Aplicação ao EIAH

O `EIAH` é o centro nervoso conceitual do seu próprio papel. Ele existe para:
- explicar a plataforma;
- orientar o uso do site;
- indicar o próximo passo;
- encaminhar para especialistas;
- atuar como porta de entrada principal da experiência.

Mas esse princípio não é exclusivo do `EIAH`.

Ele deve se repetir para todos os agentes:
- cada um com sua especialidade;
- cada um com seu contrato comportamental;
- cada um com seu próprio centro nervoso conceitual.

## Diretriz de Implementação

Toda nova lógica deve seguir a sequência abaixo:
1. definir ou ajustar o contrato do agente;
2. implementar a execução dessa regra no `engine`;
3. expor no `launcher` apenas o resultado já resolvido.

## Anti-padrão a Evitar

Não adicionar regra nova diretamente no `ChatAgentLauncher` sem antes definir:
- a qual agente essa regra pertence;
- em qual contrato ela vive;
- como o `engine` deve executá-la.

## Instrução Padrão de Implementação do Chat

Toda evolução do chat deve seguir esta regra:
1. remover regra residual por agente do `ChatAgentLauncher`;
2. centralizar a lógica de decisão no `engine`;
3. padronizar esse modelo para todos os agentes instalados e futuros.

Interpretação operacional:
- nenhuma nova regra de comportamento deve nascer no `ChatAgentLauncher`;
- toda regra de resposta, handoff, fallback, bloqueio, clarificação e quick reply deve nascer no contrato do agente e ser executada pelo `engine`;
- o `launcher` deve se limitar a renderizar a decisão já resolvida.

Estado operacional atual:
- submit principal em modo `render-first`;
- preparação de run, snapshot de execução e fallback de resumo resolvidos no `engine`;
- proposta SaaS com domínio e estágio explícitos no snapshot (`proposalDomain`, `conversationStage`);
- telemetria de regressão de proposta persistida via `helpdesk/session`;
- residual permitido no launcher: renderização, SSE/polling, upload, sessão local e componentes de tela.

## Observabilidade de Regressão Conversacional

Para fluxos sensíveis que dependem de continuidade entre turnos, o runtime deve emitir sinais operacionais explícitos. No estado atual, proposta comercial SaaS deve persistir:
- `proposalDomain`
- `conversationStage`
- `proposalContextRecovered`
- `proposalContextLost`
- `proposalDomainMismatch`

Objetivo:
- detectar quando o `engine` reaproveitou corretamente o contexto já coletado;
- detectar quando o fluxo voltou a pedir dados já informados;
- impedir mistura silenciosa entre domínio SaaS e contexto IMOB.

Regra:
- essa observabilidade nasce no `engine`;
- o `launcher` apenas transporta os campos do snapshot/payload;
- o backend agrega isso no export operacional do helpdesk.

## Objetivo

Essa arquitetura existe para garantir:
- coerência entre agentes;
- menor acoplamento com a UI;
- menos drift entre contrato, comportamento e renderização;
- mais previsibilidade para o usuário;
- expansão segura para agentes instalados e futuros.

## Gate de Onboarding

O onboarding de novos agentes de chat deve operar em `fail-closed`.

Regra:
- agente sem contrato mínimo completo não pode ser sugerido;
- agente sem contrato mínimo completo não pode receber handoff;
- agente sem contrato mínimo completo não deve operar em runtime conversacional.

Contrato mínimo:
- `chatCopy`
- `uxContract`
- `participation`
- quick replies válidas
- `modeContracts` obrigatórios no caso do `EIAH`
- `journeyContract` obrigatório no caso do `EIAH` para explicação inicial orientada por papel/contexto

Sinalização operacional:
- `chatRuntime.chatEnabled = false`
- `chatRuntime.catalogVisibility = blocked`
- `chatRuntime.blockingReason = missing_minimum_contract`

Verificação contínua:
- o gate `check:chat-agent-onboarding` valida em CI que agentes incompletos permaneçam `fail-closed`;
- agentes prontos permanecem `visible/suggestable`, enquanto agentes incompletos permanecem `blocked/hidden`.

## Artefatos Relacionados

- [Presentation snapshot v1](./presentation-snapshot-v1.md)
- [IMOB CRM Governed Runtime](./imob-crm-governed-runtime.md)
- [Chat Runtime Entrypoint Debt](../../ops/evidence/latest/chat-runtime-entrypoint-debt-2026-07-02.md)

Backlog documental futuro:
- `chat-drift-backlog.md`
- `chat-launcher-audit.md`
- `vertical-context-imob.md`
- `imob-dedicated-chat-runtime.md`
- `vertical-context-legal.md`
- `chat-rollout-metrics.md`
- `agent-attachment-intake.md`

Guardrails atuais do launcher/runtime:
- `pnpm check:chat-launcher-render-only`
- `pnpm check:chat-runtime-entrypoint-debt`
- `pnpm check:presentation-snapshot-contract`

## Diretriz de UX da Conversa

Se a experiência do chat quiser se aproximar do nível de fluidez de produtos como ChatGPT ou Gemini, a UX do EIAH precisa preservar estas qualidades:
- um ponto de entrada único e simples;
- transição fluida entre conversa geral e especialista;
- menos chips burocráticos;
- menos CTA repetida;
- menos interferência artificial do `launcher`;
- respostas mais naturais, com especialização real por trás.

O objetivo não é expor vários bots independentes ao usuário. O objetivo é oferecer uma experiência única e contínua, com especialização real por trás da conversa.

## Arquitetura de Experiência Recomendada

### 1. Agente frontal universal

O `EIAH` deve funcionar como front door do sistema.

Papel do `EIAH`:
- entender a intenção do usuário;
- responder dúvidas gerais;
- explicar produto, páginas e fluxos;
- explicar por onde começar conforme papel, domínio e produtos instalados;
- orientar navegação;
- pedir pouca clarificação;
- encaminhar para especialista quando necessário.

Na UX, o usuário deve sentir que está falando com um único assistente inteligente.

### 2. Capacidades genéricas do front door

Nem toda conversa ampla precisa cair imediatamente em um especialista profundo. O `EIAH` deve poder exercer capacidades transversais, como:
- help e explicação do produto;
- orientação comercial e proposta;
- orquestração leve;
- apoio de risco e auditoria;
- concierge contextual do workspace.

Essas capacidades existem para manter uma conversa natural em temas amplos, sem transformar o chat em uma árvore de decisão com vários bots visíveis.

### 2.1 Journey Contract do EIAH

O `EIAH` agora deve carregar um `journeyContract` próprio para a explicação inicial da plataforma.

Objetivo:
- resolver no contrato qual é o front door do usuário;
- explicar o primeiro passo por papel;
- definir quais superfícies são prioritárias e quais são secundárias;
- adaptar a jornada por domínio e por produtos instalados.

Regra:
- o `journeyContract` vive no perfil do `EIAH`;
- o `engine` resolve `roleProfile + activeDomain + installedProducts`;
- o `launcher` apenas renderiza `message` e `quickReplies` já resolvidas.

Isso evita:
- help genérico demais para usuário iniciante;
- decisão local no `launcher`;
- reinterpretação de jornada por heurística solta de UI.

### 3. Agentes especialistas

Agentes especialistas entram quando a pergunta exige profundidade real de domínio.

Exemplos:
- `AADV`
- `Jurídico`
- `FinNexus`
- `Guardian`
- `DeFi One`

Regra de UX:
- especialistas não devem parecer uma nova homepage da conversa;
- o handoff deve acontecer como continuidade natural;
- o usuário não deve precisar entender a arquitetura interna para obter a competência certa.

### 4. Verticais como contexto

Verticais como `IMOB` e `LEGAL` não devem ser tratadas apenas como chips temáticos ou mais um bot solto. Elas devem funcionar como contexto persistente da conversa.

Cada vertical deve poder definir:
- agentes elegíveis;
- vocabulário e linguagem de domínio;
- quick replies próprias;
- políticas de handoff;
- páginas e atalhos relevantes;
- dados e fontes determinísticas;
- limites específicos de UX.

Exemplos:
- `IMOB`: leads, proposta, contrato, pipeline e jornada imobiliária;
- `LEGAL`: contrato, cláusula, parecer, minuta e risco jurídico.

### 5. Engine de conversa

A `engine` é a camada que decide:
- intenção do turno;
- agente efetivo;
- se responde diretamente ou faz handoff;
- quais quick replies mostrar;
- se mostra confiança ou proveniência;
- como congelar isso no snapshot da mensagem.

O `launcher` apenas renderiza.

## Fluxos de Experiência

### Conversa natural

Usuário faz uma pergunta ampla
→ `EIAH` responde diretamente
→ sem parecer que houve troca de bot
→ oferece no máximo 2 ou 3 próximos passos úteis

### Necessidade de especialista

Usuário pede contrato imobiliário
→ `EIAH` detecta domínio `LEGAL` ou `IMOB`
→ a `engine` resolve o especialista disponível
→ o handoff acontece na mesma conversa
→ sem quick replies genéricas de outro papel

### Vertical ativa

Usuário está em contexto `IMOB`
→ a `engine` sabe que a conversa está em `IMOB`
→ respostas, chips, atalhos e especialistas são filtrados por esse contexto
→ a conversa parece focada e contextual

### Agente indisponível

Usuário pede `Jurídico`
→ a `engine` verifica participação efetiva do workspace
→ se o agente não existir ou não estiver habilitado:
- não prometer capacidade inexistente;
- explicar indisponibilidade de forma humana;
- sugerir onboarding ou caminho alternativo.

## Regras de Governança da UX

### Regra 1

O `launcher` não cria UX genérica por conta própria.

Evitar no `launcher`:
- quick replies globais;
- CTA arbitrária;
- chips derivados automaticamente de texto;
- blocos repetidos de próximos passos.

### Regra 2

Todo chip clicável deve ser modelado como prompt válido.

`defaultNextStep` não deve virar chip automaticamente.

### Regra 3

O conteúdo do agente prevalece sobre enriquecimento do `launcher`.

Se o agente já respondeu com:
- próximos passos;
- CTA;
- resumo;

então o `launcher` não deve duplicar esse conteúdo.

### Regra 4

Verticais mandam no contexto.

Se o usuário está em `LEGAL` ou `IMOB`, a conversa deve respeitar:
- linguagem;
- especialistas elegíveis;
- affordances;
- restrições daquele contexto.

## Regras Operacionais de UX

Para manter a conversa mais próxima de uma experiência natural:
- a resposta principal deve vir em linguagem clara e direta;
- quick replies devem ser poucas, curtas e úteis;
- chips só devem aparecer quando realmente ajudarem;
- o usuário não deve sentir a burocracia da arquitetura;
- o sistema deve evitar sinalização desnecessária de mecanismo interno.

Regra prática para chips:
- no máximo 3 por turno;
- sem repetição;
- sem CTA longa;
- sem frase que não faça sentido como input do usuário.

Regra prática para fallback:
- primeiro responder de forma útil e curta;
- depois, se necessário, fazer handoff;
- só por último pedir clarificação.

Essa ordem de fallback não se aplica à ambiguidade material ou confiança insuficiente antes de mutação: nesses casos prevalece a clarificação/confirmação obrigatória definida na seção de entrada agêntica, sem side effects da operação solicitada.

## Estrutura Recomendada de Runtime

Para sustentar essa experiência, a estrutura recomendada é:
- `agentChatCopy`
- `intentRouting`
- `agentParticipationRegistry`
- `responseBuilders`
- `presentationSnapshot`
- `verticalContextResolver`
- `chatLauncherEngine`

O `ChatAgentLauncher` deve permanecer como camada de UI.

## Critério de Pronto

Essa diretriz está bem implementada quando:
- o chat parece um assistente único e natural;
- especialistas entram sem quebrar a conversa;
- chips são poucos e úteis;
- o usuário não vê a burocracia da arquitetura;
- o `launcher` não polui o contrato do agente;
- `IMOB`, `LEGAL` e outras verticais operam como contexto real;
- handoffs respeitam disponibilidade efetiva do workspace.

## Artefatos Operacionais

Os artefatos operacionais que complementam esta diretriz são:
- [presentation-snapshot-v1.md](./presentation-snapshot-v1.md)

Backlog documental futuro:
- `chat-drift-backlog.md`
- `chat-launcher-audit.md`
- `vertical-context-imob.md`
- `vertical-context-legal.md`
- `chat-rollout-metrics.md`

## PROPOSTA — contrato transversal de execução de IA da EIAH

Data: **2026-11-16**. Estado: **PROPOSTA, pendente de ratificação**.

Esta seção propõe um contrato comportamental transversal para os agentes atuais e futuros. Não constitui schema executável, contrato público novo, autorização de fallback, política comercial, alteração de billing ou prova de conformidade dos runtimes. As diretrizes vigentes nas seções anteriores continuam válidas. Nesta seção, requisitos adicionais são condições propostas para adoção futura, não decisões já ratificadas.

A fonte documental é estendida aqui para evitar documento concorrente. Não se cria ADR nem se reserva número de ADR. A implementação de propagação de falhas foi pausada durante a revisão e retomada somente no recorte Δ1–Δ3 autorizado abaixo; seus tipos locais não são o contrato transversal definitivo.

### Fontes reutilizadas e fronteira entre norma e implementação

| Fonte existente | Papel preservado | Limite observado |
| --- | --- | --- |
| [Roadmap vigente](../../ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md), [AGENTS](../../AGENTS.md), seções anteriores deste documento | Arquitetura agent-driven, linguagem natural, governança e separação entre interpretação e efeitos | Não declaram todos os runtimes conformes nem autorizam operação de verticais contextuais |
| [Presentation snapshot v1](./presentation-snapshot-v1.md) | Resultado de apresentação resolvido pelo engine; launcher renderiza | Snapshot apresentado não prova conclusão de execução |
| [Perfis e disponibilidade](../../apps/api/src/services/agents.ts), [perfil EIAH](../../packages/core/src/actions/agents/eiahAction.ts), [executor](../../apps/api/src/orchestrator/llmExecutor.ts) | Perfil disponível no workspace, knowledge policy, masking e chamada ao runtime central | Perfil canônico de diagnóstico não prova perfil efetivo de staging; política de conhecimento não substitui autorização financeira |
| [Tipos LLM](../../packages/core/src/llm/types.ts), [LLMProvider](../../packages/core/src/llm/LLMProvider.ts), [router](../../packages/core/src/llm/LLMRouter.ts), [registry](../../packages/core/src/llm/LLMRegistry.ts), [completion](../../packages/core/src/llm/completionEngine.ts) | Transporte interno existente, seleção e execução de providers | Contrato versionado atual de completion representa sucesso; não possui envelope completo de falhas e estágios. O patch local acrescenta exceção, ainda não ratificada como padrão transversal |
| [Capability execution](../../apps/api/src/services/capabilityExecution.ts) | CapabilityRequest/Result, plano de rotas, policy de roteamento e registro de uso | Possui fallback declarado por capacidade, inclusive para outros providers; sua existência no código não demonstra autorização para todo contexto. O intake de cadastro não chama esse fallback |
| [Front Door intake](../../apps/api/src/services/frontDoorIntake.ts) e [rota](../../apps/api/src/routes/frontDoorIntake.ts) | answered/clarify/not_permitted/unavailable/timeout/invalid e validação com catálogo autorizado | Não é execução de contratação, pagamento, ativação ou concessão |
| [Contrato IMOB](../../apps/api/src/services/imob/imobAgentContract.ts), [captura do rascunho](../../packages/contracts/src/imobPropertyCapture.ts), [engine](../../apps/api/src/services/imob/crm/imobCrmTurnEngine.ts), [runtime governado](./imob-crm-governed-runtime.md) | Intenção contextual, proposta, confirmação, continuidade e autorização de domínio | updated no intake significa atualização de rascunho; created/updated no fluxo operacional têm semântica própria. Não intercambiar essas provas |
| [Catálogo de reason codes](../ops/reason-codes-catalog.md) e [fonte executável](../../packages/core/src/reasons/reasonCatalog.ts), [retry](../../packages/core/src/utils/retry.ts) | Ratificação de reason codes e mecanismo central existente de repetição | Categorias técnicas desta proposta não são reason codes active; não promovê-las por documentação ou teste |
| [Política operacional de billing](../operations/eiah-billing-operational-policy.md), [semântica de custo](../../apps/api/src/types/costSemanticsContract.ts), [billing](../../apps/api/src/services/billing.ts) | Separação entre custo operacional, consumo do workspace, breakdown, ledger e reconciliação | Não autoriza inferir cobrança ou gratuidade de uma recusa do provider |
| [Agent Protocol](../ops/agent-protocol-api-contract.md) | Contratos públicos de negociação/execução e provas aplicáveis | Esta proposta não altera protocolo, receipt, ledger ou versionamento público |

**Regras vigentes:** agente define; engine executa; launcher renderiza; entrada semântica é interpretada no contexto; validadores protegem invariantes; identidade e escopo não vêm do modelo; efeitos sensíveis exigem gates; ambiguidade material exige clarificação/HITL. A separação entre confirmação do rascunho e gravação já pertence ao contrato IMOB versionado.

**Proposta adicional:** uniformizar as fronteiras de resultado, falha, seleção, repetição e observabilidade abaixo, estendendo as fontes existentes. Não substituir todos os contratos de domínio por um enum genérico ou caminho paralelo de execução.

### Matriz de responsabilidades

| Camada | Responsabilidade proposta | Autoridade que não recebe |
| --- | --- | --- |
| Agente/vertical | Declarar finalidade, interpretação, contexto necessário, resultados admissíveis, política de ambiguidade e mensagens seguras | Conceder permissão, inventar dado canônico ou declarar efeito pela narrativa do modelo |
| Front Door e engine conversacional | Resolver agente/contexto, coordenar intake, continuidade e apresentação; vincular resposta ao turno atual; encerrar espera | Inventar fallback, oferta, ação, permissão ou cobrança na UI |
| Borda autenticada | Derivar identidade/escopo, validar acesso, entitlement e contratos de transporte; recuperar perfil autorizado | Confiar em tenant/workspace/permissão ou seleção operacional arbitrária do body |
| Intake do domínio | Minimizar contexto, pedir interpretação, validar schema e invariantes, resolver esclarecimento/proposta e desfecho técnico | Transformar erro de provider em conteúdo ou executar escrita silenciosa |
| Executor/runtime central | Aplicar policies, executar seleção autorizada, controlar tentativas, deadline, erro e correlação | Considerar promise resolvida, HTTP exitoso ou string presente como prova universal de sucesso |
| Adaptador do provider | Mediar transporte; verificar status e erro estruturado antes da extração; preservar metadados disponíveis de forma sanitizada | Criar request ID, tokens, custo, texto de sucesso ou retry/fallback autônomo |
| Validadores, domínio e executor de efeitos | Revalidar autorização, integridade, consentimento, idempotência e invariantes; executar e produzir prova verificável quando exigida | Aceitar interpretação, confirmação de draft ou texto de sucesso como autorização suficiente |
| Billing e reconciliação existentes | Aplicar contratos financeiros vigentes, reservas quando existentes, uso e lançamento idempotente com proveniência | Deduzir consumo ou débito a partir de mensagem do chat |
| Launcher/formulário | Coletar entradas e ações implementadas; renderizar payload e estado de espera resolvidos | Decidir comportamento cognitivo, explicar falha por outra chamada à IA ou reconstruir autoridade |

### A–C. Autoridade, contexto e linguagem

O agente interpreta e propõe. O resultado de um modelo é dado não confiável, sujeito ao contrato do domínio; não concede permissões, não confirma execução e não substitui validação determinística ou aprovação humana exigida.

O contexto pertinente inclui agente e versão do contrato, vertical, capacidade/operação, etapa, mensagem atual, histórico relevante, rascunho atual e proposta pendente quando houver. Cada agente declara o subconjunto necessário; ausência material leva a esclarecimento ou bloqueio, não a invenção. Exemplos de mensagens não são gramática de produção. Perguntas, correções, recusa e confirmação são interpretadas em relação à proposta e ao turno; campos canônicos e ações explícitas continuam verificáveis.

Identidade, tenant, workspace, permissões, entitlement, disponibilidade, orçamento autorizado e perfil efetivo são fatos de servidor/fonte autorizada. Contexto enviado pelo navegador é revalidado e nunca adquire autoridade por estar no prompt. Referências de origem, versão e proposta correlacionam o draft; não funcionam como credencial. Segredos e headers de autenticação ficam fora do contexto do modelo.

A minimização aplica-se antes do provider: enviar somente os fatos necessários, com masking e proveniência conforme policy. Identificadores de correlação ficam no runtime/log, sem necessidade de entrar no conteúdo do prompt. Dados sintéticos de diagnóstico não autorizam efeitos em um workspace real.

### D. Resultados e transições

As famílias abaixo são semântica proposta para mapear contratos existentes, não novos valores que os consumidores já aceitem.

| Família | Correspondência existente | Evidência e transição permitida |
| --- | --- | --- |
| Resposta válida | answered; output validado da capacidade | Validação exigida pelo agente concluída; pode apresentar resposta. Não comprova efeito |
| Esclarecimento/revisão | clarify; proposed; waiting_input | Ambiguidade, dados ausentes ou proposta aguardando revisão. Preservar trabalho; não autorizar gravação |
| Recusa/bloqueio | not_permitted; blocked; rejected conforme domínio | Distinguir recusa do usuário, recusa de segurança do modelo e bloqueio de autorização. Modelo não concede nem revoga acesso |
| Falha técnica | unavailable; timeout; invalid; error conforme fronteira | Encerrar tentativa com etapa e causa conhecida; preservar contexto. Falha antes de conteúdo não entra no parser |
| Efeito/execução | updated do draft; created/updated operacional; execução do Agent Protocol | Declarar explicitamente o objeto e a fase afetados. Efeito persistido exige retorno/prova do domínio e gates aplicáveis |

Transições propostas:

1. Recepção → validação do contexto/autorização → solicitação elegível. Bloqueio prévio termina sem provider nem efeito solicitado.
2. Solicitação → resposta de transporte **ou** falha técnica. HTTP exitoso com error estruturado continua sendo falha.
3. Resposta recebida → extração → parsing → schema → validação do domínio → resposta, esclarecimento, recusa ou proposta. Cada etapa informa seu próprio resultado; uma não implica aprovação da seguinte.
4. Proposta vigente → confirmação contextual inequívoca → revalidação da correlação → atualização exclusiva do rascunho. Dúvida, recusa, versão divergente ou troca de contexto não aplicam campos.
5. Ação explícita separada de gravação → nova autorização de domínio → execução → resultado verificável. Não derivar gravação de confirmação do draft.
6. Timeout após possível envio/efeito → resultado desconhecido quando não houver prova de cancelamento/conclusão. Conciliar antes de repetir efeito ou declarar ausência de escrita.

Texto vazio não satisfaz um contrato que exige resposta textual ou JSON válido. Ausência de exceção não comprova sucesso. Em capacidades legitimamente não textuais, o contrato específico define o payload válido; não impor texto artificial a ferramentas, streaming ou outras modalidades. Conteúdo válido não confirma execução de domínio.

### E. Seleção e execução de providers

O servidor resolve o perfil disponível e a policy da capacidade, respeitando configuração, permissões, tratamento de dados e orçamento vigente. O router/registry executa essa decisão; UI, prompt e saída do modelo não a substituem. Chave presente comprova configuração, não autorização para qualquer capacidade, dado ou gasto.

O código atual aceita metadata interna de provider, prefixo do modelo e defaults; capabilityExecution também monta rotas conforme policy. A precedência transversal entre perfil, escolha contratual do cliente e capacidade precisa de ratificação e mapeamento explícito. Não criar parâmetro HTTP público para diagnóstico nem tratar override interno como permissão automática.

Registrar separadamente provider/modelo solicitados, rota selecionada e provider/modelo efetivamente confirmados pelo retorno. Modelo repetido do pedido é **solicitado**, não geração comprovada. ID de completion, request ID do provider e correlação da aplicação são conceitos distintos. Campo ausente permanece ausente/desconhecido; não preencher com nome do provider, zero ou estimativa sem origem.

### F–H. Falhas, retry e fallback

As categorias são propostas internas para classificação, sem promoção ao catálogo de reason codes. O mapper público continua usando os códigos ratificados aplicáveis; novas emissões que exijam reason code seguem o processo vigente de proposta e aprovação.

| Categoria proposta | Sinais e distinções | Conduta proposta |
| --- | --- | --- |
| Crédito/quota financeira do provider | Campos estruturados como insufficient_quota/credit_balance_exhausted; status isolado não basta | Intervenção operacional; sem retry automático dessa falha. Não confundir com limite do workspace |
| Rate limit | Código/tipo estruturado de limitação de taxa, com contexto do status | Retry somente se a policy vigente permitir e houver capacidade no orçamento de tentativas/tempo |
| Autenticação/permissão | Recusa de credencial/permissão pelo provider ou bloqueio de acesso na borda, diferenciados por origem | Preservar o bloqueio; não repetir automaticamente sem mudança autorizada da condição |
| Indisponibilidade transitória | Transporte/serviço temporariamente indisponível, com sinais estruturados disponíveis | Retry elegível apenas pelos limites existentes; não generalizar todo erro desconhecido como transitório |
| Timeout | Deadline excedido na camada identificada | Encerrar espera; registrar cancelamento confirmado ou chamada/efeito possivelmente ainda ativo; não reenviar cegamente |
| Resposta inválida | Extração, parsing, schema ou validação rejeitados, cada qual com etapa explícita | Não virar sucesso vazio; não flexibilizar schema. Política de eventual nova tentativa depende de aprovação específica |
| Falha interna | Falha no runtime/adaptador/integração sem causa técnica comprovada mais específica | Categoria explícita com sanitização; não inventar quota, rate limit ou transitoriedade |

O adaptador deve examinar status e error estruturado antes da extração. Erro financeiro pode compartilhar HTTP 429 com rate limit; a causa estruturada tem precedência quando confiável. Guardar código/tipo/status/request ID disponíveis sem mensagens brutas, headers sensíveis ou credenciais. A procedência da falha — plataforma, workspace, integração do cliente ou desconhecida — não pode ser inferida de um código de quota sozinho.

**Retry:** o runtime central deve ser o coordenador das tentativas dentro de uma solicitação lógica. Intake e UI não iniciam ciclos automáticos adicionais; retries internos de SDK/transportes, quando existentes, precisam ser declarados e contabilizados no mesmo orçamento. Número de tentativas, backoff, timeout e orçamento vêm de políticas existentes; esta proposta não fixa valores nem amplia limites. Nova tentativa manual é uma nova solicitação lógica, sujeita à mesma autorização e correlação, não garantia de recuperação.

Deadline deve ter tratamento coordenado entre camadas; terminar uma promise por race não comprova interrupção do request. A política concreta de cancelamento e orçamento entre camadas fica pendente, sem modificar os timeouts atuais nesta etapa.

**Fallback:** só pode usar alternativa previamente autorizada, configurada e compatível com capacidade, contexto, residência/tratamento de dados e orçamento. Escolha contratual explícita de provider pelo cliente não pode ser substituída silenciosamente. A alternativa usada e sua razão devem ser observáveis; sem elegibilidade demonstrada, terminar com desfecho explícito. Não inventar autorização porque uma rota alternativa aparece na tabela de código. Política de fallback de conhecimento (block/approved_snapshot/human_review) não equivale a permissão para trocar provider.

### I–J. Efeitos, continuidade e comunicação

Os controles existentes de draft/origem/versão, proposta e turno são a base a estender: resposta tardia não altera novo contexto, edição manual não pode ser sobrescrita, confirmação só aplica a proposta vigente integralmente e duplicação não pode produzir efeito adicional. Identidade, sessão, tenant/workspace, conversa e vertical devem permanecer coerentes. Durabilidade/idempotência de execução são garantias do domínio, não de um token consultivo no navegador.

Falha de assistência preserva formulário, rascunho e proposta ainda vigente; não aplica parte da proposta, não troca domínio, não salva e encerra a espera correspondente. Uma proposta já invalidada por edição/troca de contexto não é ressuscitada para cumprir a preservação. A mensagem deve refletir se a operação realmente não começou, ficou pendente ou tem resultado desconhecido.

O contrato do agente define a comunicação; engine/intake a compõem deterministicamente, sem outra chamada à IA. Launcher apenas apresenta texto e ações efetivamente implementadas. Não prometer prazo de recuperação ou ausência de cobrança sem suporte nos contratos vigentes.

Exemplos ilustrativos, dependentes dos fatos comprovados:

| Situação | Mensagem ao usuário | Diagnóstico ao operador |
| --- | --- | --- |
| Assistência indisponível antes de qualquer aplicação/escrita | “A assistência por IA está indisponível neste momento. Seu formulário e a proposta pendente foram mantidos; nenhuma alteração foi aplicada. Você pode continuar preenchendo manualmente ou retomar depois.” | Estágio, categoria, origem conhecida, correlação e intervenção necessária. Não pedir que o usuário compre créditos para resolver saldo da conta operada pela EIAH |
| Limite contratado do workspace confirmado pela fonte financeira | “O limite de uso deste workspace foi atingido. Seu trabalho foi mantido. Consulte o administrador do workspace.” | Identificar o gate e a fonte autorizada do limite; não atribuir o bloqueio à conta operacional do provider |
| Integração própria do cliente comprovadamente identificada e recusada | “A integração de IA configurada para este workspace não está disponível. Seu trabalho foi mantido. O administrador pode verificar a configuração.” | Registrar propriedade/origem confirmada da integração e código sanitizado. Não expor chave nem assumir que o usuário atual pode corrigi-la |
| Resultado de efeito desconhecido após timeout | “Ainda não foi possível confirmar o resultado desta operação. Vamos verificar seu estado antes de tentar novamente.” | Estado indeterminado e referência para conciliação, sem afirmar que nada foi gravado. Só oferecer verificação automática se ela estiver implementada |

### K–L. Contabilização e observabilidade

Uma **solicitação lógica** é o pedido de assistência da aplicação. Ela pode gerar **chamadas físicas** por retry/fallback. Esses contadores não são tokens, custo do provider, reserva financeira ou débito da EIAH. São dimensões independentes, vinculadas por correlação e proveniência quando disponíveis.

Uso informado pelo provider deve manter origem e unidade. Ausência de usage/custo não significa zero. Uma chamada recusada não recebe geração/uso fictícios nem lançamento de “sucesso”; a eventual cobrança ou liberação de reserva depende do contrato financeiro vigente. Não prometer gratuidade, estorno ou ausência de cobrança por inferência. Reservas inexistentes no caminho atual não são criadas por esta proposta.

Na implementação inspecionada, o intake do cadastro retorna antes do dispatch operacional e chama executeLlmStep diretamente, sem reserva/chargeRun nesse caminho. Em capabilityExecution, recordCapabilityUsage ocorre após retorno bem-sucedido do executor e exige run/escopo/request ID; chargeRun e reconciliação pertencem a billing/worker. A remoção do request ID fictício pode afetar o registro de uso quando um retorno não fornece ID real: é impacto a revisar com o dono financeiro, não motivo para fabricar ID nem para alterar billing agora. Não se demonstrou a contabilização implantada de todos os caminhos.

Metadados propostos, sempre com disponibilidade/proveniência explícitas:

| Grupo | Informação a correlacionar |
| --- | --- |
| Aplicação | Correlação lógica, turno/contexto/versão, horário e duração por etapa, agente/contrato/capacidade; escopo apenas em log interno autorizado |
| Tentativas | Índice e motivo de retry/fallback, camada que iniciou, limites efetivos e contagem física medida ou explicitamente desconhecida |
| Provider | Solicitado/selecionado/confirmado, modelo solicitado/confirmado, status e request ID reais quando fornecidos, motivo de término recebido |
| Resultado | Transporte, geração, extração, parsing, schema, domínio, confirmação e efeito com resultados separados; motivo de bloqueio/falha e necessidade de intervenção |
| Financeiro | Uso reportado, estimado ou ausente; origem de custo, reserva quando houver, lançamento/reconciliação pelos contratos existentes |

Nenhum log de sucesso de completion comprova aprovação de schema ou efeito. Nenhum array de observação vazio comprova zero chamadas se o observador não mediu o transporte. Dados brutos sintéticos podem ser preservados como evidência com proveniência; credenciais, headers de autorização, prompts e dados reais desnecessários não entram na telemetria padrão. Retenção e visibilidade operacionais precisam respeitar a policy aplicável; esta seção não inventa prazo de retenção.

### Incidente ilustrativo e correspondência com o patch pausado

O [diagnóstico real local preservado](../../ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/README.md) recebeu OpenAI insufficient_quota/credit_balance_exhausted. O adaptador retornou string vazia, completion registrou sucesso e o intake rejeitou em json_parse. Foram violadas as fronteiras entre recusa de provider, geração e parsing. O incidente exemplifica o contrato; não define regra exclusiva para OpenAI ou IMOB.

A divergência de deploy web/API em staging é frente separada. A causa da tentativa HTTP específica continua não comprovada. O fluxo de quartos/vaga com provider real **não está aprovado**; staging requer alinhamento da API e reteste separadamente autorizado.

Ponto preservado: branch `feat/imob-guided-property-draft`, HEAD `70e66db4e7eea727f0f3567d8291595b1f86243b`, upstream `origin/feat/imob-guided-property-draft`, stage vazio. CLAUDE.md/CODEX.md, Evidence Index do diagnóstico, changes.diff e logs anteriores continuam locais. Não houve branch/stash/backup de preservação.

| Alteração parcial presente | Relação com regras existentes | O que não está ratificado/completo |
| --- | --- | --- |
| OpenAIProvider detecta transporte/status/error antes de conteúdo; não fabrica request ID | Corrige a perda de causa comprovada e evita apresentar falha como interpretação/sucesso | Cobertura dos demais adaptadores, modalidades e distinção de ID/completion/trace em todos os consumidores |
| Novo LLMProviderError/diagnostic e guard no core | Meio local de preservar causa sanitizada; não existia exceção LLM tipada no contrato de sucesso | Arquivo, nome, categorias, campos e branding não são padrão definitivo; faltam timeout/falha interna e contrato completo de resultados |
| completionEngine/retry respeitam retryable e propagam causa; logs de falha | Sem retry de quota segue a instrução explícita já dada para o incidente; não reabrir essa decisão | Elegibilidade transversal, cancelamento/deadline, retry multiplicado e fallback de capability precisam de ratificação/adaptação |
| llmExecutor remove fallback fictício de request ID e trace vazio; rota cria correlação | Não inventar metadados e usar runtime existente | Formato transversal de correlação, origem e impacto nos consumidores financeiros não estão homologados |
| Intake IMOB mantém unavailable, preserva proposta e não envia erro ao parser; mensagem muda no contrato | Alinha-se à arquitetura vigente; sem regra cognitiva nova no launcher nem nova autorização de escrita | Não prova chat HTTP implantado, mensagens de outras origens financeiras ou conformidade de outros agentes |
| Fixture derivada, testes, script e step oficial de CI locais | Rastreabilidade do erro real com dublês e cobertura seletiva | Não constituem CI remoto aprovado, aprovação do contrato, build ou homologação financeira |

Resultados anteriores à pausa, recuperados **sem reexecução** de `ops/evidence/latest/imob-property-provider-failure-2026-11-16/`:

| Registro existente | Resultado recuperado | Limite |
| --- | --- | --- |
| provider-tests-validated.log | 7 testes, 7 aprovados, 0 falhas/ignorados; comando terminou exit 0 | Transporte sintético; não provider real |
| intake-tests-direct.log | 13 testes, 13 aprovados, 0 falhas/ignorados; exit 0 | Intake/rota com dublês |
| adapter-tests-direct.log | 15 casos selecionados, 15 aprovados, 0 falhas/ignorados; exit 0 | Adaptador em memória; não navegador |
| render-only.log, runtime-entrypoint.log, presentation-contract.log, ci-registration.log | ok:true; chamada conjunta dos três gates exit 0; registro CI exit 0 | Gates locais; não checks remotos nem aprovação transversal |
| typecheck-first.log | 12 raízes, 3 diagnósticos focais e 16 de dependências; **não aprovado** | Dois acessos antigos a blockers e um acesso novo a presentationSnapshot no teste do adaptador. Sem correção após a pausa |
| contracts-typecheck.log | Log vazio; processo iniciado antes da pausa terminou | Código de saída não foi preservado separadamente no pacote; não certificar aprovação apenas pelo log vazio |

Os logs first/second/direct/final e a revalidação pontual provider-quota-final preservam falhas intermediárias. Os primeiros comandos com --test resumiram arquivos, sem contagem dos casos; não somar esses resumos aos testes efetivos. A proposta não normaliza nem apaga esses originais. As evidências anteriores de conversa guiada e diagnóstico permanecem históricas, com seus próprios limites; não são aprovação desta seção. O Evidence Index existente não foi atualizado nesta etapa documental.

A [fixture parcial](../../packages/providers/tests/fixtures/openai-credit-balance-exhausted.json) foi derivada, antes da pausa, de `runtime.syntheticRawResponse.error` do [resultado original local](../../ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-integrated.json), SHA-256 `f77384445eebd224b210fb2d9101e79e7a0b46d7b4a9462172df0b454333bbd7`. Mantém somente type/code; message/param foram omitidos. Status 429 e request IDs usados nos testes são sintéticos, não metadados recuperados do incidente. O original foi preservado.

Os dois comandos de typecheck iniciados antes da solicitação de pausa terminaram; os resultados acima foram lidos sem nova execução. Não foi identificado processo node/tsx/tsc ativo na consulta local, sem ação de encerramento ou presunção de continuidade. Nenhum teste, build, chamada de provider ou patch de produção foi iniciado após a mudança para esta etapa documental. Os artefatos da implementação parcial permanecem para rastreabilidade, sem limpeza ou novo mecanismo de preservação.

### Critérios propostos de conformidade — ainda não executados transversalmente

| Critério verificável | Prova necessária para adoção |
| --- | --- |
| Autoridade e isolamento | Permissão/escopo/entitlement negados impedem provider/efeito indevido; modelo não modifica fatos de autorização |
| Contexto e linguagem | Perguntas, correções e confirmações equivalentes usam histórico/draft/proposta corretos, sem gramática obrigatória; dados canônicos mantêm validação |
| Falha antes de conteúdo | Quota, rate limit, auth, transporte, timeout e erro interno chegam como falhas com etapa; parsing/schema não recebem recusa como texto vazio |
| Classificação | Erros estruturados distinguem quota financeira de rate limit mesmo com status igual; origem financeira desconhecida continua desconhecida |
| Tentativas | Quota não repete; transitórios seguem só limites vigentes; contagem cobre tentativas de todas as camadas e explicita o que não foi medido |
| Fallback | Alternativa não autorizada/indisponível não executa; escolha do cliente não muda silenciosamente; rota efetiva é rastreável |
| Continuidade e efeitos | Falha, edição manual, troca de contexto e resposta tardia não sobrescrevem trabalho; draft confirmado não grava; duplicação não repete efeito |
| Comunicação | Mensagem contextual vem de contrato/engine sem nova IA, sem segredo, prazo inventado, ação inexistente ou pedido de créditos para falha operacional |
| Contabilização | Sem uso/ID/custo fictícios; teste dos consumidores financeiros verifica ausência de débito de sucesso para recusa, reservas conforme contrato e idempotência, sem supor custo zero |
| Observabilidade | Transporte, geração, validação e efeito têm estados separados; campos ausentes e falhas do observador são explícitos |
| Compatibilidade | Mapeamento por contrato/capacidade, política de versionamento, consumidores de IDs e gates oficiais avaliados antes de migração; regressão do sucesso coberta |

### Decisões humanas pendentes, sem reabrir decisões já tomadas

1. **Ratificação arquitetural:** aprovar ou ajustar estas fronteiras como extensão transversal da arquitetura vigente, mantendo os contratos de domínio. Agent-driven, fail-closed, linguagem natural, ausência de escrita silenciosa e proibição de retry de quota já estão decididos; não são perguntas novas.
2. **Representação e compatibilidade:** decidir o local/formato final da falha no contrato LLM existente (exceção tipada, envelope ou mapeamento), nomes/categorias e migração dos consumidores; o patch local não decide isso. Eventuais reason codes novos precisam do processo humano já definido, sem ativação automática.
3. **Seleção/fallback:** ratificar a precedência entre perfil, policy de capacidade e escolha contratual do cliente, a fonte autorizadora das alternativas e o tratamento de integração própria. Não conceder autorização geral a providers alternativos nem pedir de novo a execução de chamadas reais nesta etapa.
4. **Responsabilidade por tentativas:** designar o dono do orçamento lógico compartilhado, cancelamento e interação com retries de transporte/SDK, usando limites existentes; qualquer mudança numérica fica para decisão separada baseada em fonte vigente.
5. **Governança financeira e observabilidade:** validar com os donos existentes a identificação da conta operadora, os consumidores de request IDs, reservas/cobrança e acesso/retenção de diagnóstico. Não definir preço, grant, recarga ou isenção aqui.
6. **Adoção e retomada:** decidir o recorte inicial de migração e seus gates, e autorizar separadamente a retomada dos patches pausados. Alinhar/retestar staging e aprovar fluxo real de quartos/vaga permanecem decisões operacionais distintas, não consequências da ratificação documental.

### Autorização delimitada de Δ1–Δ3 — 2026-11-16

O usuário autorizou explicitamente retomar **somente Δ1, Δ2 e Δ3** do mapeamento pontual, sem chamadas reais, alterações financeiras, configuração de providers, novos fallbacks, cancelamento físico transversal ou publicação. Essa autorização resolve a retomada desse recorte; **não ratifica o restante do contrato transversal**, que permanece PROPOSTA. Os registros da pausa acima são históricos e foram preservados.

- **Δ1:** a exceção interna compartilhada LLMProviderError preserva causa estruturada sanitizada; completion respeita sua elegibilidade de retry e intake usa o resultado público unavailable já existente. Não se acrescentaram categorias transversais de timeout/falha interna, novos reason codes ou regras cognitivas no launcher. A mensagem pertence ao contrato IMOB; a espera e a preservação usam os mecanismos existentes.
- **Δ2:** completionId é a identidade retornada no corpo; providerRequestId é o header real quando fornecido; traceId é correlação da aplicação, sem fallback para completion ID. O campo legado requestId continua sendo **referência de contabilização**, preferindo o completion ID real para preservar a chave de idempotência existente; não deve ser apresentado como request ID do provider. Usa header real somente quando falta completion ID, sem literal fabricado. Modelo solicitado e modelo confirmado são distintos; valores desconhecidos permanecem ausentes.
- **Compatibilidade:** generateText, executor, normalização e chamada ao writer de breakdown foram exercitados com transporte sintético/dublê. Se uma capacidade com run/escopo recebe geração sem identidade real utilizável, lança CapabilityUsageIdentityUnavailableError, com retryable=false e generationCompleted=true. O erro ocorre depois do executor e é relançado antes do fallback; não repete geração para obter ID. Não altera billing, reservas, cobrança ou a chave do writer. Suportar registro financeiro de consumo sem identidade real exige contrato financeiro separado; permanece bloqueado, sem inventar chave ou custo.
- **Δ3:** FrontDoorMessageLike declara presentationSnapshot opcional, que toLauncherMessage já produz. A asserção permanece intacta, sem any/cast/supressão. Builds oficiais de core/providers e smoke dos módulos dist passaram. Typecheck focal de 16 raízes continua **reprovado** com dois erros antigos comprovados na baseline HEAD e 16 diagnósticos de dependências, sem diagnósticos introduzidos. Não equivale a aprovação integral da API/web.

Resultados, códigos de saída, reaproveitamento e limites estão no [pacote de execução Δ1–Δ3](../../ops/evidence/latest/imob-property-provider-failure-2026-11-16/README.md). As decisões de seleção/fallback, orçamento/cancelamento global e adoção transversal permanecem em revisão. A ausência de geração válida com provider real e a causa não comprovada da tentativa específica de staging permanecem inalteradas; alinhamento web/API e reteste dependem de etapa separadamente autorizada.

### Instrumentação local delimitada do intake IMOB — 2026-11-16

Autorizada separadamente apenas a instrumentação local e seus testes com dublês/transporte sintético. Reutiliza logger, header `x-trace-id`, engine/intake, executor e diagnósticos existentes; não ratifica o restante da proposta transversal nem altera mensagem pública, autorização, seleção, retries, fallback ou finanças.

A correlação HTTP acompanha o engine/intake e o executor. Logs internos distinguem resolução de perfil, entrada/verificação de política, registro/resolução de provider, despacho ao adaptador, tentativa de transporte OpenAI, resposta recebida, parsing/validação e desfecho. Entrada no executor/despacho não comprova rede; tentativa de transporte não comprova resposta. Os eventos de transporte acrescentados pertencem somente ao adaptador OpenAI, sem alegar cobertura dos demais adaptadores. Erros genéricos recebem categoria interna/código controlado pela etapa, sem mensagem, stack ou propriedades arbitrárias. Diagnósticos estruturados de provider preservam os campos disponíveis, sem inventar IDs/modelo efetivo/uso/custo.

O [pacote desta execução](../../ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/README.md) registra resultados e limites reais. A instrumentação não recupera o erro perdido da tentativa de 16/11 às 14h22 (correlação HTTP `99c62fed-6785-40f0-a8fb-ea4bf94e5f3b`), cuja causa continua não comprovada. A consulta anterior encontrou web/API alinhadas no SHA `64fe82daca311d171532c9f65511d8cab30df3ad`; isso atualiza apenas o estado daquele deploy, sem invalidar a divergência histórica documentada acima. Publicação desta instrumentação e reteste correlacionado exigem etapas separadamente autorizadas. Vínculo da credencial à organização/projeto abastecido permanece verificação administrativa separada, sem inspeção de segredos.

Na preparação posterior, sem mudar fontes ou repetir os testes válidos, builds core/providers e smoke formal de dist passaram. A tipagem focal de 17 raízes permaneceu reprovada com dois diagnósticos antigos focais e 16 de dependências, nenhum introduzido contra HEAD virtual; não é aprovação integral. O build API terminou exit 2 na tipagem (24 diagnósticos), antes de empacotar: exports IMOB existem na fonte de contratos, mas faltam no dist local consultado. Essa configuração completa não recebeu comparação com baseline; sua pendência não foi contornada. Preparação da dependência compilada, nova conferência API e publicação exigem etapa separada.

A comparação Render disponível encontrou somente web/API no workspace acessível e consumidor runs desabilitado na API; não encontrou worker de runs separado. Intake usa perfil EIAH; worker usa agente da run e executeCapability, compartilhando as camadas inferiores. Não se verificou presença das variáveis de provider. Esses fatos não provam a causa da falha e não autorizam criar runtime, converter perguntas em runs ou habilitar consumidores.

Etapa posterior explicitamente autorizada: build documentado de @eiah/contracts e novo build oficial API terminaram exit 0, com exports IMOB confirmados e sem diagnósticos restantes na API. O dist é ignorado; nenhuma fonte/export/configuração mudou. O bloqueio local descrito acima é histórico e foi removido por essa preparação de dependência. A tipagem focal anterior continua reprovada e não é substituída pela configuração oficial API, que exclui testes. Publicação e reteste real permanecem separados.
