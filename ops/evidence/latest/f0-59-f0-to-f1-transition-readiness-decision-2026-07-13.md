# F0.59 — F0 to F1 transition readiness decision

## Data
2026-07-13

## Objetivo
Consolidar F0.47, F0.48, F0.49, F0.50, F0.51, F0.52, F0.53, F0.54, F0.55, F0.56, F0.57 e F0.58 como cadeia documental de preparação da Camada B e registrar a decisão formal de readiness para a transição de F0 para F1.

## Escopo e limite desta etapa
Esta etapa é estritamente documental e audit-only.

Não implementa F1.
Não altera runtime.
Não altera `release.yml`.
Não altera workflows.
Não altera `apps/**`, `packages/**` ou `scripts/**`.
Não altera `ChatAgentLauncher`.
Não cria lógica nova.
Não executa publish.
Não executa rollback real.
Não implementa HITL real.
Não usa secrets produtivos.
Não gera side effects externos.

## Pré-condições confirmadas
- F0.58 está mergeada em `main`.
- `docs/EVIDENCE_INDEX.md` estava consistente antes do diff.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` continua sendo o roadmap canônico vigente.
- `pnpm check:evidence-index` passou antes do diff.
- `pnpm check:w4-non-regression` passou antes do diff.
- `pnpm check:docs-link-integrity` passou antes do diff.
- A Camada B continua não autorizada para execução produtiva.

## Arquivos e evidências lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md`
- `ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md`
- `ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md`
- `ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md`
- `ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md`
- `ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-55-layer-b-promotion-preconditions-decision-matrix-2026-07-13.md`
- `ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md`
- `ops/evidence/latest/f0-57-layer-b-controlled-validation-pr-entry-criteria-2026-07-13.md`
- `ops/evidence/latest/f0-58-layer-b-controlled-validation-proposal-template-2026-07-13.md`

## Consolidação F0.47–F0.58
F0.47–F0.58 consolidaram a Camada B como trilha documental de readiness, negative paths, checklist de gate, plano de dry-run negativo, critérios `no-side-effect`, contrato de `receipt`/`bundle`, `rollbackReference`, critérios HITL, matriz de pré-condições, closure de readiness, critérios de entrada de PR futuro e template mínimo de proposta.

Essa cadeia reduz drift documental e organiza a governança de uma futura validação controlada, mas não promove a Camada B para execução real.

## Base normativa para F1
O roadmap canônico e os documentos de arquitetura continuam coerentes com a seguinte leitura:

- o `EIAH` deve funcionar como front door do sistema;
- o `ChatAgentLauncher` deve permanecer `render-first` / `render-only`;
- nenhuma lógica cognitiva nova deve nascer no launcher;
- a proposta multicanal existente já delimita `F1 - Mobile responsive` como frente de snapshots/testes de presentation mobile, sem schema/runtime novo.

Achados relevantes:
- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md:61` define `F1 - Mobile responsive`;
- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md:134` limita F1 a snapshots ou testes unitários de layout/presentation mobile;
- `docs/architecture/agent-chat-runtime.md` e `docs/architecture/presentation-snapshot-v1.md` mantêm o launcher como camada de renderização, não de decisão.

## Decisão formal F0 → F1

### F1_CAN_START
Status: `true`

Interpretação:
- F1 pode iniciar apenas como fase controlada de front door mobile/responsividade/render-only;
- isso significa trabalho de apresentação, snapshots, degradação responsiva e testes de renderização mobile;
- isso não implica mudança de engine, runtime, governança crítica, release path ou Camada B produtiva.

### F1_SCOPE_ALLOWED
Status: `front_door_mobile_responsiveness_render_only`

Escopo permitido para a leitura desta decisão:
- responsividade mobile do front door;
- snapshots/testes de presentation mobile;
- degradação visual segura de cards, CTAs, proof e formulários em telas pequenas;
- adaptações render-only coerentes com a arquitetura `agent-driven`.

### F1_EXECUTION_NOT_AUTHORIZED
Status: `true`

Interpretação:
- F1 não recebe autorização automática para execução produtiva;
- F1 não muda o estado da Camada B;
- F1 não é via de exceção para release real.

### F1_PUBLISH_NOT_AUTHORIZED
Status: `true`

### F1_ROLLBACK_NOT_AUTHORIZED
Status: `true`

### F1_HITL_NOT_AUTHORIZED
Status: `true`

### F1_PROD_SECRETS_NOT_AUTHORIZED
Status: `true`

### F1_REGISTRY_LOGIN_NOT_AUTHORIZED
Status: `true`

### F1_GHCR_DOCKER_PUSH_NOT_AUTHORIZED
Status: `true`

### F1_TAGS_RELEASES_NOT_AUTHORIZED
Status: `true`

### F1_EXTERNAL_SIDE_EFFECTS_NOT_AUTHORIZED
Status: `true`

## Matriz de decisão da transição

| Dimensão | Decisão | Leitura correta |
| --- | --- | --- |
| Início de F1 | `permitido` | somente como fase controlada de front door mobile/responsividade/render-only |
| Runtime/engine | `não permitido` | F1 não deve alterar runtime, engine ou contratos |
| `ChatAgentLauncher` como camada cognitiva | `não permitido` | F1 deve preservar o launcher como render-only |
| Execução produtiva | `não permitida` | nenhuma autorização automática |
| Publish real | `não permitido` | continua bloqueado |
| Rollback real | `não permitido` | continua bloqueado |
| HITL real | `não permitido` | continua bloqueado |
| Secrets produtivos | `não permitido` | continua bloqueado |
| Registry login / GHCR / Docker push | `não permitido` | continua bloqueado |
| Tags/releases | `não permitido` | continua bloqueado |
| Side effects externos | `não permitidos` | continua bloqueado |

## Invariantes obrigatórios após F0.59
1. `ROADMAP_CANONICAL = ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
2. `LAYER_B_PRODUCTION_NOT_AUTHORIZED = true`
3. `F1_CAN_START = true`
4. `F1_SCOPE = front_door_mobile_responsiveness_render_only`
5. `F1_NO_NEW_LOGIC_IN_CHATAGENTLAUNCHER = true`
6. `PUBLISH_ATTEMPTED = false`
7. `ROLLBACK_EXECUTED = false`
8. `HITL_EXECUTED = false`
9. `PROD_SECRETS_USED = false`
10. `EXTERNAL_SIDE_EFFECTS_DETECTED = false`

## Decisão final
Conclusão formal:

- F1 pode iniciar apenas como fase controlada de front door mobile/responsividade/render-only.
- F1 não recebe autorização automática para execução produtiva.
- F1 não recebe autorização para publish real.
- F1 não recebe autorização para rollback real.
- F1 não recebe autorização para HITL real.
- F1 não recebe autorização para uso de secrets produtivos.
- F1 não recebe autorização para registry login.
- F1 não recebe autorização para Docker/GHCR push.
- F1 não recebe autorização para tags/releases.
- F1 não recebe autorização para side effects externos.

## Leitura normativa correta
F0.59 não inicia F1 por si só.

F0.59 apenas declara que, se F1 for aberta, ela deve nascer no recorte mais estreito e conservador: mobile/responsividade/render-only do front door.

Qualquer tentativa de expandir F1 para runtime, publish, secrets, rollback, HITL, GHCR/Docker ou efeitos externos contraria esta decisão e deve ser bloqueada.

## Comandos executados
```bash
git status --short
git log --oneline -10
ls -la ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
ls -la docs/EVIDENCE_INDEX.md
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
ls -la ops/evidence/latest/f0-50-layer-b-controlled-negative-dry-run-plan-2026-07-13.md
ls -la ops/evidence/latest/f0-51-layer-b-no-side-effect-acceptance-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-52-layer-b-receipt-bundle-evidence-contract-2026-07-13.md
ls -la ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-55-layer-b-promotion-preconditions-decision-matrix-2026-07-13.md
ls -la ops/evidence/latest/f0-56-layer-b-controlled-validation-readiness-closure-2026-07-13.md
ls -la ops/evidence/latest/f0-57-layer-b-controlled-validation-pr-entry-criteria-2026-07-13.md
ls -la ops/evidence/latest/f0-58-layer-b-controlled-validation-proposal-template-2026-07-13.md
grep -n "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md\|F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|F0.53\|F0.54\|F0.55\|F0.56\|F0.57\|F0.58\|Camada B\|controlled validation\|F1\|PRODUCTION_NOT_AUTHORIZED" docs/EVIDENCE_INDEX.md
grep -n "F1\|Responsividade mobile\|front door\|render-only\|ChatAgentLauncher\|sem lógica nova\|Evidence Index\|operacionalmente fechado\|parcial\|proposta" ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md docs/architecture/*.md 2>/dev/null || true
pnpm check:evidence-index
pnpm check:w4-non-regression
pnpm check:docs-link-integrity
```

## Saídas reais observadas antes do diff

### `git log --oneline -10`
```text
7ff3965 Merge pull request #260 from 5906375/f0-58-layer-b-controlled-validation-proposal-template
553db5b docs(ci): document layer b controlled validation proposal template
6c2489d Merge pull request #259 from 5906375/f0-57-layer-b-controlled-validation-pr-entry-criteria
9928685 docs(ci): document layer b controlled validation PR entry criteria
1f16c58 Merge pull request #258 from 5906375/f0-56-layer-b-controlled-validation-readiness-closure
6f62d78 docs(ci): document layer b controlled validation readiness closure
f1677fa Merge pull request #257 from 5906375/f0-55-layer-b-promotion-preconditions-decision-matrix
215e5cf docs(ci): document layer b promotion preconditions decision matrix
5a5292c Merge pull request #256 from 5906375/f0-54-layer-b-hitl-approval-evidence-criteria
4195157 docs(ci): document layer b HITL approval evidence criteria
```

### `pnpm check:evidence-index`
```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 179356,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 487
}
```

### `pnpm check:w4-non-regression`
```text
{
  "ok": true,
  "check": "check:w4-non-regression",
  "gates": {
    "hardMetricsGo": true,
    "nonRegressionGo": true,
    "reasons": []
  },
  "metrics": {
    "moduleActivationSuccessRatePct": 100,
    "moduleActivationP95Seconds": 8,
    "timeToFirstRunP95Minutes": 14,
    "receiptCoveragePct": 100,
    "crossTenantAuthFailures": 0,
    "duplicateSideEffects": 0
  }
}
```

### `pnpm check:docs-link-integrity`
```text
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

## Prova de isolamento
- nenhum workflow foi alterado;
- `release.yml` não foi alterado;
- `package.json` e `pnpm-lock.yaml` não foram alterados;
- `apps/**`, `packages/**`, `scripts/**`, runtime, engine, contratos, schema Prisma, migrations e `ChatAgentLauncher` não foram alterados;
- a mudança desta F0.59 é estritamente documental.

## Status
Status: parcial/evidenciado
