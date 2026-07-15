# F2.3 — WhatsApp Adapter Read-Only Handler / Endpoint Controlled Implementation — 2026-07-15

## Resumo executivo

F2.3 implementa localmente um endpoint controlado `POST /api/webhooks/whatsapp/inbound` em modo estritamente `read-only`, montado na API Express existente, sem provider real, sem secret produtivo, sem mutações e sem side effects externos. O handler valida headers mínimos, payload mínimo, assinatura stub versionada, janela temporal, replay/duplicidade em memória local de processo, binding governado por configuração JSON e bloqueio explícito de ações críticas. O teste executado nesta etapa invoca o handler exportado diretamente, preservando a semântica HTTP lógica sem depender de socket local no sandbox.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f1-07d-first-real-ci-informative-mobile-smoke-run-2026-07-15.md`
- `ops/evidence/latest/f1-07f-mobile-smoke-informative-recurrence-promotion-policy-2026-07-15.md`
- `ops/evidence/latest/f2-00-whatsapp-adapter-read-only-binding-fail-closed-design-2026-07-15.md`
- `ops/evidence/latest/f2-01-whatsapp-adapter-technical-contract-envelope-signature-plan-2026-07-15.md`
- `ops/evidence/latest/f2-02-whatsapp-adapter-endpoint-webhook-specification-plan-2026-07-15.md`
- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md`
- `apps/api/src/index.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/middlewares/asyncHandler.ts`
- `apps/api/src/services/masker.ts`
- `apps/api/src/tests/billing.webhook-signature.test.ts`
- `apps/api/src/tests/billing.reputation.disputes.contract.test.ts`
- `apps/api/src/tests/api-global-error-handling.test.ts`
- `apps/api/src/tests/health.contract.test.ts`
- `apps/api/src/tests/support/testInfraEnv.ts`

## Contexto herdado de F2.0/F2.1/F2.2

- F2.0 definiu o adapter WhatsApp como `channel-adapter/render-only`, com binding obrigatório e fail-closed.
- F2.1 definiu envelope versionado, headers obrigatórios, assinatura conceitual, replay protection e idempotência.
- F2.2 definiu o endpoint `POST /api/webhooks/whatsapp/inbound` e os códigos HTTP mínimos esperados.
- WhatsApp continua não operacional nesta etapa.
- Não há provider real integrado, nem uso de secret real.

## Decisão de não abrir F1.7e

F1.7e permanece fechada.

Motivo:
- não houve falha real nova do smoke mobile;
- F2.3 é frente multicanal distinta;
- não houve necessidade de misturar análise/correção de smoke com a borda HTTP do adapter WhatsApp.

## Objetivo da F2.3

Criar um handler local/controlado que prove a superfície HTTP mínima do webhook inbound WhatsApp em modo read-only:

- valida headers mínimos;
- valida envelope mínimo;
- falha fechado em assinatura, timestamp, replay, duplicidade, binding, tenant/workspace, entitlement e ação crítica;
- retorna `202/400/401/403/409/413` conforme F2.2;
- não chama provider, não persiste, não muta, não dispara ações críticas.

## Estrutura do repo inspecionada

- A API real usa `Express` em `apps/api/src/index.ts`.
- Rotas públicas já são montadas em `/api` antes de superfícies protegidas.
- `billingRouter` já fornece um padrão comparável de webhook público com assinatura, timestamp e replay/idempotência na borda HTTP.
- O padrão de teste local para handlers HTTP é `node:test + supertest` com app Express mínimo dedicado.

Decisão:
- a estrutura atual permite implementação segura numa rota nova isolada, sem mover responsabilidade para engine ou launcher.

## Escopo implementado

- novo arquivo `apps/api/src/routes/whatsapp.ts`;
- montagem do `whatsappRouter` em `apps/api/src/index.ts`;
- teste focado `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`;
- evidência F2.3 e atualização do `docs/EVIDENCE_INDEX.md`.

## Fora de escopo preservado

- provider WhatsApp real;
- integração externa;
- secret real;
- mutação de banco;
- criação/descarte de lead;
- side effects externos;
- alteração de `ChatAgentLauncher`;
- alteração de runtime/engine;
- alteração de workflows/CI;
- promoção do gate mobile smoke.

## Endpoint/handler

Endpoint implementado localmente:

```text
POST /api/webhooks/whatsapp/inbound
```

Comportamento:

- aceita apenas `X-EIAH-Provider=whatsapp`;
- exige `X-EIAH-Event-Id`, `X-EIAH-Timestamp`, `X-EIAH-Signature`, `X-EIAH-Signature-Version=v1`;
- exige envelope `whatsapp.adapter.event.v1`;
- usa assinatura stub HMAC local para validação técnica sem secret produtivo;
- usa guarda em memória local do processo para:
  - replay por `eventId + timestamp + assinatura`;
  - duplicidade por `eventId`;
- resolve binding apenas via `WHATSAPP_READ_ONLY_BINDINGS_JSON`;
- retorna `202 ACCEPTED_READ_ONLY` quando tudo passa;
- nunca dispara mutação nem side effect.

## Validações implementadas

- provider suportado
- `eventId` obrigatório em header e body
- `version` obrigatória e fixa
- `receivedAt` e `providerTimestamp` parseáveis
- `fromPhoneHash`, `fromPhoneMasked` e `rawPayloadRef` obrigatórios
- `messageType` permitido apenas em `text | interactive | unknown`
- `text` obrigatório quando `messageType=text`
- `readOnly=true` obrigatório
- assinatura presente, versão suportada e comparação constant-time
- timestamp presente e dentro da janela
- binding presente por `fromPhoneHash`
- `tenantId`, `workspaceId`, `scope` e entitlement vindos do binding governado
- bloqueio de `lead.create`, `lead.discard`, `create`, `update`, `delete`, `publish`, `settle`, `approve`, `mutate`

## Responses e reasonCodes

Responses implementadas:

- `202 ACCEPTED_READ_ONLY`
- `400 WHATSAPP_PAYLOAD_INVALID`
- `400 WHATSAPP_EVENT_ID_MISSING`
- `400 WHATSAPP_PROVIDER_UNSUPPORTED`
- `400 WHATSAPP_MESSAGE_TYPE_UNSUPPORTED`
- `401 WHATSAPP_SIGNATURE_MISSING`
- `401 WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED`
- `401 WHATSAPP_SIGNATURE_INVALID`
- `401 WHATSAPP_TIMESTAMP_MISSING`
- `401 WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`
- `403 WHATSAPP_PHONE_NOT_BOUND`
- `403 TENANT_NOT_RESOLVED`
- `403 WORKSPACE_NOT_RESOLVED`
- `403 ENTITLEMENT_REQUIRED`
- `403 SESSION_EXPIRED`
- `403 READ_ONLY_MODE`
- `403 CRITICAL_ACTION_BLOCKED`
- `409 WHATSAPP_REPLAY_DETECTED`
- `409 WHATSAPP_EVENT_DUPLICATE`
- `413 WHATSAPP_PAYLOAD_TOO_LARGE`

## Read-only enforcement

- o handler não importa Prisma, engine, mutation service, provider client ou worker;
- qualquer indício de ação crítica é bloqueado antes de qualquer outra progressão funcional;
- a resposta de sucesso é apenas `ACCEPTED_READ_ONLY`;
- o código não cria, atualiza, publica, descarta, settle ou chama API externa.

## Fail-closed

Fail-closed implementado para:

- assinatura ausente/inválida
- versão de assinatura não suportada
- timestamp ausente/fora da janela
- payload inválido
- `eventId` ausente
- provider não suportado
- `messageType` não suportado
- replay
- duplicidade
- binding ausente
- tenant/workspace não resolvidos
- entitlement ausente
- sessão expirada
- ação crítica

## PII masking e logging seguro

- o handler exige apenas `fromPhoneHash` e `fromPhoneMasked`;
- nenhum telefone bruto é necessário para passar pelo fluxo;
- a resposta 202 rebaixa o `fromPhoneMasked` para máscara adicional (`+5***67` no teste);
- não há persistência nem evidência textual com payload bruto;
- nenhum secret real foi usado.

## Testes executados

Comando:

```bash
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
```

Saída real resumida:

- `tests: 1`
- `pass: 1`
- `0` falharam

Cobertura exercitada dentro do arquivo:

- evento válido `202 ACCEPTED_READ_ONLY`
- assinatura ausente
- assinatura inválida
- timestamp ausente
- `eventId` ausente
- telefone sem binding
- ação crítica bloqueada
- replay/duplicidade `409`
- payload acima do limite `413`

Observação:

- o sandbox local bloqueou a estratégia inicial com `supertest` por `listen EPERM 0.0.0.0`;
- o teste foi rebaixado para invocação direta do handler exportado, mantendo a mesma superfície lógica de headers/body/status sem abrir socket.

Checks documentais:

```bash
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

## Evidências geradas

- `ops/evidence/latest/f2-03-whatsapp-adapter-read-only-handler-controlled-implementation-2026-07-15.md`

## Prova de isolamento

- `release.yml` intocado
- `.github/workflows/**` intocados
- `packages/**` intocados
- `scripts/**` intocados
- `ChatAgentLauncher` intocado
- runtime/engine intocados
- alterações restritas a:
  - `apps/api/src/routes/whatsapp.ts`
  - `apps/api/src/index.ts`
  - `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - `docs/EVIDENCE_INDEX.md`
  - esta evidência F2.3

## Riscos residuais

- assinatura continua stub/local, não produtiva;
- replay/idempotência são em memória de processo, não distribuídos;
- binding é por config JSON local, não por tabela/baseline canônica;
- não existe provider real nem normalização de payload de Meta/Twilio;
- a superfície continua apropriada apenas para read-only controlado.

## Próximos passos

- F2.3a, se desejado: extrair `ChannelBinding`/guardas para contrato ou storage canônico sem promover operação produtiva.
- F2.4, se autorizada: normalizar envelope/provider compatibility ainda em modo read-only, sem mutações.
- qualquer evolução para mutação deve permanecer em etapa separada com HITL, entitlement, audit trail e evidência própria.

## Status final

Status: parcial/evidenciado
