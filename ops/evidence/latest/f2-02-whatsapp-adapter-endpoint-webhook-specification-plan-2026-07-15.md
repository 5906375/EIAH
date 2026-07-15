# F2.2 — WhatsApp Adapter Endpoint/Webhook Specification Plan — 2026-07-15

## Resumo executivo

Esta etapa formaliza a especificação controlada do endpoint/webhook futuro do WhatsApp Adapter, ainda em modo estritamente documental. O objetivo é definir path proposto, método HTTP, headers, payload mínimo, respostas HTTP esperadas, regras fail-closed, replay/idempotência, logging seguro, pacote mínimo de evidência por evento e lista de testes negativos futuros, sem implementar webhook real, sem abrir runtime novo e sem qualquer side effect externo.

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

## Contexto herdado de F2.0/F2.1

- F2.0 definiu o adapter WhatsApp como `channel-adapter/render-only`, em modo read-only e fail-closed.
- F2.1 definiu o contrato técnico de envelope versionado, headers obrigatórios, assinatura conceitual, replay protection e idempotência.
- WhatsApp ainda não está operacional.
- Não existe webhook real.
- Não existe provider integrado.
- Não existem mutações autorizadas.

Leitura correta:
- F2.2 ainda é especificação, não implementação;
- o endpoint proposto existe apenas como plano contratual;
- o `engine` continua sendo a autoridade de execução;
- o `ChatAgentLauncher` continua intocado.

## Decisão de não abrir F1.7e

F1.7e permanece fechada nesta etapa.

Motivo:
- não houve falha real nova do mobile smoke;
- F2.2 é continuação multicanal documental;
- misturar failure analysis do smoke com especificação de webhook criaria drift de escopo.

Reserva normativa preservada:
- `F1.7e = Smoke Failure Analysis/Fix`
- somente se surgir falha real futura no gate mobile smoke.

## Objetivo da F2.2

Definir a especificação controlada do endpoint/webhook inbound do WhatsApp Adapter, com comportamento técnico esperado, respostas HTTP mínimas e fail-closed explícito, sem implementar endpoint produtivo.

## Escopo de especificação

Esta etapa documenta:

- path proposto do endpoint
- método HTTP
- headers obrigatórios
- payload mínimo aceito
- respostas HTTP esperadas
- regras fail-closed
- replay/idempotência
- binding e escopo
- logging seguro
- evidência mínima por evento

## Fora de escopo

- implementar webhook real
- criar endpoint produtivo
- alterar runtime
- alterar engine
- alterar `ChatAgentLauncher`
- alterar `apps/**`
- alterar `packages/**`
- alterar `scripts/**`
- alterar workflows
- criar migrations
- usar secrets
- integrar provider WhatsApp real
- chamar API externa
- criar `lead.create`
- criar `lead.discard`
- executar ação crítica
- gerar side effects externos

## Endpoint proposto

Endpoint proposto apenas como especificação:

```text
POST /api/webhooks/whatsapp/inbound
```

Regras propostas:

- endpoint privado de ingestão controlada
- não expor comportamento mutável
- não assumir sucesso por default
- não operar sem validação técnica completa

## Método HTTP

Método HTTP esperado:

```text
POST
```

Motivo:
- evento inbound é uma submissão de payload assinado;
- o canal futuro deve ser tratado como ingestão de evento, não consulta pública.

## Headers obrigatórios

Headers mínimos herdados de F2.1:

- `X-EIAH-Provider`
- `X-EIAH-Event-Id`
- `X-EIAH-Timestamp`
- `X-EIAH-Signature`
- `X-EIAH-Signature-Version`

Regra:
- ausência de qualquer header obrigatório implica bloqueio fail-closed

## Payload mínimo aceito

Payload mínimo aceito em nível de especificação:

- `version`
- `eventId`
- `provider`
- `receivedAt`
- `providerTimestamp`
- `fromPhoneHash`
- `fromPhoneMasked`
- `messageType`
- `text` quando aplicável
- `rawPayloadRef`
- `tenantId | null`
- `workspaceId | null`
- `scope | null`
- `readOnly = true`

Campos mínimos esperados devem obedecer ao envelope:

```json
{
  "version": "whatsapp.adapter.event.v1",
  "eventId": "string",
  "provider": "whatsapp",
  "receivedAt": "ISO-8601",
  "providerTimestamp": "ISO-8601",
  "fromPhoneHash": "string",
  "fromPhoneMasked": "string",
  "messageType": "text | interactive | unknown",
  "text": "string | null",
  "rawPayloadRef": "masked-or-redacted-ref",
  "tenantId": "string | null",
  "workspaceId": "string | null",
  "scope": "string | null",
  "readOnly": true
}
```

## Respostas HTTP esperadas

Respostas HTTP mínimas documentadas:

- `202 ACCEPTED_READ_ONLY`
- `400 WHATSAPP_PAYLOAD_INVALID`
- `401 WHATSAPP_SIGNATURE_INVALID`
- `403 WHATSAPP_PHONE_NOT_BOUND`
- `403 ENTITLEMENT_REQUIRED`
- `409 WHATSAPP_EVENT_DUPLICATE`
- `409 WHATSAPP_REPLAY_DETECTED`
- `413 WHATSAPP_PAYLOAD_TOO_LARGE`

Leitura operacional:

- `202`: evento tecnicamente válido e aceito em modo read-only
- `400`: payload inválido, inconsistente ou malformado
- `401`: assinatura ausente/inválida/inaceitável
- `403`: binding/entitlement/contexto não resolvido
- `409`: replay ou duplicidade detectada
- `413`: payload acima do limite permitido

## Validação fail-closed

O endpoint futuro deve falhar fechado para:

- assinatura inválida
- assinatura ausente
- payload inválido
- timestamp ausente
- timestamp fora da janela
- replay
- evento duplicado
- número não vinculado
- tenant ausente
- workspace ausente
- entitlement ausente
- tentativa de ação crítica

Regra:
- nenhuma dessas condições pode degradar para sucesso parcial permissivo;
- qualquer falha interrompe o fluxo antes de mutação ou side effect.

## Replay e idempotência

Replay protection:

- baseada em `X-EIAH-Timestamp`
- janela conceitual herdada de F2.1
- fora da janela -> `WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`

Idempotência:

- baseada em `X-EIAH-Event-Id` / `eventId`
- evento repetido -> `WHATSAPP_EVENT_DUPLICATE`
- replay detectado -> `WHATSAPP_REPLAY_DETECTED`

Regra:
- nem replay nem duplicidade podem reprocessar o evento
- ambos devem retornar decisão segura, sem side effect

## Binding e escopo

O endpoint herda a cadeia de F2.0/F2.1:

`numero -> identidade -> tenant -> workspace -> scope -> entitlement`

Comportamento esperado:

- sem binding -> `403 WHATSAPP_PHONE_NOT_BOUND`
- sem `tenantId` resolvido -> `TENANT_NOT_RESOLVED`
- sem `workspaceId` resolvido -> `WORKSPACE_NOT_RESOLVED`
- sem entitlement -> `ENTITLEMENT_REQUIRED`

Regra:
- não expor `tenant/workspace` na resposta ao número não vinculado
- não assumir `tenant/workspace` default
- não responder fora de escopo governado

## PII masking e logging seguro

Obrigatório:

- nunca logar telefone completo
- usar `fromPhoneHash`
- usar `fromPhoneMasked`
- nunca persistir payload bruto integral em evidência textual
- não vazar conteúdo sensível do texto quando não for necessário

Logs mínimos seguros:

- `eventId`
- `provider`
- `receivedAt`
- status de validação de assinatura
- status de replay/idempotência
- status de binding
- `reasonCode`
- classificação final

## Evidências necessárias por evento

Cada evento futuro relevante deve gerar:

- `eventId`
- timestamp de recepção
- provider
- masked/hash de origem
- status da assinatura
- status do payload
- status de replay/idempotência
- status do binding
- `reasonCode`
- resposta HTTP retornada
- classificação final
- prova de ausência de mutação
- prova de ausência de side effect externo

## Testes negativos futuros

Lista mínima de testes negativos futuros:

1. header obrigatório ausente
2. assinatura ausente
3. assinatura inválida
4. versão de assinatura não suportada
5. timestamp ausente
6. timestamp fora da janela
7. `eventId` ausente
8. `eventId` duplicado
9. replay detectado
10. provider não suportado
11. `messageType` não suportado
12. payload acima do limite
13. payload inconsistente com `messageType`
14. número não vinculado
15. `tenantId` não resolvido
16. `workspaceId` não resolvido
17. entitlement ausente
18. sessão expirada
19. tentativa de ação crítica em modo read-only

## Fluxos textuais

### 1. Evento válido aceito em modo read-only

1. validar headers
2. validar assinatura
3. validar timestamp
4. validar idempotência
5. validar payload
6. resolver binding
7. responder `202 ACCEPTED_READ_ONLY`
8. registrar evidência mascarada

### 2. Assinatura inválida

1. receber evento
2. falhar na assinatura
3. responder `401`
4. registrar `WHATSAPP_SIGNATURE_INVALID`
5. não processar payload
6. não gerar side effect

### 3. Evento duplicado ou replay

1. receber evento tecnicamente válido
2. detectar replay/duplicidade
3. responder `409`
4. registrar `WHATSAPP_EVENT_DUPLICATE` ou `WHATSAPP_REPLAY_DETECTED`
5. não reprocessar evento

### 4. Número não vinculado

1. validar headers, assinatura e payload
2. falhar no binding
3. responder `403`
4. registrar `WHATSAPP_PHONE_NOT_BOUND`
5. retornar orientação segura de vinculação
6. não expor tenant/workspace

### 5. Tentativa de ação crítica

1. evento tecnicamente válido
2. binding resolvido
3. intenção crítica detectada
4. responder em modo read-only
5. registrar `READ_ONLY_MODE` ou `CRITICAL_ACTION_BLOCKED`
6. não criar run crítico
7. não executar mutação

## Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Endpoint permissivo demais | bypass de governança | fail-closed em todas as etapas |
| Respostas HTTP ambíguas | operação difícil de auditar | matriz explícita de códigos e reasonCodes |
| Replay ou duplicidade | reprocessamento indevido | timestamp + eventId + 409 seguro |
| Vazamento de PII | risco operacional/compliance | masking obrigatório e payload redigido |
| Pressão para mutação precoce | side effects não governados | manter `read-only` explícito e bloquear ações críticas |

## Critérios de DoD

- documento de especificação criado
- Evidence Index atualizado
- nenhuma alteração em `app/runtime/engine/launcher/workflows/packages/scripts`
- endpoint proposto documentado apenas como especificação
- responses HTTP documentadas
- fail-closed documentado
- replay/idempotência preservados
- PII masking documentado
- testes negativos futuros listados
- side effects explicitamente bloqueados
- F1.7e preservada para falha real futura
- gate mobile smoke preservado como informativo

## Checks executados

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Prova de isolamento

- nenhuma alteração em `.github/workflows/**`
- nenhuma alteração em `release.yml`
- nenhuma alteração em `apps/**`
- nenhuma alteração em `packages/**`
- nenhuma alteração em `scripts/**`
- nenhuma alteração em runtime/engine
- nenhuma alteração em `ChatAgentLauncher`

## Próximos passos

- abrir etapa futura separada para especificação de handler/endpoint controlado, se a frente multicanal avançar
- manter WhatsApp não operacional
- só avançar para implementação após aprovação explícita de segurança, escopo e governança

## Status final

Status: proposta
