# Audit Front Door Orchestration - 2026-07

## Escopo e status

Auditoria arquitetural e baseline passivo para a convivencia entre `/app/chat` e `/app/imob/chat`. Este documento nao cria `OrchestrationDecisionV1`, nao altera roteamento e nao autoriza redirect. Status: `parcial`.

## Diagnostico

O EIAH e o front door normativo, mas o runtime ainda possui duas malhas conversacionais. Consultas comerciais como "quais os imoveis que voce tem" podem nao casar com o resolver IMOB e colidir com sinais LEGAL amplos. O tipo/string `orchestrator` tambem acumula responsabilidades de modo, rota, coordenacao e apresentacao, impedindo interpretar o resultado como decisao canonica de orquestracao.

O problema nao deve ser corrigido somente por keywords. Antes de qualquer novo contrato, e obrigatorio inventariar o que ja existe, seus owners, consumidores, baselines e gaps.

## Decisoes

- nao iniciar por redirect;
- manter `/app/imob/chat` ativo ate paridade funcional comprovada;
- preservar bookmarks, deep links, threads, approvals, knowledge, intake e proofs;
- usar `/app/chat` como destino arquitetural sem declarar unificacao fechada;
- usar telemetria passiva para formar baseline, sem alterar decisao ou UX;
- manter `activeDomain` como contexto, nunca autorizacao;
- manter `ChatAgentLauncher` render-only.

## Inventario obrigatorio antes de OrchestrationDecisionV1

| Candidato | Verificar | Decisao preliminar |
| --- | --- | --- |
| `EiahDecision` | shape, modos, route intent, presentation intent e consumers | Estender/adaptar somente apos inventario. |
| Receipt Canon v1 | ownership de prova critica e versionamento | Reutilizar quando aplicavel; telemetria nao substitui. |
| Reason codes | catalogo, estabilidade e ownership | Reutilizar; novos codigos exigem catalogo. |
| Policy Engine/result shape | allowed/blocked, requirements e auditabilidade | Adaptar, sem policy no frontend. |
| Fallback/clarificacao | contratos do EIAH, thresholds e loops | Reutilizar ou estender no agente/engine. |
| Handoff/surface | schemas, snapshots e render surfaces read-only | Reutilizar/adaptar antes de criar outro contrato. |
| Contexto/threads IMOB | conversation, thread, case e `entityRef` | Preservar na migracao e no Caso 7. |
| Knowledge Search | entitlement, provenance e modos atuais | Migrar por surface, sem duplicar resolver. |
| Approvals/proofs/bundles | adapters e fontes backend existentes | Reutilizar; nenhuma inferencia frontend. |
| Telemetria | helpdesk sessions, `conversation.telemetry`, MemoryEvent e summaries | Reutilizar com envelope passivo de rota. |

## Caso 7

**Continuidade multi-vertical na mesma thread:** usuario inicia com intencao IMOB de inventario, recebe resposta da vertical, depois pede analise juridica relacionada ao mesmo imovel/`entityRef`. O engine deve trocar para LEGAL com governanca reavaliada, preservar contexto, nao resetar a conversa e bloquear fail-closed se faltar tenant/workspace/entitlement/policy.

Sem E2E desse caso, o status maximo da unificacao permanece `parcial`.

## Bloqueios e dependencias

- inventario de reuso ainda nao concluido;
- Caso 7 estava indefinido e passa a ter definicao canonica neste preflight;
- diagnostico deve permanecer indexado por path existente;
- threshold de confidence nao pode ser escolhido sem baseline e calibracao;
- PR 0 e PR 7 estao autorizados;
- PR 1+ permanecem bloqueados ate conclusao e revisao do PR 0;
- PR 2 depende formalmente do PR 1;
- PR 4 deve incluir limite de tentativas de clarificacao e reasonCode estavel;
- PR 5 deve incluir teste fail-closed.

## Baseline passivo de rotas - PR 7

A coleta usa o endpoint observacional `POST /api/helpdesk/telemetry`, persistido em `MemoryEvent` com key `chat.route.telemetry`. O payload nao contem texto da mensagem nem resposta. `/app/chat` e `/app/imob/chat` sao distinguidos por `surfaceRoute`.

Campos coletados somente quando observaveis: entrada/deep link, domain hint, selected vertical, route intent, fallback/tutorial generico resolvido, Knowledge Search, upload/intake, proof/receipt/bundle, continuidade de thread, troca de vertical e erro/fail-closed.

Uso recomendado do baseline:

1. agrupar por tenant/workspace, `surfaceRoute` e janela;
2. comparar entradas, features exclusivas, erros e continuidade;
3. medir paridade antes de banner ou redirect;
4. manter a coleta passiva e fora de qualquer decisao de rota;
5. nao promover desativacao de `/app/imob/chat` sem amostra suficiente e E2E do Caso 7.

## Riscos remanescentes

- amostra inicial pode ser pequena ou enviesada;
- selected vertical e route intent ainda nao existem em todos os resultados;
- telemetria de rota nao prova governanca nem substitui ledger/receipt;
- a rota dedicada ainda concentra funcionalidades nao presentes no front door;
- nao existe calibracao aprovada de confidence.
