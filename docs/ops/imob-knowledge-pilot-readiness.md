# IMOB Knowledge Pilot Readiness

## 1. Resumo executivo

Este documento consolida a prontidao operacional para um `pilot` controlado da IMOB Knowledge Base, partindo de um shadow run verde e de uma integracao engine-side ja evidenciada.

Escopo desta readiness:

- definir quando um `tenant/workspace` pode entrar em `pilot`;
- fixar gates de entrada, permanencia e rollback;
- manter a politica de revisao humana para temas sensiveis;
- preparar o pacote documental para um PR posterior de ativacao.

Este documento nao ativa `pilot`, nao ativa `small` e nao altera `ChatAgentLauncher`, `apps/web` ou UX.

## 2. Evidência herdada do shadow

Base herdada do shadow run controlado:

- `kbMatchRate = 0.8`
- `kbNoMatchRate = 0.1`
- `sensitiveBlockRate = 1`
- `humanReviewRequiredRate = 1`
- `provenanceCoverage = 1`
- `entitlementDeniedRate = 0.1`
- `knowledgeContextErrorRate = 0`
- `userFacingRegressionCount = 0`
- `auditGap = 0`
- `duplicateSideEffects = 0`

Leitura operacional:

- a integracao atual do engine esta estavel no recorte controlado;
- todo match do shadow saiu com provenance completa;
- temas sensiveis permaneceram degradados para revisao humana;
- o fail-closed de entitlement continuou ativo.

## 3. Objetivo do pilot

Objetivo do `pilot`:

- validar a KB IMOB em tenants/workspaces explicitamente aprovados;
- observar a capacidade em uso operacional controlado;
- confirmar que o comportamento verde do shadow se sustenta em ambiente mais real;
- preservar o recurso como capacidade governada, sem promocao irrestrita.

## 4. Critérios de elegibilidade tenant/workspace

Um `tenant/workspace` so pode ser candidato a `pilot` se todos os itens abaixo forem verdadeiros:

- `tenantId` explicitamente listado no pacote de ativacao do `pilot`;
- `workspaceId` explicitamente listado no pacote de ativacao do `pilot`;
- vertical IMOB instalada e entitlement valido;
- owner operacional nomeado para o tenant/workspace;
- owner tecnico nomeado para o ciclo;
- canal de revisao humana definido para casos sensiveis;
- estrategia de coleta de evidencia por tenant/workspace definida antes da ativacao;
- ausencia de bloqueio documental ou de governanca no tenant/workspace.

## 5. Escopo permitido do pilot

- somente o fluxo `search_knowledge` do IMOB;
- somente tenants/workspaces aprovados e listados;
- `knowledgeContext` governado com provenance obrigatoria;
- revisao humana obrigatoria para temas sensiveis;
- operacao observada por ciclo curto e controlado;
- evidencia por tenant/workspace em artefato proprio.

## 6. Escopo proibido

- ativacao global;
- promocao automatica para `small`;
- relaxamento de `requiresHumanReview`;
- bypass de entitlement ou `scope`;
- alteracao de `ChatAgentLauncher`;
- alteracao de `apps/web`;
- UX nova;
- busca vetorial;
- ingestao automatica;
- billing, Redis, Agent Protocol ou white-label runtime.

## 7. Métricas obrigatórias por ciclo

- `kbMatchRate`
- `kbNoMatchRate`
- `sensitiveBlockRate`
- `humanReviewRequiredRate`
- `provenanceCoverage`
- `entitlementDeniedRate`
- `knowledgeContextErrorRate`
- `userFacingRegressionCount`
- `auditGap`
- `duplicateSideEffects`

Interpretacao minima:

- `kbNoMatchRate` alto sozinho nao autoriza rollback automatico; primeiro precisa ser classificado como lacuna de acervo ou roteamento;
- `knowledgeContextErrorRate > 0` e `provenanceCoverage < 1` sao sinais duros de bloqueio;
- `userFacingRegressionCount > 0` exige congelamento imediato do `pilot`.

## 8. Gates de entrada no pilot

O `pilot` so pode ser autorizado em PR posterior se todos os itens abaixo forem verdadeiros:

- shadow run verde;
- `provenanceCoverage = 100%`;
- `knowledgeContextErrorRate = 0`;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- `userFacingRegressionCount = 0`;
- `tenantId/workspaceId` explicitamente listados;
- entitlement e `scope` validados;
- rollback documentado;
- owners definidos;
- politica de revisao humana definida para temas sensiveis.

## 9. Gates de permanência

Durante o `pilot`, os itens abaixo precisam permanecer verdadeiros:

- `provenanceCoverage = 100%` nos matches;
- `knowledgeContextErrorRate = 0`;
- `userFacingRegressionCount = 0`;
- nenhum tema sensivel escapando sem revisao humana;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- evidencia por tenant/workspace gerada a cada ciclo combinado;
- nenhuma alteracao indevida em `ChatAgentLauncher` ou `apps/web`.

## 10. Gates de rollback

O `pilot` deve ser revertido imediatamente se ocorrer qualquer um dos itens abaixo:

- queda de provenance;
- erro de `knowledgeContext`;
- regressao user-facing;
- uso indevido em preco, valuation, contrato, aprovacao ou decisao financeira;
- falha de entitlement ou `scope`;
- ausencia de evidencia por tenant/workspace;
- alteracao indevida no `ChatAgentLauncher` ou `apps/web`.

Rollback aceito:

- voltar para `shadow-only`;
- desabilitar a KB;
- preservar `search_knowledge` sem `knowledgeContext`;
- aplicar fail-closed para o recurso no escopo do tenant/workspace afetado.

## 11. Política de revisão humana

Todo caso com qualquer um dos sinais abaixo exige revisao humana:

- `requiresHumanReview = true`;
- `blockedAutomaticUses` nao vazio;
- tema relacionado a preco;
- tema relacionado a valuation;
- tema relacionado a contrato final;
- tema relacionado a aprovacao;
- tema relacionado a decisao financeira.

Regras:

- o `pilot` nao pode redefinir ou reduzir essa obrigatoriedade;
- a revisao humana precisa ser atribuida a owner operacional identificavel;
- a ausencia de revisao humana invalida o ciclo para promocao futura.

## 12. Template de evidência por tenant/workspace

Template minimo recomendado para cada ciclo:

```md
# IMOB Knowledge Pilot Cycle - <tenantId> / <workspaceId>

- tenantId:
- workspaceId:
- janela:
- owner operacional:
- owner tecnico:
- cenarios observados:
- kbMatchRate:
- kbNoMatchRate:
- sensitiveBlockRate:
- humanReviewRequiredRate:
- provenanceCoverage:
- entitlementDeniedRate:
- knowledgeContextErrorRate:
- userFacingRegressionCount:
- auditGap:
- duplicateSideEffects:
- temas sensiveis revisados:
- decisoes de continuidade:
- rollback acionado?: sim|nao
- riscos abertos:
```

## 13. Operação e owners

Owners minimos obrigatorios:

- owner tecnico:
  responsavel por runner, checks, logs e leitura de regressao do engine.

- owner operacional:
  responsavel por aprovar tenants/workspaces, revisar casos sensiveis e decidir continuidade do ciclo.

- owner de evidencia:
  responsavel por garantir artefato por tenant/workspace e indexacao somente quando houver evidencia real.

Sem esses owners definidos, o `pilot` nao deve ser ativado.

## 14. Riscos residuais

- shadow verde nao prova sozinho comportamento em uso operacional real;
- `kbNoMatchRate` pode subir por lacuna de acervo sem indicar quebra do engine;
- observabilidade por tenant/workspace ainda depende do pacote de ativacao futuro;
- o `pilot` continua sensivel a drift se o manifesto, loader e engine evoluirem sem novo ciclo de evidencia.

## 15. Status conservador

- pacote documental de `pilot readiness`: `evidenciado`
- `pilot` operacional: `parcial`
- `small`: `proposta`
