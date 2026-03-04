# Release Governance Policy (APE + Roadmap Hardening)

## Objetivo
Padronizar governanca de release para evitar regressao silenciosa e garantir promocao somente com evidencia valida.

## Escopo
Aplica-se a `main`, `staging` e `pilot` para trilhas criticas (F5.3, F5.4, F5.6).

## Regras de branch
1. `main` aceita mudancas apenas via Pull Request.
2. Branches de ambiente (`staging`, `pilot`) recebem apenas promote de `main`.
3. Force push e merge direto devem permanecer bloqueados.

## Required checks minimos
1. `CI Monorepo`
2. `Lint`
3. `EvidenceIndex`
4. `ReceiptCanonCompat`

## Gate de promocao (hard metrics)
Promocao so e permitida quando **todos** os itens abaixo forem verdadeiros no ciclo semanal:
1. `decision = GO`
2. `hardMetricsGo = true`
3. `auditGap = 0`
4. `duplicateSideEffects = 0`
5. `breakGlass = 0`

Se qualquer item falhar, o veredito e `NO_GO` (fail-closed), exceto break-glass valido e auditado.

## Janela operacional
1. Merge window: inicio da semana antes da execucao APE Weekly.
2. Freeze window: antes da revisao final do ciclo semanal.

## Break-glass
1. Exige aprovacao humana explicita.
2. Requer TTL curto e escopo definido.
3. Deve gerar trilha auditavel (`RunEvent` + ledger).

## Evidencia obrigatoria
1. Toda mudanca deve atualizar/confirmar `docs/EVIDENCE_INDEX.md`.
2. Todo PR deve explicitar DoD, risco e rollback.
3. Artefatos do ciclo semanal devem ser preservados para auditoria.
