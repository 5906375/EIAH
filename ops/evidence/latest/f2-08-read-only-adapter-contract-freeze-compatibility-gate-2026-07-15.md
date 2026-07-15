# F2.8 — Read-Only Adapter Contract Freeze / Compatibility Gate — 2026-07-15

## Resumo executivo
Formalizei o congelamento compatível do contrato `whatsapp.read_only.bundle_export.v1` do adapter WhatsApp read-only com testes determinísticos focados no shape do export, na proteção de `reasonCodes` críticos e na ausência de PII/sensitives serializados. O gate permaneceu estrito: não houve relaxamento de CI, não houve allowlist genérica nova e não houve alteração em runtime, engine, workflows ou `ChatAgentLauncher`.

## Pré-condição de CI F2.7
Pré-condição confirmada em `main` antes do diff desta etapa:

- Merge F2.7 presente em `main`: `560ca8a Merge pull request #283 from 5906375/feat/f2-7-read-only-bundle-export-contract`
- `CI Monorepo`
  - Run ID: `29442995400`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29442995400`
- `IMOB Worker Mutation E2E`
  - Run ID: `29442995334`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29442995334`

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `apps/api/src/services/whatsappBundleExport.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/checkOrphanTests.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `ops/evidence/latest/f2-07-read-only-adapter-run-bundle-export-contract-2026-07-15.md`

## Problema resolvido
F2.7 criou o `bundleExport` versionado, mas ainda faltava um gate explícito de compatibilidade para provar que o contrato v1 não deriva silenciosamente em shape, campos extras, `reasonCodes` críticos ou exposição de PII durante serialização do handler read-only. F2.8 fecha essa lacuna com testes pequenos, determinísticos e executáveis localmente.

## Contrato congelado
Contrato congelado nesta etapa:

- `version`: `whatsapp.read_only.bundle_export.v1`
- `decision`: derivado do `decisionClass` sanitizado
- `reasonCode`: somente valor canônico de decisão/bloqueio
- `status`: HTTP status correspondente
- `eventId`
- `provider`
- `messageType`
- `tenantId`
- `workspaceId`
- `scope`
- `sideEffects`: `0`
- `piiMasked`: `true`
- `receivedAt`
- `providerTimestamp`
- `exportedAt`

## Baseline de compatibilidade
Baseline protegida pelo teste:

1. keyset exato do export v1, sem campos extras;
2. `version` fixa em `whatsapp.read_only.bundle_export.v1`;
3. `sideEffects=0`;
4. `piiMasked=true`;
5. preservação de `status`, `decision` e timestamps;
6. `reasonCodes` críticos permanecem exportáveis nos cenários read-only aceito/bloqueado;
7. resposta serializada não vaza PII, payload sensível, segredo ou texto bruto.

## Campos permitidos
Campos permitidos e congelados no `bundleExport` v1:

- `decision`
- `eventId`
- `exportedAt`
- `messageType`
- `piiMasked`
- `provider`
- `providerTimestamp`
- `reasonCode`
- `receivedAt`
- `scope`
- `sideEffects`
- `status`
- `tenantId`
- `version`
- `workspaceId`

## Campos proibidos
O gate de compatibilidade passa a impedir, no export e na serialização do handler, a presença de:

- `fromPhoneHash`
- telefone bruto
- texto bruto da mensagem
- segredo stub de assinatura
- header de assinatura
- `rawPayloadRef`
- qualquer campo adicional fora do keyset permitido

## ReasonCodes protegidos
Lista explícita protegida pelo teste de compatibilidade:

- `ACCEPTED_READ_ONLY`
- `WHATSAPP_SIGNATURE_INVALID`
- `WHATSAPP_PHONE_NOT_BOUND`
- `TENANT_NOT_RESOLVED`
- `WORKSPACE_NOT_RESOLVED`
- `ENTITLEMENT_REQUIRED`
- `SESSION_EXPIRED`
- `WHATSAPP_REPLAY_DETECTED`
- `WHATSAPP_EVENT_DUPLICATE`
- `CRITICAL_ACTION_BLOCKED`
- `READ_ONLY_MODE`

## Versionamento
O contrato permanece em `v1` sem declarar compatibilidade futura implícita. Qualquer evolução de shape, campo ou semântica exige:

1. mudança explícita do contrato;
2. evidência nova;
3. atualização deliberada do gate de compatibilidade;
4. revisão separada de backward compatibility.

## Read-only enforcement
F2.8 não altera a execução do webhook. O enforcement read-only continua vindo do handler e dos serviços canônicos já evidenciados em F2.3–F2.7. Esta etapa apenas congela e verifica a superfície exportável/auditável sem introduzir mutações.

## Side-effect zero
Os testes preservam e reafirmam:

- `sideEffects=0` no `evidenceBundle`;
- `sideEffects=0` no `bundleExport`;
- ausência de provider real;
- ausência de mutação, enqueue, write externo, secret produtivo ou side effect operacional.

## PII masking
O teste de masking passou a verificar também ausência de:

- texto bruto da mensagem;
- `Authorization`;
- `fromPhoneHash`;
- telefone bruto;
- `rawPayloadRef`;
- segredo stub de assinatura;
- header `x-eiah-signature`.

## Testes adicionados/ajustados
Em `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`:

- congelamento do keyset exato de `bundleExport` v1;
- verificação de `version`, `status`, `decision`, `sideEffects`, `piiMasked` e timestamps;
- reforço da ausência de PII/sensitives no payload serializado;
- gate de compatibilidade para `reasonCodes` críticos em cenários aceito/bloqueado.

Nenhum teste existente foi removido.

## Orphan test compliance
`check:orphan-tests` permaneceu estrito e verde. Não houve relaxamento de allowlist, não houve desativação do gate e não houve remoção de cobertura.

## Checks executados
Saídas reais desta etapa:

```text
$ pnpm check:orphan-tests
{
  "ok": true,
  "check": "check:orphan-tests",
  "testFileCount": 54,
  "manifestCount": 54,
  "allowlistedOrphanCount": 50,
  "blockingOrphanCount": 0
}
```

```text
$ node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ node --import tsx --test apps/api/src/tests/channel-binding.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ node --import tsx --test apps/api/src/tests/replay-guard.test.ts
# tests 1
# pass 1
# fail 0
```

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 205878,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 531
}
```

```text
$ pnpm check:docs-link-integrity
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

```text
$ git diff --check
sem saída
```

```text
$ git diff -- .github/workflows release.yml apps packages scripts
saída limitada ao arquivo permitido:
- apps/api/src/tests/whatsapp.webhook-read-only.test.ts
```

## Prova de isolamento
F2.8 não alterou:

- `.github/workflows/**`
- `release.yml`
- `apps` fora do teste focado `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `packages/**`
- `scripts/**`
- runtime
- engine
- `ChatAgentLauncher`
- provider real
- secrets produtivos

## Riscos residuais
- O gate congela o contrato v1, mas não cobre ainda uma futura estratégia de version bump com coexistência multi-versão.
- A proteção de `reasonCodes` está focada no conjunto crítico atual; novos códigos futuros exigirão atualização deliberada do gate.
- A etapa continua local/read-only; não adiciona novo run externo ou integração provider real.

## Próximos passos
- Se houver evolução do export, abrir etapa separada com versionamento explícito.
- Se surgirem novos `reasonCodes` críticos, adicioná-los ao gate com evidência dedicada.
- Manter o webhook WhatsApp estritamente read-only até autorização separada de mudança de modo operacional.

## Status final
Status: parcial/evidenciado
