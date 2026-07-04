# P2 HIGH global coverage regeneration — 2026-07-02

## Objetivo

Regenerar `ops/evidence/latest/p2-high-global-coverage.json` por script real, sem edição manual de `generatedAt`, e revalidar os gates funcional e de recência.

## Script usado para gerar

```bash
pnpm generate:p2-high-global-coverage
```

## Saída real da geração

```text
{
  "ok": true,
  "check": "generate:p2-high-global-coverage",
  "generatedFile": "ops/evidence/latest/p2-high-global-coverage.json",
  "generatedAt": "2026-07-02T12:21:08.741Z",
  "coveredActions": [
    "billing.create_white_label_plan",
    "finance.archivePaymentDocument",
    "finance.reconcileBankTransactions",
    "finance.registerPayable",
    "notification.triggerPagerDuty"
  ],
  "uncoveredActions": [],
  "evidence": "packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts"
}
```

## generatedAt novo

- `2026-07-02T12:21:08.741Z`

## coveredActions

- `billing.create_white_label_plan`
- `finance.archivePaymentDocument`
- `finance.reconcileBankTransactions`
- `finance.registerPayable`
- `notification.triggerPagerDuty`

## uncoveredActions

- nenhum

## Saída real de check:p2-high-global-coverage

```bash
pnpm check:p2-high-global-coverage
```

```text
{
  "ok": true,
  "check": "check:p2-high-global-coverage",
  "runtimeHighActions": [
    "billing.create_white_label_plan",
    "finance.archivepaymentdocument",
    "finance.reconcilebanktransactions",
    "finance.registerpayable",
    "notification.triggerpagerduty"
  ],
  "coveredActions": [
    "billing.create_white_label_plan",
    "finance.archivepaymentdocument",
    "finance.reconcilebanktransactions",
    "finance.registerpayable",
    "notification.triggerpagerduty"
  ],
  "uncoveredActions": [],
  "files": {
    "coverage": "ops/evidence/latest/p2-high-global-coverage.json",
    "billing": "packages/core/src/actions/billing.ts",
    "finance": "packages/core/src/actions/finance.ts",
    "notifications": "packages/core/src/actions/notifications.ts"
  }
}
```

## Saída real de check:p2-evidence-recency

```bash
pnpm check:p2-evidence-recency
```

```text
{
  "ok": true,
  "check": "check:p2-evidence-recency",
  "file": "ops/evidence/latest/p2-high-global-coverage.json",
  "generatedAt": "2026-07-02T12:21:08.741Z",
  "ageDays": 0,
  "maxAgeDays": 30,
  "scope": "p2-global-core-high-inventory-v1"
}
```

## Saída real de check:evidence-index

```bash
pnpm check:evidence-index
```

```text
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 117296,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 346
}
```

## Método real de geração

- o gerador lê as actions HIGH atuais de:
  - `packages/core/src/actions/billing.ts`
  - `packages/core/src/actions/finance.ts`
  - `packages/core/src/actions/notifications.ts`
- o gerador cruza esse inventário com as actions executadas em:
  - `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts`
- se qualquer HIGH action atual ficar fora dessa prova E2E, o script falha e não gera artefato verde

## Conclusão

- regeneração realizada por script real
- `generatedAt` renovado sem edição manual
- `uncoveredActions=[]`
- `check:p2-high-global-coverage` passou
- `check:p2-evidence-recency` passou

## Follow-up — correção de runtime e nova regeneração real (2026-07-04)

### Correção aplicada

`package.json` tinha `generate:p2-high-global-coverage` e `check:p2-evidence-recency` invocados via `node --experimental-strip-types`, o mesmo padrão de incompatibilidade de CI já identificado em outras frentes (Redis, IMOB Knowledge Base, Agent Protocol Matrix). Ambos os comandos foram corrigidos para `node --import tsx`, sem alterar `check:p2-high-global-coverage` (script pré-existente, fora do escopo do PR-P2-01).

### Nova execução real após correção de runtime

```bash
pnpm generate:p2-high-global-coverage
```

```text
{
  "ok": true,
  "check": "generate:p2-high-global-coverage",
  "generatedFile": "ops/evidence/latest/p2-high-global-coverage.json",
  "generatedAt": "2026-07-04T15:38:27.779Z",
  "coveredActions": [
    "billing.create_white_label_plan",
    "finance.archivePaymentDocument",
    "finance.reconcileBankTransactions",
    "finance.registerPayable",
    "notification.triggerPagerDuty"
  ],
  "uncoveredActions": [],
  "evidence": "packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts"
}
```

```bash
pnpm check:p2-evidence-recency
```

```text
{
  "ok": true,
  "check": "check:p2-evidence-recency",
  "file": "ops/evidence/latest/p2-high-global-coverage.json",
  "generatedAt": "2026-07-04T15:38:27.779Z",
  "ageDays": 0,
  "maxAgeDays": 30,
  "scope": "p2-global-core-high-inventory-v1"
}
```

### Determinismo confirmado

O conjunto e a ordem de `coveredActions` desta execução são idênticos aos da execução original documentada acima (mesmas 5 ações, mesma ordem alfabética); apenas `generatedAt` mudou, o que é o comportamento esperado do gerador a cada execução real (é exatamente o campo que o gate de recência audita).

### Conclusão do follow-up

- `node --import tsx` corrigido nos 2 comandos novos do PR-P2-01
- artefato `ops/evidence/latest/p2-high-global-coverage.json` permanece staged com o `generatedAt` mais recente real (`2026-07-04T15:38:27.779Z`)
- DONE global não é declarado
