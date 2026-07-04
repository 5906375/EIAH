# P2 HIGH evidence recency — 2026-07-02

## Data

- `2026-07-02`

## Artefato verificado

- `ops/evidence/latest/p2-high-global-coverage.json`

## Estado observado

- `generatedAt`: `2026-03-14T12:00:00Z`
- idade calculada na execução local: `110.01` dias
- `maxAge` usado no novo gate: `30` dias

## Check P2 HIGH coverage existente

Comando executado:

```bash
pnpm check:p2-high-global-coverage
```

Saída real:

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

## Novo check de recência

Comando executado:

```bash
pnpm check:p2-evidence-recency
```

Saída real:

```text
{
  "ok": false,
  "check": "check:p2-evidence-recency",
  "message": "p2_evidence_too_old",
  "details": {
    "file": "ops/evidence/latest/p2-high-global-coverage.json",
    "generatedAt": "2026-03-14T12:00:00.000Z",
    "ageDays": 110.01,
    "maxAgeDays": 30,
    "scope": "p2-global-core-high-inventory-v1"
  }
}
```

## Regeneração do artefato

- o artefato **não foi regenerado**
- motivo: não existe no workspace atual um script confiável de geração/refresh para `ops/evidence/latest/p2-high-global-coverage.json`
- foi localizado apenas o inventário/check `scripts/checkP2HighGlobalCoverage.ts`, que valida coerência e cobertura declarada, mas não reemite um artefato novo com `generatedAt` atualizado por execução real

## Gate adicionado

- novo script: `scripts/checkP2EvidenceRecency.ts`
- novo comando: `pnpm check:p2-evidence-recency`
- integração no CI: job `P2HighGlobalCoverage` agora executa também `Check P2 HIGH evidence recency` com `P2_EVIDENCE_MAX_AGE_DAYS=30`

## Conclusão

- o gate de recência agora existe e é bloqueante
- a evidência P2 HIGH atual está stale
- como não houve regeneração confiável neste PR, o estado desta frente permanece `parcial`
