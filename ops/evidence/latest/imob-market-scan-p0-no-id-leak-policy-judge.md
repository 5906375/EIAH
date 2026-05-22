# IMOB Market Scan P0 — No ID Leak + Policy Judge

Data: 2026-05-22

Escopo validado:
- Saída visível do Market Scan não deve expor `sourceId`, `scanId`, `sourceUrlHash`, `dedupeKey`, `clusterHash`, `evidenceBundleId` ou IDs internos como `cmp...`, `prop-*`, `public_*`.
- IDs internos permanecem apenas em payload/metadados internos para seleção governada.
- Resposta forte de Market Scan passa por `marketScanPolicyJudge` antes do writer/apresentação final.
- Resposta sem `evidenceBundleId` é degradada para "dados insuficientes para recomendação forte".

Validação executada:

```bash
node --import tsx --test apps/api/src/tests/imob-turn-resolver.test.ts apps/api/src/tests/imob-market-scan-pipeline.test.ts apps/api/src/tests/imob-public-web-scan-policy.test.ts apps/api/src/tests/imob-market-scan-no-internal-id-leak.test.ts apps/api/src/tests/imob-market-scan-policy-judge-final-response.test.ts
```

Resultado esperado:
- `noInternalIdsVisibleToUser=true`
- `policyJudgeBeforeFinalResponse=true`
- `recommendationRequiresEvidence=true`
- `chatAgentLauncherChanged=false`
- `frontendChanged=false`

