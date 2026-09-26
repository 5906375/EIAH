# ADR-004 — Semântica de bloqueio para required status checks

## Status

Proposta

## Data

2026-08-03

## Contexto

A [evidência congelada no commit `be35beb`](../../ops/evidence/ci/p3-settlement-env-gate-2026-08-03/p3-settlement-env-gate-ci-evidence-2026-08-03.md) registra duas runs nas quais o check `check:p3-settlement-support-by-env`, seu step e o job `P3SettlementSupportByEnv` concluíram `failure`, enquanto as runs concluíram `success`. O artefato também registra que, na consulta de 2026-08-03, o job constava entre os 20 required status checks do ruleset ativo. O efeito prático sobre merge não foi verificado, pois nenhuma tentativa de merge foi executada.

A causa imediata da conclusão `success` das runs é `continue-on-error: true` no job. A causa raiz é anterior: a evidência de economy declara `stripe=full`, embora o [contrato versionado](../../ops/contracts/settlement-provider-support-matrix.v1.json) admita somente `simulated` para `stripe`, `crypto` e `bank` em `dev`, `staging` e `production`, sem registrar `providerAdapters`. O check está correto ao rejeitar a divergência; a declaração é que é falsa.

As leituras factuais realizadas em `HEAD` para esta decisão são:

| Fato | Fonte reconfirmada |
| --- | --- |
| A matriz declara `["simulated"]` para `stripe`, `crypto` e `bank` nos três ambientes e nenhum ambiente admite `full`. | [`ops/contracts/settlement-provider-support-matrix.v1.json:4-20`](../../ops/contracts/settlement-provider-support-matrix.v1.json) |
| A matriz não contém a chave `providerAdapters`. | [`ops/contracts/settlement-provider-support-matrix.v1.json:1-21`](../../ops/contracts/settlement-provider-support-matrix.v1.json) |
| O checker exige `providerAdapters.<provider>.module` quando a matriz anuncia `full` ou `live`, exige arquivo versionado com resolução não ambígua e recusa resolução, import ou reexport do stub local. | [`scripts/checkP3SettlementSupportByEnv.ts:11-18,60-61,98-206`](../../scripts/checkP3SettlementSupportByEnv.ts) |
| O gerador emite o literal `{ id: "stripe", mode: "full" }` numa função que retorna `ok: true` sem executar teste. | [`scripts/generateP3EconomyEvidence.ts:37-71`](../../scripts/generateP3EconomyEvidence.ts) |
| O gate geral de economy aceita indistintamente `full` e `simulated` como modos válidos. | [`scripts/checkP3EconomyHardening.ts:96-114`](../../scripts/checkP3EconomyHardening.ts) |
| O workflow contém `continue-on-error: true` em exatamente dois jobs: `imob_frontdoor_mobile_smoke_informative` e `P3SettlementSupportByEnv`. | [`.github/workflows/ci.yml:353-356,1005-1013`](../../.github/workflows/ci.yml) |
| Entre as ocorrências semanticamente relacionadas a modo `full` em `scripts/` e `ops/`, somente `generateP3EconomyEvidence.ts:47` o emite em código como declaração de modo de provider. As demais são lógica de checker/teste ou registros e artefatos de evidência versionados; ocorrências homônimas em identificadores, CSS e TLS não declaram modo de provider. | [`scripts/generateP3EconomyEvidence.ts:40-50`](../../scripts/generateP3EconomyEvidence.ts), [`ops/evidence/latest/settlement-provider-e2e-2026-07-27.json:1-18`](../../ops/evidence/latest/settlement-provider-e2e-2026-07-27.json) e [evidência congelada, linhas 16-34](../../ops/evidence/ci/p3-settlement-env-gate-2026-08-03/p3-settlement-env-gate-ci-evidence-2026-08-03.md) |

## Princípios decididos

### P1 — Required check não é suprimível

Um check listado como required no ruleset não pode ter seu resultado suprimido no workflow. Se um check deve ser informativo, ele não é required. Qual dos dois estados vale deve ser objeto de decisão registrada, nunca consequência implícita de configurações contraditórias.

### P2 — Gate que reprova é presumido correto

Quando um gate reprova, a primeira hipótese a testar é a de que ele está certo. Suprimir o resultado trata o sintoma como ruído e destrói a informação que o gate existe para produzir.

### P3 — Evidência não contradiz contrato versionado

Nenhum artefato de evidência pode declarar propriedade incompatível com contrato versionado do repositório. Em caso de divergência, o contrato prevalece e a evidência deve ser corrigida. O inverso somente é admissível por alteração explícita e registrada do contrato.

## Decisão

A declaração será alinhada ao contrato antes de ser restaurado o efeito de bloqueio, em três etapas separadas:

1. Registrar este ADR, sem alteração de código.
2. Alinhar `scripts/generateP3EconomyEvidence.ts` ao contrato `ops/contracts/settlement-provider-support-matrix.v1.json`, para que a evidência deixe de declarar modo não admitido. Após essa etapa, `check:p3-settlement-support-by-env` deve passar por mérito, não por supressão.
3. Remover `continue-on-error` do job `P3SettlementSupportByEnv` em `.github/workflows/ci.yml`, restaurando a semântica de bloqueio prevista para um required check.

Este ADR executa somente a primeira etapa. As etapas 2 e 3 exigem ciclos próprios, com seus respectivos diffs, gates e evidências.

### Justificativa da ordem

Inverter as etapas 2 e 3 faria o job requerido reprovar em todo PR para `main` enquanto a declaração falsa permanecesse. Pela semântica decidida, isso criaria a condição de bloqueio pretendida para um required check, mas a partir de uma declaração sabidamente incompatível com o contrato. Nenhuma tentativa real de merge foi executada, portanto o efeito prático da plataforma sobre merge não é afirmado por este ADR.

A ordem adotada elimina esse período de falha total do pipeline obrigatório e permite que a etapa 3 seja acompanhada por evidência de execução de que o check passa por mérito, em vez de mera expectativa.

## Motivações

- Preservar coerência entre contrato, evidência, checker, workflow e ruleset.
- Tratar a causa antes de restaurar o efeito bloqueante.
- Impedir que configuração de workflow rebaixe silenciosamente um controle requerido.
- Registrar a decisão antes de qualquer implementação.

## Alternativas consideradas

| Alternativa | Motivo do descarte |
| --- | --- |
| Remover `continue-on-error` isoladamente | Faria o job reprovar em todo PR para `main` enquanto a declaração falsa permanecesse. Trata o efeito e preserva a causa. |
| Manter `continue-on-error` e remover o check de required no ruleset | Contraria P1 e P2 ao rebaixar o controle. Também não é executável com a credencial congelada em `be35beb`, cujos escopos são `gist`, `read:org`, `repo` e `workflow`, sem escopo administrativo. |
| Separar check informativo de check obrigatório | Tem a mesma restrição de credencial para alterar o ruleset. Não existe evidência de que o check precise ser informativo: ele detecta corretamente uma declaração falsa. |
| Criar gate novo bloqueante para `supported-by-env` | Duplicaria um controle existente e funcional, criando fonte paralela. Também exigiria alterar o ruleset. |

## Consequências

- Após a etapa 3, uma evidência que declare modo não admitido pelo contrato produzirá falha não suprimida de um required check. Impedir merge em `main` é a semântica pretendida; a efetividade prática deverá ser demonstrada por execução própria, sem ser antecipada como fato histórico.
- Este ADR não é indexado em [`docs/EVIDENCE_INDEX.md`](../EVIDENCE_INDEX.md), pois não é evidência gerada por execução real, conforme as [seções 8 e 13 de `IA_EIAH.md`](../../IA_EIAH.md). `ADR-001` está indexado na linha 90 do índice em `HEAD`; esse precedente diverge da norma e permanece objeto da frente `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`, conforme a decisão já registrada em [`ADR-003`](./ADR-003-work-registry-hierarchy.md).
- `docs/adr/` permanece fora da cobertura de `scripts/checkDocsLinkIntegrity.ts`, limitada aos arquivos de instrução da raiz e a `docs/architecture/*.md`. Os links deste ADR devem ser conferidos manualmente.
- Nenhuma frente, PR, fase ou status é promovido, rebaixado ou resolvido. As treze frentes permanecem `pendente`, e PR-01 permanece `Parcial`.

## Escopo não coberto

- `scripts/checkP3EconomyHardening.ts` aceita `full` como modo válido, embora o contrato não o admita em nenhum ambiente. Esse gate bloqueante admite valor fora do contrato. O tema pertence à frente `DISCRIMINATE-P3-EVIDENCE-MODE` e ao PR-05; as três etapas desta decisão não o corrigem.
- A geração estática de evidência permanece na frente 8: o gerador produz artefato declarativo sem executar os testes que cita. Alinhar o modo ao contrato torna a declaração verdadeira quanto ao modo, mas não a torna resultado de execução.
- Nenhuma das etapas altera ou demonstra comportamento real de staging, produção ou providers.
- Nenhuma frente é promovida, rebaixada ou resolvida por este ADR.

## Evidências obrigatórias desta decisão

Esta decisão não constitui evidência de execução e não exige entrada no Evidence Index. Suas fontes são a evidência congelada em `be35beb`, o contrato versionado e as leituras factuais registradas no contexto.

## Riscos

- Se a etapa 2 for executada e a etapa 3 não, o gate voltará a passar enquanto `continue-on-error` permanecerá. Esse estado aparentemente saudável manteria o controle suprimido e removeria o sinal de alerta. As etapas 2 e 3 formam um par; executar somente a etapa 2 é pior do que não executar nenhuma das duas.
- Após a etapa 3, qualquer regressão na declaração de modo produzirá falha não suprimida do required check. O bloqueio de merge é o efeito normativo pretendido e precisa ser compreendido por quem opera a branch; sua efetividade deverá ser evidenciada sem inferência a partir das runs já congeladas.

## Impacto em P0–P4

- `P0`: reduz drift entre contrato, evidência e configuração de CI sem promover status.
- `P1`: explicita semântica fail-closed para required checks.
- `P2`: sem alteração de interop, receipt, ledger ou runtime.
- `P3`: decide a ordem de correção da declaração de settlement e da restauração do gate.
- `P4`: sem alteração de produto ou rollout.

## Gatilhos para revisão

- Alteração de `ops/contracts/settlement-provider-support-matrix.v1.json`.
- Registro de `providerAdapters` para algum provider.
- Obtenção de credencial com escopo administrativo, que reabriria a viabilidade operacional das alternativas descartadas por essa restrição, sem revogar automaticamente P1 ou P2.
- Resolução da frente 8, `DISCRIMINATE-P3-EVIDENCE-MODE`.
