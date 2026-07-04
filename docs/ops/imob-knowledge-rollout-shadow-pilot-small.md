# IMOB Knowledge Rollout - Shadow -> Pilot -> Small

## 1. Resumo executivo

Este plano formaliza a promocao operacional da IMOB Knowledge Base v1, hoje ja evidenciada em tres camadas:

- fundacao `data/schema/check`;
- loader backend deterministico em `shadowMode`;
- integracao governada no engine-side IMOB via `knowledgeContext`.

O rollout proposto nao ativa nada neste PR. Ele define como promover a capacidade de `shadow` para `pilot` e depois `small` sem alterar `ChatAgentLauncher`, sem mudar UX ampla e sem relaxar os gates fail-closed ja estabelecidos.

## 2. Estado atual evidenciado

Estado atual comprovado por evidencia indexada:

- a KB possui manifesto versionado, schemas locais e 5 entries seed conservadoras;
- `pnpm check:imob-knowledge-base` valida manifesto, schemas e entries;
- o loader `imobKnowledgeBaseLoader` carrega a KB de forma deterministica e fail-closed;
- o engine IMOB resolve `knowledgeContext` por mapa deterministico `intencao -> entry`;
- temas sensiveis sao degradados para orientacao segura com `requiresHumanReview`;
- o fluxo atual permanece engine-side, sem mudanca no `ChatAgentLauncher` e sem UX nova.

## 3. Escopo do rollout

Incluido neste rollout futuro:

- promocao operacional da integracao ja existente em `search_knowledge`;
- observabilidade por `tenantId/workspaceId`;
- verificacao de provenance, bloqueio sensivel e regressao user-facing;
- criterio de rollback por estagio.

Fora do rollout:

- busca vetorial;
- ingestao automatica;
- sync pipeline novo;
- nova vertical;
- mudancas em billing, Redis, Agent Protocol, launcher ou apps/web.

## 4. Estagio shadow

Objetivo:

- operar o `knowledgeContext` apenas como capacidade governada de bastidor;
- coletar metricas e evidencias sem ampliar exposicao de produto;
- confirmar que todo match tem provenance completa e que temas sensiveis continuam degradados.

Condicoes do shadow:

- somente `search_knowledge`;
- `shadowMode: true` obrigatorio;
- `knowledgeContext` como payload interno/auditavel;
- sem onboarding comercial do recurso;
- sem dependencia de UX dedicada.

Evidencia esperada em shadow:

- taxa de matches por entry/intencao;
- ausencia de erro de manifesto/loader;
- ausencia de resposta automatica proibida em temas sensiveis;
- logs por `tenant/workspace` com provenance completa.

## 5. Gates para pilot

Requisitos minimos para sair de shadow:

- `provenanceCoverage = 100%` para todos os matches;
- `knowledgeContextErrorRate = 0` em ciclo controlado;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- nenhum tema sensivel respondido como decisao automatica;
- `ChatAgentLauncher` sem alteracao;
- rollback documentado e exercitavel;
- `entitlementDeniedRate` explicado e compatível com fail-closed esperado;
- `userFacingRegressionCount = 0` no recorte do fluxo `search_knowledge`.

## 6. Estagio pilot

Objetivo:

- validar a operacao com tenants/workspaces explicitamente aprovados;
- confirmar interpretacao correta dos matches em uso real controlado;
- revisar manualmente todos os casos sensiveis antes de qualquer promocao adicional.

Escopo sugerido:

- poucos tenants de referencia;
- poucos workspaces por tenant;
- janela operacional curta e observada;
- trilha de logs/evidencia separada por tenant/workspace.

Regras do pilot:

- manter `shadowMode: true` no contexto;
- toda consulta sensivel com `requiresHumanReview = true` entra em revisao humana obrigatoria;
- qualquer erro de provenance ou regressao user-facing interrompe promocao;
- nenhuma ativacao irrestrita do recurso.

## 7. Gates para small

Requisitos minimos para sair de pilot:

- nenhuma regressao critica;
- revisao humana concluida para os casos sensiveis observados;
- logs e evidencias por tenant/workspace preservados;
- rollback validado na pratica operacional;
- aprovacao operacional explicita;
- `kbMatchRate` e `kbNoMatchRate` entendidos o suficiente para separar lacuna de conteudo de falha de roteamento;
- `knowledgeContextErrorRate = 0` no periodo avaliado;
- `provenanceCoverage = 100%`;
- `userFacingRegressionCount = 0`.

## 8. Estagio small

Objetivo:

- ampliar de forma controlada para um grupo pequeno, mas maior que o pilot;
- sustentar a rotina de evidencias recorrentes antes de qualquer expansao posterior.

Condicoes de small:

- habilitacao limitada por tenant/workspace aprovado;
- observabilidade continua obrigatoria;
- nenhum relaxamento de `requiresHumanReview` para temas sensiveis;
- nenhum bypass de entitlement ou fail-closed.

Saida esperada de small:

- baseline operacional clara para eventual fase posterior;
- criterio empirico para expansao ou congelamento;
- evidencia indexavel por ciclo.

## 9. Metricas obrigatorias

- `kbMatchRate`: percentual de consultas que encontraram `knowledgeContext` governado valido.
- `kbNoMatchRate`: percentual de consultas que nao encontraram match util e exigem refinamento ou conteudo novo.
- `sensitiveBlockRate`: percentual de consultas sensiveis que foram degradadas/bloqueadas corretamente.
- `humanReviewRequiredRate`: percentual de consultas resolvidas com `requiresHumanReview = true`.
- `provenanceCoverage`: percentual de matches com `entryId/category/source/lastUpdated/provenance` completos.
- `entitlementDeniedRate`: percentual de consultas negadas por falta de entitlement ou instalacao da vertical.
- `knowledgeContextErrorRate`: percentual de falhas do loader/manifesto/entry ou erro controlado do engine.
- `userFacingRegressionCount`: contagem de regressao visivel no comportamento do fluxo `search_knowledge`.
- `auditGap`: lacunas entre evento, contexto retornado e evidencia/log esperados.
- `duplicateSideEffects`: qualquer side effect duplicado observado, esperado como zero por ser fluxo essencialmente de consulta.

## 10. Rollback

Opcoes de reversao aceitas:

- `shadow-only`: manter `knowledgeContext` apenas para observabilidade interna, sem promocao de uso operacional.
- `KB disabled`: desabilitar a resolucao da KB e voltar ao comportamento anterior de busca documental sem contexto governado.
- `search_knowledge sem knowledgeContext`: preservar o branch de busca, mas retirar o adapter da KB temporariamente.
- modo seguro equivalente: responder com erro controlado/fail-closed quando a KB nao puder ser garantida.

Gatilhos de rollback:

- `knowledgeContextErrorRate > 0`;
- qualquer tema sensivel escapando sem `humanReviewRequired`;
- regressao visivel na resposta do fluxo;
- queda de provenance coverage abaixo de 100%;
- erro de entitlement/gating fora do esperado;
- auditoria sem trilha suficiente por tenant/workspace.

## 11. Riscos e mitigacao

- lacuna de conteudo da KB:
  mitigacao: usar `kbNoMatchRate` para separar problema de acervo de problema de engine.

- resposta indevida para tema sensivel:
  mitigacao: manter `disallowedUses`, `requiresHumanReview` e degradacao segura como gate de promocao.

- drift entre loader, manifesto e engine:
  mitigacao: manter `pnpm check:imob-knowledge-base` bloqueante e exigir evidencia de recencia por ciclo.

- regressao user-facing indireta:
  mitigacao: acompanhar `userFacingRegressionCount` e congelar promocao ao menor sinal de regressao.

- uso fora de tenant/workspace autorizado:
  mitigacao: entitlement fail-closed e evidencias separadas por escopo operacional.

## 12. Evidencias por estagio

- Shadow:
  evidencia de provenance coverage, zero erro de contexto, zero resposta automatica proibida, zero regressao user-facing.

- Pilot:
  evidencia por tenant/workspace, revisao humana dos casos sensiveis, rollback pronto e aprovado, logs operacionais do periodo.

- Small:
  evidencia de estabilidade recorrente, baseline de metricas, zero regressao critica e aprovacao operacional explicita para manter o estagio.

## 13. O que continua fora do escopo

- rollout real neste PR;
- ativacao de pilot;
- ativacao de small;
- busca vetorial;
- ingestao automatica;
- mudancas em launcher, apps/web ou UX ampla;
- billing, Redis, Agent Protocol e white-label runtime.

## 14. Status conservador

- plano documental de rollout: `evidenciado`
- shadow operacional executado: `parcial`
- pilot: `proposta`
- small: `proposta`
