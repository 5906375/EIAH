# APE cycles #45–#48 audit — 2026-07-27

## Escopo

Esta auditoria documental examina a proveniência, a medição das métricas e a
ratificação dos ciclos APE #45, #46, #47 e #48. O objetivo é determinar se
esses ciclos podem sustentar o gate `check:p1-reconciliation-recurring`.

Este trabalho é read-only em relação a workflows e settings. Não houve rerun,
alteração de threshold, ruleset, branch protection, runtime, schema, migration,
dump, `.env` ou secret.

## Metodologia

Foram correlacionados:

- os quatro arquivos `ape-weekly-cycle-run*`;
- o histórico Git de introdução dos arquivos e das entradas no Evidence Index;
- os metadados públicos dos PRs, reviews e eventos de merge;
- os runs e jobs públicos do GitHub Actions;
- a versão de `scripts/ci/ape_cycle_weekly.cjs` presente em cada commit;
- `.github/workflows/ape-weekly.yml`;
- `scripts/checkP1ReconciliationRecurring.ts`;
- os checks de linkage, hard metrics, estabilidade P3 e rollout P4.

Não foram usados os arquivos locais ignorados em `artifacts/ape` como prova dos
ciclos auditados: eles foram gerados em `2026-07-08T13:12:53.965Z`, antes de
#45, e não correspondem a #45–#48.

## Achado estrutural do gerador

A mesma versão do gerador estava presente nos quatro commits auditados:

- arquivo: `scripts/ci/ape_cycle_weekly.cjs`;
- SHA-256 da versão: `5e9fc12b86a9d502fdf66860cc38b71368ed6d37ee779e30b00792a231bf5dbb`.

Nessa versão:

- `hardMetricsGo` é derivado de `failed.length === 0`, usando os exit codes de
  15 comandos;
- `hardReasons` é derivado dos checks com status `FAIL`;
- `decision` deriva de `hardMetricsGo`;
- `nonRegressionGo` apenas replica `hardMetricsGo`, sem medição independente;
- `auditGap` é escrito literalmente como `0`;
- `duplicateSideEffects` é escrito literalmente como `0`;
- `breakGlass` é escrito literalmente como `0`.

Portanto, `hardMetricsGo` é uma derivação de execução, mas `auditGap`,
`duplicateSideEffects`, `breakGlass` e a afirmação de reconciliação estável não
são medições de runtime ou ledger. Nenhum dos quatro arquivos contém receipt
`{id,hash,reasonCode,timestamp}` que vincule essas métricas a uma fonte medida.

## Inventário e classificação

| Ciclo | Artefato | Introdução | Criação / merge | Proveniência das métricas | Correspondência | Classificação fail-closed |
| --- | --- | --- | --- | --- | --- | --- |
| #45 — 2026-07-13 | `ops/evidence/latest/ape-weekly-cycle-run45-2026-07-13.md` — SHA-256 `9bd91eba012cc0be7899e51a4a0a01601a2dd866c3d334cdfd6c5303e5bfea73` | Run Actions `29252744944`; PR #250; commit `17a373449bb86ba1f4be76cac7be2e4ae1e061e9` | PR criada e mergeada por `github-actions[bot]`; zero reviews | `hardMetricsGo=false` deriva dos checks falhos; os dois zeros de reconciliação são hardcoded | Arquivo e entrada do índice entraram no mesmo commit; artifact Actions `8280057150`, digest `sha256:17963eb39ec05e8e8abef35f4131e9cbc39cf5a9a333378a3eaf2eacfd51dd52` | **Viciado para recorrência P1**: métricas centrais não medidas e self-merge sem ratificação humana |
| #46 — 2026-07-20 | `ops/evidence/latest/ape-weekly-cycle-run46-2026-07-20.md` — SHA-256 `13baeecea8051a82bd135e13114214a8617357acdc21866c2be930b1835519d6` | Run Actions `29744339785`; PR #351; commit `4ec4856c6ab50a6917e84c5ce6251983c8c560b6` | PR criada e mergeada por `github-actions[bot]`; zero reviews | `hardMetricsGo=false` deriva dos checks falhos; os dois zeros de reconciliação são hardcoded | Arquivo e entrada do índice entraram no mesmo commit; artifact Actions `8461727126`, digest `sha256:f0e8e4a862eaefad3fc8644ae389629ae53ca2272c1fe802e81394b13bc2eb59` | **Viciado para recorrência P1**: métricas centrais não medidas e self-merge sem ratificação humana |
| #47 — 2026-07-23 | `ops/evidence/latest/ape-weekly-cycle-run47-2026-07-23.md` — SHA-256 `0ec8cc21e69e435c8fa8d6c1fc32adbcceaaba3628231ab67b034b52b0db280a` | Commit `3e63fc755003995f664b10a40feadd57671e5e3f`; PR #380; merge `db02d53335e500d99ffa55bbdad07c6aff32325c` | Arquivo autorado por `Codex Agent`; PR criada e mergeada por `5906375`; zero reviews; sem self-merge de bot | Não há run APE correspondente em 2026-07-23 nem payload/decision vinculados; os dois zeros não têm fonte medida | O arquivo entrou sozinho em #380; a entrada no índice foi adicionada depois por `947340c486b1f9d30a6c8fe2bf7e114a78817e73`. O blob Git `5c565566af1832febe00d83a0f769a55f1b0f7e0` corresponde ao `evidenceRef` existente | **Viciado para recorrência P1**: merge humano não corrige ausência de execução e medição demonstráveis; origem de `hardMetricsGo` fica indeterminada |
| #48 — 2026-07-27 | `ops/evidence/latest/ape-weekly-cycle-run48-2026-07-27.md` — SHA-256 `81e63a47d14ee480f69a0fe462505e6ad15f398a8d6a5decb72748819c21a02b` | Run Actions `30270643966`; PR #398; branch commit `76635e1631c1db61f7284b126db720dff25ca6fc`; merge `2f73a9c6d87ae009e39577d906e18a54299c4c16` | PR criada e mergeada por `github-actions[bot]`; zero reviews | `hardMetricsGo=false` deriva dos checks falhos; os dois zeros de reconciliação são hardcoded | Arquivo e entrada do índice entraram no mesmo merge; artifact Actions `8654657401`, digest `sha256:3baa99b10d2f32c987c5d23cd647ad8a26ad5ec21be771bc21d7f4d51f0265bd` | **Viciado para recorrência P1**: métricas centrais não medidas e self-merge sem ratificação humana |

## Workflow, ator e self-merge

Nos runs #45, #46 e #48:

- `Run APE cycle`: `success`;
- P3 recurring: `failure`;
- P4 rollout: `failure`;
- `Hard metrics`: `failure`;
- `Evidence index`: `failure`;
- `Create PR with renewed APE evidence`: `success`;
- `Guard evidence-only diff and enable auto-merge`: `success`.

Apesar de o job APE terminar em `failure`, o passo final habilitou
`gh pr merge --auto --squash`. Os eventos públicos confirmam merge por
`github-actions[bot]` nos PRs #250, #351 e #398. Não houve review humano nesses
PRs.

O #47 é diferente: não houve self-merge de bot. Carlos Alberto Merlo
(`5906375`) criou e mergeou o PR #380. Entretanto, o artefato foi autorado por
Codex e não está ligado a uma execução APE ou a métricas medidas. A ratificação
humana do merge resolve apenas o eixo de ator, não o eixo de integridade da
métrica.

O kill-switch posterior, mergeado no PR #397, removeu `schedule`, `cron`,
`gh pr merge` e `--auto` de `.github/workflows/ape-weekly.yml`, preservando
`workflow_dispatch` e `peter-evans/create-pull-request@v7`. Ele impede a
repetição automática do padrão, mas não torna confiáveis os ciclos históricos.

## Correspondência com o Evidence Index

- #45, #46 e #48 foram adicionados ao Evidence Index pelos mesmos merges que
  introduziram os arquivos.
- #47 foi introduzido pelo PR #380 e indexado posteriormente no PR #385.
- Os valores documentados no índice correspondem aos respectivos arquivos.
- A correspondência textual não prova medição: o gerador e os arquivos repetem
  os mesmos valores hardcoded.
- Os payloads e decisions enviados como artifacts Actions não são versionados
  no repositório. Seus metadados e digests existem, mas não há receipt no
  arquivo de ciclo que vincule cada zero a ledger/runtime.

## Impacto específico do #48 no P1

`scripts/checkP1ReconciliationRecurring.ts`:

1. ordena os arquivos pelo número do run;
2. seleciona os três mais recentes;
3. exige idade máxima de 14 dias;
4. aceita o ciclo quando `auditGap=0` e `duplicateSideEffects=0`.

O check não valida:

- `hardMetricsGo`, `decision` ou `hardReasons`;
- execução real ou digest do artifact;
- receipt, ledger ou fonte das métricas;
- ator de criação/merge ou ratificação humana;
- continuidade temporal além do frescor dos três números selecionados.

Com a introdução do #48, a seleção passou a ser #48/#47/#46, retirando #45 da
janela avaliada. Em 2026-07-27, `P1ReconciliationRecurring` retornou `success`
nos heads dos PRs #397 e #394, respectivamente às `19:12:23Z` e `19:13:28Z`.

Esse verde foi obtido lendo os zeros presentes nos três arquivos, embora:

- #46 e #48 tenham zeros hardcoded e self-merge de bot;
- #47 não tenha execução vinculada;
- os três ciclos estejam em `NO_GO`;
- #48 tenha sido produzido por um workflow cujo job terminou vermelho.

Assim, o #48 restaurou tecnicamente o frescor exigido pelo gate, mas não
restaurou evidência confiável de reconciliação. O P1 permanece aberto e seu
verde recente deve ser tratado como provisório.

## Limitações

- A API pública não expôs logs textuais completos nem houve download dos ZIPs
  de artifact.
- `auto_merge` aparece `null` no snapshot pós-merge dos PRs; o mecanismo é
  confirmado conjuntamente pelo YAML histórico, pelo passo Actions
  `Guard evidence-only diff and enable auto-merge: success` e pelo ator de
  merge `github-actions[bot]`.
- Esta auditoria não reexecuta checks nem reinterpreta o resultado `NO_GO`.
- Esta auditoria não decide a validade de outras evidências renovadas nos PRs
  automatizados.

## Decisão fail-closed

- Nenhum dos ciclos #45–#48 é aceito como evidência confiável de recorrência
  P1.
- Os arquivos permanecem como histórico, sem apagar ou reescrever runs.
- `hardMetricsGo=false` e os `hardReasons` de #45, #46 e #48 têm proveniência
  de execução parcial, mas isso não valida os zeros de reconciliação.
- O gate P1 não deve ser declarado fechado com essa janela.
- O fechamento exige gerador honesto com métricas medidas, receipt vinculante,
  novos ciclos reais e ratificação humana, sem relaxar thresholds.

Status documental desta auditoria: `evidenciado`. Estado operacional P1:
`parcial`.
