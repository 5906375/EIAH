# Agent Registry Catalog

> Gerado automaticamente em `2026-03-16T10:54:59.426Z` a partir de `packages/core/src/actions/agents/registry.ts` e dos perfis canônicos em `packages/core/src/actions/agents/*.ts`.

| agent id | modelo | llm usage | conflict resolution | deterministic sources | fallback | tools |
| --- | --- | --- | --- | --- | --- | --- |
| `AADV` | `gpt-4o-mini` | `grounded_reasoning` | `fail_closed` | `3` | `human_review` | `3` |
| `DeFi_1` | `gpt-4.1` | `grounded_reasoning` | `use_primary` | `2` | `approved_snapshot` | `3` |
| `Diarias` | `gpt-4.1-mini` | `format_only` | `use_primary` | `1` | `approved_snapshot` | `0` |
| `EIAH` | `gpt-4.1` | `grounded_reasoning` | `human_review` | `2` | `human_review` | `0` |
| `fin-nexus` | `gpt-4.1-mini` | `grounded_reasoning` | `fail_closed` | `3` | `block` | `10` |
| `flow-orchestrator` | `gpt-4.1` | `grounded_reasoning` | `fail_closed` | `2` | `block` | `0` |
| `guardian` | `gpt-4.1` | `disallowed_for_critical_execution` | `fail_closed` | `3` | `block` | `0` |
| `I_BC` | `gpt-4.1-mini` | `grounded_reasoning` | `human_review` | `2` | `human_review` | `0` |
| `ImageNFTDiarias` | `gpt-4.1` | `format_only` | `use_primary` | `1` | `human_review` | `0` |
| `j360` | `gpt-4o-mini` | `grounded_reasoning` | `fail_closed` | `3` | `human_review` | `0` |
| `MKT` | `gpt-4.1-mini` | `grounded_reasoning` | `human_review` | `2` | `human_review` | `0` |
| `NFT_PY` | `gpt-4.1` | `grounded_reasoning` | `human_review` | `2` | `human_review` | `0` |
| `onchain-monitor` | `gpt-4o-mini` | `format_only` | `fail_closed` | `2` | `block` | `3` |
| `Pitch` | `gpt-4o` | `grounded_reasoning` | `human_review` | `2` | `human_review` | `0` |
| `risk-analyzer` | `gpt-4.1-mini` | `grounded_reasoning` | `fail_closed` | `3` | `block` | `0` |

## Fonte canônica

- `packages/core/src/actions/agents/registry.ts`
- `packages/core/src/actions/agents/*.ts`
