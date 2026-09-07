# ADR-002 — Inteligência Coletiva Governada (Swarm Conservador)

- **Status:** PROPOSTA — submetida à ratificação arquitetural; decisão humana pendente.
- **Versão submetida:** v2-r3 — atualização do estado documental da AUTHZ-RUNS; preserva as notas explicativas da v2-r2 e as demais decisões arquiteturais.
- **Autoridade ratificadora:** Carlos Alberto Merlo.
- **Baseline da consulta e base documental:** `11805d1934573281e2787c2442b546c172b76947`. A ponta de `refs/heads/main` em `origin` foi verificada por `git ls-remote` em 2026-09-05. A implementação exigirá nova verificação e reconciliação dos deltas estruturais aplicáveis.
- **Precedência:** ROADMAP_UNIFICADO_v8 → AGENTS.md → docs/architecture/agent-chat-runtime.md → docs/EVIDENCE_INDEX.md → IA_EIAH.md.
- **Relação com ADRs:** proposta de capacidade coletiva distinta da decisão de stack do ADR-001; respeita a arquitetura existente.
- **Origem:** v2 apresentada pelo usuário e consulta estática do baseline. Materiais NovaRumoEiah são insumos externos, não fontes canônicas por si sós.
- **Publicação proposta:** branch documental `docs/adr-002-v2-r3`, separado do branch estrutural, com destino `main`. Abertura ou merge do PR não substitui a ratificação humana registrada.
- **Registro da versão:** [Ficha de ratificação arquitetural](../ops/adr-002-v2-r3-ratification-record.md).
- **Decisão relacionada:** [Matriz AUTHZ-RUNS e pendências técnicas](../ops/authz-runs-scope-matrix.md).

> Esta ADR registra uma proposta arquitetural. Sua ratificação não comprova implementação nem autoriza o piloto. A implementação segue o processo do projeto; o piloto depende das condições do §9 e de decisão humana específica. O pedido de encaminhamento foi atendido pela preparação deste documento e não foi convertido em assinatura.

> **Nota explicativa — Condições de saída para liberar o piloto:** a seção 9 reúne os requisitos de autorização, revalidação no worker, testes do Guardian e do coletivo, proteção das evidências, bloqueio de ferramentas, limites de recursos e decisão humana necessários para iniciar o piloto.

## 1. Contexto

O EIAH pretende evoluir para Swarm Intelligence de forma conservadora, por meio de Inteligência Coletiva Governada: coordenação central, participação distribuída e execução controlada.

Na consulta estática, nenhum dos oito nomes de contratos coletivos propostos foi encontrado no conteúdo versionado do baseline. Essa busca não demonstra ausência de toda funcionalidade equivalente com outro nome. Também não foi encontrado ADR coletivo na árvore de ADRs desse SHA. A capacidade coletiva permanece proposta, sem prontidão operacional comprovada.

A regra arquitetural do chat permanece: **Agente define. Engine executa. Launcher renderiza.** O `chatLauncherEngine` frontend resolve comportamento conversacional; o launcher apresenta esse resultado. A extensão coletiva desta ADR coloca orquestração coletiva e decisões de autorização no núcleo backend, sem redefinir a função do engine conversacional.

## 2. Decisão arquitetural proposta

| Campo | Decisão submetida |
|---|---|
| Tipo | Capacidade transversal encapsulada do núcleo backend |
| Entrada da experiência | EIAH como front door |
| Primeiro domínio | IMOB como contexto e dono da solicitação de domínio |
| Coordenação técnica | Núcleo backend, executando contratos comportamentais e políticas |
| Participantes iniciais | Perfis existentes de J_360 (`j360`), FinNexus (`fin-nexus`) e Guardian (`guardian`), condicionados a autorização efetiva |
| Autorização | Por tenant, workspace, agente, versão, escopo, política e decisão humana exigida |
| Guardian no piloto | Obrigatório em toda consulta |
| Produto da consulta | Recomendação, divergências, avaliações e receipt |
| Efeitos do piloto | Apenas gravações de controle e auditoria explicitamente previstas; nenhuma mutação de negócio |
| Ferramentas externas | Negadas no despacho do backend durante o piloto |
| Swarm operacional | Não declarado nem autorizado por esta ADR |

A função de solicitante pode ser exposta pelo EIAH no contexto IMOB; isso não transfere a coordenação técnica nem a autorização para a interface.

## 3. Quatro etapas de decisão e execução

1. **Ratificação arquitetural:** decisão humana sobre esta versão do ADR.
2. **Autorização de implementação:** mudanças delimitadas pelo processo vigente, incluindo AUTHZ-RUNS e as escolhas de autorização coletiva.
3. **Implementação e validação:** código, testes e CI no SHA reconciliado.
4. **Ratificação do início do piloto:** decisão humana posterior ao atendimento do §9.

> **Nota explicativa — Condições de saída para liberar o piloto:** a seção 9 reúne os requisitos de autorização, revalidação no worker, testes do Guardian e do coletivo, proteção das evidências, bloqueio de ferramentas, limites de recursos e decisão humana necessários para iniciar o piloto.

A ratificação arquitetural não concede scopes, não habilita participantes e não transforma evidência planejada em teste realizado. A preparação técnica read-only pode subsidiar a etapa 2.

## 4. Invariantes

1. Agentes definem comportamento; o núcleo backend executa a orquestração coletiva e aplica autorização; o launcher não concede autorização.
2. **Consenso, maioria, reputação, participação e consulta não concedem autorização.**
3. A participação e a execução exigem os vínculos e permissões aplicáveis: atribuição aprovada, tenant, workspace, agente, versão, escopo, política e revisão humana quando exigida.
4. No coletivo, atribuição aprovada significa decisão humana vinculada e verificável. A implementação não altera silenciosamente o contrato global de `WorkspaceAgentAssignment`, que no baseline aceita assinatura ausente.
5. Guardian é obrigatório em toda consulta do piloto. Veto crítico prevalece sobre maioria; timeout, falha ou resultado inconclusivo impedem conclusão como apta.
6. Divergências, limitações e afirmações sem fonte permanecem identificáveis e auditáveis.
7. O piloto não executa ferramentas de negócio nem ações externas. Eventual execução posterior exige fluxo próprio de autorização fora deste piloto; nenhuma aprovação de consulta amplia essa superfície.
8. Produção, validação e ratificação são funções distintas. A consulta produz recomendação e receipt, sem mutação de negócio.

## 5. Contratos propostos

Descobrir equivalentes existentes antes de fixar nomes ou criar novos pacotes. Tipos devem ser versionados e acompanhados de validação runtime.

| Contrato | Produtor | Consumidor | Efeito permitido |
|---|---|---|---|
| `CollectiveConsultationRequest` | Agente solicitante via núcleo | Coordenador backend | Solicitar abertura da consulta, sujeita à autorização |
| `CollectiveParticipantAuthorization` | Camada de autorização | Coordenador e despacho | Habilitar participação delimitada, sem autorização externa |
| `CollectiveContribution` | Participante autorizado | Agregador | Registrar parecer, fontes e limitações |
| `CollectiveDivergence` | Agregador | Resultado e revisão humana | Registrar discordância sem apagá-la |
| `CollectiveAggregation` | Agregador | Avaliadores e Guardian | Consolidar contribuições e divergências |
| `GuardianCommitteeDecision` | Avaliadores de domínio | Guardian e revisão humana | Registrar avaliações por critérios de domínio, sem conceder execução |
| `CollectiveGuardianDecision` | Guardian | Núcleo e revisão humana | Registrar aplicação determinística das regras de política e veto |
| `CollectiveConsultationReceipt` | Núcleo | Leitores autorizados e auditoria | Comprovar conteúdo e estado da consulta por digest |

Se o comitê apenas repetir a agregação, consolidar os tipos antes da implementação, com justificativa. Uma decisão determinística de política não transforma parecer de modelo em fato comprovado.

A correlação por `consultationId`, `parentRunId` e `assessmentId` deve ter cardinalidade e escopo definidos. Cada artefato deve permitir rastrear tenant/workspace, participante e versão, fontes, política e autorização aplicáveis. Identificadores e digests não substituem autorização.

A ratificação humana é registro separado, autenticado e vinculado ao digest do resultado avaliado. Reutilizar contratos existentes quando sua semântica for suficiente.

## 6. Guardian: infraestrutura e avaliação da consulta

Os seis handlers inspecionados tratam de segregação de ambiente, saúde de runtime, artefatos de go-live, rollback, política de go-live e proteção de borda. A política do perfil restringe LLM em execução crítica e define fallback de bloqueio.

O gate de prontidão da infraestrutura e a avaliação de cada consulta são responsabilidades distintas. A presença de evidências de infraestrutura não comprova correção de um parecer de domínio.

Reutilizar os controles aplicáveis e os perfis existentes, sem criar outro Guardian. Avaliações de domínio e seus limites devem ser definidos nos contratos próprios.

Definir a interpretação de `verified`, `warning`, `missing` e `degraded` por controle. Um handler que retorna `success` pode carregar resultado de domínio incompleto. Somente a interpretação explícita do resultado, conforme política, determina o estado da consulta.

A consulta anterior não localizou testes nominais de execução direta dos seis handlers; localizou referências em planejamento, mocks e agregação. A cobertura real deve ser demonstrada conforme §9, incluindo falhas e timeout finito.

> **Nota explicativa — Condições de saída para liberar o piloto:** a seção 9 reúne os requisitos de autorização, revalidação no worker, testes do Guardian e do coletivo, proteção das evidências, bloqueio de ferramentas, limites de recursos e decisão humana necessários para iniciar o piloto.

## 7. Ferramentas, dados e limites

O perfil FinNexus declara capacidades de transação, notificação e escrita financeira. Essa declaração não prova que todas estejam operacionais; demonstra que a participação coletiva não pode herdar o perfil de ferramentas sem restrição.

As restrições devem ser impostas no backend em todos os caminhos de despacho aplicáveis. Instrução de prompt não constitui controle de autorização.

Definir separadamente: inferência de modelo, leitura de fontes autorizadas, checks internos de infraestrutura e ações externas. Acesso ao health check exige classificação e destino permitidos explícitos; não constitui exceção genérica para acesso externo.

Permitir somente gravações enumeradas de controle e auditoria. Proibir mutações de negócio e promoção automática de conteúdo para memória ou conhecimento. O worker geral somente será reutilizado depois de demonstrar que memória, recomendações, billing e tools respeitam os limites do piloto.

Antes da liberação, definir participantes obrigatórios, fontes disponíveis, limites de duração, quantidade de participantes, tentativas e orçamento. Valores ainda não definidos não são permissões ilimitadas.

## 8. Imutabilidade, identidade e evidência

O StorageProvider existente permite sobrescrita e exclusão, e sua leitura por chave não autentica o leitor. O fluxo coletivo deve garantir autorização de leitura por escopo, integridade por digest, escrita idempotente e proteção contra conflitos concorrentes.

Correções usam supersessão, com referências à evidência ou ratificação anterior. Retenção e descarte seguem política específica; não remover `deleteObject` globalmente nem alterar consumidores existentes sem análise de impacto.

Autenticidade e autoridade da ratificação derivam do contexto autenticado e da permissão do decisor, vinculados ao conteúdo avaliado. Uma string de identidade, assinatura em texto ou digest isolado não comprova essas propriedades.

## 9. Condições de saída para liberar o piloto

Todas devem ser verificadas no SHA reconciliado, com evidências reais e decisão humana de início:

- Baseline reconciliado, preservando mudanças pendentes e incorporando apenas commits estruturais aplicáveis.
- AUTHZ-RUNS ratificada e aplicada a todas as rotas mutáveis; eram oito rotas POST no baseline consultado. Aprovação exige identidade humana válida e permissão adequada.
- Worker verifica o Run persistido e sua correspondência com tenant/workspace/agente/versão/assignmentId antes de efeitos de negócio; ausência ou divergência bloqueia. Auditoria de recusa é permitida.
- Contrato de autorização coletiva define e implementa aprovação humana, validade, revogação e revalidação, com decisão explícita sobre grant específico ou evolução global.
- Testes de rota sem scope, identidade humana ausente, atribuição revogada/expirada/divergente, vínculo inválido do job e isolamento entre tenants/workspaces.
- Testes reais dos seis handlers Guardian, cobrindo estados alcançáveis, falhas e timeout finito. `success` técnico não concede aprovação.
- Contratos tipados e validados; receipt com leitura autorizada; ratificação autenticada vinculada ao digest; integridade, concorrência e supersessão testadas.
- Teste em que maioria favorável não supera veto crítico.
- Teste em que participante obrigatório ausente ou em timeout deixa a consulta incompleta ou bloqueada.
- Teste de preservação de divergências e identificação de afirmações sem fonte no resultado e no receipt.
- Testes de repetição sem efeitos duplicados e de revogação de fontes ou autorizações antes do despacho relevante.
- Testes que comprovem ferramentas de negócio negadas mesmo quando solicitadas pelo modelo, e ausência de promoção de conhecimento por qualquer caminho do piloto.
- Fontes e limites de recursos definidos; gates aplicáveis executados; decisão humana de início vinculada às evidências.

## 10. Decisões delimitadas e pendências

Submetidas à ratificação nesta versão: núcleo backend como coordenador técnico; EIAH como entrada; IMOB como contexto e dono do fluxo de domínio; Guardian obrigatório em toda consulta do piloto; autoridade humana única; ausência de promoção de conhecimento no piloto.

Estado das decisões e pendências para implementação e liberação:

1. **AUTHZ-RUNS — decisão registrada; implementação pendente.** O vocabulário e os scopes por rota seguem a [matriz apresentada como ratificada por Carlos Alberto Merlo](../ops/authz-runs-scope-matrix.md). Permanecem pendentes a aplicação dos controles, os testes e a reconciliação técnica: caminhos efetivos das rotas, migração dos consumidores e grants de `runs:write`, relação entre permissões e correspondência com a política de risco. A notação por tiers não concede herança automática. O registro da decisão não comprova aplicação dos controles nem aprovação de testes.
2. Permissões específicas para criar consulta, participar e revisar.
3. Forma do grant coletivo, validade, revogação e evidência de aprovação humana; impacto sobre atribuições globais, se houver.
4. Fontes e dados autorizados do tenant do piloto, com disponibilidade comprovada.
5. Critérios de avaliação de domínio, semântica dos estados Guardian e participantes obrigatórios.
6. Limites de recursos e política de retenção/descarte.
7. Procedimento futuro de promoção de conhecimento, sob autoridade de Carlos e fora deste piloto.

As pendências dos itens 2 a 7 e as verificações técnicas do item 1 não são resolvidas implicitamente pela assinatura arquitetural. A ratificação registrada da matriz não equivale à ratificação desta ADR.

## 11. Bloqueios técnicos conhecidos

- **Autorização:** ausência de scope explícito nas oito rotas do baseline; aprovação humana incompleta; revalidação de vínculo Run/atribuição no worker.
- **Efeitos fora do escopo:** herança de ferramentas ou uso do worker geral sem comprovar os limites shadow.
- **Evidência:** autenticação, autorização, integridade e imutabilidade precisam operar em conjunto.
- **Comportamento coletivo:** regras propostas de veto, divergência, incompletude e idempotência ainda precisam de implementação e testes.

O diagnóstico é estático; não comprova comportamento em produção nem resultado de testes.

## 12. Consequências

Benefícios esperados: autoridade explícita, reuso do núcleo, preservação de divergências e rastreabilidade. Custos: fechamento de autorização, proteção de ferramentas e evidências, testes e limitação deliberada do piloto.

Consenso tratado como autorização, vazamento entre empresas, veto ignorado e efeitos externos indevidos são riscos que a implementação deve mitigar e demonstrar por testes. A declaração arquitetural, isoladamente, não comprova essa mitigação.

## 13. Linguagem institucional

Permitida na descoberta: “O EIAH está iniciando sua evolução para Swarm Intelligence de forma conservadora, por meio da Inteligência Coletiva Governada — capacidade transversal encapsulada, coordenação central, participação distribuída, execução controlada.”

Não declarar, antes de evidência correspondente: swarm implementado, enxame autônomo operacional, execução por consenso, rede descentralizada em produção ou seis controles auditados.

## 14. Modelo de autoridade e tratamento de veto

Carlos Alberto Merlo é a autoridade humana designada para ratificação arquitetural, autorização de implementação, liberação do piloto, ratificação de resultados e decisões futuras de promoção de conhecimento. O documento recebido declara essa escolha como decisão explícita. O registro de ratificação desta versão deverá referenciar a decisão de autoridade aplicável, sem fabricar assinatura ou referência histórica.

A acumulação de papéis é segregação funcional, não revisão entre pessoas independentes. Três assinaturas da mesma pessoa não demonstram independência entre pessoas. Segundo revisor não é requisito desta proposta.

Carlos pode determinar correções, solicitar nova avaliação e aprovar mudanças de política pelo processo aplicável. Veto crítico permanece registrado e impede conclusão da consulta como apta. Sua resolução exige nova avaliação, vinculada às evidências e à política aplicável; a decisão anterior é preservada. Exceções não autorizam silenciosamente ações fora da superfície do piloto.

Cada decisão humana registra função, finalidade, justificativa, data/hora, versão de política, evidência, resultado e conteúdo avaliado. Ratificação arquitetural e início do piloto são decisões distintas, mesmo quando tomadas pela mesma pessoa.

## 15. Ratificação arquitetural — preenchimento humano pendente

| Campo | Registro |
|---|---|
| Objeto | ADR-002 v2-r3 — esta versão integral |
| Autoridade | Carlos Alberto Merlo |
| Finalidade | Aceitar ou recusar a arquitetura proposta |
| Decisão | PENDENTE |
| Justificativa | A preencher pelo ratificador |
| Data/hora e identidade autenticada | A registrar no ato da decisão |
| Referência da decisão/política de autoridade | A registrar no ato da decisão |
| Digest do conteúdo | Registrado na [ficha desta versão](../ops/adr-002-v2-r3-ratification-record.md) |
| Liberação do piloto | Não concedida por esta ratificação |

Até a decisão explícita vinculada a esta versão, o status permanece PROPOSTA. A publicação no repositório canônico deverá preservar a referência da versão ratificada e o histórico de alterações.
