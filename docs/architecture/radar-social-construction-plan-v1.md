# Plano de construção do Radar Social
Versão documental: 1.28 — 17/09/2026
Status: plano em evolução; pacote A implementado, revisado e corrigido localmente (Atualizações 1.19-1.20); resolvedor real de acesso desenhado (Atualizações 1.21-1.25), implementado (Atualização 1.26) e com integração confirmada por teste real (Atualização 1.27); caminho seguro de execução real desenhado em detalhe na Atualização 1.28 — proposta de execução futura, não implementação entregue —, com resultado ambíguo corrigido para nunca liberar nova tentativa e precisado quanto a recuperação/consumo e ao significado de `failed`/`running`; nada disso implementado; ativação operacional real permanece não autorizada.

Nota de correção (16/09/2026): o cabeçalho ficou divergente da última atualização
efetivamente consolidada por várias rodadas (permaneceu "1.9" enquanto a Atualização 1.10 já
estava gravada). Corrigido nesta rodada para refletir a Atualização 1.11, a mais recente. O
histórico abaixo (1.0 a 1.10) permanece intacto e não foi renumerado.

## Objetivo e regra de continuidade
Transformar sinais em recomendações úteis, fundamentadas e decisões registráveis, mantendo Radar transversal e MKT como consumidor opcional.
Por solicitação da usuária, as próximas evoluções desta frente devem atualizar este mesmo plano, preservando histórico, versões e distinção entre proposto, aprovado e implementado. Isso não cria automação em segundo plano.
Este arquivo é o plano documental de acompanhamento; não substitui as instruções do repositório nem constitui armazenamento operacional de sinais.

## Fontes de referência
- EIAH_Radar_Social_Baseline_2026-08-23.md: definição conceitual de detectar, identificar, pesquisar, entender, qualificar, sugerir, governar, executar, registrar e aprender.
- EIAH_Vertical_Marketing_conversa_consolidada_2026-08-19_ATUALIZADO.md: reutilização do Core e distinção entre planejamento MKT e vertical completa.
- Vertical-Marketing-MKT.md: identidade e limites da vertical.
- Brief assistido de 14/09/2026, anexo Markdown(20260914-082900).md colado: proposta de piloto, sujeita aos ajustes abaixo.
- Relatórios D5/D6 desta conversa: evidência relatada, não auditoria independente do repositório por este plano.

## Estado preservado
| Componente | Estado e limite |
|---|---|
| fingerprintVersion | Implementação em commits locais anteriores, segundo relatórios |
| D5 | Validação de origem radar e RadarSignalResultV1 concluída localmente segundo relatórios |
| D6 | Confirmação humana concluída localmente segundo relatório final, 129 testes passando |
| Typecheck | 297 diagnósticos anteriores; correção final sem diagnósticos novos, conforme relatório |
| SignalForward | Encaminhamento experimental para MKT; sem ativação operacional |
| Sujeito | Interface de autorização e bloqueio existem em D6; resolvedor real ausente |
| Identidade Radar | String radar não comprova registro operacional ou hash próprio |
| Repositório | HEAD de referência 4d91b6c24794849c574da4e57d21aab41779141e; mudanças locais não representadas integralmente nesse SHA |

Nenhuma nova publicação, commit ou execução é autorizada por este plano.

## Direção atual
Recomendação acolhida como direção de planejamento: análise por modelo governado, com validações determinísticas de entrada, estrutura, referências e limites.
A chamada real a modelo exige autorização específica de fontes, conteúdo, provedor e consumo.
O humano fornece material; o Radar contextualiza, qualifica e recomenda; o humano registra a decisão. Não agir é resultado válido.
D6 não rege automaticamente toda análise do Radar.

## Correções ao brief
1. D6 não fornece autorização operacional completa do sujeito.
2. D5 não é parser do material bruto selecionado pelo humano.
3. Fingerprint identifica conteúdo para idempotência do encaminhamento; não autentica a fonte.
4. ops/evidence/latest/ é candidato a evidência/exportação, não armazenamento operacional comprovado.
5. Ausência de publicação não significa ausência de transmissão externa ou custo de LLM.
6. Governança de acesso, análise e registro permanece no piloto.
7. Ações recomendadas não são ações executadas; MONITOR não inicia monitoramento.
8. Score não comprova ROI; medir utilidade e tempo separadamente.
9. Nomes de contratos, camadas e MKT-CORE devem ser confrontados com fontes canônicas.

## Ordem de construção
| Ordem | Entrega | Critério |
|---|---|---|
| 1 | Identidade, responsáveis, recorte e valor do piloto | Aprovação explícita e limites claros |
| 2 — próxima consulta | Entrada, recomendação e decisão; autorização/persistência e Core | Desenho fundamentado em código e guia real |
| 3 | Primeira jornada assistida | Implementação e testes autorizados separadamente |
| 4 | Avaliação interna | Evidências de qualidade, utilidade e tempo |
| 5 | Detecção automatizada | Fonte/conector autorizado e controlado |
| 6 | Ação governada em destino escolhido | Dependências operacionais e entrega do destino comprovadas |
| 7 | Memória, aprendizado e expansão | Evolução orientada pelos resultados |

A ordem é um plano, não autorização automática para executar cada etapa.

## Piloto proposto, ainda não integralmente aprovado
- Público: equipe interna comercial/relacionamento.
- Recorte: empresas conhecidas de Logística/Comex.
- Entrada: material de fontes selecionadas e autorizadas, sem coleta automática.
- Saída: fato, contexto, incertezas, relevância, evidências, recomendação e decisão.
- Amostra sugerida: 20–30 sinais em 5–8 empresas; valor ainda pendente de aprovação.
- Responsáveis: produto, técnico, operação, dados/governança; nomes pendentes.
- Primeiro exercício: cinco casos fictícios — relevante, insuficiente, ambíguo, fonte não autorizada e NO_ACTION.
- Sem ações externas, execução MKT automática ou importação IMOB.

## Pendências antes de implementar
Identidade e responsáveis; contratos e compatibilidade; entidade e acesso; armazenamento operacional; política de execução do modelo e consumo; lista de fontes; critérios mensuráveis.
Não iniciar outro subsistema sem comprovar necessidade frente ao Core.

## Histórico de evolução
| Data | Evolução | Base | Status |
|---|---|---|---|
| 23/08/2026 | Baseline amplo e transversal | Documento fornecido | Conceitual |
| Setembro/2026 | Experimento concentra validação e confirmação de encaminhamento | Relatórios D5/D6 | Local, relatado |
| 14/09/2026 | Separação Radar / SignalForward / MKT; retomada do valor de descoberta | Discussão e documentos | Direção do plano |
| 14/09/2026 | Piloto assistido com análise por modelo e validações; contratos juntos antes do código | Orientação mais recente da usuária | Direção documental; execução não autorizada |
| 14/09/2026 | Criação deste plano persistente e inclusão do prompt | Solicitação da usuária | Documento criado |

## Atualização 1.1 — diagnóstico de aderência e versionamento

Fonte: relatório Markdown(20260914-114937).md colado, lido nesta conversa. Os achados de código abaixo são relatados pelo executor; este plano não realizou nova auditoria do repositório.

### Resultado e limites
- A comparação completa plano × código não ocorreu: cinco fontes, incluindo este plano, não chegaram acessíveis ao executor. O diagnóstico cobriu CONSULTATION_ORIGIN_AUTHZ_v2.md e SignalForward.
- D5/D6 continuam implementados isoladamente e com mudanças locais não commitadas, segundo o relatório. A correção de autorização no reenvio foi localizada. Os 129 testes e 297 diagnósticos são evidências históricas, não execuções desta consulta.
- HEAD experimental permanece 4d91b6c24794849c574da4e57d21aab41779141e. O relatório aponta divergência de 30 commits de main e 5 do experimento desde a base comum 11805d1, usando refs locais. Isso não informa o estado remoto atual.
- Ausência de upstream e de ref remota em cache NÃO prova que a branch nunca foi publicada.
- As alterações locais não estão representadas no HEAD; isso não prova ausência de cópias ou implementação equivalente em todo outro checkout.
- A evidência descrita de busca por nomes em workflows/scripts é insuficiente, isoladamente, para excluir inclusão por globs ou runners genéricos de CI.
- O resolvedor de sujeito é uma dependência de D6, mas não é o único requisito para uma jornada real de Radar: entrada, análise, persistência, identidade e interface também precisam ser mapeadas.
- "Não usa LLM no SignalForward" não responde quais componentes de model routing do Core podem ser reutilizados pelo Radar.

### Continuidade corrigida
1. Tornar os documentos acessíveis ao executor em caminhos explícitos e confirmar leitura antes de comparar. Anexo visível na interface não comprova materialização no ambiente remoto.
2. Completar SOMENTE a comparação faltante: plano do Radar × componentes reais do Core para entrada, análise, recomendação e decisão. Não repetir a auditoria de D5/D6.
3. Separar preservação/versionamento local do trabalho de produto: inventariar pacote para eventual commit local, sem executar commit, rebase, merge ou push. Não tratar "commitar ou descartar" como únicas alternativas.
4. Escolher a primeira jornada assistida com base na comparação completa, sem avançar automaticamente para resolvedor D6, fila ou MKT.

Nenhum novo código, commit, sincronização remota, banco ou chamada a modelo autorizado. Esta atualização preserva o histórico e corrige somente a interpretação do relatório.

## Atualização 1.2 — fontes acessíveis e primeira jornada assistida

Fonte: relatório Markdown(20260914-120655).md colado. As cinco fontes foram declaradas lidas integralmente pelo executor. A limitação de acesso descrita em 1.1 foi superada nessa consulta; o histórico permanece preservado.

### Achados relatados
- D5/D6 permanecem isolados, sem alterações nesta consulta. Testes anteriores não foram reexecutados.
- LLMRegistry/llmExecutor, uploads, ledger/SCL, knowledgeGate e approval gate foram localizados como candidatos de reaproveitamento fora do SignalForward.
- O campo subjectType=internal_reference do contrato D5 confirma um limite já conhecido, não um novo defeito: material social bruto exige contrato próprio ou adaptação explícita posterior.
- Uso de ops/evidence/latest/ como export/snapshot em componentes pesquisados não comprova sua adequação como armazenamento operacional do Radar.
- Jornada proposta: material manual → entidade → análise → recomendação → decisão. Ainda não implementada nem aprovada para chamadas reais.

### Precisões necessárias antes de autorizar a primeira implementação
1. Selecionar manualmente uma entidade pode dispensar matching automático no piloto, mas não dispensa identidade estável, registro da associação, escopo e autorização reais. Texto livre de limites de acesso é anotação, não enforcement.
2. Reutilização de approval gate não está comprovada só pela assinatura: conferir comportamento, dependências, enum de ações e exigência de runId na integração proposta. Não importar de IMOB automaticamente nem duplicar infraestrutura.
3. Identificar um registro de modelos não comprova o caminho completo de execução governada. A proposta deve apontar o ponto de entrada que mantém contexto, políticas, consumo e evidência.
4. Banco versus arquivos é decisão técnica baseada em consulta, concorrência e acesso. Recomendação para avaliação: PostgreSQL para registros operacionais; storage existente para arquivos; exports como evidência derivada. Nenhum schema autorizado.
5. Uma decisão do Radar não é entrada direta de D5: o caminho atual exige Run de origem radar bem-sucedido e response válido. A futura integração terá contrato explícito, sem fabricar origem ou confirmação.
6. Decisão deve referenciar ID e versão/revisão imutável do parecer; separar aceitar/alterar recomendação da ação de negócio escolhida. Justificativa obrigatória por divergência é proposta nova, não política já aprovada.
7. Associação manual de entidade, bloqueio total da análise quando ambígua, tamanho da amostra e responsáveis ainda requerem decisão explícita. Não os atribuir retroativamente ao baseline.

### Próxima entrega recomendada
Uma especificação curta da jornada assistida, resolvendo associação e acesso, caminho governado de análise, persistência e ligação versionada entre recomendação e decisão. Deve incluir caso fictício e matriz de aceite, sem nova auditoria geral ou implementação.
Versão de código/commits de D5/D6 segue como trilha separada. Não priorizar fila ou resolvedor de D6 automaticamente sobre a entrega de produto.

Nenhuma chamada a LLM, código, banco, commit ou publicação autorizada por esta atualização.

## Prompt de continuidade — referência da versão 1.0
```text
Frente: Radar Social — plano de construção e piloto assistido
Worktree de referência: /home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX
Branch esperada: experiment/signalforward-origin-fingerprint-fix
HEAD de referência: 4d91b6c24794849c574da4e57d21aab41779141e

Objetivo: mapear os contratos de entrada, recomendação e decisão, e comprovar o caminho de autorização e persistência antes de propor implementação.

Autorizado: leitura focalizada e proposta documental nesta resposta. Nenhuma alteração no repositório nesta rodada.

1. Leia CLAUDE.md, CODEX.md, IA_EIAH.md e AGENTS.md aplicáveis. Localize e leia o guia de construção de produto vigente; informe caminho, versão e regras aplicáveis. Não presuma que as designações de camadas do brief correspondem ao guia real.

Confirme worktree, branch, HEAD e git status --short. Preserve mudanças locais e arquivos não rastreados de D5/D6. Se o estado divergir da referência, descreva a diferença sem reset, checkout ou troca de branch.

2. Leia o Plano de construção do Radar Social fornecido com este pedido, o baseline do Radar de 23/08/2026, a consolidação de Marketing de 19/08/2026 e o brief assistido de 14/09/2026. Use somente as partes pertinentes do CONSULTATION_ORIGIN_AUTHZ_v2.md.
Se um documento não estiver disponível, declare a limitação; não invente seu conteúdo.

3. Direção de produto:
Modelo governado para interpretação, acompanhado de validações determinísticas. Esta direção não autoriza chamadas reais.
O piloto recebe material selecionado pelo humano, apresenta contexto e recomendação fundamentada e registra uma decisão.
Radar é transversal; MKT é consumidor opcional; SignalForward não define o Radar.
Público interno, Logística/Comex, amostra e responsáveis continuam propostas ou pendências, salvo aprovação explícita documentada.

4. Apresente três contratos conceituais em conjunto:
A. Entrada: material recebido, fonte, captura, conteúdo disponível, referência da entidade e escopo.
B. Recomendação: acontecimento, evidências, FACT/INFERENCE/HYPOTHESIS/UNKNOWN, relevância, riscos, ação sugerida e limitações.
C. Decisão: referência à revisão da recomendação, escolha humana, identidade confiável, instante e justificativa quando aplicável.
Indique campos obrigatórios propostos, referências, versões e estados, sem implementar schema.
Mapeie SocialSignalV1, ResolvedEntityV1, SocialContextV1, SocialOpportunityV1 e SocialDecisionReceiptV1 antes de criar nomes.
Não force material bruto a passar pelo RadarSignalResultV1. Esse contrato atende ao encaminhamento experimental; eventual adaptação deve ser explícita e preservar versões e snapshots.

5. Mostre o caminho de análise:
- quem recebe e valida o material;
- como entidade e acesso são resolvidos;
- qual runtime/provider routing existente poderia executar a análise;
- como validar saída e referências;
- como tratar evidência insuficiente e falhas;
- como apresentar e persistir a decisão.
Modelo sem ferramentas de ação não significa ausência de custo ou transmissão externa. Liste as autorizações futuras necessárias para fontes, conteúdo, provedor e consumo, sem executá-las.
Não aplique automaticamente a confirmação prévia de D6 à análise do Radar. Também não presuma dispensa dos controles reais do Core.

6. Mapeie reutilizar/estender/criar com caminho, símbolo, evidência e limite:
identidade, execução, autorização, persistência e receipt.
D6 contém a interface e o bloqueio na ausência do resolvedor; não contém um resolvedor real de sujeito.
Fingerprint de SignalForward não comprova autenticidade de fonte.
Avalie armazenamento operacional separadamente de evidência técnica/exportação. Não escolha ops/evidence/latest/ como fonte de verdade apenas por existir.
Governança permanece dentro do piloto. MONITOR, FOLLOW_ENTITY, RESEARCH e ROUTE_TO_VERTICAL são recomendações; não executam ações automaticamente.
Não presuma nome canônico MKT-CORE, hash próprio do Radar ou registro operacional.

7. Apresente um caso fictício completo: empresa conhecida anuncia expansão.
Mostre entrada, análise, referências, incertezas, recomendação e decisão registrada.
Inclua também resultados esperados para entidade ambígua, evidência insuficiente, fonte não autorizada e NO_ACTION.
Não simule pesquisa real como se tivesse ocorrido.

8. Entregue uma proposta única de primeira jornada implementável:
entrada → análise → recomendação → decisão registrada.
Liste componentes/arquivos afetados, dependências reais e critérios de aceite. Não crie seis subsistemas apenas porque existem seis objetos conceituais.
Meça utilidade e tempo de trabalho separadamente de score; score não comprova ROI.
Diferencie capacidade existente, evidência relatada, proposta e pendência.

9. Entrega:
- resumo executivo;
- alinhamento ao guia de construção;
- três contratos mapeados;
- caminho técnico com evidências;
- caso ilustrativo;
- primeira unidade e critérios de aceite;
- decisões humanas necessárias;
- bloco de evolução para incorporar ao Plano de construção do Radar: data, mudança, motivo, evidência, status e próximo passo.
Não apague histórico nem marque proposta como aprovada.
Não altere o plano local sem ter sua versão atual e autorização documental explícita; nesta rodada devolva o bloco de atualização na resposta.

10. Restrições:
Nenhum código, schema, migration, teste executado, instalação, banco, .env, credencial, coleta externa, LLM, fila, provisionamento ou importação.
Nenhum Neon, commit, push, PR, merge ou deploy.
Nenhuma alteração de outras frentes ou do SignalForward.
Conclua com git status --short, branch, HEAD e confirmação de preservação dos arquivos.
Pare após a proposta; não inicie implementação.
```


## Atualização 1.3 — revisão da primeira jornada assistida (14/09/2026)
Fonte lida integralmente: Markdown(20260914-122345).md colado. Avaliação documental, sem verificação independente do código nesta rodada. O executor declarou não ter recebido o plano 1.2 completo; esta atualização não afirma sincronização com a cópia dele.

### Avanços aproveitáveis — propostas, não implementação
- Jornada: material fornecido, empresa conhecida selecionada, análise governada, recomendação fundamentada e decisão registrada; sem executar a ação escolhida e sem Run MKT.
- PostgreSQL operacional, storage existente candidato para arquivos e exportações derivadas.
- Cadastro mínimo de entidades e registros de material, análise por revisão e decisão; não adaptar silenciosamente ImobLead ou HumanConfirmation.
- Run de análise separado do eventual Run MKT. Infraestrutura de execução do Core é candidata a reutilização, condicionada à demonstração dos controles aplicáveis.

### Correções necessárias antes do pacote de implementação
1. Identidade: não exigir um segundo agente apenas porque D5 usa a string radar. D5 não provisionou um produtor distinto. Mapear o manifesto/registro real antes de propor identidade ou adapter; nomes continuam não aprovados.
2. Execução: existência de publishRun e call sites não comprova produção ativa nem autorização para este piloto. Worker, política, revogação, consumo, timeout, retry e validação de saída precisam de evidência específica. DLQ/redrive não comprovam teto de consumo, prevenção de chamadas duplicadas ou D4. A fila continua sem autorização nesta rodada.
3. Autorização: escopo tenant/workspace e entidade ativa são uma política proposta, não comprovação de autorização individual existente. Precisar membership, vínculo do workspace, acesso a material e entidade em consulta, análise, decisão e recuperação. Upload autenticado não autoriza automaticamente transmissão ao provedor. Não declarar que D6 fornece um resolvedor real.
4. Persistência e concorrência: há quatro conceitos de registro, incluindo RadarKnownEntity. Mapear a escrita autoritativa entre Run e análise e a recuperação de falha parcial. Idempotência da análise não está definida pelo operationKey da decisão. Na decisão, mesma chave e conteúdo diferente deve conflitar; replay deve revalidar acesso. Distinguir replay de decisão concluída da tentativa nova contra revisão obsoleta. Correções por sucessão precisam de referência vigente/guarda para evitar duas sucessoras concorrentes.
5. Contratos: separar recebimento no servidor da captura/publicação na fonte; referências/trechos verificáveis no material não são substituídos pelo rótulo FACT. Justificativa obrigatória em divergência é proposta de produto, não aprovação já concedida. Função pura do IMOB é candidata a reutilização, não obrigação de extração transversal.

### Próximo passo delimitado
Corrigir somente essas fronteiras na especificação e entregar uma matriz de controle: existente com evidência, extensão necessária, novo e pendente de autorização. Não repetir varredura geral nem iniciar schema, agente ou fila. Responsáveis e autorizações operacionais não impedem fechar o desenho. Depois, apresentar a primeira unidade local com arquivos, dependências e testes para aprovação.
D5/D6, fingerprint e seus estados locais permanecem preservados. Nenhum código, commit, chamada ao modelo, fila ou publicação foi autorizado por esta atualização.


## Atualização 1.4 — delimitação da primeira unidade local (14/09/2026)
Fonte lida integralmente: Markdown(20260914-123959).md colado. Avaliação do relatório, não auditoria independente do código. O executor ainda declarou não ter recebido o plano completo 1.3; sincronização documental não comprovada.

### Avanços
Retirada a exigência de outro nome de agente. Pipeline reconhecido como infraestrutura candidata, com lacunas de revalidação e duplicação. Recuperação de decisão concluída separada da nova decisão sobre revisão antiga. Evidências passam a exigir referência ao material. Nada disso autoriza execução.

### Limites remanescentes e correções focalizadas
- A consulta ao registro estático comprova ausência nesse registro, não ausência em todo cadastro dinâmico/ambiente. Não cadastrar agente nem reabrir a regra D5 nesta unidade.
- A matriz ainda chama checkScopePermission/TenantActionPolicy de membership: permissão de ação não comprova usuário/membership/vínculo workspace-tenant. O acesso individual à entidade e ao material precisa de contrato e caminho concreto; fixture não é resolvedor operacional.
- Revalidação só antes de persistir o parecer seria tardia para impedir transmissão/custo do modelo. Registrar controle antes da chamada como dependência operacional; D4 de SignalForward permanece intacta e a proposta não aprova tolerar lacuna no Radar.
- Persistir no máximo uma análise por runId não impede duplicação de chamada paga nem revisões concorrentes por novos runIds para a mesma solicitação. Resposta já duravelmente salva pode ser revalidada para persistência sem nova chamada; resultado ambíguo precisa de estado explícito e política, sem retry pago presumido.
- As escritas condicionadas precisam identificar unicidade/linha comum e condição atômica. Leitura de ausência seguida de insert não demonstra exclusão mútua. Decisão contra revisão vigente requer coordenação com criação de revisão nova, além de travar a revisão antiga.
- O relatório ainda diz três registros antes de enumerar quatro. A analogia com D6 não prova Run.response como cópia: D6 definiu snapshot de confirmação e Run.request; autoridade do parecer é novo contrato do Radar.
- "Registrar material e disparar solicitação" não está suportado pelos arquivos previstos (tipos e validador) nem por entidade/material apenas: falta definir serviço de persistência, autorização e registro durável da solicitação.

### Próxima unidade recomendada — proposta para aprovação futura
Cadastro mínimo de entidade e recebimento autorizado de material, com serviços de persistência, isolamento, versão do material e testes locais descartáveis; sem criar Run, solicitação de análise ou fila nesta unidade. Se autorização real ainda não estiver disponível, exercício exclusivo em testes controlados, bloqueio por padrão e nenhum cliente real. Nome/provisionamento do agente não bloqueia esse desenho local.
Solicitar apenas pacote concreto dessa unidade: modelos/relações/constraints, operações e autorização, arquivos e testes. Não repetir auditoria geral ou iniciar implementação. Solicitação de análise, recuperação de falhas e chamadas pagas ficam numa unidade posterior explícita, antes de operar.

### Evidência e continuidade
O relatório não forneceu git status literal: "24 linhas idênticas" é resumo. Pedir saída literal no próximo pacote, sem nova auditoria por isso. Entregar ao executor este arquivo completo; a presença dele nesta conversa não comprova disponibilidade na sessão externa.
D5/D6, fingerprint, worktree e commits permanecem preservados conforme relatado. Nenhuma implementação, instalação, banco, fila, LLM, provisionamento, commit ou publicação autorizada por esta atualização.


## Atualização 1.5 — revisão do pacote entidade + texto (14/09/2026)
Fonte: Markdown(20260914-125339).md colado, lido integralmente. Avaliação documental, sem auditoria independente do repositório. Executor confirmou recebimento e leitura integral do plano 1.4 e apresentou git status literal; a limitação anterior de acesso ao plano foi resolvida conforme relatado.

### Recorte aproveitável, ainda sem autorização de implementação
Dois modelos candidatos: RadarKnownEntity e RadarMaterial; serviços de cadastro, recebimento e consulta; apenas texto manual, sem arquivo, análise, Run ou fila. Resolvedor real ausente implica testes controlados e bloqueio por padrão. D5/D6 preservados.

### Ajustes finais a incorporar ao pacote, sem varredura geral
1. Idempotência: comparar apenas hash do texto ignora fonteDeclarada, capturadoEm e eventual supersedesMaterialId. Definir identidade completa da requisição e tratamento de mudança de entityId (hoje parte da chave), autoria e reenvio por outra pessoa; não reutilizar o fingerprint SignalForward. Campos gerados no servidor não entram como novo conteúdo a cada replay. Incluir teste de mesmo texto com metadados diferentes.
2. Autorização: interface exige entityId mas criação ainda não tem entidade; lista precisa filtrar acesso individual antes de retornar itens/contagem/paginação. Definir autorização da coleção para criar/listar e revalidação por entidade/material quando pertinente. A tabela de operações não pode usar apenas scope nesses caminhos. Derivar todo acesso ao material de acesso à entidade é política proposta a ratificar, não capacidade pré-existente. Neste recebimento único, providedByUserId e associatedByUserId vêm da mesma identidade; divergência exige fluxo explícito, não input livre.
3. Persistência: incluir operationKey e supersedesMaterialId na tabela de campos e a chave única referenciável (id, tenantId, workspaceId) da entidade para a FK composta. Explicitar vínculo de escopo da correção, regras contra cadeias inválidas e protocolo se houver unicidade de sucessora. Arquivos existentes a alterar incluem schema.prisma e cliente gerado; preservar o diff prévio de D6 nesses arquivos compartilhados.
4. Operações concorrentes: desativação/correção precisam seguir o mesmo protocolo de trava da entidade. Recuperar material existente com entidade inativa deve ser distinguido de inserir novo, se histórico acessível for aprovado. Definir controle de versão para alterações concorrentes no cadastro. Após conflito de unicidade, recuperação deve ocorrer em transação válida, sem reutilizar transação abortada.
5. Validação: completar limites propostos de texto/nome/fonte/chave, regras de externalRef (esquema, normalização ou comparação literal e ausência), datas e campos desconhecidos. Sem inventar regras no implementador. Imutabilidade deve indicar todos os campos protegidos e mecanismo; não apenas conteudo/hash quando outros metadados também compõem o registro recebido.

### Próximo passo
Solicitar um único adendo com contratos completos, matriz de autorização por operação, constraints/campos, protocolo de reenvio/correção e arquivos exatos, usando o recorte atual. Ratificar as políticas novas separadamente (texto apenas, histórico após desativação, acesso ao material herdado da entidade, externalRef). Não pedir nova auditoria geral. Depois apresentar autorização local delimitada, sem ativação operacional. Nenhum código ou schema autorizado nesta revisão.


## Atualização 1.6 — adendo de autorização, reenvio e correção (14/09/2026)
Fonte: Markdown(20260914-130511).md colado, lido integralmente. Avaliação documental; nenhuma consulta independente ao repositório. Executor confirmou leitura do plano 1.5. Sem implementação autorizada.

### Avanços preservados
Comparação do reenvio inclui conteúdo, entidade, fonte, captura, predecessor e identidade autenticada do fornecedor; chave escopada por tenant/workspace. Campos operationKey e supersedesMaterialId, revisão de entidade e arquivos compartilhados previstos explicitados. Recuperação após violação de unicidade ocorre em transação válida. Histórico de entidade inativa separado de novo recebimento. Herança de acesso e sucessora única continuam propostas.

### Precisões técnicas ainda necessárias antes do código
- D5 tem teto agregado de 16.384 bytes; o adendo propõe 16.384 caracteres para texto. São limites diferentes. Definir code points versus unidades UTF-16 versus bytes e justificativa própria. Separar comparação, persistência e hash: trim só na comparação pode fazer conteúdos armazenados/hashes distintos serem tratados como replay igual. Recomenda-se preservar texto recebido e compará-lo exatamente; qualquer canonicalização alternativa deve ser explícita, anterior às três operações e aprovada. Ausência/null, strings vazias e armazenamento de capturadoEm como dia ou timestamp precisam ficar unívocos.
- Correção de material deve seguir ordem única entidade → predecessor, verificar status/escopo/acesso sob o protocolo e coordenar com desativação; não iniciar pelo predecessor se depois precisar da entidade. Explicitar chave composta referenciável no material para FK do predecessor no mesmo tenant/workspace/entidade. Recuperação idempotente deve anteceder recusas próprias de nova escrita (entidade inativa ou predecessor já superado), após autorização vigente.
- Matriz deve declarar verificações comuns (identidade, usuário/membership, workspace-tenant e scope) para todas as operações; traço na coluna não pode dispensá-las. Distinguir item access_denied (filtrável) de resolver ausente/falho (falha da operação, não lista vazia bem-sucedida). Herança de acesso deve abranger qualquer conteúdo retornado por recuperação também.

### Políticas para aprovação conjunta futura
Texto manual apenas; acesso de leitura à entidade pode conceder leitura de seus materiais e histórico, incluindo material de terceiros (se ratificado, recorte sem ACL própria por material); permissão de gestão/escrita continua distinta. Uma sucessora por correção, preservando cadeia e histórico. Entidade inativa recusa novo recebimento, mas histórico e replay permanecem disponíveis mediante acesso vigente. Limites de campos a aprovar somente após precisão de unidade/normalização. Nenhuma dessas políticas foi aprovada pela atualização do plano.

### Continuidade delimitada
Solicitar apenas ajuste das três precisões acima e uma tabela única das políticas/limites a ratificar; não reformular o pacote nem abrir outra investigação geral. A seguir, aprovação local expressa sobre arquivos, schema/migration e testes descartáveis. D5/D6 preservados; fila, modelo, clientes reais, agente, commit e publicação continuam fora.


## Atualização 1.7 — políticas prontas para decisão, contrato de campos ainda a completar (14/09/2026)
Fonte: Markdown(20260914-131659).md colado, lido integralmente. Avaliação documental, sem auditoria independente do código. Plano 1.6 lido pelo executor conforme relatório. Nenhuma aprovação de produto ou implementação inferida.

### Precisões resolvidas no desenho
Preservação/comparação/hash do texto sem trim; limite de conteúdo proposto de 16.384 bytes UTF-8, independente de D5. Ordem de travas entidade → predecessor. Recuperação idempotente autorizada antes das guardas exclusivas de nova escrita. Verificações comuns de identidade/membership/workspace/permissão e distinção entre acesso negado por item e falha de resolvedor na listagem.

### Recomendação de decisão, sem nova investigação geral
O recorte texto manual, herança explícita de leitura, separação de gestão/escrita, cadeia de sucessora única e recuperação histórica autorizada pode ser submetido ao usuário. Herança significa leitura dos materiais de terceiros vinculados à mesma entidade, sem ACL mais restritiva por material nesta unidade. Bloqueio na ausência do resolvedor já é restrição estabelecida, não política a reabrir. Não iniciar código ainda.

### Ajustes de contrato para consolidação
- Tabela ainda não fecha máximos de fonteDeclarada/operationKey, displayName/externalRef e formato de externalRef. Apresentar valores exatos, unidade e regra de comparação em tabela única; não inferir de versões anteriores contraditórias.
- Preservar espaços não obriga aceitar texto composto só de espaços. Recomenda-se rejeitar conteúdo/fonte/nome/chave sem informação sem transformar o valor armazenado; proposta de validação, sujeita a aprovação. Distinguir capturadoEm ausente ou null de string vazia (recomendação: rejeitar vazia).
- Precisão de persistência: @@unique sobre coluna opcional não declara por si um índice parcial; unicidade com NULLs distintos já permite múltiplas ausências. Corrigir nomenclatura, sem alterar garantia de sucessora única.
- Definir domínio de strings persistíveis/hash (UTF-8 válido, rejeição de NUL e surrogate isolado quando pertinente) no contrato de implementação; igualdade de string JavaScript não é universalmente bijetiva com codificação UTF-8. Não normalizar conteúdo aceito.
- Corrigir frase "nenhuma destas aprovada" para preservar a restrição fail-closed já estabelecida. Corrigir "nenhum bloqueio restante" distinguindo aprovação das políticas de especificação incompleta de externalRef/limites.

### Próximo marco
Ratificação explícita das políticas de negócio pode ocorrer agora. Consolidar apenas a tabela de campos e as precisões acima para apresentar autorização local delimitada. Sem nova auditoria do Core ou reformulação geral. D5/D6 preservados; arquivo, análise, Run, modelo, fila, agente, clientes reais, commit e publicação continuam fora desta unidade.


## Atualização 1.8 — consolidação dos campos e regressão pontual de idempotência (14/09/2026)
Fonte: Markdown(20260914-132634).md colado, lido integralmente. Avaliação documental, sem auditoria de código. Executor confirmou leitura do plano 1.7. Políticas e implementação continuam não aprovadas.

### Consolidação aproveitável
Limites propostos em bytes UTF-8: displayName 1–200; externalRef opcional 1–64; conteudo 1–16.384; fonteDeclarada 1–500; operationKey 1–128. Texto válido preservado exatamente, rejeitando NUL, surrogate isolado e campos obrigatórios só de espaços. capturadoEm como DATE/calendário real, ausência/null equivalentes, vazia rejeitada. externalRef opaco literal e case-sensitive, único por tenant/workspace quando presente; não valida CNPJ nem resolve identidade real. Unicidade opcional do predecessor corretamente descrita como UNIQUE padrão.

### Correção material da tabela
supersedesMaterialId voltou a constar como N/A na comparação de reenvio, contradizendo a identidade completa da solicitação aprovada como direção nos adendos anteriores. Deve participar da comparação, inclusive ausência versus predecessor específico. Sua obtenção pelo servidor não elimina seu significado: mesma chave com alvo de correção diferente é conflito, não recuperação. Recuperação autorizada deve preceder guardas próprias de nova escrita. Exigir teste de mesma chave com predecessor diferente e criação versus correção.

### Precisões de implementação, sem nova pesquisa ou reformulação
Requisito é rejeitar string malformada antes de converter para UTF-8; não exigir API de codificador fatal inexistente no runtime. Validação explícita de surrogate seguida da codificação padrão satisfaz a regra quando a entrada já foi validada. externalRef deve compartilhar as rejeições de NUL/surrogate dos campos persistidos; esclarecer se só espaços é inválido. expectedRevision da operação de alteração é precondição fornecida pelo chamador, distinta de revision persistida e incrementada pelo servidor; proibir escrita arbitrária de revision não remove esse input. entityId ativa é guarda de nova escrita, não de replay histórico.

### Próximo passo recomendado
As políticas e limites podem ser submetidos à ratificação expressa agora. Recomendar aprovação do recorte com correção obrigatória da célula de idempotência e precisões acima na consolidação documental; essa aprovação não autoriza código. Não abrir outra varredura geral. Após registro e apresentação do pacote corrigido, autorização local delimitada poderá abranger modelos, migration e testes descartáveis, preservando D5/D6 e o diff compartilhado de schema. Fila, LLM, agente, clientes reais e publicação continuam fora.


## Atualização 1.9 — ratificação de políticas/limites e correção da comparação idempotente (14/09/2026)

Fonte: mensagem de aprovação explícita da usuária nesta conversa, materializando pela primeira
vez este plano como arquivo versionado em `docs/architecture/radar-social-construction-plan-v1.md`
(worktree `/home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch
`experiment/signalforward-origin-fingerprint-fix`, HEAD `4d91b6c24794849c574da4e57d21aab41779141e`).
Esta atualização registra decisão, não implementação — nenhum código, schema, migration ou
teste foi criado ou alterado por ela.

### Políticas ratificadas

- Somente texto manual nesta primeira unidade.
- Leitura da entidade concede leitura de seus materiais e histórico, inclusive fornecidos por
  outras pessoas autorizadas.
- Escrita e gestão exigem permissões separadas da leitura.
- Correções preservam o material original e admitem uma única sucessora.
- Entidade inativa bloqueia novos materiais, mas permite consulta e recuperação histórica
  mediante autorização vigente.

### Limites ratificados (bytes UTF-8)

| Campo | Limite |
|---|---|
| `displayName` | 1–200 |
| `externalRef` (quando preenchido) | 1–64 |
| `conteudo` | 1–16.384 |
| `fonteDeclarada` | 1–500 |
| `operationKey` | 1–128 |

### Regras ratificadas

- Preservação exata do texto válido recebido, sem trim, normalização Unicode ou alteração de
  quebra de linha.
- Rejeição de campos preenchidos só com espaços, byte NUL (`0x00`) e surrogate isolado —
  incluindo `externalRef` quando fornecido (regra estendida nesta atualização, ver abaixo).
- `externalRef` opaco, sem validação de esquema específico (não valida CNPJ nem qualquer outro
  identificador de negócio), comparado literalmente, case-sensitive, único por
  `(tenantId, workspaceId)` quando presente; `NULL` não participa da unicidade.
- `capturadoEm` como `DATE` real (`YYYY-MM-DD`, calendário válido), ausência e `null`
  equivalentes, string vazia rejeitada.

O bloqueio por ausência de resolvedor real de autorização do sujeito **permanece obrigatório,
não reaberto**. Esta ratificação **não autoriza implementação** — cobre só o desenho.

### Correção material — `supersedesMaterialId` na comparação idempotente

Rodadas anteriores desta consolidação chegaram a listar `supersedesMaterialId` como "N/A" na
comparação de reenvio — incoerente com a própria regra, já estabelecida, de que a identidade
completa da solicitação (não só o hash do texto) decide recuperação vs. conflito. Corrigido:

**Identidade completa da solicitação** (comparada sob a mesma `operationKey`):
`{entityId, conteudo, fonteDeclarada, capturadoEm, supersedesMaterialId, providedByUserId}`.

`supersedesMaterialId` participa como qualquer outro campo comparado — inclusive seu valor
`null` (ausência = criação nova, sem predecessor) é um valor comparável como outro qualquer,
não um caso especial ignorado.

| Situação | `supersedesMaterialId` na 1ª tentativa | `supersedesMaterialId` no reenvio | Resultado |
|---|---|---|---|
| Reenvio idêntico de uma criação nova | `null` | `null` | Recuperação idempotente |
| Reenvio idêntico de uma correção | `M1` | `M1` | Recuperação idempotente |
| Mesma chave, uma tentativa como criação e outra como correção do mesmo material | `null` | `M1` (ou vice-versa) | **Conflito** — nunca recupera silenciosamente |
| Mesma chave, correções visando predecessores diferentes | `M1` | `M2` | **Conflito** |

Nenhuma dessas situações é resolvida por "obter `supersedesMaterialId` no servidor" — ele é
fornecido pelo chamador (indicando qual material está sendo corrigido, se algum), não gerado;
sua presença/ausência tem significado próprio que a comparação precisa respeitar.

**Ordem preservada**: recuperação idempotente (comparação da identidade completa da
solicitação, incluindo `supersedesMaterialId`) continua avaliada **antes** das guardas
exclusivas de nova escrita (entidade ativa, predecessor ainda sem sucessor) — mesmo princípio
já estabelecido, agora com a comparação corrigida para incluir este campo.

### Precisões de implementação

- **Rejeição de string malformada antes da codificação, sem exigir API de "codificador
  fatal"**: a validação de surrogate isolado é um passo explícito, separado, feito **sobre a
  string ainda não codificada** (varredura de unidades UTF-16 em busca de surrogate sem par).
  Só depois dessa validação passar é que a conversão para bytes UTF-8 ocorre, usando o
  codificador padrão do runtime — nenhuma API especial de "modo fatal" é exigida nem
  pressuposta, porque a entrada já chega validada nesse ponto.
- `externalRef`, quando fornecido, segue as mesmas rejeições de NUL/surrogate isolado dos
  campos persistidos. Se fornecido e composto só de espaços, é rejeitado como inválido — a
  mesma regra de "obrigatório-quando-presente" que já vale para os demais campos de texto.
- **`expectedRevision` vs. `revision`**: `revision` é o campo persistido em `RadarKnownEntity`,
  sempre gerenciado e incrementado pelo servidor — nunca aceito do corpo. `expectedRevision`
  é um **parâmetro de entrada da operação** "Alterar entidade" (não um campo do registro),
  fornecido pelo chamador para a escrita condicionada (`WHERE revision = $expectedRevision`).
  Proibir escrita arbitrária do campo `revision` não elimina nem substitui esse parâmetro de
  chamada — são dois conceitos distintos que a especificação anterior não nomeava separadamente.
- `entityId` ativa (`status='active'`) é guarda de **nova escrita**, não de replay histórico —
  reafirmado, consistente com a ordem já estabelecida acima.

### Testes de aceite adicionais

| Teste | Cobre |
|---|---|
| Mesma `operationKey`, `supersedesMaterialId` idêntico (ambos `null` ou ambos apontando ao mesmo predecessor), demais campos iguais | Recuperação idempotente |
| Mesma `operationKey`, uma tentativa com `supersedesMaterialId=null` (criação) e outra com valor preenchido (correção) | Conflito — criação vs. correção nunca se confundem |
| Mesma `operationKey`, `supersedesMaterialId` apontando a predecessores diferentes | Conflito |
| Validação de surrogate isolado rejeita a string antes de qualquer tentativa de codificação | Precisão de implementação — sem exigir API "fatal" |
| `externalRef` fornecido só com espaços rejeitado | Extensão da regra de campos obrigatórios-quando-presentes |
| Alteração de entidade usando `expectedRevision` desatualizado é rejeitada, sem afetar o campo `revision` de outra tentativa concorrente | Distinção `expectedRevision`/`revision` |

### Pacote local proposto (arquivos, modelos, migration futura, dependências, testes)

Arquivos novos: `apps/api/src/services/radarSocial/radarKnownEntityContract.ts`,
`apps/api/src/services/radarSocial/radarMaterialContract.ts`,
`apps/api/src/services/radarSocial/radarEntityAccessResolver.ts` (só a interface),
`apps/api/src/services/radarSocial/radarKnownEntityService.ts`,
`apps/api/src/services/radarSocial/radarMaterialService.ts`,
`apps/api/src/services/radarSocial/__tests__/*.test.ts`.

Arquivos existentes a alterar (implementação futura, não nesta rodada): `packages/db/prisma/schema.prisma`
e o cliente gerado (`packages/db/src/generated/client/schema.prisma`,
`packages/db/src/generated/client/package.json`), preservando o diff local já existente de D6
nesses mesmos arquivos.

Migration futura: diretório ainda inexistente; caminho previsto (timestamp a gerar, não
inventado como já criado): `packages/db/prisma/migrations/<timestamp-a-gerar>_add_radar_known_entity_and_material/migration.sql`.

Dependência de autorização: `RadarEntityAccessResolver` real ausente — exercício exclusivo em
testes controlados, bloqueio por padrão, nenhum cliente real, enquanto não houver resolvedor
real.

Testes descartáveis previstos: os já listados nas consolidações anteriores desta seção
(operação autorizada, acesso negado, resolvedor ausente/falho, isolamento entre
tenants/workspaces, referência de entidade inválida, autoria derivada do servidor, preservação
do conteúdo recebido, reenvio idempotente, mesma chave com conteúdo diferente, concorrência sem
duplicação, recuperação após perda de resposta, revogação de acesso antes da recuperação), mais
os desta atualização (tabela acima) — todos contra PostgreSQL local descartável, dados
sintéticos.

**Nenhum destes arquivos foi criado nesta rodada — só este documento.**

### Próximo passo

Autorização local explícita e delimitada sobre este pacote (modelos, migration, testes
descartáveis) — dependente de decisão humana separada desta ratificação. D5/D6, fingerprint e
seus estados locais permanecem preservados, intocados por esta atualização.

## Atualização 1.10 — primeira unidade implementada e evidenciada localmente (16/09/2026)

Fonte: execução real nesta sessão, no worktree `EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch
`experiment/signalforward-origin-fingerprint-fix`, HEAD ainda `4d91b6c24794849c574da4e57d21aab41779141e`
(nenhum commit foi criado). Autorização recebida: implementação local do pacote descrito na
Atualização 1.9 (entidade conhecida + recebimento autorizado de material em texto), sem
resolvedor de produção, sem rotas HTTP, sem análise/Run/fila/LLM, sem commit/push/staging.

### Ressalva de comparação documental (herdada da consulta anterior, ainda válida)

A versão 1.8 do plano, especificamente o arquivo nomeado com sufixo "(5)", não pôde ser lida
neste ambiente: o atalho do Windows encontrado aponta para `D:\radar_plane\...`, um drive não
montado neste WSL. Isso não demonstra que o arquivo não existe — só que este ambiente não tem
acesso a ele. Uma cópia sem sufixo numérico, versão 1.0, foi lida por engano numa consulta
anterior e corretamente identificada como não equivalente à 1.8; ela não substitui a comparação
pendente. A comparação integral 1.8 × 1.9 permanece não realizada. Como já registrado, o "N/A"
de `supersedesMaterialId` pertencia a uma tabela de rodada intermediária anterior à ratificação
final — a própria Atualização 1.9 já continha a correção; esta ressalva não reabre essa política.

### Implementação efetiva

Arquivos novos, todos em `apps/api/src/services/radarSocial/`:
`radarKnownEntityContract.ts`, `radarMaterialContract.ts`, `radarEntityAccessResolver.ts`,
`radarKnownEntityService.ts`, `radarMaterialService.ts`, `__tests__/helpers.ts`,
`__tests__/A-contract-validation.test.ts`, `__tests__/B-known-entity-lifecycle.test.ts`,
`__tests__/C-material-receive-idempotency.test.ts`.

Modelos `RadarKnownEntity` e `RadarMaterial` adicionados a `packages/db/prisma/schema.prisma`
(aditivo, preservando integralmente o diff local já existente de D6 no mesmo arquivo) e
propagados ao cliente Prisma gerado (`packages/db/src/generated/client/schema.prisma`,
`package.json`, e `packages/db/dist/generated/client/*` — este último via
`node packages/db/scripts/copy-publish-artifacts.mjs`, o mesmo passo que o script `postbuild`
do pacote já executa, sem rodar `tsup`/`build:dts` nem instalar dependências). Migration nova,
estritamente aditiva (só `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`):
`packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/`.

Resolvedor de produção **não** foi implementado — `RadarEntityAccessResolver` continua só
interface (`radarEntityAccessResolver.ts`); toda operação que dependa de acesso individual a uma
entidade exige esse parâmetro sem valor padrão, e os únicos resolvedores concretos existentes
(`alwaysAuthorizedResolver`, `fixedOutcomeResolver`, `denyListResolver`, `recordingResolver`)
vivem exclusivamente em `__tests__/helpers.ts`.

### Evidência real desta rodada (não histórica)

- Suíte nova: 63/63 testes passando (`node --test`/`tsx`, PostgreSQL local descartável dedicado,
  container `radar-social-unit-pg`, dados sintéticos — removido ao final desta rodada).
- Suíte de SignalForward (D5/D6): 129/129 testes passando, reexecutados nesta sessão contra o
  schema já com os modelos do Radar — nenhuma regressão.
- Typecheck diferencial: `tsc --noEmit -p apps/api/tsconfig.json`, mesmo comando antes/depois,
  baseline = estado local imediatamente anterior (D5/D6 presentes, diretório `radarSocial/`
  movido para fora temporariamente, sem alterar schema/cliente). Resultado: 431 erros
  preexistentes idênticos nos dois lados; 0 novos; 0 resolvidos por esta unidade.

### Limitações e decisões desta unidade, para ratificação ou correção futura

- Escopos `radar_social.read`, `radar_social.entities.manage` e `radar_social.materials.write`
  são nomes **provisórios** desta unidade (mesmo padrão de aviso já usado por `runs.execute` em
  SignalForward) — não integrados a nenhuma matriz de escopos ratificada, e a separação em três
  (em vez de dois) é decisão desta unidade, não uma política já aprovada anteriormente.
- Listagem de entidades filtra por item via o resolvedor DEPOIS da consulta paginada por cursor
  — sob alta taxa de negação, uma página pode devolver menos itens que o limite pedido mesmo
  havendo mais linhas além do cursor. Aceito nesta unidade, documentado no código.
- `providedByUserId`/"associatedByUserId" permanecem representados por uma única coluna
  (`provided_by_user_id`); nenhuma coluna nova foi criada para uma eventual segunda identidade,
  como já orientado pela Atualização 1.9.
- `TenantActionPolicy` (escopo) é concedido por `(tenantId, workspaceId)`, não por usuário — a
  distinção "usuário com permissão de leitura mas não de gestão" não é representável hoje só com
  esse mecanismo; ficou evidenciado durante os testes desta unidade (não é uma lacuna nova
  introduzida por ela).
- Nenhuma rota HTTP, cliente real ou dado real foi criado ou tocado.

### Próximo passo

Decisão humana separada para: (a) decidir sobre versionar (adicionar ao git) este pacote e o
plano; (b) autorizar a próxima unidade da jornada (entrada → análise → recomendação → decisão),
condicionada à existência de um resolvedor real de acesso ao sujeito/entidade — ainda ausente.

## Atualização 1.11 — correções de classificação e desenho completo de análise/recomendação (16/09/2026)

Fonte: leitura focalizada de código nesta sessão (worktree `EIAH_SIGNALFORWARD_ORIGIN_FIX`,
branch `experiment/signalforward-origin-fingerprint-fix`, HEAD ainda `4d91b6c24794849c574da4e57d21aab41779141e`,
nenhum commit criado). Esta atualização registra **correções de relatório anterior** e uma
**proposta de desenho** — nenhuma implementação, nenhuma política nova ratificada.

### A. Correções ao relatório de reaproveitamento anterior

**A.1 — Caminho de execução, condições precisas (releitura de código, não nova auditoria)**

- `isAgentAvailableInWorkspace` (`apps/api/src/services/agents.ts:1328-1367`) é calculado em
  `getAgentProfile` (`agents.ts:1373-1381`) mas usado **só** para compor `participation`/
  `chatRuntime` — confirmado por leitura direta. A única checagem que bloqueia
  `processRunPayload` é `!profile` (`runWorker.ts:1100-1128`), que é `false` sempre que existir
  **qualquer** `AgentProfile` (dinâmico) OU perfil estático (`coreSeedAsRecord`) para o nome do
  agente — **independente da política de workspace**. Isso vale para **qualquer** agente, não é
  uma condição estreita de um caso específico.
- `resolveActionsForExecution` (`runWorker.ts:569-611`) libera o catálogo inteiro de ações
  registradas exatamente quando `dbAllowedCanonical.length === 0 && dbAllowedRaw.length === 0 &&
  configuredCount === 0` (`runWorker.ts:609`) — ou seja, quando não há **nenhuma**
  `TenantActionPolicy` (nem por workspace, nem `workspaceId: null`) e nenhum resolvedor
  customizado configurado para o tenant. Condição verificável e específica, não uma suposição.

**Classificação corrigida**: esta cadeia é **candidata a reaproveitamento, condicionada às
garantias necessárias** — não "governada e pronta", nem "inutilizável". As lacunas acima só
importam para o fluxo do Radar nos pontos em que ele dependeria delas; ver 3.B abaixo para onde
cada garantia deve ser aplicada.

**Autorizações distintas, nenhuma substitui a outra**:
| Autorização | O que decide | Onde deveria ser aplicada no desenho do Radar |
|---|---|---|
| Executar o agente | Se este workspace pode rodar o agente "radar" | `assertWorkspaceAgentEnabled` (existente, bloqueante) — chamado pelo **serviço novo do Radar**, antes de publicar qualquer Run, não uma mudança no Core |
| Acesso ao material | Se o solicitante pode ler o material/entidade | `RadarEntityAccessResolver` (existente como interface) — revalidado a cada tentativa |
| Ferramentas do agente | Quais ações o agente pode invocar durante a execução | `TenantActionPolicy` explícita — só relevante se o perfil do agente "radar" declarar `tools` (proposta: começar com `tools: []`, tornando o fail-open irrelevante nesta unidade) |
| Envio de conteúdo ao provedor | Se este conteúdo pode ser enviado a este provedor | Nova, ainda sem componente — `assertKnowledgePolicy` (`llmExecutor.ts`) cobre parte, mas política de fontes/conteúdo permitido é pendência de produto, não técnica |
| Consumo | Se este tenant pode pagar/consumir esta chamada | Nova, sem componente identificado nesta consulta — não presumo que `chargeRun` (citado no documento de origem/autorização) resolva isso sem verificação própria |

`knowledgePolicy`, sanitização de PII e a existência do pipeline (`llmExecutor.ts`/
`completionEngine.ts`) **não substituem** nenhuma das cinco linhas acima — são controles de
conteúdo/formatação, não de autorização. Nenhuma correção ao Core é proposta nesta rodada.

**A.2 — Natureza da afirmação vs. confiança, corrigido**

FACT/INFERENCE/HYPOTHESIS/UNKNOWN e confiança (numérica ou low/medium/high) são **dimensões
independentes**, equivocadamente equiparadas no relatório anterior. Proposta de desenho (3.C):
cada afirmação da recomendação carrega uma **natureza** (`FACT_IN_MATERIAL` — presente
expressamente no material, não fato verificado no mundo real — `INFERENCE`, `HYPOTHESIS` ou
`UNKNOWN`) **e**, separadamente, um **confidenceLevel** (`low|medium|high`) quando fizer sentido
atribuí-lo. `FACT_IN_MATERIAL` nunca é promovido automaticamente a "fato real" — o nome do valor
existe exatamente para impedir essa promoção implícita. Isto é proposta nova, não ratificada.

**A.3 — Fechamento da unidade entidade/material**

Busquei um artefato de evidência dedicado (`apps/api/src/services/radarSocial/*EVIDENCE*`,
entrada em `docs/EVIDENCE_INDEX.md` para `radarSocial`/`RadarKnownEntity`/`RadarMaterial`) —
**nenhum dos dois existe**. O único registro é a narrativa da Atualização 1.10 deste mesmo
plano, que cita resultados (63 testes, diff de typecheck, `git status`) mas não constitui um
artefato de evidência dedicado nem uma entrada no Evidence Index. **Fechamento não comprovado
pelas evidências disponíveis** — não repito a auditoria nesta rodada; registro a lacuna.

**A.4 — Classificações de reaproveitamento, precisadas**

- `ConnectorInstance` e `legacyApiConnector.ts`: **sem consumidor localizado** nesta consulta
  (não "código de exemplo" — essa era uma inferência além do que a busca sustenta).
- A cadeia Run→fila→worker é o **caminho existente identificado** para execução de LLM — não
  concluo que **toda** arquitetura possível de execução exigiria Run/fila; concluo que é o único
  caminho **encontrado** nesta consulta.
- Agente "radar": **dependência ainda a confirmar** — não localizado como `AgentProfile`/
  `AgentMetadata` em nenhum registro consultado; ausência não implica impossibilidade, implica
  provisionamento pendente.

### B. Desenho completo da próxima unidade (proposta técnica, não ratificada)

Jornada: material autorizado persistido (existente) → **solicitação de análise** → **tentativa
de execução governada** → **recomendação fundamentada persistida** → **recuperação
autorizada**. Revisão humana posterior fica delimitada só como interface de referência (E),
sem redesenho.

**B.1 — Solicitação de análise (`RadarAnalysisRequest`, proposta)**

Campos: `entityId`/`materialId` (referência exata e imutável ao material, FK composta ao mesmo
padrão de `RadarMaterial`), `objective` (pergunta/objetivo, obrigatório, limite de bytes a
definir), `additionalContext` (opcional, texto livre, **não** uma nova coleta — só o que o
solicitante já fornece), `requestedByUserId` (do contexto confiável, nunca do corpo),
`tenantId`/`workspaceId`, `contractVersion` (`radar-analysis-request.v1`, proposto),
`operationKey` (convenção idêntica a `RadarMaterial`).

Identidade completa comparada no reenvio (mesma `operationKey`): `{entityId, materialId,
objective, additionalContext, requestedByUserId}`.

Três casos distintos, nenhum bloqueado pelo outro:
1. **Reenvio da mesma solicitação** — mesma `operationKey` e identidade completa idêntica →
   recuperação idempotente, mesmo registro (padrão já usado em `RadarMaterial`).
2. **Nova análise intencional do mesmo material** — `operationKey` nova, `materialId` pode se
   repetir, `objective`/`additionalContext` podem mudar ou não → cria um `RadarAnalysisRequest`
   **novo**, com autorização de consumo **própria**, revalidada do zero. Não existe regra "um
   pedido por material" — isso não é imposto.
3. **Nova tentativa técnica da mesma análise** — não cria um novo `RadarAnalysisRequest`; cria
   uma nova `RadarAnalysisAttempt` sob o `RadarAnalysisRequest` existente (B.2).

**B.2 — Tentativa e execução (`RadarAnalysisAttempt`, proposta)**

Estados: `pending → running → (provider_responded_pending_persistence) → completed`, com saída
para `failed` a partir de `running`/`provider_responded_pending_persistence`, e `cancelled` só
por decisão humana explícita a partir de `pending`/`running`.

- `pending` é criado pelo serviço, em nome do solicitante.
- `pending → running` só pode ser iniciado pelo **processo executor real** (nunca por uma
  chamada HTTP direta do solicitante) — é o instante em que a autorização de acesso ao
  material/entidade é **revalidada** (não herdada da criação da solicitação), e em que o serviço
  deve chamar `assertWorkspaceAgentEnabled` **antes** de publicar qualquer Run.
- `running → provider_responded_pending_persistence`: estado explícito para "resposta recebida
  do provedor, ainda não persistida" — existe exatamente para que uma falha entre receber e
  gravar não perca a resposta nem force um novo consumo pago para recuperá-la.
- Retentativa técnica cria uma **nova** `RadarAnalysisAttempt` (nunca reescreve a anterior) e
  **revalida autorização de envio/consumo do zero** — uma tentativa anterior autorizada não
  "empresta" autorização para a próxima (correção pedida na seção 2).
- Vínculo com o Core: a execução real, quando existir, usa a cadeia já identificada
  (`createRunRecord`/`publishRun`/`runWorker.ts`/`orchestrator.run`/`executeLlmStep`/
  `runCompletion`) — nenhum atalho direto ao provedor é proposto. Isso implica um
  `AgentProfile`/`AgentMetadata` real para o agente que executa a análise (nome pendente de
  decisão) como **dependência indispensável**, e a garantia de `assertWorkspaceAgentEnabled`
  como **disciplina do serviço novo**, não uma mudança pedida ao Core.
- Não prometo execução nem cobrança exactly-once — a garantia proposta é "no máximo uma
  `RadarRecommendation` por tentativa bem-sucedida", não "no máximo uma chamada ao provedor por
  solicitação".

**B.3 — Recomendação fundamentada (`RadarRecommendation`, proposta)**

Vinculada 1:1 a uma `RadarAnalysisAttempt` concluída (referência à solicitação é transitiva, via
a tentativa — não duplicada). Campos: `contractVersion` (`radar-recommendation.v1`),
`recommendationType` (`actionable | insufficient_evidence | do_not_act` — os três são
**resultados válidos**, distintos de falha técnica), `summary`, `statements[]` (cada um com
`content`, `natureza` ∈ {`FACT_IN_MATERIAL`,`INFERENCE`,`HYPOTHESIS`,`UNKNOWN`},
`referenceIds[]`), `confidenceLevel` opcional e separado, `references[]` (cada uma apontando
para um trecho **verificável** do material/contexto — ver validação abaixo), `limitations`,
`suggestedAction` (só quando `actionable`), `provenance` (agente, modelo, `traceId`/
`requestId` reais devolvidos por `executeLlmStep`, nunca inventados).

**Validação de referências antes de persistir**: cada `reference` é conferida
deterministicamente contra o conteúdo real (`RadarMaterial.conteudo`/`additionalContext`) — uma
referência que não corresponde a nenhum trecho existente **impede** a persistência da
recomendação; a tentativa é marcada `failed` com `failureReasonCode: reference_not_verifiable`.
Uma referência produzida pelo modelo nunca é aceita só por existir.

Distinção explícita: `insufficient_evidence`/`do_not_act` são recomendações **completas e
persistidas** (sucesso da análise); falha técnica (timeout, erro do provedor, saída que não
valida contra o contrato, referência não verificável) **não gera** `RadarRecommendation` — fica
só no `failureReasonCode` da tentativa.

Exemplos sintéticos (fictícios, não geração real):
- **Fundamentada**: statement `FACT_IN_MATERIAL` ("empresa anunciou filial em Recife",
  referenciando o trecho exato do material) + statement `INFERENCE` ("pode indicar demanda por
  fornecedores logísticos regionais") + `suggestedAction`.
- **Evidência insuficiente**: material só cita "estamos avaliando crescer", sem fato concreto —
  `recommendationType: insufficient_evidence`, sem `suggestedAction`, com
  `insufficientEvidenceReason`.
- **Referência inválida**: saída cita um trecho ("vamos abrir 5 novas filiais") que não existe
  no material fornecido — rejeitada na validação determinística, tentativa marcada `failed`,
  nenhuma recomendação criada.

**B.4 — Persistência e recuperação**

Três modelos novos (`RadarAnalysisRequest`, `RadarAnalysisAttempt`, `RadarRecommendation` 1:1
com a tentativa) — não seis, e sem duplicar estado que o Core já mantém (`Run.status` não é
copiado; quando existir vínculo com `Run`, a tentativa referencia `runId`, não duplica o estado
de execução). Constraints propostas: `@@unique([tenantId, workspaceId, operationKey])` em
`RadarAnalysisRequest` (mesmo padrão de `RadarMaterial`); FK composta tentativa→solicitação e
recomendação→tentativa; **no máximo uma tentativa ativa (`pending`/`running`) por solicitação**
— isso exige um índice único parcial (`WHERE status IN (...)`), que o Prisma não expressa
nativamente: fica marcado como decisão técnica de migration futura, não uma estrutura já
resolvida.

Correção de material depois da análise **não** move a recomendação para a sucessora — ela
continua apontando ao `materialId` exato e imutável analisado; uma nova análise da sucessora
exige um `RadarAnalysisRequest` novo e explícito. Revogação de acesso à entidade oculta a
recomendação nas leituras (mesmo padrão de não revelar existência já usado em `RadarMaterial`),
sem apagar o registro. Preservação histórica é o padrão desta unidade, mas **não implica
retenção eterna aprovada** — política de retenção/expurgo é pendência de produto separada.

**B.5 — Revisão humana posterior (interface mínima de referência, não implementação)**

Não redesenho a revisão humana nem reutilizo `HumanConfirmation` (acoplado por FK a
`SignalForwardRequest` — bloqueio estrutural já registrado na Atualização 1.10). Interface
mínima que uma revisão futura precisaria referenciar: `recommendationId` (a imutabilidade da
recomendação already fixa a "versão" — não é necessário um contador de revisão separado),
`reviewedText` opcional (cópia editada pelo revisor, nunca reescrevendo o original),
`decision` (`approved|rejected|deferred` — **nunca** `published`), `reviewedByUserId`,
`reviewedAt`. Aprovação de recomendação não autoriza publicação, envio ou qualquer ação externa.

### C. Matriz de autorização por operação (proposta)

| Operação | Identidade responsável | Escopo (proposto) | Acesso ao sujeito | Revalidação | Sem autorização | Componente |
|---|---|---|---|---|---|---|
| Solicitar análise | Usuário autenticado | `radar_social.analysis.request` (novo) | Resolver, operação nova `analyze` (proposta) | Na criação e em todo reenvio | Bloqueia (erro de autorização) | Extensão do `RadarEntityAccessResolver` |
| Iniciar tentativa | Processo executor, em nome do solicitante original | `radar_social.analysis.execute` (novo) | Resolver, revalidado agora, não herdado | A cada tentativa, inclusive retentativa | Aborta a tentativa, não tenta parcialmente | `assertWorkspaceAgentEnabled` (existente) chamado pelo serviço novo |
| Ler material | Processo executor | `radar_social.read` (existente) | Resolver, herdado da entidade | No momento do uso | Aborta antes de compor o conteúdo a enviar | `radarMaterialService.getRadarMaterial` (reuso direto) |
| Enviar conteúdo ao modelo | Sistema, sob proveniência da tentativa | Consumo (novo, sem nome definido) | Já resolvido pelas etapas anteriores | Antes de cada chamada real | Nenhuma chamada de rede é feita | `assertKnowledgePolicy` (existente, parcial) + política de conteúdo permitido (pendente) |
| Persistir resultado | Processo executor | Implícito às etapas anteriores | Revalidado antes de gravar | No instante da escrita | Não persiste; marca falha, não sucesso parcial | Transação nova + validação de referências (a construir) |
| Recuperar recomendação | Usuário autenticado | `radar_social.read` (existente) | Resolver, herdado, a cada leitura | Sempre, nunca cacheada | Resposta "não encontrado", sem revelar existência | Mesmo padrão de `getRadarMaterial` |
| Solicitar nova análise | Usuário autenticado | Igual a "solicitar análise" | Igual a "solicitar análise" | Do zero, sem herdar de análise anterior | Igual a "solicitar análise" | Igual a "solicitar análise" |

Sem um `RadarEntityAccessResolver` real de produção, todo uso permanece restrito a testes com
substituto controlado — nenhuma chamada real é autorizada por esta matriz. Fontes permitidas,
provedor, conteúdo autorizado, limites de consumo e responsáveis operacionais continuam
pendências de autorização específica, fora desta unidade. Instagram permanece integração
futura possível — nenhum OAuth, webhook, DM, hashtag, publicação ou resposta pela Meta está
incluído aqui.

### D. Pacote delimitado para aprovação (resumo; ver relatório da sessão para o detalhamento completo)

Modelos: `RadarAnalysisRequest`, `RadarAnalysisAttempt`, `RadarRecommendation`. Componentes
reutilizados diretamente: `radarMaterialService`/`radarKnownEntityService` (leitura),
`checkScopePermission`, `assertWorkspaceAgentEnabled`, cadeia Run→fila→`executeLlmStep`→
`runCompletion`. Extensão indispensável fora do código do Radar: provisionar `AgentProfile`/
`AgentMetadata` real para o agente de análise. Migration futura: caminho ainda **não gerado**
(`packages/db/prisma/migrations/<timestamp-a-gerar>_add_radar_analysis_and_recommendation/`).
Testes de aceite previstos cobrem isolamento/autorização vigente, idempotência vs. nova análise,
concorrência de tentativa, referência exata ao material mesmo após correção, referências
inválidas, resultado insuficiente distinto de erro, falha do provedor, falha de persistência
pós-resposta, e recuperação histórica sem nova execução — todos contra substituto controlado do
executor de LLM, nunca chamada real.

### Classificação das afirmações desta atualização

- **Implementado localmente**: nada nesta atualização (só o pacote de entidade/material, já
  registrado na Atualização 1.10).
- **Evidenciado por leitura**: condições exatas de `isAgentAvailableInWorkspace`,
  `resolveActionsForExecution`, ausência de artefato de evidência dedicado para
  entidade/material.
- **Proposta técnica**: os três modelos novos, seus campos, estados e validações.
- **Política ainda não aprovada**: nomes de escopo, natureza vs. confiança como dois campos
  separados, operação `analyze` no resolvedor, `recommendationType` de três valores.
- **Dependência operacional**: `AgentProfile`/`AgentMetadata` real do agente de análise;
  índice único parcial em migration futura.
- **Autorização pendente**: qualquer chamada real a modelo; fontes e conteúdo permitido; limites
  de consumo; responsáveis operacionais; toda a frente Instagram.

### Próximo passo

Decisão humana sobre aprovar (ou corrigir) este desenho antes de qualquer código. Esta
atualização não autoriza implementação.

## Atualização 1.12 — adendo final: autorização no executor, recuperação de resposta e concorrência tentativa↔Run (16/09/2026)

Fonte: leitura focalizada de código nesta sessão (worktree `EIAH_SIGNALFORWARD_ORIGIN_FIX`,
branch `experiment/signalforward-origin-fingerprint-fix`, HEAD ainda
`4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Completa a Atualização 1.11
nos três pontos que ficaram em aberto. `RadarAnalysisRequest`, `RadarAnalysisAttempt` e
`RadarRecommendation` continuam **propostas**, não aprovadas. Nenhuma política nova é
ratificada silenciosamente por esta atualização.

### A. Autorização no executor — três momentos distintos, não dois

A Atualização 1.11 já separava "solicitar" de "iniciar tentativa". Esta atualização acrescenta
um **terceiro momento**, pedido explicitamente: `assertWorkspaceAgentEnabled` no serviço de
entrada garante que o workspace podia executar o agente **quando a tentativa foi aceita** — não
garante nada sobre o instante, possivelmente muito posterior (fila com espera), em que a
chamada de rede ao provedor realmente sai. Uma revogação nesse intervalo só é pega por uma
revalidação **própria**, no ponto mais tardio possível antes do envio.

| Controle | Identidade avaliada | Fonte autoritativa | Momento | Ponto de integração | Resultado bloqueante |
|---|---|---|---|---|---|
| Autorização para solicitar | `requestedByUserId` do contexto confiável | `TenantMembership` + `Workspace.tenantId` + `TenantActionPolicy` (`checkScopePermission`) | Na criação do `RadarAnalysisRequest` | **Extensão proposta**: `radarAnalysisRequestService.ts`, antes de gravar (mesmo padrão de `assertRadarSocialOperationAuthorized`, código existente reaproveitado) | Bloqueia a criação; nada é gravado |
| Autorização para iniciar a tentativa | `requestedByUserId` **relido do registro autoritativo** (`RadarAnalysisRequest`, nunca da mensagem da fila) | `assertWorkspaceAgentEnabled` (existente, bloqueante) contra `WorkspaceAgentAssignment` | No instante em que o processo executor reivindica o trabalho (`pending → running`) | **Extensão proposta**: o handler equivalente a `processRunPayload` hoje **não** chama `assertWorkspaceAgentEnabled` (achado já registrado na Atualização 1.10/1.11) — o serviço do Radar precisaria chamá-la explicitamente, sem depender de mudança no worker genérico | Aborta a tentativa; marca `failed` com `reasonCode` de autorização, nunca fica pendurada em silêncio |
| **Revalidação imediatamente antes da chamada ao provedor** | Mesma identidade, **relida de novo** do registro autoritativo, não reaproveitada da checagem anterior | `assertWorkspaceAgentEnabled` + `RadarEntityAccessResolver` consultados **de novo** nesse instante | Imediatamente antes de `executeLlmStep`/`runCompletion` — o ponto mais tarde possível antes do envio de rede | **Extensão proposta**, dentro do `act()` (`runWorker.ts:1579-1721`) ou de um wrapper equivalente do Radar antes de `executeCapability` — hoje **nenhum** agente tem esta revalidação | Aborta antes do envio de rede; nenhuma chamada parcial |
| Acesso ao material/sujeito | `entityId`/`materialId` do `RadarAnalysisRequest` autoritativo | `RadarEntityAccessResolver` (interface existente, sem implementação real) | Nos três momentos acima, sempre que o material for lido ou reenviado | Código existente: `radarMaterialService.getRadarMaterial` | Ausência/falha do resolvedor (`resolver_unavailable`/`resolution_failed`) bloqueia por padrão, sem exceção |
| Ferramentas do agente | N/A (decisão de perfil, não de identidade) | `TenantActionPolicy` via `resolveActionsForExecution` | Antes de `orchestrator.run` | Código existente, com o fallback já documentado (libera catálogo inteiro se não houver nenhuma política) | Ver disciplina abaixo — não neutralizado estruturalmente nesta unidade |
| Envio de conteúdo ao provedor | N/A | `assertKnowledgePolicy` (`llmExecutor.ts`, existente) + política de conteúdo/fonte permitida (**pendente**, fora desta unidade) | No instante de `executeLlmStep` | Código existente (parcial) | Bloqueia por `knowledgePolicy`; não cobre autorização de fonte/conteúdo, que continua pendência de produto |
| Consumo | N/A | **Não localizado** um componente dedicado nesta consulta | Deveria ser o mesmo instante da revalidação pré-chamada | **Sem componente identificado** — dependência a confirmar, não presumida como resolvida por `chargeRun` sem verificação própria | Sem componente hoje; não presumo bloqueio automático |

**Como o executor preserva a identidade do solicitante sem confiar no corpo/mensagem da
fila**: a mensagem de fila deveria carregar só uma **referência opaca** (`attemptId`); toda
decisão de autorização relê `tenantId`/`workspaceId`/`requestedByUserId`/`entityId`/`materialId`
do registro `RadarAnalysisAttempt`/`RadarAnalysisRequest` no banco, nunca dos campos da
mensagem. Isto **diverge deliberadamente** do padrão observado na cadeia genérica existente
(`processRunPayload` desestrutura `{tenantId, workspaceId, userId, prompt, metadata}`
diretamente do payload da fila e **nunca relê `Run.request`** — achado já registrado no
documento de origem/autorização) — é uma extensão proposta, não uma correção ao Core.

**Após revogação**: se o acesso foi revogado antes da revalidação pré-chamada, ela bloqueia. Se
foi revogado **depois** que a chamada de rede já começou, **não interrompo uma chamada em
voo** — a garantia é "nenhuma chamada NOVA começa depois da revogação", nunca "toda chamada em
curso para no instante da revogação". Fronteira declarada, não prometida além disso.

**Ausência/falha de resolução bloqueia**: mesma disciplina já usada em `radarKnownEntityService.ts`/
`radarMaterialService.ts` — `resolver_unavailable` e `resolution_failed` derrubam a operação
inteira, nunca uma liberação silenciosa.

**Impedir o fallback de ferramentas sem política**: enquanto o perfil do agente de análise não
declarar `tools` (proposta: começar com `tools: []`, como a maioria dos perfis existentes), o
fallback de `resolveActionsForExecution` é **inofensivo na prática** — não há ferramenta a
liberar. Isso **não neutraliza a lacuna estruturalmente**: se ferramentas forem adicionadas no
futuro, uma `TenantActionPolicy` explícita passa a ser pré-condição obrigatória antes de
habilitar o agente em qualquer workspace — disciplina proposta, não implementada.

**Retry interno do provedor**: os retries de `runCompletion` (`packages/core/src/llm/completionEngine.ts:57-66`,
`LLM_RETRIES` padrão 3, backoff exponencial com jitter) ocorrem **dentro** de uma única chamada
já autorizada pela revalidação pré-chamada, num intervalo curto e limitado por
`LLM_TIMEOUT_MS`/backoff — não atravessam uma nova espera de fila. Proponho tratá-los como
cobertos pela mesma revalidação que autorizou a chamada original, **contanto que os limites de
tempo configurados permaneçam curtos o suficiente para tornar improvável uma revogação no meio
deles** — isto é uma dependência a confirmar operacionalmente, não uma garantia automática.

### B. Resposta do provedor — cinco cenários, sem inflar `provider_responded_pending_persistence`

Correção: esse estado só é recuperável se houver **evidência durável** por trás dele — o nome
sozinho não basta. Mecanismo candidato para essa durabilidade: um `RunEvent` (`packages/db/prisma/schema.prisma`,
modelo já existente, `payload: Json?`, FK obrigatória a `Run`) gravado com o conteúdo bruto da
resposta, na mesma transação que move `RadarAnalysisAttempt` para
`provider_responded_pending_persistence`. **Não está integrado hoje** — é proposta, condicionada
a existir um `Run` real por trás da tentativa.

| Cenário | O que está armazenado | O que permanece desconhecido | Recuperação | Nova chamada ao provedor? | Autorização para novo consumo | Duplicata evitada por |
|---|---|---|---|---|---|---|
| A. Falha antes de enviar | Tentativa ainda `running`/`pending`; nenhuma chamada saiu | Nada — sabemos que não foi enviado | Nova tentativa livre | Sim, sem restrição especial | Igual à já concedida a esta tentativa (nenhum consumo ocorreu) | N/A, nada foi produzido |
| B. Enviado, resposta desconhecida (timeout de rede) | No máximo, registro de que uma chamada foi iniciada | Se o provedor processou e/ou cobrou | Tratada como **falha técnica** (`failed`, `provider_response_unknown`) — nunca presumida como sucesso nem como não-processada | Sim, mas é consumo **novo**, sujeito a nova autorização | Mesma revalidação de consumo do zero | **Nenhuma garantida** nesta camada sem idempotência própria do provedor **comprovada** (capacidade a verificar, não presumida) |
| C. Resposta só em memória do processo, seguida de queda | Nada durável | O conteúdo da resposta está perdido | Indistinguível do cenário B para quem recupera depois | Sim, com o mesmo risco de duplicidade do cenário B | Igual ao cenário B | Igual ao cenário B |
| D. Resposta preservada de forma durável (`RunEvent`), recomendação ainda não persistida | Conteúdo bruto da resposta, íntegro | Nada sobre a resposta em si | Reconciliação relê o `RunEvent` e tenta derivar/validar a `RadarRecommendation` **sem nova chamada** | **Não** — é exatamente o caso que a durabilidade existe para evitar | Nenhuma (não há novo consumo do provedor); só a autorização de "persistir resultado" | Constraint 1:1 proposta entre `RadarRecommendation` e `RadarAnalysisAttempt` — segunda tentativa de persistência encontra o registro já existente e o recupera |
| E. Recomendação persistida, resposta ao chamador original perdida | `RadarRecommendation` completa, já gravada | Nada — só a confirmação ao chamador se perdeu | Consulta de "recuperar recomendação" por `attemptId`/`analysisRequestId` devolve o resultado já persistido | Não, em hipótese alguma | N/A | Mesma constraint 1:1 |

Mecanismo candidato (`RunEvent`), delimitado: conteúdo = payload bruto da resposta do provedor;
acesso = mesmo escopo tenant/workspace do `Run`, sujeito às mesmas regras de leitura já
aplicadas a `Run`/`RunEvent`; retenção = não decidida aqui, mesma pendência de política geral já
registrada para material/recomendação; atomicidade possível = gravar o `RunEvent` e mudar o
estado da tentativa na **mesma transação Postgres** — a chamada de rede em si nunca é
transacional, só o registro pós-recebimento. Não prometo retentativa automática de resultado
ambíguo como gratuita, nem execução ou cobrança exactly-once.

### C. Relação tentativa↔Run e concorrência

**Cardinalidade**: 1 `RadarAnalysisRequest` : N `RadarAnalysisAttempt` : 0..1 `Run` por
tentativa (nulo até a execução real começar) : 0..1 `RadarRecommendation` por tentativa
(só quando concluída com sucesso).

**Nascimento de cada registro**: `RadarAnalysisRequest` nasce na solicitação (autorização A da
seção acima). `RadarAnalysisAttempt` nasce em `pending` já na criação da solicitação (a primeira
tentativa) ou por decisão explícita de retentativa técnica; seu vínculo com `Run` começa nulo e
só é preenchido quando a execução real de fato é publicada. `RadarRecommendation` nasce só na
persistência bem-sucedida, 1:1 com a tentativa que a produziu.

**Autoridade por informação**: `RadarAnalysisRequest` é autoritativo para intenção (objetivo,
material, contexto). `RadarAnalysisAttempt` é autoritativo para estado de execução (status,
`claimToken`, tempos). `Run`/`RunEvent` são autoritativos para o que de fato aconteceu na
chamada ao provedor (quando existir Run). `RadarRecommendation` é autoritativa só para o
resultado fundamentado em si — nunca duplica `Run.status` nem o conteúdo do material.

**Quatro casos, nunca confundidos**:
1. **Nova solicitação intencional** — novo `operationKey`, pode repetir material/entidade → novo
   `RadarAnalysisRequest`.
2. **Nova tentativa técnica** — mesma solicitação, nova `RadarAnalysisAttempt`.
3. **Reentrega da mesma mensagem de fila** — mesma tentativa, mesmo `attemptId` — deve ser
   idempotente na claim (ver guarda abaixo), nunca cria uma segunda tentativa.
4. **Retry interno do provedor** — dentro de uma única chamada de uma única tentativa, nunca
   visível como um registro novo.

**Máquina de estados mínima da tentativa**, com guardas:

```
pending --[claim: UPDATE ... WHERE id=X AND status='pending'
            SET status='running', claimedByWorkerId=W, claimToken=novo, claimedAt=now()]--> running
running --[revalidação pré-chamada OK]--> running (envia ao provedor)
running --[resposta durável gravada, mesma transação]--> provider_responded_pending_persistence
provider_responded_pending_persistence --[persistência OK, WHERE claimToken=meuToken]--> completed
running | provider_responded_pending_persistence --[falha técnica]--> failed
pending | running --[cancelamento SOLICITADO]--> cancelRequestedAt preenchido (não muda status sozinho)
running --[executor observa cancelRequestedAt no seu próprio checkpoint]--> cancelled (EFETIVO)
```

**Guardas indispensáveis**:
- *No máximo uma tentativa ativa por solicitação*: `RadarAnalysisAttempt` precisa de um índice
  único parcial `WHERE status IN ('pending','running')` sobre `analysisRequestId` — decisão
  técnica de migration futura, não resolvida nesta rodada (Prisma não expressa índice parcial
  nativamente).
- *Claim concorrente*: `UPDATE ... WHERE id=X AND status='pending'` — escrita condicionada
  atômica, mesma técnica já usada em `radarKnownEntityService.ts` (`updateMany` com contagem);
  só um executor ganha a claim.
- *Impedimento de trabalhador antigo após perda de posse*: toda escrita final (persistir
  `RadarRecommendation` + mover a tentativa para `completed`/`failed`) é condicionada a
  `WHERE claimToken = <token que este executor recebeu ao reivindicar>`. Se outro executor já
  reivindicou de novo (porque o lease expirou), o `claimToken` mudou e a escrita tardia do
  executor antigo **não encontra linha para atualizar** — resultado descartado, nunca
  persistido. Isto é **disciplina de aplicação sobre uma escrita condicionada do Postgres**, não
  uma garantia do banco por si só.
- *Cancelamento solicitado vs. efetivo*: marcar `cancelRequestedAt` **não** libera uma nova
  tentativa nem interrompe a chamada em curso — só o próprio executor, no seu próximo
  checkpoint (ex.: logo após receber a resposta do provedor, antes de persistir), observa o
  pedido e efetiva o cancelamento. Uma nova tentativa só é permitida quando a tentativa anterior
  atingir um estado terminal verificável (`completed`/`failed`/`cancelled`) **ou** seu
  `claimToken` estiver comprovadamente expirado (TTL de lease vencido) — nunca só por
  `cancelRequestedAt` estar presente.
- *Resposta tardia após cancelamento*: se uma resposta chega para uma tentativa já cancelada, a
  escrita condicionada por `claimToken`/status falha e a resposta não vira recomendação — pode,
  no máximo, ser preservada como `RunEvent` para diagnóstico.
- *Recuperação de tentativa abandonada*: um processo de reconciliação (não o caminho feliz) pode
  identificar tentativas em `running` com `claimedAt` além do TTL do lease e marcá-las `failed`
  (ou reabrir para nova tentativa), usando a mesma escrita condicionada por `claimToken`.
- *Persistência única da recomendação*: garantida pela constraint 1:1 já citada na seção B.

**Sobre o mecanismo de posse existente**: `packages/core/src/queue/workerOwnershipLease.ts`
(lease Redis via `SET NX PX` + scripts Lua de renovação/liberação por CAS) já resolve **qual
processo de worker** está ativo para uma fila inteira (`"runs"`) — é um controle de nível de
**processo**, não de **item de trabalho**. Não substitui o `claimToken` por tentativa proposto
acima (a granularidade é diferente); é um controle complementar, não uma dependência nova a
criar — mas seu funcionamento real com Redis **não foi comprovado por execução nesta consulta
nem em registro anterior localizado** (memória do projeto indica teste específico de efeitos
duplicados como pulado) — trato como "código existente, garantia não comprovada por execução",
não como uma peça já validada.

### D. Campos, versões e referências — tabela consolidada

| Campo | Tipo | Obrigatório | Origem | Validação/limite | Mutabilidade | Idempotência? |
|---|---|---|---|---|---|---|
| `RadarAnalysisRequest.entityId` | string | sim | corpo, validado contra `RadarKnownEntity` real | FK composta existente | imutável | sim |
| `RadarAnalysisRequest.materialId` | string | sim | corpo, validado contra `RadarMaterial` real (mesma entidade) | FK composta existente | imutável | sim |
| `RadarAnalysisRequest.objective` | string | sim | corpo | limite de bytes **a definir** (proposta, não decidida) | imutável | sim |
| `RadarAnalysisRequest.additionalContext` | string | não | corpo | limite de bytes **a definir** | imutável | sim |
| `RadarAnalysisRequest.requestedByUserId` | string | sim | contexto confiável, nunca do corpo | — | imutável | sim |
| `RadarAnalysisRequest.tenantId`/`workspaceId` | string | sim | contexto confiável | — | imutável | escopo, não campo comparado |
| `RadarAnalysisRequest.contractVersion` | string literal | sim | servidor | `"radar-analysis-request.v1"` (proposto) | imutável | não (é o próprio contrato, não um valor comparável) |
| `RadarAnalysisRequest.operationKey` | string | sim | corpo (chamador) | 1–128 bytes, convenção de `RadarMaterial` | imutável | é a chave de agrupamento, não um campo comparado dentro dela |
| `RadarAnalysisAttempt.attemptNumber` | int | sim | servidor | incremental por solicitação | imutável | não — tentativas técnicas não são comparadas por identidade, são sequenciais |
| `RadarAnalysisAttempt.status` | enum | sim | servidor/executor | ver máquina de estados | mutável só por transição condicionada | não |
| `RadarAnalysisAttempt.claimedByWorkerId`/`claimToken` | string | não até a claim | executor | gerado na claim | mutável só por nova claim válida | não |
| `RadarAnalysisAttempt.runId` | string | não (nulo até execução real) | servidor, ao publicar o Run | FK composta quando presente | write-once quando preenchido | não |
| `RadarAnalysisAttempt.generationConfig` | json | proposta | servidor, a partir da política vigente **no momento da tentativa** | **a definir** | imutável por tentativa (cópia da configuração efetiva, não um ponteiro para "a política atual") | não é comparada; é auditoria |
| `RadarRecommendation.attemptId` | string | sim | servidor | único (1:1) | imutável | é a chave da unicidade 1:1 |
| `RadarRecommendation.recommendationType` | enum | sim | resultado da análise | `actionable\|insufficient_evidence\|do_not_act` (proposto, **não ratificado**) | imutável | não |
| `RadarRecommendation.statements[].natureza` | enum | sim | resultado da análise | `FACT_IN_MATERIAL\|INFERENCE\|HYPOTHESIS\|UNKNOWN` (proposto, **não ratificado**) | imutável | não |
| `RadarRecommendation.statements[].confidenceLevel` | enum opcional | não | resultado da análise | `low\|medium\|high` (proposto) — dimensão **separada** de `natureza` | imutável | não |
| `RadarRecommendation.references[]` | array | sim quando `statements` citam | resultado da análise, **validado deterministicamente** contra o material/contexto antes de persistir | localização/estrutura confirmadas — **não** comprova veracidade nem sustentação semântica completa | imutável | não |
| `RadarRecommendation.provenance` | json | sim | valores reais devolvidos por `executeLlmStep` (`traceId`/`requestId`/`model`/`provider`) | nunca inventado | imutável | não |

**Reenvio da mesma solicitação recupera o registro original** — não é reconstruído com um
template novo. **Template de análise e configuração de geração** são registrados **por
tentativa** (`generationConfig`, cópia efetiva no momento daquela tentativa), nunca só uma
referência a "a política atual" — para que uma política mudar depois não altere
retroativamente o que uma tentativa antiga realmente usou. Política registrada historicamente
**não dispensa** autorização vigente para uma nova execução — são coisas diferentes.

Não altero nem reaproveito `FINGERPRINT_CONTRACT_VERSION`/`computeRequestFingerprint` do
SignalForward — `operationKey` do Radar é uma chave própria, já estabelecida desde
`RadarMaterial` (Atualização 1.9).

Nenhum destes nomes de enum, limites de bytes ou o próprio `contractVersion` está ratificado —
são propostas desta atualização, listadas explicitamente como pendentes na seção de
classificação abaixo.

### E. Testes de aceite acrescentados a esta unidade (propostos, não executados)

Além dos já listados na Atualização 1.11: revogação de acesso entre a criação da solicitação e
o início da chamada ao provedor; resolvedor ausente/negado/falho em cada um dos três momentos de
autorização; ausência de política sem liberar ferramentas (com o agente declarando ao menos uma
tool sintética, para exercitar o fallback); retries internos do provedor permanecendo sob a
mesma revalidação; duas tentativas concorrentes disputando a claim da mesma solicitação;
reentrega da mesma mensagem de fila não duplicando a tentativa; trabalhador com `claimToken`
vencido tentando persistir depois de outro já ter reivindicado; cancelamento solicitado com
resposta do provedor chegando depois; resposta perdida antes de qualquer preservação durável
(cenário C); recuperação de resposta já preservada sem nova chamada ao modelo (cenário D);
persistência concluída seguida de perda da resposta ao chamador (cenário E); mudança de
`generationConfig`/template não alterando silenciosamente uma solicitação já existente;
referências inválidas impedindo a persistência; material corrigido depois da análise mantendo a
referência histórica exata; recuperação autorizada de uma recomendação antiga sem disparar nova
execução.

### F. Dois pacotes separados

**A — implementação local candidata**: os três contratos, persistência e serviços, com o
executor/provedor **substituído por um duplo controlado** (equivalente aos resolvedores
fixture já usados em `radarSocial/__tests__/helpers.ts`) — nenhuma chamada real, nenhum acesso
por cliente real, falhas e concorrência (claim, cancelamento, resposta tardia) simuladas contra
PostgreSQL descartável. Não cria nenhum fallback permissivo disponível em produção — os
substitutos de teste continuam exclusivos de `__tests__/`, mesma disciplina já aplicada à
entidade/material.

**B — ativação operacional futura**, fora desta unidade: resolvedor real de acesso;
identidade/provisionamento do agente de análise; os três controles de autorização do executor
efetivamente implementados no worker real; autorização de fontes/conteúdo permitido; provedor e
limites de consumo definidos; execução e operação reais. Nome do agente e autorização de modelo
**não precisam ser aprovados nesta rodada documental**.

Garantias que só podem ser comprovadas com integração real, nunca com substituto controlado:
comportamento efetivo do `WorkerOwnershipLease` sob Redis real; se o provedor de fato oferece
idempotência própria de chamada; janela real de latência de fila (necessária para avaliar se a
revalidação pré-chamada é suficiente ou se retries internos podem mesmo assim atravessar uma
revogação); comportamento do fallback de ferramentas com uma `TenantActionPolicy` real ausente
em produção.

### Classificação desta atualização

- **Fatos comprovados no código**: condições exatas de `isAgentAvailableInWorkspace`/
  `resolveActionsForExecution` (já na Atualização 1.11); `RunEvent` exige `runId` não-nulo;
  `WorkerOwnershipLease` é lease de fila via Redis (CAS por script Lua), não de item de
  trabalho; retries de `runCompletion` são internos e limitados por `LLM_TIMEOUT_MS`/backoff.
- **Desenho proposto**: os três contratos, a máquina de estados da tentativa, o `claimToken`,
  o uso de `RunEvent` como preservação durável da resposta, a tabela de campos.
- **Dependência**: `Run`/`RunEvent` reais por trás de uma tentativa; índice único parcial em
  migration futura; extensões no ponto de disparo do executor (chamar
  `assertWorkspaceAgentEnabled` e revalidar antes do envio de rede) — nenhuma delas implementada.
- **Decisão pendente**: nomes/valores de todos os enums propostos; limites de bytes de
  `objective`/`additionalContext`; se retries internos ficam mesmo cobertos por uma única
  revalidação ou exigem revalidação própria; política de retenção de material/recomendação/
  `RunEvent`.
- **Autorização ainda não concedida**: qualquer chamada real a modelo; provisionamento do
  agente; fontes/conteúdo permitido; consumo; toda a frente Instagram.

A unidade entidade/material **não é declarada encerrada** por esta atualização — a limitação já
registrada na Atualização 1.11 ("fechamento não comprovado pelas evidências disponíveis")
permanece, sem repetir a auditoria.

### Próximo passo

Decisão humana sobre aprovar, corrigir ou complementar este desenho antes de qualquer código.
Esta atualização não autoriza implementação nem chamada real.

## Atualização 1.13 — conferência focalizada da Atualização 1.12 e escolhas técnicas recomendadas para o pacote A (16/09/2026)

Fonte: releitura integral da Atualização 1.12 tal como gravada nesta sessão (worktree
`EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`, HEAD
ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Não é uma nova
investigação de código — é conferência do documento já salvo, mais recomendação técnica para
destravar a aprovação do pacote A.

### Conferência dos três pontos

Confirmado, por releitura linha a linha da Atualização 1.12: os três pontos do adendo anterior
estão gravados de forma completa e consistente entre si — (A) autorização no executor em três
momentos distintos, com tabela e cinco esclarecimentos textuais; (B) cinco cenários de resposta
do provedor, com `RunEvent` como mecanismo candidato de durabilidade, corretamente delimitado
(conteúdo, acesso, retenção, atomicidade); (C) cardinalidade, nascimento de registro,
autoridade por informação, quatro casos distintos, máquina de estados mínima e seis guardas de
concorrência, incluindo a ressalva sobre `WorkerOwnershipLease` não ser garantia comprovada por
execução. Nenhuma inconsistência interna encontrada entre as seções.

### Escolhas técnicas recomendadas (para aprovação junto com o pacote A — ainda não ratificadas)

1. **`RunEvent` deixa de ser só "candidato" e passa a ser a escolha adotada para o pacote A** —
   os testes de concorrência/recuperação do pacote A devem assumir esse mecanismo (via fixture,
   nunca chamada real), não um espaço em aberto.
2. **Concorrência de tentativa: `claimToken` + índice único parcial no Postgres**, não um lock
   distribuído novo (Redis ou outro). Justificativa: a escrita condicionada já é o padrão
   comprovado neste código (`radarKnownEntityService.ts`), não exige infraestrutura nova, e é
   verificável inteiramente dentro do Postgres descartável do pacote A.
   `WorkerOwnershipLease` permanece só como otimização de processo, nunca como a garantia de
   correção — a correção vem inteiramente da escrita condicionada.
3. **Retries internos do provedor cobertos por uma única revalidação**, sob um teto explícito
   recomendado: janela total de uma tentativa completa (timeout × tentativas + atrasos de
   backoff) abaixo de **60 segundos**. Acima desse teto, a revalidação pré-chamada deixa de
   cobrir os retries com segurança e passa a exigir revalidação própria — tratado como
   configuração a respeitar na ativação real (pacote B), não algo o pacote A precisa impor.
4. **Limites de bytes recomendados**: `objective` 1–2.000 bytes UTF-8; `additionalContext`
   0–8.000 bytes UTF-8 — menores que os 16.384 bytes de `RadarMaterial.conteudo` porque são
   pergunta/contexto estruturado, não o material-fonte em si.
5. **`contractVersion` recomendados**: `"radar-analysis-request.v1"`,
   `"radar-analysis-attempt.v1"`, `"radar-recommendation.v1"` — um literal por contrato,
   seguindo o padrão já usado por `RADAR_SIGNAL_RESULT_CONTRACT_VERSION`/
   `HUMAN_CONFIRMATION_CONTRACT_VERSION`.
6. **Enums `recommendationType` e `natureza`** ficam como desenhados na Atualização 1.12, sem
   alteração — dois ciclos de revisão já os exercitaram sem achar inconsistência.

### Guarda explícita acrescentada — recuperação nunca dispara nova execução nem nova tentativa

Precisão que faltava nomear como guarda própria: a recuperação idempotente de um
`RadarAnalysisRequest` (mesma `operationKey`, identidade completa idêntica — Atualização 1.11)
devolve o registro original **tal como está**, incluindo a tentativa que já nasceu junto com
ele — **nunca cria uma segunda tentativa nem dispara nova execução** só por ter sido reenviada.
Isso é o que sustenta, no desenho, o resultado que a usuária descreveu como o marco B2B:
receber a recomendação baseada no material escolhido e conseguir recuperá-la — tanto a
recomendação em si (operação "recuperar recomendação", puramente de leitura, sem tocar a
máquina de estados da tentativa) quanto a solicitação que a originou (reenvio idempotente) —
sem repetir silenciosamente a análise nem o custo de consumo que ela implica.

### Classificação desta atualização

- **Confirmado por releitura**: consistência interna da Atualização 1.12 nos três pontos.
- **Recomendação técnica, pendente de aprovação**: os seis itens acima e a guarda explícita de
  recuperação.
- **Ainda não decidido**: qualquer coisa não listada aqui continua exatamente como classificada
  na Atualização 1.12 (dependências, dependências técnicas de migration, autorizações
  pendentes) — esta atualização não amplia nem reduz essa lista, só resolve os itens
  destacados acima.

### Próximo passo

Com as seis escolhas acima aceitas, o pacote A (Atualização 1.12, seção F) fica com base técnica
concreta para aprovação, com limites claros de escopo (substituto controlado de
executor/provedor, PostgreSQL descartável, sem cliente real). A ativação operacional (pacote B)
continua decisão separada e posterior.

**Superado pela Atualização 1.14**: o item 3 desta lista (retries internos cobertos por uma
única revalidação sob um teto de 60 segundos) foi corrigido — ver Atualização 1.14, seção 1.
Este registro é preservado como histórico, não apagado.

## Atualização 1.14 — correção de retries, fundamentação de RunEvent e transcrição final dos contratos (16/09/2026)

Fonte: leitura focalizada de código nesta sessão (worktree `EIAH_SIGNALFORWARD_ORIGIN_FIX`,
branch `experiment/signalforward-origin-fingerprint-fix`, HEAD ainda
`4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Corrige pontualmente três
itens das Atualizações 1.12/1.13 e apresenta o pacote único para aprovação do pacote A. Nenhuma
implementação foi feita. `RadarAnalysisRequest`, `RadarAnalysisAttempt` e `RadarRecommendation`
continuam propostas.

### 1. Correção da política de retries

**Retirada a recomendação da Atualização 1.13** de que uma única revalidação cobre novos envios
ao provedor durante uma janela de 60 segundos. Timeout limita **duração de uma chamada**, não
concede autorização para outra. Cada novo envio ao provedor — incluindo qualquer retentativa —
precisa revalidar os controles de autorização e consumo aplicáveis; resultado desconhecido
(cenário B da Atualização 1.12) não autoriza repetição automática; recuperação idempotente de
uma solicitação nunca cria tentativa nem chama o provedor (já estabelecido, reforçado aqui).

**Levantamento pontual de onde existem retries no caminho identificado, sem alterar nenhum
deles**:

| Camada | Evidência | Configurável por chamada? |
|---|---|---|
| Fila (BullMQ) | `packages/core/src/queue/runQueue.ts:140-157`, `publishRun` chama `queue.add(..., {attempts: 3, backoff: {type:"exponential", delay:250}, ...options})` | **Sim** — `options` é espalhado por último, então um chamador pode passar `{attempts: 1}` sem alterar `runQueue.ts` |
| Executor (`completionEngine.ts`) | `packages/core/src/llm/completionEngine.ts:36-40,57-66`, `retry(...)` com `LLM_RETRIES` lido de `process.env` (padrão 3) | **Não** — é lido só de variável de ambiente global dentro de `runCompletion`; `ChatCompletionRequest` não aceita override por chamada |
| Wrapper de provedor | `packages/providers/src/{OpenAIProvider,AnthropicProvider,GeminiProvider,DeepSeekProvider}.ts` — todos usam `node-fetch` diretamente, uma chamada HTTP por invocação, nenhum `retry`/`maxRetries` no arquivo | N/A — não há retry nesta camada para desabilitar |
| SDK oficial | Nenhum SDK oficial (`openai`, `@anthropic-ai/sdk` etc.) é importado — confirmado pelos `import` de cada provider acima; logo não há retry padrão de SDK a considerar | N/A |

**Conclusão evidenciada, não presumida**: desabilitar só a camada de fila (`attempts: 1` no
`publishRun` da chamada do Radar) **não elimina** o retry do executor, que é global e não
aceita override por chamada — permanece em até `LLM_RETRIES` tentativas (padrão 3) para
**qualquer** agente, incluindo um futuro agente de análise do Radar, enquanto
`completionEngine.ts` não for estendido para aceitar um override por chamada. Não afirmo que
uma correção resolve as duas camadas.

**Recomendação para aprovação do pacote A**: retries automáticos **desabilitados no nível do
serviço do Radar** — o serviço proposto (`radarAnalysisAttemptService.ts`) nunca cria
automaticamente uma nova tentativa nem invoca de novo o executor/provedor substituto após uma
falha; toda nova tentativa exige decisão explícita e autorização própria (já estabelecido,
reforçado aqui como regra de teste). Isso é inteiramente verificável dentro do pacote A, que
nunca chama a fila real nem o executor real. Para a ativação futura (pacote B), fica registrado
como **dependência a resolver, não decidida agora**: (a) o chamador do Radar passa
`{attempts: 1}` ao publicar o Run — sem mudança no Core; (b) o comportamento de
`completionEngine.ts` permanece o padrão global (até 3 retries) até que uma extensão de
override por chamada seja avaliada e aprovada separadamente — **não proponho essa extensão
agora**.

**Distinções mantidas**: teste local sem rede (pacote A) exercita a ausência de retry
automático usando um duplo controlado, nunca uma chamada real; condições necessárias para
integração real futura (pacote B) dependem de resolver a lacuna do executor acima; nova
tentativa intencional sempre passa pelas três autorizações já mapeadas (Atualização 1.12,
seção A); retomada de persistência (cenário D da Atualização 1.12) nunca chama o modelo de novo,
independente de qualquer configuração de retry.

### 2. Fundamentação de RunEvent

| Aspecto | Evidência de código | Garantia existente | Lacuna/extensão necessária |
|---|---|---|---|
| Vínculo com Run e isolamento tenant/workspace | `packages/db/prisma/schema.prisma`, modelo `RunEvent`: `runId` (FK obrigatória), `tenantId`, `workspaceId` | FK `run_events_run_id_fkey` com `ON DELETE RESTRICT` (migration `20251205150019`) — não pode existir sem `Run`, e o `Run` não pode ser apagado enquanto houver eventos | Nenhuma para isolamento em si |
| Quem grava | `apps/api/src/services/runEvents.ts:47`, `recordRunEvent` — único ponto de escrita localizado (`grep` não encontrou nenhum outro `.create` em `runEvent`) | Escrita centralizada num único serviço | Nenhuma extra localizada |
| Quem consulta | `apps/api/src/routes/runs.ts:130,169`, rotas `/runs/:id/events` e `/runs/:id/stream` exigem `authContext` (tenant/workspace) e filtram `listRunEvents` por `tenantId`/`workspaceId`/`runId` | Leitura via rota exige autenticação e é escopada por tenant/workspace | **Sem granularidade além de tenant/workspace** — nenhuma checagem adicional por recurso (ex.: `RadarEntityAccessResolver`) é aplicada a esta rota; um usuário com acesso válido ao workspace vê qualquer `RunEvent` daquele Run, independente de revogação de acesso à entidade do Radar |
| Exposição em eventos transmitidos/logs | `apps/api/src/services/runEvents.ts:79-100`, `recordRunEvent` publica o evento **inteiro** (incluindo `payload`) num stream Redis (`xadd`) quando `RUN_EVENTS_USE_OUTBOX` está ativo, consumido por `runEventStream.ts`/SSE (`/runs/:id/stream`) | Transmissão real, não hipotética, condicionada a uma variável de ambiente | **Superfície de exposição maior que só a linha no Postgres** — qualquer assinante autorizado do canal SSE recebe o `payload` completo em tempo real |
| Exposição em bundles/receipts | `apps/api/src/services/evidenceBundle.ts:45-52`, `apps/api/src/services/runArchiveService.ts:143` — ambos fazem `runEvent.findMany(...)` **sem `select`**, incluindo `payload` inteiro | Inclusão real e confirmada em bundle de evidência e em arquivo de Run | **Nenhuma redação demonstrada** nesses dois pontos — o que for gravado em `payload` sai integralmente nesses artefatos |
| Tamanho/formato do payload | `payload: Json?` no schema; `recordRunEvent` não valida tamanho antes de `.create` | Aceita qualquer JSON válido | **Nenhum limite de tamanho aplicado** — extensão necessária se o Radar decidir usar este campo |
| Conteúdo sensível e controles de acesso | Nenhum mascaramento localizado no caminho de escrita (`recordRunEvent`) nem nos dois pontos de leitura em bundle acima | — | **Lacuna real**, não "disciplina de aplicação": nada no caminho hoje mascara ou reduz o que é gravado em `payload` antes de propagá-lo pelos três canais acima |
| Mutabilidade/exclusão | Busca por `.update`/`.delete` sobre `runEvent` no código-fonte não encontrou nenhuma ocorrência | Comportamento observado é append-only | Ausência de um `@@unique`/trigger que **imponha** imutabilidade — é o padrão observado, não uma garantia do schema em si (diferente do `GuardrailLedger`, que tem trigger dedicado, achado de rodada anterior) |
| Retenção/cascata | FK `ON DELETE RESTRICT` (acima) | Não há exclusão em cascata a partir de `Run` | **Sem política de retenção/expurgo localizada** — mesma pendência já registrada para material/recomendação |
| Escrita atômica com a tentativa | `recordRunEvent` é uma chamada Prisma isolada; não há transação demonstrada envolvendo `RunEvent` + outro modelo neste arquivo | — | **A atomicidade proposta na Atualização 1.12 (gravar `RunEvent` + mudar status da tentativa na mesma transação) não está implementada nem demonstrada — é desenho novo do Radar, a construir** |
| Prevenção de duplicação do evento | Nenhum `@@unique` no modelo `RunEvent` | — | **Não localizado nenhum mecanismo de deduplicação** — uma extensão (constraint dedicada ou disciplina de escrita condicionada) seria necessária para impedir duas gravações do "mesmo" evento de resposta |
| Recuperação pelo trabalhador autorizado | `listRunEvents`/rotas acima exigem tenant/workspace; nenhuma integração com `RadarEntityAccessResolver` localizada | Leitura funciona dentro do escopo tenant/workspace | Um processo de reconciliação do Radar que releia `RunEvent` herda só a autorização de tenant/workspace desse caminho — **não** a autorização de acesso à entidade/material específica, a menos que o próprio serviço do Radar aplique essa checagem por conta própria |

**Conteúdo mínimo recomendado**, corrigindo a suposição anterior de que a resposta bruta
completa precisaria ser preservada: `providerResponseHash` (SHA-256 sobre a serialização
canônica), `provider`/`model`/`requestId`/`traceId` (já devolvidos por `executeLlmStep`) e a
**recomendação candidata já estruturada** (o JSON que seria validado como `RadarRecommendation`,
antes da validação de referências) — nunca o objeto de resposta HTTP bruto do provedor, nunca
uma cópia do material/prompt inteiro (que já está durável e separadamente em `RadarMaterial`).

**Classificação**: **B — adequado somente com extensões explicitamente delimitadas**. Não é A
(há lacunas reais de mascaramento, deduplicação e atomicidade, nenhuma delas resolvida hoje) e
não é C (o modelo existe, é escrito/lido por um único serviço real, e sua propagação por rota,
stream e bundle está comprovada, não hipotética). Extensões indispensáveis antes de usar
`RunEvent` para preservar resposta do provedor: (1) conteúdo mínimo acima, nunca a resposta
bruta; (2) escrita transacional junto com a tentativa — desenho novo do Radar; (3) mecanismo de
deduplicação — constraint nova ou disciplina de escrita condicionada; (4) o serviço de
reconciliação do Radar deve aplicar sua própria checagem de acesso à entidade, não confiar na
autorização (mais grosseira) das rotas genéricas de `RunEvent`.

Distinção preservada: resposta só em memória (cenário C, Atualização 1.12) permanece
irrecuperável — nunca prometo recuperar o que nunca foi gravado; resposta duravelmente
registrada (cenário D) é o caso que este `RunEvent` mínimo endereça; recomendação persistida
(cenário E) já não depende mais do `RunEvent`; resultado desconhecido (cenário B) continua
tratado como falha técnica, nunca como sucesso presumido.

**Superado pela Atualização 1.15**: a recomendação de usar `RunEvent` (com conteúdo mínimo)
como mecanismo de durabilidade foi substituída por campos próprios em `RadarAnalysisAttempt`,
protegidos pela mesma autorização da entidade — ver Atualização 1.15, seção 1. Este registro é
preservado como histórico, não apagado; a classificação B acima e as quatro extensões
indispensáveis continuam válidas caso `RunEvent` volte a ser considerado no futuro.

### 3. Transcrição final dos contratos propostos

**`RadarAnalysisRequest`** — `contractVersion: "radar-analysis-request.v1"`.

| Campo | Tipo | Obrigatório | Origem | Limite/validação | Mutabilidade | Idempotência |
|---|---|---|---|---|---|---|
| `entityId` | string | sim | corpo, validado contra `RadarKnownEntity` | FK composta | imutável | sim |
| `materialId` | string | sim | corpo, validado contra `RadarMaterial` (mesma entidade) | FK composta | imutável | sim |
| `objective` | string | sim | corpo | 1–2.000 bytes UTF-8; preservado exatamente (sem trim/normalização); rejeita vazio e só-espaços; rejeita NUL e surrogate isolado | imutável | sim |
| `additionalContext` | string | não | corpo | quando presente, 1–8.000 bytes UTF-8, mesmas rejeições de `objective`; **ausência (campo omitido) e `null` são equivalentes** ("sem contexto adicional"); **string vazia é rejeitada**, nunca tratada como ausência | imutável | sim |
| `requestedByUserId` | string | sim | contexto confiável, nunca do corpo | — | imutável | sim |
| `tenantId`/`workspaceId` | string | sim | contexto confiável | — | imutável | escopo da chave, não campo comparado |
| `operationKey` | string | sim | corpo | 1–128 bytes UTF-8, convenção de `RadarMaterial` | imutável | é a chave de agrupamento |

Identidade completa comparada no reenvio (mesma `operationKey`): `{entityId, materialId,
objective, additionalContext, requestedByUserId}` — idêntica recupera; qualquer campo
divergente conflita (mesma disciplina de `RadarMaterial`, Atualização 1.9).

**`RadarAnalysisAttempt`** — `contractVersion: "radar-analysis-attempt.v1"`.

Estados: `pending`, `running`, `provider_responded_pending_persistence`, `completed`, `failed`,
`cancelled`. Transições e guardas: exatamente as descritas na Atualização 1.12, seção C
(diagrama e seis guardas), sem alteração nesta rodada.

| Campo | Tipo | Obrigatório | Origem | Limite/validação | Mutabilidade | Idempotência |
|---|---|---|---|---|---|---|
| `analysisRequestId` | string | sim | servidor | FK composta | imutável | não se aplica (não é comparado; segue a solicitação) |
| `attemptNumber` | int | sim | servidor | incremental por solicitação, a partir de 1 | imutável | não |
| `status` | enum (acima) | sim | servidor/executor | ver máquina de estados | mutável só por transição condicionada | não |
| `claimedByWorkerId`/`claimToken` | string | não até a claim | executor | gerado na claim | mutável só por nova claim válida | não |
| `runId` | string | não (nulo até execução real) | servidor, ao publicar o Run | FK composta quando presente | write-once quando preenchido | não |
| `generationConfig` | json | sim | servidor, cópia da política vigente no instante da tentativa | conteúdo exato **a definir** | imutável por tentativa | não é comparada, é auditoria |
| `cancelRequestedAt` | timestamp | não | usuário/operação | — | write-once | não |
| `failureReasonCode` | string | não | executor | catálogo **a definir** | imutável quando preenchido | não |

**`RadarRecommendation`** — `contractVersion: "radar-recommendation.v1"`.

`recommendationType`: `actionable | insufficient_evidence | do_not_act` — três valores, todos
resultados válidos, nenhum equivalente a falha técnica.
`statements[].natureza`: `FACT_IN_MATERIAL | INFERENCE | HYPOTHESIS | UNKNOWN` — natureza da
afirmação em relação ao material, nunca promovida a fato do mundo real.
`statements[].confidenceLevel` (opcional): `low | medium | high` — dimensão **separada** de
`natureza`, nunca fundida com ela.

| Campo | Tipo | Obrigatório | Origem | Limite/validação | Mutabilidade | Idempotência |
|---|---|---|---|---|---|---|
| `attemptId` | string | sim | servidor | único (relação 1:1) | imutável | é a chave da unicidade 1:1 |
| `recommendationType` | enum (acima) | sim | resultado da análise | os três valores acima | imutável | não |
| `summary` | string | sim | resultado da análise | limite **a definir** | imutável | não |
| `statements[]` | array | sim | resultado da análise | cada item com `content`, `natureza`, `referenceIds[]` | imutável | não |
| `references[]` | array | sim quando citada por `statements` | resultado da análise | **validação determinística de localização/estrutura** contra o material/contexto — comprova que o trecho existe, **não comprova veracidade nem sustentação semântica completa** da conclusão | imutável | não |
| `limitations` | string | não | resultado da análise | — | imutável | não |
| `suggestedAction` | string | só quando `actionable` | resultado da análise | — | imutável | não |
| `insufficientEvidenceReason` | string | só quando `insufficient_evidence` | resultado da análise | — | imutável | não |
| `doNotActReason` | string | só quando `do_not_act` | resultado da análise | — | imutável | não |
| `provenance` | json | sim | valores reais de `executeLlmStep` (`provider`/`model`/`traceId`/`requestId`) | nunca inventado | imutável | não |

**Reconfirmações**, sem mudança de conteúdo: reenvio idêntico de `RadarAnalysisRequest` recupera
o registro original, nunca reconstruído com template novo; qualquer campo da identidade
divergente gera conflito; nova análise intencional exige `operationKey` nova e autorização de
consumo própria; mudança futura em `generationConfig`/template não altera uma solicitação já
existente; recuperar uma `RadarRecommendation` é leitura autorizada (mesmo padrão de
`getRadarMaterial`), sem consumo de modelo e sem criar tentativa. `FINGERPRINT_CONTRACT_VERSION`/
`computeRequestFingerprint` do SignalForward não são tocados nem reaproveitados — `operationKey`
do Radar continua sua própria chave, estabelecida desde a Atualização 1.9.

### 4. Pacote único para aprovação

| Decisão | Valor recomendado | Fundamentação | Limite |
|---|---|---|---|
| Retries | Desabilitados no serviço do Radar (nenhuma nova tentativa automática); fila/executor reais ficam fora do pacote A | Nenhuma camada isolada elimina os retries do executor sem estender `completionEngine.ts` — evidenciado na seção 1 | Ativação futura exige decisão própria sobre `{attempts:1}` e sobre estender ou não o executor |
| Durabilidade da resposta | `RunEvent` com conteúdo mínimo (hash + provenance + recomendação candidata), nunca a resposta bruta | Tabela da seção 2 — classificação B | Requer escrita transacional e deduplicação ainda não construídas |
| Concorrência de tentativa | `claimToken` + índice único parcial (`WHERE status IN ('pending','running')`) | Escrita condicionada já comprovada em `radarKnownEntityService.ts`; `WorkerOwnershipLease` permanece só otimização de processo, não a garantia | Índice parcial é decisão de migration futura, não resolvida agora |
| Contratos | Valores exatos da seção 3 (três `contractVersion`, seis estados, três `recommendationType`, quatro `natureza`, três `confidenceLevel`) | Consolidação sem contradição entre Atualizações 1.11–1.14 | Nenhum destes valores está ratificado como política de produto — são a proposta única a aprovar |

**PACOTE A — implementação local candidata**: os três contratos (seção 3), persistência com as
constraints descritas (Atualização 1.12, seção D, mais o índice parcial e a deduplicação de
`RunEvent` como decisões técnicas de migration), serviços correspondentes, executor/provedor
substituídos por duplo controlado, PostgreSQL descartável, sem acesso por cliente real, retries
desabilitados no serviço conforme a seção 1. Testes de aceite: todos os já listados na
Atualização 1.12, seção E, mais a verificação de que nenhuma tentativa nova é criada
automaticamente após falha.

**ATIVAÇÃO FUTURA — fora desta aprovação**: resolvedor real de acesso; provisionamento do
agente de análise; decisão sobre `{attempts:1}` no `publishRun` real e sobre estender
`completionEngine.ts` para override de retry por chamada; consumo real e seus limites; fila
operacional real; acesso por clientes reais; toda a frente Instagram.

### Classificação desta atualização

- **Confirmado por releitura/código**: retries em três camadas distintas, com evidência de
  arquivo/linha para cada uma; sete aspectos de `RunEvent` com evidência real de escrita,
  leitura, transmissão e exportação.
- **Corrigido**: a política de retries (janela de 60s retirada, marcada como superada, não
  apagada); o uso de `RunEvent` deixa de ser tratado como resolvido e passa a ter extensões
  explícitas.
- **Proposta técnica**: conteúdo mínimo do `RunEvent`, os valores finais dos três contratos.
- **Dependência**: escrita transacional `RunEvent`+tentativa; deduplicação de `RunEvent`;
  índice único parcial; decisão futura sobre `completionEngine.ts`.
- **Autorização ainda não concedida**: qualquer chamada real a modelo; provisionamento do
  agente; consumo; fila operacional real; Instagram.

A unidade entidade/material permanece com a limitação já registrada na Atualização 1.11
("fechamento não comprovado pelas evidências disponíveis") — não repetida nem reaberta aqui.

### Texto de autorização sugerida (proposta ao usuário — não concedida nesta rodada)

"Autorizo a implementação local do pacote A do Radar Social — contratos
`RadarAnalysisRequest`/`RadarAnalysisAttempt`/`RadarRecommendation` com os valores da seção 3
desta atualização, persistência com `claimToken`/índice único parcial, `RunEvent` de conteúdo
mínimo para durabilidade, serviços correspondentes e testes com executor/provedor substitutos
controlados contra PostgreSQL descartável — sem qualquer chamada real a modelo, fila operacional,
provisionamento de agente ou acesso por cliente real, que continuam como decisão separada e
posterior."

### Próximo passo

Decisão humana sobre este texto de autorização. Sem essa decisão, nenhuma implementação está
autorizada.

## Atualização 1.15 — decisão de armazenamento e fechamento documental do pacote A (16/09/2026)

Fonte: leitura focalizada de código e releitura da Atualização 1.14 nesta sessão (worktree
`EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`, HEAD
ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Substitui a
recomendação de `RunEvent` da Atualização 1.14 por armazenamento próprio do Radar. Nenhuma
implementação foi feita. Os três contratos continuam propostas.

### 1. Decisão de armazenamento — campos na própria tentativa, não uma tabela nova, não `RunEvent`

**Recomendação única**: preservar o resultado durável como **campos em `RadarAnalysisAttempt`**,
não uma tabela associada nova, não `RunEvent`.

Justificativa, não preferência: (1) há precedente direto e já implementado neste mesmo
repositório — `HumanConfirmation.confirmedPayloadSnapshot` (D6, `packages/db/prisma/schema.prisma`)
já armazena exatamente esse tipo de "retrato final de conteúdo" como campo `Json?` no próprio
registro de controle, não em tabela separada; (2) a autorização de leitura do resultado
preservado é a MESMA autorização já exigida para ler a tentativa/entidade — uma tabela nova não
eliminaria a necessidade de repetir essa checagem, só adicionaria uma junção; (3) a atomicidade
fica mais simples: uma única linha, uma única instrução condicionada, sem transação
multi-tabela para o passo de preservação. `RunEvent` foi descartado por motivo diferente e já
demonstrado na Atualização 1.14: sua autorização de leitura é por tenant/workspace, mais grossa
que a autorização por entidade que o Radar exige, e sua propagação por SSE/bundle/arquivo não
tem redução demonstrada — não é possível "proteger pela autorização da entidade" um mecanismo
cuja leitura nem passa por essa autorização.

**Campos propostos em `RadarAnalysisAttempt`** (adicionais aos já descritos na Atualização 1.14):

| Campo | Conteúdo |
|---|---|
| `preservedResultPayload` | JSON do **resultado estruturado intermediário** — o candidato a `RadarRecommendation` (mesma forma de `recommendationType`/`summary`/`statements`/`references`), **antes** da validação de referências |
| `preservedResultHash` | SHA-256 sobre a serialização canônica do payload acima |
| `preservedResultVersion` | literal `"radar-analysis-preserved-result.v1"` (proposto) |
| `preservedResultProvider`/`preservedResultModel`/`preservedResultProviderRequestId` | proveniência real, devolvida por `executeLlmStep` — nunca inventada |
| `preservedAt` | timestamp do servidor, gravado junto com o payload |

**Diferença entre os três estágios, e qual precisa ser preservado**: resposta bruta (o objeto
de resposta HTTP do provedor) **não precisa** ser preservada — carrega ruído específico do
provedor e nada que a conclusão exija além do que já está no resultado estruturado. Resultado
estruturado intermediário (o candidato acima) **é o que precisa ser preservado** para concluir
sem nova chamada ao provedor — é o que os passos seguintes validam e persistem. Recomendação
validada (`RadarRecommendation`) é o produto final, criada só depois de a validação de
referências (Atualização 1.14) passar.

**Conteúdo mínimo**: só o candidato estruturado + proveniência + hash — nunca o material, nunca
o `objective`/`additionalContext` (já duráveis e separados em `RadarAnalysisRequest`), nunca a
resposta HTTP bruta.

**Formato/versão**: JSON, `preservedResultVersion` próprio, independente do `contractVersion` de
`RadarRecommendation` (podem evoluir em ritmos diferentes).

**Limite de tamanho recomendado**: 32.768 bytes UTF-8 — proposta, não decidida; maior que o
teto de `RadarMaterial.conteudo` (16.384) porque inclui conteúdo gerado além do material em si.

**Vínculo**: nenhuma FK nova — já é a própria linha de `RadarAnalysisAttempt`, que já referencia
`RadarAnalysisRequest` (entidade/material/tenant/workspace transitivos).

**Autoria técnica e proveniência**: `claimedByWorkerId` (já existente) identifica o processo que
gravou; `preservedResultProvider`/`preservedResultModel`/`preservedResultProviderRequestId`
identificam a chamada real que produziu o conteúdo.

**Acesso**: usuários finais **não leem `preservedResultPayload` diretamente** — é conteúdo
interno, não validado, usado só pelo processo de conclusão/reconciliação (mesmo limite de
confiança do executor). Só a `RadarRecommendation` final, já validada, é exposta pela operação
de leitura autorizada de usuário (mesmo padrão de `getRadarMaterial`). O executor/reconciliação
lê `preservedResultPayload` sob a mesma autorização de acesso à entidade já exigida para
qualquer leitura da tentativa.

**Mutabilidade**: write-once — gravado uma única vez (passo 2 da seção 2), nunca reescrito.

**Retenção/exclusão**: proposta (não ratificada) — limpar (`null`) `preservedResultPayload`
depois que a `RadarRecommendation` correspondente for persistida com sucesso, reduzindo a
janela de retenção de conteúdo ainda não validado. Retenção do que resta (hash, proveniência)
segue a mesma pendência geral de política já registrada para material/recomendação.

**Comportamento quando o conteúdo não pode ser preservado**: se a escrita do passo 2 falhar
antes de completar, a tentativa permanece em `running` (nenhum estado intermediário
"meio-escrito" — a escrita é uma única instrução condicionada) — cenário B/C, tratado como falha
técnica, sem promessa de recuperação.

### 2. Escrita durável, posse e recuperação

Sequência confirmada, sem alterar a ordem já proposta: **receber resposta → preservar resultado
durável → validar/concluir recomendação → persistir conclusão**.

| Passo | Transação/registros | Condição de escrita | Estado anterior → posterior | Verificação de `claimToken` | Comportamento após falha |
|---|---|---|---|---|---|
| 1. Receber resposta | Nenhum (memória do processo) | N/A | `running` → `running` (sem persistência) | Não se aplica (nada é escrito) | Cenário B/C — tratado na próxima etapa |
| 2. Preservar resultado durável | Uma escrita condicionada em `RadarAnalysisAttempt` | `UPDATE ... SET status='provider_responded_pending_persistence', preservedResultPayload=$1, preservedResultHash=$2, preservedAt=now() WHERE id=$attemptId AND claimToken=$meuToken AND status='running'` | `running` (mesmo `claimToken`) → `provider_responded_pending_persistence` | **Sim** — condição central; 0 linhas afetadas se outro executor já reivindicou | A linha permanece no estado anterior (`running`) — instrução única, sem meio-termo |
| 3. Validar/concluir recomendação | Leitura de `preservedResultPayload` + `RadarMaterial.conteudo`/`additionalContext` | Exige autorização vigente para ler a tentativa/entidade; validação em si é pura, sem efeito colateral, repetível quantas vezes for preciso | Sem mudança de estado ainda | Não se aplica aqui (só na escrita do passo 4) | Referência inválida ou saída fora do contrato → decisão de falha técnica aplicada no passo 4 |
| 4. Persistir conclusão | Uma transação: cria `RadarRecommendation` (se válida) + `UPDATE RadarAnalysisAttempt SET status='completed'` (ou `'failed'`) | `WHERE id=$attemptId AND claimToken=$meuToken AND status='provider_responded_pending_persistence'` | `provider_responded_pending_persistence` → `completed`/`failed` | **Sim**, mesma condição central | 0 linhas afetadas → toda a transação é descartada (`ROLLBACK`), nenhuma `RadarRecommendation` órfã |

**Garantias do desenho, explícitas**: trabalhador antigo não sobrescreve nem conclui — as duas
escritas condicionadas (passos 2 e 4) exigem o `claimToken` exato; posse e escrita são
atomicamente condicionadas — cada uma é uma única instrução SQL, não duas operações separadas;
repetição da persistência não duplica — uma segunda tentativa do passo 4 encontra `status`
já diferente de `provider_responded_pending_persistence` e não escreve nada, a leitura simples
da recomendação já existente é o caminho de recuperação; recuperação de resultado durável
(passos 3+4 refeitos) nunca chama o provedor; recuperação não cria tentativa nova em nenhum dos
quatro passos.

**Retomada sem reutilizar posse do trabalhador anterior**: se `provider_responded_pending_persistence`
persiste além do TTL do lease (indício de que o executor original morreu entre os passos 2 e
4), a reconciliação emite uma **nova claim** —
`UPDATE ... SET claimToken=novoToken, claimedByWorkerId=novoWorker WHERE id=X AND status='provider_responded_pending_persistence' AND claimedAt < now() - TTL` —
antes de refazer os passos 3 e 4. O trabalhador antigo, se "acordar" depois, tenta o passo 4 com
o token velho e encontra 0 linhas — nunca reaproveita a posse alheia.

**A. Resposta preservada**: conclusão retomável (passos 3+4) sem novo consumo — por qualquer
trabalhador, o mesmo ou um novo via reclaim. **B. Resposta nunca gravada**: resultado permanece
desconhecido; não prometo recuperação; nova chamada é consumo novo, com autorização própria
revalidada do zero (mesma disciplina da Atualização 1.14, seção 1). Sem exactly-once. Retries
automáticos continuam desabilitados como proposta do pacote A (Atualização 1.14, seção 1),
inalterado aqui.

### 3. `RunEvent` — avaliado e não recomendado para o pacote A

Avaliado apenas como referência opaca (`attemptId`, sem conteúdo). Mesmo nesse formato mínimo:
o **tipo do evento** por si só (`"radar.analysis.attempt.provider_responded"` ou equivalente)
já revelaria, a qualquer leitor com acesso de tenant/workspace ao Run — via `/runs/:id/events`,
`/runs/:id/stream` ou os bundles/arquivos já demonstrados na Atualização 1.14 — que uma análise
do Radar está associada àquele Run, sem que esse leitor precise passar pela autorização de
entidade do Radar. Incluir `entityId` no payload pioraria isso ao identificar qual entidade;
por isso a avaliação já parte de **não incluir `entityId`**, e mesmo assim a existência da
atividade fica visível pela rota genérica. A referência (`attemptId`) sozinha não permite
recuperar conteúdo sem passar pela autorização do Radar — mas a **existência** da análise, sim.

**Recomendação**: não emitir este evento no pacote A. O mecanismo de recuperação desenhado na
seção 2 não depende de `RunEvent` — os campos em `RadarAnalysisAttempt` já bastam. Emitir um
evento sem necessidade funcional demonstrada, aceitando um vazamento de existência ainda que
mínimo, não se justifica nesta unidade. Não altero nenhum consumidor de eventos existente. Se
uma necessidade real de observabilidade for demonstrada depois (por exemplo, mostrar progresso
ao usuário), essa decisão pode ser revisitada como proposta própria, separada desta.

### 4. Quadro final dos contratos — só as mudanças em relação à Atualização 1.14

`RadarAnalysisRequest` e `RadarRecommendation`: **sem mudança** em relação à Atualização 1.14,
seção 3 — valores, campos e `contractVersion` permanecem exatamente os já transcritos lá.

`RadarAnalysisAttempt` — `contractVersion: "radar-analysis-attempt.v1"` (inalterado), estados
`pending|running|provider_responded_pending_persistence|completed|failed|cancelled`
(inalterados). Campos **adicionados** nesta atualização:

| Campo | Tipo | Obrigatório | Origem | Limite/validação | Mutabilidade | Idempotência |
|---|---|---|---|---|---|---|
| `preservedResultPayload` | json | não até o passo 2 | executor, a partir da resposta do provedor | 32.768 bytes UTF-8 (proposto) | write-once | não |
| `preservedResultHash` | string | junto com o payload acima | servidor, calculado | SHA-256 hex | write-once | não |
| `preservedResultVersion` | string literal | junto com o payload acima | servidor | `"radar-analysis-preserved-result.v1"` (proposto) | write-once | não |
| `preservedResultProvider`/`preservedResultModel`/`preservedResultProviderRequestId` | string | junto com o payload acima | valores reais de `executeLlmStep` | nunca inventados | write-once | não |
| `preservedAt` | timestamp | junto com o payload acima | servidor | — | write-once | não |

Nenhum destes nomes/limites está ratificado — propostas desta atualização.

**Reconfirmações**, sem mudança de conteúdo: o material analisado permanece o `materialId`
original referenciado, imutável mesmo após correção (Atualização 1.11); reenvio idêntico de
`RadarAnalysisRequest` recupera o registro original; divergência em qualquer campo da
identidade gera conflito; nova análise intencional exige `operationKey` nova e autorização de
consumo própria, distinta de recuperação; autorização vigente (resolvedor revalidado) é
necessária para consultar tanto `preservedResultPayload` (interno) quanto `RadarRecommendation`
(usuário); referências estruturalmente válidas comprovam só localização no material, nunca a
veracidade ou a sustentação semântica completa da conclusão (Atualização 1.12).

### 5. Alterações futuras e testes de aceite

Arquivos/modelos que esta escolha exigiria, quando autorizada — nenhum criado nesta rodada:
`radarAnalysisAttemptContract.ts`/`radarAnalysisAttemptService.ts` (já candidatos desde a
Atualização 1.12, sem arquivo novo adicional só por esta decisão), campos novos no modelo
`RadarAnalysisAttempt` (ainda inexistente — os três contratos completos, `RadarAnalysisRequest`/
`RadarAnalysisAttempt`/`RadarRecommendation`, seguem propostas). Constraint proposta adicional:
possível `CHECK` garantindo que `preservedResultPayload`/`preservedResultHash`/`preservedAt`
sejam preenchidos juntos ou nenhum — decisão técnica de migration futura, não resolvida agora.

Testes de aceite propostos, todos contra PostgreSQL descartável com executor/provedor
substitutos controlados — nenhum depende de integração real:
- leitura autorizada de `preservedResultPayload` e de `RadarRecommendation`, e bloqueio após
  revogação de acesso à entidade;
- isolamento entre tenants/workspaces (mesma técnica já usada em `radarMaterialService`);
- ausência de conteúdo do Radar em `evidenceBundle`/`runArchiveService`/rotas genéricas de
  `RunEvent`, precisamente porque nenhum evento é emitido nesta unidade;
- escrita rejeitada de trabalhador antigo, tanto no passo 2 quanto no passo 4 (dois casos
  distintos);
- gravação concorrente do passo 2 (duas claims disputando `running`, só uma preserva);
- queda simulada entre os passos 2 e 4 — reconciliação retoma a partir de
  `provider_responded_pending_persistence` sem nova chamada ao substituto de provedor;
- conclusão retomada sem chamada ao provedor — asserção direta de que o substituto do executor
  não é invocado de novo durante a retomada;
- resposta não preservada (falha simulada antes do passo 2 completar) permanecendo ambígua —
  nunca promovida a sucesso;
- recuperação idempotente de `RadarAnalysisRequest` sem criar tentativa nova nem invocar o
  substituto do executor.

Garantias que dependerão de integração real, não testáveis com substituto controlado — mesma
lista já registrada na Atualização 1.14, inalterada: comportamento do `WorkerOwnershipLease`
sob Redis real; idempotência própria do provedor (se houver); janela real de latência de fila.

### Quadro final

| Decisão | Recomendação | Fundamentação | Dependência | Status de aprovação |
|---|---|---|---|---|
| Armazenamento do resultado durável | Campos em `RadarAnalysisAttempt` | Precedente direto (`HumanConfirmation.confirmedPayloadSnapshot`); autorização já exigida coincide; atomicidade de uma linha só | Nenhuma nova FK; possível `CHECK` de preenchimento conjunto | Proposta, não aprovada |
| `RunEvent` | Não emitir no pacote A | Vaza existência da análise por uma autorização mais grossa que a do Radar, sem necessidade funcional demonstrada | Nenhuma — reversível se necessidade real surgir depois | Proposta, não aprovada |
| Retries | Desabilitados no serviço do Radar | Executor global não aceita override por chamada (Atualização 1.14) | `completionEngine.ts` fica fora desta unidade | Proposta, não aprovada |
| Contratos (três) | Valores da Atualização 1.14 seção 3 + campos novos da seção 4 desta atualização | Consolidação sem contradição entre 1.11–1.15 | Nenhuma | Proposta, não aprovada |
| Concorrência de tentativa | `claimToken` + índice único parcial | Escrita condicionada já comprovada no código real | Índice parcial é migration futura, não resolvida | Proposta, não aprovada |

**PACOTE A — completo e delimitado**: os três contratos (`RadarAnalysisRequest`,
`RadarAnalysisAttempt` com os campos de preservação desta atualização, `RadarRecommendation`),
persistência com `claimToken`/índice único parcial, serviços correspondentes,
executor/provedor substituídos por duplo controlado, PostgreSQL descartável, sem `RunEvent`,
sem acesso por cliente real, retries desabilitados no serviço. Testes de aceite: os listados na
seção 5 acima, mais os já registrados na Atualização 1.12, seção E.

**Fora desta aprovação**: resolvedor real de acesso; provisionamento do agente de análise; fila
operacional real; chamadas reais a modelo; consumo real; acesso por clientes reais; toda a
frente Instagram.

**Decisão indispensável ainda faltante, nomeada em vez de escondida**: o limite de tamanho de
`preservedResultPayload` (32.768 bytes, proposto) e o conteúdo exato de `generationConfig`
(Atualização 1.12) seguem sem valor final ratificado — a aprovação do pacote A pode prosseguir
tratando-os como parâmetros a fechar durante a implementação, mas isso deve ser dito
explicitamente, não presumido resolvido.

### Texto de autorização sugerida (proposta ao usuário — não concedida nesta rodada)

"Autorizo a implementação local do pacote A do Radar Social — contratos
`RadarAnalysisRequest`/`RadarAnalysisAttempt` (incluindo os campos de preservação durável desta
atualização)/`RadarRecommendation`, persistência com `claimToken`/índice único parcial, sem
`RunEvent`, serviços correspondentes, e testes com executor/provedor substitutos controlados
contra PostgreSQL descartável — sem qualquer chamada real a modelo, fila operacional,
provisionamento de agente ou acesso por cliente real, que continuam como decisão separada e
posterior. Os limites numéricos ainda não ratificados (tamanho de `preservedResultPayload` e
conteúdo de `generationConfig`) ficam para fechamento durante a implementação, sob os mesmos
princípios já registrados neste plano."

### Próximo passo

Decisão humana sobre este texto de autorização. Sem essa decisão, nenhuma implementação está
autorizada.

**Superado parcialmente pela Atualização 1.16**: o texto de autorização sugerida acima é
substituído pelo texto equivalente e mais completo da Atualização 1.16 (que já incorpora
`generationConfig`, a regra de tamanho e o protocolo de posse/expiração). Este registro é
preservado como histórico, não apagado.

## Atualização 1.16 — generationConfig, regra de tamanho e posse/expiração (17/09/2026)

Fonte: leitura focalizada da Atualização 1.15 efetivamente gravada, nesta sessão (worktree
`EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`, HEAD
ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Completa três pontos
pendentes da Atualização 1.15. A escolha de preservar o resultado intermediário em campos da
própria `RadarAnalysisAttempt` **não é reaberta** — permanece a proposta vigente. `RunEvent`
permanece fora do pacote A. Nenhuma implementação foi feita.

### 1. Quadro final de `generationConfig`

`generationConfig` representa só a **configuração solicitada**, fixada uma única vez na
criação de cada `RadarAnalysisAttempt` — nunca reescrita depois, mesmo que a política vigente
mude para tentativas futuras. A **configuração efetivamente utilizada** (proveniência real) já
tem campos próprios definidos na Atualização 1.15 (`preservedResultProvider`/
`preservedResultModel`/`preservedResultProviderRequestId`) — `generationConfig` não duplica
nem antecipa esses valores; eles só existem depois que o executor responde.

Lista fechada de campos — nenhum outro é aceito:

| Campo | Tipo | Obrigatório | Limite/validação | Origem | Momento de fixação |
|---|---|---|---|---|---|
| `contractVersion` | string literal | sim | `"radar-analysis-generation-config.v1"` (proposto) | servidor | criação da tentativa |
| `requestedModel` | string | sim | valor pertencente ao catálogo de modelos suportados pelo perfil do agente — catálogo **a definir** fora desta unidade | servidor, a partir do perfil do agente de análise vigente no momento | criação da tentativa |
| `requestedMaxTokens` | int | não | quando presente, inteiro positivo, teto **a definir** | servidor, a partir da política vigente | criação da tentativa |
| `promptTemplateVersion` | string | sim | identificador de versão do template de análise — **nunca o texto do template em si** | servidor | criação da tentativa |
| `knowledgePolicySnapshot` | objeto fechado `{llmUsageMode, provenancePolicy, maskingPolicy}` | sim | os três subcampos usam exatamente os enums já existentes em `AgentKnowledgePolicy` (`packages/core/src/actions/agents/types.ts`) | servidor, cópia do `knowledgePolicy` do perfil do agente no momento da criação | criação da tentativa |

**Campos desconhecidos**: rejeitados — validação de chaves fechada, mesma técnica de
`assertKnownKeys` já usada em `radarSignalResultValidator.ts` (D5) e nos contratos de
entidade/material. **Não aceito JSON arbitrário.** Nenhum campo de credencial, token, endpoint
ou cópia de material é admitido nesta lista — nenhum dos cinco campos acima comporta esse tipo
de valor por construção.

**Ausência e `null`**: para `requestedMaxTokens` (único campo opcional), ausência e `null` são
equivalentes — "usar o default do executor/provedor", nunca um valor a inventar aqui.
**Defaults explícitos**: nenhum default é definido nesta unidade para `requestedModel`/
`promptTemplateVersion`/`knowledgePolicySnapshot` — são obrigatórios, sem fallback silencioso.
**Configuração incompatível/não suportada**: rejeitada na **criação da tentativa**, antes de
qualquer claim ou chamada — um `requestedModel` fora do catálogo suportado impede a tentativa
de nascer, nunca chega a falhar durante a execução.

**Influência na idempotência**: nenhuma. `generationConfig` não participa da identidade
comparada de `RadarAnalysisRequest` (Atualização 1.11) nem de qualquer comparação entre
tentativas — tentativas são sequenciais, não comparadas por identidade (Atualização 1.14).
Mudar a política vigente afeta só tentativas **futuras**; a cópia gravada em cada tentativa já
criada não muda retroativamente — é assim que "mudanças futuras de template não alteram
silenciosamente solicitações anteriores" fica garantido: cada tentativa carrega sua própria
cópia congelada, não uma referência à política atual.

**Pacote A**: `requestedModel`/`knowledgePolicySnapshot` são preenchidos a partir de um perfil
de agente **substituto de teste**, nunca um provedor real — identificado explicitamente como tal
em qualquer fixture usada nos testes de aceite.

Valores acima são recomendação para decisão humana — nenhum está ratificado como política de
produto.

### 2. Regra exata de tamanho do resultado durável

**Objeto medido**: exclusivamente a serialização canônica de `preservedResultPayload` — o
candidato estruturado (`recommendationType`, `summary`, `statements[]`, `references[]` e demais
campos previstos para `RadarRecommendation`, antes da validação de referências). **Não entram
na contagem**: `preservedResultHash`, `preservedResultVersion`,
`preservedResultProvider`/`preservedResultModel`/`preservedResultProviderRequestId`,
`preservedAt` — são colunas próprias, fora do JSON medido, exatamente para que o hash não meça
a si mesmo. **Escopo do hash, para evitar definição circular**: `preservedResultHash` é o
SHA-256 sobre a mesma serialização canônica usada para medir o tamanho de
`preservedResultPayload` — nunca sobre a linha inteira da tentativa, nunca incluindo o próprio
valor do hash.

**Serialização utilizada**: mesma técnica já usada em `radarSignalResultValidator.ts` (D5) —
`Buffer.byteLength(JSON.stringify(valor), "utf8")` sobre o valor já validado estruturalmente,
medido **por último**. Para o cálculo do hash (não do tamanho), as chaves de objeto são
ordenadas deterministicamente antes de serializar (mesma técnica de `stableStringify` em
`originContract.ts`) — a ordenação de chaves é só para a estabilidade do hash; a ordem de
elementos dentro de arrays (`statements[]`, `references[]`) é sempre preservada exatamente como
recebida, nunca reordenada. A contagem do limite de tamanho usa a serialização **como recebida**
(sem reordenar chaves), porque o que precisa caber no limite é o payload que será de fato
armazenado, não uma forma canônica alternativa.

**Unicode/escapes**: a contagem é sobre os **bytes UTF-8 da string JSON já serializada**,
incluindo os caracteres de escape que o `JSON.stringify` produzir — não sobre a contagem de
caracteres/code points do conteúdo original. Um caractere multibyte (ex.: "á", 2 bytes UTF-8)
conta 2 bytes; um caractere que exige escape na serialização (ex.: aspas internas) conta os
bytes da sequência de escape, não do caractere isolado.

**Momento da validação**: imediatamente após o executor devolver o candidato estruturado, antes
de qualquer tentativa de escrita (antes do "passo 2" da Atualização 1.15 — preservar resultado
durável). Se o limite for excedido: a escrita condicionada do passo 2 **nunca é tentada** —
`preservedResultPayload` não é gravado, não é truncado, não é gravado parcialmente. A tentativa
é marcada `failed` com `failureReasonCode: preserved_result_exceeds_size_limit`, sem repetir a
chamada ao provedor automaticamente (mesma disciplina já estabelecida — nova chamada exige nova
autorização, nunca automática). O erro registrado não inclui o conteúdo do payload rejeitado
nem trechos dele — só o tamanho medido e o limite, para não expor conteúdo sensível em log.

**Limite do resultado estruturado vs. limite da resposta de rede**: são coisas diferentes. Esta
regra só bound `preservedResultPayload`, medido **depois** que o executor já recebeu e
interpretou a resposta HTTP bruta do provedor — não impõe nenhum limite sobre o tamanho dessa
resposta bruta em si, que é uma preocupação de rede/timeout separada (`LLM_TIMEOUT_MS`,
Atualização 1.14) e não coberta por esta regra. Não afirmo que este limite, sozinho, protege
toda a recepção futura de uma resposta do provedor.

**Não altero nem reaproveito** `FINGERPRINT_CONTRACT_VERSION`/`computeRequestFingerprint` do
SignalForward nesta regra de tamanho — é um cálculo próprio do Radar, independente.

**Fixtures documentais reproduzíveis (não executadas nesta rodada)**:
- **Exatamente no limite**: um `preservedResultPayload` cuja serialização canônica, medida em
  `Buffer.byteLength(JSON.stringify(valor), "utf8")`, resulta em exatamente 32.768 bytes (por
  exemplo, um `summary` preenchido com caracteres ASCII até completar esse total, com os demais
  campos obrigatórios mínimos válidos) — aceito, gravado.
- **Um byte acima do limite**: o mesmo objeto do exemplo anterior com um caractere ASCII a mais
  — 32.769 bytes — rejeitado; tentativa marcada `failed`, nenhuma escrita parcial.
- **Conteúdo multibyte**: um `statements[].content` contendo caracteres acentuados/emoji, para
  demonstrar que a contagem é em bytes UTF-8 da forma serializada — por exemplo, substituir 100
  caracteres ASCII por 100 ocorrências de "á" (2 bytes cada) aumenta o total medido em 100 bytes,
  não em 0.

### 3. Posse, expiração e retomada

Garantia única adotada, conforme a recomendação avaliada: **toda escrita condicionada
(`RadarAnalysisAttempt`, passos 2 e 4 da Atualização 1.15) exige `claimToken` vigente, estado
esperado **e** prazo de posse ainda válido, os três verificados atomicamente na mesma instrução
SQL** — `UPDATE ... WHERE id=$attemptId AND claimToken=$meuToken AND status=$estadoEsperado AND
claimedAt > now() - INTERVAL '$leaseTtl'`.

**Relógio autoritativo**: o relógio do próprio PostgreSQL (`now()`/`clock_timestamp()`), nunca o
relógio do processo executor — mesmo princípio já usado em D6
(`humanConfirmationContract.ts`/`computeExpiresAt`, e o auxiliar de teste
`backdateConfirmationWindowExpiry` que manipula `clock_timestamp()` diretamente no banco).

**Comportamento no instante exato da expiração**: a condição `claimedAt > now() - INTERVAL
'$leaseTtl'` é avaliada atomicamente pelo Postgres no momento exato da instrução — não existe
janela intermediária em que a escrita esteja "parcialmente" válida; no instante em que o prazo
vence, **qualquer** tentativa de escrita com aquele `claimToken` (inclusive do próprio detentor
original, se ele só estiver atrasado, não morto) passa a falhar, sem exceção para "boa fé".

**Aquisição concorrente de nova posse**: reconciliação emite `UPDATE ... SET
claimToken=novoToken, claimedByWorkerId=novoWorker, claimedAt=now() WHERE id=X AND
status=$estadoAtual AND claimedAt <= now() - INTERVAL '$leaseTtl'` — condicionada e atômica; se
duas reconciliações competem, só uma altera a linha (contagem de linhas afetadas decide).

**Rejeição do trabalhador anterior**: dupla garantia — se já houve reclaim, o `claimToken`
antigo não bate mais; mesmo sem reclaim, a condição de prazo por si só já rejeita a escrita no
instante da expiração.

**Renovação de posse**: **não introduzida nesta unidade** — o pacote A usa executor/provedor
substitutos controlados, sem chamadas de longa duração que justifiquem renovação. Se a ativação
real (fora do pacote A) exigir chamadas mais longas que o TTL do lease, renovação é decisão
separada e futura, não decidida aqui.

| Situação | Pode adquirir nova posse? | Pode chamar o provedor? | Pode concluir persistência? | Autorização necessária |
|---|---|---|---|---|
| A. Resultado durável presente, conclusão pendente | Só se a posse vigente estiver expirada | **Não** — retomada é só validação/conclusão (passos 3-4), nunca nova chamada | Sim, pelo detentor da posse vigente (original ou reclaimed) | Acesso à entidade/tentativa revalidado, igual a qualquer leitura/escrita dos passos 3-4 |
| B. Nenhum resultado durável, envio anterior comprovadamente não iniciado | Sim, se a posse atual expirou | Sim — é a continuação legítima de uma chamada que nunca saiu, não um novo consumo extra | Só depois de completar os passos 1–4 normalmente a partir daqui | Autorização completa de execução/consumo, como qualquer chamada nova |
| C. Nenhum resultado durável, envio anterior possível ou confirmado | Sim, se expirou | Tecnicamente sim, mas é **consumo novo com risco de duplicidade** — expiração **não autoriza automaticamente** | **Não**, sem antes resolver a ambiguidade — nunca persiste com base em "talvez tenha respondido" | Autorização completa **mais** decisão explícita sobre como tratar a ambiguidade (não é uma chamada "normal") |
| D. Recomendação já concluída | Não é necessário adquirir posse para ler | **Não**, em hipótese alguma | Já concluída — nada resta a concluir | Só autorização de **leitura** (mesma de `getRadarMaterial`) — recuperação é leitura autorizada |
| E. Cancelamento solicitado com resposta tardia | Só quando a tentativa atingir estado terminal ou a posse expirar — `cancelRequestedAt` sozinho não libera | Não deveria; se uma chamada já estava em voo, não é interrompida | A resposta tardia é observada no checkpoint do executor e o cancelamento é efetivado em vez de persistir, condicionado ao mesmo `claimToken` | Autorização de cancelamento é distinta da autorização de execução — não redesenhada aqui |

**Reforço final**: `claimToken` protege as **escritas condicionadas** no banco — não cancela
uma chamada de rede já em curso, nem impede sozinho um consumo duplicado (cenário C acima
continua exigindo tratamento explícito, nunca uma garantia automática de exactly-once).

### 4. Acesso ao resultado intermediário — sem redesenhar a autorização existente

Identidade que autoriza o executor/reconciliação: o **processo executor**, atuando sob a
proveniência do `requestedByUserId` original da solicitação — não uma identidade de usuário
nova (mesmo princípio já da Atualização 1.12, seção A). Vínculo: via
`RadarAnalysisAttempt.analysisRequestId` → `RadarAnalysisRequest.entityId`/`materialId`/
`tenantId`/`workspaceId`. Verificações que precedem a leitura de `preservedResultPayload`: a
mesma tríade comum (membership + vínculo workspace-tenant + escopo) **e** o
`RadarEntityAccessResolver` revalidado para a entidade — nunca cacheado, nunca dispensado por
ser "operação interna". Sem essa autorização, a leitura bloqueia, exatamente como qualquer
leitura de `RadarMaterial`. Usuários finais continuam sem acesso direto a
`preservedResultPayload` em qualquer hipótese — só à `RadarRecommendation` já validada, com
acesso vigente à entidade (inalterado desde a Atualização 1.15).

### Quadro final consolidado

| Decisão | Recomendação | Fundamentação | Dependência | Status de aprovação |
|---|---|---|---|---|
| `generationConfig` | Cinco campos fechados (seção 1) | Reaproveita enums já existentes em `AgentKnowledgePolicy`; separa solicitado de efetivamente utilizado | Catálogo de modelos suportados e teto de `requestedMaxTokens` **a definir** | Proposta, não aprovada |
| Tamanho do resultado durável | 32.768 bytes UTF-8 sobre `preservedResultPayload`, medido como em D5 | Mesma técnica já comprovada em `radarSignalResultValidator.ts` | Nenhuma | Proposta, não aprovada |
| Posse/expiração/retomada | `claimToken` + estado + prazo, verificados atomicamente; sem renovação | Relógio do Postgres, mesmo princípio de D6; dupla garantia contra trabalhador antigo | Valor do TTL do lease **a definir** | Proposta, não aprovada |

### 5. Pacote único para aprovação

**PACOTE A — completo e delimitado, inalterado no escopo desde a Atualização 1.15**: os três
contratos (`RadarAnalysisRequest`, `RadarAnalysisAttempt` com os campos de preservação e agora
`generationConfig`, `RadarRecommendation`), persistência com `claimToken` + estado + prazo de
posse verificados atomicamente + índice único parcial, serviços correspondentes,
executor/provedor substituídos por duplo controlado, PostgreSQL descartável, sem `RunEvent`,
sem acesso por cliente real, retries desabilitados no serviço.

Arquivos/modelos/constraints afetados futuramente — nenhum criado nesta rodada: mesmos
candidatos já listados desde a Atualização 1.12 (`radarAnalysisRequestContract.ts`,
`radarAnalysisAttemptContract.ts`, `radarRecommendationContract.ts`, serviços correspondentes,
`__tests__/`); campos de `generationConfig` e de preservação ficam dentro de
`radarAnalysisAttemptContract.ts`, sem arquivo novo adicional só por esta atualização.

Testes de aceite acrescentados por esta atualização, além dos já listados nas Atualizações 1.12
e 1.15 — todos contra PostgreSQL descartável com substitutos controlados:
- `generationConfig` rejeita campo desconhecido e `requestedModel` fora do catálogo suportado,
  na criação da tentativa;
- payload exatamente no limite de 32.768 bytes é aceito; um byte a mais é rejeitado sem escrita
  parcial; conteúdo multibyte é medido em bytes UTF-8 corretamente (as três fixtures da seção 2);
- escrita rejeitada quando o prazo de posse expirou, mesmo sem reclaim de outro trabalhador
  (situação B da tabela de posse, sem outro ator envolvido);
- aquisição concorrente de nova posse após expiração — só uma reconciliação vence;
- leitura de `preservedResultPayload` bloqueada sem passar pela tríade de autorização comum e
  pelo resolvedor de entidade, mesmo sendo "processo interno".

Não condiciono esta aprovação a provisionamento ou uso real de modelo — permanecem decisão
separada e posterior, junto com resolvedor real, fila operacional, consumo real, acesso por
cliente real e toda a frente Instagram.

**Decisão indispensável ainda faltante, nomeada, não escondida**: catálogo de modelos
suportados para `requestedModel`, teto de `requestedMaxTokens` e o valor do TTL do lease de
posse seguem sem número final ratificado — ficam para fechamento durante a implementação, sob
os mesmos princípios já registrados neste plano, e devem ser ditos explicitamente como tal, não
presumidos resolvidos.

### Texto de autorização sugerida (proposta ao usuário — não concedida nesta rodada)

"Autorizo a implementação local do pacote A do Radar Social — contratos
`RadarAnalysisRequest`/`RadarAnalysisAttempt` (incluindo `generationConfig` de cinco campos
fechados, os campos de preservação durável e a regra de tamanho de 32.768 bytes desta
atualização)/`RadarRecommendation`, persistência com `claimToken` + estado + prazo de posse
verificados atomicamente + índice único parcial, sem `RunEvent`, sem renovação de posse,
serviços correspondentes, e testes com executor/provedor substitutos controlados contra
PostgreSQL descartável — sem qualquer chamada real a modelo, fila operacional, provisionamento
de agente ou acesso por cliente real, que continuam como decisão separada e posterior. O
catálogo de modelos suportados, o teto de `requestedMaxTokens` e o TTL do lease de posse ficam
para fechamento durante a implementação, sob os mesmos princípios já registrados neste plano."

### Próximo passo

Decisão humana sobre este texto de autorização. Sem essa decisão, nenhuma implementação está
autorizada.

**Superado parcialmente pela Atualização 1.17**: os parâmetros do pacote A, a origem/idempotência
de `generationConfig`, o algoritmo de serialização e a semântica exata de expiração de posse
ficam consolidados e corrigidos na Atualização 1.17. Este registro é preservado como histórico,
não apagado.

## Atualização 1.17 — bloco final consolidado do pacote A (17/09/2026)

Fonte: leitura focalizada da Atualização 1.16 efetivamente gravada, nesta sessão (worktree
`EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`, HEAD
ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Não é nova auditoria
geral — consolida e corrige quatro pontos pontuais. Nenhuma implementação foi feita. Enums,
contratos e políticas não afetados por estas precisões (D5/D6, `RadarAnalysisRequest`/
`RadarRecommendation`, `recommendationType`, `natureza`, `confidenceLevel`, ausência de
`RunEvent`) não são reabertos.

### 1. Parâmetros do pacote A — propostas exclusivas de teste, não configuração de produção

| Parâmetro | Valor proposto | Tratamento de `null`/inválido |
|---|---|---|
| `requestedModel` | literal `"radar-test-model-v1"` — único valor reconhecido pelo substituto controlado do pacote A | `null` é tratado como ausência de um campo **obrigatório** (Atualização 1.16) — rejeitado; qualquer valor diferente do literal é rejeitado na criação da tentativa, catálogo fechado de um único valor nesta unidade |
| `requestedMaxTokens` | inteiro entre 1 e 2.048 inclusive | ausência (campo omitido) e `null` são equivalentes → aplica-se o default **1.024**; 0, negativo, não inteiro ou acima de 2.048 são rejeitados explicitamente — nunca ajustados/clampados silenciosamente |
| Prazo de posse (`leaseTtl`) | 60 segundos | não aceita `null` nem override por chamada nesta unidade — é uma constante do serviço, não um campo de contrato |
| Retries automáticos | desabilitados no serviço | inalterado desde a Atualização 1.14 |
| `preservedResultPayload` | limite de 32.768 bytes UTF-8 | ver algoritmo autossuficiente na seção 4 desta atualização |

Estes cinco valores são **propostas exclusivas do pacote A** — `"radar-test-model-v1"` nunca é
um modelo real, e nenhum destes números vira automaticamente configuração de produção quando a
ativação real for decidida (fora desta aprovação). Os 60 segundos **limitam a posse do
trabalhador sobre a linha da tentativa** — não autorizam, sozinhos, nenhuma chamada ao modelo
durante essa janela: cada chamada real continua exigindo a revalidação própria já estabelecida
(Atualização 1.12, seção A), independente de quanto tempo reste de posse.

### 2. `generationConfig` — origem única e idempotência corrigida

**Origem escolhida: exclusivamente do servidor.** Nenhum campo de `generationConfig` é aceito
do chamador. Justificativa: (a) o contrato já descrevia todos os cinco campos como originados
do servidor (Atualização 1.16) — esta escolha só torna essa origem exclusiva e explícita; (b)
aceitar campos do chamador exigiria decidir, para cada um, se e como participa de identidade e
validação de compatibilidade — complexidade não demonstrada como necessária nesta unidade; (c)
evita que o chamador force um modelo/config fora da política do workspace.

**Consequências**: `RadarAnalysisRequest` (contrato já fechado desde a Atualização 1.11) não
tem — e não ganha — nenhum campo de `generationConfig`; qualquer campo desse tipo no corpo da
solicitação é rejeitado como campo desconhecido, não silenciosamente ignorado. `generationConfig`
é fixado no nascimento de cada `RadarAnalysisAttempt`. No reenvio idempotente de
`RadarAnalysisRequest` (mesma `operationKey`, identidade completa idêntica), a solicitação — e a
tentativa já nascida com ela — são recuperadas tal como estão; `generationConfig` **não é
recalculado nem a política atual é reconsultada para substituí-lo**.

**Correção à Atualização 1.16**: "tentativas são sequenciais" não é, sozinho, motivo para
excluir `generationConfig` de qualquer comparação — isso cobre a claim de uma tentativa **já
existente**, não a **criação** de uma tentativa nova. Não havia, até aqui, nenhuma proteção
contra duas criações de tentativa técnica idênticas por engano (a claim só atua depois que a
linha já existe). Por isso, a operação "criar nova tentativa técnica" passa a ter sua própria
chave: `attemptOperationKey`, fornecida por quem solicita a retentativa. Isso não é uma camada
de idempotência supérflua — preenche uma lacuna que a claim, por natureza, não cobre (claim
protege execução de uma linha existente, não a criação da linha).

Identidade comparada sob a mesma `attemptOperationKey`: `{analysisRequestId,
attemptOperationKey}` **mais** o `generationConfig` que seria calculado agora a partir da
política vigente. Reenvio idêntico (mesma chave, mesma configuração resultante) recupera a
tentativa já criada por essa chave — sem chamar o executor de novo. Mesma chave com
configuração resultante **diferente** (porque a política do agente mudou entre as duas
chamadas) é **conflito** — nunca recuperação silenciosa com o valor antigo, nunca substituição
pelo valor novo.

**Quatro operações, agora distintas sem ambiguidade**:
1. **Recuperação de solicitação** — mesma `operationKey` de `RadarAnalysisRequest`, identidade
   completa idêntica → devolve a solicitação e a tentativa já nascida com ela, sem recalcular
   nada.
2. **Recuperação/criação idempotente de tentativa** — mesma `attemptOperationKey` sob a mesma
   solicitação → recupera se a configuração resultante coincide; conflita se diverge.
3. **Nova tentativa intencional** — `attemptOperationKey` **diferente** sob a mesma solicitação
   → tentativa genuinamente nova, com `generationConfig` recalculado no momento.
4. **Nova análise** — `operationKey` nova de `RadarAnalysisRequest` inteira, distinta de tudo
   acima (inalterado desde a Atualização 1.11).

### 3. Serialização e tamanho — definição autossuficiente, sem remissão a D5

**Objeto exato serializado**: o valor de `preservedResultPayload` — um objeto JSON simples
(nunca array, nunca string solta na raiz), contendo só os campos previstos para o candidato de
`RadarRecommendation`.

**Algoritmo de medição do tamanho**: `JSON.stringify(valor)` do runtime do projeto (Node.js),
**sem indentação** (sem terceiro argumento), sobre a ordem de chaves **tal como o objeto já
validado as possui** — a ordem de inserção recebida, nunca reordenada para esta medição. Esta
forma **não é canônica** no sentido de uma normalização formal (não é JCS/RFC 8785) — é só a
forma que de fato será persistida, e é ela que precisa caber no limite.

**Algoritmo do hash (`preservedResultHash`)**: sobre a MESMA estrutura de dados, mas com as
chaves de **cada objeto, recursivamente**, ordenadas alfabeticamente (`Array.prototype.sort()`
padrão, sem comparador customizado) antes de serializar — só para estabilizar o hash entre
execuções equivalentes com ordens de inserção diferentes. Chamo essa forma de **determinística
com chaves ordenadas**, não de "canônica". Em nenhum dos dois algoritmos (medição ou hash) os
**arrays** (`statements[]`, `references[]`, e qualquer array aninhado) são reordenados — sua
ordem original é sempre preservada exatamente. Ordenar chaves de objeto não autoriza, e não
implica, nenhuma normalização do conteúdo textual dentro das strings (sem trim, sem mudança de
acentuação, sem alteração de quebra de linha).

**Strings, escapes, números, valores não-JSON**: strings usam o escaping padrão de
`JSON.stringify` (aspas, barra invertida, controles U+0000–U+001F); a contagem de bytes é sobre
a forma **já escapada**. Números serializam em notação decimal padrão do JavaScript — **um
número pode voltar do banco em forma textual diferente da original** (ex.: `1.50` → `1.5`); por
isso a regra de reconstrução é comparar/reidratar números **por valor**, nunca depender da forma
textual sobreviver. `undefined`, `NaN`, `Infinity` e funções não são aceitos em nenhum campo — a
validação estrutural, antes de medir tamanho, já rejeita qualquer valor fora de string, número
finito, booleano, `null`, objeto simples ou array desses tipos.

**Codificação**: `Buffer.byteLength(textoSerializado, "utf8")` sobre a string já serializada —
bytes UTF-8, não code points, não unidades UTF-16, não caracteres.

**Escopo exato do hash, sem circularidade**: SHA-256 hex sobre a serialização determinística
(chaves ordenadas) descrita acima — nunca sobre a linha inteira da tentativa, nunca incluindo o
próprio valor do hash, nunca incluindo `preservedResultVersion` ou os campos de proveniência.
Estes últimos ficam em colunas próprias, fora do objeto medido/hasheado: `preservedResultHash`
é sempre 64 caracteres hexadecimais (tamanho fixo); `preservedResultVersion` é o literal curto
já definido. **Lacuna identificada e fechada nesta atualização**: nenhum limite havia sido
proposto para `preservedResultProvider`/`preservedResultModel`/`preservedResultProviderRequestId`
— proponho **256 bytes UTF-8 cada**, por serem identificadores curtos, não conteúdo.

**Representação persistida e verificação após leitura**: `preservedResultPayload` é uma coluna
JSON do Postgres — a ordem de chaves **devolvida por uma consulta não é garantida igual à
ordem originalmente enviada** (comportamento conhecido de colunas JSON/JSONB). Por isso, a
verificação do hash após a leitura **nunca** serializa o valor devolvido na ordem bruta que vier
— **sempre** reaplica a mesma regra de ordenação alfabética de chaves antes de recalcular e
comparar o hash. Essa é a regra de reconstrução; a comparação nunca depende da ordem bruta do
banco.

**Não altero nem reaproveito** `stableStringify`, `computeRequestFingerprint` ou
`FINGERPRINT_CONTRACT_VERSION` de SignalForward — esta é uma definição própria e independente
do Radar, ainda que compartilhe a ideia geral (comum, não exclusiva de nenhum dos dois) de
ordenar chaves para estabilizar um hash.

**Fixtures documentais (não executadas)**:
- **Exatamente 32.768 bytes**: objeto válido cuja forma serializada (ordem de inserção, sem
  indentação) mede exatamente esse total — aceito.
- **32.769 bytes**: o mesmo objeto com um caractere ASCII a mais — rejeitado, sem escrita
  parcial, tentativa marcada `failed`.
- **Multibyte**: substituir 100 caracteres ASCII por 100 ocorrências de "á" (2 bytes UTF-8 cada)
  aumenta o total medido em 100 bytes — demonstra que a métrica é em bytes UTF-8 da forma
  serializada, não em caracteres.

### 4. Expiração da posse — expressão temporal exata e ordem de operações

**Expressão nomeada**: `clock_timestamp()` do PostgreSQL — **não** `now()`/`CURRENT_TIMESTAMP`.
Correção à Atualização 1.16, que citou os dois como equivalentes: `now()` fixa o horário no
**início da transação** e não muda mesmo que a transação espere por uma trava; `clock_timestamp()`
reflete o horário real no **momento exato em que a expressão é avaliada**, mudando a cada
chamada mesmo dentro da mesma transação. Usar `now()` permitiria que uma transação que esperou
muito tempo por uma trava ainda "visse" um horário antigo o bastante para passar por não
expirada, mesmo que o tempo real já tivesse ultrapassado o TTL — por isso a expressão correta é
`clock_timestamp()`, mesmo princípio já usado em D6 (`backdateConfirmationWindowExpiry`
manipula `clock_timestamp()` diretamente).

**Quando o valor é avaliado**: no momento em que o PostgreSQL processa a cláusula `WHERE` da
instrução `UPDATE`, **depois** de adquirir a trava de linha necessária — nunca antes, nunca a
partir de um valor lido no início da transação.

**Comportamento sob espera por trava**: se a instrução precisar esperar (outra transação
concorrente segurando a mesma linha), o tempo de espera **conta** contra o TTL, porque
`clock_timestamp()` só é avaliado depois que a trava finalmente é obtida — se a espera foi longa
o bastante para ultrapassar o TTL, a condição corretamente falha; isso é o comportamento
desejado, não um efeito colateral a evitar.

**Ordem de operações de uma única instrução** (documental, não instruções separadas — é o que o
Postgres já faz internamente ao processar um `UPDATE ... WHERE ...` sob `READ COMMITTED`):

```sql
-- 1. localizar a linha candidata por id;
-- 2. adquirir a trava de linha (espera aqui, se necessário);
-- 3. com a trava já obtida, reavaliar as três condições contra o estado ATUAL da linha:
UPDATE radar_analysis_attempts
SET status = 'completed', ...
WHERE id = $attemptId
  AND claim_token = $meuToken
  AND status = $estadoEsperado
  AND clock_timestamp() < claimed_at + ($leaseTtlSeconds || ' seconds')::interval;
-- 4. se as três condições forem verdadeiras, aplica o SET; senão, 0 linhas afetadas.
```

**Condições atômicas**: `claim_token`, `status` e a validade do prazo (passo 3) são avaliadas na
**mesma** cláusula `WHERE` de uma única instrução — atomicidade garantida pela execução
indivisível de uma instrução SQL sobre uma linha já travada, não por coordenação em nível de
aplicação.

**Delimitação exata da garantia — o que não prometo**: a condição é satisfeita **no ponto de
validação** (avaliação do `WHERE`, passo 3 acima) — isso não é o mesmo que garantir que o
**commit** da transação ocorra antes do instante de expiração. Entre a avaliação do `WHERE` e o
`COMMIT` efetivo existe uma janela, geralmente curta, não coberta por nenhuma trava adicional.
A garantia que sustento é: "a condição foi verdadeira no instante em que o Postgres avaliou o
`WHERE`" — não "o commit necessariamente precede a expiração real".

**Garantias preservadas, reafirmadas à luz destas correções**: trabalhador substituído (token
diferente ou prazo vencido no momento da avaliação) não escreve; resultado durável presente
permite só retomar validação/conclusão, nunca nova chamada ao provedor; ausência de resultado
durável com envio anterior possível/confirmado permanece ambígua — expiração não autoriza nova
chamada automaticamente; recuperação de `RadarRecommendation` já concluída é leitura autorizada,
sem exigir posse nenhuma.

### Bloco final consolidado

| Decisão | Valor proposto | Garantia | Limitação |
|---|---|---|---|
| `requestedModel` | `"radar-test-model-v1"` (só teste) | Catálogo fechado de um valor no pacote A | Não é modelo real; catálogo de produção é decisão futura separada |
| `requestedMaxTokens` | 1–2.048, default 1.024 quando ausente/`null` | Rejeição explícita fora da faixa, sem clamping | Teto de produção pode ser outro, decisão futura |
| Prazo de posse | 60 segundos, sem renovação | `claim_token` + `status` + `clock_timestamp() < claimed_at + TTL`, atômicos numa instrução | Não autoriza chamada ao modelo durante a janela; garantia é sobre o ponto de validação, não sobre o commit |
| `generationConfig` | Origem exclusiva do servidor; `attemptOperationKey` para criação de nova tentativa | Reenvio idêntico recupera; divergência sob a mesma chave conflita | Catálogo de modelos e teto de tokens de produção seguem pendentes |
| Serialização/tamanho | 32.768 bytes UTF-8 sobre `preservedResultPayload`; hash sobre forma com chaves ordenadas | Definição autossuficiente, sem depender da ordem devolvida pelo banco | Limite de 256 bytes para os três campos de proveniência é proposta nova desta atualização, não testada |
| Armazenamento na tentativa | Campos em `RadarAnalysisAttempt` (Atualização 1.15), sem tabela nova | Mesma autorização já exigida para a tentativa/entidade | Inalterado |
| `RunEvent` | Não emitido no pacote A | Evita vazar existência da análise por autorização mais grossa | Inalterado desde a Atualização 1.15 |

**Categorias de arquivos e alterações futuras do pacote A** — nenhum criado nesta rodada:
- contratos e validadores: `radarAnalysisRequestContract.ts`, `radarAnalysisAttemptContract.ts`
  (inclui `generationConfig`, campos de preservação e `attemptOperationKey`),
  `radarRecommendationContract.ts`;
- modelos e migration aditiva: os três modelos novos (`RadarAnalysisRequest`,
  `RadarAnalysisAttempt`, `RadarRecommendation`), índice único parcial de tentativa ativa,
  migration futura com caminho ainda não gerado;
- serviços: `radarAnalysisRequestService.ts`, `radarAnalysisAttemptService.ts` (claim, os quatro
  passos de escrita durável, revalidações), `radarRecommendationService.ts` (validação de
  referências, leitura autorizada);
- substitutos controlados de executor/provedor, exclusivos de `__tests__/`, identificados como
  tal;
- testes contra PostgreSQL descartável cobrindo todas as garantias das Atualizações 1.12, 1.14,
  1.15, 1.16 e as desta atualização (parâmetros de fronteira de tamanho, `attemptOperationKey`,
  expiração por `clock_timestamp()`);
- documentação: só este plano, sem outro arquivo.

Limites já estabelecidos para o pacote e as alterações locais anteriores (D5/D6, fingerprint,
entidade/material, schema, migrations, cliente gerado, arquivos não rastreados) permanecem
intocados e fora do escopo desta rodada.

### Texto de autorização sugerida (proposta ao usuário — não concedida nesta rodada)

Este texto distingue **aprovar o desenho** de **autorizar implementar**: aprovar significa
aceitar os valores e protocolos abaixo como base válida para uma futura implementação; não
inicia, por si só, nenhum código.

"Aprovo o desenho consolidado do pacote A do Radar Social — os três contratos
(`RadarAnalysisRequest`, `RadarAnalysisAttempt` com `generationConfig` de origem exclusiva do
servidor e `attemptOperationKey` para nova tentativa, `RadarRecommendation`), os parâmetros de
teste desta atualização (`requestedModel`, `requestedMaxTokens`, prazo de posse de 60 segundos,
retries desabilitados, limite de 32.768 bytes), o algoritmo de serialização/hash e o protocolo
de posse por `clock_timestamp()` — como base para uma futura implementação local, com
executor/provedor substitutos controlados, PostgreSQL descartável, sem `RunEvent` e sem acesso
por cliente real. Esta aprovação de desenho não autoriza, por si só, a criação de código,
schema, migration ou testes — isso permanece uma decisão separada e posterior. Resolvedor real,
provisionamento de agente, fila operacional, chamadas reais a modelo, consumo real, acesso por
clientes e toda a frente Instagram continuam fora, sem alteração."

### Próximo passo

Decisão humana sobre este texto de autorização e, separadamente, sobre autorizar o início da
implementação do pacote A. Sem essas decisões, nenhuma implementação está autorizada.

**Superado pela Atualização 1.18**: a regra de recuperação por `attemptOperationKey` (seção 2
desta atualização, que comparava "a configuração que seria calculada agora") e a verificação
temporal de posse por uma única instrução implícita (seção 4 desta atualização) são substituídas
pelo protocolo explícito da Atualização 1.18. Este registro é preservado como histórico, não
apagado.

## Atualização 1.18 — correção de attemptOperationKey e protocolo explícito de posse (17/09/2026)

Fonte: leitura focalizada da Atualização 1.17 efetivamente gravada, nesta sessão (worktree
`EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`, HEAD
ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Corrige exclusivamente
dois pontos da Atualização 1.17. Nenhum outro contrato ou parâmetro é reaberto. Nenhuma
implementação foi feita.

### 1. Correção de `attemptOperationKey`

**Erro corrigido**: a Atualização 1.17 comparava, no reenvio, "a configuração que seria
calculada agora" — isso geraria conflito só porque a resolução do servidor mudou entre duas
chamadas, mesmo quando o chamador pediu exatamente a mesma coisa. `generationConfig` é
inteiramente derivado no servidor (Atualização 1.17, seção 2) — o chamador nunca o fornece, e
por isso não pode ser cobrado por uma divergência que só o servidor produziu.

**Escopo exato da chave**: `attemptOperationKey` é único sob
`(tenantId, workspaceId, analysisRequestId, attemptOperationKey)` — mesma disciplina redundante
já usada em `RadarMaterial` (tenant/workspace explícitos na constraint, ainda que
`analysisRequestId` já implique um tenant/workspace por FK).

**Lista exata de campos comparados na identidade da OPERAÇÃO** (não da configuração):
`{analysisRequestId, attemptOperationKey}` — **somente estes dois**. Não há mais nenhum campo
fornecido pelo chamador para esta operação além da própria chave e da solicitação a que ela se
refere. `generationConfig` **nunca** participa desta comparação, em nenhuma direção.

**A. Chave existente**: revalidar autorização (tríade comum + resolvedor de entidade) antes de
devolver qualquer dado; comparar somente `{analysisRequestId, attemptOperationKey}` — que já
coincidem, por definição, se a chave foi encontrada para aquela solicitação; recuperar a
tentativa existente com seu `generationConfig` **congelado exatamente como foi gravado**, sem
recalcular configuração, defaults ou template; não criar tentativa nova; não iniciar execução.

**B. Chave inexistente**: validar dados e autorização; resolver `generationConfig` na fonte
confiável do servidor **agora**; persistir a tentativa e sua configuração **atomicamente** (uma
única operação de escrita).

**C. Duas criações concorrentes com a mesma chave**: unicidade garantida por
`(tenantId, workspaceId, analysisRequestId, attemptOperationKey)`; a chamada perdedora, ao
capturar a violação de unicidade, **relê a linha vencedora num client novo, nunca na transação
já abortada** (mesma disciplina de `radarMaterialService.ts`) e a recupera — os campos originais
da operação (`analysisRequestId`, `attemptOperationKey`) coincidem por construção da própria
corrida, então a recuperação sempre é válida; **nunca gera conflito só porque as duas chamadas
resolveram `generationConfig` diferente** — o `generationConfig` da vencedora é o que vale, sem
comparação alguma com o que a perdedora teria calculado.

**D. Nova tentativa intencional**: exige `attemptOperationKey` **diferente**; respeita a guarda
já definida de no máximo uma tentativa ativa por solicitação (índice único parcial,
Atualizações 1.12/1.15) — que é uma constraint **separada** desta, sobre status, não sobre a
chave; exige autorização própria, revalidada do zero; recebe `generationConfig` resolvido **para
esta tentativa**, no momento em que ela é criada.

**Reforço final**: configuração histórica não concede autorização permanente. Recuperar uma
tentativa existente (casos A e C) é **leitura** — não dispensa nenhuma das revalidações já
previstas quando essa tentativa realmente for executada (Atualização 1.12, seção A).

### 2. Protocolo explícito de verificação temporal da posse

**Correção**: não presumo mais que "a instrução SQL contém `UPDATE` e `clock_timestamp()`"
garanta, por si só, a ordem certa de avaliação. O protocolo abaixo é explícito, passo a passo,
dentro de uma única transação:

1. **Iniciar transação** (`BEGIN`).
2. **Adquirir a trava da linha da tentativa**, respeitando a ordem global de travas já definida
   (Atualização 1.9/1.12: entidade → material predecessor; a tentativa é travada depois de
   qualquer trava de entidade/material que a mesma operação eventualmente precise, nunca antes).
3. **Ler `claim_token`, `status` e `claimed_at` vigentes, sob a trava já obtida** — não antes:
   ```sql
   SELECT claim_token, status, claimed_at
   FROM radar_analysis_attempts
   WHERE id = $attemptId
   FOR UPDATE;
   ```
   A partir daqui, nenhuma outra transação pode alterar esta linha até o fim desta transação.
4. **Comparar, em código de aplicação, os valores lidos** contra `$meuToken`/`$estadoEsperado`, e
   avaliar a validade temporal.
5. **Executar a escrita condicionada**, reavaliando as três condições de novo na mesma
   instrução, com `clock_timestamp()` calculado **neste instante** — nunca reaproveitado do
   passo 3, mesmo que nenhuma outra transação tenha interferido (o próprio processamento da
   aplicação entre os passos 3 e 5 consome tempo real):
   ```sql
   UPDATE radar_analysis_attempts
   SET status = 'completed', ...
   WHERE id = $attemptId
     AND claim_token = $meuToken
     AND status = $estadoEsperado
     AND clock_timestamp() < claimed_at + ($leaseTtlSeconds || ' seconds')::interval;
   ```
6. **Ausência de linha afetada é recusa**, sem efeito parcial — nenhuma exceção com efeito
   colateral, `ROLLBACK` limpo.
7. `COMMIT`.

**Regra de expiração, com fronteira exata**: a posse está **expirada** quando
`clock_timestamp() >= claimed_at + TTL` — o instante de igualdade já conta como expirado (não
"um instante depois"). Equivalentemente, a posse está válida só enquanto
`clock_timestamp() < claimed_at + TTL`, condição usada na instrução do passo 5.

**Comportamento sob espera pela trava** (passo 2): se outra transação já detém a trava da
mesma linha, o passo 2 bloqueia até ela ser liberada — o tempo de espera **conta** contra o
prazo, porque `claim_token`/`status`/`claimed_at` só são lidos (passo 3) **depois** da trava
finalmente obtida, e `clock_timestamp()` (passo 5) é avaliado depois disso ainda — nenhum valor
de tempo é capturado antes da trava.

**Delimitação da garantia, sem alteração de conteúdo em relação à Atualização 1.17**: a condição
vale no **ponto de avaliação da escrita condicionada** (passo 5) — não prometo que o `COMMIT`
(passo 7) ocorra necessariamente antes do instante de expiração; entre os passos 5 e 7 pode
existir uma janela curta não coberta por nenhuma trava adicional.

**Garantias preservadas, sem mudança**: trabalhador substituído (token diferente, lido no passo
3 ou reavaliado no passo 5) não escreve; retomada de resultado durável (Atualização 1.15,
cenário A) nunca chama o provedor de novo — só repete os passos de validação/conclusão; ausência
de resultado durável com envio anterior possível/confirmado (cenário C) permanece ambígua — a
expiração da posse, sozinha, nunca autoriza repetição automática da chamada; nenhuma renovação
de posse nem retry automático é introduzido por este protocolo.

### Testes de aceite futuros (não executados nesta rodada)

1. **Operação começa antes da expiração, espera pela trava e a obtém depois do prazo**: uma
   segunda transação segura a trava da mesma linha por tempo suficiente para o TTL vencer antes
   que a primeira consiga completar o passo 2; ao finalmente ler os valores (passo 3) e avaliar
   o passo 5, a escrita é recusada.
2. **Token é substituído durante a espera**: enquanto um trabalhador aguarda a trava (passo 2),
   uma reconciliação diferente já obteve a trava antes, expirou a posse antiga e gravou um novo
   `claim_token` para a mesma linha, liberando a trava em seguida; quando o trabalhador original
   finalmente avança para o passo 3, o `claim_token` lido já não é o seu — recusado no passo 5.
3. **Token, estado e prazo válidos**: caminho feliz, sem concorrência — escrita aceita.
4. **Resultado durável retomado**: com `preservedResultPayload` já gravado (Atualização 1.15,
   passo 2), a conclusão (passos 3-4 daquela atualização) é refeita usando o protocolo desta
   seção, sem nenhuma nova chamada ao substituto de executor/provedor — verificado por asserção
   direta de que a função substituta de chamada não é invocada de novo.

Os testes 1 e 2, por serem concorrentes, usam coordenação determinística — a mesma técnica já
comprovada nesta sessão para SignalForward (`apps/api/src/services/signalForward/__tests__/B-concurrency.test.ts`:
conexões nomeadas, observação de `pg_stat_activity`/`wait_event_type` via `observeConnectionState`/
`waitFor`) — nunca `sleep` como mecanismo de sincronização.

### Próximo passo

Decisão humana sobre a autorização única apresentada a seguir. Sem essa decisão, nenhuma
implementação está autorizada.

## Atualização 1.19 — pacote A implementado localmente (17/09/2026)

Fonte: implementação real nesta sessão, sob autorização expressa do usuário para o pacote A
(worktree `EIAH_SIGNALFORWARD_ORIGIN_FIX`, branch `experiment/signalforward-origin-fingerprint-fix`,
HEAD ainda `4d91b6c24794849c574da4e57d21aab41779141e`, nenhum commit criado). Entrega o fluxo
material persistido → análise simulada → recomendação persistida → recuperação autorizada sem
nova análise, exatamente como autorizado. Resolvedor de produção, provisionamento de agente,
fila operacional, chamadas reais a modelo e Instagram continuam **fora**, como já delimitado.

### Comportamento entregue

Os três contratos (`RadarAnalysisRequest`/`RadarAnalysisAttempt`/`RadarRecommendation`) foram
implementados com os valores exatos das Atualizações 1.11–1.18: `generationConfig` de origem
exclusiva do servidor com os cinco campos fechados; `attemptOperationKey` com a correção da
Atualização 1.18 (identidade da operação = só `{analysisRequestId, attemptOperationKey}`,
`generationConfig` nunca comparado); resultado intermediário preservado como campos na própria
`RadarAnalysisAttempt` (não `RunEvent`, não tabela nova); protocolo de posse com `claimToken` +
estado + prazo verificados atomicamente via `clock_timestamp()`, seguindo o protocolo explícito
de sete passos da Atualização 1.18 (`SELECT ... FOR UPDATE` dentro da transação, depois `UPDATE`
condicionado); validação de tamanho (32.768 bytes, medição não-canônica) e hash (chaves
ordenadas) exatamente como especificado; validação determinística de referências contra o
material/contexto antes de persistir `RadarRecommendation`.

Fluxo de ponta a ponta demonstrado com executor/provedor **substituto controlado** (nunca real):
`runSimulatedAnalysis` encadeia claim → chamada ao substituto → preservação → validação/
conclusão, produzindo uma `RadarRecommendation` persistida a partir de um `RadarMaterial` já
existente, recuperável depois por leitura autorizada sem reexecutar nada.

### Arquivos criados e alterados

Novos, todos em `apps/api/src/services/radarSocial/`: `radarAnalysisRequestContract.ts`,
`radarAnalysisAttemptContract.ts`, `radarRecommendationContract.ts`,
`radarAnalysisRequestService.ts`, `radarAnalysisAttemptService.ts`, `radarRecommendationService.ts`,
`__tests__/D-analysis-contracts.test.ts`, `__tests__/E-analysis-request-and-attempt-lifecycle.test.ts`,
`__tests__/F-analysis-end-to-end.test.ts`, `__tests__/G-analysis-attempt-concurrency.test.ts`.

Alterados, de forma aditiva, preservando o conteúdo anterior: `radarEntityAccessResolver.ts`
(novo valor `"analyze"` acrescentado à união de `operation` — os três valores anteriores
`"read"|"write"|"manage"` e todo o comportamento de `radarKnownEntityService.ts`/
`radarMaterialService.ts` que os usa permanecem intocados, confirmado por hash e por reexecução
das 63 provas da unidade anterior); `__tests__/helpers.ts` (funções novas acrescentadas ao final,
nenhuma função anterior alterada, confirmado da mesma forma).

`packages/db/prisma/schema.prisma`: três modelos novos (`RadarAnalysisRequest`,
`RadarAnalysisAttempt`, `RadarRecommendation`) acrescentados de forma aditiva, preservando
integralmente o diff local já existente de D6 e da unidade entidade/material no mesmo arquivo.
Cliente Prisma gerado (`packages/db/src/generated/client/schema.prisma`,
`package.json`) atualizado com `prisma generate`, e `packages/db/dist/generated/client`
sincronizado via `node packages/db/scripts/copy-publish-artifacts.mjs` (mesmo procedimento da
unidade anterior — nenhuma dependência instalada, nenhum `tsup`/`build:dts` executado).

### Migration e constraints

`packages/db/prisma/migrations/20260917110146_add_radar_analysis_request_attempt_recommendation/`
— estritamente aditiva (só `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`), gerada por
`prisma migrate dev` contra o Postgres descartável e revisada linha a linha. Acrescida
manualmente ao mesmo arquivo, antes de aplicar (banco recriado do zero para garantir
consistência entre arquivo e estado aplicado — nunca um banco compartilhado): o índice único
**parcial** `radar_analysis_attempts_one_active_per_request` sobre
`(tenant_id, workspace_id, analysis_request_id) WHERE status IN ('pending','running')`, decisão
técnica já registrada como pendente desde a Atualização 1.12 — confirmado no banco via `\d
radar_analysis_attempts`.

### Testes, comandos e resultados reais

| Suíte | Comando | Resultado |
|---|---|---|
| Radar Social completo (entidade/material + análise/recomendação) | `tsx --test apps/api/src/services/radarSocial/__tests__/*.test.ts` | **106/106 passaram**, exit 0 |
| SignalForward (D5/D6), reexecução de regressão | `tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts` | **129/129 passaram**, exit 0 — nenhuma regressão |

Os 43 testes novos desta rodada (17 em `D`, 10 em `E`, 9 em `F`, 7 em `G`) cobrem: limites e
Unicode de `objective`/`additionalContext`/`generationConfig`/resultado preservado; isolamento e
autorização (incluindo revogação antes da recuperação); `generationConfig` congelado apesar de
resolução diferente em reenvio; os quatro casos de `attemptOperationKey` (chave existente, chave
nova, corrida concorrente, unicidade de tentativa ativa); trabalhador antigo rejeitado após
reclaim; espera real por trava ultrapassando a expiração (coordenação por `pg_stat_activity`,
sem sleeps); resultado durável retomado sem nova chamada ao substituto; resposta desconhecida do
provedor sem repetição automática; recomendação duplicada impedida; referências inválidas e
evidência insuficiente corretamente distinguidas de falha técnica; material corrigido depois da
análise preservando a referência histórica exata. Todos exclusivamente com executor/provedor
**substituto controlado** e PostgreSQL descartável — nenhuma chamada real a modelo em nenhum
teste.

### Comparação de typecheck

Mesmo comando, mesma configuração, TypeScript da mesma instalação local:
`tsc --noEmit -p apps/api/tsconfig.json`. Baseline reconstruída como o estado imediatamente
anterior a esta rodada (D5/D6 + entidade/material presentes, arquivos desta rodada
temporariamente removidos e as duas extensões pontuais revertidas) — não o commit HEAD.

- Antes: 431 erros.
- Depois (primeira medição): 432 — um diagnóstico novo (`TS2531` num teste, mesmo padrão de
  `Object is possibly 'null'` já visto na unidade anterior).
- Corrigido no próprio teste (variável intermediária antes de acessar `.length`); depois: 431,
  **diff vazio** contra a baseline.

Nenhum erro pré-existente foi corrigido nem escondido; nenhuma correção tocou arquivos fora
desta unidade.

### Evidência de preservação das unidades anteriores

Hashes SHA-256 coletados antes e depois desta rodada para todos os arquivos de D5/D6
(`signalForward/*.ts`, `signalForward/__tests__/*.ts`) e da unidade entidade/material
(`radarKnownEntityContract.ts`, `radarKnownEntityService.ts`, `radarMaterialContract.ts`,
`radarMaterialService.ts` e seus três arquivos de teste originais): **diff vazio nos dois
grupos** — nenhum byte alterado. `git status --short`/`git diff --stat` mostram exatamente o
mesmo conjunto de mudanças já registrado nas rodadas anteriores, mais a nova migration.

### Limitações remanescentes

Nenhum resolvedor real de acesso existe — toda autorização de entidade nesta unidade continua
restrita a substitutos de teste, por design. Nenhum agente real foi provisionado; `requestedModel`
só reconhece o literal de teste. `completionEngine.ts` (executor real do Core) não foi tocado nem
integrado — a ativação real exigirá decisão própria sobre override de retries por chamada,
registrada como pendência desde a Atualização 1.14/1.18. Catálogo de modelos suportados, teto de
produção de `requestedMaxTokens` e TTL de posse em produção seguem sem valor ratificado além do
proposto para o pacote A.

### Recursos temporários criados e removidos

Container Docker `radar-analysis-unit-pg` (Postgres descartável, porta 5434) e seu banco-sombra:
criados, usados, removidos ao final. Dois symlinks `__tests__/node_modules` (radarSocial e
signalForward, necessários para `pg`/`@prisma/adapter-pg`): criados, usados, removidos ao final.
`eiah-postgres` (serviço preexistente) permaneceu intocado durante toda a rodada.

### Classificação

- **Implementado e testado** (com substituto controlado): os três contratos, os três serviços,
  o protocolo de posse completo, a migration e o índice parcial.
- **Simulado, nunca real**: toda chamada "ao provedor" nos testes — sempre a função substituta
  injetada, nunca rede real.
- **Dependência operacional futura**: resolvedor real; agente real; extensão de
  `completionEngine.ts` para override de retries por chamada (ou aceitação do padrão global);
  fila operacional; consumo real; toda a frente Instagram.

### Próximo passo

Decisão humana sobre a ativação operacional (fora desta aprovação) ou sobre estender o pacote A
local antes disso. Esta atualização não amplia a autorização concedida — só documenta o que foi
efetivamente entregue sob ela.

## Atualização 1.20 — revisão final do pacote A local: achado real, correção e veredito (17/09/2026)

Fonte: revisão dirigida desta sessão sobre o índice, os estados e o protocolo de posse
entregues na Atualização 1.19, no mesmo worktree/branch/HEAD, nenhum commit criado. Escopo
estritamente pontual (correção localizada), sem reabertura de auditoria geral.

### Achado

O índice único parcial `radar_analysis_attempts_one_active_per_request` cobria, como escrito na
Atualização 1.19, apenas `WHERE status IN ('pending','running')`. Isso é correto para bloquear
duas tentativas simultaneamente em execução — mas deixava de fora o estado
`provider_responded_pending_persistence` (resposta do provedor já recebida e preservada de forma
durável, aguardando validação/conclusão), que também é **não terminal** e representa trabalho em
curso. Reproduzido nesta rodada, contra o Postgres descartável recriado do zero: com uma tentativa
em `provider_responded_pending_persistence`, uma chamada a `createOrRecoverIntentionalAttempt` com
uma `attemptOperationKey` nova era aceita e criava uma segunda tentativa `pending` para a mesma
solicitação — abrindo caminho para duas execuções concorrentes (duas chamadas ao provedor, dois
`RadarRecommendation` possíveis) sobre o mesmo `RadarAnalysisRequest`, o que contraria o próprio
objetivo da guarda "no máximo uma tentativa ativa por solicitação" registrado desde a Atualização
1.12. Nenhum teste da Atualização 1.19 cobria esse caso — o teste de recuperação de resultado
durável (`F-analysis-end-to-end.test.ts`, "recuperação de resultado durável") levava a tentativa a
`provider_responded_pending_persistence`, mas nunca tentava criar uma segunda tentativa nesse
ponto.

### Correção

Estendido o filtro do índice, no mesmo arquivo de migração local (ainda não aplicado fora de
ambientes descartáveis — confirmado antes de editar), para
`WHERE status IN ('pending', 'running', 'provider_responded_pending_persistence')`. Nenhuma
mudança de código foi necessária: o classificador de violação já existente
(`isOnlyOneActiveAttemptViolation`, em `radarAnalysisAttemptService.ts`) já reconhece qualquer
violação da mesma constraint por nome de colunas, e passou a receber corretamente essa nova
violação sem qualquer ajuste. Banco descartável recriado do zero após a edição, para garantir
paridade entre arquivo e estado aplicado (mesma técnica da Atualização 1.19). Estados terminais
(`completed`, `failed`, `cancelled`) permanecem fora do filtro, preservando integralmente a
política de reenvio já ratificada: uma tentativa finalizada, com qualquer desfecho, sempre libera
o slot para uma nova tentativa intencional. Nenhuma política de retentativa foi redefinida — só
fechada a lacuna sobre o que conta como "ativa".

Teste de regressão adicionado em `E-analysis-request-and-attempt-lifecycle.test.ts` ("caso D2 /
unicidade estendida"): reproduz exatamente o cenário (claim → preserve → tentativa de criar
segunda tentativa intencional) e confirma rejeição com `only_one_active_attempt_allowed`.

### Matriz de estados e bloqueios (RadarAnalysisAttempt)

| Estado | Bloqueia nova tentativa intencional? | Guarda no banco | Guarda no serviço | Justificativa |
|---|---|---|---|---|
| `pending` | Sim | Índice único parcial (após 1.20) | Nenhuma independente — o serviço só classifica o `P2002` resultante | Tentativa aguardando claim; trabalho ainda não começou, mas já está reservado |
| `running` | Sim | Índice único parcial (após 1.20) | `claimAttempt`: `SELECT...FOR UPDATE` + `UPDATE` condicionado (`status='pending'`) protege a TRANSIÇÃO para este estado, não a criação de outra tentativa | Execução em curso; a chamada ao provedor já pode estar em voo |
| `provider_responded_pending_persistence` | Sim (corrigido nesta rodada; não bloqueava até a 1.19) | Índice único parcial (após 1.20) | `preserveResult`/`concludeAttempt`: `claimToken`+`status`+`clock_timestamp() < claimedAt+TTL` protege a ESCRITA sobre a própria tentativa, não a criação de outra | Resultado já recebido e preservado de forma durável, mas ainda não validado/concluído — é exatamente o estado que a durabilidade existe para não perder, então não pode conviver com uma segunda execução paralela |
| `completed` | Não | Fora do índice (terminal) | Nenhuma — decisão de design | Tentativa concluída com sucesso; uma nova tentativa intencional é sempre uma nova decisão explícita, nunca automática |
| `failed` | Não | Fora do índice (terminal) | Nenhuma — decisão de design | Libera o slot para retry manual sob nova `attemptOperationKey`; nenhuma retentativa automática existe |
| `cancelled` | Não | Fora do índice (terminal) | Nenhuma — decisão de design | Cancelamento humano explícito; libera o slot da mesma forma |

Nota sobre a guarda no serviço: nem a unicidade de `attemptOperationKey` nem a de "tentativa
ativa" têm uma verificação independente por `SELECT` prévio no código — ambas dependem
inteiramente da constraint do banco, classificada depois via inspeção do erro `P2002`. Isso é
consistente com o padrão já usado em `radarKnownEntityService.ts`, mas significa que a garantia
real vive na migração aplicada, não no código TypeScript por si só — risco remanescente registrado
abaixo.

### Retomada de posse — confirmações

Lidos `reclaimExpiredAttempt` e todos os chamadores reais (só os testes de
`G-analysis-attempt-concurrency.test.ts`; nenhum agendador ou worker existe). Confirmado:
- Aquisição concorrente: `claimAttempt` usa `SELECT...FOR UPDATE` seguido de `UPDATE` condicionado
  a `status='pending'` — duas reivindicações simultâneas produzem exatamente um vencedor
  (comprovado no teste "claim concorrente").
- Rejeição de trabalhador antigo: `reclaimExpiredAttempt` sempre gera um `claimToken` NOVO; o
  antigo, usado depois em `preserveResult`, é rejeitado porque a condição exige o `claimToken`
  atual (teste "trabalhador antigo").
- Verificação temporal após espera por trava: `clock_timestamp()` é avaliado dentro da própria
  instrução `UPDATE` condicionada, nunca reaproveitado de uma leitura anterior — comprovado no
  teste "espera por trava ultrapassando a expiração", em que a operação obtém a trava só depois do
  prazo já vencido e é recusada mesmo assim.
- Autorização para retomar: `claimAttempt`/`concludeAttempt`/`runSimulatedAnalysis` sempre
  recarregam `requestedByUserId` do registro autoritativo (`RadarAnalysisRequest`) e chamam o
  resolvedor de novo a cada operação — nenhuma autorização é cacheada entre passos.
- Resultado durável retomado sem nova chamada ao provedor: comprovado no teste "recuperação de
  resultado durável" (`F-analysis-end-to-end.test.ts`) — `concludeAttempt` lê
  `preservedResultPayload` já gravado, nunca invoca `executor` de novo.
- Envio sem resultado durável mantido como ambíguo: comprovado no teste "falha do provedor" — se o
  executor lança antes de `preserveResult`, a tentativa fica presa em `running`, sem marcação
  automática de `failed` e sem qualquer nova chamada disparada por este serviço.
- Recuperação idempotente sem tentativa nova: `getRadarAnalysisAttempt`/`getRadarRecommendation`
  são leituras puras — nunca alteram `status`, nunca chamam o executor, nunca criam registro.

Distinção confirmada no código: **recuperar o resultado** (`getRadarAnalysisAttempt`/
`getRadarRecommendation`, leitura pura) é diferente de **retomar a conclusão**
(`concludeAttempt` sobre uma tentativa já em `provider_responded_pending_persistence`, sem chamar
o executor), que é diferente de **criar nova tentativa** (`createOrRecoverIntentionalAttempt` com
`attemptOperationKey` nova, sujeita à guarda de unicidade corrigida acima), que é diferente de
**executar novamente** (uma nova chamada ao `executor`, que só acontece dentro de
`runSimulatedAnalysis` para uma tentativa que acabou de ser reivindicada via `claimAttempt` —
nunca automaticamente a partir de expiração, cancelamento ou falha de persistência). Nenhum
caminho do código converte expiração, cancelamento ou falha em autorização automática para nova
chamada ao provedor — confirmado por leitura direta de `reclaimExpiredAttempt`,
`requestAttemptCancellation` e do bloco de tratamento de falha em `concludeAttempt`, nenhum dos
quais dispara `executor` nem cria `RadarAnalysisAttempt`.

### Testes e typecheck desta rodada

| Suíte | Comando | Resultado |
|---|---|---|
| radarSocial completo (com a correção e o novo teste de regressão) | `tsx --test apps/api/src/services/radarSocial/__tests__/*.test.ts` | **107/107 passaram**, exit 0 |
| signalForward (D5/D6/fingerprint), regressão | `tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts` | **129/129 passaram**, exit 0 — nenhuma regressão |

Typecheck (`tsc --noEmit -p apps/api/tsconfig.json`, TypeScript 5.9.3, mesma instalação local):
baseline reconstruída revertendo, no próprio arquivo, só as duas edições desta rodada em
`E-analysis-request-and-attempt-lifecycle.test.ts` (import novo + teste novo) — estado local
imediatamente anterior a esta rodada, não HEAD. Antes: 431 erros. Depois: 431 erros. `diff` entre
as duas listas ordenadas de diagnósticos: **vazio**. Nenhum diagnóstico novo, nenhum resolvido.
Esses 431 diagnósticos são os mesmos já presentes antes de qualquer trabalho do Radar Social nesta
árvore de trabalho — não são zero, e esta rodada não afirma typecheck global limpo, só ausência de
diagnóstico novo atribuível a ela.

### Preservação confirmada

Hashes SHA-256 coletados antes de qualquer alteração desta rodada, para os 40 arquivos `.ts`
relevantes (D5/D6 e fingerprint de signalForward, os 19 arquivos de radarSocial, `schema.prisma`)
e comparados depois: **exatamente um arquivo mudou**
(`E-analysis-request-and-attempt-lifecycle.test.ts`, a correção desta rodada) — todo o resto,
incluindo a unidade entidade/material e D5/D6, permanece byte a byte idêntico.

### Reconciliação de arquivos e migrações

`packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/` pertence à
unidade **entidade/material** (Atualização 1.10), não a D6 — D6 (Human Confirmation) tem sua
própria migração, `20260912190837_add_human_confirmation/`. A migração desta unidade (pacote A) é
só `20260917110146_add_radar_analysis_request_attempt_recommendation/`, editada nesta rodada.

### Limitações remanescentes (adicional à Atualização 1.19)

A garantia de "uma tentativa ativa por solicitação" e a de unicidade de `attemptOperationKey`
vivem inteiramente na migração aplicada, sem verificação independente no código TypeScript — uma
migração aplicada incorretamente (ou revertida) removeria a proteção sem que nenhum teste unitário
isolado do serviço detectasse isso; só os testes de integração contra o banco real (`E`, `G`)
cobrem essa garantia hoje. Nenhum mecanismo durável tipo `RunEvent` para a resposta bruta do
provedor foi integrado (proposta, não integrada, como já registrado na Atualização 1.12).

### Veredito do pacote A local

- **Fluxo local com substitutos verificado**: material persistido → análise simulada → recomendação
  persistida → recuperação sem nova análise funciona de ponta a ponta, com 107/107 testes reais
  contra PostgreSQL descartável, incluindo agora a guarda correta de tentativa única cobrindo os
  três estados não terminais.
- **Qualidade de modelo real não avaliada**: nenhuma chamada real a modelo/provedor ocorreu em
  nenhum teste; o executor/provedor é sempre um duplo controlado. Nada aqui mede latência, custo,
  taxa de acerto ou robustez de um modelo real.
- **Operação para clientes não autorizada**: nenhum resolvedor real de acesso, rota HTTP, fila,
  worker ou provisionamento de agente existe. Esta correção não amplia a autorização concedida —
  fecha uma lacuna encontrada na implementação já autorizada.

### Próxima entrega — proposta, não implementada

Prioridade recomendada: **resolvedor real de acesso autorizado** (substituindo os duplos de teste
em `radarEntityAccessResolver.ts`) seguido de um **caminho seguro de execução** (o processo que de
fato chama `claimAttempt`/`runSimulatedAnalysis` fora de teste, com uma fonte real de
`generationConfig`/agente).

- Dependências: decisão sobre qual mecanismo de RBAC/membership existente (ou novo) deve alimentar
  o resolvedor por entidade; decisão sobre override de retries por chamada em `completionEngine.ts`
  (pendência desde a Atualização 1.14), antes de qualquer chamada real ao provedor.
- Componentes candidatos: RBAC/`TenantMembership` já usados por `assertRadarSocialOperationAuthorized`
  como base de authorship; políticas específicas de escopo por entidade ainda a desenhar (não
  existe hoje granularidade por entidade em nenhum componente do Core).
- Critérios de aceite propostos: resolvedor real cobre os seis outcomes já definidos em
  `RADAR_ENTITY_ACCESS_OUTCOMES`; testado com RBAC real (não substituto) em pelo menos um cenário
  de revogação em voo; nenhuma mudança de comportamento nos três valores de `operation` já
  existentes (`read`/`write`/`manage`); execução do pacote A continua exigindo executor substituto
  até decisão humana separada sobre o provedor real.

Esta seção é só recomendação — nenhuma implementação foi feita sob ela.

## Atualização 1.21 — desenho curto do resolvedor real de acesso e sua fonte de permissões (17/09/2026)

Fonte: só desenho documental, pedido explicitamente como continuação da Atualização 1.20 ("próxima
entrega — proposta"). Nenhum código, migração ou teste foi criado sob esta atualização. Objetivo
do pedido: sair do acesso simulado nos testes (`alwaysAuthorizedResolver`/`fixedOutcomeResolver`)
para definir quais pessoas da empresa (B2B) podem consultar materiais, solicitar análises e
recuperar recomendações de uma `RadarKnownEntity` específica.

### Por que nenhum componente existente resolve isto sozinho

Levantamento no schema atual: `TenantMembership` (papel `role`/`customRoleId` via
`RolePermission`) é *tenant-wide*, sem granularidade de workspace nem de entidade — responde só
"esta pessoa pertence a este tenant e com que papel geral", não "esta pessoa pode ver ESTA
entidade". `TenantActionPolicy` (usada por `checkScopePermission`/`grantScope` nos testes) é
*workspace-wide* por `actionName` — responde "esta ação está ligada neste workspace", não
"para quem". Nenhum dos dois tem coluna de entidade. Isso confirma, com evidência de schema, o que
já estava registrado como suspeita nas Atualizações 1.9/1.20: **não existe hoje nenhum mecanismo
de concessão por entidade em nenhum componente do Core** — o resolvedor real precisa de um modelo
novo, não de reaproveitar um existente disfarçado.

### Modelo novo proposto: `RadarEntityAccessGrant`

Um grant = uma linha por `(entidade, usuário, operação)`. Cada operação (`read`, `write`,
`manage`, `analyze` — os MESMOS quatro valores já existentes em
`RadarEntityAccessInput.operation`, nenhum novo introduzido) é concedida/revogada
independentemente; uma pessoa pode ter `read` sem ter `analyze`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (cuid) | — |
| `tenantId`, `workspaceId` | String | Mesmo par de toda tabela do Radar |
| `entityId` | String | FK composta para `RadarKnownEntity[id,tenantId,workspaceId]`, mesmo padrão já usado por `RadarMaterial`/`RadarAnalysisRequest` |
| `granteeUserId` | String | FK para `User` — a pessoa que recebe o acesso |
| `operation` | String | Fechado a `read`\|`write`\|`manage`\|`analyze` — validado no contrato, nunca livre |
| `enabled` | Boolean, default `true` | Estado atual do grant — **mesmo padrão já usado por `WorkspaceAgentAssignment`** (toggle idempotente, nunca acumula linhas duplicadas por reconcessão) |
| `grantedByUserId` | String | Quem concedeu — sempre um `manage` válido no momento da concessão |
| `grantedAt` | DateTime | — |
| `revokedByUserId` | String? | Nulo enquanto `enabled=true` |
| `revokedAt` | DateTime? | Nulo enquanto `enabled=true` |

Constraint proposta: `@@unique([tenantId, workspaceId, entityId, granteeUserId, operation])` — no
máximo uma linha por tupla; conceder de novo depois de revogar reativa a MESMA linha (`enabled`
volta a `true`, `revokedAt`/`revokedByUserId` voltam a nulo, `grantedByUserId`/`grantedAt`
atualizados), nunca cria uma segunda. Índice de leitura:
`@@index([tenantId, workspaceId, entityId, granteeUserId, enabled])`, já que essa é exatamente a
consulta do resolvedor em tempo real.

**Bypass do criador, sem linha própria**: `RadarKnownEntity.createdByUserId` (campo já existente,
Atualização 1.10) concede implicitamente as quatro operações ao criador, sem exigir grant
explícito — decisão de design, não de conveniência: a entidade já registra autoritativamente quem
a criou, duplicar isso numa linha de grant seria dado redundante e mutável onde o original é
imutável.

### Operações de concessão/revogação

- `grantRadarEntityAccess({ tenantId, workspaceId, actorUserId, entityId, granteeUserId, operation })`:
  exige que `actorUserId` já tenha `manage` sobre a entidade (criador OU grant `manage` ativo) —
  quem só tem `read`/`write`/`analyze` não pode conceder nada, nem para si mesmo. Idempotente:
  conceder uma operação já ativa é sucesso silencioso (recupera a linha existente), nunca erro.
- `revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId, entityId, granteeUserId, operation })`:
  mesma exigência de `manage`. Idempotente: revogar algo já revogado ou nunca concedido é sucesso
  silencioso. Não é capaz de revogar o bypass do criador (não é uma linha) — revogar o criador
  exigiria outra decisão (transferência de titularidade), fora deste desenho.
- **Guarda ainda não decidida, registrada aqui para ratificação humana**: revogar o único grant
  `manage` restante de uma entidade cujo criador não é mais membro ativo do tenant deixaria a
  entidade sem ninguém capaz de conceder acesso novo. Proposta (não decidida): bloquear essa
  revogação especificamente (fail-closed), análogo ao princípio já usado em `claimAttempt`/
  `preserveResult` de nunca aceitar uma transição que produz um estado sem dono. Precisa de
  decisão explícita antes da implementação.

### `resolveRadarEntityAccess` — implementação real proposta para `RadarEntityAccessResolver`

Nenhum outcome novo — reaproveita integralmente `RADAR_ENTITY_ACCESS_OUTCOMES` já definido em
`radarEntityAccessResolver.ts`:
1. Carrega a entidade por `(entityId, tenantId, workspaceId)` — ausente ou fora do escopo →
   `entity_not_found`/`entity_out_of_scope`, sem vazar existência entre tenants (mesma regra já
   ratificada).
2. `entity.createdByUserId === confirmedIdentity` → `authorized`, sem consultar
   `RadarEntityAccessGrant`.
3. Senão, busca a linha `(tenantId, workspaceId, entityId, granteeUserId=confirmedIdentity,
   operation, enabled=true)` — encontrada → `authorized`; ausente → `access_denied`.
4. Erro de infraestrutura (ex.: falha de conexão ao consultar o grant) → `resolver_unavailable`/
   `resolution_failed` — nunca confundido com "grant ausente", que é sempre `access_denied`.

**Ponto em aberto explícito, não decidido aqui**: hoje, dentro do pacote A,
`preserveResult` (`radarAnalysisAttemptService.ts`) NÃO chama o resolvedor de novo — só
`claimAttempt`, `concludeAttempt`, `runSimulatedAnalysis` e as leituras (`getRadarAnalysisAttempt`/
`getRadarRecommendation`) chamam. Isso é inofensivo com o executor substituto (chamada síncrona,
sem janela real de revogação entre `claim` e `preserve`), mas deixa de ser inofensivo quando o
provedor real puder demorar arbitrariamente entre os dois passos. Este desenho não resolve isso —
só registra que a unidade de execução segura (próxima entrega, seção anterior) precisa decidir se
`preserveResult` passa a exigir o resolvedor também, antes de qualquer chamada real a modelo.

### Testes de aceite propostos (nenhum implementado ainda)

1. Criador da entidade: acesso `read`/`write`/`manage`/`analyze` sem nenhum grant explícito.
2. Grant de `read` a um segundo usuário autoriza leitura, mas não `analyze`/`write`/`manage` sem
   grant adicional — operações independentes, nunca implícitas umas nas outras.
3. Revogação em voo: revogar um grant ativo bloqueia a PRÓXIMA chamada que dependa dele
   imediatamente, sem cache — inclusive entre dois passos de uma mesma operação composta (ex.:
   `claimAttempt` autorizado, revogação acontece, `concludeAttempt` releria o resolvedor e
   bloquearia).
4. Concessão idempotente: conceder a mesma operação duas vezes não cria segunda linha nem falha.
5. Revogação idempotente: revogar algo já revogado ou nunca concedido não falha.
6. Só `manage` concede/revoga: um usuário com `read`/`write`/`analyze` tentando conceder acesso a
   outro é rejeitado.
7. Isolamento entre tenants/workspaces: grant concedido em um tenant/workspace nunca autoriza em
   outro, mesmo com o mesmo `granteeUserId`/`entityId` coincidentes por acidente de teste.
8. `entity_not_found`/`entity_out_of_scope` continuam corretos mesmo quando existem grants para
   uma entidade de outro tenant/workspace — nunca vaza existência.
9. `resolver_unavailable`/`resolution_failed` (falha real de infraestrutura) continuam distintos
   de `access_denied` — nunca fail-open em nenhum dos dois.
10. Guarda de esvaziamento total de `manage` (ver seção acima) — teste só depois de decisão humana
    sobre o comportamento correto.

### Dependências e componentes candidatos (sem mudança nesta atualização)

- Migração nova (fora desta atualização): tabela `radar_entity_access_grants` + FK composta para
  `RadarKnownEntity`, seguindo exatamente o padrão de migração aditiva já usado nas três anteriores
  do Radar.
- Reaproveita sem alteração: `RADAR_ENTITY_ACCESS_OUTCOMES`, `RadarEntityAccessInput`,
  `RadarEntityAccessResolver` (a assinatura de função não muda — só passa a ter uma implementação
  real além dos substitutos de teste), `RadarKnownEntity.createdByUserId`.
- Não decide: papel/permissão de administrador de tenant como bypass geral (levantado e
  explicitamente REJEITADO nesta atualização como suposição — não há hoje, em nenhum lugar do
  Core, um marcador de "admin bypassa ACL por recurso" já ratificado; inventar um aqui seria
  repetir o erro já registrado nas Atualizações 1.9/1.11 de presumir autorização sem evidência).

Esta atualização é só desenho — nenhum modelo, migração, resolvedor ou teste foi criado sob ela.
Implementação segue exigindo autorização expressa separada, como todas as anteriores.

## Atualização 1.22 — adendo: quatro decisões para aprovação e delimitação da implementação do resolvedor real (17/09/2026)

Fonte: só documentação, pedida como correção/complemento direto da Atualização 1.21. Nenhum
código, migração ou teste foi criado. Regra de negócio declarada nesta rodada, que baliza as
quatro decisões abaixo: **a empresa controla quem acessa cada entidade, pode retirar esse acesso
a qualquer momento, e consegue identificar quem concedeu ou revogou cada permissão** — inclusive
em relação a quem criou o registro.

### Decisão 1 — Grants iniciais revogáveis para o criador

**Proposto**: revogar a ideia de "bypass do criador sem linha própria" da Atualização 1.21 — ela
violava a própria regra de negócio desta rodada (criador teria acesso permanente e irrevogável,
logo a empresa NÃO controlaria esse acesso). Substituição: ao criar uma `RadarKnownEntity`, o
serviço (`createRadarKnownEntity`) passa também a criar quatro linhas de `RadarEntityAccessGrant`
para `createdByUserId` (uma por operação: `read`, `write`, `manage`, `analyze`), com
`grantedByUserId = createdByUserId` (autoconcessão explícita e registrada, nunca um ato anônimo
"do sistema") e `grantedAt` no mesmo instante da criação. Essas quatro linhas são, a partir daí,
grants como quaisquer outros — revogáveis por qualquer `manage` ativo (inclusive pelo próprio
criador, inclusive por terceiros), sujeitas apenas à guarda da Decisão 3b.

### Decisão 2 — Poderes exatos de quem administra acessos, incluindo autoconcessão

**Proposto**:
- `manage` é um poder único e plano — não existe hierarquia interna (nenhum "owner" acima de
  "manager"). Qualquer `manage` ativo pode conceder ou revogar QUALQUER operação, para QUALQUER
  usuário, incluindo conceder/revogar `manage` de outro `manage` — nenhuma permissão é mais forte
  que outra do mesmo tipo. Inventar uma segunda camada agora repetiria o erro já registrado nas
  Atualizações 1.9/1.11/1.21 de presumir estrutura sem evidência ratificada.
- Autoconcessão é permitida sem restrição: um `manage` pode conceder a si mesmo qualquer operação
  adicional sem segundo aprovador — quem já controla toda a concessão de uma entidade não ganha
  segurança adicional sendo impedido de se autoconceder; só ganharia fricção.
- Autorrevogação é permitida, inclusive da própria `manage`, EXCETO quando violaria a Decisão 3b
  (zerar `manage` ativos da entidade).
- Toda concessão/revogação exige `manage` ativo do `actorUserId` revalidado NO MOMENTO da chamada
  — nunca cacheado entre chamadas, mesma disciplina já aplicada a `claimAttempt`/`concludeAttempt`.

### Decisão 3 — Histórico e recuperação quando não houver gestor elegível

**3a. Histórico** — a linha mutável de `RadarEntityAccessGrant` (estado ATUAL) sozinha perde o
histórico de revogações anteriores quando uma reconcessão sobrescreve `revokedByUserId`/
`revokedAt` de volta a nulo. Isso não satisfaz "a empresa consegue identificar quem concedeu ou
revogou CADA permissão" se isso incluir eventos passados. **Proposto**: cada concessão e cada
revogação também grava um evento em `GuardrailAuditLedger` (tabela genérica já existente,
reaproveitada — nenhuma tabela nova além de `RadarEntityAccessGrant`), com `eventType`
(`radar_entity_access_granted` / `radar_entity_access_revoked`) e `metadata` contendo `entityId`,
`granteeUserId`, `operation` e o ator. A linha de `RadarEntityAccessGrant` continua sendo a fonte
de verdade para a DECISÃO em tempo real do resolvedor (consulta rápida por estado atual); o ledger
é a fonte de verdade para o HISTÓRICO auditável completo. Nenhuma das duas substitui a outra.

**3b. Recuperação sem gestor elegível** — com o criador agora revogável (Decisão 1), é possível
uma entidade chegar a zero `manage` ativos (revogações legítimas em cadeia, ou todos os gestores
saindo do tenant). **Proposto**: bloquear em tempo real, fail-closed, qualquer revogação que
reduziria `manage` ativos da entidade a zero — a última linha `manage` ativa nunca pode ser
revogada pelo fluxo normal de `revokeRadarEntityAccess`, mesmo por autorrevogação. Para o cenário
em que o(s) gestor(es) simplesmente deixaram de ser membros do tenant (não foram revogados, e já
seriam bloqueados por `assertRadarSocialOperationAuthorized` de qualquer forma, mas continuam
"donos" formais do último `manage`): proponho um caminho de recuperação ADMINISTRATIVO separado,
fora do resolvedor e fora do fluxo normal de concessão, condicionado a uma permissão de nível
tenant mais alta — **qual permissão exata ainda não foi mapeada no Core e fica registrado aqui
como pendência explícita**, não decidida nesta atualização. Nenhum bypass silencioso do resolvedor
é proposto para este caso.

### Decisão 4 — Comportamento da resposta em trânsito após revogação

**Proposto, apoiado em leitura direta do código já entregue no pacote A**: `concludeAttempt`
(`radarAnalysisAttemptService.ts`) JÁ rechama o resolvedor (`assertAttemptAccess` com
`operation: "analyze"`) antes de validar e persistir a recomendação — isso já bloqueia
corretamente uma conclusão cuja autorização foi revogada enquanto a resposta do provedor estava em
trânsito, sem exigir nenhuma mudança de código. O ponto que ficara em aberto na Atualização 1.21
era só sobre `preserveResult`, que não rechama o resolvedor. **Decisão proposta**: manter assim,
deliberadamente — preservar a resposta bruta do provedor é captura de EVIDÊNCIA durável, e não
deveria depender de quem está autorizado a CONSUMIR essa evidência agora (mesmo raciocínio já
usado para considerar `RunEvent` como evidência independente da autorização de leitura, Atualização
1.12). Se a autorização for revogada entre `preserveResult` e `concludeAttempt`: a tentativa fica
retida em `provider_responded_pending_persistence` (que agora bloqueia novas tentativas irmãs,
Atualização 1.20) até (i) a autorização ser restaurada — `concludeAttempt` então sucede
normalmente, SEM nova chamada ao provedor — ou (ii) decisão humana explícita de cancelar. Nenhuma
`RadarRecommendation` é criada nem exposta enquanto o acesso permanecer revogado.

### Delimitação da implementação do resolvedor real e seus testes (ainda não autorizada)

Escopo proposto para a PRÓXIMA rodada de implementação, condicionado a autorização expressa
separada, nos mesmos moldes do pacote A:

**Dentro do escopo**:
- Modelo novo `RadarEntityAccessGrant` (campos e constraint conforme Atualização 1.21, ajustado
  pela Decisão 1: sem bypass implícito — os quatro grants do criador são linhas reais, criadas
  pelo próprio serviço de criação da entidade).
- Reaproveitamento de `GuardrailAuditLedger` para histórico (Decisão 3a) — nenhuma tabela nova
  além da acima.
- Serviços novos: `grantRadarEntityAccess`, `revokeRadarEntityAccess`,
  `resolveRadarEntityAccess` (implementação real de `RadarEntityAccessResolver`, mesma assinatura
  de função já existente, sem alterá-la).
- Extensão pontual de `createRadarKnownEntity` (unidade já implementada) para criar os quatro
  grants iniciais do criador na mesma transação da criação da entidade.
- Migração aditiva nova para `radar_entity_access_grants`, seguindo o mesmo padrão das três
  migrações anteriores do Radar.
- Testes: os dez cenários da Atualização 1.21, revisados — cenário 1 passa a testar "grants
  iniciais criados automaticamente na criação, e revogáveis" (não mais bypass implícito); mais:
  autoconcessão e autorrevogação (Decisão 2); guarda de "nunca zerar `manage`" (Decisão 3b);
  histórico gravado em `GuardrailAuditLedger` a cada concessão/revogação (Decisão 3a);
  `preserveResult` não bloqueado por revogação e `concludeAttempt` bloqueado, com posterior
  recuperação sem nova chamada ao provedor após reconcessão (Decisão 4). Mesma técnica de
  PostgreSQL descartável e coordenação determinística já usada no pacote A.

**Fora do escopo, explicitamente**: nenhuma chamada real a modelo/provedor; nenhuma fila ou
worker operacional; nenhuma rota HTTP ou cliente real; nenhuma integração Instagram; nenhum
provisionamento de agente; o caminho de recuperação administrativa da Decisão 3b (pendente de
mapeamento de permissão no Core, registrado ali, não implementado nesta unidade).

Esta atualização não autoriza implementação — apresenta as quatro decisões para aprovação humana e
delimita o que a próxima rodada cobriria, caso e quando autorizada.

## Atualização 1.23 — três esclarecimentos de concorrência sobre as Decisões 2, 3b e 4 (17/09/2026)

Fonte: só documentação, no mesmo pacote de desenho do resolvedor real (Atualizações 1.21/1.22),
sem reabrir nenhuma outra parte do Radar Social. As quatro decisões da Atualização 1.22 fixaram a
POLÍTICA; esta atualização fixa o PROTOCOLO de concorrência para as três decisões cuja política,
sozinha, ainda permitia uma corrida real (checar-depois-agir) capaz de violar a própria política
aprovada. Cada esclarecimento seguiu o mesmo padrão já usado no pacote A: identificar a corrida
antes de propor o protocolo, nunca presumir que "ter uma condição no SQL" já garante atomicidade.

### Esclarecimento A — concorrência de concessão/revogação (Decisão 2)

**Corrida**: duas chamadas concorrentes de `grantRadarEntityAccess`/`revokeRadarEntityAccess` para
a MESMA tupla `(entityId, granteeUserId, operation)` — por exemplo, um gestor concede `analyze`
enquanto outro revoga `analyze` para a mesma pessoa, ao mesmo tempo. Uma implementação em dois
passos (`SELECT` para achar a linha, depois `INSERT` ou `UPDATE` conforme o resultado) teria uma
janela clássica de leitura-depois-escrita.

**Protocolo proposto**: uma única instrução `INSERT ... ON CONFLICT (tenant_id, workspace_id,
entity_id, grantee_user_id, operation) DO UPDATE SET enabled=..., granted_by_user_id=...,
granted_at=..., revoked_by_user_id=..., revoked_at=...` — nunca leitura seguida de decisão em
código. O Postgres serializa as duas chamadas concorrentes na mesma linha automaticamente (a
segunda espera a primeira liberar a linha); não é necessário `claimToken` nem `clock_timestamp()`
aqui, porque não há posse de execução em jogo — só o estado final determinístico "quem gravou por
último". Nenhuma das duas chamadas falha; nenhuma duplica linha.

**Testes de concorrência propostos**:
1. Duas concessões concorrentes da mesma operação para a mesma pessoa: exatamente uma linha,
   `enabled=true`, nenhum erro em nenhuma das duas chamadas.
2. Concessão e revogação concorrentes da mesma tupla: ambas as chamadas retornam sucesso; o estado
   final é determinístico e corresponde a quem commitou por último — nunca erro, nunca duas linhas.

### Esclarecimento B — concorrência da guarda "nunca zerar manage" (Decisão 3b)

**Corrida**: com exatamente dois `manage` ativos numa entidade, duas revogações concorrentes visando
os DOIS gestores diferentes poderiam, numa implementação ingênua (`SELECT COUNT(*) ...` antes de
decidir), ambas verem contagem 2, ambas concluírem "não sou o último" e ambas revogarem — zerando
`manage` mesmo com a guarda "implementada".

**Protocolo proposto**, no mesmo espírito do passo "iniciar tentativa" do pacote A: dentro de uma
transação, `SELECT id FROM radar_entity_access_grants WHERE tenant_id=... AND workspace_id=...
AND entity_id=... AND operation='manage' AND enabled=true FOR UPDATE` — trava TODAS as linhas
`manage` ativas da entidade (não só a linha alvo), forçando qualquer revogação concorrente de
`manage` na MESMA entidade a esperar essa transação terminar. Depois de obter a trava: se o
conjunto travado tiver exatamente 1 linha e for a própria linha-alvo, rejeita com
`cannot_revoke_last_manage_grant`; senão, revoga normalmente. `COMMIT` libera a trava para a
próxima revogação concorrente, que então enxerga o estado já atualizado.

**Testes de concorrência propostos**:
3. Dois gestores existentes (nenhum outro `manage`): revogação concorrente de um contra o outro —
   exatamente uma sucede, a outra é rejeitada com `cannot_revoke_last_manage_grant`, nunca as duas
   sucedendo nem as duas sendo rejeitadas.
4. Três gestores existentes, dois revogados concorrentemente (ambos non-last no início): ambas
   sucedem, sobra exatamente um `manage` ativo — a trava serializa, mas não deveria BLOQUEAR
   revogações que continuam seguras mesmo em série.

### Esclarecimento C — concorrência entre revogação e conclusão em trânsito (Decisão 4)

**Corrida**: `concludeAttempt` já rechama o resolvedor antes de validar/persistir (Decisão 4, base
corrigida sem mudança de código) — mas essa chamada é uma leitura isolada, ANTES da transação que
grava a `RadarRecommendation`. Entre essa leitura e o `COMMIT` da escrita final, uma revogação
concorrente da mesma operação (`analyze`) poderia commitar no meio, e `concludeAttempt` terminaria
usando uma autorização já obsoleta no instante da escrita — checar-depois-agir clássico, o mesmo
tipo de corrida que o protocolo de `claimToken` já existe para evitar entre `preserveResult` e
`concludeAttempt` no nível da tentativa.

**Protocolo proposto**: quando o resolvedor real existir, `concludeAttempt` passa a adquirir
`SELECT ... FOR UPDATE` sobre a(s) linha(s) de `RadarEntityAccessGrant` relevante(s)
(`operation='analyze'`, `granteeUserId=requestedByUserId`) DENTRO da MESMA transação que já trava
a linha de `radar_analysis_attempts` (mesmo bloco `$transaction`, mesma ordem de aquisição de
travas já usada — primeiro a tentativa, depois o grant, para nunca inverter ordem de lock entre
chamadas e criar deadlock), e reconfirma `enabled=true` IMEDIATAMENTE antes da escrita condicionada
final, não só no início da função. Uma revogação concorrente da mesma linha, chegando depois que
`concludeAttempt` já a travou, espera o `COMMIT`/`ROLLBACK` de `concludeAttempt` antes de aplicar —
nunca as duas operações avançam de forma intercalada sobre a mesma linha.

**Política de ordenação temporal explícita**: revogação é sempre PROSPECTIVA. Se `concludeAttempt`
vence a corrida (commita primeiro), a `RadarRecommendation` já persistida NUNCA é desfeita
retroativamente por uma revogação que chega depois — revogar bloqueia acesso e conclusões
FUTURAS, nunca apaga o que já foi produzido enquanto a autorização era válida. Isso vale também
para leitura: revogar `read` depois de uma recomendação já existir bloqueia leituras futuras
(`getRadarRecommendation` já rechama o resolvedor a cada chamada — comportamento já existente,
confirmado, sem mudança necessária), sem apagar o registro em si.

**Testes de concorrência propostos**:
5. Revogação commitada ANTES de `concludeAttempt` iniciar sua transação: `concludeAttempt`
   rejeitado, nenhuma recomendação criada (caso-base da Decisão 4, sem corrida real).
6. Revogação disparada enquanto `concludeAttempt` já detém a trava da linha de grant: a revogação
   fica bloqueada (observável via `pg_stat_activity`, mesma técnica determinística já usada no
   pacote A) até `concludeAttempt` commitar; depois de liberar, a revogação aplica normalmente e
   passa a valer para a PRÓXIMA tentativa/conclusão, sem desfazer a recomendação já criada.
7. Ordem invertida do teste 6: revogação adquire a trava primeiro (força artificialmente via
   trava de linha, mesma técnica de `holdAttemptRowLock`) — `concludeAttempt` espera, e ao obter a
   trava depois, encontra o grant já revogado e rejeita, sem criar recomendação.

### Nota de implementação (ainda não autorizada)

Os protocolos A e B afetam só os dois serviços novos (`grantRadarEntityAccess`/
`revokeRadarEntityAccess`); o protocolo C exige uma alteração pontual dentro de `concludeAttempt`
para incorporar o `SELECT ... FOR UPDATE` do grant na mesma transação — alteração cirúrgica, sem
mudar a assinatura da função nem o comportamento já testado no pacote A para os casos sem
revogação em voo. Nenhuma dessas mudanças foi feita nesta atualização; todas ficam registradas
como parte do escopo já delimitado na Atualização 1.22, agora com protocolo de concorrência
explícito em vez de só política declarada. Implementação continua exigindo autorização expressa
separada — modelo real de linguagem, fila operacional, rotas HTTP e clientes reais continuam fora
de qualquer escopo autorizado até aqui.

**Superado pela Atualização 1.24**: o Esclarecimento B (trava sobre "todas as linhas `manage`
ativas" da entidade) e o Esclarecimento C (trava sobre a linha específica de
`RadarEntityAccessGrant` dentro de `concludeAttempt`) são substituídos por um único ponto de
serialização comum — a linha de `RadarKnownEntity` — descrito na Atualização 1.24. O Esclarecimento
A (upsert único, sem leitura-depois-escrita) permanece válido, mas sua conclusão "resultado final
sempre determinístico" é corrigida na mesma atualização. Este registro é preservado como
histórico, não apagado.

## Atualização 1.24 — fechamento do protocolo de concorrência: ponto de serialização único, resultados corrigidos e pacote para aprovação (17/09/2026)

Fonte: revisão dirigida desta sessão sobre a Atualização 1.23 efetivamente gravada, no mesmo
worktree/branch/HEAD, nenhum código/schema/migration/teste alterado — só este documento. Escopo
estritamente o protocolo de concorrência do resolvedor de acesso; nenhum outro contrato do Radar
foi reaberto.

### 1. Ponto de serialização único: a linha de `RadarKnownEntity`

Avaliação pedida: a linha de `RadarKnownEntity` existe mesmo antes de qualquer
`RadarEntityAccessGrant` (uma entidade recém-criada ainda não tem grants além dos iniciais, que
nascem na MESMA transação da criação — nada para travar contra). Ela já é o ponto por onde toda
concessão/revogação passa (todas filtram por `entityId`), e pode coordenar as três operações do
Esclarecimento B/C de uma vez, em vez de cada uma inventar seu próprio escopo de trava (linhas
`manage`, ou uma linha de grant específica). **Correção proposta**: os Esclarecimentos B e C da
Atualização 1.23 são substituídos por um único protocolo: `SELECT id FROM radar_known_entities
WHERE id=$entityId AND tenant_id=$tenantId AND workspace_id=$workspaceId FOR UPDATE`, adquirida
por `grantRadarEntityAccess`, `revokeRadarEntityAccess` e `concludeAttempt` (quando revalida
`analyze`) — nunca por `claimAttempt`, `preserveResult`, `reclaimExpiredAttempt` ou pelas leituras
(`getRadarAnalysisAttempt`/`getRadarRecommendation`), que continuam sem travar nada (justificativa
na tabela abaixo). Sob essa única trava, uma leitura comum (sem `FOR UPDATE` adicional) das linhas
de `RadarEntityAccessGrant` da entidade já é segura — nenhum outro escritor pode estar no meio de
uma escrita sobre grants dessa entidade enquanto a trava estiver retida, então a trava adicional
sobre linhas de grant proposta nos Esclarecimentos B/C deixa de ser necessária.

**Ordem efetivamente implementada nas tentativas, conferida nesta rodada**: `claimAttempt`,
`preserveResult` e `reclaimExpiredAttempt` (`radarAnalysisAttemptService.ts`) travam SÓ
`radar_analysis_attempts`, nunca `radar_known_entities`. `concludeAttempt` hoje trava SÓ
`radar_analysis_attempts` (a nova trava de entidade ainda não existe — proposta aqui). Nenhum
caminho hoje trava `radar_known_entities` antes de `radar_analysis_attempts`. Como
`grantRadarEntityAccess`/`revokeRadarEntityAccess` NUNCA tocam `radar_analysis_attempts` (só
entidade + grants), o único caminho que adquire as duas travas é `concludeAttempt`, sempre na
ordem tentativa → entidade — não há nenhum caminho concorrente que adquira entidade → tentativa,
logo não há inversão de ordem possível entre os caminhos existentes e os propostos.

| Operação | Ordem atual | Ordem proposta | Revalidações após espera | Alteração futura necessária |
|---|---|---|---|---|
| Criar entidade + grants iniciais | Sem trava (entidade ainda não existe para ninguém travar) | Sem trava — `INSERT` da entidade e dos 4 grants na mesma transação; nada preexistente pode colidir com um `entityId` ainda não commitado | Nenhuma (não há espera) | `radarKnownEntityService.ts`, símbolo `createRadarKnownEntity` — inserir as 4 linhas de grant na mesma transação da criação |
| Conceder acesso | N/A (serviço não existe) | Trava a entidade PRIMEIRO, depois upsert condicionado da linha de grant | Reconfirma entidade no escopo certo; revalida `manage` vigente do `actorUserId` (nunca a checagem feita antes da espera) | Novo arquivo `radarEntityAccessGrantService.ts`, símbolo `grantRadarEntityAccess` |
| Revogar acesso | N/A (serviço não existe) | Mesma trava de entidade PRIMEIRO, depois recontagem de `manage` ativos + escrita condicionada | Revalida identidade/membership, `manage` vigente do solicitante, e só então reconta `manage` ativos sob a trava para a guarda do último gestor | Mesmo arquivo, símbolo `revokeRadarEntityAccess` |
| Concluir recomendação | Trava só `radar_analysis_attempts` | Mantém a trava de tentativa PRIMEIRO (comportamento já testado, sem inversão), acrescenta trava de entidade DEPOIS, na mesma transação | Revalida `analyze` vigente do `requestedByUserId` sob a trava de entidade E o `claimToken`/status/prazo da tentativa — as duas condições devem valer juntas no instante da escrita final | `radarAnalysisAttemptService.ts`, símbolo `concludeAttempt` — trava adicional + revalidação, sem mudar assinatura nem o comportamento já coberto sem revogação em voo |
| `claimAttempt`, `preserveResult`, `reclaimExpiredAttempt`, leituras (`getRadarAnalysisAttempt`/`getRadarRecommendation`) | Travam só `radar_analysis_attempts` (as três primeiras) ou nada (leituras) | Sem mudança — nenhuma trava de entidade | N/A | Nenhuma — essas operações já revalidam autorização a cada chamada, sem efeito colateral irreversível que precisasse ser desfeito; só a persistência da recomendação (em `concludeAttempt`) é irreversível o suficiente para justificar a trava adicional |

Nenhuma trava foi introduzida em operação que não precisa dela: a justificativa acima é a mesma em
todas as linhas — trava-se exatamente onde um efeito irreversível (gravar um grant, gravar uma
recomendação) poderia ser decidido com autorização já obsoleta.

### 2. Concessão e revogação concorrentes — correção de "resultado final sempre determinístico"

A afirmação da Atualização 1.23 ("o estado final é determinístico e corresponde a quem commitou
por último") estava incompleta: é verdadeira SÓ no sentido de que o resultado sempre corresponde a
uma ordem serial válida (nunca um estado corrompido ou intercalado) — mas QUAL das duas ordens
serialize primeiro não é previsível nem controlável por quem chama, e "determinístico" não
significa "sem nenhuma chamada recusada". Corrigido caso a caso, sob o protocolo da seção 1:

- **Duas concessões iguais** (mesma tupla): a segunda, ao adquirir a trava depois da primeira
  commitar, encontra a linha já `enabled=true` — sua escrita é condicionada a
  `WHERE enabled=false` (transição real), não casa, ZERO linhas afetadas → **não é erro**: retorna
  sucesso (recuperação idempotente), mas NÃO grava um segundo evento de auditoria — só a primeira
  chamada, que efetivamente transicionou o estado, é auditada. Diferença explícita entre
  repetição sem mudança de estado (esta) e uma nova alteração (a primeira chamada).
- **Duas revogações iguais**: mesma lógica, espelhada (`WHERE enabled=true` na condição de
  revogar) — a segunda é um no-op de sucesso, sem segundo evento de auditoria.
- **Concessão e revogação opostas**: serializam por completo sob a trava de entidade — quem
  adquire a trava primeiro conclui sua transação inteira (escrita + auditoria) antes da segunda
  sequer ler o estado. O resultado final é sempre um dos dois estados válidos (concedido ou
  revogado), nunca um terceiro estado — mas QUAL dos dois não é previsível pelo chamador; ambas as
  chamadas retornam sucesso (nenhuma "perde" com erro só por ter chegado depois — cada uma reflete
  fielmente o que aconteceu na sua vez).
- **Reconcessão após revogação**: transição real (`enabled` false→true) — grava novo evento de
  auditoria "concedido", com `grantedByUserId`/`grantedAt` atualizados e
  `revokedByUserId`/`revokedAt` voltando a nulo. Diferente dos casos de no-op acima porque HÁ
  mudança de estado.
- **Solicitante perde `manage` enquanto espera**: revalidado na seção 1 (revalidação após espera)
  — a chamada que esperou usa SEMPRE o `manage` revalidado sob a trava, nunca o verificado antes
  de entrar na fila de espera. Se já não tem `manage` no instante em que a trava é finalmente
  obtida, a chamada é recusada por autorização, nunca chega a decidir sobre conceder/revogar.

**Garantias específicas, sem prometer ausência de qualquer erro**:
- Ausência de linhas duplicadas: `@@unique([tenantId, workspaceId, entityId, granteeUserId,
  operation])` continua sendo a garantia de última linha; sob a trava de entidade, na prática
  nenhuma escrita concorrente chega a disputar essa constraint no banco (a trava já serializou
  antes), mas o classificador de violação de unicidade (mesmo padrão de
  `isAttemptOperationKeyUniqueViolation`) permanece como defesa em profundidade, nunca expondo o
  erro interno do driver ao chamador.
- Recusas de autorização (`actorUserId` sem `manage` vigente) e recusas de política (última linha
  `manage`, reasonCode `cannot_revoke_last_manage_grant`) são resultados LEGÍTIMOS da chamada —
  tipos de erro distintos, propostos como `RadarEntityAccessGrantAuthorizationError` (autorização)
  e `RadarEntityAccessGrantConflictError` (política), mesmo padrão de nomenclatura já usado por
  `RadarAnalysisAttemptConflictError`.
- Auditoria coerente com a transição efetivamente persistida: só se grava evento em
  `GuardrailAuditLedger` quando a escrita condicionada afeta 1 linha (transição real) — nunca em
  um no-op idempotente, medido pela mesma técnica de "linhas afetadas" já usada em `claimAttempt`/
  `preserveResult` (`$executeRaw` retorna a contagem).
- Estado e registro de auditoria atômicos: a escrita do grant e o evento em
  `GuardrailAuditLedger` acontecem dentro da MESMA transação — se qualquer verificação posterior
  (ex.: a guarda do último gestor) reprovar depois de a escrita já ter sido tentada em código, a
  transação inteira é descartada (`ROLLBACK`), nunca um evento de auditoria órfão para uma
  transição que não se efetivou.

Nenhuma política de auditoria nova foi criada silenciosamente — a regra "só audita transição real"
é a única proposta, declarada aqui, não implícita.

### 3. Último gestor e autorização do solicitante — revogações cruzadas

Protocolo completo para `revokeRadarEntityAccess` (mesmo vale, com "manage" trocado por "analyze
do requestedByUserId", para a revalidação em `concludeAttempt`):

1. `BEGIN`.
2. `SELECT ... FROM radar_known_entities WHERE id=... FOR UPDATE` — adquire a trava única.
3. Revalida, nesta ordem, TODAS sob a trava já obtida (nunca reaproveitando uma checagem anterior
   à espera): (a) `TenantMembership` do `actorUserId` ainda válida; (b) escopo de workspace
   (`radar_social.entities.manage` ou equivalente) ainda permitido; (c) `actorUserId` ainda tem
   `manage` ativo sobre ESTA entidade (leitura de `RadarEntityAccessGrant`, agora segura sob a
   trava).
4. Se QUALQUER revalidação da etapa 3 falhar → recusa por autorização, `ROLLBACK`, nunca chega à
   etapa 5.
5. Se a operação-alvo for `manage`: reconta `manage` ativos da entidade (leitura fresca, sob a
   trava) — exatamente 1 e é a linha-alvo → recusa por política
   (`cannot_revoke_last_manage_grant`), `ROLLBACK`.
6. Só agora decide e escreve a revogação (+ auditoria atômica, seção 2). `COMMIT` libera a trava.

**Demonstração — revogações cruzadas, só dois gestores (A e B)**: gestor A tenta revogar `manage`
de B; gestor B tenta revogar `manage` de A; concorrentes. Suponha que a transação de A adquire a
trava primeiro: etapa 3 confirma A ainda tem `manage` (nada mudou ainda) → etapa 5: recontagem =
{A, B} = 2, alvo é B, não é o último → permitido → revoga B, audita, `COMMIT`. A transação de B,
que esperava a trava, agora a adquire: etapa 3 revalida B — mas o `manage` de B **acabou de ser
revogado pela transação de A que acabou de commitar** → falha de autorização → `ROLLBACK` — B
NUNCA chega a decidir sobre revogar A. Resultado: exatamente uma revogação sucede (a de quem
venceu a corrida pela trava), a outra é recusada por PERDA DE AUTORIZAÇÃO (não por política de
último gestor) — nunca as duas sucedendo, nunca as duas falhando, nunca a entidade ficando sem
`manage`. Se a ordem de aquisição da trava fosse invertida (B primeiro), o resultado é o mesmo
com os papéis trocados.

**Fronteira exata da garantia, declarada explicitamente**: a trava de `RadarKnownEntity` só
serializa escritores que a adquirem explicitamente — `grantRadarEntityAccess`,
`revokeRadarEntityAccess` e `concludeAttempt`. Ela NÃO participa de, nem serializa, alterações de
`TenantMembership` (saída do tenant), `TenantActionPolicy` (escopo de workspace) ou qualquer outro
sistema de permissão externo a este protocolo — essas mudanças acontecem em transações próprias,
sem tocar `radar_known_entities`. A garantia real é: toda decisão deste protocolo usa dados
LIDOS DE NOVO depois de obter a trava (nunca reaproveitados de antes da espera) — não que
mudanças externas concorrentes estejam serializadas ou sejam atômicas com este protocolo. Um
gestor que sai do tenant enquanto ainda detém a única linha `manage` ativa (grant não revogado,
só a membership removida por outro caminho) deixa a entidade num estado onde a guarda do último
gestor continua "satisfeita" tecnicamente (a linha `manage` ainda existe e está `enabled=true`),
mas ninguém elegível pode operá-la — a proteção do último gestor não verifica elegibilidade de
membership (isso exigiria um cruzamento entre grants e memberships que este desenho
deliberadamente não faz, para não confundir os dois ciclos de vida). **Este é exatamente o cenário
de recuperação administrativa já registrado como pendente na Atualização 1.22/3b — continua
pendente aqui, não resolvido, e não deve ser lido como resolvido por este protocolo.**

### 4. Revogação versus conclusão — ponto de serialização comum

Com a trava de entidade também em `concludeAttempt` (seção 1): revogar `analyze` e concluir uma
tentativa passam a compartilhar o MESMO ponto de serialização.

- **Revogação efetivada primeiro** (commita antes de `concludeAttempt` adquirir a trava de
  entidade): `concludeAttempt`, ao revalidar `analyze` do `requestedByUserId` sob a trava, encontra
  acesso já revogado → recusa, nenhuma `RadarRecommendation` criada, tentativa permanece em
  `provider_responded_pending_persistence` (retomável depois de reconcessão, sem nova chamada ao
  provedor).
- **Conclusão autorizada efetivada primeiro** (commita antes de qualquer revogação concorrente
  adquirir a trava): `RadarRecommendation` persiste; uma revogação que chegue depois nunca desfaz
  esse resultado (revogação é sempre prospectiva, já estabelecido na Atualização 1.23).
- **Toda leitura posterior exige autorização vigente**: `getRadarRecommendation` já rechama o
  resolvedor a cada chamada (comportamento existente, sem mudança) — uma recomendação já persistida
  continua no banco, mas deixa de ser LEGÍVEL no instante em que o acesso de leitura for revogado.

**Permissões verificadas na conclusão**: `analyze` do `requestedByUserId` (identidade autoritativa
da `RadarAnalysisRequest`, nunca uma identidade diferente do chamador atual — regra já existente,
sem mudança) via o resolvedor real, agora sob a trava de entidade.

**Posse da tentativa e prazo**: verificados exatamente como no pacote A — condição
`claim_token=... AND status='provider_responded_pending_persistence' AND clock_timestamp() <
claimed_at + TTL` na escrita condicionada final. Esta condição é INDEPENDENTE da trava de
entidade; as duas precisam valer JUNTAS no instante da escrita.

**Efeito da espera pela trava sobre essa verificação**: como `concludeAttempt` pode esperar por
DUAS travas em sequência (tentativa, depois entidade), a condição de prazo
(`clock_timestamp() < claimed_at + TTL`) é avaliada só depois de ambas as esperas terminarem — o
mesmo comportamento já comprovado no pacote A ("espera por trava ultrapassando a expiração",
G-analysis-attempt-concurrency), agora com uma segunda trava potencialmente no caminho.

**Falha de autorização evita gravação parcial**: a criação de `RadarRecommendation` e a
atualização de `status='completed'` continuam na MESMA transação, condicionadas ao mesmo `WHERE`
final — se a revalidação de `analyze` (sob a trava de entidade, etapa anterior à escrita) já
tiver reprovado, a transação nem chega a tentar o `INSERT`; se por algum motivo a condição da
escrita final falhar depois (0 linhas afetadas), o `ROLLBACK` desfaz também a `RadarRecommendation`
já inserida na mesma transação — mecanismo já existente no pacote A, sem mudança.

**Resultado intermediário preservado permanece protegido**: `preservedResultPayload`/
`preservedResultHash` não são tocados por nenhuma parte deste protocolo — continuam disponíveis
para uma futura reconclusão (depois de reconcessão de acesso) sem nova chamada ao executor/
provedor, exatamente como já estabelecido na Decisão 4 (Atualização 1.22).

**Distinções mantidas explicitamente**: preservação histórica (o dado persiste) é diferente de
direito de leitura (quem pode lê-lo agora) — revogar não apaga, só bloqueia leitura futura.
Recuperar um resultado preservado ou uma recomendação já concluída NUNCA dispara nova análise.
Resultado estruturado intermediário (`preservedResultPayload`, já existente) continua distinto de
resposta bruta do provedor (`RunEvent`, proposta não integrada) — nenhum armazenamento adicional é
autorizado nesta atualização.

### 5. Testes de aceite propostos — só descrição, nada escrito ou executado

1. Concessões iguais concorrentes (mesma tupla): segura a trava de entidade artificialmente (nova
   função de teste análoga a `holdAttemptRowLock`, agora sobre `radar_known_entities`), observa a
   segunda chamada em espera via `pg_stat_activity`, libera, confere estado final único e
   EXATAMENTE um evento de auditoria (não dois).
2. Concessão vs. revogação nas duas ordens de largada (testar as duas): confere que o estado final
   corresponde à ordem de commit e que AMBAS as chamadas retornam sucesso.
3. Revogações cruzadas entre gestores (só A e B): confere exatamente um sucesso e uma rejeição —
   a rejeição deve ter `reasonCode` de AUTORIZAÇÃO (perda de `manage`), nunca de política de
   último gestor.
4. Perda de `manage` durante espera: um terceiro ator revoga o `manage` do solicitante numa
   transação que vence a corrida pela trava; a chamada que esperava (do solicitante, tentando
   conceder/revogar algo) é rejeitada por autorização ao finalmente obter a trava.
5. Revogação antes da conclusão: `concludeAttempt` rejeitado, nenhuma recomendação criada,
   resultado preservado intacto e consultável para futura reconclusão.
6. Conclusão antes da revogação, seguida de leitura negada: recomendação persiste; leitura
   subsequente com acesso já revogado é negada, sem apagar o registro.
7. Expiração da posse durante a espera pela trava de entidade: mesma técnica de
   "espera por trava ultrapassando a expiração" do pacote A, agora com a trava de entidade também
   no caminho de `concludeAttempt`.
8. Rollback de alteração de grant e auditoria: força uma reprovação (guarda de último gestor)
   DEPOIS de a escrita do grant já ter sido montada em código, dentro da mesma transação — confere
   que NEM o estado do grant NEM o evento de auditoria persistem.
9. Ausência de ordem inversa de travas nos caminhos envolvidos: verificação de revisão de código
   (não um teste de concorrência de banco) confirmando que nenhum caminho adquire
   entidade → tentativa — só `concludeAttempt` adquire as duas, sempre tentativa → entidade.

### 6. Políticas ainda pendentes (não resolvidas nesta atualização)

- Qual permissão de nível tenant sustentaria uma recuperação administrativa quando o último
  `manage` elegível deixa de existir (gestor saiu do tenant) — não mapeada, registrada desde a
  Atualização 1.22, ainda pendente.
- Se/quando a guarda do último gestor deveria cruzar com elegibilidade de membership (ver seção 3,
  "fronteira exata da garantia") — deliberadamente fora deste desenho, não decidido.

### 7. Arquivos e alterações futuras necessárias (nenhum editado nesta atualização)

- Novo: `packages/db/prisma/schema.prisma` — modelo `RadarEntityAccessGrant` (Atualização 1.21,
  sem o bypass do criador — ver Decisão 1, Atualização 1.22) + migração aditiva nova.
- Novo: `apps/api/src/services/radarSocial/radarEntityAccessGrantContract.ts` — validação de
  campos/operação fechada.
- Novo: `apps/api/src/services/radarSocial/radarEntityAccessGrantService.ts` — símbolos
  `grantRadarEntityAccess`, `revokeRadarEntityAccess`, `resolveRadarEntityAccess` (implementação
  real de `RadarEntityAccessResolver`, mesma assinatura já existente, sem alterá-la).
- Alterado, pontualmente: `apps/api/src/services/radarSocial/radarKnownEntityService.ts`, símbolo
  `createRadarKnownEntity` — inserir os 4 grants iniciais do criador na mesma transação.
- Alterado, pontualmente: `apps/api/src/services/radarSocial/radarAnalysisAttemptService.ts`,
  símbolo `concludeAttempt` — trava de entidade + revalidação de `analyze`, sem mudar assinatura.
- Sem alteração: `radarEntityAccessResolver.ts` (contrato/tipos já existentes, só ganha
  implementação real), `claimAttempt`, `preserveResult`, `reclaimExpiredAttempt`.

### 8. Texto único de autorização sugerida (isto NÃO é uma autorização)

"Está autorizada a implementação local do resolvedor real de acesso (`RadarEntityAccessGrant`,
`grantRadarEntityAccess`, `revokeRadarEntityAccess`, `resolveRadarEntityAccess`) e das duas
alterações pontuais em `createRadarKnownEntity` e `concludeAttempt`, exatamente conforme o
protocolo de concorrência da Atualização 1.24, incluindo os nove testes de aceite ali descritos,
contra PostgreSQL local descartável, sem modelo real, fila, worker, rota HTTP ou cliente real. As
duas políticas pendentes da seção 6 permanecem não resolvidas e fora do escopo desta
implementação."

Esta atualização não concede a autorização acima — apresenta o pacote para aprovação humana. Nada
foi implementado sob ela; nenhum outro contrato do Radar Social foi reaberto.

**Superado pela Atualização 1.25**: a contagem de "gestores ativos" nas seções 1 e 3 desta
atualização (baseada só em linhas `RadarEntityAccessGrant` com `operation='manage'` e
`enabled=true`, sem considerar se o titular ainda é membro do tenant) é corrigida — uma linha
`manage` habilitada cujo titular já perdeu a membership não deve contar como gestor elegível. A
contagem "só de linhas" descrita no passo 5 do protocolo (seção 3) e na demonstração de
revogações cruzadas permanece correta quanto ao MECANISMO de trava e revalidação — só a definição
de QUEM conta como gestor é corrigida. Este registro é preservado como histórico, não apagado.

## Atualização 1.25 — fechamento da proposta: gestores elegíveis, revalidação consolidada, políticas nomeadas e pacote único para aprovação (17/09/2026)

Fonte: revisão dirigida desta sessão sobre a Atualização 1.24 efetivamente gravada, mesmo
worktree/branch/HEAD, nenhum código/schema/migration/teste/cliente gerado alterado — só este
documento. Escopo estritamente os quatro pontos apontados; nenhum outro contrato do Radar Social
foi reaberto, nenhum outro worktree foi consultado.

### 1. Correção: contagem de gestores elegíveis

**Achado**: o passo 5 do protocolo (Atualização 1.24, seção 3) recontava `manage` ativos só pela
linha de `RadarEntityAccessGrant` (`enabled=true`), sem considerar se o `granteeUserId` daquela
linha ainda é membro do tenant. Uma linha `manage` habilitada não basta se seu titular já perdeu a
elegibilidade — ela protegeria contra revogação um "gestor" que, na prática, `assertRadarSocialOperationAuthorized`
já rejeitaria por falta de `TenantMembership`.

**Controles reais usados para definir elegibilidade** (nenhum inventado — os dois já existem e são
exatamente os verificados por `assertOperationAuthorized`, `radarKnownEntityService.ts:87-115`):
1. Grant `manage` `enabled=true` para o `granteeUserId` sobre esta entidade.
2. `TenantMembership` existente para `(tenantId, granteeUserId)` — a mesma condição de existência
   já usada por `assertOperationAuthorized` (`db.tenantMembership.findFirst(...)`); não há campo de
   status/"ativo" em `TenantMembership` no schema atual, então elegibilidade de membership é
   simplesmente a EXISTÊNCIA da linha, nada além disso foi presumido.

Não há um terceiro requisito real aplicável à contagem: `checkScopePermission` resolve por
`tenantId/workspaceId/scope` (`packages/core/src/security/rbac.ts:26-44`, via
`TenantPolicyStore.resolveScopeDecision`) — é uma decisão de escopo por TENANT/WORKSPACE, não
varia por usuário individual (o parâmetro `userId` só alimenta o log de auditoria, não a decisão),
então não é um critério de elegibilidade POR GESTOR — já é coberto, para o ATOR da chamada atual,
pela revalidação da seção 2 abaixo. Nenhum papel administrativo, status de usuário ou membership
de workspace foi inventado além do que já existe.

**Protocolo corrigido** (substitui o passo 5 da Atualização 1.24, seção 3):

5'. Reconta gestores ELEGÍVEIS: `manage` `enabled=true` cujo `granteeUserId` também tenha
    `TenantMembership` existente — leitura fresca de `TenantMembership`, dentro da mesma
    transação, depois de obter a trava de entidade (nunca reaproveitada de antes da espera). Se a
    linha-alvo desta revogação NÃO estiver entre as elegíveis (ex.: revogando o grant de alguém
    que já saiu do tenant), a revogação prossegue livremente — remover um grant "fantasma" nunca
    reduz o número de gestores realmente operantes. Se a contagem de ELEGÍVEIS for exatamente 1 e
    a linha-alvo for essa única linha elegível → recusa por política, `reasonCode` renomeado para
    `cannot_revoke_last_eligible_manage_grant` (era `cannot_revoke_last_manage_grant` na
    Atualização 1.24 — mesmo conceito, nome agora reflete que a contagem é de elegíveis).

**Diferenciação pedida, resolvida explicitamente**:
- **A. Usuário já inelegível no instante da decisão**: RESOLVIDO pelo protocolo corrigido acima —
  não conta, e seu grant pode ser removido livremente por qualquer gestor elegível remanescente.
- **B. Membership alterada CONCORRENTEMENTE por um caminho que não adquire a trava da entidade**:
  **NÃO resolvido, limitação declarada, não uma serialização inexistente**: a leitura de
  `TenantMembership` no passo 5' é uma leitura comum (sem `FOR UPDATE`), porque
  `TenantMembership` não participa do domínio de trava deste protocolo (nem deveria passar a
  participar — isso ampliaria a tarefa para os serviços gerais de membership, fora do pedido). Se
  uma remoção de membership commitar EXATAMENTE entre a leitura do passo 5' e o `COMMIT` desta
  transação, a contagem usada foi a de ANTES dessa remoção — o mesmo tipo de janela residual já
  reconhecido para `checkScopePermission` na Atualização 1.24. Não alego serialização que não
  existe: a garantia é "leitura fresca no instante da decisão", não "atômica com qualquer mudança
  de membership em qualquer outro lugar do sistema".
- **C. Entidade já sem gestor elegível**: mantém bloqueio por padrão — nenhum ator conseguiria
  passar pela revalidação da seção 2 (precisaria ele mesmo ser um `manage` elegível para chamar
  `grant`/`revoke`), então nenhuma escrita de grant é possível nesse estado por nenhum caminho do
  protocolo. Nenhum bypass, autoconcessão de emergência ou fallback permissivo existe ou é
  proposto — a recuperação, se vier a existir, é um mecanismo SEPARADO (Política 1, seção 4
  abaixo), nunca uma exceção dentro deste protocolo.

Nenhuma mudança foi proposta aos serviços gerais de membership — a correção é inteiramente local
ao passo 5 do protocolo de `revokeRadarEntityAccess`.

### 2. Revalidação após espera — consolidada para conceder e revogar

As mesmas cinco pré-condições valem para `grantRadarEntityAccess` E `revokeRadarEntityAccess`,
sempre revalidadas DEPOIS de adquirir a trava de entidade, nunca reaproveitadas de uma checagem
anterior à espera:

| Verificação | Usa a mesma transação da trava de entidade? | Mecanismo | Garantia delimitada |
|---|---|---|---|
| Identidade confiável (`confirmedIdentity`/`actorUserId`) | N/A — não é uma leitura de banco | Entrada já confirmada pelo mecanismo de autenticação da chamada, fora deste protocolo | Nenhuma revalidação adicional é possível aqui; este protocolo confia na identidade que já chegou confirmada, mesma premissa de todo o resto do Radar Social |
| Membership (`TenantMembership` existe) | Sim, leitura fresca dentro da transação | `db.tenantMembership.findFirst(...)`, mesma condição de `assertOperationAuthorized` | Consistente no instante da leitura; `TenantMembership` não está sob a trava de entidade — uma remoção concorrente exatamente no meio permanece possível (mesma janela da seção 1, caso B) |
| Vínculo tenant/workspace | Sim, leitura fresca dentro da transação | `db.workspace.findFirst(...)` | Mesma característica da linha acima |
| Escopo aplicável (`checkScopePermission`) | NÃO — mecanismo próprio (`TenantPolicyStore`), fora da transação Postgres da trava de entidade | `packages/core/src/security/rbac.ts` | Revalidado depois de obter a trava (no mesmo instante lógico), mas não é atômico com a escrita final desta transação |
| `manage` vigente do ator sobre esta entidade | Sim, leitura fresca dentro da transação, SOB a trava de entidade | `RadarEntityAccessGrant` desta entidade | Única verificação desta lista realmente protegida contra corrida por este protocolo — nenhum outro escritor de grants desta entidade pode estar no meio de uma escrita enquanto a trava está retida |

Nenhuma das cinco é tratada como concessão permanente: falha em qualquer uma, revalidada depois da
espera, recusa a operação inteira antes de decidir sobre conceder/revogar.

**Ordem de travas preservada, confirmada sem alteração**: `grantRadarEntityAccess`/
`revokeRadarEntityAccess` continuam travando só a entidade; `concludeAttempt` continua travando a
tentativa PRIMEIRO, depois a entidade. Reconferido nesta rodada, por leitura direta (não por
suposição): nenhum dos dois novos serviços toca `radar_analysis_attempts`, e nenhuma operação de
tentativa existente (`claimAttempt`, `preserveResult`, `reclaimExpiredAttempt`) toca
`radar_known_entities`. Como só `concludeAttempt` adquire as duas travas, e sempre na mesma ordem,
não há caminho concorrente capaz de inverter essa ordem — nenhuma mudança de ordem foi introduzida
em nenhuma operação além da correção da seção 1 (que não muda travas, só a condição de contagem).

### 3. Políticas pendentes — nomeadas explicitamente

| Política | Recomendação | Já aprovada pelo usuário? | Bloqueia implementação local? | Bloqueia operação real futura? |
|---|---|---|---|---|
| **1. Permissão de nível tenant para recuperação administrativa** quando uma entidade fica sem nenhum gestor elegível | Fica fora do escopo local; nenhuma implementação de recuperação nesta rodada; bloqueio permanece fail-closed até definição futura | **Não** — o usuário aceitou a AUSÊNCIA dela no escopo local, sob a condição de não haver bypass/autoconcessão de emergência/fallback permissivo; isso não aprova nenhuma política de recuperação, porque nenhuma foi definida | Não — pode ficar de fora, mesma condição aceita | Sim — sem ela, uma entidade real que perca todos os gestores elegíveis fica travada permanentemente; aceitável para escopo local/testes, não para clientes reais |
| **2. Se a guarda do último gestor deve cruzar com elegibilidade de membership** (não só a linha de grant) | **Sim, deve cruzar** — proposta nesta atualização (seção 1): usar existência de `TenantMembership` fresca, sem lock sobre a tabela de membership, para excluir da contagem quem já não é membro | **Não** — é uma correção técnica proposta nesta rodada, pendente da mesma aprovação humana de todo o pacote | Não bloqueia — ao contrário, é uma correção NECESSÁRIA para a implementação local ser aceitável; sem ela, um "gestor" fantasma protegeria indevidamente contra revogação | Mesma resposta — necessária também para operação real |

Nenhuma proposta anterior foi tratada como aprovação do usuário — as duas políticas seguem
pendentes de decisão humana explícita, junto com o resto do pacote desta atualização.

**Conferência de divergência, pedida explicitamente**: comparei as cinco escolhas transcritas no
pedido desta rodada contra o que o documento efetivamente registra nas Atualizações 1.22/1.24/aqui.
Nenhuma divergência encontrada — as cinco (grants iniciais revogáveis para o criador; poderes de
`manage` incluindo autoconcessão; autorrevogação e proteção do último gestor ELEGÍVEL; auditoria
atômica das transições; recuperação administrativa fora do escopo sem fallback) correspondem
exatamente às Decisões 1–3b da Atualização 1.22, com a única atualização de que "último gestor"
agora significa "último gestor ELEGÍVEL", conforme a correção da seção 1 desta atualização.
Transcritas abaixo, seção 6, exatamente como precisarão ser aprovadas.

### 4. Reconciliação das evidências Git

O relatório da rodada anterior citou "14 arquivos rastreados modificados" no texto corrido, mas o
próprio `git diff --stat` apresentado na mesma resposta já dizia "15 files changed" — divergência
real, causada por um erro de contagem em prosa, não por qualquer inconsistência do repositório.
Contagem correta, conferida nesta rodada por `git status --short | grep -c "^ M"`: **15**,
idêntico a `git diff --stat`. Sem alteração de código nesta rodada, os números permanecem os
mesmos da rodada anterior — só a prosa é corrigida aqui. Saídas literais completas na seção 7.

### 5. Pacote local delimitado, com as quatro operações preservadas

Modelo `RadarEntityAccessGrant` (Atualização 1.21, sem bypass do criador — Decisão 1): campos e
constraint únicos `@@unique([tenantId, workspaceId, entityId, granteeUserId, operation])`,
migração aditiva nova. As quatro operações permanecem exatamente `read`, `write`, `manage`,
`analyze` — nenhuma nova introduzida, nenhuma removida.

Resolvedor real (`resolveRadarEntityAccess`) apoiado inteiramente nos grants persistidos —
nenhuma condição de acesso decidida por ausência de dado tratada como concessão: se a consulta ao
grant falhar por erro de infraestrutura, o outcome é `resolver_unavailable`/`resolution_failed`
(fail-closed, já existente), nunca `authorized`. Nenhum grant dispensa os demais controles já
existentes (`assertRadarSocialOperationAuthorized` continua obrigatório antes do resolvedor, como
já ocorre hoje — nenhuma das duas checagens substitui a outra).

Serviços: `grantRadarEntityAccess`, `revokeRadarEntityAccess`, `resolveRadarEntityAccess`, e uma
consulta de leitura (`listRadarEntityAccessGrants` ou equivalente, só leitura, gated pelo mesmo
resolvedor com `operation:"manage"`) para permitir que a empresa veja quem tem acesso a uma
entidade — necessária para o objetivo B2B de "identificar quem concedeu ou revogou cada
permissão" já declarado, mas ainda sem nome de símbolo fixado (a decidir na implementação).

Criação atômica de entidade + grants iniciais: extensão pontual de `createRadarKnownEntity`
(`radarKnownEntityService.ts`), mesma transação já existente da criação.

Auditoria na estrutura já identificada: `GuardrailAuditLedger` (existente, reaproveitado — nenhuma
tabela nova além de `RadarEntityAccessGrant`), evento gravado só quando a escrita condicionada
afeta 1 linha (transição real), atômico com essa escrita.

Alteração pontual de `concludeAttempt` (`radarAnalysisAttemptService.ts`): trava de entidade
acrescentada à transação já existente (que já trava a tentativa primeiro), revalidação de
`analyze` do `requestedByUserId` imediatamente antes da escrita condicionada final — sem mudar
assinatura nem o comportamento já testado no pacote A para os casos sem revogação em voo.

**Preservação explícita**: o resultado estruturado intermediário continua armazenado como campos
em `RadarAnalysisAttempt` (`preservedResultPayload`/`preservedResultHash`/etc., já existentes,
Atualização 1.15) — nenhuma mudança de armazenamento nesta unidade. Nenhuma resposta bruta do
provedor, `RunEvent` ou novo caminho de exposição é introduzido; a distinção entre resultado
estruturado intermediário e resposta bruta permanece exatamente como delimitada na Atualização
1.24, seção 4.

Testes: PostgreSQL local descartável, dados sintéticos — mesma técnica já usada no pacote A
(container Docker dedicado, `tsx --test`, symlink `__tests__/node_modules`, tudo removido ao
final). Nenhum banco compartilhado, Neon, credencial real ou `.env` acessado.

**Testes de aceite para a implementação, quando autorizada** (descrição apenas, nada escrito ou
executado nesta rodada):
1. Criador com grants revogáveis: quatro linhas criadas na mesma transação da entidade,
   revogáveis por qualquer `manage` elegível, inclusive o próprio criador.
2. Permissões independentes: `read` concedido não implica `analyze`/`write`/`manage`.
3. Concessão/revogação e auditoria atômicas: transição real grava exatamente um evento; repetição
   sem mudança de estado não grava nenhum; reprovação por política desfaz estado E auditoria
   juntos (`ROLLBACK`).
4. Gestor inelegível excluído da contagem: grant `manage` `enabled=true` de um usuário sem
   `TenantMembership` não impede revogar o penúltimo gestor real; revogar o grant do próprio
   usuário inelegível nunca é bloqueado pela guarda do último gestor.
5. Perda de `manage` durante a espera: ator revalidado sob a trava é recusado se perdeu `manage`
   enquanto esperava, mesmo tendo sido válido antes de entrar na fila.
6. Revogações cruzadas entre gestores (só dois, ambos elegíveis): exatamente uma sucede, a outra é
   recusada por perda de autorização, nunca por política de último gestor.
7. Proteção do último gestor ELEGÍVEL: com exatamente um `manage` elegível restante, revogá-lo é
   sempre recusado por `cannot_revoke_last_eligible_manage_grant`.
8. Entidade já sem gestor elegível: nenhum ator consegue conceder/revogar (todos falham na
   revalidação da seção 2); nenhum bypass observável em nenhum caminho.
9. Revogação versus conclusão nas duas ordens: revogação primeiro bloqueia a conclusão; conclusão
   primeiro persiste a recomendação, imune a revogação posterior.
10. Leitura negada após revogação: recomendação já persistida, leitura subsequente com `read`
    revogado é negada sem apagar o registro.
11. Isolamento entre tenants/workspaces: grant concedido num tenant/workspace nunca autoriza em
    outro, mesmo com IDs coincidentes por acidente de teste.
12. Ausência ou falha de autorização bloqueando: nenhum caminho concede acesso por
    `resolver_unavailable`/`resolution_failed`/erro de infraestrutura — sempre fail-closed.
13. Preservação do pacote A e D5/D6: suíte completa de `radarSocial` (107/107 antes desta
    implementação) e `signalForward` (129/129) continuam passando sem regressão; hashes dos
    arquivos anteriores inalterados.

### 6. Limitações operacionais

- Recuperação administrativa (Política 1) fica fora — entidade sem gestor elegível permanece
  travada até decisão futura separada, sem bypass.
- Guarda do último gestor não é atômica com mudanças de `TenantMembership` concorrentes que não
  passam pela trava de entidade (seção 1, caso B) — janela residual honesta, não uma falha de
  implementação.
- Verificação de escopo (`checkScopePermission`) não compartilha a transação Postgres da trava de
  entidade — revalidada, mas não atômica com a escrita final.
- Nenhum mecanismo real de execução (modelo, fila, worker, rota HTTP, cliente real, agente,
  Instagram) é tocado por este pacote.

### 7. Evidências literais desta rodada

```
$ git branch --show-current
experiment/signalforward-origin-fingerprint-fix

$ git rev-parse HEAD
4d91b6c24794849c574da4e57d21aab41779141e

$ git status --short
 M .gitignore
 M apps/api/src/services/signalForward/CONSULTATION_ORIGIN_AUTHZ_v2.md
 M apps/api/src/services/signalForward/__tests__/A-real-creation.test.ts
 M apps/api/src/services/signalForward/__tests__/B-concurrency.test.ts
 M apps/api/src/services/signalForward/__tests__/C-rollback-after-run.test.ts
 M apps/api/src/services/signalForward/__tests__/D-assignment-refusal.test.ts
 M apps/api/src/services/signalForward/__tests__/G-classification.test.ts
 M apps/api/src/services/signalForward/__tests__/I-fingerprint-integrity.test.ts
 M apps/api/src/services/signalForward/__tests__/helpers.ts
 M apps/api/src/services/signalForward/originContract.ts
 M apps/api/src/services/signalForward/signalForwardingService.ts
 M docs/EVIDENCE_INDEX.md
 M packages/db/prisma/schema.prisma
 M packages/db/src/generated/client/package.json
 M packages/db/src/generated/client/schema.prisma
?? apps/api/src/services/radarSocial/
?? apps/api/src/services/signalForward/__tests__/K-producer-ratification.test.ts
?? apps/api/src/services/signalForward/__tests__/L-radar-signal-result-validator.test.ts
?? apps/api/src/services/signalForward/__tests__/M-human-confirmation-window.test.ts
?? apps/api/src/services/signalForward/__tests__/N-human-confirmation-confirm.test.ts
?? apps/api/src/services/signalForward/__tests__/O-human-confirmation-concurrency.test.ts
?? apps/api/src/services/signalForward/__tests__/P-suggested-prompt-generator.test.ts
?? apps/api/src/services/signalForward/humanConfirmationContract.ts
?? apps/api/src/services/signalForward/humanConfirmationService.ts
?? apps/api/src/services/signalForward/radarSignalResultValidator.ts
?? apps/api/src/services/signalForward/suggestedPromptGenerator.ts
?? docs/architecture/radar-social-construction-plan-v1.md
?? packages/db/prisma/migrations/20260912190837_add_human_confirmation/
?? packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/
?? packages/db/prisma/migrations/20260917110146_add_radar_analysis_request_attempt_recommendation/

$ git diff --stat
 .gitignore                                         |    1 +
 .../signalForward/CONSULTATION_ORIGIN_AUTHZ_v2.md  | 2866 ++++++++++++++++++--
 .../__tests__/A-real-creation.test.ts              |   68 +-
 .../signalForward/__tests__/B-concurrency.test.ts  |   10 +-
 .../__tests__/C-rollback-after-run.test.ts         |   74 +-
 .../__tests__/D-assignment-refusal.test.ts         |   58 +-
 .../__tests__/G-classification.test.ts             |   11 +-
 .../__tests__/I-fingerprint-integrity.test.ts      |   14 +-
 .../services/signalForward/__tests__/helpers.ts    |   77 +-
 .../src/services/signalForward/originContract.ts   |   46 +-
 .../signalForward/signalForwardingService.ts       |  110 +-
 docs/EVIDENCE_INDEX.md                             |    6 +
 packages/db/prisma/schema.prisma                   |  347 +++
 packages/db/src/generated/client/package.json      |    2 +-
 packages/db/src/generated/client/schema.prisma     |  385 ++-
 15 files changed, 3638 insertions(+), 437 deletions(-)

$ git diff --check
(sem saída; exit code 0)

$ git ls-files --others --exclude-standard
apps/api/src/services/radarSocial/__tests__/A-contract-validation.test.ts
apps/api/src/services/radarSocial/__tests__/B-known-entity-lifecycle.test.ts
apps/api/src/services/radarSocial/__tests__/C-material-receive-idempotency.test.ts
apps/api/src/services/radarSocial/__tests__/D-analysis-contracts.test.ts
apps/api/src/services/radarSocial/__tests__/E-analysis-request-and-attempt-lifecycle.test.ts
apps/api/src/services/radarSocial/__tests__/F-analysis-end-to-end.test.ts
apps/api/src/services/radarSocial/__tests__/G-analysis-attempt-concurrency.test.ts
apps/api/src/services/radarSocial/__tests__/helpers.ts
apps/api/src/services/radarSocial/radarAnalysisAttemptContract.ts
apps/api/src/services/radarSocial/radarAnalysisAttemptService.ts
apps/api/src/services/radarSocial/radarAnalysisRequestContract.ts
apps/api/src/services/radarSocial/radarAnalysisRequestService.ts
apps/api/src/services/radarSocial/radarEntityAccessResolver.ts
apps/api/src/services/radarSocial/radarKnownEntityContract.ts
apps/api/src/services/radarSocial/radarKnownEntityService.ts
apps/api/src/services/radarSocial/radarMaterialContract.ts
apps/api/src/services/radarSocial/radarMaterialService.ts
apps/api/src/services/radarSocial/radarRecommendationContract.ts
apps/api/src/services/radarSocial/radarRecommendationService.ts
apps/api/src/services/signalForward/__tests__/K-producer-ratification.test.ts
apps/api/src/services/signalForward/__tests__/L-radar-signal-result-validator.test.ts
apps/api/src/services/signalForward/__tests__/M-human-confirmation-window.test.ts
apps/api/src/services/signalForward/__tests__/N-human-confirmation-confirm.test.ts
apps/api/src/services/signalForward/__tests__/O-human-confirmation-concurrency.test.ts
apps/api/src/services/signalForward/__tests__/P-suggested-prompt-generator.test.ts
apps/api/src/services/signalForward/humanConfirmationContract.ts
apps/api/src/services/signalForward/humanConfirmationService.ts
apps/api/src/services/signalForward/radarSignalResultValidator.ts
apps/api/src/services/signalForward/suggestedPromptGenerator.ts
docs/architecture/radar-social-construction-plan-v1.md
packages/db/prisma/migrations/20260912190837_add_human_confirmation/migration.sql
packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/migration.sql
packages/db/prisma/migrations/20260917110146_add_radar_analysis_request_attempt_recommendation/migration.sql
```

Contagem reconciliada: 15 arquivos rastreados modificados (`grep -c "^ M"` sobre `git status
--short`), idêntico às 15 linhas de `git diff --stat` — sem divergência real, só a correção de
prosa da seção 4.

**Comparação do plano (não rastreado)**: 3189 → 3531 linhas (+342) após esta atualização. Todo o
acréscimo concentrado nesta Atualização 1.25 e na nota "Superado pela..." inserida antes dela;
nenhuma Atualização anterior foi reescrita ou removida.

**Preservação dos arquivos de implementação, por hash**: hashes SHA-256 dos mesmos 73 arquivos
(todo o código de `radarSocial`/`signalForward`, `schema.prisma`, cliente gerado, as três
migrações) coletados antes desta edição e comparados depois: diff vazio, confirmado nesta rodada.

### 8. Texto único de autorização sugerida (isto NÃO é uma autorização)

"Está autorizada a implementação local do resolvedor real de acesso do Radar Social: modelo
`RadarEntityAccessGrant` e sua migração aditiva; atualização do cliente Prisma gerado
(`prisma generate` + sincronização de `dist/generated/client`, sem instalar dependências);
serviços `grantRadarEntityAccess`, `revokeRadarEntityAccess`, `resolveRadarEntityAccess` e a
consulta de leitura de grants; extensão pontual de `createRadarKnownEntity` para os quatro grants
iniciais do criador; extensão pontual de `concludeAttempt` para a trava de entidade e revalidação
de `analyze`; e os treze testes de aceite descritos na Atualização 1.25, seção 5, contra
PostgreSQL local descartável com dados sintéticos. Ficam fora desta autorização: recuperação
administrativa (Política 1, pendente); modelo real de linguagem; fila e worker operacional; rotas
HTTP e clientes reais; provisionamento de agente; integração Instagram; banco compartilhado, Neon
ou dados reais; instalação de dependências; e qualquer commit, push, PR, merge, rebase ou deploy."

Esta atualização não concede a autorização acima — apresenta o pacote único para aprovação humana.
Nenhum código, schema, migration, teste ou cliente gerado foi alterado sob ela; nenhum outro
contrato do Radar Social foi reaberto.

## Atualização 1.26 — resolvedor real de acesso implementado e testado localmente (17/09/2026)

Fonte: implementação real nesta sessão, sob autorização expressa do usuário conforme o texto da
Atualização 1.25 ("Execute agora a implementação local do resolvedor de acesso do Radar Social,
autorizada expressamente pelo usuário conforme a Atualização 1.25"). Mesmo worktree/branch/HEAD,
nenhum commit criado. Entrega exatamente o pacote delimitado na Atualização 1.25 — nenhuma
recuperação administrativa, nenhum modelo real, fila, worker, rota HTTP, cliente real ou
integração Instagram.

### Comportamento entregue

`RadarEntityAccessGrant` real, com os quatro grants iniciais do criador criados atomicamente com a
entidade, revogáveis. `grantRadarEntityAccess`/`revokeRadarEntityAccess` com o ponto de
serialização único na linha de `RadarKnownEntity` (`SELECT...FOR UPDATE`), revalidação de
identidade/membership/escopo/`manage` depois da trava, upsert condicionado (nunca leitura-depois-
escrita), auditoria atômica em `GuardrailAuditLedger` só quando a transição é real. Proteção do
último gestor corrigida para contar só gestores ELEGÍVEIS (grant `manage` habilitado +
`TenantMembership` existente), fechando o achado da Atualização 1.25. `concludeAttempt` estendido
com a mesma trava de entidade (ordem tentativa → entidade, nunca invertida) e revalidação de
`analyze` imediatamente antes da escrita final — revogação em trânsito é corretamente detectada e
bloqueia a conclusão sem apagar o resultado preservado, que permanece retomável após reconcessão
sem nova chamada ao executor. `resolveRadarEntityAccess` (via `createRadarEntityAccessResolver`)
apoiado inteiramente nos grants persistidos, fail-closed em qualquer erro de infraestrutura.

### Arquivos criados e alterados

Novos, em `apps/api/src/services/radarSocial/`: `radarEntityAccessGrantContract.ts`,
`radarEntityAccessGrantService.ts`, `__tests__/H-entity-access-grant.test.ts`.

Alterados, de forma pontual: `radarKnownEntityService.ts` (`createRadarKnownEntity` cria os 4
grants iniciais na mesma transação); `radarAnalysisAttemptService.ts` (`concludeAttempt` ganha a
trava de entidade + revalidação de `analyze`); `__tests__/helpers.ts` (novo helper
`holdEntityRowLock`, mesma técnica de `holdAttemptRowLock`). Confirmado por hash: nenhum outro
arquivo dos 73 verificados (D5/D6, fingerprint, resto do pacote A, entidade/material) mudou um
único byte.

`packages/db/prisma/schema.prisma`: modelo `RadarEntityAccessGrant` + relações reversas em
`Tenant`/`Workspace`/`RadarKnownEntity`, aditivo. Migração
`packages/db/prisma/migrations/20260917162503_add_radar_entity_access_grant/` — só
`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`, sem necessidade de edição manual (índice único
comum, não parcial desta vez). Cliente Prisma regenerado (`prisma generate` +
`copy-publish-artifacts.mjs`), nenhuma dependência instalada.

### Testes, comandos e resultados reais

| Suíte | Comando | Resultado |
|---|---|---|
| radarSocial completo (A–H) | `tsx --test apps/api/src/services/radarSocial/__tests__/*.test.ts` | **120/120 passaram**, exit 0 (107 prévios + 13 novos) |
| signalForward (D5/D6/fingerprint), regressão | `tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts` | **129/129 passaram**, exit 0 — nenhuma regressão |

Os 13 testes novos (`H-entity-access-grant.test.ts`) cobrem: grants iniciais do criador revogáveis;
independência entre as quatro operações; concessão/revogação e auditoria atômicas (transição real
audita uma vez, repetição não audita, guarda reprovada não deixa rastro); gestor inelegível
(grant "fantasma" sem membership) excluído da contagem, sem bloquear sua própria remoção; perda de
`manage` durante a espera pela trava, revalidado sob ela; revogações cruzadas entre dois gestores
(exatamente uma sucede, a outra recusada por autorização, nunca por política de último gestor);
proteção do último gestor elegível; entidade sem gestor elegível permanece bloqueada, sem bypass;
revogação antes da conclusão (checagem de entrada pré-existente já rejeita); revogação EM TRÂNSITO
durante a espera de `concludeAttempt` pela trava de entidade (teste de concorrência determinístico
via `pg_stat_activity`, comprovando que a corrida fecha corretamente em qualquer ordem de
vitória); conclusão antes da revogação com leitura negada depois, sem apagar o registro;
isolamento entre tenants/workspaces; e falha de infraestrutura no resolvedor (`pool.end()` forçado)
nunca retornando `authorized`. Teste de concorrência em trânsito reexecutado três vezes
consecutivas sem flakiness. Nenhuma chamada real a modelo em nenhum teste.

### Comparação de typecheck

Mesmo comando (`tsc --noEmit -p apps/api/tsconfig.json`), TypeScript 5.9.3, mesma instalação
local. Baseline reconstruída como o estado imediatamente anterior a esta rodada (arquivos novos
movidos para fora, as duas extensões pontuais e o helper revertidos) — não HEAD. Mesmo cliente
Prisma gerado em ambas as medições (tipos extras não referenciados pelo código revertido não
alteram diagnósticos).

- Antes: 431 erros. Depois: 431 erros.
- O `diff` textual bruto entre as duas listas ordenadas **não é absolutamente vazio**: duas linhas
  a mais aparecem depois, ambas do tipo `Imported via "@repo/db" from file '...'`. Investigado:
  são linhas AUXILIARES do mesmo diagnóstico pré-existente `TS6059` ("File ... is not under
  rootDir"), que já existia antes desta rodada e já lista, para cada arquivo fora do `rootDir`
  atingido, TODOS os arquivos que o importam transitivamente. Os dois novos arquivos
  (`radarEntityAccessGrantService.ts`, e mais uma rota de import via `helpers.ts` por causa do
  `H-entity-access-grant.test.ts` novo) simplesmente viraram mais dois nós desse grafo já
  problemático, contabilizados na mesma listagem — nenhum diagnóstico novo, nenhum código de erro
  novo, a contagem total de `error TS` permanece 431=431. Nenhuma correção foi necessária.

### Preservação confirmada

Hashes SHA-256 de 73 arquivos (D5/D6 e fingerprint de signalForward, todo o pacote A e a unidade
entidade/material do radarSocial, `schema.prisma`, cliente gerado, as quatro migrações),
coletados antes de qualquer alteração desta rodada e comparados depois: **exatamente 6 mudaram** —
os três arquivos alterados pontualmente listados acima e os três artefatos de schema/cliente
gerado — todo o resto, incluindo D5/D6/fingerprint e o resto do pacote A, permanece byte a byte
idêntico.

### Limitações remanescentes

Recuperação administrativa (Política 1, Atualização 1.25) continua fora — entidade sem gestor
elegível permanece bloqueada até decisão futura separada, sem bypass, autoconcessão de emergência
ou fallback permissivo (comprovado pelo teste correspondente). Guarda do último gestor não é
atômica com uma saída de tenant que aconteça fora deste protocolo (mesma fronteira já declarada na
Atualização 1.25). `checkScopePermission` continua não compartilhando a transação da trava de
entidade. Nenhum mecanismo real de execução (modelo, fila, worker, rota HTTP, cliente real,
agente, Instagram) foi tocado.

### Recursos temporários criados e removidos

Container Docker `radar-resolver-unit-pg` (Postgres descartável, porta 5435): criado, usado,
removido ao final. Dois symlinks `__tests__/node_modules` (radarSocial e signalForward): criados,
usados, removidos ao final. `eiah-postgres` (serviço preexistente) permaneceu intocado
(`Up 31 hours (healthy)` confirmado ao final da rodada).

### Classificação

- **Implementado e testado**: `RadarEntityAccessGrant`, migração, cliente regenerado, os três
  serviços novos (`grantRadarEntityAccess`/`revokeRadarEntityAccess`/`resolveRadarEntityAccess`) +
  consulta de leitura, as duas extensões pontuais, o protocolo de concorrência completo (ponto de
  serialização único, gestores elegíveis, auditoria atômica, revogação versus conclusão).
- **Simulado, nunca real**: todo o fluxo de análise usado nos testes de revogação-versus-conclusão
  continua com executor/provedor substituto — nenhuma chamada real a modelo em nenhum teste.
- **Dependência operacional futura**: recuperação administrativa; modelo real; fila operacional;
  rotas HTTP e clientes reais; provisionamento de agente; integração Instagram.

Esta atualização não amplia a autorização concedida — só documenta o que foi efetivamente
entregue sob o texto da Atualização 1.25.

## Atualização 1.27 — revisão final da integração do resolvedor persistido (17/09/2026)

Fonte: revisão dirigida desta sessão sobre a Atualização 1.26 efetivamente gravada, mesmo
worktree/branch/HEAD, nenhuma política de grant reaberta. Escopo estritamente: integração do
resolvedor com os grants persistidos, comparação de typecheck, e evidências completas.

### 1. Achado: existência do resolvedor não era prova de integração

Levantamento por leitura direta (`grep` dos nomes de resolvedor em cada arquivo de teste), não por
suposição: até esta rodada, `createRadarEntityAccessResolver` (o resolvedor real, apoiado em
`RadarEntityAccessGrant` persistido) só era exercitado dentro de
`H-entity-access-grant.test.ts` — todos os outros arquivos de teste do Radar Social (`B`, `C`, `E`,
`F`, `G`) continuavam usando exclusivamente `alwaysAuthorizedResolver`/`fixedOutcomeResolver`. Isso
significa que `getRadarKnownEntity`, `listRadarKnownEntities`, `getRadarMaterial`,
`listRadarMaterials`, `correctRadarMaterial`, `getRadarAnalysisRequest` e
`createOrRecoverIntentionalAttempt` — todos aceitam um `resolver` injetado e todos JÁ SÃO
compatíveis com o resolvedor real (mesma assinatura, sem mudança) — nunca tinham sido exercitados
com o resolvedor real em nenhum teste. A existência do resolvedor e sua correção isolada (provada
na Atualização 1.26) não prova, por si só, que cada um desses pontos de chamada realmente autoriza
e revoga com ele.

**Correção aplicada**: teste novo `apps/api/src/services/radarSocial/__tests__/I-real-resolver-integration.test.ts`
(7 testes), cobrindo exatamente os caminhos listados nesta revisão que ainda não tinham essa
cobertura. Nenhuma mudança de código de produção foi necessária — os 7 testes passaram já na
primeira execução, confirmando que a integração está correta onde antes só não estava comprovada.

### 2. Matriz de integração (evidência real, não presunção)

| Operação | Serviço:símbolo | Resolvedor real exercitado? | Teste | Resultado após revogação |
|---|---|---|---|---|
| Leitura de entidade | `radarKnownEntityService.ts:getRadarKnownEntity` | **Sim (novo nesta rodada)** | `I`, teste 1 | `RadarKnownEntityNotFoundError` |
| Listagem de entidades | `radarKnownEntityService.ts:listRadarKnownEntities` | **Sim (novo)** | `I`, teste 2 | Item revogado é filtrado da página; listagem NÃO aborta (outcome item-filtrável) |
| Leitura de material | `radarMaterialService.ts:getRadarMaterial` | **Sim (novo)** | `I`, teste 3 | `RadarMaterialNotFoundError` |
| Listagem de materiais/histórico | `radarMaterialService.ts:listRadarMaterials` | **Sim (novo)** | `I`, teste 4 | Aborta a listagem inteira — checagem única sobre a entidade, não item a item (diferente da listagem de entidades) |
| Recebimento de material | `radarMaterialService.ts:receiveRadarMaterial` | Sim (desde a Atualização 1.26, via `setupRequestUnderRealResolver` em `H`) | `H`, `I` (setup) | Não retestado nesta rodada especificamente para revogação (fora do escopo desta revisão) |
| Correção de material | `radarMaterialService.ts:correctRadarMaterial` | **Sim (novo)** | `I`, teste 5 | Correção seguinte rejeitada |
| Solicitação de análise (criação) | `radarAnalysisRequestService.ts:createRadarAnalysisRequest` | Sim (desde a 1.26, `H`) | `H` | — |
| Recuperação de solicitação de análise | `radarAnalysisRequestService.ts:getRadarAnalysisRequest` | **Sim (novo)** | `I`, teste 6 | Rejeitada |
| Criação/recuperação de tentativa intencional | `radarAnalysisAttemptService.ts:createOrRecoverIntentionalAttempt` | **Sim (novo)** | `I`, teste 7 | Nova tentativa sob nova chave rejeitada |
| Posse/execução da tentativa | `radarAnalysisAttemptService.ts:claimAttempt` | Sim (desde a 1.26, `H`) | `H` | — (`preserveResult` não recebe `resolver` — não se aplica) |
| Conclusão | `radarAnalysisAttemptService.ts:concludeAttempt` | Sim (1.26, `H`, extensivamente — inclusive corrida em trânsito) | `H` | Bloqueia, sem apagar resultado preservado; retomável sem nova chamada ao executor após reconcessão |
| Recuperação de recomendação | `radarRecommendationService.ts:getRadarRecommendation` | Sim (1.26, `H`) | `H` | Nega leitura, registro permanece intacto |
| Concessão e revogação de acesso | `radarEntityAccessGrantService.ts:grantRadarEntityAccess`/`revokeRadarEntityAccess` | N/A — não usam o resolvedor abstrato; autorização própria via `assertActorHasManage` sobre a mesma tabela de grants | `H` (extensivo) | — |

**Fora do escopo desta revisão, permanecem só com substituto** (não listados no pedido, registrado
para não sugerir cobertura total inexistente): `updateRadarKnownEntity`, `deactivateRadarKnownEntity`,
`reclaimExpiredAttempt`, `requestAttemptCancellation`, `runSimulatedAnalysis`,
`getRadarAnalysisAttempt` (este último ganhou UM teste com resolvedor real no teste 7 de `I`, mas
só no caminho de leitura pós-criação, não em todos os seus cenários).

### 3. Confirmações pedidas, com evidência

- **Ausência de fallback permissivo**: todo ponto de chamada acima usa o padrão
  `if (outcome !== "authorized") throw ...` — nenhum trata `resolver_unavailable`/
  `resolution_failed` como autorização. Comprovado empiricamente uma vez, na origem
  (`createRadarEntityAccessResolver`, teste `H`-13, `pool.end()` forçado → `resolution_failed`,
  nunca `authorized`); os demais pontos de chamada compartilham o mesmo bloco condicional
  (confirmado por leitura de código, não reexecutado seis vezes a mesma prova de infraestrutura
  para evitar redundância sem valor novo).
- **Distinção entre acesso negado e falha de infraestrutura**: mantida — `access_denied` é
  outcome de negócio (grant ausente), `resolver_unavailable`/`resolution_failed` são falha
  técnica; nenhum dos serviços os funde em tratamento.
- **Autorização vigente antes de retornar conteúdo**: confirmado em `I` testes 1, 3, 4, 6, 7 — a
  leitura só é aceita com o resolvedor ainda retornando `authorized` NO INSTANTE da chamada.
- **Bloqueio da conclusão após revogação que venceu a disputa**: já comprovado na Atualização 1.26
  (`H`, teste de revogação em trânsito) — reconfirmado nesta rodada por reexecução, sem alteração.
- **Recuperação posterior autorizada sem nova análise**: já comprovada na 1.26 (`H`) — mesma
  reconfirmação por reexecução.
- **Payload intermediário não exposto ao usuário**: confirmado por asserção direta nesta rodada
  (`I`, teste 7: `"preservedResultPayload" in fetched` é `false` após `getRadarAnalysisAttempt`).

**Limitação preservada, não uma correção desta rodada**: a trava da entidade
(`radar_known_entities FOR UPDATE`) não serializa alterações de `TenantMembership` feitas por
qualquer caminho que não adquira essa mesma trava — repetido aqui exatamente como já declarado na
Atualização 1.25, sem enfraquecer nem reforçar a garantia.

### 4. Typecheck — comando, versão, escopo e limites da comparação

Comando exato: `node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`. `tsconfig`:
`apps/api/tsconfig.json`. TypeScript: 5.9.3 (mesma instalação local de todas as rodadas
anteriores). Código de saída: 2 em ambas as medições (reflete os diagnósticos preexistentes do
monorepo, não uma falha desta rodada).

Metodologia: nesta rodada, a ÚNICA mudança de código foi um arquivo de teste novo
(`I-real-resolver-integration.test.ts`) — nenhum arquivo de produção mudou. A baseline "antes" foi
obtida movendo esse único arquivo para fora da árvore e rodando `tsc`; a medição "depois" foi feita
com o arquivo de volta, no MESMO cliente Prisma gerado (nenhuma mudança de schema nesta rodada,
logo nenhuma razão para regenerar o cliente entre as duas medições — o cliente já reflete o schema
atual desde a Atualização 1.26, e como nenhuma fonte revertida nesta rodada referencia tipos que só
existiriam num cliente diferente, usar o mesmo cliente nas duas medições não introduz nem esconde
diagnóstico algum). Essa metodologia permite concluir com confiança sobre diagnósticos atribuíveis
ESPECIFICAMENTE ao arquivo novo desta rodada; ela NÃO prova nada sobre o impacto de mudanças de
schema anteriores (essas já foram objeto de comparação própria nas Atualizações 1.19–1.26, cada
uma com sua própria baseline reconstruída) — não misturo as duas rodadas numa única alegação.

**Resultado real, sem arredondar para "irrelevante" só porque o total bateu**:
- Primeira medição (arquivo de teste como escrito originalmente): 431 → 432, +1 diagnóstico
  NOVO real: `I-real-resolver-integration.test.ts(181,19): error TS2352: Conversion of type
  'RadarAnalysisAttemptRecord' to type 'Record<string, unknown>' may be a mistake...`. Causa:
  cast direto de um tipo de retorno nomeado para `Record<string, unknown>` sem passar por
  `unknown` primeiro — o próprio TypeScript recusou por não haver sobreposição suficiente entre os
  dois tipos.
- **Correção aplicada**: substituí o cast por `"preservedResultPayload" in fetched` (checagem de
  presença de chave, sem cast nenhum) — mesma prova pretendida (o campo não está no objeto
  devolvido), sem violar o sistema de tipos. Também removida uma importação não usada
  (`grantRadarEntityAccess`, importado mas nunca chamado no arquivo — o criador já tem o grant via
  criação da entidade).
- Segunda medição (arquivo corrigido): 431 → 431, **diff textual bruto vazio** desta vez
  (`diff` entre as duas listas ordenadas, sem nenhuma linha de contexto adicional — diferente da
  Atualização 1.26, onde duas linhas auxiliares de um `TS6059` pré-existente apareciam; nesta
  rodada nenhum arquivo novo passou a alcançar o arquivo fora do `rootDir` que dispara aquele
  diagnóstico, então nem esse efeito colateral ocorreu desta vez).

**Classificação exigida, sem generalizar**:
- Diagnósticos preexistentes idênticos: todos os 431 da baseline, inalterados.
- Diagnósticos novos: 1 (`TS2352`, acima), corrigido nesta mesma rodada — não permanece no estado
  final.
- Diagnósticos existentes com contexto/abrangência alterada: nenhum nesta rodada (diferente da
  1.26).
- Resolvidos: nenhum.
- Indeterminados: nenhum — a reconstrução da baseline foi trivial e completa nesta rodada (um só
  arquivo novo, sem reversão de código de produção necessária), então não há limitação a declarar
  aqui além da já registrada nas rodadas anteriores para as mudanças de schema.

### 5. Evidências completas

**Arquivos novos** (caminho completo): `apps/api/src/services/radarSocial/__tests__/I-real-resolver-integration.test.ts`.

**Arquivos existentes modificados nesta rodada**: nenhum arquivo de produção — só o arquivo de
teste acima foi criado e depois corrigido no lugar (mesmo arquivo, duas edições).

**Migration do resolvedor** (gerada na Atualização 1.26, não alterada nesta rodada — confirmado
por hash): `packages/db/prisma/migrations/20260917162503_add_radar_entity_access_grant/migration.sql`.
Conteúdo relido nesta rodada, íntegro:
```sql
CREATE TABLE "radar_entity_access_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "grantee_user_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "granted_by_user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "revoked_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "radar_entity_access_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_idx"
    ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "enabled");
CREATE UNIQUE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_key"
    ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "operation");
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_entity_id_tenant_id_workspace_i_fkey"
    FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
```
Unicidade dos grants: `(tenant_id, workspace_id, entity_id, grantee_user_id, operation)` — uma
linha por tupla, exatamente como desenhado. Vínculo de escopo: FK composta de `entity_id` para
`radar_known_entities(id, tenant_id, workspace_id)` — um grant nunca pode apontar para uma
entidade de outro tenant/workspace, reforçado pelo banco, não só pela aplicação. Nenhuma edição
manual foi feita neste arquivo (diferente da migração do pacote A) — confirmado por hash idêntico
antes/depois desta e da rodada anterior.

**Documentação de evidência**: `docs/EVIDENCE_INDEX.md` (entrada atualizada nesta rodada) e esta
própria Atualização 1.27.

**Saídas literais** (branch/HEAD/status/diff/ls-files), coletadas ao final desta rodada:

```
$ git branch --show-current
experiment/signalforward-origin-fingerprint-fix

$ git rev-parse HEAD
4d91b6c24794849c574da4e57d21aab41779141e

$ git status --short
 M .gitignore
 M apps/api/src/services/signalForward/CONSULTATION_ORIGIN_AUTHZ_v2.md
 M apps/api/src/services/signalForward/__tests__/A-real-creation.test.ts
 M apps/api/src/services/signalForward/__tests__/B-concurrency.test.ts
 M apps/api/src/services/signalForward/__tests__/C-rollback-after-run.test.ts
 M apps/api/src/services/signalForward/__tests__/D-assignment-refusal.test.ts
 M apps/api/src/services/signalForward/__tests__/G-classification.test.ts
 M apps/api/src/services/signalForward/__tests__/I-fingerprint-integrity.test.ts
 M apps/api/src/services/signalForward/__tests__/helpers.ts
 M apps/api/src/services/signalForward/originContract.ts
 M apps/api/src/services/signalForward/signalForwardingService.ts
 M docs/EVIDENCE_INDEX.md
 M packages/db/prisma/schema.prisma
 M packages/db/src/generated/client/package.json
 M packages/db/src/generated/client/schema.prisma
?? apps/api/src/services/radarSocial/
?? apps/api/src/services/signalForward/__tests__/K-producer-ratification.test.ts
?? apps/api/src/services/signalForward/__tests__/L-radar-signal-result-validator.test.ts
?? apps/api/src/services/signalForward/__tests__/M-human-confirmation-window.test.ts
?? apps/api/src/services/signalForward/__tests__/N-human-confirmation-confirm.test.ts
?? apps/api/src/services/signalForward/__tests__/O-human-confirmation-concurrency.test.ts
?? apps/api/src/services/signalForward/__tests__/P-suggested-prompt-generator.test.ts
?? apps/api/src/services/signalForward/humanConfirmationContract.ts
?? apps/api/src/services/signalForward/humanConfirmationService.ts
?? apps/api/src/services/signalForward/radarSignalResultValidator.ts
?? apps/api/src/services/signalForward/suggestedPromptGenerator.ts
?? docs/architecture/radar-social-construction-plan-v1.md
?? packages/db/prisma/migrations/20260912190837_add_human_confirmation/
?? packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/
?? packages/db/prisma/migrations/20260917110146_add_radar_analysis_request_attempt_recommendation/
?? packages/db/prisma/migrations/20260917162503_add_radar_entity_access_grant/

$ git diff --stat
 .gitignore                                         |    1 +
 .../signalForward/CONSULTATION_ORIGIN_AUTHZ_v2.md  | 2866 ++++++++++++++++++--
 .../__tests__/A-real-creation.test.ts              |   68 +-
 .../signalForward/__tests__/B-concurrency.test.ts  |   10 +-
 .../__tests__/C-rollback-after-run.test.ts         |   74 +-
 .../__tests__/D-assignment-refusal.test.ts         |   58 +-
 .../__tests__/G-classification.test.ts             |   11 +-
 .../__tests__/I-fingerprint-integrity.test.ts      |   14 +-
 .../services/signalForward/__tests__/helpers.ts    |   77 +-
 .../src/services/signalForward/originContract.ts   |   46 +-
 .../signalForward/signalForwardingService.ts       |  110 +-
 docs/EVIDENCE_INDEX.md                             |    7 +
 packages/db/prisma/schema.prisma                   |  386 +++
 packages/db/src/generated/client/package.json      |    2 +-
 packages/db/src/generated/client/schema.prisma     |  424 ++-
 15 files changed, 3717 insertions(+), 437 deletions(-)

$ git diff --check
(sem saída; exit code 0)

$ git ls-files --others --exclude-standard
apps/api/src/services/radarSocial/__tests__/A-contract-validation.test.ts
apps/api/src/services/radarSocial/__tests__/B-known-entity-lifecycle.test.ts
apps/api/src/services/radarSocial/__tests__/C-material-receive-idempotency.test.ts
apps/api/src/services/radarSocial/__tests__/D-analysis-contracts.test.ts
apps/api/src/services/radarSocial/__tests__/E-analysis-request-and-attempt-lifecycle.test.ts
apps/api/src/services/radarSocial/__tests__/F-analysis-end-to-end.test.ts
apps/api/src/services/radarSocial/__tests__/G-analysis-attempt-concurrency.test.ts
apps/api/src/services/radarSocial/__tests__/H-entity-access-grant.test.ts
apps/api/src/services/radarSocial/__tests__/I-real-resolver-integration.test.ts
apps/api/src/services/radarSocial/__tests__/helpers.ts
apps/api/src/services/radarSocial/radarAnalysisAttemptContract.ts
apps/api/src/services/radarSocial/radarAnalysisAttemptService.ts
apps/api/src/services/radarSocial/radarAnalysisRequestContract.ts
apps/api/src/services/radarSocial/radarAnalysisRequestService.ts
apps/api/src/services/radarSocial/radarEntityAccessGrantContract.ts
apps/api/src/services/radarSocial/radarEntityAccessGrantService.ts
apps/api/src/services/radarSocial/radarEntityAccessResolver.ts
apps/api/src/services/radarSocial/radarKnownEntityContract.ts
apps/api/src/services/radarSocial/radarKnownEntityService.ts
apps/api/src/services/radarSocial/radarMaterialContract.ts
apps/api/src/services/radarSocial/radarMaterialService.ts
apps/api/src/services/radarSocial/radarRecommendationContract.ts
apps/api/src/services/radarSocial/radarRecommendationService.ts
apps/api/src/services/signalForward/__tests__/K-producer-ratification.test.ts
apps/api/src/services/signalForward/__tests__/L-radar-signal-result-validator.test.ts
apps/api/src/services/signalForward/__tests__/M-human-confirmation-window.test.ts
apps/api/src/services/signalForward/__tests__/N-human-confirmation-confirm.test.ts
apps/api/src/services/signalForward/__tests__/O-human-confirmation-concurrency.test.ts
apps/api/src/services/signalForward/__tests__/P-suggested-prompt-generator.test.ts
apps/api/src/services/signalForward/humanConfirmationContract.ts
apps/api/src/services/signalForward/humanConfirmationService.ts
apps/api/src/services/signalForward/radarSignalResultValidator.ts
apps/api/src/services/signalForward/suggestedPromptGenerator.ts
docs/architecture/radar-social-construction-plan-v1.md
packages/db/prisma/migrations/20260912190837_add_human_confirmation/migration.sql
packages/db/prisma/migrations/20260916112527_add_radar_known_entity_and_material/migration.sql
packages/db/prisma/migrations/20260917110146_add_radar_analysis_request_attempt_recommendation/migration.sql
packages/db/prisma/migrations/20260917162503_add_radar_entity_access_grant/migration.sql
```

**Distinção entre não rastreado e ignorado**: todos os caminhos listados acima por
`git ls-files --others --exclude-standard` são NÃO RASTREADOS (nunca commitados, mas visíveis ao
Git) — `--exclude-standard` já retira desta lista qualquer coisa coberta por `.gitignore`
(artefatos ignorados, ex.: `node_modules/`, `dist/` de build ordinário). Nenhum arquivo desta
frente está na categoria "ignorado" — todos apareceriam num `git add .`, se algum dia autorizado.

### 6. Testes executados e recursos temporários

`tsx --test apps/api/src/services/radarSocial/__tests__/I-real-resolver-integration.test.ts` — 7/7
na primeira execução (nenhuma correção de teste precisou ser refeita — só a correção de tipo
descrita na seção 4). `tsx --test apps/api/src/services/radarSocial/__tests__/*.test.ts` — 127/127
(120 prévios + 7 novos). `tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts` —
129/129, sem regressão. Nenhuma suíte foi repetida além do necessário para confirmar a correção do
`TS2352` e o resultado final. Container Docker `radar-integration-unit-pg` (porta 5436): criado,
usado, removido ao final. Symlinks `__tests__/node_modules` (radarSocial e signalForward):
criados, usados, removidos ao final. `eiah-postgres` permaneceu intocado
(`Up 31 hours (healthy)`). Hashes SHA-256 de 77 arquivos (73 anteriores + a nova migração e mais 3
arquivos do pacote resolvedor já existentes desde a 1.26), coletados antes e depois desta rodada:
diff vazio — nenhum arquivo preexistente mudou.

### 7. Veredito da integração local do resolvedor

A integração está **confirmada por teste real, não só por desenho**, para todos os caminhos
listados no pedido desta rodada: leitura e listagem de entidade, leitura/listagem de material,
correção de material, solicitação de análise (criação e recuperação), criação/recuperação de
tentativa, conclusão, recuperação de recomendação, e concessão/revogação de acesso. A lacuna real
encontrada (existência do resolvedor tratada implicitamente como prova de integração para pontos
nunca exercitados com ele) foi fechada com testes, sem exigir nenhuma mudança em código de
produção — o código já estava correto, só não estava comprovado. Continua fora de qualquer prova
empírica: `updateRadarKnownEntity`, `deactivateRadarKnownEntity`, `reclaimExpiredAttempt`,
`requestAttemptCancellation` e `runSimulatedAnalysis` com o resolvedor real — não fazem parte do
pedido desta rodada e não devem ser lidos como cobertos.

Nenhuma chamada real a modelo ocorreu em nenhum teste — a análise simulada com executor/provedor
substituto não constitui prova de qualidade de modelo real nem autorização para operação com
clientes.

## Atualização 1.27 (continuação) — proposta curta para o desenho do caminho seguro de execução real

Só proposta — nenhuma implementação, nenhuma chamada real ao modelo. Escopo: o trecho
`tentativa autorizada → envio governado ao provedor → resposta → preservação durável →
recomendação`, delimitando o que a PRÓXIMA unidade precisaria decidir, sem reabrir o Core em
busca ampla — só os pontos já conhecidos de rodadas anteriores (`completionEngine.ts`,
`assertWorkspaceAgentEnabled`, `RunEvent`) são citados, nenhuma investigação nova foi feita.

- **Revalidação imediatamente antes do envio**: entre `claimAttempt` (que já revalida posse) e a
  chamada real ao provedor, falta um passo que hoje não existe no pacote A porque o executor é
  sempre substituto: revalidar `analyze` do `requestedByUserId` e `assertWorkspaceAgentEnabled`
  (hoje não chamada pelo caminho equivalente a `processRunPayload`, achado já registrado na
  Atualização 1.10/1.11) IMEDIATAMENTE antes de gastar uma chamada real — nunca reaproveitar a
  checagem feita no momento do `claimAttempt`, pelo mesmo motivo já estabelecido para
  `concludeAttempt` nesta unidade.
- **Autorização de conteúdo e consumo**: duas autorizações distintas, nunca fundidas — autorização
  de ACESSO (o resolvedor, já real) decide QUEM pode pedir a análise; autorização de CONSUMO
  (quota/billing, componente a identificar — candidato mais próximo:
  `WorkspaceQuotaGrant`/`checkScopePermission`, nenhum dos dois hoje aplicado a chamadas de
  modelo do Radar) decide se HÁ orçamento/permissão para gastar a chamada em si. A ausência de
  qualquer uma bloqueia, nenhuma substitui a outra.
- **Controle de retries por chamada, incluindo camadas internas**: pendência já registrada na
  Atualização 1.14/1.18 — decisão sobre se `completionEngine.ts` (executor real do Core, ainda não
  tocado por esta unidade) aplica retry automático em alguma camada interna própria, e se isso é
  aceitável para o Radar (que exige NENHUMA retentativa automática após falha/expiração/
  cancelamento, Atualização 1.12/1.18) — precisa de override explícito por chamada ou aceitação
  documentada do padrão global, decisão ainda não tomada.
- **Vínculo entre execução, tentativa e resultado**: `RadarAnalysisAttempt.runId` já existe no
  schema (nulo até a execução real publicar um `Run`, Atualização 1.12/1.15) — a próxima unidade
  precisa decidir SE e QUANDO um `Run` real é criado (hoje nenhum caminho de produção cria um), e
  garantir a mesma disciplina de posse (`claimToken`) entre a tentativa e esse `Run`, sem duplicar
  controle de concorrência.
- **Recuperação de resultado desconhecido sem repetição automática**: já coberta em desenho
  (Atualização 1.12, cenários A–E) — a próxima unidade só precisa decidir SE integra `RunEvent`
  como evidência durável da resposta bruta (proposta, nunca implementada) ou mantém a resposta
  conhecida só através de `preservedResultPayload` (como hoje) — em ambos os casos, resposta
  desconhecida continua sendo tratada como falha técnica, nunca como sucesso presumido, e nenhuma
  nova chamada é automática.
- **Componentes existentes candidatos**: `completionEngine.ts` (execução real, não tocado);
  `assertWorkspaceAgentEnabled` (existente, hoje não chamada no caminho equivalente);
  `WorkspaceQuotaGrant`/`checkScopePermission` (candidatos a autorização de consumo, nenhum ainda
  aplicado ao Radar); `RunEvent` (candidato a evidência durável da resposta bruta, proposta não
  integrada). Nenhum componente novo foi proposto — todos já registrados em rodadas anteriores.
- **Dependências**: decisão humana sobre override de retries (acima); mapeamento de qual mecanismo
  de consumo/quota se aplica a chamadas de modelo do Radar (não mapeado ainda); decisão sobre criar
  ou não um `Run` real por tentativa.

Nenhuma implementação foi feita sob esta proposta. Nenhuma busca ampla do Core foi reaberta — só
os componentes já identificados em rodadas anteriores foram citados.

**Correção sobre resultado ambíguo, incorporada na Atualização 1.28**: a formulação acima
("resposta desconhecida... tratada como falha técnica") está imprecisa e é substituída — falha de
transporte não comprova que o provedor deixou de processar ou cobrar, e marcar a tentativa como
`failed` a tornaria terminal, liberando o slot de "uma tentativa ativa" para uma nova chamada real
automática ou inadvertida. O comportamento correto — aliás, já o comportamento REAL do pacote A
hoje (teste "falha do provedor", `F-analysis-end-to-end.test.ts`: a tentativa permanece `running`,
nunca `failed`, quando o executor lança antes de `preserveResult`) — é preservar a ambiguidade num
estado NÃO terminal, detalhado na Atualização 1.28, seção "Decisão 5".

## Atualização 1.28 — desenho documental do caminho seguro de execução real (17/09/2026)

Só documentação, pedida como continuação direta da proposta curta da Atualização 1.27. Nenhum
código, schema, migration, teste ou chamada real foi feito ou alterado. Escopo: as seis decisões
pedidas, componentes reutilizados, alterações mínimas necessárias, testes de aceite, e uma
proposta de piloto real com limites explícitos — o piloto continua só proposta, não executado.
Nenhuma busca ampla do Core foi reaberta; só componentes já identificados em rodadas anteriores
são citados.

### Decisão 1 — Autorização pré-envio

Entre `claimAttempt` (já existente, revalida posse) e a chamada real ao provedor, a próxima
unidade precisa de um passo NOVO — um checkpoint imediatamente antes do envio, nunca reaproveitando
a checagem feita no `claim` — que revalide, nesta ordem:
1. `analyze` do `requestedByUserId` via o resolvedor real já implementado
   (`createRadarEntityAccessResolver`) — mesmo padrão já usado em `concludeAttempt`.
2. `assertWorkspaceAgentEnabled` (existente em `@eiah/core`, hoje NÃO chamada por nenhum caminho
   equivalente do Radar — achado já registrado nas Atualizações 1.10/1.11/1.12) contra
   `WorkspaceAgentAssignment` do agente que executaria a análise.
3. Posse vigente: `claimToken` + `status='running'` + `clock_timestamp() < claimedAt + TTL` — MESMA
   condição já usada em `preserveResult`, aplicada aqui como leitura de confirmação, não como
   escrita (a escrita condicionada continua sendo o gate final na volta, não na ida).

Este checkpoint só evita GASTAR uma chamada real já sabidamente não autorizada — ele não impede
uma expiração que ocorra DURANTE a chamada em si (isso continua sendo resolvido só na volta, pela
escrita condicionada de `preserveResult`, sem mudança).

### Decisão 2 — Consumo

Autorização de ACESSO (quem pode pedir a análise — o resolvedor, já real) é distinta de
autorização de CONSUMO (se há orçamento/permissão para gastar uma chamada real específica) — nunca
fundidas. Candidato mais próximo já existente no schema: `WorkspaceQuotaGrant`
(`enabled`, `localRunLimit`, `localCostCentsLimit`) — **candidato, não confirmado**: esta rodada
não investigou se algum caminho do Core já aplica esse modelo a criação de `Run`, para não reabrir
busca ampla; a próxima unidade precisa mapear isso antes de decidir se reaproveita ou propõe um
mecanismo próprio. Qualquer que seja o mecanismo, a leitura de saldo e o consumo (reserva) precisam
ser uma ÚNICA escrita condicionada atômica (mesmo padrão de escrita condicionada já usado em toda
esta unidade) — nunca "ler saldo, decidir, gastar" em passos separados, pelo mesmo motivo já
demonstrado para grants e para a guarda de tentativa única.

### Decisão 3 — Retries, em todas as camadas

Controle EXPLÍCITO por chamada, nunca herdado silenciosamente de configuração global, em três
camadas potencialmente independentes: (1) o cliente HTTP/SDK que `completionEngine.ts` usaria para
a chamada real — muitos SDKs de provedor têm retry automático LIGADO por padrão; precisa de
override explícito, documentado, por chamada; (2) qualquer camada de fila/worker que viesse a
existir no futuro (nenhuma existe hoje) — reentrega de mensagem nunca pode reexecutar uma chamada
já em voo ou já respondida, mesma disciplina já aplicada ao `claimToken`; (3) o próprio
`completionEngine.ts`, se ele tiver uma política de retry interna própria — decisão ainda pendente
desde a Atualização 1.14/1.18 sobre se aceita o padrão global ou exige override por chamada; sem
essa decisão, nenhuma chamada real pode ser autorizada com segurança.

### Decisão 4 — Registro da execução

`RadarAnalysisAttempt.runId` já existe no schema (nulo até a execução real publicar um `Run`,
Atualização 1.12/1.15). Proposta: criar o `Run` na MESMA transação que transiciona a tentativa para
o estado "prestes a despachar" (antes da chamada real sair, não depois) — garante rastro auditável
mesmo se o processo cair antes da chamada completar. **Vínculo de conteúdo, explícito**: qualquer
`RunEvent`/consulta genérica de `Run` (`/runs/:id/events`, SSE, `evidenceBundle.ts`,
`runArchiveService.ts`) usa autorização por tenant/workspace, mais grosseira que o resolvedor por
entidade do Radar (achado já registrado, Atualização 1.15) — logo, NENHUM conteúdo real (objetivo,
material, resposta do provedor) pode ser espelhado em `RunEvent` ou em qualquer campo do `Run`
alcançável por essas rotas genéricas. O `Run` carrega só metadados opacos (status, timestamps,
referência ao `attemptId`); o conteúdo real continua exclusivamente em
`RadarAnalysisAttempt`/`RadarRecommendation`, sob o resolvedor por entidade, sem exceção.

### Decisão 5 — Resultado ambíguo (corrigida nesta atualização)

Falha de transporte (timeout, conexão perdida, erro 5xx sem corpo interpretável) NUNCA prova que o
provedor deixou de processar ou cobrar. Proposta:
- A tentativa permanece em estado NÃO terminal — `running` (mesmo comportamento já real e
  comprovado do pacote A hoje, não uma mudança) — nunca transiciona automaticamente para `failed`.
  Isso é deliberado: `failed` é terminal e ficaria fora do índice único parcial de "uma tentativa
  ativa" (`pending`/`running`/`provider_responded_pending_persistence`), liberando o slot para uma
  nova tentativa — e, por extensão, uma nova chamada real — de forma automática ou inadvertida.
  Permanecer `running` mantém o bloqueio.
- Nenhum código dispara uma nova chamada automaticamente a partir desse estado — recuperação é
  sempre decisão explícita.
- Duas rotas de recuperação, nenhuma automática: (a) `reclaimExpiredAttempt` (já existente) após o
  TTL, seguido de uma NOVA decisão de autorização de consumo (Decisão 2) antes de qualquer nova
  chamada — nunca um retry silencioso; (b) SE o provedor específico comprovar (não presumir)
  suporte a idempotência própria por chave de requisição, uma reconciliação poderia consultar o
  status da chamada original sem gastar uma nova geração — capacidade a verificar por provedor,
  não presumida agora (mesma cautela já registrada na Atualização 1.12, cenário B).

**Precisão A — recuperação e consumo, nunca confundidos** (corrige e detalha o texto acima, sem
substituí-lo):
- Ler um resultado já concluído (`getRadarRecommendation`) sempre exige autorização de LEITURA
  vigente no instante da leitura — já estabelecido e testado (Atualizações 1.26/1.27); reafirmado
  aqui para deixar explícito que a leitura nunca é isenta dessa checagem, por mais antigo que seja
  o resultado.
- Concluir um resultado JÁ preservado (`concludeAttempt`, retomando a partir de
  `provider_responded_pending_persistence`) exige os controles de ACESSO (`analyze` vigente) e de
  POSSE (`claimToken`/status/prazo) já previstos — mas NÃO exige nova autorização de CONSUMO
  (Decisão 2): nenhuma chamada nova ao provedor acontece nessa retomada, logo não há novo gasto a
  autorizar. Consumo é autorizado por CHAMADA AO PROVEDOR, nunca por uma operação de banco.
- Uma chamada GENUINAMENTE NOVA ao provedor — para uma tentativa nova sob outra
  `attemptOperationKey`, ou para reexecutar depois de uma reconciliação (rota (a) acima) — exige
  autorização específica e completa (Decisões 1 e 2, do zero) E precisa tratar explicitamente a
  ambiguidade da tentativa anterior: não basta autorizar a chamada nova isoladamente sem antes
  decidir o que fazer com a tentativa ambígua que a precedeu (encerrá-la, documentá-la, ou
  vinculá-la de forma rastreável) — nunca simplesmente ignorá-la.
- Recuperação (leitura ou retomada de conclusão) nunca dispara, por si só, uma chamada nova ao
  provedor, em nenhum caminho — reafirmado sem exceção.

**Precisão B — estado `failed` e o significado de `running`** (corrige e detalha o texto acima):
- Transicionar uma tentativa para `failed` é, isoladamente, só uma escrita de status — ela LIBERA o
  bloqueio do índice único parcial para uma tentativa nova (por design: é assim que uma falha
  genuinamente conhecida, como referência inválida ou payload grande demais, permite um retry
  manual sob nova chave, comportamento já correto e usado desde o pacote A). Essa transição, por
  si, NÃO dispara nenhuma chamada ao provedor. O risco real não está na transição em si — está num
  caminho POSTERIOR (um orquestrador, uma reconciliação automática, um botão de "tentar de novo"
  mal desenhado) que trate `failed` como sinônimo de "seguro para repetir automaticamente" sem
  verificar SE o motivo é um desfecho conhecido ou uma ambiguidade que nunca deveria ter chegado a
  `failed`.
- É exatamente por isso que a Decisão 5 insiste em nunca transicionar uma resposta de transporte
  desconhecida para `failed`: fazer isso tornaria essa ambiguidade indistinguível, para qualquer
  consumidor futuro do status, de uma falha genuinamente conhecida e segura de repetir. `failed`
  deve continuar significando "desfecho conhecido, seguro para nova tentativa explícita" — nunca
  "desfecho desconhecido".
- Precisão sobre `running`: no cenário de resposta desconhecida, permanecer em `running`
  representa APENAS "ausência de desfecho conhecido, tratado como ainda não concluído para fins do
  bloqueio de tentativa única" — não é uma afirmação de que um trabalhador/processo continua ativo
  executando essa tentativa (o processo que fez a chamada pode já ter terminado, com erro, muito
  antes). Reaproveitar o nome `running` para os dois sentidos (execução ativa E ambiguidade
  pós-falha de transporte) é uma sobreposição que a próxima unidade de implementação deve ter em
  mente — registrada aqui como ressalva de nomenclatura, não resolvida nesta atualização; não foi
  pedido, e não é necessário agora, introduzir um estado novo.

### Decisão 6 — Integração antes de rede real

Pré-condição, não uma sugestão: todo o desenho das Decisões 1–5 precisa ser implementado e testado
primeiro com o MESMO executor/provedor substituto já existente (pacote A) e os MESMOS grants
persistidos (resolvedor real, Atualização 1.26/1.27) — end-to-end, localmente, sem rede real —
antes de qualquer autorização para um piloto com provedor real. Isso NÃO está implementado ainda;
é o desenho para a próxima unidade de implementação local, ainda sem chamada real.

### Componentes reutilizados (nenhum novo proposto)

`createRadarEntityAccessResolver`/`RadarEntityAccessGrant` (Atualização 1.26); `claimAttempt`/
`preserveResult`/protocolo de `claimToken` (pacote A); `assertWorkspaceAgentEnabled`
(`@eiah/core`, existente, não chamada hoje neste caminho); `WorkspaceQuotaGrant` (candidato a
consumo, não confirmado); `completionEngine.ts` (execução real, não tocado); `Run`/`RunEvent`
(schema existente, uso restrito a metadados opacos); índice único parcial de tentativa ativa
(Atualização 1.20).

### Alterações mínimas necessárias (nenhuma feita nesta atualização)

- Novo checkpoint de autorização pré-envio (Decisão 1) — provavelmente um novo símbolo em
  `radarAnalysisAttemptService.ts`, análogo a `assertAttemptAccess`, mas com as três verificações
  adicionais.
- Mecanismo de consumo (Decisão 2) — depende do mapeamento ainda pendente de `WorkspaceQuotaGrant`
  ou equivalente; sem isso mapeado, não é possível dimensionar a alteração.
- Configuração explícita de retry por chamada (Decisão 3) — depende de decisão humana sobre
  `completionEngine.ts`, registrada como pendência, não uma alteração de código ainda dimensionável.
- Criação de `Run` vinculado à tentativa (Decisão 4) — extensão pontual em
  `radarAnalysisAttemptService.ts`, criando o `Run` na mesma transação do passo que hoje seria
  `claimAttempt` ou um novo passo "despachar".
- Nenhuma mudança na máquina de estados da tentativa é necessária para a Decisão 5 — o
  comportamento correto já existe (permanecer `running`); só a documentação precisava de correção.

### Testes de aceite propostos (nenhum escrito ou executado)

1. Checkpoint pré-envio recusa quando `analyze` foi revogado entre o `claim` e o envio (mesma
   técnica de corrida determinística já usada na Atualização 1.26/1.27).
2. Checkpoint pré-envio recusa quando `assertWorkspaceAgentEnabled` reprova, mesmo com posse e
   acesso válidos.
3. Consumo: duas tentativas concorrentes de reservar o mesmo orçamento limitado — exatamente uma
   reserva, a outra recusada, nunca as duas gastando o mesmo saldo.
4. Retry: configuração de retry do cliente/SDK usado é explicitamente zero/documentada por
   chamada — verificação de configuração, não de rede real.
5. `Run` criado na mesma transação do passo de despacho; queda simulada antes da chamada real
   ainda deixa o `Run` rastreável com o `attemptId` associado.
6. Nenhum conteúdo real (objetivo/material/resposta) aparece em `RunEvent` nem em qualquer campo
   de `Run` alcançável pelas rotas genéricas — verificado por inspeção do payload gravado.
7. Falha de transporte simulada (executor substituto lança): tentativa permanece `running`, nunca
   `failed`; nenhuma nova chamada automática; índice único parcial continua bloqueando uma segunda
   tentativa enquanto o estado for `running`.
8. Reconciliação explícita (`reclaimExpiredAttempt` + nova decisão de consumo) é o único caminho
   observável para uma nova tentativa depois de uma falha de transporte — nunca automático.
9. Integração completa (Decisão 6): o fluxo inteiro das Decisões 1–5 passa com executor/provedor
   substituto e grants reais, sem nenhuma chamada de rede, antes de qualquer piloto.

### Proposta de piloto real — limites explícitos (só proposta, não executado)

Se e quando autorizado separadamente, depois de TODAS as decisões acima implementadas e testadas
localmente: um único tenant/workspace/entidade de teste interno (nunca dado real de cliente);
provedor e modelo fixados por nome, sem seleção dinâmica; `requestedMaxTokens` com teto reduzido
explícito; número TOTAL de chamadas reais limitado por um contador auditável, não por estimativa;
retry de transporte desligado por completo (zero, não "baixo"); disparo manual por operação humana
específica, nunca automático/agendado; nenhuma integração com fila ou worker operacional; sem
Instagram nem qualquer publicação; interruptor de emergência que bloqueia novo despacho sem
depender de reiniciar processo; toda chamada real registrada com evidência auditável equivalente à
já exigida para grants (quem autorizou o consumo, quando, para qual tentativa). Este piloto não
está autorizado por esta atualização — é só a forma proposta que ele teria, para decisão humana
separada e explícita.

Nenhuma implementação foi feita sob esta atualização. Nenhuma chamada real a modelo ocorreu.
Nenhuma busca ampla do Core foi reaberta.
