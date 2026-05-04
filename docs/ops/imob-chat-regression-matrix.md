# IMOB Chat Regression Matrix

Matriz versionada de regressão conversacional do `IMOB_CRM`.

Objetivo:
- transformar jornadas e prompts do chat em cenários auditáveis;
- ligar cada cenário crítico a um teste real;
- explicitar payload esperado e side effects proibidos;
- endurecer a trilha `agent-driven` sem criar regra na UI.

## Convenções

- `P0`: regressão crítica; precisa de teste automatizado.
- `P1`: importante; pode começar como validação manual.
- `P2`: cobertura ampliada/operacional.
- `expectedPayload`: estado mínimo verificável no backend.
- `forbiddenSideEffects`: mutações que não podem acontecer ao processar o prompt.
- `owner`: módulo técnico responsável pelo comportamento.

## Matriz

| journey | priority | initialStateFixture | prompt | expectedBehavior | expectedPayload | forbiddenSideEffects | relatedTest | owner | status |
|---|---|---|---|---|---|---|---|---|---|
| Piloto read-only | P0 | Caso `visit.schedule` sem approval/rollout persistido | `Sem executar nada, me diga o status atual do piloto deste caso.` | Ler estado do piloto sem iniciar nada | `pilotOperationalState.status = approval_required`, `trackingId = null`, `evidenceRefs = []` | `no approval entry created`, `no trackingId generated`, `no evidenceRefs appended`, `no rollout state mutation` | `apps/api/src/tests/imob-pilot-control-runtime.test.ts`, `apps/api/src/tests/imob-pilot-operational-surface.test.ts` | `imob-pilot-operational-surface` | Automatizado |
| Abertura de caso não inicia piloto | P0 | Caso `visit.schedule` aberto por consulta | `consultar caso case-visit-1` | Abrir leitura operacional do caso sem start implícito | `action = crm.case.lookup`, `pilotOperationalState.status = approval_required`, `trackingId = null` | `no pilot start`, `no approval entry created`, `no evidenceRefs appended` | `apps/api/src/tests/imob-crm-resolver.test.ts` | `imob-crm-operational-case` | Automatizado |
| Transição qualificação -> visita | P0 | Lead qualificado, `flow = lead.qualify`, `pendingFields = []`, `propertyId` presente | `Quero agendar uma visita para este caso` | Abrir `visit.schedule` | `operational.flow = visit.schedule`, `visitDraft.propertyId` herdado, `pendingFields = [preferredDate]` | `no lead.qualify reopen` | `apps/api/src/tests/imob-crm-turn-continuity.test.ts` | `imob-crm-turn-continuity` | Automatizado |
| Visita sem imóvel vinculado | P0 | Lead qualificado, `propertyId = null` | `Quero agendar uma visita para este caso` | Bloquear em contexto de visita, não em qualificação | `operational.flow = visit.schedule`, `pendingFields includes propertyId` | `no lead.qualify reopen` | `apps/api/src/tests/imob-crm-turn-continuity.test.ts` | `imob-crm-turn-continuity` | Automatizado |
| Lead locação limpa desiredGoal | P0 | Lead com `pendingItems = [desiredGoal, faixa de orçamento]` | `objetivo do lead locação` | Atualizar goal e limpar pendência fantasma | `lead.goal = locacao`, `pendingItems excludes desiredGoal` | `no residual desiredGoal in response`, `no duplicate pending field` | `apps/api/src/tests/imob-crm-resolver.test.ts` | `imob-crm-operational-lead-update` | Automatizado |
| Duplicidade de proprietário preserva entidade | P0 | Fluxo `owner.create` em dedupe, `ownerDraft.ownerDocument` presente | `atualizar existente` | Reescrever escolha genérica para update explícito do cadastro encontrado | `resolved.action = crm.owner.update`, `message rewritten to owner identifier` | `no fallback consult loop`, `no owner identity loss` | `apps/api/src/tests/imob-crm-turn-engine.test.ts` | `imob-crm-turn-engine` | Automatizado |
| Fallback caso mais recente | P0 | Workspace com caso recente disponível | `Use o caso mais recente` | Abrir o caso recente de forma consultiva | `action = crm.case.lookup`, texto inclui `Usei o caso IMOB mais recente` | `no fake success completion`, `no empty stage completion` | `apps/api/src/tests/imob-crm-resolver.test.ts` | `imob-crm-operational-case` | Automatizado |
| Equivalência chip x texto livre | P0 | Sem estado prévio | `cadastrar proprietário` / `quero incluir proprietário`; `cadastrar imóvel` / `quero incluir imóvel` | Produzir o mesmo fluxo operacional | `operation`, `flow`, `form.label` e `fields[]` equivalentes | `no drift between chip and free text` | `apps/api/src/tests/imob-turn-resolver.test.ts` | `imob-turn-resolver-contract` | Automatizado |
| Mostrar bloqueios do caso | P1 | Caso com blocker e `nextStep` recursivo | `mostrar bloqueios do caso` | Expor blocker real e próximo passo seguro | `action = crm.case.blocked_run_resolution`, `decisionRationale` presente | `no recursive next step`, `no recursive CTA` | `apps/api/src/tests/imob-crm-resolver.test.ts` | `imob-crm-business-read` | Automatizado parcial |
| Cadastro de imóvel | P1 | Fluxo `property.create` com campos faltantes | `Cadastrar imóvel` + preenchimento do formulário | Salvar e limpar pendências reais | `flow = property.create`, `status = ready_for_review` ao concluir | `no hidden pending reopening` | Manual | `imob-turn-resolver-contract` | Manual |
| Cadastro de proprietário com documento novo | P1 | Fluxo `owner.create` com `ownerDocument` pendente | `Documento do proprietário 41741741785` | Atualizar documento e avançar | `pendingFieldLabels excludes ownerDocument` | `no owner reassociation`, `no duplicate owner creation` | Manual | `imob-crm-operational-owner-update` | Manual |
| Retomada contextual | P2 | Fluxo ativo com pendência | `continuar` / `retomar de onde paramos` | Voltar à etapa correta | `conversationState.operational.flow` preservado | `no journey reset` | Manual | `imob-crm-turn-engine` | Manual |

## Observações

- Esta matriz não autoriza lógica nova no `chat.tsx`.
- Qualquer correção deve nascer em contrato, engine, resolver ou runtime backend.
- Quando um cenário `P0` mudar, o `relatedTest` deve ser atualizado no mesmo patch.

## Resultados Manuais

| scenario | observedResult | bugStatus | fixedIn | notes |
|---|---|---|---|---|
| Captação inicial vazava pendências técnicas | O chat mostrava `Bloqueio atual`, `Pendências atuais` e instruções internas junto do formulário de imóvel | Corrigido | `QA-IMOB-3` | Os dados continuam no `conversationState.operational`, mas saem do texto visível |
| Lead qualificado ainda reabria jornada errada | Pedido de visita podia voltar para `Cadastrar lead` ou manter copy de reabertura do cadastro | Corrigido | `QA-IMOB-3` | A continuidade prioriza `visit.schedule` quando o lead está qualificado |
| `desiredGoal` ficava preso mesmo após `Finalidade do lead` | O caso seguia com pendência fantasma após o formulário do lead | Corrigido | `QA-IMOB-1` | Mapeamento explícito entre finalidade/objetivo e `desiredGoal` |
| Dedupe de proprietário entrava em loop | `criar um novo` e variantes podiam cair em menu genérico ou listagem errada | Corrigido | `QA-IMOB-1` e `QA-IMOB-3` | A engine reescreve variantes naturais para comandos explícitos e preserva a entidade encontrada |
| `Use o caso mais recente` concluía etapa vazia | A conversa podia responder com sucesso genérico sem abrir o caso | Corrigido | `QA-IMOB-1` | O fallback agora abre o caso mais recente de forma consultiva |
| `cadastro` ambíguo desviava para lead | Em contexto ativo de captação/proprietário, `cadastro` podia sair do fluxo atual | Corrigido | `QA-IMOB-3` | O backend respeita o contexto ativo e oferece continuidade guiada |
| Leitura consultiva repetia instruções técnicas | `mostrar pendências do caso` podia reaparecer como próximo passo textual | Corrigido | `QA-IMOB-3` | O texto visível traduz o próximo passo para linguagem operacional |
| Blocos do caso apareciam duplicados | `Pendências do negócio`/`Caso`/apoios podiam repetir na mesma leitura | Corrigido parcial | `QA-IMOB-3` | O widget redundante foi suprimido nas leituras estruturadas; manter monitoramento manual |
