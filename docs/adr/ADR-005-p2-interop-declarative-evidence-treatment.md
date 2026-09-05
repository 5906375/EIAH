# ADR-005 — Tratamento da evidência declarativa de interop P2

## Status

Proposta

## Data

2026-08-04

## Contexto

Os required status checks `P2AuditInterop`, `P1CriticalChain` e `W4NonRegression` consomem, em graus distintos, artefatos produzidos por um gerador que inspeciona arquivos como texto e fixa assertions sem executar chamadas HTTP. O job `p2_audit_interop` regenera esses artefatos imediatamente antes de verificá-los, reproduzindo a circularidade já registrada para `p3_economy_hardening`: o mesmo mecanismo produz a declaração e verifica os literais declarados. As entradas correspondentes de [`docs/EVIDENCE_INDEX.md`](../EVIDENCE_INDEX.md) afirmam prova de implementação, de trilha executada e de receipt canon.

A leitura posterior mostrou que a trilha declarada se divide em três segmentos com viabilidade distinta. As leituras factuais realizadas em `HEAD` para esta decisão são:

| # | Fato reconfirmado | Fonte lida |
| --- | --- | --- |
| 1 | `generateP2InteropEvidence.ts` lê router, contrato, schema e policy como texto, fixa `ok=true`, status `200`/`202`, receipt, invariant e tier, e grava três artefatos com `YYYY-MM-DD` no nome. | [`scripts/generateP2InteropEvidence.ts:1-124`](../../scripts/generateP2InteropEvidence.ts) |
| 2 | `discovery` e `negotiate` passam por `enforceTenant`, que consulta o bearer token no Postgres e deriva tenant/workspace; ambos consultam `tenantActionPolicy` antes da resposta de sucesso. | [`apps/api/src/middlewares/enforceTenant.ts:58-151`](../../apps/api/src/middlewares/enforceTenant.ts), [`apps/api/src/auth/apiTokenRepository.ts:12-26`](../../apps/api/src/auth/apiTokenRepository.ts) e [`apps/api/src/routes/agents.ts:290-444`](../../apps/api/src/routes/agents.ts) |
| 3 | `execute` usa Postgres para policy, trust, assignment, Run e eventos, publica a Run em BullMQ/Redis e somente depois responde `202`. O `202` prova aceitação na fila, não conclusão da Run. | [`apps/api/src/routes/agents.ts:446-672`](../../apps/api/src/routes/agents.ts) e [`packages/core/src/queue/runQueue.ts:54-157`](../../packages/core/src/queue/runQueue.ts) |
| 4 | O handler registrado para `realestate.apply_adjustment` é um stub fail-closed que retorna `status="error"`, `retryable=false` e o reason code literal `HANDLER_PENDING_PHASE_4_3`. | [`apps/api/src/actions/realestateActions.ts:3-24`](../../apps/api/src/actions/realestateActions.ts) e [`apps/api/src/actions/realestateActions.ts:215-234`](../../apps/api/src/actions/realestateActions.ts) |
| 5 | `agents.interop.contract.test.ts` usa a aplicação HTTP e banco reais para as três rotas, mas, após o `202`, altera a Run para `success` e insere `sclLedger` manualmente antes de consultar o ledger. | [`apps/api/src/tests/agents.interop.contract.test.ts:30-203`](../../apps/api/src/tests/agents.interop.contract.test.ts) |
| 6 | `realestate.high-actions.e2e.test.ts` exercita apenas `discovery` e `negotiate` para as ações HIGH; não chama `execute`. | [`apps/api/src/tests/realestate.high-actions.e2e.test.ts:59-86`](../../apps/api/src/tests/realestate.high-actions.e2e.test.ts) |
| 7 | Nenhum dos dois testes aparece em alvo de `package.json` executado pela CI. A suíte CI é uma lista explícita que não os contém, e `apps/api/package.json` não declara alvo de teste. | [`package.json:12-29,146`](../../package.json), [`apps/api/package.json:4-11`](../../apps/api/package.json) e [`.github/workflows/ci.yml:739-777`](../../.github/workflows/ci.yml) |
| 8 | `ci.yml` não provisiona Postgres ou Redis em job algum. O workflow separado `imob-worker-e2e.yml` provisiona ambos por `services:`, aplica migrations e executa E2E; `ImobWorkerMutationE2E` não aparece na lista congelada dos 20 required checks. | [`.github/workflows/ci.yml:15-1094`](../../.github/workflows/ci.yml), [`.github/workflows/imob-worker-e2e.yml:10-76`](../../.github/workflows/imob-worker-e2e.yml) e [`manifest-ci.json:180-218`](../../ops/evidence/ci/p3-gate-restored-2026-08-04/manifest-ci.json) |
| 9 | `P2AuditInterop` lê os três artefatos; `P1CriticalChain` lê somente o artefato HIGH; `W4NonRegression` não lê campos internos desses artefatos e apenas verifica a existência dos caminhos listados em `evidenceRefs`. | [`scripts/checkP2AuditInterop.ts:131-263`](../../scripts/checkP2AuditInterop.ts), [`scripts/checkP1CriticalChain.ts:45-105`](../../scripts/checkP1CriticalChain.ts) e [`scripts/checkW4NonRegression.ts:27-49,102-105`](../../scripts/checkW4NonRegression.ts) |
| 10 | O índice contém as três afirmações transcritas integralmente abaixo. | [`docs/EVIDENCE_INDEX.md:191-192,243`](../EVIDENCE_INDEX.md) |

> Prova de implementação das rotas `POST /api/agents/discovery|negotiate|execute`.

> Prova da trilha `discovery -> negotiate -> execute -> verify receipt`.

> Contrato/negociação com `tier=HIGH`, `txIdRequired=true` e receipt canon para ações imobiliárias críticas.

A viabilidade descrita nesta decisão é hipótese fundamentada nessas leituras. A leitura estática não prova que as rotas respondem nem que uma futura captura funcionará.

## Princípio decidido

### P4 — Afirmação de evidência não excede o que é executável

Quando um segmento de fluxo não pode ser executado no estado atual do sistema, a evidência não o declara como executado, nem por geração declarativa nem por reconciliação manual em teste. A lacuna é registrada como lacuna.

Este princípio complementa o [P3 do ADR-004](./ADR-004-required-check-blocking-semantics.md), segundo o qual evidência não contradiz contrato versionado. P3 trata da contradição entre declaração e contrato; P4 trata da afirmação operacional sem lastro executável.

## Decisão

### Segmento 1 — `discovery` e `negotiate`

A captura real é considerada viável como hipótese de implementação: as rotas exigem Postgres, há precedente de provisionamento no repositório e existe cobertura HTTP escrita, embora não invocada em CI.

Decisão: substituir a declaração textual por captura de execução real das duas rotas. A implementação deverá observar as respostas HTTP e os campos efetivamente consumidos, sem inferi-los da presença de texto no router.

### Segmento 2 — `execute` até `202`

A captura real também é considerada viável como hipótese de implementação: esse trecho exige Postgres e Redis/BullMQ, mecanismo já usado em `imob-worker-e2e.yml`.

Decisão: substituir a declaração por captura da resposta real até `202`, limitando a afirmação à aceitação da Run na fila. O `202` e o `runId` não declaram execução terminal, sucesso, `txId` ou receipt.

### Segmento 3 — do `202` ao receipt

Esse trecho não é capturável no estado atual para a ação declarada. `realestate.apply_adjustment` termina em stub fail-closed, enquanto o teste existente fabrica o resultado ao alterar a Run e inserir o ledger manualmente.

Decisão: rebaixar, em ciclos próprios, a afirmação do artefato e do índice, registrando que a trilha completa depende da implementação do handler. Nenhuma forma de captura é aceitável enquanto a ação não executar; reconciliação manual não substitui execução.

### Ordem de implementação

A ordem governada é:

1. executar primeiro o tratamento documental do segmento 3, removendo a afirmação falsa de trilha completa e tornando a lacuna explícita;
2. substituir por captura real o segmento 1;
3. substituir por captura real o segmento 2, preservando o significado restrito do `202`.

Na futura captura, a ordem do protocolo permanece segmento 1 antes do segmento 2. A prioridade governada do segmento 3 existe porque somente ele corrige a afirmação falsa atual. Implementar os segmentos 1 e 2 antes dele acrescentaria lastro parcial sem tornar verdadeira a afirmação de trilha completa e daria aparência de rigor ao trecho ainda fabricado.

Este ADR apenas registra essa ordem. Nenhum segmento é executado aqui.

## Motivações

- Preservar coerência entre execução possível, artefato, checker, workflow e Evidence Index.
- Eliminar circularidade nos segmentos que já possuem caminho executável e cobertura HTTP escrita.
- Impedir que aceitação em fila seja apresentada como conclusão da Run ou receipt produzido.
- Tornar explícita a lacuna do handler, em vez de mascará-la por reconciliação manual.
- Registrar a decisão antes da implementação, conforme a disciplina do ADR-004.

## Redução de escopo apurada

`W4NonRegression` não lê campo interno algum dos artefatos de interop. `P1CriticalChain` lê somente `ok`, `actions`, `tierHigh`, `txIdRequired` e `receiptCanonSpec` do artefato HIGH. O trabalho de substituição dos campos operacionais concentra-se em `P2AuditInterop`.

Campos como `containsAction`, `contractVersion`, `negotiate.receiptSpecVersion`, `invariantStatus`, `tenantPolicyGuarded` e `validatedBy` não são lidos por nenhum dos três required checks. O gerador declara mais campos do que os gates consomem, e o índice atribui prova de execução que o gerador não produz.

Campo não consumido por gate não precisa ser capturado. Isso reduz o escopo da captura, mas não autoriza mantê-lo afirmado no índice. Reduzir o que se captura é escopo; reduzir o que se afirma ao lastro real é obrigação.

## Alternativas consideradas

| Alternativa | Motivo do descarte |
| --- | --- |
| Substituir integralmente por captura real, incluindo receipt | O handler é stub; a captura exigiria fabricar o resultado, que é a falha em correção. |
| Manter a geração declarativa e apenas rebaixar índice e artefato | Deixaria dois segmentos executáveis sem lastro quando a captura é viável como hipótese e a cobertura já existe escrita. |
| Rebaixar `P2AuditInterop` a informativo ou removê-lo do ruleset | Contraria P1 e P2 do ADR-004. Alterar o ruleset também não é executável com a credencial congelada, cujos escopos são `gist`, `read:org`, `repo` e `workflow`, sem escopo administrativo. |
| Ligar os testes existentes em CI sem alterar o gerador | Não removeria a circularidade: o job continuaria gerando as assertions e verificando os mesmos literais. |

## Consequências

- Após o tratamento do segmento 3, o artefato e o índice deixarão de afirmar trilha completa; a lacuna de cobertura ficará visível em vez de mascarada.
- Após os segmentos 1 e 2, `p2_audit_interop` deixará de gerar o que verifica quanto aos campos substituídos por captura.
- A captura do segmento 2 provará somente aceitação na fila, sem antecipar estado terminal ou receipt.
- Este ADR não é indexado em [`docs/EVIDENCE_INDEX.md`](../EVIDENCE_INDEX.md), pois não é evidência gerada por execução real, conforme as [seções 8 e 13 de `IA_EIAH.md`](../../IA_EIAH.md) e a decisão do [`ADR-003`](./ADR-003-work-registry-hierarchy.md).
- `docs/adr/` permanece fora da cobertura de `checkDocsLinkIntegrity` e depende de `git add -f`, condição registrada na frente [`RECONCILE-GOVERNANCE-ARTIFACT-VISIBILITY`](../ops/open-fronts.md).
- Nenhuma frente, PR, fase ou status é promovido, rebaixado ou resolvido por esta decisão.

## Escopo não coberto

- O stub `HANDLER_PENDING_PHASE_4_3` e a reconciliação manual em `agents.interop.contract.test.ts` não possuem frente registrada. São candidatos a registro em ciclo próprio; este ADR não cria a frente.
- Os demais geradores declarativos e híbridos do inventário permanecem nas frentes existentes.
- As entradas excedentes do Evidence Index permanecem sob `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`.
- Esta decisão não altera router, middleware, handler, teste, gerador, workflow, package target, contrato, evidência ou índice.
- Nenhuma frente é promovida, rebaixada ou resolvida. As dezesseis permanecem `pendente`; PR-01 permanece `Parcial`.

## Evidências obrigatórias desta decisão

Esta decisão não constitui evidência de execução e não exige entrada no Evidence Index. Suas referências são as fontes versionadas e reconfirmadas na tabela factual deste ADR.

Uma futura implementação dos segmentos 1 e 2 deverá produzir captura com proveniência suficiente e gates independentes do mecanismo produtor. Uma futura revisão do segmento 3 dependerá de handler executável e receipt produzido sem reconciliação manual.

## Riscos

- Executar os segmentos 1 e 2 sem o segmento 3 produziria artefato com lastro parcial e afirmação de trilha completa ainda falsa. A captura real daria aparência de rigor ao trecho fabricado e pioraria a legibilidade do estado.
- Provisionar Postgres e Redis em job required aumentará a superfície de falha por infraestrutura; indisponibilidade de serviço passará a reprovar um required check.
- A leitura estática não prova que as rotas respondem. A viabilidade declarada aqui é hipótese a confirmar durante a implementação.
- Alterações futuras nos campos consumidos podem ampliar novamente o escopo da captura.

## Impacto em P0–P4

- `P0`: reduz drift entre afirmação documental, artefato, checker e execução possível.
- `P1`: preserva a cadeia HIGH consumida por `P1CriticalChain` sem promover status.
- `P2`: decide o tratamento da evidência declarativa de interop, sem executar ou alterar a trilha.
- `P3`: aplica à interop a disciplina de integridade de evidência complementar ao ADR-004.
- `P4`: sem alteração de produto, vertical ou rollout.

## Gatilhos para revisão

- Implementação do handler de `realestate.apply_adjustment`.
- Alteração das rotas de interop ou de `enforceTenant`.
- Obtenção de credencial com escopo administrativo.
- Alteração dos campos consumidos por `P2AuditInterop`.
