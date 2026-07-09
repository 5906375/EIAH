# Realocação de gates recorrentes — decisão D25 ratificada pelo CEO (2026-07-08)

## Decisão

D25, ratificada pelo CEO em 2026-07-08: `check:p3-stability-recurring` e `check:p4-trackp-rollout`
deixam de bloquear PRs em `ci.yml` e passam a rodar em modo bloqueante dentro de
`.github/workflows/ape-weekly.yml`, logo após o step `Run APE cycle`. `check:p1-reconciliation-recurring`
**permanece** em `ci.yml` (não é alvo de D25).

Esta é uma **realocação ratificada e documentada** de onde o gate roda — não um afrouxamento de
limiar, métrica ou critério de aprovação. Nenhum dos dois checks foi alterado em código.

## Motivo

`check:p3-stability-recurring` e `check:p4-trackp-rollout` validam a saúde **recorrente** do ciclo
APE (últimos 3 ciclos semanais dentro da janela de idade, com `hardMetricsGo: true`) — não têm
relação com o conteúdo de nenhum PR individual. Com o NO_GO honesto atualmente ativo (evidenciado
em `ops/evidence/latest/ape-weekly-cycle-run41-2026-07-08.md`/`run42`/`run43`, branch
`ops-ape-weekly-run41`: `check:e2e-recency` e `check:backup-restore` vencidos, dependentes de
credenciais de staging reais e de um drill real de backup/restore — D2/D24, em andamento), esses
dois gates bloqueavam **todo PR do repositório**, incluindo o próprio PR que traz a evidência
regenerada — um deadlock circular: não dá para consertar o NO_GO sem mergear uma PR, e nenhuma PR
passa enquanto o NO_GO existir.

## O que muda

- `check:p3-stability-recurring`: sai do job dedicado `p3_stability_recurring` em `ci.yml`
  (removido por completo); passa a rodar como step bloqueante em `ape-weekly.yml`.
- `check:p4-trackp-rollout`: sai do job dedicado `p4_trackp_rollout` em `ci.yml` (removido por
  completo); passa a rodar como step bloqueante em `ape-weekly.yml`.
- A cobrança do NO_GO passa a acontecer no workflow semanal (`ape-weekly.yml`), que falha
  visivelmente quando os dois checks não passam — o sinal continua existindo e é auditável no
  histórico de runs do workflow, só muda o lugar onde ele é aplicado.

## O que NÃO muda

- Nenhum limiar (`maxAgeDays`, `MIN_CYCLES` etc.) foi alterado em nenhum dos dois scripts.
- Nenhuma métrica foi afrouxada — os scripts `checkP3StabilityRecurring.ts` e
  `checkP4TrackPRollout.ts` continuam byte-a-byte os mesmos.
- `check:p1-reconciliation-recurring` continua bloqueando PRs em `ci.yml`, sem alteração.
- O NO_GO real continua sendo reportado honestamente — nenhum valor foi fabricado para forçar GO
  (ver `ops/evidence/latest/ape-weekly-cycle-run41-2026-07-08.md` e correlatos).
- N-22 (hardcode de `auditGap`/`duplicateSideEffects` em `scripts/ci/ape_cycle_weekly.cjs`) não foi
  tocado nesta sessão — confirmado por `git diff` restrito a `ci.yml`/`ape-weekly.yml` nesta PR.

## Mecanismo escolhido: steps separados, não `rolloutMode=enforce`

`scripts/ci/ape_cycle_weekly.cjs` já tem um mecanismo de enforce idiomático: se
`APE_ROLLOUT_MODE=enforce`, o próprio step `Run APE cycle` sai com código 1 quando
`hardMetricsGo` for `false` (linha final do script). Avaliado e **não usado** para esta realocação,
porque cobre um escopo diferente: `hardMetricsGo` reflete os 15 checks que compõem **um único
ciclo novo** (e2e-recency, manifest-integrity, backup-restore etc.), enquanto
`check:p3-stability-recurring`/`check:p4-trackp-rollout` validam a **recorrência** — os últimos 3
ciclos já publicados, sua idade e seu histórico de GO/NO_GO. Ativar `enforce` mudaria o
comportamento do workflow para muito além do que D25 ratificou (bloquearia o workflow semanal por
qualquer um dos 15 checks internos, não especificamente pelos dois gates nomeados na decisão) — por
isso os dois checks foram adicionados como **steps bloqueantes separados**, logo após `Run APE
cycle`, preservando o escopo exato da ratificação.

## Condição de reavaliação

Quando D2/D24 resolverem o subjacente (credenciais reais de staging para `check:e2e-recency` e um
drill real de backup/restore para `check:backup-restore`) e o ciclo semanal voltar a `GO` de forma
sustentada, avaliar explicitamente — em decisão futura própria, não automática — se
`check:p3-stability-recurring` e `check:p4-trackp-rollout` retornam a bloquear PRs em `ci.yml` ou
permanecem no workflow semanal permanentemente. Esta sessão não prejulga essa resposta.

## Validação real executada

Checks rodados localmente contra a evidência real da branch `ops-ape-weekly-run41` (7bc8ace),
trazida temporariamente só para validação, sem entrar no commit desta PR:

```
check:p1-reconciliation-recurring (fica em ci.yml)     → ok: true
check:p3-stability-recurring (migra para ape-weekly)    → ok: false, "economy_stability_not_recurring"
check:p4-trackp-rollout (migra para ape-weekly)         → ok: false, "ape_cycles_not_green"
check:evidence-index                                    → ok: true
```

O resultado `ok:false` de p3/p4 é o **NO_GO real e honesto** (não um erro de configuração) — confirma
que, uma vez a branch `ops-ape-weekly-run41` mergeada junto com esta PR, os dois checks vão de fato
falhar `ape-weekly.yml` como esperado, e `check:p1-reconciliation-recurring` deixa de bloquear PRs
imediatamente (evidência já dentro da janela de 14 dias).

## Status

Realocação: **evidenciado** (YAML validado via parse, ambos os workflows sintaticamente corretos;
os 3 checks relevantes rodados de verdade contra evidência real). Reavaliação futura: **proposta**
(condição registrada, decisão em si não tomada nesta sessão).
