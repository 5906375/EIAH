## Resumo
- Objetivo:
- Escopo:

## Checklist DoD v7 (obrigatorio)
- [ ] Fase/Epic informado (ex.: F5.3, F5.4, F5.6, Track P)
- [ ] Evidencia adicionada/atualizada no `docs/EVIDENCE_INDEX.md`
- [ ] Runbook operacional atualizado quando houver impacto de operacao
- [ ] Para mudanças em `apps/web/src/pages/self-service/**`: `pnpm check:self-service-runtime-graph` e `pnpm check:frontend-duplication` executados e anexados em evidência
- [ ] Risco classificado: `low` | `medium` | `high`
- [ ] Rollback descrito de forma executavel

## Evidencias
- Arquivos/links de evidencia:
- Artefatos de CI relevantes:

## Validacao tecnica
- [ ] CI Monorepo
- [ ] Lint
- [ ] EvidenceIndex
- [ ] ReceiptCanonCompat

## Governanca de release
- [ ] Mudanca apta para GO/NO_GO semanal (APE)
- [ ] Sem bypass de gate nao auditado

## Notas de rollout
- Ambiente alvo:
- Feature flag/canary (se aplicavel):
- Plano de monitoramento:
