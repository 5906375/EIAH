# Release Governance Policy (APE + Roadmap Hardening)

Versao: 1.1
Data: 2026-08-19
Base de verificacao: `origin/main` = `fe22fbd2438a256ca1b55f1f706287aefa3be240`; ruleset `main-protection-hard-gates` (id `13498700`) consultado em 2026-08-19T10:50:39Z via `GET repos/5906375/EIAH/rules/branches/main`.

Esta versao reconcilia o documento com o runtime verificado nessa data. Onde o texto anterior descrevia um modelo que nunca chegou a ser implementado, a descricao foi movida para a secao "Modelo alvo (nao implementado)" e nao deve ser lida como estado vigente.

## Objetivo
Padronizar governanca de release para evitar regressao silenciosa e garantir promocao somente com evidencia valida.

## Escopo
Aplica-se a `main` para trilhas criticas (F5.3, F5.4, F5.6). Nao ha branch de ambiente (`staging`, `pilot` ou equivalente) em operacao — ver "Modelo alvo (nao implementado)".

## Regras de branch (vigentes em `main`)
1. `main` aceita mudancas apenas via Pull Request.
2. Force push e merge direto (push sem PR) permanecem bloqueados.

Fonte da verdade: ruleset `main-protection-hard-gates` (id `13498700`, `enforcement: active`), regras `pull_request` e `non_fast_forward`. Para reconferir: `gh api repos/5906375/EIAH/rules/branches/main`.

## Required status checks
Os required status checks sao definidos pelo ruleset `main-protection-hard-gates` (id `13498700`), nao por lista fixa neste documento — a lista abaixo divergiria da real a cada alteracao do ruleset sem que este arquivo fosse atualizado, como ja ocorreu (a versao anterior listava 4 itens desde 2026-03-04; o ruleset já exige 18 desde então). Em 2026-08-19T10:50:39Z, eram exatamente 18: `build_validate`, `lint`, `CiUnitSuite`, `EvidenceIndex`, `ReceiptCanonCompat`, `P0CriticalityAudit`, `P1CriticalChain`, `RbacGuardrailRegression`, `AgentsPolicyFailClosed`, `AgentProtocolCompat`, `P2AuditInterop`, `ProviderBoundary`, `P3EconomyHardening`, `P3SettlementSupportByEnv`, `SettlementContractDrift`, `W4NonRegression`, `DbPreviewPostgresValidate`, `PublicHealthContract`.

Nota: esses sao nomes de *context* (job), nao de *workflow*. O workflow que produz a maioria deles se chama "CI Monorepo" (`.github/workflows/ci.yml`) — mas "CI Monorepo" em si nunca foi um context valido para a lista de required.

Para reconferir: `gh api repos/5906375/EIAH/rules/branches/main` (nao usar `/branches/main/protection` classico nem o campo `isRequired` de check-runs — ambos ignoram este ruleset e retornam falso negativo neste repositorio).

## Gate de promocao (hard metrics)
Promocao so e permitida quando **todos** os itens abaixo forem verdadeiros no ciclo semanal:
1. `decision = GO`
2. `hardMetricsGo = true`
3. `auditGap = 0`
4. `duplicateSideEffects = 0`
5. `breakGlass = 0`

Se qualquer item falhar, o veredito e `NO_GO` (fail-closed), exceto break-glass valido e auditado.

## Janela operacional
1. Merge window: inicio da semana antes da execucao APE Weekly.
2. Freeze window: antes da revisao final do ciclo semanal.

## Break-glass (mecanismo real, distinto do texto anterior)
Nao existe, no codigo, nenhum artefato chamado "break-glass". O mecanismo real e proximo em funcao e escopo e o critical kill switch (`packages/core/src/security/killSwitch.ts`, `enableCriticalKillSwitch`/`isCriticalKillSwitchEnabled`/`disableCriticalKillSwitch`):
1. Escopo `global` ou por `tenantId`, chave Redis `killswitch:critical:*`.
2. TTL obrigatorio, default 15 minutos (`15 * 60 * 1000` ms) quando nao informado.
3. Persiste apenas em Redis (payload JSON com `reason`, `activatedAt`, `ttlMs`) — **nao** grava em `RunEvent` nem em ledger. A trilha auditavel via `RunEvent`+ledger descrita na versao anterior deste documento nao foi localizada em nenhum caminho de codigo consultado nesta reconciliacao.

Se a intencao original (aprovacao humana explicita + trilha em `RunEvent`+ledger) permanecer valida como objetivo, ela e um gap a fechar, nao uma descricao do que existe — ver "Modelo alvo (nao implementado)".

## Evidencia obrigatoria
1. Toda mudanca deve atualizar/confirmar `docs/EVIDENCE_INDEX.md`. Vigente: `EvidenceIndex` e um dos 18 required status checks.
2. Todo PR deve explicitar DoD, risco e rollback. `.github/pull_request_template.md` contem esses campos como checklist; nenhum gate tecnico automatizado foi localizado validando que os campos foram de fato preenchidos.
3. Artefatos do ciclo semanal devem ser preservados para auditoria.

## Modelo alvo (nao implementado)

As afirmacoes abaixo descrevem intencao declarada em versoes anteriores deste documento. Nenhuma tem contraparte em codigo, workflow ou configuracao de plataforma verificavel nesta data. Nao decidem arquitetura nem propoem solucao — apenas registram o que foi declarado e nunca implementado, para que uma decisao humana futura parta de um estado conhecido.

1. **Promocao por branch de ambiente.** O modelo original previa branches `staging` e `pilot` recebendo apenas "promote" de `main`. Nenhuma das duas branches existe em `origin` (verificado contra a lista completa de branches remotas) e nenhum workflow do repositorio dispara nelas. Nao ha, hoje, nenhum caminho tecnico que implemente esse modelo.
2. **Deploy funcional a partir de `main`.** `deploy.yml` e `workflow_dispatch`-only, gated pelos GitHub Environments `deploy-staging` e `deploy-production.`; desde o commit `fe22fbd2` (2026-08-19), o passo de rollout falha explicitamente com `DEPLOY_NOT_IMPLEMENTED` para os componentes `api`, `workers` e `cli` — e falhava silenciosamente-como-sucesso antes disso. Nenhum deployment foi registrado nos Environments `deploy-staging` ou `deploy-production.` em toda a historia do repositorio (`GET deployments?environment=...` retorna 0 para ambos). `release.yml` constroi e publica imagens reais em `ghcr.io` (`eiah-api`, `eiah-workers`) por tag de versao — isso e build/publish, nao deploy.
3. **Break-glass com trilha `RunEvent`+ledger.** Ver secao acima — o mecanismo real (critical kill switch) nao grava nessas estruturas.

A escolha entre formalizar esse modelo (branches de ambiente, Environments com capability cohort, outro desenho) permanece uma decisao em aberto, fora do escopo desta reconciliacao.
