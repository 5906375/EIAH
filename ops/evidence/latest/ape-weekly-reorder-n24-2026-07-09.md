# Fix de ordem — N-24: publicar evidência APE mesmo em ciclo NO_GO (2026-07-09)

## Contexto real

Disparo manual do `ape-weekly.yml` em 2026-07-09 (commit `6bdca45`) falhou com `exit 1` no step
`Check P3 recurring stability` (`economy_stability_not_recurring`) — evidência FRESCA
(`ape-weekly-cycle-run44-2026-07-09.md`, gerada pelo próprio run), mas `hardMetricsGo: false`
(NO_GO real, causado por `check:e2e-recency`/`check:backup-restore` vencidos, D2/D24 em
andamento). O NO_GO em si está correto (D25: deve falhar o workflow visivelmente). O bug: ao
falhar, GitHub Actions pulou **todos** os steps seguintes por padrão (comportamento sequencial sem
`if:` explícito) — incluindo `Evidence index`, `Upload artifacts` e `Create PR with renewed APE
evidence`. Resultado: a evidência do run44 foi gerada localmente mas nunca chegou a ser commitada
nem publicada, e o step de auto-merge (D23, ainda não mergeado em `main` nesta data) também nunca
teria rodado.

## Ordem completa dos steps antes desta correção (confirmada por leitura direta do arquivo em `main`)

```
1. actions/checkout@v4
2. pnpm/action-setup@v4
3. actions/setup-node@v4
4. pnpm install --frozen-lockfile --ignore-scripts
5. LLM pricing snapshot
6. Infra pricing snapshot
7. Generate P3 economy evidence
8. Generate SLO baseline
9. Check SLO targets
10. Run APE cycle                                          <- gera ape-weekly-cycle-run<N>.md
11. Check P3 recurring stability   (D25, relocado 07-08)    <- FALHOU aqui em 2026-07-09
12. Check P4 Track P rollout readiness (D25, relocado)      <- pulado
13. Evidence linkage                                        <- pulado
14. Hard metrics                                            <- pulado
15. Provider pricing recency                                <- pulado
16. Evidence index                                          <- pulado (evidencia nunca validada)
17. Upload artifacts                                        <- pulado
18. Create PR with renewed APE evidence                     <- pulado (evidencia nunca publicada)
```

Confirmado: a tela do run mostrou p3/p4 antes de "Create PR", batendo exatamente com esta ordem no
arquivo.

## Achado adicional (além do escopo original do relato) — Hard metrics já tinha o mesmo problema

`scripts/checkApeCycleHardMetrics.ts` lê `artifacts/ape/weekly-cycle-decision.json` e falha
(`process.exit(1)`) quando `decision.hardMetricsGo` for `false` — **exatamente o mesmo padrão de
falha condicionada a NO_GO** que `check:p3-stability-recurring`/`check:p4-trackp-rollout`, só que
avaliando o ciclo **atual** (não a recorrência dos últimos 3). Esse step (`Hard metrics`, posição
14) já existia **antes** de D25 mover P3/P4 para este workflow — ou seja, o bug de "NO_GO derruba
publicação" já existia estruturalmente antes de D25, D25 só adicionou mais dois pontos de falha na
mesma cadeia. Confirmado por leitura de `checkApeEvidenceLinkage.ts` (só verifica presença de
arquivo, nunca falha por `hardMetricsGo`) e `checkProviderPricingRecency.ts` (só verifica idade de
snapshot, idem) que **nenhum outro step** da cadeia tem esse comportamento — só P3, P4 e Hard
metrics.

Isso também expôs um efeito colateral da mudança de D25: como jobs separados em `ci.yml`, P3 e P4
rodavam em paralelo e independentes (a falha de um não afetava a execução do outro). Como steps
sequenciais na mesma job em `ape-weekly.yml`, sem `if:` explícito, a falha de P3 também pulava P4
silenciosamente — perda de observabilidade independente entre os dois gates.

## Opção escolhida: Opção 2 estendida (nenhuma reordenação necessária)

Avaliei as duas opções propostas:

- **Opção 1 (reordenar)**: mover só `Evidence index`/`Upload artifacts`/`Create PR`/auto-merge para
  antes de P3/P4 resolveria o caso relatado, mas **não resolveria o problema do Hard metrics**
  (que ficaria entre `Run APE cycle` e os steps de publicação de qualquer forma, a menos que também
  fosse movido — expansão de escopo não pedida) nem o problema de P3 pular P4 silenciosamente (a
  menos que TAMBÉM fossem adicionados `if:` entre os próprios steps de avaliação reordenados).
- **Opção 2 (if condicional)**: adicionar `if: ${{ !cancelled() && steps.run_ape_cycle.outcome ==
  'success' }}` a **todos** os steps entre `Run APE cycle` e `Create PR` (inclusive) resolve os dois
  problemas de uma vez, sem precisar mover nada: cada check continua rodando e reportando seu
  próprio resultado, independente do que os anteriores fizeram; a publicação sempre acontece se a
  geração do ciclo teve sucesso; e nenhum resultado fica escondido por pulo em cascata.

Escolhi a **Opção 2, estendida além do escopo literal do relato** (P3/P4) para cobrir também `Hard
metrics`, `Evidence linkage` e `Provider pricing recency` — as duas últimas não tinham o bug (não
falham por `hardMetricsGo`), mas sofriam o mesmo risco de pulo em cascata caso P3/P4/Hard metrics
falhassem antes delas; incluí-las custa zero risco adicional e fecha a lacuna por completo.
Nenhuma reordenação de posição foi feita — só a condição `if:` foi adicionada, o que é a mudança
estruturalmente mais simples e com menor superfície de risco (nenhuma dependência de ordem entre
steps foi alterada, só a política de "pular se algo anterior falhou").

## Guarda contra publicar evidência inexistente

`Run APE cycle` ganhou `id: run_ape_cycle`. Todos os `if:` seguintes checam
`steps.run_ape_cycle.outcome == 'success'` — se a própria geração do ciclo falhar (ex.: erro de
código no `ape_cycle_weekly.cjs`, não um NO_GO de conteúdo — lembrando que o script sempre sai com
`exit 0` em modo `shadow`, seu modo padrão em runs agendados/manuais sem override, então esse passo
falhar por si só é raro e indicaria um bug real de execução, não um NO_GO) ou o job for cancelado
(`!cancelled()`), nenhum dos steps de avaliação/publicação roda — nunca se cria uma PR com
evidência inexistente ou corrompida.

## Diff

```diff
       - name: Run APE cycle
+        id: run_ape_cycle
         env: ...
         run: pnpm ape:cycle:weekly

       - name: Check P3 recurring stability (relocated from ci.yml, ratified D25)
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:p3-stability-recurring

       - name: Check P4 Track P rollout readiness (relocated from ci.yml, ratified D25)
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:p4-trackp-rollout

       - name: Evidence linkage
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:ape-evidence-linkage

       - name: Hard metrics
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:ape-hard-metrics

       - name: Provider pricing recency
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:provider-pricing-recency

       - name: Evidence index
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         run: pnpm check:evidence-index

       - name: Upload artifacts
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         uses: actions/upload-artifact@v4
         ...

       - name: Create PR with renewed APE evidence
+        if: ${{ !cancelled() && steps.run_ape_cycle.outcome == 'success' }}
         uses: peter-evans/create-pull-request@v7
         ...
```

Nenhum step foi movido de posição. Nenhuma linha de `run:`/`uses:`/`with:` pré-existente foi
alterada. `scripts/ci/ape_cycle_weekly.cjs` não foi tocado (N-22 permanece fora de escopo).

## Fluxo esperado da próxima execução (não verificável sem o cron/dispatch real)

1. `Run APE cycle` gera `ape-weekly-cycle-run45-<data>.md` localmente (ou o próximo número
   disponível) e atualiza `docs/EVIDENCE_INDEX.md` — sucesso (script sempre sai 0 em modo shadow).
2. `Check P3 recurring stability` roda; se `check:e2e-recency`/`check:backup-restore` ainda
   estiverem vencidos (D2/D24 não resolvidos), falha — o job já fica marcado para terminar vermelho,
   mas a execução **continua** para o próximo step.
3. `Check P4 Track P rollout readiness` roda de forma independente (não é mais pulado pela falha do
   P3) — mesmo resultado NO_GO esperado, reportado separadamente.
4. `Evidence linkage`, `Hard metrics`, `Provider pricing recency` rodam; `Hard metrics` também
   falha (mesmo `hardMetricsGo:false` do ciclo atual) — reportado, não bloqueia o resto.
5. `Evidence index` roda e valida `docs/EVIDENCE_INDEX.md` — deve passar (a nova entrada já foi
   escrita no passo 1).
6. `Upload artifacts` roda e sobe os artefatos locais do ciclo.
7. `Create PR with renewed APE evidence` roda e **abre/atualiza** a PR com a evidência do novo
   ciclo — isso é o objetivo desta correção: a evidência chega a existir como PR real, mesmo com o
   ciclo em NO_GO.
8. Se D23 (auto-merge, branch `pr-ape-weekly-automerge`) já estiver mergeado nesse momento, o step
   de auto-merge (que viria logo depois de `Create PR`, condicionado ao mesmo padrão) também
   precisará da mesma proteção `if:` — **não incluído nesta PR** porque a branch de D23 ainda não
   está em `main` nesta data; fica registrado como dependência para quando D23 for mergeado/rebaseado
   (ver seção "O que ficou de fora").
9. O **job termina vermelho** (P3/P4/Hard metrics falharam) — o sinal de NO_GO continua visível e
   auditável no histórico de runs, exatamente como D25 pretende. A diferença é que agora a
   evidência do ciclo NO_GO existe como PR publicada, em vez de perdida.

**Validação real desta sequência só é possível no próximo disparo manual do workflow, pós-merge —
recomendado explicitamente.**

## Confirmação — D25 e D23 permanecem intactas

- **D25**: nenhum limiar, `maxAgeDays`, ou lógica de `checkP3StabilityRecurring.ts`/
  `checkP4TrackPRollout.ts` foi tocado. Os dois checks continuam rodando em modo bloqueante
  (sem `continue-on-error`, sem afrouxamento) — a única mudança é que a falha deles não impede mais
  os steps *seguintes* de rodar. O job final continua terminando com status de falha quando
  qualquer um deles retorna NO_GO — confirmado por inspeção: `if:` não altera se um step FALHA, só
  se ele RODA; um step que roda e falha ainda marca o job como `failure` ao final.
- **D23 (guard de path do auto-merge)**: não existe nesta branch (D23 não está em `main` nesta
  data) — nada a preservar ou quebrar aqui. Nota registrada para quando D23 for integrado.

## Validação executada

```
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ape-weekly.yml'))"
→ YAML válido, 18 steps, id=run_ape_cycle presente, 8 steps com o if: correto (P3, P4,
  Evidence linkage, Hard metrics, Provider pricing recency, Evidence index, Upload artifacts,
  Create PR)
```

`actionlint` indisponível neste ambiente (mesma limitação já registrada nas sessões de D25/D23) —
validação feita via parse YAML estrutural (PyYAML), suficiente para confirmar sintaxe e presença
correta de `id`/`if`, mas não substitui uma execução real do runner.

## O que ficou de fora

- Rebase/merge de `pr-ape-weekly-automerge` (D23) — branch separada, não tocada aqui. Quando for
  integrada, o novo step de auto-merge precisará do mesmo `if:` desta correção.
- N-22 (hardcode de `auditGap`/`duplicateSideEffects` em `ape_cycle_weekly.cjs`) — confirmado
  intocado, fora de escopo.
- Qualquer alteração de limiar/threshold dos checks — nenhuma feita.
- Disparo real do workflow para validar em produção — recomendado como próximo passo, não
  executável nesta sessão local.

## Status

Correção do workflow: **evidenciado** (YAML válido, lógica revisada linha a linha, diff mínimo sem
reordenação). Achado adicional do Hard metrics e do efeito P3→P4 em cascata: **evidenciado** (por
leitura direta dos scripts). Comportamento real na próxima execução: **proposta/inferência
documentada** — não executável nem verificável nesta sessão local; precisa de um disparo manual
real pós-merge para confirmação.
