# EIAH Multichannel Plan Investigation — 2026-07-09

Status: parcial/evidenciado

## 1. Escopo executado

Investigacao read-only para planejar a evolucao do front door EIAH para `web_desktop`, `web_mobile` e `whatsapp`, sem alterar runtime, agentes, API, Prisma, workers, billing/economy, feature IMOB ou `ChatAgentLauncher`.

Artefato de plano criado:

- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md`

## 2. Estado inicial

Comandos executados antes da escrita documental:

```text
git status --short
```

Resultado observado:

```text
 M ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md
```

Classificacao: alteracao pre-existente no working tree. Esta investigacao nao tocou no roadmap e nao tentou reverter mudanca de usuario.

Branch e commit:

```text
main
d043b1a
```

## 3. Arquivos lidos

Fontes normativas e operacionais lidas:

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md`
- `apps/web/src/lib/api.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/api/src/services/imob/imobAccessGate.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/intake/imobContractPiiMasker.ts`
- `apps/api/src/orchestrator/llmExecutor.ts`
- `apps/api/src/routes/session.ts`
- `apps/web/src/state/sessionStore.ts`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/services/imob/imobScaleRuntime.ts`
- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
- `apps/api/src/services/runEvents.ts`
- `apps/api/src/services/runEventOutbox.ts`
- `apps/api/src/workers/runWorkerGuardianOutput.ts`
- `apps/api/src/workers/imobPostRunMutationWorker.ts`
- `apps/api/src/services/contracts/contractGenerator.ts`
- `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts`
- `packages/core/src/actions/reporting/mktCampaignReportRenderer.ts`

## 4. Evidencia principal

| Tema | Evidencia |
| --- | --- |
| Regra agent-driven obrigatoria | `AGENTS.md:5`, `AGENTS.md:7`, `AGENTS.md:8`, `AGENTS.md:9`, `AGENTS.md:10`, `docs/architecture/agent-chat-runtime.md:80`, `docs/architecture/agent-chat-runtime.md:85` |
| Launcher render-first | `docs/architecture/agent-chat-runtime.md:60`, `docs/architecture/agent-chat-runtime.md:64`, `docs/architecture/agent-chat-runtime.md:73`, `docs/architecture/agent-chat-runtime.md:78`, `docs/architecture/agent-chat-runtime.md:418` |
| Access gate estruturado | `apps/api/src/services/imob/imobAccessGate.ts:24`, `apps/api/src/services/imob/imobAccessGate.ts:45`, `apps/api/src/services/imob/imobAccessGate.ts:54`, `apps/api/src/services/imob/imobAccessGate.ts:73`, `apps/api/src/services/imob/imobAccessGate.ts:146`, `apps/api/src/services/imob/imobAccessGate.ts:186` |
| API web preserva body de erro | `apps/web/src/lib/api.ts:37`, `apps/web/src/lib/api.ts:45`, `apps/web/src/lib/api.ts:936`, `apps/web/src/lib/api.ts:1004` |
| Chat IMOB tem trechos que degradam erro estruturado para mensagem generica | `apps/web/src/pages/app/imob/chat.tsx:2876`, `apps/web/src/pages/app/imob/chat.tsx:2895`, `apps/web/src/pages/app/imob/chat.tsx:3651`, `apps/web/src/pages/app/imob/chat.tsx:3705` |
| Business read expoe specialist support de modo restrito | `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2785`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2788`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2956`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2966`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:3051`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:3053` |
| Next action operacional existe | `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:5`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:12`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:25`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:37`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:59`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:103` |
| Schema IMOB tem `metadata`, mas nao campo canonico dedicado de canal/binding/missao | `packages/db/prisma/schema.prisma:930`, `packages/db/prisma/schema.prisma:945`, `packages/db/prisma/schema.prisma:958`, `packages/db/prisma/schema.prisma:974` |
| Run, RunEvent, ledger e SCL existem | `packages/db/prisma/schema.prisma:181`, `packages/db/prisma/schema.prisma:210`, `packages/db/prisma/schema.prisma:254`, `packages/db/prisma/schema.prisma:264`, `packages/db/prisma/schema.prisma:522`, `packages/db/prisma/schema.prisma:528`, `packages/db/prisma/schema.prisma:546`, `packages/db/prisma/schema.prisma:555` |
| Run events/outbox existem | `apps/api/src/services/runEvents.ts:47`, `apps/api/src/services/runEvents.ts:66`, `apps/api/src/services/runEvents.ts:92`, `apps/api/src/services/runEvents.ts:108`, `apps/api/src/services/runEventOutbox.ts:64`, `apps/api/src/services/runEventOutbox.ts:120` |
| `lead.create` existe no service CRM | `apps/api/src/services/imob/crm/imobCrmMutationService.ts:566`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:584`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:586`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:604`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:1302`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:1307` |
| Runtime IMOB de escala conhece `whatsapp`, mas nao equivale a front door WhatsApp | `apps/api/src/services/imob/imobScaleRuntime.ts:11`, `apps/api/src/services/imob/imobScaleRuntime.ts:13`, `apps/api/src/services/imob/imobScaleRuntime.ts:63`, `apps/api/src/services/imob/imobScaleRuntime.ts:70`, `apps/api/src/services/imob/imobScaleRuntime.ts:113`, `apps/api/src/services/imob/imobScaleRuntime.ts:145` |
| PII masking dividido | `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:7`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:11`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:54`, `apps/api/src/orchestrator/llmExecutor.ts:40`, `apps/api/src/orchestrator/llmExecutor.ts:45`, `apps/api/src/orchestrator/llmExecutor.ts:58`, `apps/api/src/orchestrator/llmExecutor.ts:70` |
| Closing Output segue ausente/parcial | `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:36`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:72`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:158`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:174` |

## 5. Buscas relevantes

Comandos de busca executados durante a investigacao:

```text
rg -n "whatsapp|WhatsApp|providerMessageId|idempotencyKey|phoneHash|channelBinding|channel binding" apps packages scripts docs/architecture docs/ops ops/evidence/latest --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/backup-*.sql'
rg -n "model Run |model RunEvent |model GuardrailLedger|model GuardrailAuditLedger|model AuditEvent|model Outbox" packages/db/prisma/schema.prisma
rg -n "verifyUrl|receiptPath|bundlePath|txId|ledger" apps/api/src/routes apps/api/src/workers apps/api/src/services/runEventOutbox.ts apps/api/src/services/runEvents.ts apps/api/src/services/runEventsRedisTransport.ts --glob '!**/dist/**'
rg -n "imobLead\\.create|imobLead\\.update|imobLead\\.find|ImobLead|lead.qualify|lead.*dedupe|discard" apps/api/src/services/imob/crm/imobCrmMutationService.ts apps/api/src/routes/imob.ts apps/api/src/services/imob/crm/imobCrmTurnEngine.ts apps/api/src/services/imob/crm/imobCrmOperationalLead.ts apps/api/src/services/imob/crm/imobCrmOperationalLeadList.ts
```

Resultado consolidado:

- Foram encontrados usos de `whatsapp` como canal semantico, runtime de escala, reporting/copy e testes IMOB.
- Nao foi encontrado contrato canonico de `ChannelBinding`, `phoneHash` ou webhook WhatsApp governado equivalente ao front door multicanal.
- Foram encontrados mecanismos de idempotencia em run/actions/IMOB scale, mas nao um replay guard canonico para provider inbound WhatsApp.

## 6. Decisoes de validacao

`pnpm test:ci-unit-suite` nao foi executado nesta etapa.

Motivo: a tarefa e documental/read-only de investigacao; a suite ampla e longa e nao e necessaria para comprovar ausencia de runtime diff. Foram priorizados checks documentais, checks de governanca aplicaveis e diffs por escopo.

Risco: uma suite ampla poderia detectar regressao pre-existente nao relacionada ao plano.

Como validar depois: executar `pnpm test:ci-unit-suite` em PR de implementacao runtime, nao nesta PR documental de plano.

## 7. Checks

Resultado real dos checks executados nesta sessao:

| Comando | Resultado | Observacao |
| --- | --- | --- |
| `pnpm check:evidence-index` | PASS | `ok=true`, `refsChecked=400` |
| `pnpm check:docs-link-integrity` | PASS | `ok=true`, `filesChecked=15`; incluiu `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md` nos targets locais |
| `pnpm check:chat-launcher-render-only` | PASS | `ok=true`, `violations=[]` |
| `pnpm check:receipt-canon-compat` | PASS | `ok=true`, `schemaVersion=1.0.0` |
| `git diff --check` | PASS | sem saida |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | PASS | diff vazio |
| `git diff -- apps/api/src` | PASS | diff vazio |
| `git diff -- apps/web/src` | PASS | diff vazio |
| `git diff -- packages` | PASS | diff vazio |
| `git status --short` | PARCIAL | mostrou `M ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` pre-existente, `M docs/EVIDENCE_INDEX.md` e a evidencia nova |

## 8. Observacao sobre versionamento do plano

O arquivo `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md` foi criado no filesystem, mas `git check-ignore -v` retornou:

```text
.gitignore:52:docs/architecture/* docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md
```

Isso significa que o plano esta ignorado por regra ampla existente. Esta sessao nao alterou `.gitignore`, conforme escopo restrito. Para versionar o plano em commit futuro, sera necessario tratamento explicito fora desta etapa, por exemplo `git add -f docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md`, se aprovado pelo responsavel da PR.

## 9. Classificacao

Status da investigacao: `parcial/evidenciado`.

Motivos:

- O plano e a evidencia foram gerados a partir de leitura real de arquivos do repositório.
- Nenhum runtime multicanal foi implementado.
- WhatsApp front door canonico permanece inexistente/parcial.
- Binding, replay guard, provider signature, HITL por canal e pilot mutations ainda dependem de PRs futuras.
- Closing Output IMOB permanece gap N-08.
