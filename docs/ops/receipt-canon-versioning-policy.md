# Receipt Canon Versioning Policy

## Objetivo
Definir regra explícita de versionamento/backward compatibility para o contrato `Receipt Canon`.

## Regra de versionamento
- `major` (`receipt.canon.vN`): obrigatório para qualquer breaking change.
- `minor/patch`: apenas mudanças aditivas e backward-compatible.

## O que é breaking change
- Remover ou renomear campo existente.
- Adicionar campo **obrigatório** em tipos existentes.
- Restringir tipo/enum/const aceito por campo já publicado.
- Remover variant já publicada de `oneOf`/`anyOf`.

## O que é aditivo (permitido sem major)
- Adicionar campo opcional.
- Adicionar nova variant de receipt sem remover variantes antigas.
- Ampliar enum (sem remover valores existentes).
- Adicionar metadados que não alteram parsing de consumidores existentes.

## Gate de CI
- Script: `scripts/checkReceiptCanonVersioning.ts`
- Comando ativo: `pnpm check:receipt-canon-compat`
- O gate falha quando:
  - detecta breaking change sem bump de major;
  - `specVersion` diverge do schema ativo;
  - exemplo não está alinhado ao `specVersion`;
  - changelog não contém entrada da versão ativa.

## Artefatos obrigatórios por mudança de contrato
- Atualizar `contracts/receipt-canon.vN.schema.json`.
- Atualizar `contracts/examples/receipt-canon.vN.example.json` (ou equivalente ativo).
- Atualizar `contracts/CHANGELOG.receipt-canon.md`.
- Atualizar `docs/EVIDENCE_INDEX.md` com referência de evidência.

## Extensão de semântica de execução (MCP-1J)

- Classificação: aditiva e backward-compatible dentro de `receipt.canon.v1`.
- `ExecutionStateReceipt` é uma nova variante opcional; os cinco receipts v1
  anteriores continuam obrigatórios e inalterados.
- Estados publicados: `real`, `blocked` e `historical_simulated`.
- `blocked` exige `reasonCodes` explícitos na resposta governada e no receipt.
- `historical_simulated` permanece parseável, mas falha na validação da cadeia
  crítica com `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN`.
- O manifest `bundle.v2` recebe o campo opcional `execution`, sem remoção ou
  restrição de campos existentes.

Esta extensão não adiciona campo obrigatório a tipos existentes e não remove
variant publicada; portanto aplica a regra de mudança aditiva, sem bump de major.
