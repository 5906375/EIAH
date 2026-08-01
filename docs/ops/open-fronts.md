# Frentes abertas do PR-01

- **Versão:** 1.0
- **Data:** 2026-08-01
- **Status normativo:** Proposta
- **Descrição:** registro operacional versionado de pendências
- **Fonte canônica:** `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

Este documento é derivado da fonte canônica indicada acima e faz o rastreio formal de pendências identificadas no fechamento do PR-01; não estabelece status normativo próprio, não é plano de execução e não autoriza o início de nenhuma frente.

## 1. Restrição das permissões do token de CI

- **Frente:** `RESTRICT-CI-TOKEN-PERMISSIONS`
- **Severidade:** alta — permissões de escrita herdadas ampliam a superfície de ataque durante a execução dos jobs de CI.
- **O que se sabe:** `.github/workflows/ci.yml` não declara `permissions:` no nível do workflow nem dos 26 jobs. O conjunto efetivo congelado em `ops/evidence/ci/pr-01/ci-p3-settlement-job.30710850816.log`, run `30710850816`, inclui `write` para Actions, Contents, Checks, SecurityEvents, Deployments, Issues, PullRequests, Packages, Pages e Statuses. O uso de `--ignore-scripts` reduz o vetor de instalação, mas não restringe o acesso disponível durante a execução. O registro foi consolidado em `de228d3`.
- **O que não foi verificado:** não existe inventário versionado dos jobs que dependem legitimamente de escrita, nem validação de uma política mínima de permissões em todos os 26 jobs.
- **Origem:** `de228d3`
- **Bloqueio:** inventário dos jobs e das operações que dependem de escrita
- **Status:** `pendente`

## 2. Versionamento do plano de unificação v1.3

- **Frente:** `VERSION-UNIFICATION-PLAN-V13`
- **Severidade:** alta — uma fonte de governança fora do controle de versão não pode ser validada contra documentação, gates ou runtime.
- **O que se sabe:** o plano de unificação v1.3 não está presente em `git ls-files`. O HTML versionado `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html` é outro documento e não contém a seção formal de frentes abertas. Por isso, `scripts/checkDocsLinkIntegrity.ts` não alcança o plano v1.3 e `docs/EVIDENCE_INDEX.md` não pode referenciá-lo como arquivo existente. A situação pertence à mesma classe de fonte canônica ausente tratada no PR `#420`, sem afirmar equivalência de impacto.
- **O que não foi verificado:** não foram definidos o caminho, o formato nem o processo de validação que o plano v1.3 deverá adotar quando for versionado.
- **Origem:** este commit documental, primeiro registro versionado da frente após `de228d3`
- **Bloqueio:** decisão de localização e formato
- **Status:** `pendente`

## 3. Enforcement do catálogo de reason codes

- **Frente:** `RATIFY-REASON-CODE-CANON-ENFORCEMENT`
- **Descrição:** enforcement do `check:reason-code-canon`
- **Severidade:** alta — o checker declara enforcement informativo enquanto executa como step bloqueante de um job requerido; esse drift transversal entre documentação e runtime é tratado como P0 pelo roadmap.
- **O que se sabe:** `ops/evidence/local/pr-01/reason-code-canon.sandbox.log` registra `enforcement: informational-until-ruleset-ratification`. `.github/workflows/ci.yml` executa `check:reason-code-canon` como step comum de `EvidenceIndex`, sem `continue-on-error` no job ou no step, e `docs/ops/evidence/main-hard-gates-applied-2026-07-27.md` registra `EvidenceIndex` como required. A divergência foi registrada em `d5efce8` e mantida aberta em `de228d3`.
- **O que não foi verificado:** o ruleset live não foi consultado nesta frente; o registro versionado não substitui verificação do estado atualmente aplicado no GitHub.
- **Origem:** `d5efce8`
- **Bloqueio:** verificação do ruleset live
- **Status:** `pendente`

## 4. Desacoplamento do check de vencimento do waiver

- **Frente:** `DECOUPLE-WAIVER-CHECK-FROM-TEST-CHAIN`
- **Severidade:** média — uma falha anterior pode impedir silenciosamente um controle temporal, embora esse defeito não tenha sido observado nas runs verificadas.
- **O que se sabe:** `package.json` encadeia `check:gate-waiver-expiry` por `&&` depois de três testes em `check:orphan-tests:unit`. O check executou nas runs `30710850816` e `30713272468`, com `GATE_WAIVER_ACTIVE`, `clockDate: 2026-08-01` e 90 dias restantes. A data absoluta derivada é `2026-10-30`, confirmada pelo campo `expiresAt` da saída real. A run `30710850816` está congelada em `ops/evidence/ci/pr-01/ci-orphan-tests-job.30710850816.log`; a frente foi registrada em `de228d3`.
- **O que não foi verificado:** não foi exercitado em CI um teste vermelho anterior ao `&&`; portanto, o desligamento silencioso é risco estrutural latente, não defeito observado.
- **Origem:** `de228d3`
- **Bloqueio:** —
- **Status:** `pendente`

## 5. Unificação da invocação TSX no sandbox

- **Frente:** `UNIFY-TSX-SANDBOX-INVOCATION`
- **Severidade:** baixa — o problema restringe a coleta local no sandbox, mas há invocação alternativa funcional e não foi demonstrada regressão no runner de CI.
- **O que se sabe:** conforme registrado em `d5efce8`, `pnpm exec tsx` falha no sandbox com `EPERM` ao abrir IPC em `/tmp/tsx-<uid>/<n>.pipe`, dentro de `cli.mjs`, antes da leitura do script alvo. `node --import tsx` executa no mesmo ambiente. Os três logs sandbox com falha e seus comandos distintos estão descritos em `ops/evidence/local/pr-01/manifest.json`.
- **O que não foi verificado:** não foi feita migração sistemática nem inventário completo de todas as invocações `pnpm exec tsx`; também não foi provada uma forma única compatível com todos os ambientes suportados.
- **Origem:** `d5efce8`
- **Bloqueio:** —
- **Status:** `pendente`

## 6. Credencial GH no sandbox

- **Frente:** `PROVISION-SANDBOX-GH-CREDENTIAL`
- **Descrição:** credencial `gh` inutilizável no sandbox
- **Severidade:** baixa — a limitação afeta autonomia de verificação, mas não altera o resultado dos jobs executados pelo GitHub Actions.
- **O que se sabe:** `de228d3` registra que a credencial usada pelo GitHub CLI é reportada inválida dentro do sandbox e que o ambiente não alcança `api.github.com`. A coleta da run `30710850816` foi realizada pelo operador via `gh`, conforme `ops/evidence/ci/pr-01/manifest-ci.json`, e não diretamente pelo agente no runner.
- **O que não foi verificado:** não foi validada credencial dedicada com escopo mínimo, nem acesso de rede seguro do sandbox à API do GitHub.
- **Origem:** `de228d3`
- **Bloqueio:** acesso de rede ou credencial dedicada
- **Status:** `pendente`

## 7. Convenção de commit e hooks

- **Frente:** `DECLARE-COMMIT-CONVENTION-AND-HOOKS`
- **Descrição:** convenção de commit e hooks ausentes
- **Severidade:** baixa — a ausência não muda o runtime, mas deixa sem verificação automática um registro histórico usado para comunicar escopo e status.
- **O que se sabe:** `de228d3` registra que o repositório não declara convenção formal de mensagem de commit e não possui hooks ativos: há somente arquivos `.sample`, sem `core.hooksPath`, commitlint ou Husky.
- **O que não foi verificado:** não foi avaliada eventual política externa adotada pelos operadores, e não foi definido qual formato, conteúdo ou mecanismo de enforcement deverá ser adotado no repositório.
- **Origem:** `de228d3`
- **Bloqueio:** —
- **Status:** `pendente`

## 8. Discriminação do modo de evidência P3

- **Frente:** `DISCRIMINATE-P3-EVIDENCE-MODE`
- **Severidade:** alta — um gate que não distingue o modo da evidência não atua como gate sobre essa propriedade.
- **O que se sabe:** `P3EconomyHardening` concluiu verde na run `30710850816` porque `scripts/checkP3EconomyHardening.ts:107` aceita os modos `full` e `simulated`. O commit `85d9d31` registra primeiro a equivalência de modos no check como questão ainda aberta; `de228d3` registra a observação em CI de que o job permaneceu verde enquanto o check discriminante de settlement falhou na mesma run.
- **O que não foi verificado:** o critério de recusa de evidência `simulated` em job requerido não foi definido, e os consumidores dessa evidência não foram inventariados.
- **Origem da observação:** `85d9d31` registra primeiro a equivalência de modos como questão aberta; `de228d3` registra o contraste observado na run `30710850816`.
- **Origem do registro da frente:** commit documental `docs(ops): register eight open fronts from PR-01 closeout`
- **Bloqueio:** definição de critério discriminante para o modo de evidência P3
- **Status:** `pendente`

## Contexto do PR-01

O PR-01 permanece `Parcial` na cadeia `61c0c393` → `85d9d31` → `d5efce8` → `de228d3`. A NC-2 foi verificada em CI e reproduzida nas runs `30710850816` e `30713272468`: `GATE_WAIVER_ACTIVE`, 90 dias restantes e `clockDate` obtido do relógio real, em job requerido.

Na run `30710850816`, `P3SettlementSupportByEnv` permanece `failure` e informativo por decisão registrada em `d5efce8`. O `continue-on-error` está no job, não no step; por isso a run conclui `success` enquanto a falha continua visível. No mesmo job, `Generate P3 economy evidence` conclui `success` e `Check P3 settlement support matrix by env` conclui `failure`, três steps adiante, tornando observável a circularidade da evidência P3 em `ops/evidence/ci/pr-01/ci-p3-settlement-steps.30710850816.log` e `ops/evidence/ci/pr-01/ci-p3-settlement-job.30710850816.log`.

Na mesma run, `P3EconomyHardening` permanece verde porque `scripts/checkP3EconomyHardening.ts:107` aceita `full` e `simulated` indistintamente. Esse contraste registra dois checks sobre a mesma propriedade, um com medição discriminante e outro sem ela; ver a frente 8, `DISCRIMINATE-P3-EVIDENCE-MODE`. O contraste não promove o status do PR-01, não torna a evidência P3 verdadeira e não resolve nenhuma das oito frentes.
