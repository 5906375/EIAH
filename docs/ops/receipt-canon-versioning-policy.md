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
- Comando: `pnpm check:receipt-versioning`
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
