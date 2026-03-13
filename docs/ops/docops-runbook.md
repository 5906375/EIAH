# Runbook — DocOps Operacional (Track P)

## Objetivo

Operar os gates de documentação de forma repetível, evitando drift crítico entre código, contratos e evidências.

Escopo operacional:
- `pnpm check:docops-routes`
- `pnpm evidence:ci`
- `pnpm check:evidence-index`

Fontes canônicas já existentes:
- `ops/contracts/deprecation-sunset-policy.md`
- `ops/contracts/deprecation-registry.v1.json`
- `scripts/checkEvidenceIndex.ts`
- `scripts/updateEvidenceIndexImportGraph.ts`
- `.github/workflows/ci.yml`

## Rotina por ciclo

1. Rodar `pnpm check:docops-routes`
- Esperado: `[docops] OK`

2. Rodar `pnpm evidence:ci`
- Esperado:
  - `[evidence] OK. docs/EVIDENCE_INDEX.md is synchronized.`
  - `[evidence:check] OK. ...`

3. Rodar `pnpm check:evidence-index` (opcional de confirmação)
- Esperado: `[evidence:check] OK. ...`

4. Registrar artefato de ciclo:
- `ops/evidence/docops-ci-pass-YYYY-MM-DD.json`

## Critério de estabilidade (DoD Track P)

- 2 ciclos consecutivos verdes, sem erro de:
  - rota sem documentação esperada,
  - referência quebrada em `EVIDENCE_INDEX`,
  - drift de manifests/registry.

## Playbook de incidente

- Erro em `check:docops-routes`:
  - revisar `ops/docops/routes-docs-registry.v1.json` e rotas alteradas.

- Erro em `evidence:ci` / `check:evidence-index`:
  - sincronizar índice com `scripts/updateEvidenceIndexImportGraph.ts`.
  - corrigir paths inválidos/ausentes no `docs/EVIDENCE_INDEX.md`.

- Erro de depreciação/sunset:
  - alinhar `ops/contracts/deprecation-registry.v1.json` com política oficial.
