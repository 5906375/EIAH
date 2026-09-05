# ADR-006 — Detecção de circularidade estrutural entre geradores e checks

## Status

Proposta

## Data

2026-08-04

## Contexto

Jobs de CI executam geradores de evidência e, em seguida, checks que leem os artefatos recém-produzidos. Nessa estrutura, o gate verifica a resposta que o próprio job acabou de escrever. Os casos tratados até aqui — P3 settlement e receipt de P2 interop — foram encontrados individualmente por leitura; nenhum controle estrutural os detectava.

O [`ADR-003`](./ADR-003-work-registry-hierarchy.md) já inclui a não-circularidade de geradores entre as seis propriedades do critério de encerramento do objetivo e exige check com teste negativo para cada propriedade. Os princípios existentes tratam a correção do gate e o limite das afirmações, mas não a condição que permite ao produtor preparar a própria entrada imediatamente antes da validação.

As leituras factuais realizadas em `HEAD` para esta decisão são:

| # | Fato reconfirmado | Fonte lida |
| --- | --- | --- |
| 1 | Há cinco cruzamentos estruturais em `ci.yml`, detalhados na tabela seguinte: em todos, o step gerador precede o step do check que lê os artefatos escritos. | [`ci.yml:834-861,973-1042`](../../.github/workflows/ci.yml), [`generateP2InteropEvidence.ts:4-13,41-124`](../../scripts/generateP2InteropEvidence.ts), [`checkP2AuditInterop.ts:131-162`](../../scripts/checkP2AuditInterop.ts), [`generateP3EconomyEvidence.ts:229-301`](../../scripts/generateP3EconomyEvidence.ts), [`checkP3EvidenceRecency.ts:4-61`](../../scripts/checkP3EvidenceRecency.ts), [`checkP3EconomyHardening.ts:43-79`](../../scripts/checkP3EconomyHardening.ts) e [`checkP3SettlementSupportByEnv.ts:225-228`](../../scripts/checkP3SettlementSupportByEnv.ts) |
| 2 | `P2AuditInterop`, `P3EconomyHardening` e `P3SettlementSupportByEnv` constam entre os 20 required status checks do snapshot versionado. | [`manifest-ci.json:186-216`](../../ops/evidence/ci/p3-gate-restored-2026-08-04/manifest-ci.json) |
| 3 | `generate:e2e-high-manifest` faz captura HTTP contra staging: exige URL, token, tenant e workspace, cria runs, espera estado terminal, consulta ledger e bundle e grava resultados observados. A leitura estática não prova que a captura funciona em execução. | [`generate_e2e_high_manifest.ts:27-40,46-83,90-147,178-237,244-313`](../../scripts/generate_e2e_high_manifest.ts) e [`package.json:127`](../../package.json) |
| 4 | `e2e-high-staging.yml` executa `generate:e2e-high-manifest` e depois `check:e2e-recency` no mesmo job. | [`e2e-high-staging.yml:18-51`](../../.github/workflows/e2e-high-staging.yml) |
| 5 | `p2-high-global-coverage.json` é escrito pelo alvo `generate:p2-high-global-coverage`, não invocado em `ci.yml`, enquanto `P2HighGlobalCoverage` apenas o lê. Os artefatos APE são escritos por `ape:cycle:weekly` no workflow APE e lidos por `P1ReconciliationRecurring` em `ci.yml`; portanto, ambos escapam da regra de regeneração no mesmo job de CI. | [`generateP2HighGlobalCoverage.ts:4-11,112-130`](../../scripts/generateP2HighGlobalCoverage.ts), [`ci.yml:863-893,921-945`](../../.github/workflows/ci.yml), [`ape-weekly.yml:31-67`](../../.github/workflows/ape-weekly.yml), [`ape_cycle_weekly.cjs:105-161`](../../scripts/ci/ape_cycle_weekly.cjs) e [`checkP1ReconciliationRecurring.ts:38-88`](../../scripts/checkP1ReconciliationRecurring.ts) |
| 6 | `check:orphan-tests:unit` encadeia três suítes e `check:gate-waiver-expiry` por `&&`, e `ci.yml` executa todo o alvo em um único step. | [`package.json:42-43`](../../package.json) e [`ci.yml:581-611`](../../.github/workflows/ci.yml) |
| 7 | A busca literal por `evidenceGrade` e `evidenceMode` nos 519 arquivos versionados sob `ops/evidence/`, `docs/ops/evidence/` e `artifacts/` retornou zero ocorrência. A revisão dos schemas e payloads não encontrou taxonomia geral equivalente; `mode` nos artefatos P3 descreve modo de provider, não grau ou proveniência da evidência. | [`generateP3EconomyEvidence.ts:29-35,40-70`](../../scripts/generateP3EconomyEvidence.ts) e [`checkP3SettlementSupportByEnv.ts:20-22,254-257`](../../scripts/checkP3SettlementSupportByEnv.ts) |
| 8 | O PR-07 propõe `evidenceGrade` com sete valores, restrito ao Receipt Canon, como campo aditivo e sem enforcement. | [`plano de PRs:624-660`](../ops/plano-prs-environment-settlement-pou-2026-07-31.md) |
| 9 | O contrato contém `"waivers": []`. O checker implementa os estados `GATE_WAIVER_UNDECLARED`, `GATE_WAIVER_ACTIVE`, `GATE_WAIVER_EXPIRED` e `GATE_WAIVER_STALE`; o percurso já registrou uma inconsistência detectada pelo último estado após a execução da ordem decidida no ADR-004. | [`gate-waivers.v1.json:1-4`](../../ops/contracts/gate-waivers.v1.json), [`checkGateWaiverExpiry.ts:271-320`](../../scripts/checkGateWaiverExpiry.ts) e [`registro da remoção:25-43`](../../ops/evidence/corrections/gate-waiver-p3-settlement-removal-2026-08-03.md) |

Os cinco cruzamentos do fato 1 são:

| Job | Alvo gerador | Alvo check | Artefatos cruzados | Required no snapshot |
| --- | --- | --- | --- | --- |
| `P2AuditInterop` | `generate:p2-interop-evidence` | `check:p2-audit-interop` | `interop-routes-smoke-YYYY-MM-DD.json`, `interop-e2e-agent-call-YYYY-MM-DD.json`, `realestate-high-actions-e2e-YYYY-MM-DD.json` | sim |
| `P3EconomyHardening` | `generate:p3-economy-evidence` | `check:p3-evidence-recency` | os sete padrões P3: settlement provider, billing webhook replay, dispute lifecycle, reputation update, commission settlement, payment intent schema e PoU-gated payment | sim |
| `P3EconomyHardening` | `generate:p3-economy-evidence` | `check:p3-economy-hardening` | settlement provider, billing webhook replay, dispute lifecycle, reputation update e commission settlement | sim |
| `P3SettlementSupportByEnv` | `generate:p3-economy-evidence` | `check:p3-evidence-recency` | os mesmos sete padrões P3 | sim |
| `P3SettlementSupportByEnv` | `generate:p3-economy-evidence` | `check:p3-settlement-support-by-env` | `settlement-provider-e2e-YYYY-MM-DD.json` | sim |

Expandidos por artefato, esses cruzamentos representam 23 relações artefato–check. Esta contagem descreve estrutura, não determina se cada produtor é declarativo, híbrido ou capturado.

### Por que a detecção semântica foi descartada

A classificação do inventário de 28 produtores exigiu leitura humana. Não há critério sintático simples que separe produtores capturados, híbridos e declarativos. `ape_cycle_weekly.cjs`, por exemplo, executa 15 checks reais e também fixa `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`; `generateP2InteropEvidence.ts` lê arquivos reais, mas fixa assertions e resultados sem executar a trilha afirmada. Procurar `spawn`, `fetch`, leitura de arquivo, `ok: true` ou valores constantes não decide a natureza da evidência.

Essa distinção não é decidível com confiabilidade por análise estática geral. Já a relação estrutural — produtor escreve X, check lê X, ambos no mesmo job e nessa ordem — é extraível com contrato delimitado.

## Princípio decidido

### P5 — Gate não verifica artefato que o próprio job produziu

Um check não deve validar artefato escrito por um gerador executado no mesmo job antes dele, salvo exceção declarada, datada, justificada e aprovada. Onde a estrutura for necessária — captura real seguida de validação —, a necessidade é registrada, não presumida.

P5 complementa o [P2 do ADR-004](./ADR-004-required-check-blocking-semantics.md), segundo o qual gate que reprova é presumido correto, e o [P4 do ADR-005](./ADR-005-p2-interop-declarative-evidence-treatment.md), segundo o qual a afirmação de evidência não excede o que é executável. P2 orienta o tratamento da reprovação; P4 limita o que pode ser afirmado; P5 trata a condição estrutural que pode impedir o gate de reprovar ao fornecer-lhe uma entrada recém-produzida pelo próprio job.

## Decisão

Adotar a detecção de circularidade estrutural como controle. A implementação futura deve ter contrato explícito que delimite, no mínimo:

1. as raízes de artefatos governados, definindo quais diretórios entram no cruzamento;
2. a sintaxe shell suportada, incluindo comandos multilinha e encadeamento por `&&`;
3. a expansão recursiva de alvos de `package.json`, com conjunto de visitados e detecção de ciclo entre alvos;
4. o cruzamento entre caminho literal, template com data e padrão ou glob consumido pelo check;
5. os workflows abrangidos, sem presumir que todo arquivo sob `.github/workflows/` tenha a mesma função de governança;
6. o tratamento de caminhos dinâmicos: quando a extração não determinar o destino, o resultado deve ser diagnóstico explícito conforme o contrato, nunca aceitação silenciosa;
7. um mecanismo de exceção disponível antes de qualquer enforcement bloqueante.

A implementação e o teste negativo desse controle exigem ciclo próprio. A viabilidade aqui registrada é conclusão de leitura estática; ela não prova que o futuro check extrairá os mapeamentos corretamente, detectará uma regressão ou funcionará em execução.

### Mecanismo de exceção

As exceções reutilizarão a forma e o mecanismo versionado de `gate-waivers.v1.json`; não será criado contrato paralelo. Cada exceção estrutural deverá identificar nominalmente o par gerador–check e o artefato ou padrão, além de registrar motivo, data de concessão, prazo, frente de restauração e aprovação nominal. A evolução necessária deverá ocorrer no único mecanismo de waivers e no checker correspondente, preservando validação de forma, unicidade, datas e estado.

Essa escolha reaproveita campos já existentes — `gateId`, `workflow`, `jobId`, `reason`, `grantedAt`, `expiresAt`, `restoreFront` e `approvedBy` — e um checker que distingue waiver não declarado, ativo, expirado e obsoleto. O percurso demonstrou a utilidade do mecanismo quando `GATE_WAIVER_STALE` detectou o waiver remanescente após a remoção da supressão executada na sequência do ADR-004. Reutilizar o mecanismo evita duas fontes de verdade para exceções temporárias.

### Detecção semântica e declaração de modo

A detecção semântica da natureza do produtor não é adotada porque não é decidível estaticamente com confiabilidade suficiente para gate. O controle não tentará inferir se um script é capturado, híbrido ou declarativo.

Uma declaração obrigatória de modo, como `evidenceGrade` ou `evidenceMode`, também não substitui a detecção estrutural. Ela é autodeclaração: não impede valor falso, não comprova captura e não detecta sobrescrita circular imediatamente antes do check.

Uma declaração de modo pode complementar o controle, subordinada ao PR-07 do plano versionado. Esse PR limita `evidenceGrade` ao Receipt Canon, como campo aditivo e sem enforcement. Generalizar a taxonomia para todos os artefatos excederia o PR-07 e exigiria decisão própria; este ADR não a toma.

### Consequência para enforcement

Se o controle se tornar bloqueante, os cinco cruzamentos atuais reprovarão quando o check entrar ou exigirão exceções nominais com saída escrita. As duas opções são:

1. remover a condição estrutural de cada par antes do bloqueio; ou
2. registrar exceção temporária, justificada e aprovada, antes do bloqueio.

O ADR-004 estabeleceu, para P3 settlement, correção da causa antes da restauração do bloqueio, evitando travar o pipeline a partir de uma declaração sabidamente falsa. O mesmo ordenamento é o precedente prudente para este controle: não ligar enforcement bloqueante antes de corrigir os pares ou registrar suas exceções. Entretanto, o owner não escolheu neste ciclo qual tratamento cabe a cada cruzamento atual. Essa escolha permanece pendente e não é presumida por esta decisão. Até seu registro, o ADR não autoriza enforcement bloqueante.

## Motivações

- Tornar verificável a propriedade de não-circularidade já exigida pelo ADR-003.
- Detectar a relação estrutural sem prometer uma classificação semântica que o repositório não permite decidir estaticamente.
- Impedir aceitação silenciosa de caminhos dinâmicos ou de sintaxe shell não compreendida.
- Reutilizar governança temporal e aprovação nominal já existentes para exceções.
- Registrar a decisão e seus limites antes da implementação.

## Alternativas consideradas

| Alternativa | Motivo do descarte |
| --- | --- |
| Detecção semântica | Não há sintaxe simples que decida se um produtor capturou, inferiu ou fixou o resultado; produtores híbridos combinam essas naturezas. Produziria confiança indevida em classificação heurística. |
| Declaração de modo isolada | É autodeclaração, não prova captura, não impede modo falso e não detecta sobrescrita circular. O PR-07 também é restrito ao Receipt Canon e não contém enforcement. |
| Auditoria manual periódica | Foi o mecanismo que encontrou os casos atuais, mas não impede recorrência entre auditorias e não fornece teste negativo bloqueante. |
| Não fazer nada | Deixaria sem controle uma das seis propriedades do critério de encerramento do objetivo e preservaria o mecanismo que permitiu os casos já observados. |

## Consequências

- Uma futura implementação deverá tornar explícitos raízes, parser shell, expansão de alvos, casamento de padrões, workflows, caminhos dinâmicos e exceções.
- Captura real seguida de validação no mesmo job será acusada estruturalmente e precisará de exceção fundamentada; sua legitimidade não será inferida pelo nome do gerador.
- Nenhum checker, workflow, gerador, contrato, artefato ou exceção é criado ou alterado por este ADR.
- Este ADR não é indexado em [`docs/EVIDENCE_INDEX.md`](../EVIDENCE_INDEX.md), pois é decisão e não evidência de execução real, conforme as [seções 8 e 13 de `IA_EIAH.md`](../../IA_EIAH.md) e o ADR-003.
- `docs/adr/` permanece fora da cobertura de `checkDocsLinkIntegrity`; os links deste arquivo dependem de conferência manual.
- Nenhuma frente, PR, fase ou status é promovido, rebaixado, reclassificado ou resolvido. As dezesseis frentes permanecem `pendente`; PR-01 permanece `Parcial`.

## Alcance não coberto

- Circularidade distribuída: gerador e check em jobs ou workflows diferentes, com o artefato commitado entre eles, não é detectada.
- Geração declarativa sem regeneração no mesmo job: `p2-high-global-coverage.json` e os artefatos de `ape:cycle:weekly` escapam da regra e permanecem nas frentes existentes.
- Captura real seguida de validação é estruturalmente idêntica à circularidade e depende de exceção fundamentada, sob pena de falso positivo.
- Artefato gerado uma vez e lido indefinidamente por referência literal histórica não é detectado.
- O controle não determina a natureza do produtor, não prova proveniência e não substitui teste negativo.
- A decisão não resolve nem promove `DISCRIMINATE-P3-EVIDENCE-MODE`, `RESOLVE-RECENCY-GATE-DECAY` ou `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE`.
- A detecção estática não demonstra comportamento real de staging, produção, providers, jobs ou plataforma de merge.

## Evidências obrigatórias desta decisão

Esta decisão não constitui evidência de execução e não exige entrada no Evidence Index. Suas referências são as fontes versionadas e reconfirmadas no contexto.

Uma implementação futura deverá incluir teste negativo que demonstre a reprovação de um caso circular conhecido, além de testes de caminhos literais, templates com data, padrões, `&&`, expansão recursiva e ciclo entre alvos. Sem teste negativo, a existência nominal do check não prova que ele bloqueia a condição.

## Riscos

- Captura real pode ser reprovada como falso positivo e bloquear trabalho legítimo se o mecanismo de exceção não existir antes do enforcement.
- Contrato mal delimitado pode produzir gate que promete detectar circularidade e não detecta, repetindo a classe de falha denominada check nominal pela auditoria.
- Um controle novo em required check aumenta a superfície de falha do pipeline.
- Gate sem teste negativo não prova que reprova; o ADR-003 exige teste negativo para cada uma das seis propriedades.
- Exceções amplas, sem prazo ou sem frente de restauração podem normalizar a circularidade em vez de governá-la.

## Impacto em P0–P4

- `P0`: reduz a possibilidade de drift silencioso entre produção e validação de artefato governado, sem implementar enforcement.
- `P1`: preserva a disciplina de required checks e exceções nominais, sem alterar sua execução.
- `P2`: cobre estruturalmente os artefatos de interop no mesmo job, sem resolver a frente P2 nem executar as rotas.
- `P3`: cobre estruturalmente os cruzamentos de economy e settlement, sem determinar o modo ou a proveniência da evidência.
- `P4`: sem alteração de produto, rollout ou vertical.

## Gatilhos para revisão

- Alteração da estrutura dos jobs ou da sintaxe dos steps de workflow.
- Adoção de `evidenceGrade` ou de taxonomia equivalente fora do escopo aditivo do PR-07.
- Implementação de captura real nos segmentos 1 e 2 do ADR-005.
- Obtenção de credencial com escopo administrativo, que permita avaliar a entrada do controle no ruleset required.
- Decisão registrada do owner sobre correção ou exceção para cada cruzamento atual.
