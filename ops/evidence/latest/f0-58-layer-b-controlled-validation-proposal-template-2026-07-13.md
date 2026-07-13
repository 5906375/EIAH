# F0.58 — layer B controlled validation proposal template

## Data
2026-07-13

## Objetivo
Consolidar F0.47, F0.48, F0.49, F0.50, F0.51, F0.52, F0.53, F0.54, F0.55, F0.56 e F0.57 em um template mínimo operacional/documental para orientar um futuro PR dedicado de validação controlada da Camada B.

## Escopo e limite desta etapa
Esta etapa é estritamente documental e audit-only.

Não abre o PR futuro.
Não implementa workflow.
Não cria automação.
Não altera `release.yml`.
Não executa publish.
Não executa rollback real.
Não implementa HITL real.
Não usa secrets produtivos.
Não faz registry login.
Não faz Docker/GHCR push.
Não cria tags/releases.
Não gera side effects externos.
Não autoriza a Camada B para execução produtiva.

## Pré-condições confirmadas
- F0.57 está mergeada em `main`.
- `docs/EVIDENCE_INDEX.md` estava consistente antes do diff.
- `pnpm check:evidence-index` passou antes do diff.
- `pnpm check:w4-non-regression` passou antes do diff.
- `release.yml` produtivo permanece intocado.
- A Camada B continua não autorizada para execução produtiva.

## Arquivos e evidências lidos
- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
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

## Papel da F0.58
F0.58 não cria capacidade nova.

F0.58 não reduz o bloqueio operacional da Camada B.

F0.58 apenas materializa um template mínimo para que um futuro PR dedicado:
- comece com escopo correto;
- não reabra debates já fechados por F0.47–F0.57;
- preserve fail-closed;
- não confunda readiness documental com autorização operacional.

## Template mínimo para um futuro PR dedicado

O futuro PR deve começar usando, no mínimo, a estrutura abaixo.

### 1. Título do PR futuro
```text
Layer B controlled validation — <surface> — <objective>
```

Exemplos válidos:
- `Layer B controlled validation — cli — dry-run evidence rehearsal`
- `Layer B controlled validation — api — no-side-effect gate proof`
- `Layer B controlled validation — multi_surface — evidence contract verification`

Exemplos inválidos:
- `Release Layer B`
- `Publish validation`
- `Production rollout`
- `Final release gate`

### 2. Abertura obrigatória
```text
Objetivo:
Executar somente uma validação controlada dedicada da Camada B.

Esta etapa:
- não executa publish real;
- não executa rollback real;
- não implementa HITL real;
- não usa secrets produtivos;
- não faz registry login;
- não faz Docker/GHCR push;
- não cria tags/releases;
- não gera side effects externos;
- não altera release.yml;
- não autoriza a Camada B para execução produtiva.
```

### 3. Pré-condições obrigatórias
```text
Pré-condição:
- F0.47–F0.58 presentes e coerentes;
- docs/EVIDENCE_INDEX.md consistente;
- pnpm check:evidence-index passando;
- pnpm check:w4-non-regression passando;
- Camada B ainda classificada como:
  - CANDIDATE_CONTROLLED_VALIDATION=true
  - PRODUCTION_NOT_AUTHORIZED=true
  - BLOCKED=true
```

### 4. Escopo permitido obrigatório
```text
Escopo permitido:
- somente os arquivos estritamente necessários para a validação controlada proposta;
- evidência real gerada pela etapa;
- docs/EVIDENCE_INDEX.md somente se houver nova evidência real.
```

### 5. Escopo proibido obrigatório
```text
Escopo proibido:
- .github/workflows/release.yml
- publish real
- rollback real
- HITL real
- secrets produtivos
- registry login
- GHCR/Docker push
- tags/releases
- side effects externos
- qualquer alteração fora do recorte explicitamente autorizado
```

### 6. Superfície alvo obrigatória
```text
Surface:
- cli | api | workers | multi_surface
Justificativa:
- explicar por que essa superfície é suficiente
```

Se a superfície não for declarada, o PR futuro está mal formado.

### 7. Objetivo único obrigatório
```text
Objetivo técnico único:
- descrever apenas uma hipótese verificável
```

Exemplos válidos:
- provar que um runner manual permanece `no-side-effect`;
- validar apenas a construção de evidência sem boundary externo;
- validar apenas a coerência de `receipt`/`bundle` em simulação controlada.

Exemplos inválidos:
- publish + rollback + preflight no mesmo PR;
- migração de `release.yml`;
- várias hipóteses operacionais não relacionadas.

### 8. Invariantes obrigatórios
```text
Invariantes:
- publishAttempted = false
- rollbackExecuted = false
- hitlExecuted = false
- secretBoundaryCrossed = false
- registryLoginAttempted = false
- ghcrOrDockerPushAttempted = false
- tagOrReleaseAttempted = false
- externalSideEffectsDetected = false
- failClosed = true se qualquer pré-condição falhar
```

### 9. Owners e janela operacional documentais
```text
Owners documentais:
- technicalOwner: <papel ou pendência explícita>
- operationalOwner: <papel ou pendência explícita>
- operationalWindow: <janela documental ou pendência explícita>
```

O PR futuro não pode mascarar ausência desses campos.

### 10. Reason codes e negative paths
```text
Negative paths esperados:
- <lista>

Reason codes esperados:
- <lista>

Abort stage:
- <ponto de abort explícito>
```

Sem isso, a etapa futura não está alinhada a F0.48/F0.50/F0.51.

### 11. Compatibilidade obrigatória com evidência canônica
```text
Compatibilidade a preservar:
- receipt/bundle (F0.52)
- rollbackReference (F0.53)
- HITL criteria sem HITL real (F0.54)
- promotion preconditions (F0.55)
- readiness closure (F0.56)
- PR entry criteria (F0.57)
```

### 12. Investigação obrigatória do PR futuro
```bash
git status --short
git log --oneline -8
pnpm check:evidence-index
pnpm check:w4-non-regression
```

Mais os comandos específicos da hipótese validada.

### 13. Prova de isolamento obrigatória
```text
Provar ausência de diff em:
- .github/workflows/release.yml
- workflows fora do escopo
- package.json
- pnpm-lock.yaml
- apps/**
- packages/**
- scripts/**, salvo autorização explícita
```

### 14. Evidência mínima obrigatória
```text
A evidência futura deve conter:
- arquivos lidos
- hipótese validada
- negative paths considerados
- invariantes no-side-effect
- surface
- owners/operationalWindow documentais
- checks executados
- prova de isolamento
- riscos residuais
- status conservador
```

### 15. Status final obrigatório do PR futuro
```text
Status: parcial/evidenciado
ou
Status: parcial
```

Nunca:
- `evidenciado` como autorização produtiva;
- `done`;
- `fechado`;
- `publish-ready`.

## Template resumido pronto para reaproveitamento

```text
Leia CODEX.md antes de qualquer ação.

# Layer B controlled validation — <surface> — <objective>

## Objetivo
Executar somente uma validação controlada dedicada da Camada B.

Esta etapa:
- não executa publish real;
- não executa rollback real;
- não implementa HITL real;
- não usa secrets produtivos;
- não faz registry login;
- não faz Docker/GHCR push;
- não cria tags/releases;
- não gera side effects externos;
- não altera release.yml;
- não autoriza a Camada B para execução produtiva.

## Pré-condição
- F0.47–F0.58 presentes e coerentes;
- docs/EVIDENCE_INDEX.md consistente;
- pnpm check:evidence-index passando;
- pnpm check:w4-non-regression passando;
- CANDIDATE_CONTROLLED_VALIDATION=true;
- PRODUCTION_NOT_AUTHORIZED=true;
- BLOCKED=true.

## Surface
- <cli|api|workers|multi_surface>

## Objetivo técnico único
- <hipótese única e verificável>

## Invariantes
- publishAttempted = false
- rollbackExecuted = false
- hitlExecuted = false
- secretBoundaryCrossed = false
- registryLoginAttempted = false
- ghcrOrDockerPushAttempted = false
- tagOrReleaseAttempted = false
- externalSideEffectsDetected = false
- failClosed = true

## Owners documentais
- technicalOwner: <...>
- operationalOwner: <...>
- operationalWindow: <...>

## Negative paths / reasonCodes
- <...>

## Compatibilidade obrigatória
- receipt/bundle
- rollbackReference
- HITL criteria sem HITL real
- promotion preconditions
- readiness closure
- PR entry criteria

## Checks mínimos
- pnpm check:evidence-index
- pnpm check:w4-non-regression
- <checks específicos da hipótese>

## Prova de isolamento
- release.yml intocado
- sem workflow produtivo alterado
- sem apps/packages/runtime fora do escopo

## Status final
Status: parcial/evidenciado
```

## Decisão documental da F0.58
Conclusão:

- agora existe um template mínimo e reutilizável para um futuro PR dedicado de validação controlada da Camada B;
- esse template preserva a cadeia F0.47–F0.57;
- esse template não autoriza o PR futuro automaticamente;
- esse template não autoriza execução produtiva, publish real, rollback real, HITL real, uso de secrets produtivos nem side effects externos.

## Comandos executados
```bash
git status --short
git log --oneline -8
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
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|F0.53\|F0.54\|F0.55\|F0.56\|F0.57\|Camada B\|controlled validation\|PR entry\|PRODUCTION_NOT_AUTHORIZED\|ENTRY_CANDIDATE_PR\|EXECUTION_NOT_AUTHORIZED" docs/EVIDENCE_INDEX.md
grep -n "ENTRY_CANDIDATE_PR\|EXECUTION_NOT_AUTHORIZED\|publish real\|rollback real\|HITL real\|secrets produtivos\|side effects externos\|Camada B" ops/evidence/latest/f0-57-layer-b-controlled-validation-pr-entry-criteria-2026-07-13.md
pnpm check:evidence-index
pnpm check:w4-non-regression
```

## Saídas reais observadas antes do diff

### `git log --oneline -8`
```text
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
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 178648,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 486
}
```

### `pnpm check:w4-non-regression`
```text
> eiah-builder@ check:w4-non-regression /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkW4NonRegression.ts

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

## Prova de isolamento
- nenhum workflow foi alterado;
- `release.yml` não foi alterado;
- `package.json` e `pnpm-lock.yaml` não foram alterados;
- `apps/**`, `packages/**`, `scripts/**`, runtime, engine, contratos, schema Prisma, migrations e `ChatAgentLauncher` não foram alterados;
- a mudança desta F0.58 é estritamente documental.

## Status
Status: parcial/evidenciado
