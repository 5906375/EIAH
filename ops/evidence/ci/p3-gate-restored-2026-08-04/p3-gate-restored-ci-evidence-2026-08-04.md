# Arco F2 — semântica de bloqueio restaurada do gate P3

- **Data da captura:** 2026-08-04
- **Status declarado:** `Proposta`
- **Repositório:** `5906375/EIAH`
- **Workflow medido:** `CI Monorepo`
- **Run coletada neste ciclo:** [`30887018488`](https://github.com/5906375/EIAH/actions/runs/30887018488)
- **Manifesto:** [`manifest-ci.json`](manifest-ci.json)

## Método e origem

O diretório `ops/evidence/ci/p3-gate-restored-2026-08-04/` segue a convenção temática-data já usada por [`p3-settlement-env-gate-2026-08-03`](../p3-settlement-env-gate-2026-08-03/p3-settlement-env-gate-ci-evidence-2026-08-03.md). Somente a run `30887018488` foi coletada em 2026-08-04. A coleta foi executada via `gh` por operador humano autenticado, com os escopos literais `gist`, `read:org`, `repo` e `workflow`, sem escopo administrativo e sem chamada de escrita à API. O agente não coletou diretamente: os comandos fora do sandbox exigiram autorização do operador.

Os dados das outras duas runs não foram recoletados:

- `30713272468` provém do congelamento versionado no commit `be35bebee2489c2d3e40d7f8de438a155da68c4e`, inclusive seu [`manifest-ci.json`](../p3-settlement-env-gate-2026-08-03/manifest-ci.json) e [`jobs.json`](../p3-settlement-env-gate-2026-08-03/p3-env-run-30713272468-jobs.json).
- `30840321426` provém das consultas somente leitura registradas no ciclo de `b5426e67c9a0a589f73e2848f03bfbe3d5b98595` e consolidadas no [registro de remoção do waiver](../../corrections/gate-waiver-p3-settlement-removal-2026-08-03.md).

O log integral da run atual não foi versionado. Seu hash, tamanho, comando de recuperação e limite de retenção constam no manifesto.

## Comparação das três runs

| Run | Head | Estado relevante | `P3SettlementSupportByEnv` | `OrphanTestsRegression` | Conclusão da run |
| --- | --- | --- | ---: | ---: | ---: |
| `30713272468` | `de228d3f` | Supressão ativa por waiver; gerador declarando `stripe=full` | `failure` (`91404418214`) | `success` (`91404418162`) | `success` |
| `30840321426` | `729c791d` | Supressão removida; waiver ainda presente | `success` (`91775495102`) | `failure` (`91775495248`), step 7 por `GATE_WAIVER_STALE` | `failure` |
| `30887018488` | `b5426e67` | Declaração alinhada ao contrato; sem supressão; sem waiver | `success` (`91920370340`) | `success` (`91920370085`) | `failure`, somente recência P1/P2 |

Na primeira run, o required check P3 reprovava enquanto a run concluía `success`, pois a falha do job estava suprimida. Na terceira, o job P3 passa por mérito e o Orphan também conclui `success`; a run reprova exclusivamente por dois jobs não relacionados ao delta: `P1ReconciliationRecurring` e `P2HighGlobalCoverage`.

## O que esta evidência prova

Na run `30887018488`, `headSha=b5426e67c9a0a589f73e2848f03bfbe3d5b98595`, evento `pull_request` e workflow `CI Monorepo`, os metadados completos de jobs confirmam explicitamente `P3SettlementSupportByEnv=success` e `OrphanTestsRegression=success`; não se inferiu sucesso pela ausência na lista de falhas. A run concluiu `failure` com exatamente dois jobs em `failure`: `P1ReconciliationRecurring`, no step `Check P1 recurring reconciliation stability`, e `P2HighGlobalCoverage`, no step `Check P2 HIGH evidence recency`, ambos por vencimento de recência.

O excerpt do [step P3](f4-run-30887018488-p3-settlement-step-excerpt.log) demonstra que `check:p3-settlement-support-by-env` executou, retornou `ok=true`, não registrou violação e leu `stripe=simulated` em `staging`. O excerpt do [step 7 de Orphan](f4-run-30887018488-orphan-step-7-excerpt.log) demonstra `tests=13`, `pass=13`, `fail=0` e `check:gate-waiver-expiry` com `ok=true`, `warnings=[]` e `violations=[]`.

No head medido, o job `P3SettlementSupportByEnv` em [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) não contém `continue-on-error`, e [`ops/contracts/gate-waivers.v1.json`](../../../contracts/gate-waivers.v1.json) contém `"waivers": []`.

A consulta de 2026-08-04 ao [ruleset `13498700`](f4-ruleset-13498700.json) registra `main-protection-hard-gates`, `target=branch`, `enforcement=active`, condição sobre a default branch e 20 required status checks, entre eles `P3SettlementSupportByEnv`, `P1ReconciliationRecurring` e `P2HighGlobalCoverage`.

## Achado de recência

Entre `30840321426` (`2026-08-03T18:13Z`) e `30887018488` (`2026-08-04T07:14Z`), sem alteração nos arquivos de evidência correspondentes, `P1ReconciliationRecurring` passou de `ageDays=14.76` para `15.30` (`maxAgeDays=14`), e `P2HighGlobalCoverage` passou de `30.11` para `30.65` (`maxAgeDays=30`). Os required checks reprovam com folga crescente por mero decurso de prazo.

Este é somente um achado e candidato a frente própria. O ciclo não registra frente nova, não gera evidência substituta e não resolve a recência.

## O que esta evidência não prova

- Não prova que o merge está desbloqueado. Nenhuma tentativa de merge foi executada, a run concluiu `failure` e dois required checks seguem reprovando.
- Não prova que a evidência P3 passou a resultar de execução real. A geração continua declarativa, e `DISCRIMINATE-P3-EVIDENCE-MODE` permanece pendente.
- Não prova staging real, produção nem execução contra provedores de pagamento.
- Não prova que `checkP3EconomyHardening` deixou de aceitar `full`, valor que o contrato não admite em ambiente algum.
- Não prova que runs fora destas três apresentem os mesmos resultados.

## Relação com decisões e correções

O arco demonstra a execução integral da decisão de semântica de bloqueio do [`ADR-004`](../../../../docs/adr/ADR-004-required-check-blocking-semantics.md). A declaração foi alinhada no commit `c4d5db55e117e01986dcd1378f6eb8ded14f40c3`, registrado em [`settlement-provider-mode-2026-08-03.md`](../../corrections/settlement-provider-mode-2026-08-03.md), e o waiver foi removido no commit `a696362d4d3a3ca8f96eeb537f180750105bcf10`, registrado em [`gate-waiver-p3-settlement-removal-2026-08-03.md`](../../corrections/gate-waiver-p3-settlement-removal-2026-08-03.md).

Este artefato não resolve, promove, rebaixa ou reclassifica nenhuma frente. As treze frentes de [`docs/ops/open-fronts.md`](../../../../docs/ops/open-fronts.md) permanecem `pendente`, e PR-01 permanece `Parcial`.
