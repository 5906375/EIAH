# IMOB Knowledge Pilot Activation Gate

## 1. Resumo executivo

Este documento fecha o pacote operacional necessario para um PR posterior de ativacao controlada do `pilot` da IMOB Knowledge Base.

Escopo deste activation gate:

- herdar o shadow run verde e o pacote de readiness ja evidenciados;
- exigir `tenant/workspace` explicitamente aprovados antes de qualquer ativacao;
- exigir owners tecnico e operacional reais antes de qualquer ativacao;
- fixar janela operacional, metricas por ciclo, gates de ativacao e rollback exercivel;
- manter a politica de revisao humana para temas sensiveis.

Este documento nao ativa `pilot`, nao ativa `small` e nao altera `ChatAgentLauncher`, `apps/web` ou UX.

## 2. Evidencia herdada do readiness

Base herdada:

- `docs/ops/imob-knowledge-pilot-readiness.md`
- `ops/evidence/latest/imob-knowledge-pilot-readiness-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.md`
- `ops/evidence/latest/imob-knowledge-shadow-run-2026-07-02.json`

Metricas herdadas do shadow verde:

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

Leitura conservadora:

- a capacidade engine-side esta verde no ciclo shadow controlado;
- a readiness documental existe;
- a ativacao real continua bloqueada ate existir allowlist real de `tenant/workspace`, owners reais e janela operacional real.

## 3. Tenant/workspace allowlist

### PENDING_REAL_TENANT_SELECTION

Nao ha neste PR selecao real de `tenant/workspace` para ativacao do `pilot`.

Consequencia obrigatoria:

- nenhum `tenantId` deve ser considerado aprovado por inferencia;
- nenhum `workspaceId` deve ser considerado aprovado por inferencia;
- a ativacao real permanece bloqueada ate existir allowlist explicita com valores reais.

Formato minimo esperado no PR futuro de ativacao:

```text
tenantId=<real-tenant-id>
workspaceId=<real-workspace-id>
vertical=IMOB
entitlement=validated
```

## 4. Owners tecnico e operacional

### PENDING_REAL_OWNER_ASSIGNMENT

Nao ha neste PR definicao nominal de owner tecnico nem owner operacional reais.

Consequencia obrigatoria:

- a ativacao do `pilot` permanece bloqueada;
- a aprovacao futura precisa nomear owners identificaveis;
- a ausencia de owner invalida qualquer tentativa de promovacao operacional.

Owners minimos exigidos no PR futuro de ativacao:

- owner tecnico responsavel por runner, logs, metricas e rollback tecnico;
- owner operacional responsavel por aprovar o escopo do `tenant/workspace`, revisar sensiveis e decidir continuidade;
- owner de evidencia responsavel por consolidar a prova por ciclo e por `tenant/workspace`.

## 5. Janela operacional

### PENDING_REAL_OPERATIONAL_WINDOW

Nao ha neste PR janela operacional real definida.

A janela futura precisa declarar, no minimo:

- data/hora de inicio;
- data/hora de termino;
- timezone;
- owners de plantao;
- criterio de congelamento e reversao.

Sem janela real declarada, o `pilot` nao deve ser ativado.

## 6. Metricas por ciclo

Cada ciclo futuro de `pilot` deve registrar:

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

Leitura operacional minima:

- `provenanceCoverage < 1` bloqueia o ciclo;
- `knowledgeContextErrorRate > 0` bloqueia o ciclo;
- `auditGap > 0` bloqueia o ciclo;
- `duplicateSideEffects > 0` bloqueia o ciclo;
- `userFacingRegressionCount > 0` bloqueia o ciclo.

## 7. Gates de ativacao

O `pilot` so pode ser ativado em PR posterior se todos os itens abaixo forem verdadeiros:

- `tenant/workspace` explicitamente listados;
- entitlement e `scope` validados;
- owner tecnico definido;
- owner operacional definido;
- shadow run verde;
- readiness evidenciado;
- rollback documentado;
- revisao humana definida para temas sensiveis;
- `provenanceCoverage = 100%`;
- `knowledgeContextErrorRate = 0`;
- `auditGap = 0`;
- `duplicateSideEffects = 0`;
- `userFacingRegressionCount = 0`;
- `ChatAgentLauncher` e `apps/web` inalterados.

## 8. Gates de rollback

O `pilot` futuro deve ser revertido imediatamente se ocorrer qualquer um dos itens abaixo:

- queda de provenance;
- erro de `knowledgeContext`;
- regressao user-facing;
- uso indevido em preco, valuation, contrato, aprovacao ou decisao financeira;
- falha de entitlement ou `scope`;
- ausencia de evidencia por `tenant/workspace`;
- alteracao indevida em `ChatAgentLauncher` ou `apps/web`.

## 9. Politica de revisao humana

Todo uso em tema sensivel exige revisao humana quando houver qualquer um dos sinais abaixo:

- `requiresHumanReview = true`;
- `disallowedUses` ou bloqueios equivalentes presentes;
- tema de preco;
- tema de valuation;
- tema de contrato final;
- tema de aprovacao;
- tema de decisao financeira.

Regras:

- o `pilot` nao pode relaxar essa obrigatoriedade;
- a revisao humana precisa estar atribuida ao owner operacional;
- ausencia de revisao humana invalida o ciclo para promocao futura.

## 10. Template de evidencia por tenant/workspace

Template minimo por ciclo:

```md
# IMOB Knowledge Pilot Activation Cycle - <tenantId> / <workspaceId>

- tenantId:
- workspaceId:
- janela operacional:
- owner tecnico:
- owner operacional:
- owner de evidencia:
- entitlement validado?:
- scope validado?:
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
- rollback acionado?: sim|nao
- riscos abertos:
- decisao do ciclo:
```

## 11. Procedimento de rollback

Rollback aceito:

- voltar para `shadow-only`;
- desabilitar a KB;
- manter `search_knowledge` sem `knowledgeContext`;
- aplicar fail-closed para o `tenant/workspace` afetado.

Ordem minima:

1. congelar novas ativacoes do `pilot`;
2. remover o `tenant/workspace` da allowlist operacional;
3. reverter para `shadow-only` ou `KB disabled`;
4. registrar evidencia do rollback;
5. reavaliar gates antes de qualquer nova tentativa.

## 12. Confirmacao de que pilot nao foi ativado

Neste PR:

- `pilot` nao foi ativado;
- `small` nao foi ativado;
- nenhum `tenant/workspace` real foi promovido;
- `ChatAgentLauncher` permaneceu inalterado;
- `apps/web` permaneceu inalterado.

## 13. Riscos residuais

- o pacote documental nao substitui a selecao real de `tenant/workspace`;
- sem owners reais nao existe responsabilizacao operacional suficiente;
- sem janela real nao existe readiness para execucao controlada;
- o shadow verde nao elimina risco de lacunas operacionais em ambiente real.

## 14. Status conservador

- pacote documental de activation gate: `evidenciado`
- ativacao operacional do `pilot`: `parcial`
- `small`: `proposta`
