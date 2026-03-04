# Diagnostic Hotfix Gates

## Governanca Cognitiva (Core)
- [ ] Intent Validator aplicado no caminho da feature (ou justificativa de internal-only documentada).
- [ ] RBAC e Trust Score aplicados para toda execucao sensivel.
- [ ] GuardrailLedger persistente para negações e bloqueios relevantes (fallback observavel permitido).
- [ ] Tenant isolation garantido para DB, ledger e event stream (falha fechada sem contexto).

## No UI Change
- [ ] Nenhuma alteracao em `apps/web/**`.
- [ ] Nenhuma alteracao em CSS/layout/responsividade.
- [ ] Comando de verificação de diff executado.

## Contratos e API
- [ ] Nenhuma rota publica alterada sem versionamento.
- [ ] Nenhuma quebra de contrato publico.
- [ ] Alteracoes internas versionadas ou backward-compatible.

## Validacao minima por PR
- [ ] Testes unitarios alterados rodando.
- [ ] Typecheck do escopo.
- [ ] Lint do escopo.
- [ ] Rollback simples documentado no PR.

## Fechamento Operacional (2026-03-04)
- [x] Branch protection + required checks: CONCLUIDO.
  - required checks ativos: `CI Monorepo / build_validate (pull_request)`, `CI Monorepo / EvidenceIndex (pull_request)`, `CI Monorepo / ReceiptCanonCompat (pull_request)`, `Lint / lint (pull_request)`.
  - evidencia: `ops/evidence/latest/branch-protection-smoke-2026-03-04.md`.
- [x] APE Weekly Cycle #1 (`shadow/pilot`): CONCLUIDO (GO hard metrics).
  - run: `APE Weekly Cycle #7` (`main`, commit `8dae850`).
  - artefatos foco: `weekly-cycle-decision.json`, `weekly-report.md`.
  - evidencia: `ops/evidence/latest/ape-weekly-cycle-run7-2026-03-04.md`.
- [ ] Proximo passo: executar APE Weekly Cycle #2 (`shadow/pilot`) para estabilidade consecutiva.
