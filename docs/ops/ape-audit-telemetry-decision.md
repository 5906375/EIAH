# DECISÃO — Telemetria de auditoria: definições, contrato e ponto de enforcement

> **v1.0 — RATIFICADA.** Incorpora as revisões de 20/08.
>
> Versão: 1.0 · Data: 2026-08-20 · Status normativo: `Proposta`
> Base: `origin/main` = `5c6224afd94517b0dd1e72a94c3b78bf904f467f` · ruleset `13498700` reconfirmado em 20/08 com 18 contexts
> Issues: #396 (P0, aberta desde 27/07) · #395 (P1)
> Destino: comentário na #396 e, após ratificação, `docs/ops/ape-audit-telemetry-decision.md`

---

## 1. Estabelecido

A auditoria de 27/07 provou que `scripts/ci/ape_cycle_weekly.cjs` escreve `auditGap`, `duplicateSideEffects` e `breakGlass` como constantes literais (`:79`, `:128-130`), e os gates leem os números que o próprio gerador inventou. O ciclo foi desligado no mesmo dia (PR #397). O PR3 previsto nunca começou.

**Correção de causalidade (v0.1 estava errada):** o contrato v2 é de 28/07 — posterior à auditoria e aos ciclos viciados — e o gerador **nunca o importa**. Ele não causou o hardcoding histórico; impede uma migração parcial honesta, porque não representa ausência nem cobertura incompleta de medição.

---

## 2. Alcance: três consumidores de telemetria declarativa

### 2.1 `P3EconomyHardening` — autocertificação em segundos

`scripts/generateP3EconomyEvidence.ts:66,84,166` constrói JSON com `duplicateSideEffects: 0` e afirmações sobre testes que **não executa** — cita `sourceTest` sem ler resultado. A CI gera o arquivo e, no mesmo job, o valida em `checkP3EconomyHardening.ts:122,128,154`. Não é evidência velha: é o gate validando um arquivo que o próprio workflow escreveu segundos antes. **Required.**

### 2.2 `W4NonRegression` — o caso mais durável

`w4-non-regression-kpis.json` declara `generatedAt: 2026-03-09`, `duplicateSideEffects: 0`, `hardMetricsGo: true`, `nonRegressionGo: true`. **Nenhum produtor foi localizado no repositório após busca ampla.** `checkW4NonRegression.ts:84-85` apenas lê, sem validar recência, fonte ou receipt. Diferente do APE — que ficou vermelho ao envelhecer e por isso foi descoberto —, este **nunca envelhece**, porque nada checa a data. Cinco meses, sem mecanismo de autocorreção. **Required.**

### 2.3 `P4TrackPRollout` — confirmado

`checkP4TrackPRollout.ts` lê o mesmo KPI estático (`:127-128`), exige `hardMetricsGo=true`, `nonRegressionGo=true`, `duplicateSideEffects=0`, não valida recência nem proveniência, e também lê ciclos APE legados. **Não é required** no ruleset atual, mas compartilha o defeito e entra na mesma correção.

---

## 3. Definições operacionais — ratificar

### 3.1 `auditGap`

> Quantidade de operações governadas que chegaram a estado terminal no período e **não** possuem cadeia de auditoria completa e verificável segundo o catálogo de controles vigente.

A cadeia varia por operação e pode exigir: `tenantId`/`workspaceId`, run, receipt, ledger, source references, digest, `txId`.

**Fonte canônica:** ledger e runtime reconciliados contra o catálogo versionado de operações governadas (Seção 6).

**Não** somar `billingReconciliation.auditGaps` com o shadow IMOB — populações e semânticas distintas. **Breakdowns por domínio** até haver cobertura completa; nenhum agregado sistêmico antes disso.

### 3.2 `duplicateSideEffects`

> Soma dos efeitos de negócio confirmados **além do primeiro**, agrupados pela mesma chave semântica de idempotência, tipo de efeito e escopo operacional.
>
> `Σ max(0, quantidadeDeEfeitosConfirmadosPorGrupo − 1)`

**Não** contam: retry rejeitado; replay bloqueado; tentativa concorrente de aquisição de lease; resposta idempotente sem novo efeito.

Isso desambigua o nome, que hoje cobre dois conceitos incompatíveis — `workerOwnershipLease.test.ts:388-390` mede concorrência de lease, conceito homônimo e estreito, **não** é esta métrica.

`billingReconciliation` já calcula `duplicateChargesCount` a partir do ledger: boa primeira fonte para `billing.duplicateCharges`, mas **não prova duplicidade sistêmica**.

### 3.3 `breakGlass` — remover da telemetria, preservar a distinção

Nenhuma fonte mede esse valor; não há definição de negócio; não consta do schema v2; é lido por um único gate fora da esteira regular de CI.

**Remover:** do gerador (`ape_cycle_weekly.cjs:79,130`); do gate numérico (`checkP3StabilityRecurring.ts:82,96`); do input morto `break_glass_enabled` em `ape-weekly.yml`, hoje exibido ao operador e **não conectado** ao gerador; e como requisito de promoção.

**Preservar** em `release-governance-policy.md` a explicação já reconciliada: o break-glass APE não existe; o critical kill switch é outro mecanismo, que grava só em Redis; uma exceção auditável permanece como modelo não implementado. Apagar todas as menções perderia distinção de governança corretamente documentada.

**Artefatos históricos preservados**, reclassificados — não reescritos.

---

## 4. Enforcement: bloquear a publicação de releases

**"Não existe deploy" não significa "não existe promoção material."** `release.yml` publica pacote NPM e imagens em `ghcr.io` (`eiah-api`, `eiah-workers`), inclusive `latest`. Esse é o ponto real onde artefato sai do repositório para o mundo.

> Enquanto não houver deploy funcional, o gate operacional bloqueia os jobs de publicação de `release.yml` — `publish_cli`, `publish_api_image`, `publish_worker_image` — tanto por tag quanto por `workflow_dispatch`. O gate **não** impede a criação da tag; impede a publicação dos artefatos associados. Na ausência de telemetria v3 válida, recente, completa e ratificada, falha com reason code explícito (`APE_TELEMETRY_NOT_AVAILABLE`). A aprovação dos GitHub Environments permanece como segunda camada humana independente.

Implementação: job `ReleasePromotionTelemetry`, do qual todos os `publish_*` dependem via `needs`.

**Reason codes.** Devem ser registrados no catálogo canônico (`docs/ops/reason-codes-catalog.md`, `packages/core/src/reasons/reasonCatalog.ts`) **antes do uso**, distinguindo ao menos indisponibilidade, recência vencida, cobertura incompleta, receipt inválido e ausência de ratificação:

```text
APE_TELEMETRY_NOT_AVAILABLE
APE_TELEMETRY_STALE
APE_TELEMETRY_COVERAGE_INCOMPLETE
APE_TELEMETRY_RECEIPT_INVALID
APE_TELEMETRY_NOT_RATIFIED
```

Um único código genérico tornaria indistinguíveis "ainda não existe telemetria" e "a telemetria existe e reprovou" — que exigem respostas opostas.

**Blast radius hoje é próximo de zero** — o último deployment registrado em `release-cli` é de 2025-11-11, e nenhum outro Environment de release registrou publicação desde então. Instalar o bloqueio agora custa quase nada e passa a valer automaticamente quando a publicação voltar. É o momento mais barato possível para colocá-lo.

### 4.1 Risco operacional a verificar `[DECIDIR]`

Os Environments `release-api`, `release-cli` e `release-workers` exigem aprovação humana, com **Carlos Alberto Merlo como único reviewer e `prevent_self_review: true`**. Se ele próprio disparar a release, não há aprovador elegível — bloqueio sem saída.

Histórico confirmado: `release-cli` com um deployment em 11/11/2025; `release-api` e `release-workers` com zero. A "segunda camada humana" nunca foi exercitada em dois dos três Environments.

**Decisão: adicionar um segundo reviewer e manter `prevent_self_review: true`.**

Carlos Alberto Merlo permanece autoridade da telemetria via `cycleRatification` (Seção 7.1); o segundo reviewer autoriza apenas a publicação operacional, criando separação de funções. Desativar `prevent_self_review` enfraqueceria essa separação e faria a aprovação de Environment deixar de ser uma camada independente.

Se não houver segundo reviewer disponível no momento, a alternativa é preservar a configuração e fazer o disparo por automação ou outro ator, permitindo que Carlos aprove — o que mantém a separação sem exigir uma segunda pessoa com permissão de escrita.

---

## 5. Contenção: preservar os contexts, trocar a lógica interna

A v0.2 propunha migrar os required contexts. **Descartado.** A alternativa é mais segura:

- manter `P3EconomyHardening` e `W4NonRegression` como required, **com os mesmos nomes**;
- retirar deles as afirmações operacionais sem fonte;
- fazê-los executar testes reais e verificações estruturais;
- mover telemetria para o gate de release/APE da Seção 4.

Vantagens: os zeros declarativos nunca ofereceram proteção real, então não há redução material de segurança; não exige sincronização delicada entre workflow, PR aberto e ruleset; não bloqueia PRs concorrentes que ainda não contenham novos job names.

**Correção técnica:** a API do GitHub atualiza rulesets com `PUT`, não `PATCH`. Onde a v0.2 dizia "mesmo `PATCH`", leia-se "uma única operação de atualização do ruleset". Como não haverá migração de contexts, a questão fica dispensada nesta etapa.

### 5.1 Marcador de fronteira semântica — obrigatório

Manter o nome e trocar o significado cria um risco próprio: quem consultar resultados verdes históricos de `P3EconomyHardening` assumirá continuidade de garantia, e não há nada que sinalize a mudança.

**O PR de contenção registrará, após o merge, seu merge SHA como fronteira semântica.** Os checkers e a evidência do PR deverão declarar: *antes dessa fronteira, o context consumia telemetria declarativa; a partir dela, valida somente estrutura e testes executados.* Sem esse marcador, cria-se um drift mais sutil que o corrigido — mesmo nome, garantia diferente, sem marca.

Adicionalmente: os checkers devem **deixar de ler** os arquivos de KPI e evidência declarativa, não apenas ignorar seus campos. Meia-migração deixa arquivo morto sendo lido por algo.

---

## 6. Catálogo versionado de operações governadas

Pré-requisito de `auditGap`, e **não existe hoje**. É o item de caminho crítico: nenhum agregado sistêmico é possível antes de o catálogo definir o universo esperado.

Deve definir, no mínimo: `operationType`; estados considerados terminais; cadeia de evidência obrigatória; chave semântica de idempotência; fonte canônica; domínio; vigência da regra; política de aplicabilidade.

---

## 7. Contrato `ape.weekly-cycle.v3`

O v2 não representa `NO_GO`, `hardMetricsGo: false`, `hardReasons` não vazio, erro de medição, cobertura parcial, período sem atividade, métrica não aplicável, nem ratificação aprovada ou rejeitada — só `pending`. Um contrato que só sabe representar sucesso não é contrato de auditoria. **Criar v3**, sem mutar o v2 publicado.

### 7.1 Duas estruturas imutáveis, append-only

**`cycleEvidence`** — métricas; cobertura; decisão `GO`/`NO_GO`; fontes e digests; receipt da execução.

**`cycleRatification`** — `cycleReceiptHash`; `approved | rejected`; ator; timestamp; reason code; receipt da ratificação.

Motivo: se a ratificação fizesse parte do mesmo objeto, inicialmente `pending`, mudar para `approved` alteraria o hash e **invalidaria o receipt original**. Separar preserva a evidência produzida pela máquina e torna a ratificação humana um fato append-only sobre ela.

### 7.2 Modelo de métrica

Cada métrica carrega: `measurementStatus` (`measured | not_measured | error`); `coverageStatus` (`complete | partial | no_activity | not_applicable`); `scope` (catálogo versionado); `sampleSize`; fonte, método, janela e `sourceDigest`.

**Aprovação exige:** `measurementStatus = measured` **e** `coverageStatus = complete` **e** `sampleSize > 0` **e** `value` dentro do threshold **e** receipt válido.

> **Zero com nenhuma operação observada não prova recorrência.** É a regra que o modelo anterior não conseguia expressar, e uma das lacunas centrais dele — ao lado do produtor sintético, da ausência de fonte e da autocertificação.

### 7.3 Condição de existência

O v2 nunca foi importado nem validado fora de testes. **Sem produtor e consumidor que imponham sua validação, o contrato permanece órfão e não constitui controle efetivo.** O v3 nasce junto do validador independente, ou não nasce.

---

## 8. Evidence Index — anotar como legado

Existem **39 arquivos** APE históricos; o índice contém **28 referências**, correspondentes a **26 arquivos únicos**. Não é correto afirmar que os 39 estão individualmente indexados — correção sobre a v0.2.

1. Adicionar nota de supersessão na seção APE:

> Os ciclos APE legados permanecem como registro histórico. Não constituem prova de `auditGap`, `duplicateSideEffects` ou `breakGlass` medidos, salvo quando houver proveniência individual demonstrável. Os ciclos #45–#48 foram especificamente invalidados para recorrência pela auditoria de 27/07.

2. Corrigir entradas que afirmam explicitamente "sustentando fechamento operacional de P1" ou "estabilidade atingida".
3. **Não** editar os arquivos históricos.
4. **Não** afirmar que os 39 foram individualmente auditados — a prova específica cobre #45–#48; os demais são não probatórios até validação.

**Correção de referência:** a disciplina do Evidence Index está no item **13** do `IA_EIAH.md`; o item 18 contém as proibições correspondentes. A v0.2 citava apenas o 18.

---

## 9. Consequência prevista

Quando a medição for real, valor diferente de zero é **resultado esperado, não regressão**:

| Gate | Required? | Efeito |
|---|---|---|
| `checkP1ReconciliationRecurring` | não | vermelho se `auditGap ≠ 0` |
| `checkP3StabilityRecurring` | não, e fora da CI regular | idem |
| `checkP3EconomyHardening` | sim | passa a validar estrutura; telemetria sai |
| `checkW4NonRegression` | sim | idem |
| `checkP4TrackPRollout` | não | idem |
| `ReleasePromotionTelemetry` | novo | `NOT_MEASURED` bloqueia publicação |

**O primeiro ciclo honesto pode ser `NO_GO`, e isso é aceitável** — é o sistema funcionando pela primeira vez. Previsto por escrito para não ser lido como quebra e revertido.

---

## 10. Sequência

1. Ratificar esta decisão e publicá-la na #396.
2. **PR de contenção:** preservar os contexts required; transformar `P3EconomyHardening`, `W4NonRegression` e `P4TrackPRollout` em gates estruturais verdadeiros, com marcador de fronteira (5.1); bloquear publicação em `release.yml` enquanto a telemetria for indisponível.
3. Classificar o histórico no Evidence Index, sem alterar artefatos.
4. Remover `breakGlass` operacional e o input morto, preservando a explicação de governança.
5. Criar catálogo de operações + contrato v3 + validador independente.
6. Implementar coletores por domínio, começando por billing, com receipt bruto independente.
7. Produzir ciclo manual honesto, com ratificação separada. Primeiro `NO_GO` aceitável.
8. Reativar **apenas** o `schedule`.
9. Exigir três ciclos honestos dentro da janela antes de liberar publicação operacional.

---

## 11. Pendências

- `apps/api/src/routes/billing.ts:388` classificado como hardcoded por precaução, sem leitura completa do branch; `:291` é zero por construção; `:802` é `settled.idempotent ? 0 : 0`, código morto disfarçado de condicional. Nenhum dos três alimenta gate — são resposta de API.
- Execução da adição do segundo reviewer nos Environments `release-api`, `release-cli` e `release-workers` (Seção 4.1) — mudança administrativa de plataforma, fora de Git.

---

## 12. Ratificação

> Ratifico as definições da Seção 3, o enforcement e a decisão de reviewers da Seção 4, a contenção da Seção 5, o catálogo da Seção 6, o contrato v3 da Seção 7, a classificação da Seção 8 e a sequência da Seção 10.
>
> — Carlos Alberto Merlo, data: `2026-08-20`

---

## 13. Adendo v1.1 — Applicability, Terminalidade, Zero-cost e `blocked` para P1 Billing v1

> v1.1 · Adendo aditivo a v1.0 (2026-08-20) · Ratificado em 2026-09-03
> Escopo: **P1 Billing v1**, domínio billing, operação de referência = débito de custo de run (`requestId = run:{runId}:debit`)
> Não altera nenhuma seção anterior deste documento (§1–§12) — este adendo é aditivo, não substitutivo.
> Não promove estas decisões para outros domínios (IMOB, LEGAL, MKT, LOGISTICA, ou sistêmico).

### 13.1 P1-A — Applicability

Uma execução é aplicável à população P1 Billing quando sua execução estiver terminal, houver expectativa verificável de efeito financeiro e ela estiver contida na janela de medição declarada. A existência do efeito financeiro observado (`BillingLedger`) **não** é condição de aplicabilidade — isso criaria circularidade entre a condição de terminalidade e a própria métrica sendo medida.

```
execution_terminal = Run.finishedAt IS NOT NULL
effect_expected    = exists(RunUsageBreakdown WHERE runId = run.id)
applicable(run)    = execution_terminal AND effect_expected AND run within measurement window
```

Ausência de `RunUsageBreakdown` → `not_applicable`. Não é `auditGap`. Não é `zero`. Não prova saúde do sistema — apenas remove a execução da população medida.

### 13.2 P1-T — Terminalidade

Para fins de elegibilidade temporal e medição P1 Billing, uma execução é considerada terminal quando `Run.finishedAt IS NOT NULL`. Este predicado é preferido a uma enumeração de valores de `Run.status` porque `finalizeRunRecord` seta `finishedAt` incondicionalmente para qualquer status que finalize a execução, tornando-o o sinal estrutural mais forte disponível — inclusive correto para o valor `awaiting_approval` do enum `Run.status`, nunca escrito por código real.

Terminalidade da execução **não** implica confirmação do efeito financeiro — são dimensões distintas, tratadas separadamente por P1-A/P1-B.

### 13.3 P1-Z — Zero-cost

A existência da cadeia de usage e o valor econômico calculado são dimensões distintas:

- **Ausência** de `RunUsageBreakdown` → ausência de expectativa de efeito (`not_applicable`, §13.1).
- **Existência** de `RunUsageBreakdown` cuja soma de `amountCents` seja zero → execução aplicável com custo zero legítimo. **Não** pode ser classificada como `missing_breakdown`.

Essas duas situações são hoje colapsadas na mesma condição em `billingReconciliation.ts` (`breakdownCostCents === 0`); este adendo ratifica a semântica correta, sem alterar o código nesta rodada.

### 13.4 P1-B — Semântica de `blocked`

O estado `blocked` é terminal para fins de lifecycle (§13.2) porque encerra a execução e possui `Run.finishedAt`. Sua terminalidade **não** implica automaticamente elegibilidade para `auditGap`.

A ausência de efeito financeiro só constitui `auditGap` quando, cumulativamente:
1. a execução é aplicável (§13.1);
2. havia expectativa verificável de efeito;
3. nenhuma decisão válida de governança impediu legitimamente esse efeito;
4. a cadeia de auditoria obrigatória permanece incompleta.

**`USER_CANCELLED` com uso real incorrido:** o runtime atual (`runWorker.ts` → `deriveRunCostFromBreakdown` → `chargeRun`, condicionado a `derivedCostCents > 0`) considera o efeito financeiro esperado e tenta produzi-lo mesmo após cancelamento pelo usuário. **Este comportamento de runtime prova expectativa e tentativa do efeito — não prova, por si só, autorização independente.** Nenhum gate de política/entitlement (`TenantActionPolicy`, `requireScope`, `entitlement`) foi localizado no caminho `chargeRun → chargeRunFromBreakdown → BillingLedgerService.insertEntry`; a única verificação presente é correspondência de `tenantId`/`workspaceId` (escopo/identidade do run, não decisão de política). A authority aplicável a esse débito permanece a mesma authority que já governa qualquer débito de billing, e não é criada nem substituída pelo fato de o bloqueio ter ocorrido.

**Bloqueio por decisão válida de governança (guardrail/policy):** quando o próprio `blocked` representa a decisão que impede o efeito, a ausência do efeito financeiro correspondente **não** constitui `auditGap`.

**Quando a categoria do bloqueio ou a authority aplicável não puder ser determinada de forma verificável:** `measurementStatus = not_measured/error` — nunca `0`, nunca `auditGap` presumido.

```
IF applicable
AND execution terminal
AND effect expected
AND no valid governance decision legitimately prevented the effect
AND required audit chain incomplete
THEN auditGap += 1
```

### 13.5 Fail-closed (as quatro dimensões)

| Situação desconhecida | Resultado |
|---|---|
| Applicability não determinável | `not_measured`/`error`, nunca `0` |
| Terminalidade não determinável | execução não incluída como terminal, nunca declarada `0` |
| Zero-cost não distinguível de ausência de breakdown | `not_measured` para esse run, nunca `missing_breakdown=0` como verdade |
| Categoria/authority de `blocked` não determinável | `not_measured`/`error`, nunca `0` nem `auditGap` presumido |

`auditGap = 0` só é uma afirmação válida quando `sampleSize > 0 AND measurementStatus = measured AND coverageStatus = complete` e a cadeia obrigatória foi de fato checada — consistente com §7.2 deste documento.

### 13.6 Compatibilidade com `duplicateSideEffects`

Este adendo não altera a fórmula de `duplicateSideEffects` (§3.2) nem introduz conflito com ela — as decisões P1-A/T/Z/B tratam exclusivamente de população e terminalidade para `auditGap`; `duplicateSideEffects` opera sobre efeitos já observados.

### 13.7 Escopo e não-implementação

```
scope: P1 Billing v1 — domínio billing, operação de referência = débito de custo de run
system_wide_applicability: NAO
```

Este adendo é uma decisão normativa. Ele **não**: cria o catálogo de operações governadas; altera `billingReconciliation.ts`; corrige a fórmula de `duplicateChargesCount`; adiciona constraint a `BillingLedger`; cria `ape.weekly-cycle.v3`; altera o gerador P1; reativa o schedule de `ape-weekly.yml`. Essas permanecem etapas futuras, condicionadas a esta ratificação.

### 13.8 Ratificação

> Ratifico as definições de applicability (§13.1), terminalidade (§13.2), zero-cost (§13.3) e a semântica de `blocked` (§13.4) para P1 Billing v1, incluindo a ressalva expressa de que tentativa de efeito pelo runtime não constitui prova independente de authority, e o comportamento fail-closed da Seção 13.5.
>
> — Carlos Alberto Merlo, data: `2026-09-03`
