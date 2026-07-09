# EIAH Multichannel Implementation Plan v1

Status: parcial/evidenciado
Data: 2026-07-09

## 1. Escopo

Este plano consolida uma investigacao read-only para evoluir o front door do EIAH para tres canais: `web_desktop`, `web_mobile` e `whatsapp`.

O objetivo nao e implementar feature nesta etapa. O objetivo e definir o menor caminho governado para implementar multicanal sem violar a arquitetura `agent-driven`, sem criar regra cognitiva no `ChatAgentLauncher` e sem permitir mutacao critica fora de contrato, engine, policy, HITL, receipt e ledger.

## 2. Fontes normativas

| Fonte | Evidencia |
| --- | --- |
| `CODEX.md` exige leitura de roadmap, `AGENTS.md`, runtime de chat e Evidence Index antes de alteracoes | `CODEX.md:7`, `CODEX.md:9`, `CODEX.md:10`, `CODEX.md:11`, `CODEX.md:12` |
| Evidence Index so pode apontar para evidencia real existente | `CODEX.md:28`, `CODEX.md:29`, `IA_EIAH.md:230`, `IA_EIAH.md:232`, `IA_EIAH.md:234`, `IA_EIAH.md:235`, `IA_EIAH.md:238` |
| Regra-mae do chat: agente define, engine executa, launcher renderiza | `AGENTS.md:5`, `AGENTS.md:7`, `AGENTS.md:8`, `AGENTS.md:9`, `AGENTS.md:10`, `AGENTS.md:13`, `AGENTS.md:15`, `AGENTS.md:16`, `docs/architecture/agent-chat-runtime.md:80`, `docs/architecture/agent-chat-runtime.md:82`, `docs/architecture/agent-chat-runtime.md:83`, `docs/architecture/agent-chat-runtime.md:84`, `docs/architecture/agent-chat-runtime.md:85` |
| `ChatAgentLauncher` deve permanecer render-first e nao concentrar regra de negocio | `docs/architecture/agent-chat-runtime.md:60`, `docs/architecture/agent-chat-runtime.md:62`, `docs/architecture/agent-chat-runtime.md:64`, `docs/architecture/agent-chat-runtime.md:73`, `docs/architecture/agent-chat-runtime.md:74`, `docs/architecture/agent-chat-runtime.md:75`, `docs/architecture/agent-chat-runtime.md:76`, `docs/architecture/agent-chat-runtime.md:77`, `docs/architecture/agent-chat-runtime.md:78` |
| Execucao sensivel deve validar tenant, workspace, entitlement, policy, reasonCode, audit trail e receipt/bundle/ledger quando aplicavel | `IA_EIAH.md:148`, `IA_EIAH.md:152`, `IA_EIAH.md:157`, `IA_EIAH.md:212`, `IA_EIAH.md:214`, `IA_EIAH.md:215`, `IA_EIAH.md:216`, `IA_EIAH.md:217`, `IA_EIAH.md:218`, `IA_EIAH.md:221`, `IA_EIAH.md:222`, `IA_EIAH.md:223`, `IA_EIAH.md:224`, `IA_EIAH.md:226` |

## 3. Evidencia observada

| Frente | Status | Evidencia |
| --- | --- | --- |
| Web/API ja preserva corpo estruturado de erro, mas partes do chat convertem erro em string generica | `parcial` | `apps/web/src/lib/api.ts:37`, `apps/web/src/lib/api.ts:936`, `apps/web/src/lib/api.ts:1004`, `apps/web/src/pages/app/imob/chat.tsx:2876`, `apps/web/src/pages/app/imob/chat.tsx:2895`, `apps/web/src/pages/app/imob/chat.tsx:3651`, `apps/web/src/pages/app/imob/chat.tsx:3705` |
| Access gate IMOB tem `reasonCode`, CTA, detalhes e resposta HTTP fail-closed | `evidenciado` | `apps/api/src/services/imob/imobAccessGate.ts:24`, `apps/api/src/services/imob/imobAccessGate.ts:45`, `apps/api/src/services/imob/imobAccessGate.ts:54`, `apps/api/src/services/imob/imobAccessGate.ts:73`, `apps/api/src/services/imob/imobAccessGate.ts:146`, `apps/api/src/services/imob/imobAccessGate.ts:186` |
| Specialist support hoje aparece de forma restrita no business read de pipeline | `parcial` | `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2785`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2788`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2956`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:2966`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:3051`, `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts:3053` |
| Next action ja possui resolvedor operacional, mas a persistencia de missao/canal ainda nao e campo canônico dedicado no schema IMOB | `parcial` | `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:5`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:12`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:25`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:37`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:59`, `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:103`, `packages/db/prisma/schema.prisma:958`, `packages/db/prisma/schema.prisma:974` |
| Receipt, bundle e verify URL ja existem como conceitos de audit output, mas Closing Output completo permanece gap N-08 | `parcial` | `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:124`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:138`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:158`, `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md:174`, `apps/api/src/workers/runWorkerGuardianOutput.ts:193`, `apps/api/src/workers/runWorkerGuardianOutput.ts:200`, `apps/api/src/workers/imobPostRunMutationWorker.ts:208`, `apps/api/src/workers/imobPostRunMutationWorker.ts:214` |
| Run events e outbox existem para runs, com Redis best-effort/outbox | `parcial` | `packages/db/prisma/schema.prisma:181`, `packages/db/prisma/schema.prisma:210`, `packages/db/prisma/schema.prisma:254`, `packages/db/prisma/schema.prisma:264`, `apps/api/src/services/runEvents.ts:47`, `apps/api/src/services/runEvents.ts:66`, `apps/api/src/services/runEvents.ts:92`, `apps/api/src/services/runEvents.ts:108`, `apps/api/src/services/runEventOutbox.ts:64`, `apps/api/src/services/runEventOutbox.ts:120` |
| IMOB lead create existe no service CRM e registra auditoria/shadow; nao ha endpoint/adaptador WhatsApp governado reutilizando isso | `parcial` | `apps/api/src/services/imob/crm/imobCrmMutationService.ts:566`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:584`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:586`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:604`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:1302`, `apps/api/src/services/imob/crm/imobCrmMutationService.ts:1307` |
| IMOB tem runtime de escala com canal `whatsapp`, rate limit e idempotencia, mas nao e binding de usuario/canal para front door | `parcial` | `apps/api/src/services/imob/imobScaleRuntime.ts:11`, `apps/api/src/services/imob/imobScaleRuntime.ts:13`, `apps/api/src/services/imob/imobScaleRuntime.ts:63`, `apps/api/src/services/imob/imobScaleRuntime.ts:70`, `apps/api/src/services/imob/imobScaleRuntime.ts:113`, `apps/api/src/services/imob/imobScaleRuntime.ts:145` |
| PII masking esta dividido entre mascarador especifico IMOB e sanitizacao generica de LLM | `parcial` | `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:7`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:11`, `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:54`, `apps/api/src/orchestrator/llmExecutor.ts:40`, `apps/api/src/orchestrator/llmExecutor.ts:45`, `apps/api/src/orchestrator/llmExecutor.ts:58`, `apps/api/src/orchestrator/llmExecutor.ts:70` |
| Sessao web possui tenant/workspace/user/token/entitlements, mas nao ha binding canonico de telefone/provedor por canal | `parcial` | `apps/api/src/routes/session.ts:87`, `apps/api/src/routes/session.ts:117`, `apps/api/src/routes/session.ts:239`, `apps/api/src/routes/session.ts:286`, `apps/api/src/routes/session.ts:339`, `apps/api/src/routes/session.ts:430`, `apps/web/src/state/sessionStore.ts:5`, `apps/web/src/state/sessionStore.ts:154`, `apps/web/src/state/sessionStore.ts:233`, `apps/web/src/state/sessionStore.ts:268` |
| Document outputs existem, mas nao equivalem a Closing Output | `parcial` | `apps/api/src/services/contracts/contractGenerator.ts:114`, `apps/api/src/services/contracts/contractGenerator.ts:140`, `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts:1`, `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts:3`, `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts:50`, `apps/api/src/services/imob/intake/imobContractIntakeRenderer.ts:113`, `packages/core/src/actions/reporting/mktCampaignReportRenderer.ts:24`, `packages/core/src/actions/reporting/mktCampaignReportRenderer.ts:40` |

## 4. Inferencias

1. `web_desktop` e `web_mobile` devem continuar usando o mesmo contrato de presentation. A diferenca deve ser responsividade/degradacao de UI, nao regra de negocio nova.
2. `whatsapp` nao deve entrar como bot paralelo. Deve ser adapter render-only que transforma texto, quick replies, CTA e deep links a partir de uma resposta ja resolvida pelo agent runtime.
3. Sem `ChannelBinding` canonico, qualquer mutacao via WhatsApp deve falhar fechada. A falta de tenant, workspace, user, entitlement, escopo ou assinatura valida deve produzir bloqueio auditavel, nao fallback permissivo.
4. Como `lead.create` ja existe em service CRM, o piloto WhatsApp deve chamar o fluxo existente de engine/service, nao inserir lead diretamente no adapter.
5. `lead.discard` nao aparece como contrato operacional canonico dedicado; deve ser tratado como nova capacidade governada com HITL, ou limitado a descartar sugestao/rascunho se houver contrato existente de sugestao.
6. A existencia de `ImobScaleChannel = "whatsapp"` nao prova front door WhatsApp. Prova apenas que ha runtime de escala com canal nomeado.
7. A ausencia de Closing Output completo impede prometer pacote final multicanal com PDF/receipt/ledger fechado para todos os fluxos; o plano deve preservar esse gap como N-08.

## 5. Channel policy v1 proposta

| Canal | Entrada permitida | Saida permitida | Mutacoes | Regras |
| --- | --- | --- | --- | --- |
| `web_desktop` | texto, anexos existentes, CTA, formularios existentes | `presentation.text`, `card`, `blocks`, `form`, `proof`, `caseContext`, deep links | conforme runtime atual e policy existente | manter `ChatAgentLauncher` render-only; erros estruturados devem vir do engine/API |
| `web_mobile` | mesmo contrato do desktop, com layout responsivo | mesma surface canonica, degradada por espaco | mesmas regras do desktop | sem contrato separado; apenas snapshots responsivos e testes visuais/unitarios |
| `whatsapp` | texto inbound assinado pelo provedor, mensagem idempotente, identidade vinculada a tenant/workspace/user | texto curto, quick replies limitadas, links profundos para web, receipt/verify URL quando aplicavel | piloto restrito a IMOB `lead.create` com dedupe e `lead.discard` com HITL, depois de binding | adapter nao decide intent; adapter nao muta direto; fail-closed em assinatura, replay, binding, entitlement, RBAC e HITL |

## 6. UX/UI F0-F4

| Fase | Objetivo | Menor patch seguro |
| --- | --- | --- |
| F0 - Web parity e erros governados | Exibir bloqueios, CTAs e reasonCodes ja retornados pelo backend sem converter tudo em texto generico | Ajustar presentation/error adapter do web chat para consumir `ApiError.body` preservado por `apps/web/src/lib/api.ts:936` e `apps/web/src/lib/api.ts:1004`; nao adicionar regra no `ChatAgentLauncher` |
| F1 - Mobile responsive | Garantir que cards, CTAs, proof e formularios degradam bem em telas pequenas | Criar snapshots/testes web de presentation em mobile; nenhum schema/runtime novo |
| F2 - WhatsApp read-only adapter | Receber mensagem assinada, resolver conversa pelo agent runtime e renderizar resposta curta | Criar contrato `ChannelMessageEnvelope`, `ChannelBinding`, assinatura/replay/idempotencia, e adapter que chama o mesmo resolver; Legal/MKT/Finance somente orientacao/CTA/deep link |
| F3 - Piloto IMOB mutacao minima | Permitir apenas `lead.create` dedupado e `lead.discard` com HITL | Reutilizar `ImobCrmMutationService.createLead()` e fluxo `lead.qualify`; exigir binding, policy, HITL, run event, receipt/bundle quando aplicavel |
| F4 - Expansao governada | Expandir operacoes e canais somente com contratos versionados | Promover cada operacao por PR pequena, com teste de bypass, replay, RBAC, entitlement e evidencia |

## 7. WhatsApp adapter v1

### Contrato minimo

```ts
type ChannelMessageEnvelope = {
  channel: "whatsapp";
  provider: "meta" | "twilio" | "other";
  providerMessageId: string;
  receivedAt: string;
  signatureVerified: boolean;
  tenantId: string;
  workspaceId: string;
  userId: string;
  channelBindingId: string;
  idempotencyKey: string;
  text: string;
};
```

### Regras obrigatorias

1. Verificar assinatura do provedor antes de qualquer classificacao.
2. Rejeitar replay por `providerMessageId` e `idempotencyKey`.
3. Resolver binding telefone/provedor para tenant, workspace e user antes de chamar agente.
4. Validar entitlement, RBAC, scope e policy antes de qualquer mutacao.
5. Adapter so renderiza; intent, fallback, HITL e next action pertencem ao agente/engine.
6. Toda confirmacao de mutacao deve ter prompt deterministico e TTL.
7. Se houver duvida de identidade, permissao, tenant, workspace, entitlement, HITL ou receipt requerido, responder bloqueio curto com deep link seguro para web.

## 8. Pilot scope

| Vertical | WhatsApp v1 |
| --- | --- |
| IMOB | `lead.create` com dedupe usando fluxo existente; `lead.discard` apenas com HITL e contrato claro |
| Legal | orientacao, CTA e deep link; sem mutacao |
| Marketing | orientacao, CTA e deep link; sem publicacao |
| Finance | orientacao, CTA e deep link; sem cobranca, settlement ou conciliacao |

## 9. Riscos de bypass

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Adapter WhatsApp mutar banco direto | P0 | Proibir acesso direto a Prisma no adapter; chamar engine/service governado |
| Binding fraco telefone -> workspace | P0 | Criar `ChannelBinding` com assinatura, status, tenant, workspace, user e auditoria |
| Replay de webhook | P0 | `providerMessageId` unico + idempotency key + TTL |
| CTA/deep link expondo tenant errado | P0 | Links assinados/curtos por workspace e usuario |
| PII em logs/evidencias | P1 | Unificar policy de masking por canal antes de habilitar WhatsApp |
| Drift web/mobile/WhatsApp | P1 | Surface canonica unica com renderers por canal |
| Promover N-08 indevidamente | P1 | Manter Closing Output como gap ate contrato e evidencia propria |

## 10. PRs pequenos recomendados

1. `PR-F0-error-surface`: preservar e renderizar access gate estruturado no web chat sem regra nova no launcher.
2. `PR-F0-next-action-contract`: documentar e testar `nextAction/defaultNextStep` para evitar chip duplicado e drift.
3. `PR-F0-pii-channel-policy`: consolidar matriz de PII por canal e alinhar mascaradores.
4. `PR-F1-mobile-presentation`: snapshots de presentation para mobile.
5. `PR-F2-channel-contract`: criar contratos `ChannelMessageEnvelope` e `ChannelBinding` sem provider real.
6. `PR-F2-whatsapp-webhook-readonly`: webhook assinado read-only, replay guard e resposta curta.
7. `PR-F3-imob-lead-create-pilot`: piloto IMOB `lead.create` via engine/service existente, com dedupe e HITL.
8. `PR-F3-imob-lead-discard-pilot`: descartar lead/sugestao somente apos contrato canonico e HITL.
9. `PR-F4-closing-output-contract`: formalizar Closing Output antes de qualquer promessa de pacote final.

## 11. Evidencias exigidas por promocao

| Fase | Evidencia minima |
| --- | --- |
| F0 | testes de access gate/error surface, chat launcher render-only, evidence index |
| F1 | snapshots ou testes unitarios de layout/presentation mobile |
| F2 | testes de assinatura invalida, replay, binding ausente, tenant/workspace ausente, entitlement ausente, read-only adapter |
| F3 | testes de `lead.create` dedupe, HITL, RBAC, entitlement, idempotencia, run event, audit/receipt quando aplicavel |
| F4 | contrato de Closing Output, receipt/bundle/ledger, verify URL e evidencia indexada |

## 12. Decisoes humanas pendentes

1. Provedor WhatsApp inicial: Meta Cloud API, Twilio ou outro.
2. Modelo de binding: autoatendimento, convite por operador ou ambos.
3. TTL de confirmacao HITL por WhatsApp.
4. Escopo exato de `lead.discard`: lead persistido, rascunho, sugestao de anexo ou outro objeto.
5. Politica de deep links: expirar por tempo, workspace e usuario.
6. Se `ChannelBinding` entra no Prisma agora ou se a primeira PR so cria contrato in-memory/testado.

## 13. Criterio de status

Este plano deve permanecer `parcial/evidenciado` porque:

1. A investigacao e os documentos sao reais.
2. Nenhum runtime multicanal foi implementado.
3. WhatsApp front door canonico ainda e inexistente/parcial.
4. Closing Output IMOB permanece gap N-08.
5. Evidence Index so deve declarar a existencia deste plano e da evidencia da investigacao, nao a implementacao multicanal.
