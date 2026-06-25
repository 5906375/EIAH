# Public Product Taxonomy — Implementation Evidence

Date: 2026-06-25
Scope: public naming only, contracts-first

## Commands executed

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/components/agents/helpDictionaryResolver.test.ts
node --import tsx --test apps/api/src/tests/public-product-taxonomy.contract.test.ts
pnpm check:public-product-taxonomy
pnpm test:web-chat-launcher
pnpm --filter @eiah/core build
pnpm --filter @eiah/api build
```

## Results

- `apps/web/src/components/agents/helpDictionaryResolver.test.ts`: pass
- `apps/api/src/tests/public-product-taxonomy.contract.test.ts`: pass
- `pnpm check:public-product-taxonomy`: pass
- `pnpm test:web-chat-launcher`: pass
- `pnpm --filter @eiah/core build`: pass
- `pnpm --filter @eiah/api build`: pass

## What this proves

- The canonical policy file exists and matches the roadmap order `LEGAL -> MKT -> Financeiro -> URBAN -> Logística`.
- The typed contract and official seed exist and enforce the required invariants:
  - `EIAH` remains `assistant_main`
  - `IMOB` remains `vertical`
  - `LEGAL` remains `preview`
  - `Billing`, `Economy` and `RunViewer` remain `operational_surface`
  - `IMOB_CRM` remains `internal_component`
  - `VERA` and `Revenue` are not `available`
  - no `available` entry is allowed without `sourceOfTruth`
- The EIAH help vocabulary now answers public taxonomy questions directly from the shared taxonomy bridge.
- Controlled UI copy passes the dedicated regression check for forbidden labels and legacy taxonomy phrases.
- The shared bridge is consumable by both `apps/web` and `apps/api` through `@eiah/core/taxonomy/publicProductTaxonomy`.

## Explicit non-scope

- No `ChatAgentLauncher` changes
- No agent runtime changes
- No billing/economy reclassification in runtime behavior
- No entitlement changes
