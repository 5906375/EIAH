# Public Product Taxonomy — Coverage Follow-up

Date: 2026-06-25
Type: follow-up scope expansion, no runtime change

## Normative preflight

- `CODEX.md` was read before any change.
- `IA_EIAH.md`, `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`, `AGENTS.md`, `docs/architecture/agent-chat-runtime.md` and `docs/EVIDENCE_INDEX.md` were consulted before editing.

## Explicit non-scope

- No `ChatAgentLauncher` changes
- No agent runtime changes
- No entitlements changes
- No billing/economy behavior changes
- No catalog structural redesign

## Change implemented in this iteration

- `pnpm check:public-product-taxonomy` was promoted into `.github/workflows/ci.yml`
- The gate now runs in the monorepo CI alongside `pnpm check:evidence-index`
- The workflow still follows the expected order:
  1. setup/install
  2. documentary/contract checks
  3. existing tests and builds

## Follow-up objective

Reduce drift between:

- policy narrative
- typed contract
- official seed
- public copy

without changing chat runtime behavior.

## Candidate surfaces for next anti-drift expansion

### 1. EIAH documentation vocabulary not yet covered

- `apps/web/src/components/agents/eiahTutorContracts.ts`
- `apps/web/src/components/agents/helpDictionary.pages.ts`
- `apps/web/src/components/agents/helpDictionary.billing.ts`
- `apps/web/src/components/agents/helpDictionary.global.ts`
- `apps/web/src/components/agents/helpDictionary.workflows.ts`

Reason:
- These files still carry high-volume product explanation copy and should be aligned to the same taxonomy guardrail.

### 2. Public catalog and adjacent product surfaces

- `apps/web/src/pages/app/agents/index.tsx`
- public catalog/pricing pages if they carry portfolio naming:
  - `apps/web/src/pages/app/marketplace/index.tsx`
  - `apps/web/src/pages/self-service/index.tsx`

Reason:
- They can expose drift between specialist, vertical and operational surface naming.

### 3. Playbooks and onboarding docs

- `docs/ops/agent-registry-catalog.md`
- `docs/ops/agent-response-examples.md`
- onboarding or rollout docs that cite public products, specialists or verticals

Reason:
- Public positioning can drift in docs even when code copy is clean.

### 4. EIAH help/documentation resolver surfaces

- `apps/web/src/components/agents/platformHelpResolver.ts`
- `apps/web/src/components/agents/specialistExplainCatalog.ts`
- `apps/web/src/components/agents/agentPresentationResolver.ts`

Reason:
- These are high-impact explanatory surfaces for portfolio naming and user-facing semantics.

## Proposed expansion strategy

1. Keep the contract in `apps/api/src/types/publicProductTaxonomyContract.ts` as the canonical wrapper.
2. Keep the shared bridge in `packages/core/src/taxonomy/publicProductTaxonomy.ts`.
3. Expand checks only over controlled copy surfaces.
4. Continue treating UI/help as consumer, not owner, of the taxonomy.
5. Do not move any new behavioral logic into `ChatAgentLauncher`.

## Commands executed for this follow-up

```bash
pnpm check:public-product-taxonomy
pnpm check:evidence-index
```

## Result

- `pnpm check:public-product-taxonomy`: pass
- `pnpm check:evidence-index`: pass
