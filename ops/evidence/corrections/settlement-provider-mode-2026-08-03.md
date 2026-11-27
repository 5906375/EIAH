# Correção da declaração de modo do settlement provider

- **Data:** 2026-08-03
- **Status:** `Proposta`
- **Artefato corrigido:** [`ops/evidence/latest/settlement-provider-e2e-2026-07-27.json`](../latest/settlement-provider-e2e-2026-07-27.json)

## O que foi alterado

O campo `providers[id=stripe].mode` do artefato versionado foi alterado manualmente de `"full"` para `"simulated"`. Os campos `date: "2026-07-27"` e `generatedAt: "2026-07-27T13:31:23.742Z"` foram preservados exatamente. Nenhum outro campo foi alterado e nenhuma chave foi adicionada.

O literal correspondente em [`scripts/generateP3EconomyEvidence.ts`](../../../scripts/generateP3EconomyEvidence.ts) também foi alterado de `stripe=full` para `stripe=simulated`, para que novas declarações produzidas pelo gerador sejam compatíveis com o contrato versionado.

## Fundamento

[`ops/contracts/settlement-provider-support-matrix.v1.json`](../../contracts/settlement-provider-support-matrix.v1.json) admite somente `simulated` para `stripe`, `crypto` e `bank` em `dev`, `staging` e `production`. O contrato não registra `providerAdapters`. A declaração anterior contrariava o princípio P3 de [`ADR-004`](../../../docs/adr/ADR-004-required-check-blocking-semantics.md): evidência não contradiz contrato versionado.

## Natureza da alteração

Esta foi uma edição manual do artefato versionado, não uma regeração. A data e o timestamp não foram renovados, portanto o artefato não ganhou frescor. A correção também não o transformou em resultado de execução: ele continua declarativo, e a frente `DISCRIMINATE-P3-EVIDENCE-MODE` permanece `pendente`.

Nenhum alvo `generate:*`, `baseline:*` ou `sync:*` foi executado nesta correção.

## Ampliação de escopo em relação ao ADR-004

O ADR-004 descreveu a etapa 2 somente como alinhamento do gerador. Depois do commit `ffdb680`, foi identificado que o checker lê o artefato versionado mais recente que casa com `settlement-provider-e2e-YYYY-MM-DD.json`, e esse artefato também declarava `stripe=full`.

O owner decidiu em 2026-08-03 pelo caminho B: corrigir manualmente o campo e preservar `date` e `generatedAt`. Regerar foi rejeitado porque reutilizaria o mecanismo declarativo marcado como não-execução e renovaria a data, sugerindo frescor inexistente. Adiar para o PR-05 foi rejeitado porque prolongaria o estado transitório que o ADR-004 decidiu encurtar. O ADR permanece inalterado para preservar a rastreabilidade da decisão datada e do fato superveniente.

## Efeito esperado e limites

Em execução local sobre o estado versionado corrigido, `check:p3-settlement-support-by-env` deve deixar de encontrar violação de modo. Não se afirma efeito sobre merge, comportamento real de staging, produção ou providers, nem que o CI dependia da correção manual deste artefato.

No job `P3SettlementSupportByEnv`, o workflow executa o gerador antes do checker. Assim, após a correção do literal no gerador, o CI já produziria o modo alinhado antes da verificação. A edição manual trata a coerência do estado versionado do repositório e não constitui nova execução de settlement.

`continue-on-error` não foi removido; isso pertence à etapa 3. Nenhuma frente, PR, fase ou status é promovido, rebaixado ou resolvido por esta correção.
