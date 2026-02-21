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
