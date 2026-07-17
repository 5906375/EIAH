# ARCH-IMPL-0 — Minimal Physical Contracts + CI Validation

Status: proposta/parcial evidenciada localmente; aguardando PR/CI remoto.

## Escopo

ARCH-IMPL-0 reduz o risco P0 registrado em `docs/proposals/arch-chat-8-contract-to-implementation-gap-matrix.md`: os contratos conceituais de handoff vertical, estado HITL e proof/receipt bundle passam a existir como schemas físicos versionados, com validação local e no CI Monorepo.

Esta entrega é contracts-first. Ela não cria produtor runtime, não altera frontend, não altera `ChatAgentLauncher`, não altera engine/runtime, não altera Prisma schema, seeds ou migrations, e não inicia shadow, pilot ou small.

## Contratos físicos criados

- `contracts/chat/chat.vertical_handoff.v1.schema.json`
- `contracts/chat/hitl.gate_state.v1.schema.json`
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`

Os schemas preservam tenant/workspace/scope como campos obrigatórios, mantêm `additionalProperties: false` no nível raiz e em objetos aninhados criados nesta rodada, e formalizam apenas o shape mínimo necessário para o próximo passo de implementação governada.

## Validação

O check `check:arch-chat-contracts` executa `scripts/checkArchChatContracts.ts` e valida:

- existência dos três arquivos esperados;
- JSON válido;
- schema raiz `type: object`;
- `version` com `const` esperado;
- todos os campos mínimos obrigatórios no array `required` e em `properties`;
- campos opcionais mínimos presentes em `properties` e não marcados como obrigatórios;
- `additionalProperties: false`, salvo justificativa explícita via `x-allowAdditionalPropertiesReason`.

O CI Monorepo passa a executar esse check no job `ChatEngineRegression`, junto aos gates de render-only, entrypoint debt e presentation snapshot contract.

## Boundaries

- Sem runtime producer.
- Sem frontend.
- Sem alteração de `ChatAgentLauncher`.
- Sem alteração de runtime ou engine.
- Sem schema Prisma, seeds ou migrations.
- Sem workflow de shadow, pilot ou small.
- Sem mutações operacionais novas.

## Relação com ARCH-CHAT-8

ARCH-CHAT-8 identificou como P0 a ausência de contratos físicos e CI para `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1`. ARCH-IMPL-0 fecha apenas essa lacuna de base física e validação, sem afirmar que há produtor, renderização universal ou operação fechada.

## Próximo ARCH-IMPL-1

ARCH-IMPL-1 pode usar estes schemas como baseline para mapear produtores/consumidores reais, exemplos canônicos e testes de compatibilidade de integração. Qualquer produtor futuro deve preservar fail-closed por tenant/workspace/scope/entitlement, não mover regra cognitiva para o launcher, e manter o frontend como render-only.

## Receipt Canon

Receipt Canon não está fechado por esta entrega. `proof_receipt_bundle_state.v1` apenas formaliza o estado mínimo de apresentação/ponte para proof/receipt/bundle; ele não substitui `receipt.canon.v1`, não cria ledger novo e não declara prova operacional concluída.

## Shadow No-Go

Esta entrega não inicia shadow, pilot, small ou qualquer rollout. Qualquer shadow futuro exige decisão própria, evidência própria e gates adicionais.
