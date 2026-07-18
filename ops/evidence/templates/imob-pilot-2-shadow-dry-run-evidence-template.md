# IMOB-PILOT-2 — Shadow Dry-Run Evidence Template

> Template para evidencia futura. Este arquivo nao e evidencia executada, nao inicia shadow, nao executa dry-run, nao autoriza pilot/small e nao declara IMOB operacionalmente fechado.

## 1. Identification

- evidenceId: `TODO_FUTURE_EXECUTION_ID`
- executionDate: `TODO_FUTURE_YYYY-MM-DD`
- executor: `TODO_FUTURE_EXECUTOR`
- branchOrSha: `TODO_FUTURE_SHA`
- fixturePath: `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`
- status: `TODO_NO_GO_OR_GO_FOR_NEXT_REVIEW_ONLY`

## 2. Preconditions

- IMOB-PILOT-2 fixture reviewed: `TODO`
- dry-run execution explicitly authorized: `TODO`
- worktree status before execution: `TODO`
- no production provider configured: `TODO`
- no productive secret configured: `TODO`
- no production webhook enabled: `TODO`
- no mutation path enabled: `TODO`

## 3. Fixtures Used

- fixturePath: `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`
- fixtureChecksumSha256: `TODO_FUTURE_FIXTURE_SHA256`
- fixtureContainsSyntheticDataOnly: `TODO`
- fixtureContainsPiiOrSensitiveData: `TODO_EXPECT_FALSE`

## 4. Input Snapshot

- inputSnapshotPath: `TODO_FUTURE_PATH`
- inputSnapshotSha256: `TODO_FUTURE_SHA256`
- tenantId: `TODO_SYNTHETIC_OR_AUTHORIZED_CONTROLLED_TENANT`
- workspaceId: `TODO_SYNTHETIC_OR_AUTHORIZED_CONTROLLED_WORKSPACE`
- scope: `TODO`
- verticalId: `imob`
- intentId: `TODO`
- piiMasked: `TODO_EXPECT_TRUE`

## 5. Handoff Snapshot

- version: `chat.vertical_handoff.v1`
- snapshotPath: `TODO_FUTURE_PATH`
- snapshotSha256: `TODO_FUTURE_SHA256`
- schemaValidation: `TODO_PASS_FAIL`
- reasonCode: `TODO`
- riskLevel: `TODO`
- hitlRequired: `TODO`
- sideEffects: `TODO_EXPECT_0`

## 6. Gate State Read-Only

- version: `hitl.gate_state.v1`
- gateStatePath: `TODO_FUTURE_PATH`
- gateStateSha256: `TODO_FUTURE_SHA256`
- approvalState: `TODO_EXPECT_BLOCKED_OR_PENDING`
- reasonCode: `TODO_EXPECT_APPROVAL_REQUIRED`
- allowedUserActions: `TODO_EXPECT_VIEW_ONLY_OR_REVIEW_ONLY`
- approveHandlerPresent: `TODO_EXPECT_FALSE`
- rejectHandlerPresent: `TODO_EXPECT_FALSE`
- delegateHandlerPresent: `TODO_EXPECT_FALSE`
- escalateHandlerPresent: `TODO_EXPECT_FALSE`
- sideEffects: `TODO_EXPECT_0`

## 7. Proof State Read-Only

- version: `proof_receipt_bundle_state.v1`
- proofStatePath: `TODO_FUTURE_PATH`
- proofStateSha256: `TODO_FUTURE_SHA256`
- proofKind: `runtime_state`
- proofStatus: `TODO_EXPECT_NOT_REQUIRED_OR_BLOCKED`
- reasonCode: `TODO_EXPECT_PROOF_UNAVAILABLE_READ_ONLY`
- receiptId: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`
- bundleId: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`
- ledgerRef: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`
- proofGeneratedByRun: `TODO_EXPECT_FALSE`
- sideEffects: `TODO_EXPECT_0`

## 8. Render Output

- renderSurface: `ChatVerticalHandoffSurface`
- renderOutputPath: `TODO_FUTURE_PATH`
- renderOutputSha256: `TODO_FUTURE_SHA256`
- readOnlyLabelPresent: `TODO_EXPECT_TRUE`
- reasonCodeVisible: `TODO_EXPECT_TRUE`
- hitlStatusVisible: `TODO_EXPECT_TRUE`
- piiOrSensitiveDataVisible: `TODO_EXPECT_FALSE`
- providerExternalCall: `TODO_EXPECT_0`
- frontendPolicyDecision: `TODO_EXPECT_0`
- proofFabricatedInFrontend: `TODO_EXPECT_0`

## 9. ReasonCodes

Expected:

- `IMOB_PILOT_2_FIXTURE_PACK_ONLY`
- `CHAT_VERTICAL_HANDOFF_TO_COCKPIT`
- `APPROVAL_REQUIRED`
- `PROOF_UNAVAILABLE_READ_ONLY`
- `NO_PROVIDER_EXTERNAL_CALL`
- `NO_MUTATION_EXTERNAL_SIDE_EFFECT`
- `NO_DB_LEDGER_AUDIT_WRITE`
- `NO_RECEIPT_BUNDLE_PROOF_GENERATION`
- `NO_PII_LEAKAGE`

Observed:

- `TODO_FUTURE_LIST`

## 10. Observed Metrics

| Metric | Expected | Observed |
| --- | ---: | ---: |
| `handoffSnapshotBuilt` | `1` | `TODO` |
| `handoffSnapshotValidationFailures` | `0` | `TODO` |
| `hitlGateStateBuilt` | `1` | `TODO` |
| `proofReceiptBundleStateBuilt` | `1` | `TODO` |
| `renderSurfaceSerialized` | `1` | `TODO` |
| `sideEffects` | `0` | `TODO` |
| `providerExternalCall` | `0` | `TODO` |
| `mutationExternalSideEffect` | `0` | `TODO` |
| `dbWrite` | `0` | `TODO` |
| `ledgerWrite` | `0` | `TODO` |
| `auditWrite` | `0` | `TODO` |
| `receiptGenerated` | `0` | `TODO` |
| `bundleGenerated` | `0` | `TODO` |
| `proofGenerated` | `0` | `TODO` |
| `criticalActionExecuted` | `0` | `TODO` |
| `piiLeakageDetected` | `0` | `TODO` |
| `frontendPolicyDecision` | `0` | `TODO` |

## 11. Hashes / Checksums

- fixtureChecksumSha256: `TODO_FUTURE_SHA256`
- inputSnapshotSha256: `TODO_FUTURE_SHA256`
- handoffSnapshotSha256: `TODO_FUTURE_SHA256`
- hitlGateStateSha256: `TODO_FUTURE_SHA256`
- proofReceiptBundleStateSha256: `TODO_FUTURE_SHA256`
- renderOutputSha256: `TODO_FUTURE_SHA256`
- evidencePackSha256: `TODO_FUTURE_SHA256`

## 12. No-Go / Go Decision

- decision: `TODO_NO_GO_OR_GO_FOR_NEXT_REVIEW_ONLY`
- reasonCodes: `TODO`
- reviewer: `TODO`
- humanApprovalReference: `TODO_IF_APPLICABLE`
- productionAuthorization: `MUST_REMAIN_FALSE`

## 13. sideEffects=0 Confirmation

- handoff sideEffects: `TODO_EXPECT_0`
- gate sideEffects: `TODO_EXPECT_0`
- proof sideEffects: `TODO_EXPECT_0`
- aggregate sideEffects: `TODO_EXPECT_0`

## 14. providerExternalCall=0

- providerExternalCall: `TODO_EXPECT_0`
- providerConfigured: `TODO_EXPECT_FALSE`
- productiveSecretUsed: `TODO_EXPECT_FALSE`
- productionWebhookEnabled: `TODO_EXPECT_FALSE`

## 15. proofFabricatedInFrontend=0

- proofFabricatedInFrontend: `TODO_EXPECT_0`
- frontendGeneratedReceipt: `TODO_EXPECT_FALSE`
- frontendGeneratedBundle: `TODO_EXPECT_FALSE`
- frontendGeneratedLedgerRef: `TODO_EXPECT_FALSE`

## 16. No Mutation

- mutationExternalSideEffect: `TODO_EXPECT_0`
- dbWrite: `TODO_EXPECT_0`
- ledgerWrite: `TODO_EXPECT_0`
- auditWrite: `TODO_EXPECT_0`
- criticalActionExecuted: `TODO_EXPECT_0`

## 17. No Receipt / Bundle / Proof Generation

- receiptGenerated: `TODO_EXPECT_0`
- bundleGenerated: `TODO_EXPECT_0`
- proofGenerated: `TODO_EXPECT_0`
- receiptId: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`
- bundleId: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`
- ledgerRef: `TODO_EXPECT_EMPTY_UNLESS_PREEXISTING`

## 18. Links To Future Real Evidence Only

- evidenceIndexEntry: `TODO_ONLY_AFTER_REAL_EXECUTION`
- artifactDirectory: `TODO_FUTURE_PATH`
- CI run: `TODO_FUTURE_RUN_ID`
- PR: `TODO_FUTURE_PR`
