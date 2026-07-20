# Contexto vertical IMOB

Status: arquitetura parcial/proposta. Este documento descreve a direcao arquitetural e o estado de transicao do IMOB; nao declara paridade, rollout concluido ou implementacao `DONE`.

## Direcao arquitetural

O EIAH e o front door universal da plataforma. O IMOB deve operar como uma vertical especializada dentro dessa conversa, preservando continuidade de thread, contexto governado e apresentacao coerente com o agente ativo.

- `/app/chat` e a entrada alvo para reconhecer a intencao IMOB, anunciar o handoff e apresentar capacidades da vertical.
- `/app/imob/chat` permanece temporariamente como baseline e cockpit conversacional dedicado enquanto nao existe paridade transversal comprovada no front door.
- A rota dedicada nao deve ser removida nem redirecionada nesta etapa.

## Capacidades reconhecidas no front door

O front door ja possui superficies parciais para IMOB:

- reconhecimento deterministico de intencao IMOB e selecao de contexto vertical;
- exposicao de `routeIntent` e `selectedVertical` na apresentacao resolvida e na telemetria observacional aplicavel;
- handoff anunciado e respostas contextuais governadas pelo contrato do agente;
- preview read-only baseado em fixture sintetica/sanitizada, explicitamente nao operacional;
- telemetria passiva sem persistencia de prompt, resposta ou documento bruto;
- continuidade local limitada a sessao/superficie existente.

Essas capacidades nao equivalem a uma operacao IMOB completa no front door.

## Capacidades ainda dedicadas

As seguintes capacidades permanecem exclusivas ou materialmente dependentes de `/app/imob/chat` e de suas superficies especializadas:

- busca IMOB real e Knowledge Search conectada a API;
- conversas, mensagens, threads e contexto de caso persistidos;
- cards, resultados, widgets e formularios operacionais;
- intake, upload e anexacao de documentos;
- entrevista e geracao de contrato;
- acoes dirigidas, runs e gates HITL;
- proof, receipt e bundle reais;
- custos, reconciliacao, links de workbench e superficies de comando.

Capacidades com provider, persistencia ou efeito funcional nao devem ser inferidas a partir das superficies read-only atuais.

## Contrato agent-driven

A migracao deve seguir a arquitetura `agent-driven`:

1. definir um contrato transversal e versionado para o agente e a vertical;
2. executar routing, handoff, fallback, clarificacao, bloqueios e continuidade no engine;
3. entregar ao `ChatAgentLauncher` somente o resultado resolvido para renderizacao;
4. adicionar superficies, telemetria, E2E e rollout governado depois do contrato.

Nenhuma regra cognitiva, de policy ou de negocio deve nascer no `ChatAgentLauncher`.

## Bloqueios e criterios de paridade

- Redirect de `/app/imob/chat` para `/app/chat` esta bloqueado.
- PR 1+ permanecem bloqueados ate existir contrato transversal aprovado e autorizacao explicita para implementacao.
- Paridade exige continuidade de thread/caso, referencias canonicas, RBAC/entitlements, fail-closed, comportamento read-only e mutacional governado, E2E das jornadas criticas e plano de rollout/rollback.
- Provider, DB, ledger/audit, intake, run, proof, receipt e bundle reais exigem contratos e gates proprios; este documento nao os habilita.

## Evidencia

Este arquivo e uma especificacao arquitetural parcial, nao uma evidencia de execucao. Ele nao deve ser indexado como comprovacao de feature, paridade ou operacao. Evidencias futuras devem apontar para artefatos fisicos produzidos por testes, CI e validacoes autorizadas depois que cada capacidade existir.

## Referencias

- [Agent Chat Runtime](./agent-chat-runtime.md)
- [IMOB CRM Governed Runtime](./imob-crm-governed-runtime.md)
- [ADR: IMOB Journey Governed by Case](./adr-imob-journey-governed-by-case.md)
- [Front Door Orchestration Audit](../ops/audit/AUDIT-FRONTDOOR-ORCHESTRATION-2026-07.md)
- [Universal Chat Front Door Vertical Operating Model](../proposals/universal-chat-front-door-vertical-operating-model.md)
