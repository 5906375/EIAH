# F1.7f — Mobile Smoke Informative Recurrence and Promotion Policy — 2026-07-15

## Resumo executivo

Esta etapa formaliza a politica governada de recorrencia do gate informativo de mobile smoke do front door IMOB apos a F1.7d ter provado o primeiro run real com `PASS`, artifact presente e `smoke-report.json` consumivel. A politica separa explicitamente:
- o que ja esta evidenciado;
- o que ainda e apenas proposta de maturidade futura;
- quando a futura F1.7e deve existir;
- e quais pre-condicoes minimas seriam exigidas antes de qualquer promocao de informativo para bloqueante.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f1-07b-ci-informative-mobile-smoke-gate-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-07c-first-ci-informative-mobile-smoke-run-2026-07-14.md`
- `ops/evidence/latest/f1-07d-first-real-ci-informative-mobile-smoke-run-2026-07-15.md`

## Contexto F1.7b–F1.7d

- F1.7b implementou o job `ImobFrontdoorMobileSmokeInformative` no `CI Monorepo` como gate informativo, sem torná-lo bloqueante.
- F1.7c registrou a primeira tentativa de disparo em branch `test/*` e provou que o trigger atual nao cobria esse caminho.
- F1.7d provou o primeiro run real apos o merge do PR `#274`, via `push` em `main`, com:
  - run real no GitHub Actions;
  - artifact `imob-frontdoor-mobile-smoke-informative`;
  - `smoke-report.json` com `classification=PASS`;
  - `smokeExitCode=0`;
  - `routeStatus=200`;
  - `fallbackUsed=false`;
  - quatro viewports verdes;
  - logs e artifact consumiveis.

Leitura normativa correta:
- existe evidencia de **um primeiro run real PASS**;
- ainda nao existe recorrencia provada;
- ainda nao existe baseline suficiente para promocao a bloqueante;
- o gate permanece **informativo**.

## Decisão sobre F1.7e

F1.7e **nao deve ser criada agora**.

Reserva normativa:
- `F1.7e = Smoke Failure Analysis/Fix`
- so deve existir se surgir **falha real futura** em run de CI do mobile smoke;
- nao deve ser usada para antecipar hardening sem falha objetiva.

Portanto:
- F1.7f nao corrige smoke;
- F1.7f nao reclassifica sucesso como maturidade recorrente;
- F1.7f apenas define politica de observacao, recorrencia e promocao futura.

## Política de recorrência

A politica de recorrencia do gate informativo passa a ser:

1. Manter o gate em modo informativo enquanto houver evidencia de apenas um ou dois runs reais, ou enquanto houver qualquer lacuna de estabilidade operacional.
2. Exigir observacao de multiplos runs reais antes de discutir promocao.
3. Separar claramente:
   - falha real de smoke;
   - falha de trigger/disparo;
   - artifact incompleto;
   - flake nao classificado;
   - drift documental.
4. Tratar qualquer regressao futura como evidência operacional nova, nunca como inferencia retrospectiva.
5. Nao promover automaticamente para bloqueante por um unico run verde.

## Critérios para manter informativo

O gate deve permanecer informativo se qualquer uma das condicoes abaixo for verdadeira:

- menos de `3` runs reais consecutivos observados em `main` ou `pull_request`;
- artifact incompleto em qualquer run observado;
- qualquer flake nao classificado;
- ausencia de baseline confiavel de duracao/custo;
- `classification` diferente de `PASS` em qualquer run recente;
- `smokeExitCode != 0` em qualquer run recente;
- `routeStatus != 200` em qualquer run recente;
- `fallbackUsed != false` em qualquer run recente;
- qualquer viewport obrigatorio nao verde;
- logs ausentes ou artifact indisponivel;
- drift entre workflow, documentacao e evidencia;
- checks documentais falhando.

## Critérios mínimos para promoção futura a bloqueante

Uma futura promocao para bloqueante so pode ser discutida em etapa separada e nunca automaticamente. Os criterios minimos sao:

- pelo menos `3` runs reais consecutivos em `main` ou `pull_request`;
- `classification=PASS` em todos;
- `smokeExitCode=0` em todos;
- `routeStatus=200` em todos;
- `fallbackUsed=false` em todos;
- `runnerImport=formal_dependency:playwright` em todos;
- artifact completo em todos;
- logs disponiveis em todos;
- `mobile-360`, `mobile-390`, `tablet-768` e `tablet-1024` verdes em todos;
- duracao dentro de baseline aceitavel e sem degradacao relevante;
- ausencia de flake nao classificado;
- ausencia de reruns anormais para mascarar falha;
- sem regressao documental;
- `pnpm check:evidence-index` passando;
- `pnpm check:docs-link-integrity` passando;
- decisao humana explicita em etapa futura dedicada.

## Métricas obrigatórias

Cada run futuro observado deve registrar, no minimo:

- `classification`
- `smokeExitCode`
- `routeStatus`
- `durationSeconds`
- `fallbackUsed`
- `runnerImport`
- `playwrightVersion`
- `imageTag`
- `viewports`
- `artifact completeness`
- `flake count`
- `rerun count`
- `CI duration/cost signal`
- `reasons`

Interpretacao minima:
- `classification`, `smokeExitCode` e `routeStatus` medem sucesso funcional basico;
- `fallbackUsed` e `runnerImport` garantem que o runner permaneceu no caminho formal aprovado;
- `playwrightVersion` e `imageTag` controlam drift do ambiente de execucao;
- `viewports` preserva cobertura minima do mobile smoke;
- `artifact completeness`, `flake count` e `rerun count` medem confiabilidade operacional;
- `CI duration/cost signal` e necessario antes de qualquer promocao para bloqueante;
- `reasons` deve permitir classificacao objetiva da falha quando houver.

## Evidências necessárias por run

Cada run real relevante deve gerar ou permitir rastrear:

- run URL;
- run ID;
- workflow;
- job;
- branch;
- commit SHA;
- trigger usado;
- artifact `imob-frontdoor-mobile-smoke-informative`, quando aplicavel;
- `smoke-report.json`;
- logs do job;
- conclusao objetiva do run;
- classificacao do resultado;
- status conservador.

Sem esse pacote minimo:
- o run nao deve contar como evidencia forte para promocao futura;
- e a politica deve permanecer em modo informativo.

## Critérios de rollback

O gate deve permanecer ou voltar a um estado conservador se ocorrer qualquer um dos eventos abaixo:

- qualquer falha recorrente nao explicada;
- artifact ausente;
- artifact incompleto;
- aumento significativo e sustentado de duracao;
- flake por viewport;
- falso negativo que bloqueie PR sem causa clara;
- drift entre workflow, evidencia e documentacao;
- mudanca de runner/import/tag sem revalidacao documental;
- reruns repetidos usados como substituto de correcao.

Observacao:
- nesta fase, rollback significa **nao promover** ou **rebaixar expectativa operacional**;
- nao significa alterar CI nesta mesma etapa;
- e nao significa abrir F1.7e sem falha real objetiva.

## Riscos residuais

- existe apenas um run real PASS evidenciado ate o momento;
- ainda nao ha baseline suficiente de estabilidade, duracao e custo;
- o gate continua sujeito a flake futura ainda nao observada;
- warnings externos de actions ainda podem poluir leitura operacional mesmo sem falha do job;
- promocao precoce para bloqueante aumentaria risco de falso negativo e churn de PR sem base suficiente.

## Checks executados

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Prova de isolamento

- nenhuma alteracao em `.github/workflows/ci.yml`
- nenhuma alteracao em `release.yml`
- nenhuma alteracao em `apps/**`
- nenhuma alteracao em `packages/**`
- nenhuma alteracao em `scripts/**`
- nenhuma alteracao em runtime/engine
- nenhuma alteracao em `ChatAgentLauncher`
- nenhuma alteracao em contratos de agente
- nenhuma promocao do gate para bloqueante

## Próximos passos

- manter o gate como informativo ate que existam pelo menos `3` runs reais consecutivos suficientemente completos;
- abrir `F1.7e — Smoke Failure Analysis/Fix` apenas se surgir falha real futura;
- abrir etapa futura separada para avaliar promocao a bloqueante somente quando a recorrencia estiver realmente evidenciada.

## Status final

Status: proposta/evidenciado parcialmente

Leitura final:
- `evidenciado` para o fato de que F1.7d ja provou um primeiro run real PASS;
- `proposta` para a politica de recorrencia/promocao definida nesta etapa;
- ainda sem evidencia suficiente para maturidade recorrente ou promocao do gate.
