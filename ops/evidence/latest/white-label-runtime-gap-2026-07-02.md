# White-Label Runtime Gap — 2026-07-02

## Data

- 2026-07-02

## Termos pesquisados

- `white-label`
- `whitelabel`
- `partnerId`
- `partner`
- `branding`
- `tenant`
- `workspace`
- `domain`
- `entitlement`
- `billing`

## Arquivos pesquisados e inspecionados

- `CLAUDE.md`
- `CODEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/architecture/white-label-runtime-gap.md`
- `docs/operations/eiah-access-matrix.md`
- `docs/operations/eiah-billing-operational-policy.md`
- `docs/adr/ADR-001-domain-runtime-stack.md`
- `docs/imobiliaria/program/backlog-tecnico-executavel-p1.md`
- `docs/marketing/brand-kit-derivado-do-produto-v1.md`
- `apps/api/src/middlewares/enforceTenant.ts`
- `apps/api/src/routes/session.ts`
- `apps/api/src/services/experienceResolver.ts`
- `apps/api/src/services/imob/imobAccessGate.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/state/sessionStore.ts`
- `apps/web/src/pages/app/marketplace/imob.tsx`
- `apps/web/src/pages/self-service/fin-nexus.tsx`
- `packages/core/src/actions/billing.ts`
- `packages/contracts/src/types.ts`

## Achados reais

### O que existe hoje

- `enforceTenant.ts` evidencia runtime fail-closed com `tenantId` e `workspaceId`.
- `session.ts` retorna `branding` com `brandName`, `logoUrl`, `primaryColor` e `workspaceLabel`.
- `sessionStore.ts` e `App.tsx` consomem esse branding de sessao na shell web.
- `imob.tsx` mostra copy explicita de `White-label ativo`, baseada no branding da sessao.
- `imobAccessGate.ts` evidencia entitlement fail-closed por tenant/workspace.
- `billing.ts` registra a action `billing.create_white_label_plan`.
- `types.ts` define `PlanBrandingSchema` e `PlanSpec.branding`.
- `fin-nexus.tsx` envia branding no `PlanSpec`.
- `eiah-billing-operational-policy.md` e `eiah-access-matrix.md` formalizam governanca por tenant/workspace.

### O que nao foi encontrado

- `partnerId` resolvido no runtime aplicacional.
- partner routing ou domain routing por parceiro.
- segregacao de billing/accounting por parceiro.
- branding runtime governado por parceiro com endpoint/contrato proprio.
- check de CI ou teste de nao-regressao especifico para white-label runtime.

## Lacunas confirmadas

- o repositorio tem branding tenant-aware, nao runtime white-label fechado.
- o vocabulario "white-label" em billing/produto nao e evidencia suficiente de governanca multi-parceiro.
- a stack de dominio documentada nao prova roteamento por parceiro.
- sem `partnerId` ou equivalente, nao ha como declarar isolamento comercial/auditavel por parceiro.

## DoD futuro para fechar F-10/P4

- `partnerId` ou identificador equivalente resolvido em runtime.
- domain routing ou partner routing verificavel.
- isolamento tenant/workspace sob contexto de parceiro.
- entitlement fail-closed por parceiro.
- billing/accounting segregado por parceiro.
- masking/branding controlado por escopo.
- trilha auditavel, receipt ou ledger quando aplicavel.
- testes/checks de nao-regressao.
- evidencia indexavel para os artefatos acima.

## Check novo

- nenhum

Justificativa:

- ainda nao existe contrato runtime white-label suficientemente real para um gate baixo-risco;
- neste PR, o estado correto e formalizar o gap sem criar um check que gere sinal verde enganoso.

## Saidas reais dos checks

### `pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 12,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

### `pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 121728,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 355
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

## Status conservador

- documentacao/evidencia do gap: `evidenciado`
- capacidades runtime relacionadas existentes: `parcial`
- white-label runtime completo futuro: `proposta`
- conclusao: white-label runtime nao pode ser declarado fechado neste estado do repositorio
