# F2.5 — Read-Only Adapter Operational Hardening / Negative E2E Matrix — 2026-07-15

## Resumo executivo

F2.5 endurece operacionalmente a superfície read-only do adapter WhatsApp sem alterar código de produção. A etapa expande a matriz negativa do teste `apps/api/src/tests/whatsapp.webhook-read-only.test.ts` para cobrir `status HTTP`, `reasonCode`, preservação de `read-only`, ausência de side effect observável e masking de PII. `ChannelBinding` e `Replay Guard` canônicos permanecem intactos. Não houve integração de provider real, uso de secret produtivo, mutação ou side effect externo.

## Pré-condição de CI F2.4

Pré-condição confirmada antes de qualquer diff:

- F2.4 mergeada em `main` no commit `c16c922`
- Workflow `CI Monorepo`
  - Run ID: `29439409509`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29439409509`
- Workflow `IMOB Worker Mutation E2E`
  - Run ID: `29439410120`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29439410120`

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
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `scripts/checkOrphanTests.ts`
- `ops/evidence/latest/f2-04-channelbinding-replay-guard-canonicalization-2026-07-15.md`

## Problema resolvido

F2.4 já havia canonizado `ChannelBinding` e `Replay Guard`, mas a matriz negativa do webhook ainda não cobria explicitamente todos os cenários mínimos esperados na borda read-only:

- versão de assinatura não suportada
- timestamp fora da janela
- provider não suportado
- `messageType` não suportado
- payload inválido
- tenant ausente
- workspace ausente
- entitlement ausente
- sessão expirada
- mutação implícita
- `readOnly=false`
- confirmação objetiva de masking de PII

F2.5 fecha essa lacuna apenas em teste/evidência.

## Escopo da matriz negativa

Escopo efetivo desta etapa:

- ampliar `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- validar `status HTTP` e `reasonCode`
- confirmar `side-effect zero` observável na borda
- confirmar ausência de PII bruta na resposta
- preservar `ChannelBinding` e `Replay Guard` canônicos

Sem novo arquivo de teste:

- a matriz continuou legível no arquivo existente
- não foi necessário alterar `scripts/unit-tests-manifest.txt`
- não foi necessário alterar `package.json`

## Cenários cobertos

Cenários negativos e de endurecimento cobertos após F2.5:

- assinatura ausente
- assinatura inválida
- versão de assinatura não suportada
- timestamp ausente
- timestamp fora da janela
- `eventId` ausente
- `eventId` duplicado
- replay detectado
- provider não suportado
- `messageType` não suportado
- payload inválido
- payload grande
- phone sem binding
- tenant ausente
- workspace ausente
- entitlement ausente
- sessão expirada
- tentativa de ação crítica
- tentativa de mutação implícita
- `readOnly=false`
- confirmação de PII masking

## ReasonCodes validados

`reasonCodes` validados nesta etapa:

- `ACCEPTED_READ_ONLY`
- `WHATSAPP_SIGNATURE_MISSING`
- `WHATSAPP_SIGNATURE_INVALID`
- `WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED`
- `WHATSAPP_TIMESTAMP_MISSING`
- `WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`
- `WHATSAPP_EVENT_ID_MISSING`
- `WHATSAPP_REPLAY_DETECTED`
- `WHATSAPP_EVENT_DUPLICATE`
- `WHATSAPP_PROVIDER_UNSUPPORTED`
- `WHATSAPP_MESSAGE_TYPE_UNSUPPORTED`
- `WHATSAPP_PAYLOAD_INVALID`
- `WHATSAPP_PAYLOAD_TOO_LARGE`
- `WHATSAPP_PHONE_NOT_BOUND`
- `TENANT_NOT_RESOLVED`
- `WORKSPACE_NOT_RESOLVED`
- `ENTITLEMENT_REQUIRED`
- `SESSION_EXPIRED`
- `CRITICAL_ACTION_BLOCKED`
- `READ_ONLY_MODE`

## Read-only enforcement

O comportamento read-only permanece intacto:

- o handler continua aceitando apenas eventos `readOnly=true`
- ações críticas explícitas seguem bloqueadas
- mutações implícitas em `requestedAction` seguem bloqueadas
- `readOnly=false` segue falhando fechado com `READ_ONLY_MODE`
- nenhum fluxo de `lead.create` ou `lead.discard` foi habilitado

## Side-effect zero

F2.5 não introduz side effects. A prova local continua sendo:

- falhas de validação retornam resposta HTTP + `reasonCode`
- nenhuma falha cria mutação ou chamada externa
- o caso `timestamp fora da janela` foi seguido por um envio válido do mesmo `eventId`, que retornou `202`, provando que a rejeição anterior não “consumiu” indevidamente o evento no `Replay Guard`

## PII masking

Masking confirmado:

- a resposta de sucesso continua retornando `fromPhoneMasked` rebaixado (`+5***67`)
- o teste validou que a resposta serializada não contém telefone bruto
- o teste validou que a resposta serializada não contém o `phoneHash`
- nenhum payload bruto foi registrado nesta evidência

## Testes adicionados/ajustados

Arquivo ajustado:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

Novos cenários adicionados nesse arquivo:

- versão de assinatura não suportada
- timestamp fora da janela sem consumo de estado
- provider não suportado
- `messageType` não suportado
- payload inválido
- tenant ausente
- workspace ausente
- entitlement ausente
- sessão expirada
- mutação implícita
- `readOnly=false`
- masking de PII

Arquivos mantidos sem ajuste:

- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`

## Orphan test compliance

Nenhum arquivo de teste novo foi criado.

Consequências:

- `scripts/unit-tests-manifest.txt` permaneceu intocado
- `package.json` permaneceu intocado
- `scripts/checkOrphanTests.ts` permaneceu intocado
- `pnpm check:orphan-tests` passou com `blockingOrphanCount: 0`

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
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - `pass 1`
  - `fail 0`
- `apps/api/src/tests/channel-binding.test.ts`
  - `pass 1`
  - `fail 0`
- `apps/api/src/tests/replay-guard.test.ts`
  - `pass 1`
  - `fail 0`
- `pnpm check:evidence-index`
  - `ok: true`
  - `refsChecked: 528`
- `pnpm check:docs-link-integrity`
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`
  - sem saída
- `git diff -- .github/workflows release.yml apps packages scripts`
  - diff apenas em `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - sem diff em `.github/workflows/**`
  - sem diff em `release.yml`
  - sem diff em `packages/**`
## Prova de isolamento

Alterações desta etapa restritas a:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f2-05-read-only-adapter-operational-hardening-negative-e2e-matrix-2026-07-15.md`

Sem alteração em:

- `.github/workflows/**`
- `release.yml`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `ChatAgentLauncher`
- runtime/engine

## Riscos residuais

- o adapter continua não operacional
- assinatura continua stub/local
- `Replay Guard` continua em memória de processo
- `ChannelBinding` continua por config governada, não por storage produtivo
- a evidência continua local/controlada, sem provider real

## Próximos passos

- manter futuras evoluções do adapter em etapas separadas para:
  - provider real
  - persistência distribuída de replay guard
  - storage canônico de binding
  - qualquer mutação/HITL/audit trail produtivo

## Status final

Status: parcial/evidenciado
