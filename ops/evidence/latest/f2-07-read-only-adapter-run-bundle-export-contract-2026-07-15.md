# F2.7 — Read-Only Adapter Run/Bundle Export Contract — 2026-07-15

## Resumo executivo

F2.7 define um contrato versionado e determinístico de exportação do bundle observável do adapter WhatsApp read-only. A etapa adiciona `apps/api/src/services/whatsappBundleExport.ts`, reaproveita o `evidenceBundle` sanitizado da F2.6 e expõe um `bundleExport` compatível com ele, contendo apenas campos auditáveis e seguros: `version`, `decision`, `reasonCode`, `status`, `eventId`, `provider`, `messageType`, `tenantId`, `workspaceId`, `scope`, `sideEffects`, `piiMasked` e timestamps seguros. O comportamento read-only, os `reasonCodes`, `ChannelBinding`, `Replay Guard`, a ausência de provider real e o bloqueio de mutações permanecem intactos.

## Pré-condição de CI F2.6

Confirmada antes de qualquer diff:

- `main` em `d53c13e` (`Merge pull request #282 from 5906375/feat/f2-6-read-only-adapter-evidence-bundle`)
- `CI Monorepo`
  - Run ID: `29442024178`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29442024178`
- `IMOB Worker Mutation E2E`
  - Run ID: `29442025660`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29442025660`

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
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `scripts/checkOrphanTests.ts`
- `ops/evidence/latest/f2-06-read-only-adapter-observability-evidence-bundle-2026-07-15.md`

## Problema resolvido

F2.6 melhorou a observabilidade do webhook, mas ainda faltava um contrato de exportação pequeno, versionado e explícito para consumo auditável. O `evidenceBundle` existente já era seguro, porém:

- não possuía `version`;
- não formalizava `piiMasked`;
- usava `httpStatus`, enquanto o contrato de exportação pedido exige `status`;
- não carregava timestamps seguros de forma explícita;
- não distinguia a camada “observabilidade interna” da camada “export auditável”.

## Escopo do Export Contract

Escopo efetivo desta etapa:

- criar `apps/api/src/services/whatsappBundleExport.ts`;
- gerar `bundleExport` derivado do `evidenceBundle` sanitizado;
- manter o contrato determinístico e versionado;
- anexar o `bundleExport` à resposta do handler de forma aditiva e segura;
- validar por teste focado que o export não vaza PII nem sensíveis.

Sem expansão de escopo:

- sem provider real;
- sem secret produtivo;
- sem side effect externo;
- sem storage/ledger produtivo;
- sem mutações.

## Versionamento

Versão introduzida:

- `whatsapp.read_only.bundle_export.v1`

Regra prática desta etapa:

- mudanças aditivas futuras podem evoluir mantendo a família do contrato;
- esta evidência prova apenas a versão `v1` local/controlada;
- não há declaração de compatibilidade produtiva externa além do que foi testado aqui.

## Campos permitidos

Campos permitidos e efetivamente exportados:

- `version`
- `decision`
- `reasonCode`
- `status`
- `eventId`
- `provider`
- `messageType`
- `tenantId`
- `workspaceId`
- `scope`
- `sideEffects`
- `piiMasked`
- `receivedAt`
- `providerTimestamp`
- `exportedAt`

Shape efetivo:

```json
{
  "version": "whatsapp.read_only.bundle_export.v1",
  "decision": "accepted_read_only",
  "reasonCode": "ACCEPTED_READ_ONLY",
  "status": 202,
  "eventId": "evt-whatsapp-valid",
  "provider": "whatsapp",
  "messageType": "text",
  "tenantId": "tenant-imob-read-only",
  "workspaceId": "workspace-imob-read-only",
  "scope": "whatsapp:inbound:read_only",
  "sideEffects": 0,
  "piiMasked": true,
  "receivedAt": "2026-07-15T12:00:00.000Z",
  "providerTimestamp": "2026-07-15T12:00:00.000Z",
  "exportedAt": "2026-07-15T..."
}
```

## Campos proibidos

O contrato exportado não inclui:

- telefone bruto;
- `fromPhoneHash`;
- `fromPhoneMasked` bruto original;
- payload bruto do provider;
- `rawPayloadRef`;
- assinatura completa;
- headers sensíveis;
- token;
- secret;
- `text` da mensagem;
- qualquer referência a mutação operacional.

## PII masking

Garantias validadas:

- `piiMasked: true` é explícito no export;
- o export não carrega telefone bruto;
- o export não carrega `phoneHash`;
- o export não carrega `rawPayloadRef`;
- o teste valida ausência de secret, header de assinatura e payload bruto sensível na serialização final.

## Read-only enforcement

O export não altera o enforcement:

- o handler segue read-only;
- `decision` apenas reflete `accepted_read_only` ou `blocked`;
- `sideEffects` permanece `0`;
- nenhuma ação crítica é destravada;
- `ChannelBinding` e `Replay Guard` continuam sendo as fontes canônicas de decisão.

## Side-effect zero

Esta etapa preserva `sideEffects=0` em todos os exports.

Prova local:

- o serviço novo apenas transforma dados já sanitizados;
- não houve escrita externa;
- não houve persistência nova;
- não houve chamada de provider;
- não houve integração econômica/ledger.

## ReasonCodes preservados

Os `reasonCodes` existentes foram preservados sem renomear para “passar teste”.

Superfícies confirmadas:

- `ACCEPTED_READ_ONLY`
- `WHATSAPP_SIGNATURE_INVALID`
- `TENANT_NOT_RESOLVED`
- e todos os demais `reasonCodes` já emitidos pelo handler continuam dependentes das mesmas decisões canônicas.

## Testes adicionados/ajustados

Arquivo ajustado:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

Cobertura adicionada:

- validação do `bundleExport` de sucesso;
- validação do `bundleExport` de bloqueio;
- validação de `version`, `decision`, `status`, `piiMasked`, `sideEffects`, `receivedAt`, `providerTimestamp`, `exportedAt`;
- reforço de ausência de `fromPhoneHash`, telefone bruto e `rawPayloadRef` na serialização final.

Arquivos mantidos sem ajuste:

- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`

## Orphan test compliance

Nenhum arquivo de teste novo foi criado.

Consequências:

- `scripts/unit-tests-manifest.txt` permaneceu intocado;
- `package.json` permaneceu intocado;
- `check:orphan-tests` permaneceu verde com `blockingOrphanCount: 0`.

## Checks executados

Comandos executados:

```bash
pnpm check:orphan-tests
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
node --import tsx --test apps/api/src/tests/channel-binding.test.ts
node --import tsx --test apps/api/src/tests/replay-guard.test.ts
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

Saída real resumida:

- `pnpm check:orphan-tests`
  - `ok: true`
  - `blockingOrphanCount: 0`
- `node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - `pass 1`
  - `fail 0`
- `node --import tsx --test apps/api/src/tests/channel-binding.test.ts`
  - `pass 1`
  - `fail 0`
- `node --import tsx --test apps/api/src/tests/replay-guard.test.ts`
  - `pass 1`
  - `fail 0`
- `pnpm check:evidence-index`
  - `ok: true`
  - `refsChecked: 530`
- `pnpm check:docs-link-integrity`
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`
  - sem saída
- `git diff -- .github/workflows release.yml apps packages scripts`
  - diff apenas em `apps/api/src/routes/whatsapp.ts`, `apps/api/src/services/whatsappBundleExport.ts` e `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - sem diff em `.github/workflows`
  - sem diff em `release.yml`
  - sem diff em `packages/**`
  - sem diff em `scripts/**`

## Prova de isolamento

Sem alteração em:

- `.github/workflows/**`
- `release.yml`
- `package.json`
- `scripts/unit-tests-manifest.txt`
- `scripts/checkOrphanTests.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `ChatAgentLauncher`
- runtime/engine

## Riscos residuais

- o contrato continua local/controlado;
- `exportedAt` é timestamp local de montagem, não prova entrega externa;
- a assinatura ainda é stub/local;
- `Replay Guard` continua em memória;
- não há provider real nem trilha produtiva de export.

## Próximos passos

- manter qualquer evolução futura do adapter em modo estritamente read-only;
- se houver etapa futura de arquivo/receipt externo, reaproveitar este contrato como base auditável;
- não declarar webhook produtivo, provider integrado ou mutação habilitada sem etapa separada e evidência real.

## Status final

Status: parcial/evidenciado
