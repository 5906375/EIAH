# IMOB Knowledge Base v1 — 2026-07-02

## Data

- 2026-07-02

## Arquivos criados

- `knowledge/imob/README.md`
- `knowledge/imob/manifest.v1.json`
- `knowledge/imob/schema/imob-knowledge-entry.v1.schema.json`
- `knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json`
- `knowledge/imob/categories/playbooks/captacao-basics.v1.json`
- `knowledge/imob/categories/checklists/locacao-checklist.v1.json`
- `knowledge/imob/categories/templates/briefing-visita.v1.json`
- `knowledge/imob/categories/policies/atendimento-inicial.v1.json`
- `knowledge/imob/categories/glossary/termos-operacionais.v1.json`
- `scripts/checkImobKnowledgeBase.ts`

## Schemas criados

- `knowledge/imob/schema/imob-knowledge-entry.v1.schema.json`
- `knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json`

## Entries seed criadas

- `imob.playbook.captacao-basics.v1`
- `imob.checklist.locacao-checklist.v1`
- `imob.template.briefing-visita.v1`
- `imob.policy.atendimento-inicial.v1`
- `imob.glossary.termos-operacionais.v1`

## Manifesto criado

- `knowledge/imob/manifest.v1.json`

O manifesto indexa:

- 5 categorias iniciais;
- 5 entries seed;
- referencia explicita ao schema de entry;
- versao canonica `v1`.

## Regras de seguranca aplicadas

- todos os itens incluem `source`, `lastUpdated`, `riskLevel`, `requiresHumanReview`, `allowedScopes` e `disallowedUses`
- itens com sinais de negociacao, documentacao sensivel, proposta, aprovacao ou decisao sensivel ficaram protegidos por `requiresHumanReview: true`
- nenhum item permite decisao automatica de preco, contrato ou aprovacao
- nenhum item inclui PII real
- nenhuma tabela de preco, valuation, clausula contratual final ou recomendacao juridica final foi incluida

## Check criado

- `scripts/checkImobKnowledgeBase.ts`
- script exposto como `pnpm check:imob-knowledge-base`
- gate conectado ao job `EvidenceIndex` em `.github/workflows/ci.yml`

## Saida real de `pnpm check:imob-knowledge-base`

```text
> eiah-builder@ check:imob-knowledge-base /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkImobKnowledgeBase.ts

{
  "ok": true,
  "check": "check:imob-knowledge-base",
  "kbRoot": "knowledge/imob",
  "manifest": "knowledge/imob/manifest.v1.json",
  "entryCount": 5,
  "categories": [
    "playbooks",
    "policies",
    "templates",
    "glossary",
    "checklists"
  ],
  "filesValidated": [
    "knowledge/imob/categories/checklists/locacao-checklist.v1.json",
    "knowledge/imob/categories/glossary/termos-operacionais.v1.json",
    "knowledge/imob/categories/playbooks/captacao-basics.v1.json",
    "knowledge/imob/categories/policies/atendimento-inicial.v1.json",
    "knowledge/imob/categories/templates/briefing-visita.v1.json"
  ],
  "schemas": [
    "knowledge/imob/schema/imob-knowledge-entry.v1.schema.json",
    "knowledge/imob/schema/imob-knowledge-manifest.v1.schema.json"
  ]
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

## Saida real de `pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 13,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/fase-3-dividas-documentadas-closure.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

## Saida real de `pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 122850,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 357
}
(node:19) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

## Confirmacao de nao-runtime

- `ChatAgentLauncher` nao foi alterado
- `engine` runtime nao foi alterado
- `imobKnowledgeSearch.ts` nao foi alterado
- `knowledgeGate.ts` nao foi alterado
- nenhuma indexacao, ingestao ou busca vetorial foi criada

## Status conservador

- KB + schema + manifesto + check + evidencia: `evidenciado`

## Follow-up — correção proativa de compatibilidade de runtime CI (2026-07-04)

- `check:imob-knowledge-base` usava `node --experimental-strip-types scripts/checkImobKnowledgeBase.ts`, a mesma flag que causou falha real de CI no PR-REDIS-01 (`node: bad option: --experimental-strip-types` no runtime Node do GitHub Actions).
- Correção proativa aplicada antes da abertura do PR: `package.json` passou a usar `node --import tsx scripts/checkImobKnowledgeBase.ts` para `check:imob-knowledge-base`, seguindo o mesmo padrão já usado por `check:imob-knowledge-shadow` e por outros gates do repositório.
- Nenhuma lógica da IMOB Knowledge Base foi alterada (loader, engine, manifesto, entries e schemas permanecem intocados).
- Este follow-up não declara `DONE` global; cobre apenas a compatibilidade de runtime do gate.
