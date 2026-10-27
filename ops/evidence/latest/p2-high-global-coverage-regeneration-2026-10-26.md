# P2 HIGH global coverage regeneration — 2026-10-26

## Objetivo

Renovar `ops/evidence/latest/p2-high-global-coverage.json`, reprovado no CI do PR #508 (run `40376164472`, job `P2HighGlobalCoverage`) com `p2_evidence_too_old`, usando o script existente, sem edição manual de `generatedAt` ou de qualquer outro campo, e revalidar os gates funcional e de recência.

## Estado anterior (observado)

- `pnpm check:p2-evidence-recency` → falha: `p2_evidence_too_old`, `generatedAt` `2026-09-14T09:33:53.804Z`, `ageDays` 42,37, limite 30.
- SHA-256 do artefato anterior: `ed06cfde8f9358a846794a0ea5cab4c647c5567bfeefa3c71a0a4e169b3a322a`.

## Execução

Ambiente: checkout isolado da branch publicada do PR #508 (base `7c29744`), Node v22.17.1, pnpm 10.12.4. Nenhum serviço externo, banco, staging ou produção foi usado.

1. Teste e2e global das ações HIGH (o mesmo arquivo que o inventário referencia como evidência), com URL de banco inalcançável apenas para satisfazer a inicialização do cliente (o teste usa repositórios em memória e nunca conecta):

```bash
cd packages/core && node --import tsx --test src/actions/__tests__/highGlobalCoverage.e2e.test.ts
```

Resultado observado: `ok 1 - P2 global HIGH coverage: billing/finance/notifications actions execute successfully` — 1 teste, 1 aprovado, 0 falhas.

2. Regeneração pelo script existente:

```bash
pnpm generate:p2-high-global-coverage
```

Saída real:

```text
{
  "ok": true,
  "check": "generate:p2-high-global-coverage",
  "generatedFile": "ops/evidence/latest/p2-high-global-coverage.json",
  "generatedAt": "2026-10-26T18:33:35.229Z",
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

3. Gates:

```bash
pnpm check:p2-high-global-coverage   # ok: true; runtimeHighActions == coveredActions; uncoveredActions []
pnpm check:p2-evidence-recency       # ok: true; ageDays 0; maxAgeDays 30; scope p2-global-core-high-inventory-v1
```

## Resultado

- `generatedAt` novo: `2026-10-26T18:33:35.229Z`.
- SHA-256 do artefato novo: `a89eed0374589db91580dc31c9a66f61ee87d32c9d771ccca33518ace2400c5b`.
- Diferença em relação ao artefato anterior: **somente** `generatedAt`. O inventário das ações HIGH do core (billing, finance, notifications) não mudou: 5 ações, todas com cobertura e2e referenciada, `uncoveredActions` vazio.
- Janela de recência preservada em 30 dias (`P2_EVIDENCE_MAX_AGE_DAYS`); nenhum gate, limite ou cobertura foi alterado.

## Limites do que isto prova

- O artefato é um inventário estático: o script lê as ações `criticality: "high"` dos três arquivos de ações do core e confere se cada uma aparece em `executeRegisteredAction(...)` no teste e2e global. A regeneração prova que, nesta árvore, o inventário e a cobertura continuam coerentes e que o teste e2e global passa; não prova cobertura de outros domínios HIGH (escopo `p2-global-core-high-inventory-v1`).
- O teste e2e usa armazenamentos em memória; não exercita banco, fila ou ambiente de staging.

## Executado por

Claude Sonnet 5.5 (agente), por autorização do proprietário (EIAH-CI-P1P2-EVIDENCE-001). Os dados são sintéticos; nada de produção ou staging foi tocado.
