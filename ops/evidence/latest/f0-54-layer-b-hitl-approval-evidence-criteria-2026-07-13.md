# F0.54 — layer B HITL approval evidence criteria

## Data
2026-07-13

## Objetivo
Criar uma evidência documental/audit-only para a F0.54: critérios objetivos de evidência para aprovação humana HITL em uma futura validação controlada da Camada B.

Esta etapa consolida F0.47, F0.48, F0.49, F0.50, F0.51, F0.52 e F0.53 em critérios verificáveis para determinar se uma aprovação HITL futura é explícita, rastreável, surface-scoped, auditável, dentro da janela operacional e vinculada a owners, `reasonCode`, `receipt`, `bundle` e `rollbackReference`.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.53
- F0.53 presente no histórico recente de `main`
- `docs/EVIDENCE_INDEX.md` consistente
- `pnpm check:evidence-index` passando
- `pnpm check:w4-non-regression` passando
- a Camada B continua não autorizada para execução produtiva

## Escopo desta etapa

Esta etapa é audit-only/documental.

Não:

- implementa workflow;
- cria automação;
- altera `release.yml`;
- executa publish;
- executa rollback real;
- implementa HITL real;
- usa `secrets` produtivos;
- faz registry login;
- faz Docker/GHCR push;
- cria tags/releases;
- autoriza a Camada B para execução produtiva.

## Arquivos lidos

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

## Consolidação F0.47 -> F0.54

F0.47 fixou que a Camada B depende de decisão separada e conservadora antes de qualquer hipótese de promoção real.

F0.48 passou a exigir fail-closed explícito, `reasonCodes` e pré-condições auditáveis.

F0.49 tornou owners, janela operacional, rollback e boundary de `secrets` parte do checklist mínimo.

F0.50 descreveu o future controlled negative dry-run e o papel da governança humana na autorização do exercício negativo.

F0.51 definiu critérios objetivos para classificar a validação como `no-side-effect`.

F0.52 exigiu `receipt`/`bundle` com campos mínimos de rastreabilidade.

F0.53 tornou `rollbackReference` um requisito verificável e surface-scoped.

F0.54 completa a cadeia documental definindo o que uma futura aprovação humana HITL precisará provar para ser aceita como explícita, auditável e compatível com os demais artefatos da Camada B.

## Definição operacional de aprovação HITL na Camada B

Para a Camada B, uma futura aprovação HITL aceitável não é um “ok” informal.

Ela deve ser um artefato de decisão humana explícita, verificável e rastreável que:

- identifica quem aprovou;
- identifica o que foi aprovado;
- delimita a superfície e a janela operacional;
- vincula a decisão aos owners responsáveis;
- aponta o `rollbackReference`;
- se conecta ao `reasonCode`, ao `receipt` e ao `bundle`;
- não autoriza automaticamente execução produtiva fora do escopo explicitado.

## Critérios objetivos de aceitação

### H1 — a aprovação deve existir como evidência explícita

Aceitação:

- a aprovação HITL não pode depender de conversa oral, memória tácita ou inferência;
- a decisão deve existir em forma documental rastreável.

Falha:

- ausência de prova explícita invalida a aprovação.

### H2 — a aprovação deve identificar o aprovador humano

Aceitação:

- deve haver identidade clara do aprovador;
- deve haver vínculo entre aprovador e papel/owner correspondente.

Falha:

- aprovação sem identidade verificável não é aceitável.

### H3 — a aprovação deve ser surface-scoped

Aceitação:

- a aprovação deve indicar a superfície coberta:
  - `cli`
  - `api`
  - `workers`
  - `multi_surface`
- a aprovação não pode ser genérica para “release” sem escopo.

Falha:

- aprovação genérica ou sem superfície explícita deve ser rejeitada.

### H4 — a aprovação deve estar dentro da janela operacional

Aceitação:

- deve existir `operationalWindow` explícita;
- a aprovação deve ser válida apenas dentro dessa janela;
- janela vencida ou ausente invalida a decisão.

Falha:

- aprovação fora de janela ou sem janela não é aceitável.

### H5 — a aprovação deve estar vinculada a owners responsáveis

Aceitação:

- deve apontar `technicalOwner`;
- deve apontar `operationalOwner`;
- deve permitir rastrear quem aprova, quem executa e quem monitora.

Falha:

- aprovação sem owners vinculados não é aceitável.

### H6 — a aprovação deve apontar `rollbackReference`

Aceitação:

- a decisão HITL deve vincular explicitamente o `rollbackReference`;
- a referência deve respeitar os critérios de F0.53.

Falha:

- aprovação sem `rollbackReference` verificável deve ser rejeitada.

### H7 — a aprovação deve ser compatível com `reasonCode`

Aceitação:

- a trilha deve permitir associar aprovação, cenário e `reasonCode`;
- ausência de approval, approval expirado, approval sem owner ou approval fora de janela devem poder refletir `reasonCode` auditável.

Falha:

- se a aprovação não puder ser relacionada a `reasonCode`, a evidência é insuficiente.

### H8 — a aprovação deve ser compatível com `receipt` e `bundle`

Aceitação:

- o futuro `receipt` deve carregar referência à aprovação HITL;
- o futuro `bundle` deve carregar a mesma semântica de aprovação;
- a aprovação não pode divergir entre receipt e bundle.

Falha:

- divergência entre receipt e bundle invalida a aprovação como artefato auditável.

### H9 — a aprovação deve manter a leitura conservadora

Aceitação:

- a existência da aprovação HITL não elimina os demais gates;
- approval não substitui rollback, receipt, bundle, `reasonCode` ou critérios `no-side-effect`;
- approval parcial não pode ser interpretada como autorização irrestrita.

Falha:

- qualquer leitura de aprovação como “liberação total” sem demais pré-condições invalida a decisão.

### H10 — a aprovação deve ser indexável e reconstituível

Aceitação:

- a decisão precisa poder ser reconstituída depois;
- a evidência deve permanecer auditável por terceiro;
- o vínculo com cenário, owners, janela, `receipt`, `bundle` e rollback deve ser preservado.

Falha:

- aprovação não indexável ou não reconstituível não é aceitável.

## Campos mínimos que uma futura evidência HITL deve registrar

Uma futura evidência de approval HITL na Camada B deve conter, no mínimo:

- `approvalId`
- `approvalType`
- `approver`
- `surface`
- `targetVersion`
- `technicalOwner`
- `operationalOwner`
- `operationalWindow`
- `rollbackReference`
- `expectedReasonCode`
- `observedReasonCode`
- `receiptRef`
- `bundleRef`
- `decision`
- `approvedAt`
- `expiresAt` ou equivalente temporal

## Invariantes mínimos

Uma futura aprovação HITL só pode ser aceita se os seguintes invariantes permanecerem verdadeiros:

1. a aprovação existe documentalmente
2. o aprovador é identificável
3. a superfície está explícita
4. a janela operacional está explícita
5. os owners estão explícitos
6. o `rollbackReference` está explícito
7. a aprovação é compatível com `receipt` e `bundle`
8. a aprovação é compatível com `reasonCode`
9. a aprovação não substitui a disciplina `no-side-effect`
10. a aprovação não é tratada como autorização de execução produtiva irrestrita

## Condições de rejeição imediata

Uma futura aprovação HITL deve ser rejeitada como insuficiente se ocorrer qualquer uma das situações abaixo:

- aprovação ausente;
- aprovador não identificável;
- superfície ausente;
- janela operacional ausente;
- owners ausentes;
- `rollbackReference` ausente;
- ausência de vínculo com `receipt` ou `bundle`;
- ausência de vínculo com `reasonCode`;
- approval expirado ou fora da janela;
- approval usada como autorização genérica para promoção produtiva.

## Relação com F0.48–F0.53

Os critérios desta F0.54 devem permanecer coerentes, no mínimo, com:

- os `reasonCodes` e fail-closed de F0.48;
- o checklist de readiness de F0.49;
- o controlled negative dry-run de F0.50;
- os critérios `no-side-effect` de F0.51;
- o contrato de `receipt`/`bundle` de F0.52;
- os critérios de `rollbackReference` de F0.53.

## Exemplo de leitura auditável esperada

Uma futura evidência aceitável deve permitir afirmar, sem inferência adicional:

- quem aprovou;
- qual superfície foi aprovada;
- em qual janela a aprovação vale;
- quais owners estão vinculados;
- qual `rollbackReference` acompanha a decisão;
- como a aprovação aparece em `receipt` e `bundle`;
- como a decisão se relaciona ao `reasonCode`;
- que a aprovação não dispensou os demais gates da Camada B.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma futura etapa separada e autorizada que produza evidência HITL compatível com estes critérios, sem alterar a conclusão vigente.

Esta F0.54 não cria approval real, não cria gate, não cria workflow e não autoriza execução produtiva.

Leitura correta após F0.54:

- a Camada B continua não autorizada para execução produtiva;
- `release.yml` produtivo continua intocado;
- futuras validações da Camada B já têm critérios mínimos para aceitar ou rejeitar evidência HITL;
- ausência desses critérios deve manter o status como parcial e não autorizável.

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
grep -n "F0.47\|F0.48\|F0.49\|F0.50\|F0.51\|F0.52\|F0.53\|Camada B\|HITL\|approval\|owner\|rollback\|receipt\|bundle\|reasonCode\|operationalWindow\|fail-closed" docs/EVIDENCE_INDEX.md
grep -n "rollback\|receipt\|bundle\|abort\|reasonCode\|no-side-effect\|fail-closed\|Camada B\|owner\|operationalWindow" ops/evidence/latest/f0-53-layer-b-rollback-reference-acceptance-criteria-2026-07-13.md
pnpm check:evidence-index
pnpm check:w4-non-regression
git diff --check
git diff -- .github/workflows/release.yml
git diff -- .github/workflows/release-activation-rollback-gate.yml
git diff -- .github/workflows/release-publish-preflight.yml
git diff -- .github/workflows/release-node22-readiness.yml
git diff -- .github/workflows/release-node22-validation-build-dry-run.yml
git diff -- package.json
git diff -- pnpm-lock.yaml
git diff -- apps
git diff -- packages
git diff -- scripts
git status --short
git diff --stat
```

## Resultados reais dos checks

`pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 176566,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 483
}
(node:14) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

`pnpm check:w4-non-regression`

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
  },
  "template": "ops/verticals/template/vertical-template.md",
  "onboarding": "ops/verticals/vertical-onboarding-checklist.md",
  "evidenceRefs": [
    "ops/evidence/latest/interop-e2e-agent-call-2026-05-14.json",
    "ops/evidence/latest/pou-gated-payment-e2e-2026-07-13.json",
    "ops/evidence/latest/realestate-high-actions-e2e-2026-05-14.json",
    "ops/evidence/latest/realestate-commission-settlement-e2e-2026-07-13.json"
  ]
}
(node:14) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

`git diff --check`

```text
sem saída
```

## Prova de isolamento

Os diffs abaixo devem permanecer sem saída:

- `git diff -- .github/workflows/release.yml`
- `git diff -- .github/workflows/release-activation-rollback-gate.yml`
- `git diff -- .github/workflows/release-publish-preflight.yml`
- `git diff -- .github/workflows/release-node22-readiness.yml`
- `git diff -- .github/workflows/release-node22-validation-build-dry-run.yml`
- `git diff -- package.json`
- `git diff -- pnpm-lock.yaml`
- `git diff -- apps`
- `git diff -- packages`
- `git diff -- scripts`

`git status --short` após o diff

```text
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f0-54-layer-b-hitl-approval-evidence-criteria-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
