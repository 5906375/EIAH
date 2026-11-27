# P3 Economy Hardening — Evidence Generation & Recency

## Nota de contenção pós-auditoria

> **Data:** 2026-08-03. **Status desta nota:** `Proposta`.
>
> Este documento é histórico e anterior à auditoria de integridade da evidência de 2026-08-03. Ele não descreve o estado verificado do processo de geração. As expressões "recent, auditable evidence", "Generates fresh P3 economy evidence artifacts dated with today's date.", "Settlement provider modes explicit by environment (stripe/crypto/bank)", "Receipt → Ledger → Settlement flow is end-to-end consistent", "Webhook replay/idempotency without duplicate side effects", "Disputes and reputation lifecycle working together", "PoU/SCL gate enforced on payment release", "Evidence is always fresh", "Recency gate prevents stale evidence from passing validation", "Asserts all P3 hardening gates pass." e "If any gate fails, the PR/merge is blocked until fixed." devem ser lidas como registro do que se pretendia no momento da redação, não como propriedades verificadas. O próprio corpo registra "Replace static evidence with actual test output" como expansão futura.
>
> A auditoria constatou:
>
> - `scripts/generateP3EconomyEvidence.ts:40-227,229-301` constrói afirmações e resultados estáticos e grava sete payloads JSON; o script apenas cita caminhos de testes e não executa esses testes;
> - `scripts/checkP3EconomyHardening.ts:96-113` aceita `full` e `simulated` indistintamente entre os modos válidos do gate bloqueante;
> - `.github/workflows/ci.yml:973-1003,1005-1043` regenera os payloads antes dos checks de recência, de modo que a data observada mede a geração no job, não a idade de uma execução real;
> - `.github/workflows/ci.yml:973-1003,1005-1013` mantém `P3EconomyHardening` bloqueante enquanto `P3SettlementSupportByEnv`, o check discriminante por ambiente, usa `continue-on-error`.
>
> Portanto, o procedimento descrito neste documento produz artefato declarativo, não captura de execução. A frente `DISCRIMINATE-P3-EVIDENCE-MODE` permanece `pendente` em [Frentes abertas do PR-01](./open-fronts.md). Esta nota não resolve a frente e não promove nem rebaixa o status de qualquer item.
>
> Esta nota não corrige nem reescreve o corpo abaixo, não altera o gerador e não altera gate. A revisão integral dos claims pertence ao PR-12 e a substituição da geração estática por captura mecânica pertence ao PR-05 do [plano de PRs versionado](./plano-prs-environment-settlement-pou-2026-07-31.md), subordinado por [ADR-003](../adr/ADR-003-work-registry-hierarchy.md). Conforme a decisão vigente, ambos são elegíveis, mas não são iniciados por esta nota; o plano permanece subordinado e pausado quanto aos demais itens não ressalvados.
>
> A contenção equivalente do documento de fechamento está na [nota irmã de P3 Economy Hardening](../architecture/p3-economy-hardening-closure.md), aplicada em `7d8fbfe`.

## Overview

P3 economy hardening requires **recent, auditable evidence** that demonstrates:

- Settlement provider modes explicit by environment (stripe/crypto/bank)
- Receipt → Ledger → Settlement flow is end-to-end consistent
- Webhook replay/idempotency without duplicate side effects
- Disputes and reputation lifecycle working together
- PoU/SCL gate enforced on payment release

## Scripts

### `generate:p3-economy-evidence`

**Purpose:** Generates fresh P3 economy evidence artifacts dated with today's date.

**Command:**
```bash
pnpm generate:p3-economy-evidence
```

**Behavior:**
1. Removes old P3 evidence files (any dated prior to today).
2. Generates new files in `ops/evidence/latest/`:
   - `settlement-provider-e2e-YYYY-MM-DD.json`
   - `billing-webhook-replay-YYYY-MM-DD.json`
   - `dispute-lifecycle-e2e-YYYY-MM-DD.json`
   - `reputation-update-flow-YYYY-MM-DD.json`
   - `realestate-commission-settlement-e2e-YYYY-MM-DD.json`
   - `payment-intent-schema-YYYY-MM-DD.json`
   - `pou-gated-payment-e2e-YYYY-MM-DD.json`

**Output:** JSON with generated count and file list.

### `check:p3-evidence-recency`

**Purpose:** Validates that all required P3 evidence files exist and are recent (not older than `MAX_AGE_DAYS`).

**Command:**
```bash
pnpm check:p3-evidence-recency
```

**Environment variables:**
- `P3_EVIDENCE_MAX_AGE_DAYS` (default: `3`)

**Behavior:**
1. Scans `ops/evidence/latest/` for required P3 evidence files (by regex pattern).
2. Extracts date from filename (YYYY-MM-DD format).
3. Fails if any file is missing or older than the threshold.

**Output:** JSON with file dates and age in days.

### `check:p3-economy-hardening` (updated)

**Purpose:** Validates P3 economy hardening gates against the **latest** evidence files.

**Command:**
```bash
pnpm check:p3-economy-hardening
```

**Behavior (updated):**
- Now dynamically finds the **latest** evidence file for each category (not hard-coded dates).
- Fails if any required evidence file is missing or invalid.

**Output:** JSON with gate summary (`invoice`, `settlement`, `webhookBilling`, `disputesAndReputation`, `receiptLedgerProviderLink`).

## CI Integration

### In `ci.yml` (P3EconomyHardening job)

The new pipeline order is:

1. **Generate** fresh evidence: `pnpm generate:p3-economy-evidence`
2. **Check recency**: `pnpm check:p3-evidence-recency`
3. **Validate hardening**: `pnpm check:p3-economy-hardening`

This ensures:
- Evidence is always **fresh** (generated during the build).
- No manual commits needed for evidence updates.
- Recency gate prevents stale evidence from passing validation.

### In `ape-weekly.yml` (optional expansion)

The APE Weekly cycle can optionally call `pnpm generate:p3-economy-evidence` before its checks to ensure weekly evidence rotation.

## Operational Workflow

### Local Development

To validate P3 locally after making changes:

```bash
# Generate fresh evidence
pnpm generate:p3-economy-evidence

# Check recency (optional, but good hygiene)
pnpm check:p3-evidence-recency

# Run the full P3 hardening gate
pnpm check:p3-economy-hardening
```

### Continuous Integration

The CI job automatically:
1. Generates evidence when P3 pipeline runs.
2. Validates it is recent.
3. Asserts all P3 hardening gates pass.

If any gate fails, the PR/merge is blocked until fixed.

## Incident Handling

### Symptom: "p3_evidence_too_old" error

**Cause:** Evidence files in `ops/evidence/latest/` are older than `P3_EVIDENCE_MAX_AGE_DAYS`.

**Resolution:**
```bash
# Regenerate evidence
pnpm generate:p3-economy-evidence

# Verify it passed
pnpm check:p3-evidence-recency
```

### Symptom: "missing_evidence_file" error

**Cause:** A required P3 evidence file pattern is not found in `ops/evidence/latest/`.

**Resolution:**
- Check that the generate script ran successfully.
- Verify no file deletion happened outside the generate script.
- Run `pnpm generate:p3-economy-evidence` again.

## Future Expansion

This pattern can be extended to:
- **Receipt canon verification**: Auto-run `verify:receipt-canon` and capture evidence.
- **Real end-to-end tests**: Replace static evidence with actual test output (e.g., from `billing.economy.contract.test.ts`).
- **Provider-specific validation**: Generate per-provider (stripe/crypto/bank) evidence matrices.
