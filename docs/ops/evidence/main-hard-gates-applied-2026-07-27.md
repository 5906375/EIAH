# Main hard gates applied — 2026-07-27

## Escopo

Este artefato registra os hard gates de CI aplicados no ruleset
`main-protection-hard-gates`. Trata-se de registro documental pós-save, não de
alteração de policy, ruleset, branch protection ou GitHub settings.

Autoridade humana que aplicou a mitigação técnica: Carlos Alberto Merlo.

## Fatos confirmados

- Ruleset: `main-protection-hard-gates`.
- Enforcement: `active`.
- Target: default branch (`main`).
- Require status checks: enabled.
- Required checks: `20/20`.
- Missing checks: none.
- Source: GitHub Actions.
- `integration_id`: `15368`.
- `saved_at`: `2026-07-27T19:46:33.066Z`.
- `strict_required_status_checks_policy=false`.
- `do_not_enforce_on_create=false`.
- `approvals=0`.
- O worktree estava limpo no início da validação read-only pós-save.

## Required checks

1. `build_validate`
2. `lint`
3. `CiUnitSuite`
4. `EvidenceIndex`
5. `ReceiptCanonCompat`
6. `P0CriticalityAudit`
7. `P1CriticalChain`
8. `P1ReconciliationRecurring`
9. `RbacGuardrailRegression`
10. `AgentsPolicyFailClosed`
11. `AgentProtocolCompat`
12. `P2AuditInterop`
13. `P2HighGlobalCoverage`
14. `ProviderBoundary`
15. `P3EconomyHardening`
16. `P3SettlementSupportByEnv`
17. `SettlementContractDrift`
18. `W4NonRegression`
19. `DbPreviewPostgresValidate`
20. `PublicHealthContract`

## Bypass list

- A UI autenticada mostrou `Bypass list is empty`, conforme inspeção visual
  autenticada reportada por Carlos Alberto Merlo.
- A API pública omitiu o campo `bypass_actors`.
- Resultado: vazia por inspeção visual autenticada; indeterminada pela API
  pública.

## Classificação das frentes

| Frente | Estado | Limite da evidência |
| --- | --- | --- |
| P0 — `main` sem hard gates de CI | Mitigado tecnicamente | Os 20 required status checks estão configurados no ruleset ativo. |
| P1 — approvals/reviewer-não-autor | Aberto | `approvals=0`; não existe fechamento técnico de HITL ou exigência de reviewer diferente do autor. |
| P2 — auditoria APE #45–#48 | Aberto | Este registro não audita métricas, autoria ou ratificação dos ciclos. |
| P3 — refino `e2e-high-staging` antes de 2026-08-03 | Aberto | Este registro não altera nem fecha o workflow de staging. |

## APE kill-switch

O PR #397 foi mergeado em `2026-07-27T19:14:38Z`. A validação de
`.github/workflows/ape-weekly.yml` em `main` confirmou:

- sem `schedule`;
- sem `cron`;
- sem `gh pr merge`;
- sem `--auto`;
- `workflow_dispatch` presente;
- `peter-evans/create-pull-request@v7` presente.

O workflow pode abrir uma PR por disparo manual, mas não contém self-merge.

## Não-escopo

Este artefato:

- não fecha approvals/HITL técnico;
- não fecha a auditoria APE #45–#48;
- não fecha `e2e-high-staging`;
- não fecha staging ou produção;
- não ratifica reason codes;
- não aprova canal de e-mail;
- não altera ruleset, branch protection ou GitHub settings.

## Próximas ações

- P1: definir approval mínimo e reviewer-não-autor.
- P2: auditar os ciclos APE #45–#48.
- P3: refinar `e2e-high-staging` antes de 2026-08-03.
- Ratificar reason codes e owner RBAC em trilhas separadas.

## Proveniência da validação

- Ruleset consultado via API pública GitHub:
  `repos/5906375/EIAH/rulesets/13498700`.
- PR #397 consultado via API pública GitHub.
- Workflow APE lido diretamente da default branch.
- Bypass list proveniente da inspeção visual autenticada reportada acima; a
  API pública não fornece confirmação independente desse campo.

Status documental: `evidenciado`. Estado global das frentes: `parcial`.
