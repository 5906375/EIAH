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
