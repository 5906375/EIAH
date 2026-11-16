# Janela histórica — truthful evidence no relatório J-360

Data do registro: 2026-08-08.

## Problema

O relatório jurídico J-360 usava o literal `Documento jurídico anexado` como
placeholder quando nenhum documento real havia sido confirmado. Isso permitia
que uma ausência de evidência fosse apresentada como presença de documento.

## Janela conhecida

- Primeiro commit determinável que introduziu o literal:
  `db375ec8dda716316e6e2a3f36d42aa406ee88f2` (`feat: add J360 and MKT
  governed report orchestration (#137)`).
- Commit de correção: o commit local que contém esta nota e a mitigação; o SHA
  final é registrado na saída operacional da tarefa, pois um commit não pode
  conter de forma estável o próprio SHA.
- Runs e receipts históricos produzidos entre a introdução e a correção podem
  conter o literal fictício.

Nenhuma reescrita retroativa de runs ou receipts será feita nesta rodada.
Payloads legados sem `sourceStatus` são lidos como `unknown`, com a mensagem
`Origem da fonte não registrada nesta versão do relatório.`. Esse default de
leitura não é persistido de volta durante serialização.

## Limite desta correção

Esta mitigação fecha somente R1. O risco residual R2 — referências jurídicas
hardcoded e sua pertinência material — permanece aberto e não foi alterado.
