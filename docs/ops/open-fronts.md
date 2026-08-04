# Frentes abertas do PR-01

- **Versão:** 1.0
- **Data:** 2026-08-01
- **Status normativo:** Proposta
- **Descrição:** registro operacional versionado de pendências
- **Fonte canônica:** `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- **Decisão de hierarquia:** `docs/adr/ADR-003-work-registry-hierarchy.md`

Este documento é derivado da fonte canônica indicada acima e faz o rastreio formal de dezesseis pendências identificadas no fechamento do PR-01 e nas auditorias documentais subsequentes. A hierarquia entre este registro e o plano de PRs de 2026-07-31 é definida pelo ADR indicado acima; este documento não estabelece status normativo próprio, não é plano de execução e não autoriza o início de nenhuma frente.

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

## 9. Reconciliação da cobertura do Evidence Index

- **Frente:** `RECONCILE-EVIDENCE-INDEX-COVERAGE`
- **Severidade:** alta — a ausência de validação nos dois sentidos permite que artefatos executados fiquem fora do índice e que entradas semanticamente incompatíveis com a norma permaneçam aceitas pelo gate.
- **O que se sabe:** em `HEAD`, o inventário reverso de `ops/evidence/`, `docs/ops/evidence/` e `artifacts/` encontra 510 arquivos físicos, dos quais 187 não aparecem por caminho literal em `docs/EVIDENCE_INDEX.md`. Entre eles estão 23 logs e manifests sob `ops/evidence/ci/pr-01/` e `ops/evidence/local/pr-01/`, produzidos por comandos e runs já registrados. `scripts/checkEvidenceIndex.ts:133-150` extrai referências do índice e valida somente índice→disco; não percorre diretórios de evidência para validar disco→índice. A leitura semântica conservadora da frente 13 confirma também 72 entradas cuja própria redação as caracteriza como decisão, backlog, plano/proposta ou leitura documental sem execução real.
- **O que não foi verificado:** não foi classificado quais dos 187 caminhos físicos satisfazem todos os requisitos para evidência real/indexável, nem foi auditado o conteúdo integral dos artefatos associados às 72 entradas para excluir eventual execução omitida pela redação do índice. O estado live de providers e runs externos não foi consultado.
- **Origem da observação:** sessão de auditoria somente-leitura de 2026-08-03, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** definição ratificada de cobertura conforme a norma vigente e de um inventário bidirecional com critérios semânticos verificáveis.
- **Status:** `pendente`

## 10. Resolução de referências rolling no Evidence Index

- **Frente:** `RESOLVE-ROLLING-EVIDENCE-REFERENCES`
- **Severidade:** alta — uma referência variável pode trocar silenciosamente o artefato alcançado e não oferece identidade estável para verificação por hash.
- **O que se sabe:** `scripts/checkEvidenceIndex.ts:24-30` transforma `YYYY-MM-DD` em regex e `scripts/checkEvidenceIndex.ts:141-150` considera a referência válida quando existe pelo menos uma correspondência no diretório. O índice contém oito padrões de caminho rolling em `HEAD`; seis artefatos correspondentes — `payment-intent-schema-2026-07-27.json`, `settlement-provider-e2e-2026-07-27.json`, `billing-webhook-replay-2026-07-27.json`, `settlement-contract-check-2026-03-09.md`, `reputation-update-flow-2026-07-27.json` e `dispute-lifecycle-e2e-2026-07-27.json` — não possuem referência literal pelo caminho datado e são alcançados somente pelo padrão.
- **O que não foi verificado:** não foi definida a política de migração para referências exatas, nem calculados ou ratificados hashes canônicos para os seis artefatos.
- **Origem da observação:** sessão de auditoria somente-leitura de 2026-08-03, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** decisão sobre referência exata, identidade por hash e tratamento histórico das entradas rolling.
- **Status:** `pendente`

## 11. Resolução da divergência de status P1

- **Frente:** `RESOLVE-P1-STATUS-DIVERGENCE`
- **Severidade:** alta — uma documentação derivada que fecha fase parcial pode orientar execução e comunicação em desacordo com a fonte canônica.
- **O que se sabe:** `docs/ops/roadmap-v81-fases-referencia.md:91-93` declara P1 fechado por evidência/gates. O roadmap canônico, em `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:105-111`, mantém P1 como parcial avançado e bloqueado pela integridade da telemetria APE. A leitura em `HEAD` confirma divergência docs↔docs sobre o status da fase.
- **O que não foi verificado:** não foram inventariados todos os consumidores do documento derivado, nem definida a correção ou eventual retirada dessa declaração.
- **Origem da observação:** sessão de auditoria somente-leitura de 2026-08-03, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** decisão sobre correção do documento derivado e validação de seus consumidores.
- **Status:** `pendente`

## 12. Ratificação da contagem de amostras do baseline SLO

- **Frente:** `RATIFY-SLO-BASELINE-SAMPLE-COUNT`
- **Severidade:** média — o gate nominal pode aceitar uma amostra insuficiente, mas permanece warn-only e não ratifica targets enquanto a frente operacional está aberta.
- **O que se sabe:** `scripts/checkSloBaseline.ts:16-23` seleciona apenas o arquivo de baseline mais recente; `scripts/checkSloBaseline.ts:39-78` valida presença de `pouFinalize.p95Ms` e recência, mas não exige contagem mínima nem três ciclos distintos. O baseline mais recente, `ops/evidence/latest/economy-slo-baseline-2026-07-27.json:12`, declara `samplesCount=2` e satisfaz o check nominal. `docs/ops/f53-slo-ratification-checklist.md:5,45-46,175-187` exige três ciclos reais antes da ratificação.
- **O que não foi verificado:** não foram comprovados três ciclos reais distintos com variáveis de staging, nem exercitado teste negativo de contagem insuficiente para o checker.
- **Origem da observação:** sessão de auditoria somente-leitura de 2026-08-03, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** três ciclos reais elegíveis, critério mínimo ratificado e teste negativo bloqueante para amostra insuficiente.
- **Status:** `pendente`

## 13. Reconciliação do drift normativo do Evidence Index

- **Frente:** `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`
- **Severidade:** alta — `IA_EIAH.md:146-157,230-246,315-317` restringe o índice a evidência de execução real e classifica drift em Evidence Index como P0/P1 conforme impacto, enquanto o próprio índice contém decisões, backlog e planos/propostas sem execução real.
- **O que se sabe:** a leitura das tabelas de `docs/EVIDENCE_INDEX.md` confirma conservadoramente 72 entradas enquadradas em pelo menos uma proibição da seção 13 de `IA_EIAH.md`: evidência planejada, prometida, manual sem execução, arquivo inexistente ou resultado não verificável. A contagem considera somente linhas cuja própria redação caracteriza decisão, backlog, plano/proposta, design/template/política futura ou leitura/consolidação documental sem execução real:
  - linha 69: `docs/architecture/chat-vertical-imob-preflight-playbook.md`
  - linha 89: `docs/adr/ADR-001-domain-runtime-stack.md`
  - linha 281: `docs/governance/ai-usage-policy.md`
  - linha 282: `docs/governance/ai-code-of-conduct.md`
  - linha 291: `docs/ops/open-fronts.md`
  - linha 298: `ops/evidence/latest/eiah-multichannel-plan-investigation-2026-07-09.md`
  - linha 345: `ops/evidence/latest/f0-46-roadmap-release-gate-chain-consolidation-2026-07-13.md`
  - linha 346: `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md`
  - linha 347: `ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md`
  - linha 348: `ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md`
  - linha 349: `ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md`
  - linha 350: `ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md`
  - linha 351: `ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md`
  - linha 352: `ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md`
  - linha 353: `ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md`
  - linha 354: `ops/evidence/latest/f0-55-layer-b-promotion-preconditions-decision-matrix-2026-07-13.md`
  - linha 355: `ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md`
  - linha 356: `ops/evidence/latest/f0-57-layer-b-controlled-validation-pr-entry-criteria-2026-07-13.md`
  - linha 357: `ops/evidence/latest/f0-58-layer-b-controlled-validation-proposal-template-2026-07-13.md`
  - linha 358: `ops/evidence/latest/f0-59-f0-to-f1-transition-readiness-decision-2026-07-13.md`
  - linha 359: `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`
  - linha 360: `ops/evidence/latest/f1-01-front-door-mobile-snapshots-render-only-2026-07-14.md`
  - linha 362: `ops/evidence/latest/f1-03-front-door-mobile-recurring-visual-gate-proposal-2026-07-14.md`
  - linha 364: `ops/evidence/latest/f1-05-front-door-mobile-smoke-reproducibility-ci-readiness-2026-07-14.md`
  - linha 373: `ops/evidence/latest/f1-06i-chromium-provisioning-strategy-2026-07-14.md`
  - linha 375: `ops/evidence/latest/f1-06k-dedicated-playwright-runtime-base-image-selection-2026-07-14.md`
  - linha 377: `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`
  - linha 378: `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`
  - linha 379: `ops/evidence/latest/f1-07a-ci-informative-mobile-smoke-gate-proposal-2026-07-14.md`
  - linha 383: `ops/evidence/latest/f1-07f-mobile-smoke-informative-recurrence-promotion-policy-2026-07-15.md`
  - linha 384: `ops/evidence/latest/f2-00-whatsapp-adapter-read-only-binding-fail-closed-design-2026-07-15.md`
  - linha 385: `ops/evidence/latest/f2-01-whatsapp-adapter-technical-contract-envelope-signature-plan-2026-07-15.md`
  - linha 386: `ops/evidence/latest/f2-02-whatsapp-adapter-endpoint-webhook-specification-plan-2026-07-15.md`
  - linha 394: `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md`
  - linha 395: `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md`
  - linha 396: `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md`
  - linha 398: `ops/evidence/latest/f2-13-read-only-adapter-promotion-readiness-matrix-2026-07-15.md`
  - linha 399: `ops/evidence/latest/f2-14-read-only-adapter-promotion-decision-record-template-2026-07-15.md`
  - linha 400: `ops/evidence/latest/f2-15-read-only-adapter-evidence-closure-pre-provider-boundary-2026-07-15.md`
  - linha 401: `ops/evidence/latest/f2-16-pre-provider-gap-register-provider-integration-entry-criteria-2026-07-15.md`
  - linha 402: `ops/evidence/latest/f2-17-provider-integration-design-brief-non-execution-plan-2026-07-15.md`
  - linha 403: `ops/evidence/latest/f2-18-provider-integration-threat-model-abuse-case-register-2026-07-15.md`
  - linha 404: `ops/evidence/latest/f2-19-provider-integration-security-review-checklist-approval-gate-2026-07-15.md`
  - linha 405: `ops/evidence/latest/f2-20-provider-integration-evidence-pack-executive-review-dossier-2026-07-15.md`
  - linha 406: `ops/evidence/latest/f2-21-provider-integration-board-review-packet-meeting-agenda-2026-07-15.md`
  - linha 407: `ops/evidence/latest/f2-22-provider-integration-final-pre-execution-hold-no-go-ledger-2026-07-15.md`
  - linha 408: `ops/evidence/latest/f2-23-provider-integration-stop-line-final-readiness-freeze-2026-07-15.md`
  - linha 409: `ops/evidence/latest/f2-24-provider-integration-phase-transition-proposal-board-decision-stub-2026-07-15.md`
  - linha 410: `ops/evidence/latest/f2-25-provider-integration-next-phase-charter-non-implementation-boundary-2026-07-15.md`
  - linha 411: `ops/evidence/latest/f2-26-provider-integration-governance-closure-end-of-track-summary-2026-07-15.md`
  - linha 412: `ops/evidence/latest/f3-00-provider-integration-formal-phase-opening-design-only-charter-2026-07-15.md`
  - linha 413: `ops/evidence/latest/f3-01-provider-integration-design-questions-register-decision-log-2026-07-15.md`
  - linha 414: `ops/evidence/latest/f3-02-provider-integration-decision-matrix-options-evaluation-criteria-2026-07-15.md`
  - linha 415: `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`
  - linha 416: `ops/evidence/latest/f3-04-provider-integration-design-review-packet-evidence-checklist-2026-07-15.md`
  - linha 417: `ops/evidence/latest/f3-05-provider-integration-review-outcome-template-no-go-decision-record-2026-07-15.md`
  - linha 418: `ops/evidence/latest/f3-06-provider-integration-design-only-closure-pre-selection-boundary-2026-07-15.md`
  - linha 419: `ops/evidence/latest/f4-00-provider-selection-formal-phase-opening-selection-only-charter-2026-07-15.md`
  - linha 420: `ops/evidence/latest/f4-01-provider-candidate-intake-template-preliminary-eligibility-checklist-2026-07-15.md`
  - linha 421: `ops/evidence/latest/f4-02-provider-candidate-evidence-mapping-intake-validation-matrix-2026-07-15.md`
  - linha 422: `ops/evidence/latest/f4-03-provider-candidate-preliminary-review-packet-reviewer-assignment-2026-07-15.md`
  - linha 423: `ops/evidence/latest/f4-04-provider-candidate-preliminary-review-outcome-selection-no-go-record-2026-07-15.md`
  - linha 424: `ops/evidence/latest/f4-05-provider-selection-evidence-closure-candidate-review-boundary-2026-07-15.md`
  - linha 425: `ops/evidence/latest/f5-00-provider-final-selection-formal-phase-opening-final-selection-only-charter-2026-07-15.md`
  - linha 429: `ops/evidence/latest/eiah-outputs-matrix-v1-validation-2026-07-08.md`
  - linha 805: `docs/ops/evidence/latest/imob-worker-observability/frente-kickoff.md`
  - linha 916: `ops/evidence/latest/white-label-runtime-gap-2026-07-02.md`
  - linha 922: `ops/evidence/latest/brand-kit-extraction-2026-07-02.md`
  - linha 928: `ops/evidence/latest/fase-3-dividas-documentadas-closure-2026-07-02.md`
  - linha 937: `ops/evidence/latest/imob-knowledge-rollout-plan-2026-07-02.md`
  - linha 939: `ops/evidence/latest/imob-knowledge-pilot-readiness-2026-07-02.md`
  - linha 940: `ops/evidence/latest/imob-knowledge-pilot-activation-gate-2026-07-02.md`
  Uma segunda classe, distinta do caráter documental acima, foi confirmada por nova leitura estática: 41 entradas de tabela, referentes a 39 caminhos únicos, afirmam execução, resultado operacional ou prova de fluxo para artefatos diretamente produzidos por geradores declarativos ou híbridos. As duas entradas excedentes são duplicações dos caminhos de APE #9 e #47. Os caminhos únicos apurados são:
  - `ops/evidence/latest/p2-high-global-coverage.json`
  - `ops/evidence/latest/interop-routes-smoke-2026-03-09.json`
  - `ops/evidence/latest/interop-e2e-agent-call-2026-03-09.json`
  - `ops/evidence/latest/realestate-high-actions-e2e-2026-03-09.json`
  - `ops/evidence/latest/payment-intent-schema-YYYY-MM-DD.json`
  - `ops/evidence/latest/pou-gated-payment-e2e-YYYY-MM-DD.json`
  - `ops/evidence/latest/pou-gated-payment-e2e-2026-07-27.json`
  - `ops/evidence/latest/settlement-provider-e2e-YYYY-MM-DD.json`
  - `ops/evidence/latest/billing-webhook-replay-YYYY-MM-DD.json`
  - `ops/evidence/latest/reputation-update-flow-YYYY-MM-DD.json`
  - `ops/evidence/latest/dispute-lifecycle-e2e-YYYY-MM-DD.json`
  - `ops/evidence/latest/realestate-commission-settlement-e2e-YYYY-MM-DD.json`
  - `ops/evidence/latest/realestate-commission-settlement-e2e-2026-07-27.json`
  - `ops/evidence/latest/ape-weekly-cycle-run7-2026-03-04.md`
  - `ops/evidence/latest/ape-weekly-cycle-run8-2026-03-04.md`
  - `ops/evidence/latest/ape-weekly-cycle-run9-2026-03-09.md`
  - `ops/evidence/latest/ape-weekly-cycle-run10-2026-03-18.md`
  - `ops/evidence/latest/ape-weekly-cycle-run11-2026-03-18.md`
  - `ops/evidence/latest/ape-weekly-cycle-run19-2026-04-10.md`
  - `ops/evidence/latest/ape-weekly-cycle-run20-2026-04-10.md`
  - `ops/evidence/latest/ape-weekly-cycle-run21-2026-04-10.md`
  - `ops/evidence/latest/ape-weekly-cycle-run22-2026-04-27.md`
  - `ops/evidence/latest/ape-weekly-cycle-run23-2026-04-27.md`
  - `ops/evidence/latest/ape-weekly-cycle-run24-2026-04-27.md`
  - `ops/evidence/latest/ape-weekly-cycle-run25-2026-05-11.md`
  - `ops/evidence/latest/ape-weekly-cycle-run26-2026-05-11.md`
  - `ops/evidence/latest/ape-weekly-cycle-run27-2026-05-11.md`
  - `ops/evidence/latest/ape-weekly-cycle-run28-2026-05-11.md`
  - `ops/evidence/latest/ape-weekly-cycle-run38-2026-06-24.md`
  - `ops/evidence/latest/ape-weekly-cycle-run39-2026-06-24.md`
  - `ops/evidence/latest/ape-weekly-cycle-run40-2026-06-24.md`
  - `ops/evidence/latest/ape-weekly-cycle-run41-2026-07-08.md`
  - `ops/evidence/latest/ape-weekly-cycle-run42-2026-07-08.md`
  - `ops/evidence/latest/ape-weekly-cycle-run43-2026-07-08.md`
  - `ops/evidence/latest/ape-weekly-cycle-run44-2026-07-09.md`
  - `ops/evidence/latest/ape-weekly-cycle-run45-2026-07-13.md`
  - `ops/evidence/latest/ape-weekly-cycle-run46-2026-07-20.md`
  - `ops/evidence/latest/ape-weekly-cycle-run47-2026-07-23.md`
  - `ops/evidence/latest/ape-weekly-cycle-run48-2026-07-27.md`
  Os cinco geradores declarativos identificados por leitura são `scripts/ci/llm_provider_pricing_snapshot.cjs`, `scripts/ci/infra_provider_pricing_snapshot.cjs`, `scripts/generateP2HighGlobalCoverage.ts`, `scripts/generateP2InteropEvidence.ts` e `scripts/generateP3EconomyEvidence.ts`. Os quatro produtores híbridos são o comando `check:governance` de `apps/api/package.json`, `scripts/collect-environment.sh`, `scripts/ci/ape_cycle_weekly.cjs` e `scripts/runImobKnowledgeShadow.ts`. A contagem de 41 entradas inclui somente caminhos do índice que são saídas diretas desses produtores; os registros narrativos sobre regeneração P2 HIGH e shadow IMOB não foram contados como saída direta.
- **O que não foi verificado:** o inventário semântico das demais entradas não foi concluído contra o conteúdo integral de cada artefato; portanto, podem existir outras divergências. Também não foi verificado se alguma das 72 entradas possui execução real omitida pela redação do índice. Nenhuma entrada foi corrigida ou removida.
  A leitura estática também não determina qual processo produziu cada instância histórica já commitada que corresponde ao padrão de nome de um gerador.
- **Origem da observação:** sessão de auditoria somente-leitura de 2026-08-03, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** inventário semântico completo, decisão do owner sobre remoção ou reclassificação e checks negativos que imponham a norma vigente.
- **Status:** `pendente`

## 14. Reconciliação da visibilidade dos artefatos de governança

- **Frente:** `RECONCILE-GOVERNANCE-ARTIFACT-VISIBILITY`
- **Severidade:** alta — decisões canônicas e evidências de execução podem ficar fora do controle de versão e dos gates sem falha bloqueante, enquanto identificadores de trabalho podem circular fora do registro primário.
- **O que se sabe:** `.gitignore:40-66` ignora `docs/*`, libera diretórios selecionados e, para `docs/architecture/`, volta a ignorar `docs/architecture/*` antes de liberar nominalmente cada arquivo; por isso, cada documento arquitetural novo exige manutenção manual da allowlist. Não há exceção para `docs/adr/`: `git check-ignore --no-index` atribui os ADR-003 e ADR-004 a `.gitignore:40`, embora ambos estejam rastreados, e os comandos de staging dos ciclos que os criaram usaram `git add -f`. `.gitignore:17` ignora `*.log`, enquanto `git ls-files` encontra 25 arquivos `.log` sob `ops/evidence/`, inclusive os excerpts de F4 adicionados com `-f`. `scripts/checkDocsLinkIntegrity.ts:6-29,86-92` cobre somente os arquivos de instrução da raiz e `docs/architecture/*.md`; `docs/ops/` e `docs/adr/` ficam fora do gate. Em `HEAD`, `git grep` encontra dez ocorrências rastreadas de `REPLACE-P3-EVIDENCE-HARDCODED` em sete arquivos, nenhuma em `docs/ops/open-fronts.md`; `docs/ops/open-fronts.md:85-94` registra `DISCRIMINATE-P3-EVIDENCE-MODE`, e `ops/evidence/corrections/gate-waiver-p3-settlement-removal-2026-08-03.md:45-67` registra a sobreposição de escopo não declarada. `.github/workflows/ci.yml:1008-1012` ainda explica o rebaixamento do job P3 e nomeia `REPLACE-P3-EVIDENCE-HARDCODED` como frente de restauração, embora a supressão tenha sido removida em `729c791`. Sob essas regras, esquecer a exceção nominal, o `-f` ou o registro primário omite o artefato ou o identificador do repositório sem que os gates documentais atuais detectem a ausência.
- **O que não foi verificado:** não foi concluído o inventário de todos os artefatos canônicos afetados, não foi exercitado teste negativo para omissão durante staging e não foi decidido se `REPLACE-P3-EVIDENCE-HARDCODED` e `DISCRIMINATE-P3-EVIDENCE-MODE` são o mesmo trabalho ou frentes distintas.
- **Origem da observação:** as regras e coberturas foram reconfirmadas por leitura em `HEAD`; a ausência de gate sobre `docs/adr/` e `docs/ops/` já está versionada em `cd400ae`, a sobreposição e o comentário residual estão registrados em `b5426e6`, e os comandos `git add -f` dos ADRs e excerpts constam dos respectivos registros de sessão, não do conteúdo desses commits.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** decidir entre exceções de `.gitignore` — há precedente de negação no próprio arquivo — ou manutenção governada de `git add -f` com verificação de omissão; decidir também se os dois identificadores P3 designam o mesmo trabalho.
- **Status:** `pendente`

## 15. Resolução da deterioração dos gates de recência

- **Frente:** `RESOLVE-RECENCY-GATE-DECAY`
- **Severidade:** alta — dois required status checks passam a reprovar somente pelo decurso do prazo, e renovar data em artefato gerado pode produzir circularidade entre evidência e gate.
- **O que se sabe:** `ops/evidence/ci/p3-gate-restored-2026-08-04/manifest-ci.json:186-214` registra `P1ReconciliationRecurring` e `P2HighGlobalCoverage` entre os 20 required status checks do ruleset `main-protection-hard-gates`. Entre as runs `30840321426` (`2026-08-03T18:13Z`) e `30887018488` (`2026-08-04T07:14Z`), `P1ReconciliationRecurring` passou de `ageDays=14.76` para `15.30`, com limite `14`, e `P2HighGlobalCoverage` passou de `30.11` para `30.65`, com limite `30`, sem alteração nos arquivos avaliados (`ops/evidence/ci/p3-gate-restored-2026-08-04/p3-gate-restored-ci-evidence-2026-08-04.md:41-45`). P1 avalia `ops/evidence/latest/ape-weekly-cycle-run46-2026-07-20.md`, datado de `2026-07-20` no título da linha 1; P2 avalia `ops/evidence/latest/p2-high-global-coverage.json`, cujo `generatedAt` é `2026-07-04T15:38:27.779Z` na linha 3. A natureza dos artefatos é determinável por leitura: `scripts/ci/ape_cycle_weekly.cjs:12-33,53-79,105-151` gera o artefato P1 após executar 15 checks e capturar seus exit codes, mas grava `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0` como literais, portanto é híbrido e não uma captura integral dessas métricas; `scripts/generateP2HighGlobalCoverage.ts:38-64,74-119` gera P2 por inspeção textual dos arquivos de ações e do arquivo de teste, marca `e2eCovered=true` e grava o relógio em `generatedAt` sem executar o E2E, portanto é declarativo. `scripts/checkP1ReconciliationRecurring.ts:42-80` e `scripts/checkP2EvidenceRecency.ts:29-50` calculam idade a partir dessas datas. Assim, uma linha de base de conclusões de CI envelhece sozinha, e comparações entre runs distantes no tempo precisam ressalvar essa deterioração independente de código.
- **O que não foi verificado:** não foi executada regeneração, não foi comprovada a elegibilidade de um próximo ciclo P1 nem de um novo inventário P2 como evidência real, e não foi definido qual proveniência capturada deverá substituir os literais P1 e a inferência textual P2. Nenhuma tentativa de merge foi realizada.
- **Origem da observação:** os valores da run `30840321426` estão versionados no registro de `b5426e6`; a comparação, o ruleset e os valores da run `30887018488` estão congelados em `f2aa768`; a classificação híbrida/declarativa resulta da leitura dos produtores versionados em `HEAD` nesta sessão e não de execução nova.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** determinar e ratificar a proveniência aceitável dos dois artefatos antes de qualquer regeneração; renovar sem distinguir captura de declaração repetiria em P1/P2 a falha corrigida no arco P3.
- **Status:** `pendente`

## 16. Resolução da evidência declarativa de interop P2

- **Frente:** `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE`
- **Severidade:** alta — um artefato que declara execução de uma trilha sem executá-la alimenta required status checks e pode fazer assertions declarativas circularem como prova operacional.
- **O que se sabe:** `scripts/generateP2InteropEvidence.ts:35-39` lê código, contratos e policy como texto; `scripts/generateP2InteropEvidence.ts:41-108` fixa `ok=true`, status HTTP `200`/`202`, receipt canon, invariant e tiers sem chamada HTTP, subprocesso ou E2E. O gerador grava em `ops/evidence/latest/` os padrões `interop-routes-smoke-YYYY-MM-DD.json`, `interop-e2e-agent-call-YYYY-MM-DD.json` e `realestate-high-actions-e2e-YYYY-MM-DD.json` (`scripts/generateP2InteropEvidence.ts:41-118`). Os artefatos alimentam os required checks `P2AuditInterop`, `P1CriticalChain` e `W4NonRegression`: os jobs e comandos estão em `.github/workflows/ci.yml:834-861,895-919,1070-1094`; os consumidores estão em `scripts/checkP2AuditInterop.ts:131-197`, `scripts/checkP1CriticalChain.ts:45-88` e `scripts/checkW4NonRegression.ts:27-49,102-117`, com referências W4 em `ops/evidence/latest/w4-non-regression-kpis.json:18-22`. Em `p2_audit_interop`, o step das linhas 857-858 gera as assertions e o step das linhas 860-861 verifica em seguida os mesmos literais, circularidade pelo mesmo mecanismo já identificado em `p3_economy_hardening`; ver a frente 8, `DISCRIMINATE-P3-EVIDENCE-MODE`. O índice afirma, respectivamente, “Prova de implementação das rotas `POST /api/agents/discovery|negotiate|execute`.”, “Prova da trilha `discovery -> negotiate -> execute -> verify receipt`.” e “Contrato/negociação com `tier=HIGH`, `txIdRequired=true` e receipt canon para ações imobiliárias críticas.” (`docs/EVIDENCE_INDEX.md:191-192,243`).
- **O que não foi verificado:** não foi executada a trilha HTTP/E2E, não foi comprovado o comportamento das rotas em ambiente executável e a leitura estática não determina qual processo produziu cada instância histórica já commitada que corresponde aos três padrões.
- **Origem da observação:** inventário de geradores executado em sessão somente-leitura de 2026-08-04, sem commit ou artefato versionado próprio.
- **Origem do registro da frente:** este commit documental.
- **Bloqueio:** decidir entre substituir a geração declarativa por captura de execução real — o que exige ambiente executável para as rotas — ou rebaixar as afirmações do artefato e do índice ao que o gerador de fato produz, sem que essa segunda opção feche a lacuna de cobertura. Registrar a decisão antes da implementação, conforme o ADR-004.
- **Status:** `pendente`

## Contexto do PR-01

O PR-01 permanece `Parcial` na cadeia `61c0c393` → `85d9d31` → `d5efce8` → `de228d3`. A NC-2 foi verificada em CI e reproduzida nas runs `30710850816` e `30713272468`: `GATE_WAIVER_ACTIVE`, 90 dias restantes e `clockDate` obtido do relógio real, em job requerido.

Na run `30710850816`, `P3SettlementSupportByEnv` permanece `failure` e informativo por decisão registrada em `d5efce8`. O `continue-on-error` está no job, não no step; por isso a run conclui `success` enquanto a falha continua visível. No mesmo job, `Generate P3 economy evidence` conclui `success` e `Check P3 settlement support matrix by env` conclui `failure`, três steps adiante, tornando observável a circularidade da evidência P3 em `ops/evidence/ci/pr-01/ci-p3-settlement-steps.30710850816.log` e `ops/evidence/ci/pr-01/ci-p3-settlement-job.30710850816.log`.

Na mesma run, `P3EconomyHardening` permanece verde porque `scripts/checkP3EconomyHardening.ts:107` aceita `full` e `simulated` indistintamente. Esse contraste registra dois checks sobre a mesma propriedade, um com medição discriminante e outro sem ela; ver a frente 8, `DISCRIMINATE-P3-EVIDENCE-MODE`. O contraste não promove o status do PR-01, não torna a evidência P3 verdadeira e não resolve nenhuma das dezesseis frentes.
