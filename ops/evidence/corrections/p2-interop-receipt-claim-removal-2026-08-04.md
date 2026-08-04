# Correção da afirmação de receipt na evidência de interop P2

- **Data:** 2026-08-04
- **Status:** `Proposta`
- **Artefatos corrigidos:** [`interop-e2e-agent-call-2026-06-17.json`](../latest/interop-e2e-agent-call-2026-06-17.json) e [`realestate-high-actions-e2e-2026-06-17.json`](../latest/realestate-high-actions-e2e-2026-06-17.json)

## O que foi removido

Em [`scripts/generateP2InteropEvidence.ts`](../../../scripts/generateP2InteropEvidence.ts) e no artefato corrente `interop-e2e-agent-call-2026-06-17.json`, foram removidos:

- `flow[]`: `"agentB -> verify receipt"`;
- `assertions.verifyReceipt.status`: `200`;
- `assertions.verifyReceipt.invariantStatus`: `"ok"`;
- `assertions.verifyReceipt.receiptCanonSpecVersion`: `"receipt.canon.v1"`;
- o objeto `assertions.verifyReceipt` que continha esses três campos.

No mesmo gerador e no artefato corrente `realestate-high-actions-e2e-2026-06-17.json`, foi removido `assertions.receiptCanonSpec: "receipt.canon.v1"`.

No gerador e no artefato corrente da cadeia foi acrescentado `executionGap`, com a forma:

```json
{
  "flowEndsAt": "execute_accepted_in_queue",
  "blockedSegment": "execute_202_to_receipt",
  "status": "handler_not_implemented",
  "reasonCode": "HANDLER_PENDING_PHASE_4_3"
}
```

O campo declara que a trilha termina na aceitação em fila e que o segmento entre o `202` e o receipt depende de handler não implementado. `date: "2026-06-17"` foi preservado em ambos os artefatos; nenhum deles contém `generatedAt`.

Em [`scripts/checkP2AuditInterop.ts`](../../../scripts/checkP2AuditInterop.ts), foram removidas as exigências `verifyReceipt.status === 200`, `verifyReceipt.receiptCanonSpecVersion === "receipt.canon.v1"` e `highActions.assertions.receiptCanonSpec === "receipt.canon.v1"`. Em [`scripts/checkP1CriticalChain.ts`](../../../scripts/checkP1CriticalChain.ts), foi removida a exigência `highActions.assertions.receiptCanonSpec === "receipt.canon.v1"`. As demais verificações foram preservadas, inclusive a recência no checker P2.

## Alterações no Evidence Index

Texto anterior da entrada da cadeia interop:

> Prova da trilha `discovery -> negotiate -> execute -> verify receipt`.

Texto novo:

> Declara a trilha `discovery -> negotiate -> execute` até a aceitação na fila, derivada de inspeção textual; não prova execução HTTP nem receipt.

Texto anterior da entrada de ações HIGH:

> Contrato/negociação com `tier=HIGH`, `txIdRequired=true` e receipt canon para ações imobiliárias críticas.

Texto novo:

> Declara contrato/negociação com `tier=HIGH` e `txIdRequired=true` para ações imobiliárias críticas; não prova execução terminal nem receipt.

As entradas foram preservadas. Nenhuma entrada não afetada foi alterada.

## Fundamento

O [segmento 3 e o princípio P4 do ADR-005](../../../docs/adr/ADR-005-p2-interop-declarative-evidence-treatment.md) estabelecem que afirmação de evidência não excede o que é executável. O handler de `realestate.apply_adjustment` é um stub fail-closed com `HANDLER_PENDING_PHASE_4_3` em [`realestateActions.ts`](../../../apps/api/src/actions/realestateActions.ts). Após o `202`, o teste existente altera a Run e insere no ledger manualmente em [`agents.interop.contract.test.ts`](../../../apps/api/src/tests/agents.interop.contract.test.ts), portanto essa reconciliação não comprova execução do segmento até receipt.

## Ampliação de escopo em relação ao ADR-005

O ADR-005 previu corrigir artefato e índice. Depois foi confirmado que `checkP2AuditInterop.ts` e `checkP1CriticalChain.ts` exigiam as mesmas afirmações de receipt removidas dos artefatos. O owner decidiu em 2026-08-04 pelo caminho B': incluir os dois checkers no mesmo ciclo, pois preservar qualquer dessas exigências pediria declaração sem lastro sobre segmento não executável.

A alternativa A — rebaixar a afirmação e aceitar os gates reprovando até existir o handler da fase 4.3 — foi descartada porque manteria gates estruturalmente dependentes de declaração que o princípio P4 proíbe. Os ADRs existentes permanecem inalterados para preservar a rastreabilidade das decisões datadas.

## Artefatos históricos preservados

`interop-e2e-agent-call-2026-03-09.json`, `interop-e2e-agent-call-2026-05-14.json`, `realestate-high-actions-e2e-2026-03-09.json` e `realestate-high-actions-e2e-2026-05-14.json` não foram alterados. Os checkers selecionam apenas o arquivo mais recente de cada padrão; mudar esses registros históricos não alteraria o comportamento dos gates. Esses quatro arquivos permanecem afirmando uma trilha que não é executável no estado atual.

## Achado local × CI

Antes desta correção, `check:p2-audit-interop` reprovou localmente com `high_policy_evidence_too_old` sobre `realestate-high-actions-e2e-2026-06-17.json`: cinco ações HIGH, inclusive `realestate.apply_adjustment`, estavam com 48 dias diante do limite de 30. O handler dessa ação permanece stub.

No job `P2AuditInterop`, [`ci.yml`](../../../.github/workflows/ci.yml) executa `generate:p2-interop-evidence` antes de `check:p2-audit-interop`. Assim, em CI, a recência mede a idade do arquivo que o próprio job acabou de criar. O job conclui `success` na run congelada de referência, enquanto o estado versionado local reprova por recência. Este ciclo não corrige essa divergência nem altera o bloco ou o limite de recência.

## Efeito e limites

Esta correção não torna os artefatos resultado de execução. As afirmações dos segmentos 1 e 2 — discovery, negotiate e execute até aceitação em fila — foram preservadas, mas seu lastro continua declarativo e seu tratamento permanece pendente. `assertions.negotiate.receiptSpecVersion` foi preservado porque pertence ao contrato retornado por negotiate, não ao receipt executado.

Esta correção não implementa o handler, não resolve `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE`, não afirma efeito sobre merge, não corrige recência, não liga testes em CI e não provisiona serviços. Nenhuma frente, PR, fase ou status é promovido, rebaixado ou resolvido.

Nenhum alvo `generate:*`, `baseline:*` ou `sync:*` foi executado.
